import { describe, it, expect } from "vitest";
import type { Bar } from "@/lib/types";
import {
  isThroughInvalidation,
  DEFAULT_CONFIG,
  cooldownUntil,
  gannFirstTarget,
  gannMasterTarget,
  gannOldLevels,
  measureMove,
  scanIntraday,
  barsForSession,
  scoreConfidence,
  unreadAudit,
  targetPaysRisk,
  sessionMetrics,
  volumeBaseline,
  type ScannerConfig,
  type SymbolInput,
} from "@/lib/scanner/intraday";
import { pricePoint, intradayPoint } from "@/lib/gann/pointScale";
import { NOTICE_SIGNALS, tradeHold } from "@/lib/scanner/intradayDisplay";
import { shortOfFigure } from "@/lib/gann/evenFigures";

/**
 * The session these tests replay is 2026-08-07, the day the scanner was
 * reported to have missed a $3–5 move in SPY inside the first two hours. Bars
 * are built in Eastern time so the opening-range window lands where the real
 * session boundary is: 13:30Z is 09:30 ET on that date.
 */
const OPEN_UTC = Date.parse("2026-08-07T13:30:00Z");

function bar(minuteOffset: number, o: number, h: number, l: number, c: number, v = 1_000_000): Bar {
  return {
    t: new Date(OPEN_UTC + minuteOffset * 60_000).toISOString(),
    o,
    h,
    l,
    c,
    v,
  };
}

/** A session that opens flat, ranges for 15 minutes, then trends up $4. */
function trendingUpBars(): Bar[] {
  const bars: Bar[] = [];
  // Opening range: 15 one-minute bars between 500 and 501.
  for (let i = 0; i < 15; i++) bars.push(bar(i, 500.2, 501, 500, 500.6));
  // The run: 90 minutes climbing to 504.5, each bar higher than the last.
  for (let i = 15; i < 105; i++) {
    const base = 500.6 + ((i - 15) / 90) * 3.9;
    bars.push(bar(i, base, base + 0.25, base - 0.1, base + 0.2, 1_200_000));
  }
  return bars;
}

/**
 * A rising daily campaign: legs of five sessions up about 3.5%, then four down
 * about 2.8%, rescaled so the last session (high 501.5, low 499, the second
 * day of a reaction) closes at 500. Its greatest reaction is about 2.8%, so a
 * session down 3% on top of the two before it over-balances it.
 */
function campaignDaily(): Bar[] {
  const raw: Bar[] = [];
  let price = 400;
  const start = Date.parse("2026-02-02T05:00:00Z");
  let day = 0;
  const push = (next: number) => {
    const o = price;
    const c = next;
    raw.push({ t: new Date(start + day * 86_400_000).toISOString(), o, h: Math.max(o, c) * 1.002, l: Math.min(o, c) * 0.998, c, v: 50_000_000 });
    price = next;
    day += 1;
  };
  for (let leg = 0; leg < 16; leg++) {
    for (let i = 0; i < 5; i++) push(price * 1.006);
    // The last leg's reaction is two sessions old, so today can be its third.
    for (let i = 0; i < (leg < 15 ? 4 : 2); i++) push(price * 0.994);
  }
  const k = 500 / raw[raw.length - 1].c;
  const scaled = raw.map((b) => ({ ...b, o: b.o * k, h: b.h * k, l: b.l * k, c: b.c * k }));
  const last = scaled[scaled.length - 1];
  scaled[scaled.length - 1] = { ...last, h: 501.5, l: 499 };
  return scaled;
}

function input(overrides: Partial<SymbolInput> = {}): SymbolInput {
  const bars = overrides.bars ?? trendingUpBars();
  const last = bars[bars.length - 1];
  return {
    symbol: "SPY",
    kind: "etf",
    bars,
    barIntervalMinutes: 1,
    prevClose: 500,
    quote: last ? { price: last.c, at: last.t } : null,
    volumeBaseline: 80_000_000,
    dailyAtr: 2.5,
    priorDailyBars: campaignDaily(),
    ...overrides,
  };
}

/** 11:33 ET on 2026-08-07 — the moment the move was reported as unflagged. */
const AT_1133 = new Date("2026-08-07T15:33:00Z");

describe("sessionMetrics", () => {
  it("reads the prior session's high and low as the day's old top and bottom", () => {
    const m = sessionMetrics(input())!;
    expect(m.priorHigh).toBeCloseTo(501.5, 5);
    expect(m.priorLow).toBeCloseTo(499, 5);
  });

  it("has no old levels without daily history, rather than inventing them", () => {
    const m = sessionMetrics(input({ priorDailyBars: undefined }))!;
    expect(m.priorHigh).toBeNull();
    expect(m.point).toBeGreaterThan(0);
  });

  it("scales Gann's allowance to the bars, the same point the intraday replay uses", () => {
    const m = sessionMetrics(input())!;
    expect(m.point).toBeCloseTo(intradayPoint(m.lastClose, m.intradayAtr, 2.5), 10);
    expect(sessionMetrics(input({ dailyAtr: null }))!.point).toBe(0);
  });

  it("reads the trend from Gann's 3-bar swing chart on the session's bars", () => {
    expect(sessionMetrics(input())!.swingTrend).toBe("up");
  });

  it("computes VWAP from typical price, so a bar closing at its extreme doesn't dominate", () => {
    const bars = [bar(0, 100, 110, 90, 110, 1000), bar(1, 110, 110, 110, 110, 1000)];
    const m = sessionMetrics(input({ bars, prevClose: 100 }))!;
    // Typical prices are (110+90+110)/3 = 103.33 and 110, equally weighted.
    expect(m.midpoint).toBeCloseTo((m.high + m.low) / 2, 6);
  });

  it("leaves relative volume null rather than defaulting it to 1.0", () => {
    const m = sessionMetrics(input({ volumeBaseline: null }))!;
    expect(m.relativeVolume).toBeNull();
  });

  it("discards bad prints instead of letting them set the session range", () => {
    const bars = [...trendingUpBars(), bar(106, 0, 0, 0, 0, 5000)];
    const m = sessionMetrics(input({ bars }))!;
    expect(m.low).toBeGreaterThan(400);
  });

  it("returns null when no usable bar arrived at all", () => {
    expect(sessionMetrics(input({ bars: [] }))).toBeNull();
  });
});

describe("measureMove", () => {
  it("states the basis alongside the number", () => {
    const move = measureMove(504.5, 500, "prior_close")!;
    expect(move.basis).toBe("prior_close");
    expect(move.absolute).toBeCloseTo(4.5, 5);
    expect(move.percent).toBeCloseTo(0.9, 5);
    expect(move.direction).toBe("up");
  });

  it("measures a down move as negative", () => {
    const move = measureMove(495, 500, "session_open")!;
    expect(move.absolute).toBeCloseTo(-5, 5);
    expect(move.direction).toBe("down");
  });

  it("refuses to divide by a non-positive reference", () => {
    expect(measureMove(100, 0, "prior_close")).toBeNull();
    expect(measureMove(100, -5, "prior_close")).toBeNull();
  });
});

