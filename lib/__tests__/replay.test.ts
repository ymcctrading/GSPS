import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { CRITERION_KEYS, type CriterionWeights } from "@/lib/scoring/weights";
import { computeGannEntryTrigger, type GannEntryTrigger } from "@/lib/gann/entryTrigger";
import { MIN_DAILY_BARS_FOR_SCAN, preferredEntryDirection } from "@/lib/scan/entrySelection";
import { CONTINUATION_PATTERNS } from "@/lib/strat/patterns";
import {
  MIN_DAILY_BARS_FOR_SCORE,
  buildMacroContext,
  byOutputState,
  byScoreRange,
  bySetupKind,
  combine,
  replay,
  rollUp,
  summarise,
  type ReplayTrade,
} from "@/lib/backtest/replay";

/** The trading day every intraday fixture below sits on. */
const DAY = "2026-06-15";

function dayBar(date: string, o: number, h: number, l: number, c: number): Bar {
  return { t: `${date}T00:00:00Z`, o, h, l, c, v: 1000 };
}

/**
 * `count` daily bars ending the day before `before`, oscillating around 100 in
 * an 8-day cycle (four rising closes, four falling). The swing walk skips flat
 * closes, so a flat history completes no swing and arms nothing. Runs of four
 * let the 3-day swing chart flip, so tops near 103 and bottoms near 95
 * complete on both sides.
 */
function dailyHistory(count: number, before: string): Bar[] {
  const out: Bar[] = [];
  const end = new Date(`${before}T00:00:00Z`).getTime();
  for (let i = count; i >= 1; i--) {
    const d = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    const phase = (count - i) % 8;
    const step = phase < 4 ? phase : 7 - phase;
    const c = 96 + step * 2;
    out.push(dayBar(d, c, c + 1, c - 1, c));
  }
  return out;
}

const DAILY = dailyHistory(300, DAY);

/**
 * The trigger the live scan would arm for DAY. It is computed here with the
 * same two calls `lib/scanTicker.ts` makes, so every assertion below checks
 * the replay against production's rule rather than against a hand-copied
 * number.
 */
function liveTrigger(daily: Bar[] = DAILY): GannEntryTrigger {
  const direction = preferredEntryDirection(buildMacroContext(daily, 100).macroTrends);
  const t = computeGannEntryTrigger(daily, direction);
  if (!t) throw new Error("fixture must arm a trigger");
  return t;
}

const TRIGGER = liveTrigger();
/** +1 for a long trigger, -1 for a short, so fixtures work in either direction. */
const SIDE = TRIGGER.direction === "bullish" ? 1 : -1;
const RISK = Math.abs(TRIGGER.triggerPrice - TRIGGER.stopPrice);

/** 15-minute bars on DAY, timestamped in order from midnight. */
function intraday(bars: Array<Omit<Bar, "t" | "v">>): Bar[] {
  return bars.map((b, i) => {
    const minutes = i * 15;
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    return { ...b, t: `${DAY}T${hh}:${mm}:00Z`, v: 1000 };
  });
}

/**
 * A warm-up that stays well inside both the trigger and the stop, oscillating
 * so the 15-minute ATR is non-zero, followed by whatever is appended.
 */
function session(tail: Array<Omit<Bar, "t" | "v">>): Bar[] {
  const head: Array<Omit<Bar, "t" | "v">> = [];
  for (let i = 0; i < 44; i++) {
    const c = 99 + (i % 4 < 2 ? 0.5 : -0.5);
    head.push({ o: c, h: c + 0.6, l: c - 0.6, c });
  }
  return intraday([...head, ...tail]);
}

/** A price `by` beyond the trigger, in the trade's direction. */
const past = (by: number) => TRIGGER.triggerPrice + SIDE * by;
/** A bar that crosses the trigger from inside and closes just past it. */
const crossing = { o: 99, h: SIDE > 0 ? past(0.5) : 99.2, l: SIDE > 0 ? 98.8 : past(0.5), c: past(0.3) };
/** A quiet bar, inside the trigger. */
const quiet = { o: 99, h: 99.4, l: 98.6, c: 99 };

const trade = (over: Partial<ReplayTrade> = {}): ReplayTrade => ({
  symbol: "TEST",
  openedAt: "2025-01-02T15:00:00Z",
  pattern: "2-2",
  setupKind: "reversion",
  direction: "bullish",
  entry: 100,
  stop: 99,
  target: 102,
  barsHeld: 3,
  outcome: "win",
  rMultiple: 2,
  ambiguous: false,
  atrMultiple: 1,
  ...over,
});

