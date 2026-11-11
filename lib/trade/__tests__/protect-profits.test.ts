/**
 * The member's Protect profits switch (lib/trade/protocol-exit.ts header,
 * project owner 2026-11-11): the whole position leaves at the MTP, and once
 * TP1 is reached the stop never sits behind the entry. Default off, and off
 * changes nothing.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  masterTakeProfitReached,
  planProtocolExit,
  planStopAdjustment,
  validMasterTakeProfit,
  type ExitState,
} from "@/lib/trade/protocol-exit";
import { walkGannExit } from "@/lib/backtest/replay";
import { DEFAULT_GANN_RULE_PREFS, protectProfitsSinceAfter, resolveGannRulePrefs } from "@/lib/gann/traderPrefs";
import { exitSentence } from "@/lib/guided/copy";

const levels = { stopLoss: 90, takeProfit1: 120, masterProfit: 140 };
const shortLevels = { stopLoss: 110, takeProfit1: 80, masterProfit: 60 };

const state = (over: Partial<ExitState> = {}): ExitState => ({
  side: "long",
  entryPrice: 100,
  levels,
  highWater: 105,
  lastPrice: 104,
  appliedStop: 90,
  rule: "structure",
  gann: null,
  protectProfits: true,
  ...over,
});

describe("the MTP and its validity", () => {
  it("takes an MTP only beyond TP1 in the trade's favour", () => {
    expect(validMasterTakeProfit(levels)).toBe(140);
    expect(validMasterTakeProfit(shortLevels, "short")).toBe(60);
    expect(validMasterTakeProfit({ ...levels, masterProfit: 115 })).toBeNull();
    expect(validMasterTakeProfit({ ...levels, masterProfit: null })).toBeNull();
    expect(validMasterTakeProfit({ ...levels, masterProfit: Number.NaN })).toBeNull();
    expect(validMasterTakeProfit({ ...shortLevels, masterProfit: 85 }, "short")).toBeNull();
  });

  it("counts a touch of the MTP as reached, on either side", () => {
    expect(masterTakeProfitReached("long", 140, levels)).toBe(true);
    expect(masterTakeProfitReached("long", 139.99, levels)).toBe(false);
    expect(masterTakeProfitReached("long", null, levels)).toBe(false);
    expect(masterTakeProfitReached("short", 60, shortLevels)).toBe(true);
    expect(masterTakeProfitReached("short", 60.01, shortLevels)).toBe(false);
  });
});

describe("planProtocolExit with Protect profits", () => {
  it("rests the whole runner with the MTP as its limit", () => {
    const plan = planProtocolExit(10, levels, "structure", { protectProfits: true });
    expect(plan.tranches).toEqual([expect.objectContaining({ key: "runner", qty: 10, takeProfit: 140, stopLoss: 90 })]);
    expect(plan.runnerQty).toBe(10);
    expect(plan.summary).toMatch(/sell automatically at the MTP/);
  });

  it("falls back to the plain runner when the MTP is missing or not beyond TP1", () => {
    for (const masterProfit of [null, 110]) {
      const plan = planProtocolExit(10, { ...levels, masterProfit }, "structure", { protectProfits: true });
      expect(plan.tranches[0].takeProfit).toBeNull();
    }
  });

  it("changes nothing when off", () => {
    expect(planProtocolExit(10, levels, "structure", { protectProfits: false })).toEqual(planProtocolExit(10, levels, "structure"));
  });
});

describe("planStopAdjustment with Protect profits", () => {
  it("on paper, closes the whole position at the MTP once the best price touches it, before any other exit", () => {
    const action = planStopAdjustment(
      state({ highWater: 141, lastPrice: 136, mtpFillsOnTouch: true, gann: { stop: 120, stopReason: "last_reaction", exit: { reason: "trend_change", note: "turned" } } }),
    );
    expect(action.kind).toBe("close_all");
    if (action.kind !== "close_all") return;
    expect(action.reason).toBe("master_reversal");
    expect(action.fillAt).toBe(140);
    expect(action.explanation).toMatch(/MTP/);
  });

  it("closes a short at its MTP", () => {
    const action = planStopAdjustment(state({ side: "short", levels: shortLevels, highWater: 59, lastPrice: 62, appliedStop: 110, mtpFillsOnTouch: true }));
    expect(action.kind === "close_all" && action.fillAt).toBe(60);
  });

  it("moves the stop to the entry once TP1 is reached, before the 3-point break-even fires", () => {
    const action = planStopAdjustment(state({ highWater: 121, lastPrice: 118 }));
    expect(action.kind).toBe("replace_stop");
    expect(action.stop).toBe(100);
    expect(action.reason).toBe("break_even");
    if (action.kind === "replace_stop") expect(action.explanation).toMatch(/TP1 was reached/);
  });

  it("rounds the entry floor toward profit, never a tick behind the entry", () => {
    const action = planStopAdjustment(state({ entryPrice: 100.004, highWater: 121, lastPrice: 118 }));
    expect(action.stop).toBe(100.01);
    const short = planStopAdjustment(state({ side: "short", levels: shortLevels, entryPrice: 99.996, highWater: 79, lastPrice: 82, appliedStop: 110 }));
    expect(short.stop).toBe(99.99);
  });

  it("closes at market when TP1 was touched and price is already back under the entry", () => {
    const action = planStopAdjustment(state({ highWater: 120, lastPrice: 99.5 }));
    expect(action.kind).toBe("close_all");
    expect(action.stop).toBe(100);
    if (action.kind === "close_all") expect(action.fillAt).toBeUndefined();
  });

  it("keeps a tighter structural stop over the entry floor", () => {
    const action = planStopAdjustment(state({ highWater: 125, lastPrice: 124, gann: { stop: 112, stopReason: "last_reaction", exit: null } }));
    expect(action.stop).toBe(112);
    expect(action.reason).toBe("trailing");
  });

  it("does nothing before TP1 or the MTP is reached", () => {
    const action = planStopAdjustment(state({ highWater: 119, lastPrice: 118 }));
    expect(action.kind).toBe("none");
    expect(action.stop).toBe(90);
  });

  it("reads only the best price since the switch applied, never an older touch (review B2)", () => {
    // Touched 141 a week ago (highWater), switch on today, best since then 98.
    const action = planStopAdjustment(state({ highWater: 141, lastPrice: 98, protectBest: 98 }));
    expect(action.kind).toBe("none");
    expect(action.stop).toBe(90);
  });

  it("at a broker, closes on a poll only while the price is at or through the MTP", () => {
    const fell = planStopAdjustment(state({ highWater: 141, lastPrice: 130, protectBest: 141, mtpFillsOnTouch: false }));
    expect(fell.kind === "close_all" && fell.fillAt != null).toBe(false);
    const at = planStopAdjustment(state({ highWater: 141, lastPrice: 140.5, protectBest: 141, mtpFillsOnTouch: false }));
    expect(at.kind === "close_all" && at.fillAt).toBe(140);
  });

  it("is the live rule unchanged when off: no entry lock at TP1, no MTP exit", () => {
    expect(planStopAdjustment(state({ protectProfits: false, highWater: 121, lastPrice: 118 })).kind).toBe("none");
    expect(planStopAdjustment(state({ protectProfits: false, highWater: 150, lastPrice: 148 })).kind).toBe("none");
  });
});

describe("the replay measures Protect profits", () => {
  const bar = (t: string, o: number, h: number, l: number, c: number): Bar => ({ t, o, h, l, c, v: 1000 });

  it("leaves at the MTP on the candle that trades to it, at the open when it gaps through", () => {
    const bars = [
      bar("2026-10-19T14:30:00Z", 100, 104, 99, 103),
      bar("2026-10-19T14:45:00Z", 103, 141, 102, 139),
      bar("2026-10-19T15:00:00Z", 139, 139, 95, 96),
    ];
    const walked = walkGannExit({ bars, from: 0, maxBarsHeld: 10, long: true, entry: 100, stop: 90, dailyBars: [], crossedLevel: null, protect: { tp1: 120, mtp: 140 } });
    expect(walked.reason).toBe("master_target");
    expect(walked.finalExit).toBe(140);
    expect(walked.barsHeld).toBe(2);

    const gap = [bar("2026-10-19T14:30:00Z", 100, 104, 99, 103), bar("2026-10-19T14:45:00Z", 145, 146, 144, 145)];
    expect(walkGannExit({ bars: gap, from: 0, maxBarsHeld: 10, long: true, entry: 100, stop: 90, dailyBars: [], crossedLevel: null, protect: { tp1: 120, mtp: 140 } }).finalExit).toBe(145);
  });

  it("locks the entry once TP1 is reached, so a winner that turns closes at break-even", () => {
    const bars = [
      bar("2026-10-19T14:30:00Z", 100, 121, 99, 118),
      bar("2026-10-19T14:45:00Z", 118, 119, 92, 93),
    ];
    const on = walkGannExit({ bars, from: 0, maxBarsHeld: 10, long: true, entry: 100, stop: 90, dailyBars: [], crossedLevel: null, protect: { tp1: 120, mtp: 140 } });
    expect(on.reason).toBe("break_even");
    expect(on.finalExit).toBe(100);
    const off = walkGannExit({ bars, from: 0, maxBarsHeld: 10, long: true, entry: 100, stop: 90, dailyBars: [], crossedLevel: null });
    expect(off.reason).not.toBe("break_even");
    expect(off.finalExit).not.toBe(100);
  });
});

describe("the member's setting", () => {
  it("is off by default and read only as a boolean", () => {
    expect(DEFAULT_GANN_RULE_PREFS.protectProfits).toBe(false);
    expect(resolveGannRulePrefs(null).protectProfits).toBe(false);
    expect(resolveGannRulePrefs({ gannRules: { protectProfits: true } }).protectProfits).toBe(true);
    expect(resolveGannRulePrefs({ gannRules: { protectProfits: "yes" } }).protectProfits).toBe(false);
    expect(resolveGannRulePrefs(null).protectProfitsSince).toBeNull();
  });

  it("records when it was turned on, keeps that while on, and clears it when off", () => {
    const now = new Date("2026-11-11T15:00:00.000Z");
    const off = { ...DEFAULT_GANN_RULE_PREFS };
    expect(protectProfitsSinceAfter(off, true, now)).toBe("2026-11-11T15:00:00.000Z");
    const on = { ...off, protectProfits: true, protectProfitsSince: "2026-11-10T12:00:00.000Z" };
    expect(protectProfitsSinceAfter(on, true, now)).toBe("2026-11-10T12:00:00.000Z");
    expect(protectProfitsSinceAfter(on, false, now)).toBeNull();
    expect(protectProfitsSinceAfter({ ...off, protectProfits: true }, true, now)).toBe("2026-11-11T15:00:00.000Z");
  });

  it("is stated in Guided Mode's exit sentence", () => {
    expect(exitSentence(0, 5, "buy", true)).toMatch(/sold automatically at the master take profit/);
    expect(exitSentence(0, 5, "buy")).toMatch(/No profit target is fixed/);
  });
});