describe("scanIntraday — the reported SPY miss", () => {
  it("flags a $4.50 SPY move that the daily reversion scan cannot see", () => {
    const { alerts } = scanIntraday([input()], DEFAULT_CONFIG, AT_1133);

    expect(alerts.length).toBeGreaterThan(0);
    const types = alerts.map((a) => a.type);
    expect(types).toContain("old_level_cross");
    expect(types).toContain("trend_continuation");
    expect(alerts.every((a) => a.symbol === "SPY")).toBe(true);
  });

  it("reports the move against an explicit, named basis", () => {
    const alert = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts.find(
      (a) => a.type === "old_level_cross",
    )!;
    expect(alert.move.basis).toBe("prior_session");
    expect(alert.move.reference).toBe(501.5);
    expect(alert.move.absolute).toBeGreaterThan(2.5);
  });

  it("invalidates a crossed top a point back under it, not at an arbitrary range", () => {
    const output = scanIntraday([input()], DEFAULT_CONFIG, AT_1133);
    const alert = output.alerts.find((a) => a.type === "old_level_cross")!;
    const m = output.audit[0].metrics!;
    expect(alert.direction).toBe("up");
    expect(alert.invalidation).toBeCloseTo(501.5 - m.point, 10);
  });

  it("does not call a cross until a bar has closed beyond the level by the allowance", () => {
    // The session pokes above yesterday's high but closes back at it.
    const bars = trendingUpBars().slice(0, 15);
    bars.push(bar(15, 500.6, 502.4, 500.5, 501.6));
    const last = bars[bars.length - 1];
    const output = scanIntraday(
      [input({ bars, quote: { price: last.c, at: last.t } })],
      DEFAULT_CONFIG,
      new Date("2026-08-07T14:00:00Z"),
    );
    expect(output.alerts.map((a) => a.type)).not.toContain("old_level_cross");
  });

  it("mirrors the cross for the downside (Polarity)", () => {
    const bars: Bar[] = [];
    for (let i = 0; i < 60; i++) {
      const base = 499 - (i / 60) * 6;
      bars.push(bar(i, base, base + 0.1, base - 0.25, base - 0.2, 1_200_000));
    }
    const last = bars[bars.length - 1];
    const alert = scanIntraday(
      [input({ bars, quote: { price: last.c, at: last.t } })],
      DEFAULT_CONFIG,
      new Date("2026-08-07T14:45:00Z"),
    ).alerts.find((a) => a.type === "old_level_cross")!;
    expect(alert.direction).toBe("down");
    expect(alert.move.reference).toBe(499);
  });

  it("carries an invalidation level on every alert", () => {
    const { alerts } = scanIntraday([input()], DEFAULT_CONFIG, AT_1133);
    expect(alerts.every((a) => a.invalidation !== null)).toBe(true);
  });

  it("gives both a continuation plan and an opposite-direction pivot plan", () => {
    const alert = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts[0];
    expect(alert.continuationPlan.confirmation).toBeTruthy();
    expect(alert.continuationPlan.cancelIf).toBeTruthy();
    expect(alert.pivotPlan.confirmation).toContain("needs its own evidence");
    expect(alert.pivotPlan.cancelIf).toContain("standing aside");
  });

  it("explains itself in plain language, without predicting", () => {
    const alert = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts[0];
    expect(alert.whyThisAppeared.length).toBeGreaterThan(80);
    expect(alert.whyThisAppeared).not.toMatch(/will (rise|fall|go|continue)/i);
    expect(alert.whyThisAppeared).not.toMatch(/guarantee/i);
  });

  it("shows the confidence score's factors, not just the number", () => {
    const alert = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts[0];
    expect(alert.confidence).toBeGreaterThan(0);
    expect(alert.confidence).toBeLessThanOrEqual(100);
    expect(alert.confidenceFactors.length).toBeGreaterThan(1);
    expect(alert.confidenceFactors.every((f) => f.detail.length > 0)).toBe(true);
  });
});

describe("scanIntraday — the liquidity floor", () => {
  /** The same trending session, re-priced onto a sub-$5 symbol. */
  function pennyBars(): Bar[] {
    return trendingUpBars().map((b) => ({
      ...b,
      o: b.o / 1000,
      h: b.h / 1000,
      l: b.l / 1000,
      c: b.c / 1000,
    }));
  }

  it("filters a sub-$5 symbol however hard it is moving", () => {
    const output = scanIntraday(
      [input({ symbol: "AGRZ", kind: "equity", bars: pennyBars(), prevClose: 0.5 })],
      DEFAULT_CONFIG,
      AT_1133,
    );

    expect(output.alerts).toHaveLength(0);
    expect(output.audit[0].outcome).toBe("filtered");
    expect(output.audit[0].reason).toMatch(/below the \$5 floor/);
  });

  it("filters a symbol whose daily turnover is below the floor", () => {
    const output = scanIntraday(
      [input({ symbol: "SNYR", kind: "equity", avgDailyVolume: 100_000 })],
      DEFAULT_CONFIG,
      AT_1133,
    );

    expect(output.alerts).toHaveLength(0);
    expect(output.audit[0].outcome).toBe("filtered");
    expect(output.audit[0].reason).toMatch(/a day/);
  });

  it("still alerts on a liquid symbol, and says what it measured", () => {
    const output = scanIntraday([input({ avgDailyVolume: 80_000_000 })], DEFAULT_CONFIG, AT_1133);

    expect(output.alerts.length).toBeGreaterThan(0);
    const check = output.audit[0].checks.find((c) => c.name === "Tradeable instrument")!;
    expect(check.passed).toBe(true);
    expect(check.detail).toMatch(/shares a day/);
  });

  it("applies the price floor alone when no daily volume was supplied", () => {
    const check = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).audit[0].checks.find(
      (c) => c.name === "Tradeable instrument",
    )!;
    expect(check.passed).toBe(true);
    expect(check.detail).toMatch(/only the price floor/);
  });

  /**
   * The bug that let a live BTC move go unflagged: `minSessionVolume` (50,000)
   * is a share count, and a session's worth of a big-cap coin is measured in
   * single or double-digit units, not shares — so the gate failed every
   * crypto symbol regardless of how much money actually moved. Same session
   * shape as the rest of this file, re-volumed to coin units.
   */
  function cryptoVolumeBars(): Bar[] {
    return trendingUpBars().map((b) => ({ ...b, v: 0.2 }));
  }

  it("does not apply the share-denominated session-volume floor to crypto", () => {
    const output = scanIntraday(
      [
        input({
          symbol: "BTC/USD",
          kind: "crypto",
          bars: cryptoVolumeBars(),
          avgDailyVolume: 20_000, // ~20,000 coins/day at this fixture's ~$500-504 price clears the $5M dollar floor
        }),
      ],
      DEFAULT_CONFIG,
      AT_1133,
    );

    expect(output.audit[0].outcome).not.toBe("filtered");
    const liquidityCheck = output.audit[0].checks.find((c) => c.name === "Liquidity")!;
    expect(liquidityCheck.passed).toBe(true);
    expect(liquidityCheck.detail).toMatch(/coins/);
    expect(liquidityCheck.detail).not.toMatch(/shares/);
    expect(output.alerts.length).toBeGreaterThan(0);
  });

  it("still filters a crypto pair whose dollar turnover is below the floor", () => {
    const output = scanIntraday(
      [
        input({
          symbol: "SHIB/USD",
          kind: "crypto",
          bars: cryptoVolumeBars(),
          avgDailyVolume: 100, // ~$50k/day at this fixture's price — far below the $5M floor
        }),
      ],
      DEFAULT_CONFIG,
      AT_1133,
    );

    expect(output.alerts).toHaveLength(0);
    expect(output.audit[0].outcome).toBe("filtered");
    expect(output.audit[0].reason).toMatch(/turnover/);
  });
});

