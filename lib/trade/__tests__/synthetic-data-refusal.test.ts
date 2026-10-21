/**
 * Senior code review (lib/data): with no Alpaca keys the provider seam falls
 * back to the synthetic walk. In production no order is placed on it, paper
 * or a new live entry, with a reason the caller can show.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@/lib/data/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/provider")>("@/lib/data/provider");
  const { syntheticProvider } = await vi.importActual<typeof import("@/lib/data/synthetic")>("@/lib/data/synthetic");
  return { ...actual, getMarketDataProvider: () => syntheticProvider };
});

import { placeSimulatedOrder, type OrderInput } from "@/lib/trade/place-order";

const base = {
  symbol: "AAPL",
  assetClass: "equity",
  side: "buy",
  qty: 10,
  entryMode: "now",
  intradaySourced: false,
  attachLevels: { stopLoss: 90, takeProfit: 120 },
} as unknown as OrderInput;
const supabase = {} as SupabaseClient;

describe("no order on synthetic market data in production", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses a new paper entry and a new live entry", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    getOpenPosition.mockResolvedValue(null);
    for (const mode of ["paper", "live"] as const) {
      const r = await placeSimulatedOrder(supabase, "u1", { ...base, mode } as OrderInput);
      expect(r.status).toBe(503);
      expect(r.body.code).toBe("synthetic_market_data");
      expect(String(r.body.error)).toMatch(/Nothing was placed\.$/);
    }
  });

  it("refuses a paper close too, since it would fill at the synthetic quote", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    getOpenPosition.mockResolvedValue({ side: "long", qty: 10 });
    const r = await placeSimulatedOrder(supabase, "u1", { ...base, side: "sell", mode: "paper" } as OrderInput);
    expect(r.body.code).toBe("synthetic_market_data");
  });

  it("does not refuse outside production", async () => {
    getOpenPosition.mockResolvedValue(null);
    const r = await placeSimulatedOrder(supabase, "u1", { ...base, mode: "paper" } as OrderInput).catch(() => ({ status: 0, body: {} as Record<string, unknown> }));
    expect(r.body.code).not.toBe("synthetic_market_data");
  });
});