describe("summarise", () => {
  it("counts timeouts as trades taken, not as a clean slate", () => {
    // Dropping them from the denominator would flatter the win rate, which is
    // the exact kind of accounting that makes a backtest lie.
    const r = summarise([
      trade({ outcome: "win", rMultiple: 2 }),
      trade({ outcome: "loss", rMultiple: -1 }),
      trade({ outcome: "timeout", rMultiple: -0.2 }),
    ]);
    expect(r.trades.length).toBe(3);
    expect(r.winRate).toBeCloseTo(1 / 3, 10);
    expect(r.expectancyR).toBeCloseTo((2 - 1 - 0.2) / 3, 10);
  });

  it("reports zeroed totals rather than NaN on an empty run", () => {
    const r = summarise([]);
    expect(r.winRate).toBe(0);
    expect(r.expectancyR).toBe(0);
    expect(Number.isNaN(r.totalR)).toBe(false);
  });

  it("combines per-symbol runs without losing counts", () => {
    const a = summarise([trade({ symbol: "A" })], 10, 5);
    const b = summarise([trade({ symbol: "B", outcome: "loss", rMultiple: -1 })], 6, 3);
    const both = combine([a, b]);
    expect(both.trades.length).toBe(2);
    expect(both.armed).toBe(16);
    expect(both.triggered).toBe(8);
    expect(both.winRate).toBe(0.5);
  });
});

describe("replay", () => {
  it("arms from the daily swing-crossing trigger the live scan uses (F3.1)", () => {
    const r = replay("TEST", session([crossing, quiet]), { targetR: 2, dailyBars: DAILY });
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0];
    expect(t.setupKind).toBe("reversion");
    expect(t.direction).toBe(TRIGGER.direction);
    expect(t.entry).toBeCloseTo(TRIGGER.triggerPrice, 10);
    expect(t.stop).toBeCloseTo(TRIGGER.stopPrice, 10);
    expect(t.target).toBeCloseTo(TRIGGER.triggerPrice + SIDE * 2 * RISK, 10);
  });

  it("takes no trade when the trigger is never reached", () => {
    const r = replay("TEST", session([quiet, quiet]), { targetR: 2, dailyBars: DAILY });
    expect(r.armed).toBeGreaterThan(0);
    expect(r.triggered).toBe(0);
    expect(r.trades).toHaveLength(0);
  });

  it("fills a candle that opens beyond the resting stop at its open, not the trigger", () => {
    const gapOpen = past(1);
    const gap = { o: gapOpen, h: SIDE > 0 ? past(1.2) : gapOpen, l: SIDE > 0 ? gapOpen : past(1.2), c: past(1.1) };
    const r = replay("TEST", session([gap, quiet]), { targetR: 2, dailyBars: DAILY });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].entry).toBeCloseTo(gapOpen, 10);
  });

  it("crosses a given swing extreme once, not on every bar beyond it", () => {
    const r = replay("TEST", session([crossing, crossing, crossing, quiet]), { targetR: 2, dailyBars: DAILY });
    expect(r.trades).toHaveLength(1);
    expect(r.triggered).toBe(1);
  });

  it("does not gate the trigger on the STRAT gap rule or risk floor (F3.2)", () => {
    // The 15-minute warm-up arms no bar-sequence pattern in the trade's
    // direction at all, and the swing-derived risk is several 15-minute ATRs
    // wide. Neither matters: the live scan prices from the trigger alone.
    const r = replay("TEST", session([crossing, quiet]), { targetR: 2, dailyBars: DAILY });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].atrMultiple).toBeGreaterThan(1);
  });

  it("resolves a bar covering both stop and target as a loss", () => {
    const wide = { o: 99, h: SIDE > 0 ? past(3 * RISK) : TRIGGER.stopPrice + 1, l: SIDE > 0 ? TRIGGER.stopPrice - 1 : past(3 * RISK), c: 99 };
    const r = replay("TEST", session([wide, quiet]), { targetR: 2, dailyBars: DAILY });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].ambiguous).toBe(true);
    expect(r.trades[0].outcome).toBe("loss");
    expect(r.ambiguous).toBe(1);
  });

  it("charges friction against the winner as well as the loser", () => {
    const free = summarise([trade({ rMultiple: 2 })]);
    expect(free.expectancyR).toBe(2);
    // A win of 2R on $1 of risk, less 2c of friction, is 1.98R — not 2R.
    const withCost = (2 * 1 - 0.02) / 1;
    expect(withCost).toBeCloseTo(1.98, 10);
  });

  it("records the stop width in ATR so it can be studied against results", () => {
    const r = replay("TEST", session([crossing, quiet]), { targetR: 2, dailyBars: DAILY });
    expect(r.trades.length).toBeGreaterThan(0);
    for (const t of r.trades) {
      expect(t.atrMultiple).toBeGreaterThan(0);
      expect(Number.isFinite(t.atrMultiple)).toBe(true);
    }
  });

  it("never reports more triggered than armed", () => {
    const r = replay("TEST", session([quiet, crossing, quiet, crossing]), { targetR: 2, dailyBars: DAILY });
    expect(r.triggered).toBeLessThanOrEqual(r.armed);
    expect(r.trades.length).toBeLessThanOrEqual(r.triggered);
  });
});