describe("scanIntraday — data freshness", () => {
  it("refuses to alert on a stale feed and says so", () => {
    // Bars end at 11:15 ET but the scan runs at 15:33 ET — four hours behind.
    const late = new Date("2026-08-07T19:33:00Z");
    const output = scanIntraday([input()], DEFAULT_CONFIG, late);

    expect(output.alerts).toHaveLength(0);
    expect(output.staleSymbols).toEqual(["SPY"]);
    expect(output.audit[0].outcome).toBe("stale_data");
    expect(output.audit[0].reason).toMatch(/old/);
  });

  it("records the data timestamp separately from the trigger time", () => {
    const alert = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts[0];
    expect(alert.triggerTime).toBe(AT_1133.toISOString());
    expect(alert.dataTimestamp).not.toBe(alert.triggerTime);
    expect(alert.dataAgeSeconds).toBeGreaterThan(0);
  });

  it("explains a late detection in terms of the feed delay and Gann's closing rule", () => {
    const alert = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts.find(
      (a) => a.type === "old_level_cross",
    )!;
    expect(alert.whyNotEarlier).toContain("closed beyond the level");
  });
});

describe("scanIntraday — over-balance of space", () => {
  /** A session that falls about 3% from yesterday's close of 500. */
  function fallingBars(): Bar[] {
    const bars: Bar[] = [];
    for (let i = 0; i < 90; i++) {
      const base = 500 - (i / 90) * 15;
      bars.push(bar(i, base, base + 0.1, base - 0.25, base - 0.2, 1_500_000));
    }
    return bars;
  }

  it("does not fire on a move with the campaign's trend, however large", () => {
    const output = scanIntraday([input()], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts.map((a) => a.type)).not.toContain("space_overbalance");
  });

  it("fires when today's reaction exceeds the greatest reaction of the campaign", () => {
    const bars = fallingBars();
    const last = bars[bars.length - 1];
    const alert = scanIntraday(
      [input({ bars, quote: { price: last.c, at: last.t } })],
      DEFAULT_CONFIG,
      new Date("2026-08-07T15:05:00Z"),
    ).alerts.find((a) => a.type === "space_overbalance");
    expect(alert).toBeDefined();
    expect(alert!.direction).toBe("down");
    expect(alert!.whyThisAppeared).toMatch(/larger than any reaction/);
  });

  it("stays quiet when the reaction is no larger than the campaign has already seen", () => {
    const bars = fallingBars().slice(0, 12); // about 0.4% down
    const last = bars[bars.length - 1];
    const output = scanIntraday(
      [input({ bars, quote: { price: last.c, at: last.t } })],
      DEFAULT_CONFIG,
      new Date("2026-08-07T13:50:00Z"),
    );
    expect(output.alerts.map((a) => a.type)).not.toContain("space_overbalance");
  });

  it("reports no over-balance without daily history, rather than guessing", () => {
    const bars = fallingBars();
    const last = bars[bars.length - 1];
    const output = scanIntraday(
      [input({ bars, quote: { price: last.c, at: last.t }, priorDailyBars: undefined })],
      DEFAULT_CONFIG,
      new Date("2026-08-07T15:05:00Z"),
    );
    expect(output.alerts.map((a) => a.type)).not.toContain("space_overbalance");
  });

  it("skips a symbol with too little volume to be worth calling", () => {
    const thin = trendingUpBars().map((b) => ({ ...b, v: 10 }));
    const output = scanIntraday([input({ bars: thin })], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts).toHaveLength(0);
    expect(output.audit[0].outcome).toBe("filtered");
  });
});

describe("scanIntraday — reversal risk", () => {
  it("flags a breakout that was given back", () => {
    const bars = trendingUpBars();
    // Round-trip: the last twenty minutes give the whole move back and close
    // back under yesterday's high by more than Gann's allowance.
    for (let i = 105; i < 125; i++) {
      const base = 504.5 - ((i - 105) / 20) * 4.6;
      bars.push(bar(i, base, base + 0.1, base - 0.25, base - 0.2, 2_000_000));
    }
    const last = bars[bars.length - 1];
    const output = scanIntraday(
      [input({ bars, quote: { price: last.c, at: last.t } })],
      DEFAULT_CONFIG,
      new Date("2026-08-07T15:40:00Z"),
    );

    const reversal = output.alerts.find((a) => a.type === "reversal_risk");
    expect(reversal).toBeDefined();
    expect(reversal!.direction).toBe("down");
    expect(reversal!.whyThisAppeared).toContain("stand aside");
  });
});

describe("scanIntraday — suppression", () => {
  const recent = [
    { type: "old_level_cross" as const, direction: "up" as const, at: "2026-08-07T15:20:00Z" },
  ];

  it("suppresses a repeat of the same signal inside the cooldown", () => {
    const output = scanIntraday([input({ lastAlerts: recent })], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts.map((a) => a.type)).not.toContain("old_level_cross");
  });

  it("records the held repeat in the audit rather than looking like no signal", () => {
    const output = scanIntraday([input({ lastAlerts: recent })], DEFAULT_CONFIG, AT_1133);
    const held = output.audit[0].checks.find((c) => c.name.includes("repeat held"));
    expect(held).toBeDefined();
    expect(held!.detail).toContain("Still qualifies");
  });

  it("keeps a still-qualifying repeat on screen, marked with when it first fired (TSLA, 2026-10-21)", () => {
    const output = scanIntraday([input({ lastAlerts: recent })], DEFAULT_CONFIG, AT_1133);
    const held = output.heldAlerts.find((a) => a.type === "old_level_cross");
    expect(held).toBeDefined();
    expect(held!.firstFlaggedAt).toBe("2026-08-07T15:20:00.000Z");
  });

  it("reads first-flagged back through a chain of repeats, not the latest one", () => {
    const chain = [
      { type: "old_level_cross" as const, direction: "up" as const, at: "2026-08-07T15:20:00Z" },
      { type: "old_level_cross" as const, direction: "up" as const, at: "2026-08-07T14:55:00Z" },
      // More than a cooldown before the next: a separate, earlier run.
      { type: "old_level_cross" as const, direction: "up" as const, at: "2026-08-07T13:40:00Z" },
    ];
    const output = scanIntraday([input({ lastAlerts: chain })], DEFAULT_CONFIG, AT_1133);
    const held = output.heldAlerts.find((a) => a.type === "old_level_cross");
    expect(held?.firstFlaggedAt).toBe("2026-08-07T14:55:00.000Z");
  });

  it("never lets a momentum alert silence a reversal alert on the same symbol", () => {
    const until = cooldownUntil(
      input({ lastAlerts: recent }),
      { type: "reversal_risk", direction: "down" },
      DEFAULT_CONFIG,
    );
    expect(until).toBeNull();
  });

  it("lets the same signal through once the cooldown has expired", () => {
    const old = [
      { type: "old_level_cross" as const, direction: "up" as const, at: "2026-08-07T14:00:00Z" },
    ];
    const output = scanIntraday([input({ lastAlerts: old })], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts.map((a) => a.type)).toContain("old_level_cross");
  });
});

