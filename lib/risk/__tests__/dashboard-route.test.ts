/**
 * /api/risk/dashboard (review of #415): a book that can't be read answers 503
 * with a plain message, never the error itself; no session answers 401.
 */

import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
const read = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }),
}));
vi.mock("@/lib/risk/dashboard", () => ({ readRiskDashboard: read }));

import { GET } from "@/app/api/risk/dashboard/route";

describe("GET /api/risk/dashboard", () => {
  it("answers 503 with a plain message when the book can't be read", async () => {
    read.mockRejectedValueOnce(new Error("exit plans could not be read: secret detail"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).not.toMatch(/secret detail/);
    spy.mockRestore();
  });

  it("answers 401 without a session and reads nothing", async () => {
    auth.user = null;
    read.mockClear();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });
});