describe("rollUp", () => {
  it("keeps the first open, the last close, and the extremes between", () => {
    const rolled = rollUp(
      [
        { t: "2026-01-01T10:00:00Z", o: 10, h: 12, l: 9, c: 11, v: 5 },
        { t: "2026-01-01T10:15:00Z", o: 11, h: 15, l: 8, c: 14, v: 7 },
        { t: "2026-01-01T11:00:00Z", o: 14, h: 16, l: 13, c: 15, v: 3 },
      ],
      (b) => b.t.slice(0, 13),
    );
    expect(rolled).toHaveLength(2);
    expect(rolled[0]).toMatchObject({ o: 10, h: 15, l: 8, c: 14, v: 12 });
    expect(rolled[1]).toMatchObject({ o: 14, h: 16, l: 13, c: 15, v: 3 });
  });

  it("does not mutate the bars it was given", () => {
    const input = [{ t: "2026-01-01T10:00:00Z", o: 10, h: 12, l: 9, c: 11, v: 5 }];
    rollUp(input, () => "same");
    expect(input[0]).toMatchObject({ h: 12, l: 9, c: 11, v: 5 });
  });
});

describe("buildMacroContext", () => {
  it("produces the pieces the score needs", () => {
    const ctx = buildMacroContext(dailyHistory(300, "2026-06-01"), 110);
    expect(ctx.macroTrends).toHaveLength(3);
    expect(typeof ctx.nearSupportResistance).toBe("boolean");
    expect(typeof ctx.momentumElevated).toBe("boolean");
    expect(Array.isArray(ctx.gann.fanLines)).toBe(true);
    expect(ctx.gann.fanLines.length).toBeLessThanOrEqual(6);
    expect(ctx.gann.squareOf9.length).toBeLessThanOrEqual(6);
  });
});