describe("scanIntraday — the daily plan's level held (SPY, 2026-10-21)", () => {
  // The plan's entry sits under the prior close, so the session's dip to it
  // is a reaction from above. (Corrected 2026-10-22: the entry was 500.5 over
  // a 500 close, a crossing still to be made, which the alert bought.)
  const plan = { direction: "up" as const, entry: 499.8, stop: 495, tp1: 510, mtp: 520, verdict: "Execute" as const };

  it("alerts when price reacts to the daily plan's entry and the session turns back up through it", () => {
    const output = scanIntraday([input({ dailyPlan: plan })], DEFAULT_CONFIG, AT_1133);
    const held = output.alerts.find((a) => a.type === "plan_level_held");
    expect(held).toBeDefined();
    expect(held!.direction).toBe("up");
    // 3 Gann points under the day's low, never past the daily plan's stop.
    expect(held!.invalidation!).toBeLessThan(500);
    expect(held!.invalidation!).toBeGreaterThanOrEqual(plan.stop);
    // The daily plan's own targets carry through.
    expect(held!.continuationPlan.firstTarget).toBe(510);
    expect(held!.continuationPlan.masterTarget).toBe(520);
  });

  // Corrected 2026-10-21 with #411: the entry opens on the daily plan's own
  // stop (W006 Rule 3); a day stop under today's low is the Fast style's
  // trail after the fill, not the stop at entry (it read 500 - 3 points).
  it("opens on the daily plan's own stop, even when it is far below the day's low (W006 Rule 3)", () => {
    const output = scanIntraday([input({ dailyPlan: { ...plan, stop: 450 } })], DEFAULT_CONFIG, AT_1133);
    const held = output.alerts.find((a) => a.type === "plan_level_held");
    expect(held!.invalidation!).toBe(450);
  });

  it("stays quiet on a crossing not yet made: the prior session closed under the entry (W006 Rule 3(b))", () => {
    const output = scanIntraday([input({ dailyPlan: { ...plan, entry: 500.5 } })], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts.find((a) => a.type === "plan_level_held")).toBeUndefined();
    const check = output.audit[0].checks.find((c) => c.name === "Daily plan's level");
    expect(check?.detail).toContain("no reaction to it yet");
  });

  it("stays quiet while the plan's crossing waits on its daily 3-point close, even with the prior close past the entry", () => {
    const output = scanIntraday([input({ dailyPlan: { ...plan, awaitsCrossing: true } })], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts.find((a) => a.type === "plan_level_held")).toBeUndefined();
    const check = output.audit[0].checks.find((c) => c.name === "Daily plan's level");
    expect(check?.detail).toContain("crossing is not made yet");
    // Once made, the same plan fires on the reaction.
    const made = scanIntraday([input({ dailyPlan: { ...plan, awaitsCrossing: false } })], DEFAULT_CONFIG, AT_1133);
    expect(made.alerts.find((a) => a.type === "plan_level_held")).toBeDefined();
  });

  it("passes a short's side test when the prior close sits under its entry", () => {
    // The session fixture runs up, so the short is refused later (its swing
    // runs the wrong way); only the side test is asserted here.
    const short = { direction: "down" as const, entry: 500.6, stop: 510, tp1: 490, mtp: 480, verdict: "Execute" as const };
    const output = scanIntraday([input({ dailyPlan: short })], DEFAULT_CONFIG, AT_1133);
    const check = output.audit[0].checks.find((c) => c.name === "Daily plan's level");
    expect(check?.detail ?? "").not.toContain("no reaction to it yet");
  });

  it("reads a held bottom whose entry is the prior close itself as a reaction", () => {
    const output = scanIntraday([input({ prevClose: 499.8, dailyPlan: plan })], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts.find((a) => a.type === "plan_level_held")).toBeDefined();
  });

  it("stays quiet with no prior close to read", () => {
    const output = scanIntraday([input({ prevClose: null, dailyPlan: plan })], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts.find((a) => a.type === "plan_level_held")).toBeUndefined();
    const check = output.audit[0].checks.find((c) => c.name === "Daily plan's level");
    expect(check?.detail).toContain("No prior close");
  });

  it("mirrors the side test for a short: a prior close under the entry is no reaction to a short's entry", () => {
    const short = { direction: "down" as const, entry: 499.8, stop: 510, tp1: 490, mtp: 480, verdict: "Execute" as const };
    const output = scanIntraday([input({ dailyPlan: short })], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts.find((a) => a.type === "plan_level_held")).toBeUndefined();
    const check = output.audit[0].checks.find((c) => c.name === "Daily plan's level");
    expect(check?.detail).toContain("closed over the plan's entry");
  });

  // Polarity: the long case reflected through 500 (every price p becomes
  // 1000 - p, highs and lows swapped), so the session rallies up to a short
  // plan's entry from under it and turns back down through it.
  const mirror = (b: Bar): Bar => ({ ...b, o: 1000 - b.o, h: 1000 - b.l, l: 1000 - b.h, c: 1000 - b.c });
  const mirroredInput = (overrides: Partial<SymbolInput> = {}) =>
    input({ bars: trendingUpBars().map(mirror), priorDailyBars: campaignDaily().map(mirror), ...overrides });
  const short = { direction: "down" as const, entry: 500.2, stop: 505, tp1: 490, mtp: 480, verdict: "Execute" as const };

  it("fires for a short, mirrored: a rally to the entry from under it that turns back down", () => {
    const output = scanIntraday([mirroredInput({ dailyPlan: short })], DEFAULT_CONFIG, AT_1133);
    const held = output.alerts.find((a) => a.type === "plan_level_held");
    expect(held).toBeDefined();
    expect(held!.direction).toBe("down");
    expect(held!.invalidation!).toBeGreaterThan(500);
    expect(held!.invalidation!).toBeLessThanOrEqual(short.stop);
    expect(held!.continuationPlan.firstTarget).toBe(490);
    expect(held!.continuationPlan.masterTarget).toBe(480);
  });

  it("stays quiet for a short whose crossing waits on its daily 3-point close", () => {
    const output = scanIntraday([mirroredInput({ dailyPlan: { ...short, awaitsCrossing: true } })], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts.find((a) => a.type === "plan_level_held")).toBeUndefined();
  });

  it("stays quiet with no daily plan", () => {
    const output = scanIntraday([input()], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts.find((a) => a.type === "plan_level_held")).toBeUndefined();
  });

  it("stays quiet once the daily plan's stop has traded this session", () => {
    const output = scanIntraday([input({ dailyPlan: { ...plan, stop: 500.1 } })], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts.find((a) => a.type === "plan_level_held")).toBeUndefined();
  });

  it("stays quiet when price never came back to the plan's entry", () => {
    const output = scanIntraday([input({ dailyPlan: { ...plan, entry: 490, stop: 485 } })], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts.find((a) => a.type === "plan_level_held")).toBeUndefined();
  });
});

