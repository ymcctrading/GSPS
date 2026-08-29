import { describe, expect, it } from "vitest";
import type { TradePlan } from "@/lib/lifecycle/types";
import { applyPlanEvent } from "@/lib/lifecycle/transitions";

function plan(overrides: Partial<TradePlan> = {}): TradePlan {
  return {
    planId: "plan-1",
    strategyVersion: "1.0.0",
    signalId: "sig-1",
    userId: "user-1",
    instrument: "AAPL",
    market: "us_equity",
    timeframe: "1Day",
    generatedAt: "2026-08-29T13:00:00.000Z",
    expiresAt: "2026-09-05T13:00:00.000Z",
    direction: "bullish",
    coordinates: {
      entryTrigger: 100,
      entryLimitTolerance: 0.5,
      invalidation: 97,
      stopType: "stop_market",
      takeProfit1: 105,
      takeProfit2: 108,
      masterProfit: 110,
      runnerRule: { enabled: true, description: "Trail without lowering the Master Profit floor." },
    },
    risk: {
      approvedQuantity: 10,
      fractionalCapability: false,
      plannedDollarRisk: 30,
      allocationPct: 2,
      totalOpenRiskSnapshot: 500,
    },
    evidence: {
      regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
      alignment: { score: 82, tier: "aTier", breakdown: [] },
      dataTimestamps: { bars: "2026-08-29T13:00:00.000Z" },
      eventLiquidityStatus: "clear",
    },
    state: "watchlist",
    version: 0,
    audit: [],
    actualEntryPrice: null,
    actualEntryAt: null,
    highWater: null,
    masterProfitFloor: null,
    closedAt: null,
    closeReason: null,
    ...overrides,
  };
}

describe("applyPlanEvent — happy path", () => {
  it("walks the full lifecycle to runner", () => {
    let p = plan();

    let r = applyPlanEvent(p, { type: "qualify", at: "t1", reason: "gates passed" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    p = r.plan;
    expect(p.state).toBe("qualified");
    expect(p.version).toBe(1);

    r = applyPlanEvent(p, { type: "arm", at: "t2", reason: "trigger set" });
    if (!r.ok) throw new Error();
    p = r.plan;
    expect(p.state).toBe("armed");

    r = applyPlanEvent(p, { type: "enter", at: "t3", fillPrice: 100.1, cooldownBlocksNewEntry: false });
    if (!r.ok) throw new Error();
    p = r.plan;
    expect(p.state).toBe("entered");
    expect(p.actualEntryPrice).toBe(100.1);
    expect(p.highWater).toBe(100.1);

    r = applyPlanEvent(p, { type: "tp1_fill", at: "t4" });
    if (!r.ok) throw new Error();
    p = r.plan;
    expect(p.state).toBe("tp1_reached");

    r = applyPlanEvent(p, { type: "tp2_fill", at: "t5" });
    if (!r.ok) throw new Error();
    p = r.plan;
    expect(p.state).toBe("tp2_reached");

    // A transient print doesn't activate Master Profit.
    r = applyPlanEvent(p, { type: "master_fill", at: "t6", closedBarConfirmed: false });
    expect(r.ok).toBe(false);

    r = applyPlanEvent(p, { type: "master_fill", at: "t6", closedBarConfirmed: true });
    if (!r.ok) throw new Error();
    p = r.plan;
    expect(p.state).toBe("master_reached");
    expect(p.masterProfitFloor).toBe(110);

    r = applyPlanEvent(p, { type: "start_runner", at: "t7" });
    if (!r.ok) throw new Error();
    p = r.plan;
    expect(p.state).toBe("runner");
    expect(p.audit).toHaveLength(p.version);
  });
});

describe("applyPlanEvent — invalid transitions", () => {
  it("rejects entering a plan that isn't armed", () => {
    const r = applyPlanEvent(plan(), { type: "enter", at: "t", fillPrice: 100, cooldownBlocksNewEntry: false });
    expect(r.ok).toBe(false);
  });

  it("blocks a new entry under an active cooldown", () => {
    const r = applyPlanEvent(plan({ state: "armed" }), {
      type: "enter",
      at: "t",
      fillPrice: 100,
      cooldownBlocksNewEntry: true,
    });
    expect(r.ok).toBe(false);
  });

  it("never blocks close, even during a cooldown-eligible active state", () => {
    const r = applyPlanEvent(plan({ state: "entered", actualEntryPrice: 100.1 }), {
      type: "close",
      at: "t",
      reason: "user closed manually",
    });
    expect(r.ok).toBe(true);
  });
});

describe("expiry and invalidation", () => {
  it("expires only from a pre-entry state", () => {
    const preEntry = applyPlanEvent(plan({ state: "armed" }), { type: "expire", at: "t" });
    expect(preEntry.ok).toBe(true);
    if (preEntry.ok) expect(preEntry.plan.state).toBe("expired");

    const postEntry = applyPlanEvent(plan({ state: "entered" }), { type: "expire", at: "t" });
    expect(postEntry.ok).toBe(false);
  });

  it("invalidates only from an active (post-entry) state", () => {
    const active = applyPlanEvent(plan({ state: "tp1_reached" }), {
      type: "invalidate",
      at: "t",
      reason: "stop hit",
    });
    expect(active.ok).toBe(true);
    if (active.ok) expect(active.plan.state).toBe("invalidated");

    const preEntry = applyPlanEvent(plan({ state: "watchlist" }), {
      type: "invalidate",
      at: "t",
      reason: "stop hit",
    });
    expect(preEntry.ok).toBe(false);
  });
});

describe("risk edits", () => {
  it("allows a risk decrease without confirmation", () => {
    const r = applyPlanEvent(plan(), {
      type: "edit",
      at: "t",
      reason: "sized down",
      patch: { plannedDollarRisk: 20 },
      userConfirmed: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.risk.plannedDollarRisk).toBe(20);
  });

  it("rejects a risk increase without user confirmation", () => {
    const r = applyPlanEvent(plan(), {
      type: "edit",
      at: "t",
      reason: "sized up",
      patch: { plannedDollarRisk: 50 },
      userConfirmed: false,
    });
    expect(r.ok).toBe(false);
  });

  it("allows a risk increase once the user confirms", () => {
    const r = applyPlanEvent(plan(), {
      type: "edit",
      at: "t",
      reason: "re-evaluated and sized up",
      patch: { plannedDollarRisk: 50 },
      userConfirmed: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.audit.at(-1)?.riskIncreased).toBe(true);
  });
});

describe("Master-Profit floor", () => {
  it("ratchets upward", () => {
    const base = plan({ state: "master_reached", masterProfitFloor: 110 });
    const r = applyPlanEvent(base, { type: "raise_floor", at: "t", price: 112 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.masterProfitFloor).toBe(112);
  });

  it("never ratchets downward", () => {
    const base = plan({ state: "master_reached", masterProfitFloor: 110 });
    const r = applyPlanEvent(base, { type: "raise_floor", at: "t", price: 109 });
    expect(r.ok).toBe(false);
  });
});