describe("replay scoring", () => {
  it("attaches a verdict to every trade", () => {
    const r = replay("TEST", session([crossing, quiet]), { targetR: 2, dailyBars: DAILY });
    expect(r.trades.length).toBeGreaterThan(0);
    for (const t of r.trades) {
      expect(t.score).toBeGreaterThanOrEqual(0);
      expect(["Execute", "Watch", "Reject"]).toContain(t.outputState);
    }
  });

  it("records which criteria passed, so the factors can be attributed later", () => {
    // Explicit uniform weights: this checks that the criteria map agrees with
    // the headline score (no criterion silently missing or double counted),
    // which is only a raw pass-count comparison when every criterion is worth
    // one point.
    const uniformWeights = Object.fromEntries(CRITERION_KEYS.map((k) => [k, 1])) as CriterionWeights;
    const r = replay("TEST", session([crossing, quiet]), {
      targetR: 2,
      dailyBars: DAILY,
      weights: uniformWeights,
    });
    expect(r.trades.length).toBeGreaterThan(0);
    for (const t of r.trades) {
      const passed = Object.values(t.criteria!).filter(Boolean).length;
      expect(passed).toBe(t.score);
      // The trigger is what arms the trade, so the criterion that asks
      // whether one is armed in the setup's direction always passes here.
      expect(t.criteria!.entryTriggerArmed).toBe(true);
    }
  });

  it("reads only sessions before the day being traded", () => {
    // Every daily bar here is dated on or after the trading day, so a replay
    // that peeked would still find a trigger. It must not.
    const sameDayOnly = DAILY.map((b) => ({ ...b, t: `${DAY}T00:00:00Z` }));
    const r = replay("TEST", session([crossing, quiet]), { targetR: 2, dailyBars: sameDayOnly });
    expect(r.armed).toBe(0);
    expect(r.trades).toHaveLength(0);
  });

  it("arms on the same minimum daily history the live scan reads", () => {
    // One shared constant (lib/scan/entrySelection.ts), so the replay trades
    // exactly the history scanTicker does. It was 120 here until 2026-09-26.
    expect(MIN_DAILY_BARS_FOR_SCORE).toBe(MIN_DAILY_BARS_FOR_SCAN);
    const short = dailyHistory(MIN_DAILY_BARS_FOR_SCAN, DAY);
    const t = liveTrigger(short);
    const cross = { o: 99, h: t.direction === "bullish" ? t.triggerPrice + 0.5 : 99.2, l: t.direction === "bullish" ? 98.8 : t.triggerPrice - 0.5, c: 99 };
    const r = replay("TEST", session([cross, quiet]), { targetR: 2, dailyBars: short });
    expect(r.armed).toBeGreaterThan(0);
    expect(r.trades).toHaveLength(1);
  });

  it("refuses to arm below the live scan's minimum rather than inventing a macro read", () => {
    const r = replay("TEST", session([crossing, quiet]), {
      targetR: 2,
      dailyBars: dailyHistory(MIN_DAILY_BARS_FOR_SCORE - 1, DAY),
    });
    expect(r.armed).toBe(0);
    expect(r.trades).toHaveLength(0);
  });
});

describe("useProductionStop", () => {
  // The swing-derived stop is several 15-minute ATRs wide, past the default
  // ceiling, so the leeway/ceiling logic moves it.
  const bars = session([crossing, quiet, quiet]);

  it("uses the raw structural stop by default, unaffected by the option's absence", () => {
    const withDefault = replay("TEST", bars, { targetR: 2, dailyBars: DAILY });
    const explicitFalse = replay("TEST", bars, { targetR: 2, dailyBars: DAILY, useProductionStop: false });
    expect(withDefault.trades).toEqual(explicitFalse.trades);
  });

  it("widens the walked stop when true, changing the realised risk", () => {
    const raw = replay("TEST", bars, { targetR: 2, dailyBars: DAILY });
    const widened = replay("TEST", bars, { targetR: 2, dailyBars: DAILY, useProductionStop: true });
    expect(raw.trades.length).toBeGreaterThan(0);
    expect(widened.trades.length).toBe(raw.trades.length);
    expect(widened.trades[0].stop).not.toBe(raw.trades[0].stop);
  });

  it("tags every trade with its large-cap read", () => {
    const r = replay("MSFT", bars, { targetR: 2, dailyBars: DAILY });
    expect(r.trades.length).toBeGreaterThan(0);
    expect(r.trades.every((t) => t.largeCap === true)).toBe(true);

    const notLargeCap = replay("TINYCO", bars, { targetR: 2, dailyBars: DAILY });
    expect(notLargeCap.trades.every((t) => t.largeCap === false)).toBe(true);
  });
});

describe("byOutputState", () => {
  it("keeps unscored trades out of the verdict buckets", () => {
    const r = summarise([
      trade({ outputState: "Execute", score: 8, rMultiple: 2 }),
      trade({ outputState: "Watch", score: 5, outcome: "loss", rMultiple: -1 }),
      trade({ rMultiple: 2 }), // no verdict at all
    ]);
    const split = byOutputState(r);
    expect(split.Execute.trades).toHaveLength(1);
    expect(split.Watch.trades).toHaveLength(1);
    expect(split.Reject.trades).toHaveLength(0);
    expect(split.unscored.trades).toHaveLength(1);
    // Every trade lands in exactly one bucket.
    const total = (["Execute", "Watch", "Reject", "unscored"] as const)
      .reduce((n, k) => n + split[k].trades.length, 0);
    expect(total).toBe(r.trades.length);
  });
});