describe("gannFirstTarget — profits must exceed losses", () => {
  it("passes over a level nearer than the risk for the first one that pays more", () => {
    expect(targetPaysRisk(100, 98, 101)).toBe(false);
    expect(targetPaysRisk(100, 98, 103)).toBe(true);
    expect(targetPaysRisk(100, 98, null)).toBeNull();
  });
});

describe("scanIntraday — audit trail", () => {
  it("records an entry for every symbol, including those that produced nothing", () => {
    const flat = Array.from({ length: 105 }, (_, i) => bar(i, 500, 500.1, 499.9, 500, 1_000_000));
    const output = scanIntraday(
      [
        input(),
        input({
          symbol: "MSFT",
          kind: "equity",
          bars: flat,
          quote: { price: 500, at: flat[flat.length - 1].t },
          // Yesterday's low (499) is under today's flat session, which would turn the Overnight Chart up.
          priorDailyBars: undefined,
        }),
      ],
      DEFAULT_CONFIG,
      AT_1133,
    );

    expect(output.audit.map((a) => a.symbol).sort()).toEqual(["MSFT", "SPY"]);
    const msft = output.audit.find((a) => a.symbol === "MSFT")!;
    expect(msft.outcome).toBe("no_signal");
    expect(msft.reason).toContain("Evaluated");
  });

  it("names each check it ran, passed or failed", () => {
    const output = scanIntraday([input()], DEFAULT_CONFIG, AT_1133);
    const names = output.audit[0].checks.map((c) => c.name);
    expect(names).toContain("Data freshness");
    expect(names).toContain("Liquidity");
    expect(names).toContain("Reference price");
  });

  it("distinguishes 'no data arrived' from 'evaluated and nothing qualified'", () => {
    const output = scanIntraday([input({ bars: [] })], DEFAULT_CONFIG, AT_1133);
    expect(output.audit[0].outcome).toBe("insufficient_data");
  });

  it("keeps asset kinds labeled so an ETF is not presented as a stock", () => {
    const output = scanIntraday(
      [input(), input({ symbol: "BTC/USD", kind: "crypto" })],
      DEFAULT_CONFIG,
      AT_1133,
    );
    expect(output.audit.find((a) => a.symbol === "SPY")!.kind).toBe("etf");
    expect(output.audit.find((a) => a.symbol === "BTC/USD")!.kind).toBe("crypto");
  });
});

describe("scoreConfidence", () => {
  // Audit I-01: every check counts the same; no hand-set weights rank one above another.
  it("is the share of checks met", () => {
    expect(
      scoreConfidence([
        { label: "a", passed: true, detail: "" },
        { label: "b", passed: true, detail: "" },
        { label: "c", passed: true, detail: "" },
        { label: "d", passed: false, detail: "" },
      ]),
    ).toBe(75);
  });

  it("is zero when nothing passed and 100 when everything did", () => {
    const factors = [
      { label: "a", detail: "" },
      { label: "b", detail: "" },
    ];
    expect(scoreConfidence(factors.map((f) => ({ ...f, passed: false })))).toBe(0);
    expect(scoreConfidence(factors.map((f) => ({ ...f, passed: true })))).toBe(100);
  });

  it("does not divide by zero on an empty factor list", () => {
    expect(scoreConfidence([])).toBe(0);
  });
});

describe("an alert against the daily trend (audit I-02)", () => {
  // Never-failing rule 5: the method trades with the main trend, so an alert
  // the daily swing chart runs against is shown for study and never offered.
  const mirror = (b: Bar): Bar => ({ ...b, o: 1000 - b.o, h: 1000 - b.l, l: 1000 - b.h, c: 1000 - b.c });

  it("is flagged exactly when its daily-trend check failed, and held from trade", () => {
    const outputs = [
      scanIntraday([input()], DEFAULT_CONFIG, AT_1133),
      scanIntraday([input({ priorDailyBars: campaignDaily().map(mirror) })], DEFAULT_CONFIG, AT_1133),
    ];
    const alerts = outputs.flatMap((o) => o.alerts);
    expect(alerts.length).toBeGreaterThan(0);
    let against = 0;
    for (const a of alerts) {
      const check = a.confidenceFactors.find((f) => f.label === "With the daily trend");
      const exempt = a.type === "reversal_risk" || a.type === "plan_level_held" || NOTICE_SIGNALS.has(a.type);
      const expected = !exempt && check !== undefined && !check.passed;
      expect(a.againstDailyTrend === true).toBe(expected);
      if (expected) {
        against++;
        expect(tradeHold(a)).toMatch(/Against the daily trend/);
      }
    }
    expect(against).toBeGreaterThan(0);
  });
});

describe("an alert whose stop sits inside one intraday point (2026-10-29)", () => {
  // The intraday alerts replay refuses this trade (`risk_under_point`); the
  // live alert now holds it the same way, so nothing offers or bells it.
  it("is never flagged on a warning or a notice, and is held from trade when flagged", () => {
    const alerts = [scanIntraday([input()], DEFAULT_CONFIG, AT_1133), scanIntraday([input({ priorDailyBars: campaignDaily() })], DEFAULT_CONFIG, AT_1133)].flatMap((o) => o.alerts);
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      if (a.type === "reversal_risk" || NOTICE_SIGNALS.has(a.type)) expect(a.riskUnderPoint).toBeUndefined();
      if (a.riskUnderPoint) expect(tradeHold(a)).not.toBeNull();
    }
  });

  it("is set exactly when the stop sits under one point from the last price", () => {
    let flagged = 0;
    for (const dailyAtr of [0.01, 2.5, null]) {
      const inp = input({ dailyAtr });
      const point = sessionMetrics(inp)!.point;
      const last = sessionMetrics(inp)!.last;
      for (const a of scanIntraday([inp], DEFAULT_CONFIG, AT_1133).alerts) {
        const exempt = a.type === "reversal_risk" || NOTICE_SIGNALS.has(a.type);
        const expected = !exempt && a.invalidation != null && point > 0 && Math.abs(last - a.invalidation) < point;
        expect(a.riskUnderPoint === true).toBe(expected);
        if (a.riskUnderPoint) flagged++;
      }
      if (dailyAtr == null) expect(point).toBe(0);
    }
    expect(flagged).toBeGreaterThan(0);
  });

  it("holds the trade, after a measured-losing or against-trend hold", () => {
    expect(tradeHold({ type: "trend_continuation", riskUnderPoint: true })).toMatch(/Stop too close/);
    expect(tradeHold({ type: "trend_continuation", riskUnderPoint: false })).toBeNull();
    expect(tradeHold({ type: "trend_continuation", riskUnderPoint: true, againstDailyTrend: true })).toMatch(/Against the daily trend/);
  });
});

