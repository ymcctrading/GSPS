/**
 * Shared watchlists (Q3 plan item 7): who may open a share, how a requester
 * is shown to the owner, and the server reads that act on those rules.
 */

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isShareToken, newShareToken, requesterLabel, viewerAccess } from "@/lib/watchlist/share";
import { readSharedList, requestShareAccess } from "@/lib/watchlist/shareServer";

describe("viewerAccess", () => {
  const link = { access: "link" as const, ownerId: "owner" };
  const members = { access: "members" as const, ownerId: "owner" };

  it("opens a link share to anyone, signed in or not", () => {
    expect(viewerAccess(link, null, null)).toEqual({ kind: "view", owner: false });
    expect(viewerAccess(link, "someone", null)).toEqual({ kind: "view", owner: false });
  });

  it("always opens the owner's own share to the owner", () => {
    expect(viewerAccess(members, "owner", null)).toEqual({ kind: "view", owner: true });
  });

  it("asks a visitor to sign in, then to ask, for a members-only share", () => {
    expect(viewerAccess(members, null, null)).toEqual({ kind: "sign_in" });
    expect(viewerAccess(members, "m1", null)).toEqual({ kind: "request" });
    expect(viewerAccess(members, "m1", "pending")).toEqual({ kind: "pending" });
    expect(viewerAccess(members, "m1", "denied")).toEqual({ kind: "denied" });
    expect(viewerAccess(members, "m1", "approved")).toEqual({ kind: "view", owner: false });
  });
});

describe("tokens and labels", () => {
  it("issues unguessable, URL-safe tokens and checks their shape", () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
    expect(isShareToken(a)).toBe(true);
    expect(isShareToken("short")).toBe(false);
    expect(isShareToken("../../etc/passwd-aaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    expect(isShareToken(42)).toBe(false);
  });

  it("shows a requester by display name, else a masked email", () => {
    expect(requesterLabel("  Pat  ", "pat@example.com")).toBe("Pat");
    expect(requesterLabel(null, "pat@example.com")).toBe("p•••@example.com");
    expect(requesterLabel("", null)).toBe("A member");
  });
});

// A tiny stand-in for the service client: each table answers from a queue.
type Result = { data?: unknown; error?: { message: string } | null; count?: number };
function fakeService(results: Record<string, Result[]>) {
  const writes: { table: string; op: string; args: unknown[] }[] = [];
  const from = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "order", "limit", "maybeSingle", "upsert"]) {
      b[op] = (...args: unknown[]) => {
        if (op === "upsert") writes.push({ table, op, args });
        return b;
      };
    }
    b.then = (resolve: (r: Result) => unknown) => {
      const r = results[table]?.shift() ?? { data: null, error: null };
      return Promise.resolve(resolve({ error: null, ...r }));
    };
    return b;
  };
  return { client: { from } as unknown as SupabaseClient, writes };
}

const SAVED_LIST: Record<string, Result[]> = {
  watchlists: [{ data: { id: "list1" } }],
  watchlist_items: [{ data: ["AAPL", "MSFT", "NVDA"].map((symbol, i) => ({ symbol, added_at: `2026-11-01T00:00:0${i}Z` })) }],
};

function withList(extra: Record<string, Result[]>): Record<string, Result[]> {
  return {
    watchlists: [...SAVED_LIST.watchlists],
    watchlist_items: [...SAVED_LIST.watchlist_items],
    ...extra,
  };
}

describe("readSharedList", () => {
  it("answers null for a token that matches nothing", async () => {
    const { client } = fakeService({ watchlist_shares: [{ data: null }] });
    expect(await readSharedList("x".repeat(32), null, client)).toBeNull();
  });

  it("answers null once the owner's list has gone back to the default", async () => {
    const { client } = fakeService({
      watchlist_shares: [{ data: { id: "s1", user_id: "owner", access: "link" } }],
      watchlists: [{ data: null }],
    });
    expect(await readSharedList("x".repeat(32), null, client)).toBeNull();
  });

  it("gives a link share's symbols to a visitor, and nothing else", async () => {
    const { client } = fakeService(withList({ watchlist_shares: [{ data: { id: "s1", user_id: "owner", access: "link" } }] }));
    const read = await readSharedList("x".repeat(32), null, client);
    expect(read).toEqual({ access: "view", owner: false, symbols: ["AAPL", "MSFT", "NVDA"] });
  });

  it("holds a members-only share's symbols back from a member not yet approved", async () => {
    const { client } = fakeService(
      withList({
        watchlist_shares: [{ data: { id: "s1", user_id: "owner", access: "members" } }],
        watchlist_share_members: [{ data: { status: "pending" } }],
      }),
    );
    expect(await readSharedList("x".repeat(32), "m1", client)).toEqual({ access: "pending" });
  });
});

describe("requestShareAccess", () => {
  it("files a pending request for a members-only share", async () => {
    const { client, writes } = fakeService(
      withList({
        watchlist_shares: [{ data: { id: "s1", user_id: "owner", access: "members" } }],
        watchlist_share_members: [{ data: null }, { count: 3 }, {}],
      }),
    );
    expect(await requestShareAccess("x".repeat(32), "m1", client)).toBe("pending");
    expect(writes[0].args[0]).toEqual({ share_id: "s1", member_id: "m1", status: "pending" });
  });

  it("refuses once the share holds its limit", async () => {
    const { client, writes } = fakeService(
      withList({
        watchlist_shares: [{ data: { id: "s1", user_id: "owner", access: "members" } }],
        watchlist_share_members: [{ data: null }, { count: 100 }],
      }),
    );
    expect(await requestShareAccess("x".repeat(32), "m1", client)).toBe("full");
    expect(writes).toEqual([]);
  });

  it("files nothing for a link share or the owner, and keeps a decision", async () => {
    const link = fakeService(withList({ watchlist_shares: [{ data: { id: "s1", user_id: "owner", access: "link" } }] }));
    expect(await requestShareAccess("x".repeat(32), "m1", link.client)).toBe("view");
    const denied = fakeService(
      withList({
        watchlist_shares: [{ data: { id: "s1", user_id: "owner", access: "members" } }],
        watchlist_share_members: [{ data: { status: "denied" } }],
      }),
    );
    expect(await requestShareAccess("x".repeat(32), "m1", denied.client)).toBe("denied");
    expect(denied.writes).toEqual([]);
  });
});
