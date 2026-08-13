import { describe, expect, it } from "vitest";
import {
  extendHighWater,
  planProtocolExit,
  planStopAdjustment,
  type ExitState,
} from "@/lib/trade/protocol-exit";

const levels = { stopLoss: 90, takeProfit1: 120, masterProfit: 140 };

describe("planProtocolExit", () => {
  it("takes 60% off at TP1 and splits the rest between the master target and a runner", () => {
    const plan = planProtocolExit(10, levels);
    expect(plan.scaleOutQty).toBe(6);
    expect(plan.masterQty).toBe(2);
    expect(plan.runnerQty).toBe(2);
    expect(plan.tranches.map((t) => t.key)).toEqual(["scale_out", "master", "runner"]);
  });

  it("gives every tranche the protocol stop, so a stop-out closes the whole trade", () => {
    const plan = planProtocolExit(10, levels);
    expect(plan.tranches.every((t) => t.stopLoss === levels.stopLoss)).toBe(true);
    expect(plan.tranches.reduce((sum, t) => sum + t.qty, 0)).toBe(10);
  });

  it("rests only the TP1 tranche at TP1 and only the master tranche at the master target", () => {
    const plan = planProtocolExit(10, levels);
    expect(plan.tranches.find((t) => t.key === "scale_out")?.takeProfit).toBe(120);
    expect(plan.tranches.find((t) => t.key === "master")?.takeProfit).toBe(140);
    // The runner has no resting target: what gets it out is a trailing rule.
    expect(plan.tranches.find((t) => t.key === "runner")?.takeProfit).toBeNull();
  });

  it("never rounds the scale-out up to the whole position", () => {
    const plan = planProtocolExit(2, levels);
    expect(plan.scaleOutQty).toBe(1);
    expect(plan.scaleOutQty).toBeLessThan(2);
  });

  it("starves the master tranche before the runner when the remainder is one share", () => {
    // 3 shares → 2 out at TP1, 1 left. Half of one share can't be taken at the
    // master target, and the runner is the tranche the trailing rules need.
    const plan = planProtocolExit(3, levels);
    expect(plan.scaleOutQty).toBe(2);
    expect(plan.masterQty).toBe(0);
    expect(plan.runnerQty).toBe(1);
  });

  it("drops the master tranche when the signal published no master target", () => {
    const plan = planProtocolExit(10, { ...levels, masterProfit: null });
    expect(plan.masterQty).toBe(0);
    expect(plan.runnerQty).toBe(4);
  });

  it("says so rather than scaling out of a single share", () => {
    const plan = planProtocolExit(1, levels);
    expect(plan.splittable).toBe(false);
    expect(plan.tranches).toHaveLength(1);
    expect(plan.tranches[0].qty).toBe(1);
    expect(plan.tranches[0].takeProfit).toBe(120);
    expect(plan.summary).toMatch(/single share/i);
  });

  it("produces no tranches for a zero or negative quantity, rather than a phantom 1-share order", () => {
    for (const qty of [0, -3]) {
      const plan = planProtocolExit(qty, levels);
      expect(plan.tranches).toHaveLength(0);
      expect(plan.scaleOutQty).toBe(0);
    }
  });

  it("produces no tranches for a non-finite quantity, rather than an order for NaN shares", () => {
    const plan = planProtocolExit(NaN, levels);
    expect(plan.tranches).toHaveLength(0);
    expect(Number.isFinite(plan.scaleOutQty)).toBe(true);
    expect(plan.scaleOutQty).toBe(0);
  });
});

