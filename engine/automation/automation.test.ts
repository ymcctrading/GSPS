import { describe, expect, it, vi } from "vitest";
import { calculateFuturesLotSize } from "./riskPositionSizer";
import {
  calculateDaysToExpiration,
  findOptimalContract,
  type OptionContract,
} from "./optionsChainParser";
import {
  AutomationState,
  evaluateTrailingStop,
  type ManagedAssetTracker,
} from "./assetLifecycleEngine";
import {
  MultiAssetAutomationController,
  type AutomationProfile,
  type ExecutionOrder,
  type MarketTick,
} from "./multiAssetAutomationController";

describe("riskPositionSizer", () => {
  it("scales with risk profile and clamps to [1,5]", () => {
    const base = {
      accountEquity: 100_000,
      ticker: "ES",
      currentAtr: 10, // risk/contract = 10 * 50 = $500
    };
    // MODERATE: 2% of 100k = $2000 / $500 = 4
    expect(
      calculateFuturesLotSize({ ...base, riskProfile: "MODERATE" }),
    ).toBe(4);
    // AGGRESSIVE: 4% = $4000 / $500 = 8 -> clamp 5
    expect(
      calculateFuturesLotSize({ ...base, riskProfile: "AGGRESSIVE" }),
    ).toBe(5);
    // PASSIVE: 1% = $1000 / $500 = 2
    expect(calculateFuturesLotSize({ ...base, riskProfile: "PASSIVE" })).toBe(2);
  });

  it("never returns 0 lots for a valid setup (floor of 1)", () => {
    expect(
      calculateFuturesLotSize({
        accountEquity: 5_000,
        riskProfile: "PASSIVE",
        ticker: "CL",
        currentAtr: 2, // risk/contract = 2000; 1% of 5k = 50 -> floor 0 -> clamp 1
      }),
    ).toBe(1);
  });

  it("returns 0 when ATR is non-positive", () => {
    expect(
      calculateFuturesLotSize({
        accountEquity: 100_000,
        riskProfile: "MODERATE",
        ticker: "ES",
        currentAtr: 0,
      }),
    ).toBe(0);
  });
});

describe("optionsChainParser", () => {
  const now = new Date("2026-07-21T00:00:00Z");
  const mk = (
    type: "CALL" | "PUT",
    delta: number,
    daysOut: number,
    strike = 5,
  ): OptionContract => ({
    contractSymbol: `NOK-${type}-${strike}-${daysOut}`,
    type,
    strike,
    delta,
    expirationDate: new Date(now.getTime() + daysOut * 86_400_000),
  });

  it("computes DTE", () => {
    expect(calculateDaysToExpiration(mk("CALL", 0.6, 10).expirationDate, now)).toBe(
      10,
    );
  });

  it("selects the CALL closest to 0.60 delta within the DTE window for BULLISH", async () => {
    const chain = [
      mk("CALL", 0.3, 10),
      mk("CALL", 0.62, 10), // best
      mk("CALL", 0.9, 10),
      mk("PUT", -0.6, 10), // wrong type
      mk("CALL", 0.6, 40), // outside DTE
    ];
    const out = await findOptimalContract(
      { underlyingTicker: "NOK", bias: "BULLISH" },
      async () => chain,
      now,
    );
    expect(out?.delta).toBe(0.62);
  });

  it("returns null when nothing sits in the DTE window", async () => {
    const out = await findOptimalContract(
      { underlyingTicker: "NOK", bias: "BEARISH" },
      async () => [mk("PUT", -0.6, 40)],
      now,
    );
    expect(out).toBeNull();
  });
});

describe("evaluateTrailingStop", () => {
  function longTracker(): ManagedAssetTracker {
    return {
      assetClass: "CRYPTO",
      symbol: "BTCUSD",
      currentState: AutomationState.MONITORING_TRAILING,
      side: "LONG",
      initialEntryPrice: 100,
      extremePrice: 100,
      trailingStopDistance: 5,
    };
  }

  it("ratchets the stop up as a long advances", () => {
    const t = longTracker();
    const r = evaluateTrailingStop(t, 110);
    expect(r).toEqual({ action: "UPDATE_STOP", nextStopPrice: 105 });
    expect(t.extremePrice).toBe(110);
  });

  it("exits a long when price breaches the trailing stop", () => {
    const t = longTracker();
    evaluateTrailingStop(t, 110); // stop now 105
    const r = evaluateTrailingStop(t, 104);
    expect(r.action).toBe("EXIT");
    expect(t.currentState).toBe(AutomationState.EXECUTING);
  });

  it("is symmetric for shorts", () => {
    const t: ManagedAssetTracker = { ...longTracker(), side: "SHORT" };
    const r = evaluateTrailingStop(t, 90);
    expect(r).toEqual({ action: "UPDATE_STOP", nextStopPrice: 95 });
    const exit = evaluateTrailingStop(t, 96);
    expect(exit.action).toBe("EXIT");
  });
});

describe("MultiAssetAutomationController gating", () => {
  const baseProfile: AutomationProfile = {
    userId: "u1",
    tier: "SYSTEM_MASTERY",
    isAutomationEnabled: true,
    riskProfile: "MODERATE",
    directionalBias: "BOTH",
    accountEquity: 100_000,
  };

  function makeController(profile: AutomationProfile | null) {
    const submitOrder = vi.fn(async (_order: ExecutionOrder) => {});
    const controller = new MultiAssetAutomationController({
      getProfile: async () => profile,
      fetchOptionChain: async () => [
        {
          contractSymbol: "NOK-CALL",
          type: "CALL",
          strike: 5,
          delta: 0.6,
          expirationDate: new Date(Date.now() + 10 * 86_400_000),
        },
      ],
      submitOrder,
      trackers: new Map(),
    });
    return { controller, submitOrder };
  }

  const stockTick: MarketTick = {
    assetClass: "STOCK",
    symbol: "NOK",
    lastPrice: 4.91,
    timestamp: new Date(),
    reversionSignal: "BULLISH",
  };

  it("routes a bullish equity reversion into an ITM option order", async () => {
    const { controller, submitOrder } = makeController(baseProfile);
    await controller.processRealTimeTick(stockTick, "u1");
    expect(submitOrder).toHaveBeenCalledOnce();
    expect(submitOrder.mock.calls[0][0]).toMatchObject({
      kind: "OPTION_CONTRACT",
      contractSymbol: "NOK-CALL",
      automated: true,
    });
  });

  it("does nothing for a non-System-Mastery tier", async () => {
    const { controller, submitOrder } = makeController({
      ...baseProfile,
      tier: "INVESTOR_MODE",
    });
    await controller.processRealTimeTick(stockTick, "u1");
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("respects a BEARISH_ONLY directional bias", async () => {
    const { controller, submitOrder } = makeController({
      ...baseProfile,
      directionalBias: "BEARISH_ONLY",
    });
    await controller.processRealTimeTick(stockTick, "u1");
    expect(submitOrder).not.toHaveBeenCalled();
  });
});
