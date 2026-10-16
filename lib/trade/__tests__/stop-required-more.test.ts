import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
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
const base = { symbol: "AAPL", assetClass: "equity", side: "buy", qty: 10, entryMode: "now", intradaySourced: false, mode: "paper" } as unknown as OrderInput;
const supabase = {} as SupabaseClient;
const place = (i: Partial<OrderInput>) => placeSimulatedOrder(supabase, "u1", { ...base, ...i } as OrderInput).catch(() => ({ status: 0, body: {} as Record<string, unknown> }));
describe("review 24: a stop on every new position (A-STOP-01), the other shapes", () => {
  it("refuses a short sale that opens a position with no stop", async () => {
    getOpenPosition.mockResolvedValue(null);
    expect((await place({ side: "sell" })).body.code).toBe("stop_required");
  });
  it("refuses adding to an open long with no stop", async () => {
    getOpenPosition.mockResolvedValue({ side: "long", qty: 10 });
    expect((await place({ side: "buy" })).body.code).toBe("stop_required");
  });
  it("refuses a sell larger than the long it closes (it flips to a stopless short)", async () => {
    getOpenPosition.mockResolvedValue({ side: "long", qty: 10 });
    expect((await place({ side: "sell", qty: 30 })).body.code).toBe("stop_required");
  });
});