describe("the Overnight and hourly charts replace the volume-only alert (Q29)", () => {
  it("raises no alert on volume alone, however loose the threshold", () => {
    const loose: ScannerConfig = { ...DEFAULT_CONFIG, relativeVolumeThreshold: 0.1 };
    expect(scanIntraday([input()], loose, AT_1133).alerts.map((a) => a.type as string)).not.toContain("unusual_volume");
  });

  it("alerts when the Overnight Chart turns on today's session, its stop 1 point under the last bottom", () => {
    // Yesterday was the second day of a reaction (low 499); today's low holds above it: a higher bottom.
    const alert = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts.find((a) => a.type === "overnight_turn");
    expect(alert?.direction).toBe("up");
    expect(alert?.invalidation).toBeCloseTo(499 - pricePoint(499), 2);
  });

  it("does not alert on the Overnight Chart when today makes no new bottom or top against the line", () => {
    const daily = campaignDaily();
    // Yesterday already made a higher bottom, so the line was up before today.
    daily[daily.length - 2] = { ...daily[daily.length - 2], l: 498 };
    daily[daily.length - 1] = { ...daily[daily.length - 1], l: 499, h: 501.5 };
    const types = scanIntraday([input({ priorDailyBars: daily })], DEFAULT_CONFIG, AT_1133).alerts.map((a) => a.type);
    expect(types).not.toContain("overnight_turn");
  });
});

describe("volumeBaseline", () => {
  /** Two minutes of volume per session, on three consecutive weekdays. */
  function sessionBars(date: string, perBar: number): Bar[] {
    const open = Date.parse(`${date}T13:30:00Z`);
    return Array.from({ length: 60 }, (_, i) => ({
      t: new Date(open + i * 60_000).toISOString(),
      o: 100,
      h: 100.1,
      l: 99.9,
      c: 100,
      v: perBar,
    }));
  }

  const history = [
    ...sessionBars("2026-08-05", 1000),
    ...sessionBars("2026-08-06", 3000),
    ...sessionBars("2026-08-07", 9999), // today — must be excluded
  ];

  it("averages prior sessions' volume up to the same time of day", () => {
    // 10:00 ET is 30 minutes into the session. The bar stamped 10:00 counts:
    // a bar's timestamp is its start, and today's cumulative volume includes
    // the bar currently in progress, so the baseline has to include the same
    // one or relative volume is biased high by a bar on every scan.
    const at1000 = 10 * 60;
    expect(volumeBaseline(history, at1000, "2026-08-07")).toBe((31 * 1000 + 31 * 3000) / 2);
  });

  it("excludes today, so the baseline is never measured against itself", () => {
    const baseline = volumeBaseline(history, 10 * 60, "2026-08-07")!;
    expect(baseline).toBeLessThan(30 * 9999);
  });

  // A whole-day average would make every symbol look quiet in the morning,
  // which is exactly the window the reported move happened in.
  it("scales with the time of day rather than using a whole-session figure", () => {
    const early = volumeBaseline(history, 9 * 60 + 45, "2026-08-07")!;
    const late = volumeBaseline(history, 10 * 60 + 30, "2026-08-07")!;
    expect(late).toBeGreaterThan(early);
  });

  it("returns null rather than a number drawn from a single session", () => {
    expect(volumeBaseline(sessionBars("2026-08-06", 3000), 10 * 60, "2026-08-07")).toBeNull();
  });

  it("returns null when there is no history at all", () => {
    expect(volumeBaseline([], 10 * 60, "2026-08-07")).toBeNull();
  });
});

describe("barsForSession", () => {
  it("keeps only the requested Eastern date and sorts it oldest first", () => {
    const bars = [
      { t: "2026-08-07T19:00:00Z", o: 1, h: 1, l: 1, c: 1, v: 1 },
      { t: "2026-08-06T19:00:00Z", o: 1, h: 1, l: 1, c: 1, v: 1 },
      { t: "2026-08-07T13:31:00Z", o: 1, h: 1, l: 1, c: 1, v: 1 },
    ];
    const session = barsForSession(bars, "2026-08-07");
    expect(session.map((b) => b.t)).toEqual([
      "2026-08-07T13:31:00Z",
      "2026-08-07T19:00:00Z",
    ]);
  });

  // 2026-08-08T01:00Z is still 2026-08-07 in New York — an after-hours print
  // belongs to the session it traded in, not to the next UTC day.
  it("groups a late-evening UTC print into the Eastern session it belongs to", () => {
    const bars = [{ t: "2026-08-08T01:00:00Z", o: 1, h: 1, l: 1, c: 1, v: 1 }];
    expect(barsForSession(bars, "2026-08-07")).toHaveLength(1);
  });
});

describe("session boundaries", () => {
  /** A bar at a given ET wall-clock minute on 2026-08-07. */
  function etBar(hour: number, minute: number, price: number, v = 1_000_000): Bar {
    // 2026-08-07 is EDT (UTC-4), so ET hour + 4 is the UTC hour.
    const t = new Date(Date.UTC(2026, 7, 7, hour + 4, minute)).toISOString();
    return { t, o: price, h: price + 0.1, l: price - 0.1, c: price, v };
  }

  // The feed serves pre-market from 04:00 ET. Counting it put the session's
  // high, low and 50% point in the pre-market, where a few thin prints set a
  // range two cents wide.
  it("ignores pre-market bars when setting the session's range", () => {
    const bars = [
      etBar(4, 0, 400),
      etBar(4, 5, 401),
      etBar(4, 10, 402),
      etBar(9, 30, 500),
      etBar(9, 40, 501),
      etBar(9, 50, 502),
      etBar(10, 0, 503),
    ];
    const m = sessionMetrics(input({ bars, kind: "etf" }))!;

    expect(m.low).toBeCloseTo(499.9, 5);
    expect(m.high).toBeCloseTo(503.1, 5);
    expect(m.barCount).toBe(4);
  });

  it("excludes pre-market volume from the session total", () => {
    const bars = [etBar(4, 0, 400, 5_000_000), etBar(9, 30, 500, 1_000_000)];
    const m = sessionMetrics(input({ bars }))!;
    expect(m.cumulativeVolume).toBe(1_000_000);
  });

  it("excludes after-hours bars too", () => {
    const bars = [etBar(9, 30, 500), etBar(15, 59, 501), etBar(17, 0, 520)];
    const m = sessionMetrics(input({ bars }))!;
    expect(m.high).toBeLessThan(510);
  });

  it("treats the whole day as the session for crypto, which has no open", () => {
    const bars = [etBar(2, 0, 100), etBar(2, 30, 101), etBar(20, 0, 102)];
    const m = sessionMetrics(input({ bars, kind: "crypto", symbol: "BTC/USD" }))!;
    expect(m.barCount).toBe(3);
    expect(m.low).toBeCloseTo(99.9, 5);
  });

  it("returns null when a symbol traded only outside the regular session", () => {
    expect(sessionMetrics(input({ bars: [etBar(4, 0, 400)] }))).toBeNull();
  });
});