describe("planStopAdjustment", () => {
  const state = (over: Partial<ExitState> = {}): ExitState => ({
    side: "long",
    entryPrice: 100,
    levels,
    highWater: null,
    lastPrice: 105,
    appliedStop: 90,
    ...over,
  });

  it("leaves the protocol stop alone before TP1 is reached", () => {
    const action = planStopAdjustment(state({ highWater: 110 }));
    expect(action.kind).toBe("none");
    expect(action.stop).toBe(90);
  });

  it("moves the stop to the entry once TP1 has been reached", () => {
    // High-water sits at TP1 exactly; trailing by one risk unit (10) would put
    // the stop at 110, which is tighter than break-even, so trailing binds.
    const action = planStopAdjustment(state({ highWater: 120, lastPrice: 118 }));
    expect(action.kind).toBe("replace_stop");
    expect(action.stop).toBe(110);
    expect(action.reason).toBe("trailing");
  });

  it("never puts the stop below the entry once TP1 has been reached", () => {
    // A shallow risk unit would otherwise trail to below the entry price.
    const action = planStopAdjustment(
      state({ levels: { ...levels, stopLoss: 60 }, highWater: 120, lastPrice: 118, appliedStop: 60 }),
    );
    expect(action.kind).toBe("replace_stop");
    expect(action.stop).toBe(100);
    expect(action.reason).toBe("break_even");
  });

  it("does not arm the reversal rule on a touch — the master tranche's own fill happens at the target", () => {
    // The master OCO tranche fills exactly at 140. If a touch were enough to
    // arm the reversal, the stop would land one tick below the fill price and
    // the very next tick of ordinary noise would close the runner.
    const action = planStopAdjustment(state({ highWater: 140, lastPrice: 140, appliedStop: 100 }));
    expect(action.reason).not.toBe("master_reversal");
  });

  it("arms a stop at the master target once price has genuinely traded through it", () => {
    const action = planStopAdjustment(state({ highWater: 141, lastPrice: 141, appliedStop: 100 }));
    expect(action.kind).toBe("replace_stop");
    // Trailing from 141 by one risk unit gives 131; the reversal rule is
    // tighter, so it binds — at the target itself, not one tick inside it.
    expect(action.stop).toBe(140);
    expect(action.reason).toBe("master_reversal");
  });

  it("keeps trailing once the trail is tighter than the master-target trigger", () => {
    const action = planStopAdjustment(state({ highWater: 160, lastPrice: 158, appliedStop: 140 }));
    expect(action.kind).toBe("replace_stop");
    expect(action.stop).toBe(150);
    expect(action.reason).toBe("trailing");
  });

  it("never loosens a stop that is already resting", () => {
    const action = planStopAdjustment(state({ highWater: 160, lastPrice: 121, appliedStop: 150 }));
    expect(action.kind).toBe("none");
    expect(action.stop).toBe(150);
  });

  it("closes at market when price is already through the level the stop would sit at", () => {
    // Price ran to 141 and fell back below the master trigger between samples,
    // so a resting stop there would be on the wrong side of the market.
    const action = planStopAdjustment(state({ highWater: 141, lastPrice: 135, appliedStop: 100 }));
    expect(action.kind).toBe("close_all");
    expect(action.reason).toBe("master_reversal");
  });

  it("mirrors every rule for a short", () => {
    const shortLevels = { stopLoss: 110, takeProfit1: 80, masterProfit: 60 };
    const action = planStopAdjustment({
      side: "short",
      entryPrice: 100,
      levels: shortLevels,
      highWater: 80,
      lastPrice: 82,
      appliedStop: 110,
    });
    expect(action.kind).toBe("replace_stop");
    // Trailing a short adds the risk unit (10) to the best price seen.
    expect(action.stop).toBe(90);
    expect(action.reason).toBe("trailing");
  });
});

describe("extendHighWater", () => {
  it("keeps the best price seen for a long", () => {
    expect(extendHighWater("long", 120, 118)).toBe(120);
    expect(extendHighWater("long", 120, 125)).toBe(125);
    expect(extendHighWater("long", null, 118)).toBe(118);
  });

  it("keeps the lowest price seen for a short", () => {
    expect(extendHighWater("short", 80, 82)).toBe(80);
    expect(extendHighWater("short", 80, 75)).toBe(75);
  });

  it("ignores a missing mark rather than resetting the high-water", () => {
    expect(extendHighWater("long", 120, null)).toBe(120);
  });
});
