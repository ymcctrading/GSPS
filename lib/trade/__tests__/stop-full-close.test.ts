import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isProtectiveOrder } from "@/lib/trade/kill-switch";
const getOpenPosition = vi.fn();
vi.mock("@/lib/brokers/simulator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/brokers/simulator")>("@/lib/brokers/simulator");
  return { ...actual, getOpenPosition: (...args: unknown[]) => getOpenPosition(...args) };
});
vi.mock("@/lib/trade/kill-switch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trade/kill-switch")>("@/lib/trade/kill-switch");
  return { ...actual, killSwitchRefusal: () => null };
});
import { placeSimulatedOrder, type OrderInput } from "@/lib/trade/place-order";
const base = { symbol: "AAPL", assetClass: "equity", side: "sell", qty: 10, entryMode: "now", intradaySourced: false, mode: "paper" } as unknown as OrderInput;
describe("a full close needs no stop; one share more opens a position", () => {
  it("counts a sell of exactly the long as protective, and one more share as not", () => {
    expect(isProtectiveOrder("long", "sell", 10, 10)).toBe(true);
    expect(isProtectiveOrder("long", "sell", 11, 10)).toBe(false);
    expect(isProtectiveOrder("short", "buy", 10, 10)).toBe(true);
    expect(isProtectiveOrder("short", "buy", 11, 10)).toBe(false);
  });
  it("lets a stopless sell that closes the whole long past the stop check", async () => {
    getOpenPosition.mockResolvedValue({ side: "long", qty: 10 });
    const r = await placeSimulatedOrder({} as SupabaseClient, "u1", base).catch(() => ({ status: 0, body: {} as Record<string, unknown> }));
    expect((r.body as { code?: string }).code).not.toBe("stop_required");
  });
});