/**
 * The first target is an old top or bottom, or a round number just short of one
 * (owner, 2026-09-30: "everything must align with Gann"), not a multiple of the
 * risk. Where none lies ahead the method fixes no target and the stop trails.
 */
describe("gannFirstTarget", () => {
  const base = {
    direction: "up" as const,
    last: 480,
    sessionHigh: 480.05,
    sessionLow: 470,
    prevClose: 471,
    dailyAtr: 3,
    intradayAtr: 0.3,
  };

  it("names the session's own old top when price has come off it", () => {
    expect(gannFirstTarget({ ...base, sessionHigh: 483 })).toBe(483);
  });

  it("ignores an old level inside the noise a real move has to clear", () => {
    // 480.05 is a tenth of an intraday ATR away; it is not a target.
    expect(gannFirstTarget(base)).toBeNull();
  });

  it("names a round number just short of it, when one lies within a day's range", () => {
    // 100 is a figure; markets turn just short of it, so the target sits under it.
    const t = gannFirstTarget({ ...base, last: 97.2, sessionHigh: 97.25, sessionLow: 95, prevClose: 96, intradayAtr: 0.2 });
    expect(t).toBeCloseTo(shortOfFigure(100, "below"), 6);
  });

  it("takes the prior close above a price still under it as the nearest old level", () => {
    const t = gannFirstTarget({ ...base, last: 498.6, sessionHigh: 498.7, sessionLow: 490, prevClose: 502.25, dailyAtr: 6 });
    expect(t).toBe(502.25);
  });

  it("passes over a level that pays less than the risk for the first that pays more (M-K5)", () => {
    // 483 is 3 away, 490 is 10 away; with 4 at risk only 490 pays. (Levels
    // more than 1% apart, so M-P4 keeps them two points.)
    expect(gannFirstTarget({ ...base, sessionHigh: 483, oldLevels: [490], dailyAtr: 8, risk: 4 })).toBe(490);
  });

  it("averages old levels within 1% into one point before reading the target (M-P4)", () => {
    // 483 and 485 sit 0.4% apart: one resistance point at 484, as the daily plan reads them.
    expect(gannFirstTarget({ ...base, sessionHigh: 483, oldLevels: [485], dailyAtr: 8 })).toBe(484);
    // Averaged, the point is 4 away and no longer pays a risk of 4, so the card can say so.
    expect(gannFirstTarget({ ...base, sessionHigh: 483, oldLevels: [485], dailyAtr: 8, risk: 4 })).toBe(484);
    // The session high and the prior close, 0.5% apart, average too.
    const t = gannFirstTarget({ ...base, last: 97.2, sessionHigh: 98.4, sessionLow: 95, prevClose: 98.9, intradayAtr: 0.2 });
    expect(t).toBeCloseTo((98.4 + 98.9) / 2, 6);
  });

  it("keeps the nearest when nothing ahead pays the risk, so the card can say no trade", () => {
    expect(gannFirstTarget({ ...base, sessionHigh: 483, risk: 10 })).toBe(483);
  });

  it("picks the nearest of several levels", () => {
    const t = gannFirstTarget({ ...base, last: 97.2, sessionHigh: 98.4, sessionLow: 95, prevClose: 99.9, intradayAtr: 0.2 });
    expect(t).toBe(98.4);
  });

  it("mirrors for a move down: the old bottom, or a figure just above", () => {
    expect(gannFirstTarget({ ...base, direction: "down", last: 480, sessionHigh: 490, sessionLow: 477, prevClose: 489 })).toBe(477);
    const t = gannFirstTarget({
      direction: "down",
      last: 102.6,
      sessionHigh: 105,
      sessionLow: 102.55,
      prevClose: 104,
      dailyAtr: 3,
      intradayAtr: 0.2,
    });
    expect(t).toBeCloseTo(shortOfFigure(100, "above"), 6);
  });

  it("reads an old level from the session's swings or the daily chart when it is the nearest", () => {
    // 481.6 is a swing top of the session or a 3-Day Chart top: nearer than any figure.
    expect(gannFirstTarget({ ...base, oldLevels: [478, 481.6, 490] })).toBe(481.6);
    // Levels behind the price, or inside the noise, still name nothing.
    expect(gannFirstTarget({ ...base, oldLevels: [478, 480.1] })).toBeNull();
    expect(gannFirstTarget({ ...base, direction: "down", sessionLow: 479.95, prevClose: 490, oldLevels: [476.4, 483] })).toBe(476.4);
  });

  it("does not turn a risk multiple into a target: with no level ahead, there is none", () => {
    const alert = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts.find((a) => a.type === "trend_continuation")!;
    const risk = Math.abs(alert.move.current - (alert.invalidation ?? alert.move.current));
    expect(alert.continuationPlan.firstTarget).not.toBeCloseTo(alert.move.current + risk * 2, 6);
  });

  // Review of #461: the continuation plan carries the master the levels give.
  it("carries the next level beyond the first target as the alert's MTP", () => {
    const alert = scanIntraday([input({ dailyAtr: 60 })], DEFAULT_CONFIG, AT_1133).alerts.find((a) => a.type === "trend_continuation")!;
    const tp1 = alert.continuationPlan.firstTarget!;
    expect(tp1).toBeCloseTo(shortOfFigure(525, "below"), 6);
    expect(alert.continuationPlan.masterTarget).toBe(Math.round(shortOfFigure(550, "below") * 100) / 100);
  });
});