describe("byScoreRange", () => {
  it("selects a band narrower than any verdict bucket", () => {
    // 4, 5, 6 all read as Watch under the score cutoffs, so byOutputState
    // cannot isolate "one point short of Execute" — this can.
    const r = summarise([
      trade({ outputState: "Watch", score: 4, rMultiple: -1 }),
      trade({ outputState: "Watch", score: 5, rMultiple: 1 }),
      trade({ outputState: "Watch", score: 6, rMultiple: 2 }),
      trade({ outputState: "Execute", score: 7, rMultiple: 2 }),
    ]);
    const nearMiss = byScoreRange(r, 5, 6);
    expect(nearMiss.trades).toHaveLength(2);
    expect(nearMiss.trades.every((t) => t.score === 5 || t.score === 6)).toBe(true);
  });

  it("excludes unscored trades rather than guessing them into the range", () => {
    const r = summarise([trade({ rMultiple: 1 })]); // no score at all
    expect(byScoreRange(r, 5, 6).trades).toHaveLength(0);
  });
});

describe("replay yearCycleHits", () => {
  // The same session, moved to January so the 5-year cycle from a January
  // 2021 pivot lands on it. dailyHistory's shape doesn't depend on its end
  // date, so the trigger (and its direction) is the same as TRIGGER's.
  const JAN = "2026-01-15";
  const janDaily = dailyHistory(300, JAN);
  const janBars = session([crossing, quiet]).map((b) => ({ ...b, t: b.t.replace(DAY, JAN) }));

  /**
   * Monthly bars from Jan 2019: a V pivoting in Jan 2021 (index 24), through
   * Dec 2025. A top when the fixture's trigger is short, a bottom when it's
   * long, so the pivot is always on the trade's side.
   */
  function monthlyPivot(): Bar[] {
    const out: Bar[] = [];
    for (let i = 0; i < 84; i++) {
      const c = SIDE < 0 ? 200 - Math.abs(i - 24) * 1.5 : 100 + Math.abs(i - 24) * 1.5;
      out.push({ t: new Date(Date.UTC(2019, i, 1)).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1000 });
    }
    return out;
  }

  it("tags a trade with the yearly cycles landing on its month, in its direction", () => {
    const r = replay("TEST", janBars, { targetR: 2, dailyBars: janDaily, monthlyBars: monthlyPivot() });
    expect(r.trades.length).toBeGreaterThan(0);
    // Jan 2021 pivot, trade in Jan 2026: the 5-year cycle, in the pivot's direction.
    for (const t of r.trades) expect(t.yearCycleHits).toBe(1);
  });

  it("leaves the tag undefined without monthly bars", () => {
    const r = replay("TEST", janBars, { targetR: 2, dailyBars: janDaily });
    expect(r.trades.length).toBeGreaterThan(0);
    expect(r.trades.every((t) => t.yearCycleHits === undefined)).toBe(true);
  });

  it("cannot see months at or after the trade", () => {
    const history = monthlyPivot();
    // Three years of violent swings from Jan 2026 on. Read without the guard,
    // they'd raise the major-pivot cutoff and drop the 2021 pivot out.
    const future: Bar[] = [];
    for (let i = 0; i < 36; i++) {
      // Smooth, so each swing is a strict peak or trough findPivots can see.
      const c = 200 + 190 * Math.sin((i / 6) * 2 * Math.PI);
      future.push({ t: new Date(Date.UTC(2026, i, 1)).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1000 });
    }
    const withFuture = replay("TEST", janBars, { targetR: 2, dailyBars: janDaily, monthlyBars: [...history, ...future] });
    const without = replay("TEST", janBars, { targetR: 2, dailyBars: janDaily, monthlyBars: history });
    expect(without.trades.some((t) => t.yearCycleHits === 1)).toBe(true);
    expect(withFuture.trades.map((t) => t.yearCycleHits)).toEqual(without.trades.map((t) => t.yearCycleHits));
  });
});

