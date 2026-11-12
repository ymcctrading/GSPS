/** /api/portfolio/live reads the member's own live account and never writes. */

import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
const conn = vi.hoisted(() => ({ read: vi.fn(async () => null as unknown) }));
const alpaca = vi.hoisted(() => ({
  getAccount: vi.fn(async () => ({ equity: "30", last_equity: "30", cash: "30", buying_power: "30", currency: "USD" })),
  getPositions: vi.fn(async () => []),
  getOrders: vi.fn(async () => []),
  placeOrder: vi.fn(),
  closePosition: vi.fn(),
  cancelOrder: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }),
}));
vi.mock("@/lib/brokers/live-creds", () => ({ readLiveAlpacaConnection: conn.read }));
vi.mock("@/lib/brokers/alpaca", () => alpaca);

import { GET } from "@/app/api/portfolio/live/route";

describe("GET /api/portfolio/live", () => {
  it("answers connected: false with no live connection", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ connected: false });
    expect(alpaca.getAccount).not.toHaveBeenCalled();
  });

  it("reads the account with the member's own live keys, and places nothing", async () => {
    conn.read.mockResolvedValueOnce({ connectionId: "c1", creds: { key: "k", secret: "s", mode: "live" } });
    const res = await GET();
    const body = await res.json();
    expect(body.connected).toBe(true);
    expect(body.account.equity).toBe(30);
    expect(alpaca.getAccount).toHaveBeenCalledWith(expect.objectContaining({ mode: "live", key: "k" }));
    expect(alpaca.getOrders).toHaveBeenCalledWith(expect.anything(), "open");
    expect(alpaca.placeOrder).not.toHaveBeenCalled();
    expect(alpaca.closePosition).not.toHaveBeenCalled();
    expect(alpaca.cancelOrder).not.toHaveBeenCalled();
  });

  it("answers 502 with a plain message when the broker can't be read", async () => {
    conn.read.mockResolvedValueOnce({ connectionId: "c1", creds: { key: "k", secret: "s", mode: "live" } });
    alpaca.getAccount.mockRejectedValueOnce(new Error("401 key detail"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(502);
    expect((await res.json()).error).not.toMatch(/detail/);
    spy.mockRestore();
  });

  it("answers 401 without a session", async () => {
    auth.user = null;
    expect((await GET()).status).toBe(401);
  });
});