describe("Gann's hourly chart (Master Course Ch. 13)", () => {
  // Five-minute bars over three prior sessions, rolled into hours that climb
  // three hours and give back one: rising swings, an up trend.
  function recentFiveMinute(sign = 1): Bar[] {
    const out: Bar[] = [];
    let price = 480;
    const pattern = [1, 1, 1, -0.8];
    let k = 0;
    for (let d = 3; d >= 1; d--) {
      const day = Date.parse("2026-08-07T13:30:00Z") - d * 86_400_000;
      for (let m = 0; m < 390; m += 5) {
        if (m % 60 === 0) price += sign * pattern[k++ % pattern.length];
        const t = new Date(day + m * 60_000).toISOString();
        out.push({ t, o: price, h: price + 0.2, l: price - 0.2, c: price, v: 10_000 });
      }
    }
    return out;
  }

  it("reads the swing chart on hourly roll-ups of recent sessions", () => {
    const m = sessionMetrics(input({ recentBars: recentFiveMinute() }))!;
    expect(m.hourly?.trend).toBe("up");
    expect(sessionMetrics(input({ recentBars: recentFiveMinute(-1) }))!.hourly?.trend).toBe("down");
  });

  it("is absent without recent bars, and its factor is left out rather than failed", () => {
    expect(sessionMetrics(input())!.hourly).toBeNull();
    const without = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts.flatMap((a) => a.confidenceFactors.map((f) => f.label));
    expect(without).not.toContain("The hourly chart agrees");
  });

  it("alerts on the hourly chart's first change in trend (Ch. 13)", () => {
    // Three falling sessions (from 479, the only completed hourly top), then
    // today's hours: 477, 476, and 482, which crosses that top on the latest hour.
    const recent = recentFiveMinute(-1);
    const open = Date.parse("2026-08-07T13:30:00Z");
    const hourPrice = [477, 476, 482];
    for (let m = 0; m < 105; m += 5) {
      const price = hourPrice[Math.min(2, Math.floor((m + 30) / 60))];
      recent.push({ t: new Date(open + m * 60_000).toISOString(), o: price, h: price + 0.2, l: price - 0.2, c: price, v: 10_000 });
    }
    const m = sessionMetrics(input({ recentBars: recent }))!;
    const alerts = scanIntraday([input({ recentBars: recent })], DEFAULT_CONFIG, AT_1133).alerts;
    const turn = alerts.find((a) => a.type === "hourly_turn");
    expect(m.hourly?.turned).toBe(true);
    expect(turn?.direction).toBe(m.hourly?.trend);
    // No turn on the latest hour, no alert.
    expect(scanIntraday([input({ recentBars: recentFiveMinute() })], DEFAULT_CONFIG, AT_1133).alerts.map((a) => a.type)).not.toContain("hourly_turn");
  });

  it("adds the hourly factor to an alert when the history is there", () => {
    const alerts = scanIntraday([input({ recentBars: recentFiveMinute() })], DEFAULT_CONFIG, AT_1133).alerts;
    const withTrend = alerts.filter((a) => a.type === "old_level_cross" || a.type === "trend_continuation");
    expect(withTrend.length).toBeGreaterThan(0);
    for (const a of withTrend) {
      const f = a.confidenceFactors.find((x) => x.label === "The hourly chart agrees");
      expect(f?.passed).toBe(a.direction === "up");
    }
  });
});

describe("gannOldLevels", () => {
  const day = (i: number, h: number, l: number): Bar => ({
    t: new Date(Date.parse("2026-07-01T20:00:00Z") + i * 86_400_000).toISOString(),
    o: (h + l) / 2,
    h,
    l,
    c: (h + l) / 2,
    v: 1_000_000,
  });

  it("returns the prior session's high and low and the 3-Day Chart's swings", () => {
    // Up three days to 110, down three to 100, up three to 106, then one day.
    const highs = [102, 106, 110, 108, 105, 102, 103, 104, 106, 105.5];
    const daily = highs.map((h, i) => day(i, h, h - 2));
    const levels = gannOldLevels([], daily);
    expect(levels).toContain(105.5); // prior session's high
    expect(levels).toContain(103.5); // prior session's low
    expect(levels).toContain(110); // the 3-Day Chart's swing top
    expect(levels).toContain(100); // and its swing bottom
  });

  it("returns the session's own completed swings", () => {
    const session = [
      bar(0, 500, 500.5, 499.5, 500),
      bar(1, 500, 501, 500, 501),
      bar(2, 501, 502, 501, 502),
      bar(3, 502, 503, 502, 503),
      bar(4, 503, 503, 501.5, 502),
      bar(5, 502, 502.5, 500.8, 501),
      bar(6, 501, 501.5, 500.2, 500.5),
      bar(7, 500.5, 502, 500.5, 501.8),
    ];
    expect(gannOldLevels(session, undefined)).toContain(503);
  });

  it("is empty without bars", () => {
    expect(gannOldLevels([], undefined)).toEqual([]);
  });
});

describe("isThroughInvalidation", () => {
  const move = (current: number) => ({ basis: "prevClose", reference: 100, current, absolute: 0, percent: 0, direction: "up" }) as never;
  it("retires an up alert at or under its exit, and a down alert at or over it", () => {
    expect(isThroughInvalidation({ direction: "up", invalidation: 101, move: move(100.5) })).toBe(true);
    expect(isThroughInvalidation({ direction: "up", invalidation: 101, move: move(102) })).toBe(false);
    expect(isThroughInvalidation({ direction: "down", invalidation: 101, move: move(101) })).toBe(true);
    expect(isThroughInvalidation({ direction: "down", invalidation: 101, move: move(100) })).toBe(false);
  });
  it("keeps an alert with no exit defined", () => {
    expect(isThroughInvalidation({ direction: "up", invalidation: null, move: move(50) })).toBe(false);
  });
});

describe("gannMasterTarget", () => {
  const base = {
    direction: "up" as const,
    last: 480,
    sessionHigh: 480.05,
    sessionLow: 470,
    prevClose: 471,
    dailyAtr: 6,
    intradayAtr: 0.3,
  };

  // Levels more than 1% apart, so none is averaged into another (M-P4).
  it("names the next old level beyond the first target", () => {
    expect(gannMasterTarget({ ...base, firstTarget: 483, oldLevels: [483, 488, 494] })).toBe(488);
  });

  it("skips a level too close to the first target to be a different one", () => {
    expect(gannMasterTarget({ ...base, firstTarget: 483, oldLevels: [483.1, 489] })).toBe(489);
  });

  // Review of #461: TP1 averages 482.6 and 483.4 into one resistance at 483, so
  // the master is never 483.4, a level already inside TP1.
  it("never names a level averaged into the first target", () => {
    const levels = { ...base, oldLevels: [482.6, 483.4] };
    const tp1 = gannFirstTarget(levels);
    expect(tp1).toBeCloseTo(483, 9);
    expect(gannMasterTarget({ ...levels, firstTarget: tp1 })).not.toBeCloseTo(483.4, 6);
    const withNext = { ...base, oldLevels: [482.6, 483.4, 489] };
    expect(gannMasterTarget({ ...withNext, firstTarget: gannFirstTarget(withNext) })).toBe(489);
  });

  it("mirrors for a short", () => {
    expect(
      gannMasterTarget({ ...base, direction: "down", last: 480, sessionHigh: 482, sessionLow: 479.95, prevClose: 485, firstTarget: 476, oldLevels: [476, 470.5] }),
    ).toBe(470.5);
  });

  it("is null with no first target, or with nothing beyond it", () => {
    expect(gannMasterTarget({ ...base, firstTarget: null, oldLevels: [490] })).toBeNull();
    expect(gannMasterTarget({ ...base, last: 497.2, sessionHigh: 497.25, sessionLow: 495, prevClose: 496, dailyAtr: 0.5, firstTarget: 497.6, oldLevels: [] })).toBeNull();
  });
});


describe("a symbol the scan could not read gets an audit row saying why (AIZ, 2026-10-28)", () => {
  it("names an empty delayed feed apart from a failed read", () => {
    const quiet = unreadAudit("AIZ", "equity", "no_bars", false);
    expect(quiet.outcome).toBe("insufficient_data");
    expect(quiet.reason).toMatch(/No trades on the delayed feed yet this session/);
    expect(quiet.checks).toEqual([]);
    const failed = unreadAudit("AIZ", "equity", "read_failed", false);
    expect(failed.reason).toMatch(/failed or timed out/);
    expect(unreadAudit("AIZ", "equity", "no_bars", true).reason).toMatch(/last session/);
    expect(unreadAudit("BTC/USD", "crypto", "no_bars", false).reason).not.toMatch(/delayed feed/);
  });
});
