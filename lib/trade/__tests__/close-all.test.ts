import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const listOpenPositions = vi.fn();
const getOpenPosition = vi.fn();
const closePositionSim = vi.fn();
vi.mock("@/lib/brokers/simulator", () => ({
  listOpenPositions: (...a: unknown[]) => listOpenPositions(...a),
  getOpenPosition: (...a: unknown[]) => getOpenPosition(...a),
  closePositionSim: (...a: unknown[]) => closePositionSim(...a),
}));
vi.mock("@/lib/trade/exit-manager-sim", () => ({ closeSimPlanForSymbol: vi.fn(async () => ({ id: "plan" })) }));
vi.mock("@/lib/learning/record", () => ({ recordOrderExecution: vi.fn(), brokerStatusFrom: () => "filled" }));

import { closeAllPaperPositions } from "@/lib/trade/close-position";

const supabase = {} as SupabaseClient;

beforeEach(() => {
  listOpenPositions.mockReset().mockResolvedValue([{ symbol: "aapl" }, { symbol: "MSFT" }, { symbol: "BTC/USD" }]);
  getOpenPosition.mockReset().mockImplementation(async (_s, _u, sym: string) => ({ id: sym, symbol: sym, side: "long", qty: 10, avg_entry_price: 100, opened_at: "2026-10-01", asset_class: "us_equity" }));
  closePositionSim.mockReset().mockImplementation(async (_s, _u, sym: string) => {
    if (sym === "MSFT") throw new Error("no quote");
    return { price: 101, qty: 10 };
  });
});

// M-K4 (owner's Q16, "Button"): close out every trade and rest, on the trader's own tap.
describe("closing out every paper position", () => {
  it("closes each open position, and one failure doesn't stop the rest", async () => {
    const r = await closeAllPaperPositions(supabase, "u1");
    expect(r.closed).toEqual(["AAPL", "BTC/USD"]);
    expect(r.failed).toEqual([{ symbol: "MSFT", error: "no quote" }]);
    expect(closePositionSim).toHaveBeenCalledTimes(3);
  });
});