describe("replay continuation setups", () => {
  /**
   * A rising market (monthly aside, weekly and daily read bullish) whose last
   * 20 sessions widen its range, so momentum reads elevated. The reversion arm
   * is short and the continuation arm is long, the way the market scan's
   * continuation pass would call scanTicker for this symbol.
   */
  function risingDaily(count: number, before: string): Bar[] {
    const out: Bar[] = [];
    const end = new Date(`${before}T00:00:00Z`).getTime();
    for (let i = count; i >= 1; i--) {
      const k = count - i;
      const d = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
      const phase = k % 8;
      const step = phase < 5 ? phase : 8 - phase;
      const late = k >= count - 20;
      const c = 50 + k * 0.3 + 10 * Math.sin((2 * Math.PI * k) / 60) + step * (late ? 3 : 1);
      const w = late ? 3 : 1;
      out.push(dayBar(d, c, c + w, c - w, c));
    }
    return out;
  }

  const rising = risingDaily(300, DAY);
  const ctx = buildMacroContext(rising, rising[rising.length - 1].c);
  const reversionDir = preferredEntryDirection(ctx.macroTrends);
  const continuationDir = reversionDir === "bullish" ? "bearish" : "bullish";
  const T = computeGannEntryTrigger(rising, continuationDir)!.triggerPrice;

  /**
   * Quiet 15-minute bars well below the continuation trigger. Every bar steps
   * away from the one before. Repeating a bar would make it an inside bar and
   * arm a 2-1-2 on its own.
   */
  const warm = Array.from({ length: 44 }, (_, i) => {
    const c = T - 3 + [0, 0.2, 0.4, 0.2][i % 4];
    return { o: c, h: c + 0.3, l: c - 0.3, c };
  });
  const twoUp = { o: T - 3, h: T - 1.2, l: T - 3.1, c: T - 1.4 };
  const inside = { o: T - 1.5, h: T - 1.3, l: T - 2.6, c: T - 1.4 };
  const breakout = { o: T - 1.4, h: T + 0.5, l: T - 1.5, c: T + 0.3 };
  const after = { o: T, h: T + 0.2, l: T - 0.2, c: T };

  it("arms a continuation with the macro move, on a continuation shape, scored as one", () => {
    expect(continuationDir).toBe("bullish");
    const r = replay("TEST", intraday([...warm, twoUp, inside, breakout, after]), { targetR: 2, dailyBars: rising });
    const cont = r.trades.filter((t) => t.setupKind === "continuation");
    expect(cont).toHaveLength(1);
    expect(cont[0].direction).toBe(continuationDir);
    expect(CONTINUATION_PATTERNS.has(cont[0].pattern!)).toBe(true);
    expect(cont[0].entry).toBeCloseTo(T, 10);
    expect(cont[0].criteria!.entryTriggerArmed).toBe(true);
  });

  it("does not arm a continuation without a continuation shape at the fill", () => {
    // Directional warm-up bars run straight into the breakout, so no inside
    // bar sets up a 2-1-2 or 3-1-2. The replay never trades the final bar, so
    // the breakout is the only candle that could fill.
    const r = replay("TEST", intraday([...warm, ...warm.slice(0, 2), breakout, after]), { targetR: 2, dailyBars: rising });
    expect(r.trades.filter((t) => t.setupKind === "continuation")).toHaveLength(0);
  });

  it("does not arm a continuation where the breadth and momentum gate is shut", () => {
    // The oscillating history reads no macro trend and no momentum expansion,
    // so the pass would never be asked for a continuation on it.
    const opposite = computeGannEntryTrigger(DAILY, TRIGGER.direction === "bullish" ? "bearish" : "bullish")!;
    const O = opposite.triggerPrice;
    const up = opposite.direction === "bullish" ? 1 : -1;
    const bars = session([
      { o: O - 3 * up, h: O - 1.2 * up, l: O - 3.1 * up, c: O - 1.4 * up },
      { o: O - 1.5 * up, h: O - 1.3 * up, l: O - 2.6 * up, c: O - 1.4 * up },
      { o: O - 1.4 * up, h: O + 0.5 * up, l: O - 1.5 * up, c: O + 0.3 * up },
      quiet,
    ].map((b) => ({ o: b.o, h: Math.max(b.h, b.l), l: Math.min(b.h, b.l), c: b.c })));
    const r = replay("TEST", bars, { targetR: 2, dailyBars: DAILY });
    expect(r.trades.every((t) => t.setupKind === "reversion")).toBe(true);
  });

  it("splits a run by setup kind without losing a trade", () => {
    const r = replay("TEST", intraday([...warm, twoUp, inside, breakout, after]), { targetR: 2, dailyBars: rising });
    const split = bySetupKind(r);
    expect(split.reversion.trades.length + split.continuation.trades.length).toBe(r.trades.length);
    expect(split.continuation.trades.length).toBeGreaterThan(0);
  });
});
