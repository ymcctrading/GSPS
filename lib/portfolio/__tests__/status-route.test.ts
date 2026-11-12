/** /api/portfolio/status: the Settings card's quick check reads only the account row. */

import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
const account = vi.hoisted(() => vi.fn(async () => ({ cash: 100000 })));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }),
}));
vi.mock("@/lib/brokers/simulator", () => ({ getOrCreateAccount: account }));

import { GET } from "@/app/api/portfolio/status/route";

describe("GET /api/portfolio/status", () => {
  it("answers connected once the account row is read", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connected: true });
  });

  it("answers 503 with a plain message when the row can't be read", async () => {
    account.mockRejectedValueOnce(new Error("db down: detail"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).error).not.toMatch(/detail/);
    spy.mockRestore();
  });

  it("answers 401 without a session", async () => {
    auth.user = null;
    expect((await GET()).status).toBe(401);
  });
});
