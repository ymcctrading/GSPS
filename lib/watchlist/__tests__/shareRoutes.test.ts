/**
 * The share routes: the owner's /api/watchlist-share and the viewer's
 * /api/shared-watchlist/[token].
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Result = { data?: unknown; error?: { message: string } | null };
interface Call {
  table: string;
  ops: [string, unknown[]][];
}

const state = vi.hoisted(() => ({
  user: { id: "owner" } as { id: string } | null,
  calls: [] as Call[],
  results: {} as Record<string, Result[]>,
  read: vi.fn(),
  request: vi.fn(),
}));

function builder(table: string) {
  const call: Call = { table, ops: [] };
  state.calls.push(call);
  const b: Record<string, unknown> = {};
  for (const op of ["select", "eq", "in", "order", "limit", "maybeSingle", "insert", "update", "delete"]) {
    b[op] = (...args: unknown[]) => {
      call.ops.push([op, args]);
      return b;
    };
  }
  b.then = (resolve: (r: Result) => unknown) => Promise.resolve(resolve({ error: null, ...(state.results[table]?.shift() ?? { data: null }) }));
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (t: string) => builder(t),
  }),
  createServiceClient: () => ({
    from: (t: string) => builder(t),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "pat@example.com" } } }) } },
  }),
}));
vi.mock("@/lib/watchlist/shareServer", () => ({ readSharedList: state.read, requestShareAccess: state.request }));

import { GET, PATCH, PUT } from "@/app/api/watchlist-share/route";
import { GET as VIEW, POST as ASK } from "@/app/api/shared-watchlist/[token]/route";

const LIST = () => [
  { data: { id: "list1" } }, // getDashboardWatchlist's list
];
const ITEMS = () => [{ data: ["AAPL", "MSFT", "NVDA"].map((symbol) => ({ symbol, added_at: "2026-11-01T00:00:00Z" })) }];

function req(method: string, body: unknown) {
  return new NextRequest("http://localhost/api/watchlist-share", { method, body: JSON.stringify(body) });
}

beforeEach(() => {
  state.user = { id: "owner" };
  state.calls = [];
  state.results = {};
  state.read.mockReset();
  state.request.mockReset();
});

describe("/api/watchlist-share", () => {
  it("answers 401 without a session", async () => {
    state.user = null;
    expect((await GET()).status).toBe(401);
    expect((await PUT(req("PUT", { access: "link" }))).status).toBe(401);
  });

  it("refuses to share the platform's default list", async () => {
    // dashboardListId finds a list row, but it holds no items: the default.
    state.results.watchlists = [{ data: { id: "list1" } }, { data: { id: "list1" } }];
    state.results.watchlist_shares = [{ data: null }];
    state.results.watchlist_items = [{ data: [] }];
    const res = await PUT(req("PUT", { access: "link" }));
    expect(res.status).toBe(409);
    expect(state.calls.some((c) => c.table === "watchlist_shares" && c.ops.some(([op]) => op === "insert"))).toBe(false);
  });

  it("creates a share with a fresh token on the owner's saved list", async () => {
    state.results.watchlists = [{ data: { id: "list1" } }, ...LIST()];
    state.results.watchlist_shares = [{ data: null }, {}];
    state.results.watchlist_items = ITEMS();
    const res = await PUT(req("PUT", { access: "members" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.share.access).toBe("members");
    expect(body.share.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const insert = state.calls.find((c) => c.table === "watchlist_shares" && c.ops.some(([op]) => op === "insert"))!;
    expect(insert.ops.find(([op]) => op === "insert")![1][0]).toMatchObject({ watchlist_id: "list1", user_id: "owner", access: "members" });
  });

  it("issues a new token on rotate, and keeps it otherwise", async () => {
    const existing = { id: "s1", access: "link", token: "t".repeat(32) };
    state.results.watchlists = [{ data: { id: "list1" } }, ...LIST()];
    state.results.watchlist_shares = [{ data: existing }, {}];
    state.results.watchlist_items = ITEMS();
    const kept = await (await PUT(req("PUT", { access: "link" }))).json();
    expect(kept.share.token).toBe(existing.token);

    state.results.watchlists = [{ data: { id: "list1" } }, ...LIST()];
    state.results.watchlist_shares = [{ data: existing }, {}];
    state.results.watchlist_items = ITEMS();
    const rotated = await (await PUT(req("PUT", { access: "link", rotate: true }))).json();
    expect(rotated.share.token).not.toBe(existing.token);
  });

  it("turns a share off by deleting it, scoped to the owner", async () => {
    state.results.watchlists = [{ data: { id: "list1" } }];
    state.results.watchlist_shares = [{ data: { id: "s1", access: "link", token: "t".repeat(32) } }, {}];
    const res = await PUT(req("PUT", { access: "off" }));
    expect((await res.json()).share).toBeNull();
    const del = state.calls.find((c) => c.table === "watchlist_shares" && c.ops.some(([op]) => op === "delete"))!;
    expect(del.ops).toContainEqual(["eq", ["user_id", "owner"]]);
  });

  it("approves a request on the owner's own share and returns masked labels", async () => {
    state.results.watchlists = [{ data: { id: "list1" } }];
    state.results.watchlist_shares = [{ data: { id: "s1", access: "members", token: "t".repeat(32) } }];
    state.results.watchlist_share_members = [{}, { data: [{ member_id: "m1", status: "approved", requested_at: "x", decided_at: "y" }] }];
    state.results.profiles = [{ data: [] }];
    const res = await PATCH(req("PATCH", { memberId: "22222222-2222-4222-8222-222222222222", decision: "approve" }));
    expect(res.status).toBe(200);
    expect((await res.json()).members[0]).toMatchObject({ label: "p•••@example.com", status: "approved" });
    const upd = state.calls.find((c) => c.table === "watchlist_share_members" && c.ops.some(([op]) => op === "update"))!;
    expect(upd.ops).toContainEqual(["eq", ["share_id", "s1"]]);
  });

  it("answers 404 to a decision when nothing is shared", async () => {
    state.results.watchlists = [{ data: { id: "list1" } }];
    state.results.watchlist_shares = [{ data: null }];
    const res = await PATCH(req("PATCH", { memberId: "22222222-2222-4222-8222-222222222222", decision: "approve" }));
    expect(res.status).toBe(404);
  });
});

describe("/api/shared-watchlist/[token]", () => {
  const params = (token: string) => ({ params: Promise.resolve({ token }) });
  const get = (token: string) => VIEW(new NextRequest(`http://localhost/api/shared-watchlist/${token}`), params(token));

  it("answers 404 to a malformed token without reading anything", async () => {
    const res = await get("short");
    expect(res.status).toBe(404);
    expect(state.read).not.toHaveBeenCalled();
  });

  it("answers the same 404 for a withdrawn share", async () => {
    state.read.mockResolvedValueOnce(null);
    const res = await get("a".repeat(32));
    expect(res.status).toBe(404);
  });

  it("passes the viewer's id and returns the read, uncached", async () => {
    state.read.mockResolvedValueOnce({ access: "view", owner: false, symbols: ["AAPL"] });
    const res = await get("a".repeat(32));
    expect(state.read).toHaveBeenCalledWith("a".repeat(32), "owner");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect((await res.json()).symbols).toEqual(["AAPL"]);
  });

  it("needs a session to ask for access", async () => {
    state.user = null;
    const res = await ASK(new NextRequest("http://localhost/x", { method: "POST" }), params("a".repeat(32)));
    expect(res.status).toBe(401);
    expect(state.request).not.toHaveBeenCalled();
  });

  it("files the request and reports a full share plainly", async () => {
    state.request.mockResolvedValueOnce("pending").mockResolvedValueOnce("full");
    const ok = await ASK(new NextRequest("http://localhost/x", { method: "POST" }), params("a".repeat(32)));
    expect((await ok.json()).access).toBe("pending");
    const full = await ASK(new NextRequest("http://localhost/x", { method: "POST" }), params("a".repeat(32)));
    expect(full.status).toBe(409);
  });
});
