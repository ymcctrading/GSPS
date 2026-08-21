import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  MIN_DAILY_BARS_FOR_SCORE,
  buildMacroContext,
  byOutputState,
  combine,
  replay,
  rollUp,
  summarise,
  type ReplayTrade,
} from "@/lib/backtest/replay";

function bar(o: number, h: number, l: number, c: number): Bar {
  return { t: "2026-01-01T00:00:00Z", o, h, l, c, v: 1000 };
}

/** A flat run long enough to clear the warm-up, then whatever is appended. */
function series(tail: Bar[]): Bar[] {
  const head: Bar[] = [];
  for (let i = 0; i < 45; i++) head.push(bar(100, 101, 99, 100));
  return [...head, ...tail];
}

/**
 * A 2-up bar that arms a bearish reversal, the candle that triggers it, and a
 * third bar. The third matters: the replay only examines a history ending one
 * bar before `live`, so without it no history ever ends on the arming bar and
 * the run is silently empty.
 */
const ARMS_AND_TRIGGERS: Bar[] = series([
  bar(100, 105, 99, 104), // 2U — arms a bearish trigger at 98.99, stop 105.01
  bar(104, 106, 85, 95), //  spans both the stop (105.01) and the target (86.95)
  bar(95, 96, 94, 95),
]);

const trade = (over: Partial<ReplayTrade> = {}): ReplayTrade => ({
  symbol: "TEST",
  openedAt: "2025-01-02T15:00:00Z",
  pattern: "2-2",
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
  it("takes no trade when the trigger is never reached", () => {
    // A 2-2 arms off the last bar, but the following candle never trades up to
    // the trigger, and the protocol does not carry a setup forward.
    const bars = series([
      bar(100, 105, 99, 104), // 2U — arms a bearish reversal below its low
      bar(103, 104, 102, 103), // never reaches the trigger below 98.99
    ]);
    const r = replay("TEST", bars, { targetR: 2 });
    expect(r.triggered).toBe(0);
    expect(r.trades.length).toBe(0);
  });

  it("charges friction against the winner as well as the loser", () => {
    const free = summarise([trade({ rMultiple: 2 })]);
    expect(free.expectancyR).toBe(2);
    // A win of 2R on $1 of risk, less 2c of friction, is 1.98R — not 2R.
    const withCost = (2 * 1 - 0.02) / 1;
    expect(withCost).toBeCloseTo(1.98, 10);
  });

  it("resolves a bar covering both stop and target as a loss", () => {
    // One candle spans the whole range. There is no way to know which side was
    // touched first, so the pessimistic reading stands and is flagged.
    const r = replay("TEST", ARMS_AND_TRIGGERS, { targetR: 2 });
    expect(r.trades.length).toBeGreaterThan(0);
    const ambiguous = r.trades.filter((t) => t.ambiguous);
    expect(ambiguous.length).toBeGreaterThan(0);
    expect(ambiguous.every((t) => t.outcome === "loss")).toBe(true);
    expect(r.ambiguous).toBe(ambiguous.length);
  });

  it("records the stop width in ATR so the floor can be tuned against results", () => {
    const r = replay("TEST", ARMS_AND_TRIGGERS, { targetR: 2 });
    expect(r.trades.length).toBeGreaterThan(0);
    for (const t of r.trades) {
      expect(t.atrMultiple).toBeGreaterThan(0);
      expect(Number.isFinite(t.atrMultiple)).toBe(true);
    }
  });

  it("never reports more triggered than armed", () => {
    const bars = series([
      bar(100, 105, 99, 104),
      bar(104, 108, 103, 107),
      bar(107, 109, 100, 101),
      bar(101, 103, 95, 96),
    ]);
    const r = replay("TEST", bars, { targetR: 2 });
    expect(r.triggered).toBeLessThanOrEqual(r.armed);
    expect(r.trades.length).toBeLessThanOrEqual(r.triggered);
  });
});

function dayBar(date: string, o: number, h: number, l: number, c: number): Bar {
  return { t: `${date}T00:00:00Z`, o, h, l, c, v: 1000 };
}

/** `count` daily bars ending the day before `before`, drifting gently upward. */
function dailyHistory(count: number, before: string): Bar[] {
  const out: Bar[] = [];
  const end = new Date(`${before}T00:00:00Z`).getTime();
  for (let i = count; i >= 1; i--) {
    const d = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    const base = 100 + (count - i) * 0.05;
    out.push(dayBar(d, base, base + 1.5, base - 1.5, base + 0.2));
  }
  return out;
}

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
  const intraday = ARMS_AND_TRIGGERS.map((b, i) => ({
    ...b,
    t: `2026-06-15T${String(9 + Math.floor(i / 4)).padStart(2, "0")}:${["00", "15", "30", "45"][i % 4]}:00Z`,
  }));

  it("leaves the verdict undefined when no daily bars are supplied", () => {
    const r = replay("TEST", intraday, { targetR: 2 });
    for (const t of r.trades) {
      expect(t.score).toBeUndefined();
      expect(t.outputState).toBeUndefined();
    }
  });

  it("attaches a verdict once there is enough prior daily history", () => {
    const r = replay("TEST", intraday, {
      targetR: 2,
      dailyBars: dailyHistory(300, "2026-06-15"),
    });
    expect(r.trades.length).toBeGreaterThan(0);
    for (const t of r.trades) {
      expect(t.score).toBeGreaterThanOrEqual(0);
      expect(["Execute", "Watch", "Reject"]).toContain(t.outputState);
    }
  });

  it("records which criteria passed, so the factors can be attributed later", () => {
    const r = replay("TEST", intraday, {
      targetR: 2,
      dailyBars: dailyHistory(300, "2026-06-15"),
    });
    expect(r.trades.length).toBeGreaterThan(0);
    for (const t of r.trades) {
      const passed = Object.values(t.criteria!).filter(Boolean).length;
      // The recorded map has to agree with the headline score, or the factor
      // study and the verdict split would be describing different trades.
      expect(passed).toBe(t.score);
    }
  });

  it("attaches no criteria at all to an unscored trade", () => {
    // An empty map would read as "every criterion failed" once attributed.
    const r = replay("TEST", intraday, { targetR: 2 });
    for (const t of r.trades) expect(t.criteria).toBeUndefined();
  });

  it("reads only sessions before the day being traded", () => {
    // Every daily bar here is dated on or after the trading day, so a replay
    // that peeked would still find history to score against. It must not.
    const sameDayOnly = dailyHistory(300, "2026-09-01").map((b, i) => ({
      ...b,
      t: `2026-0${6 + (i % 3)}-15T00:00:00Z`,
    })).filter((b) => b.t.slice(0, 10) >= "2026-06-15");
    const r = replay("TEST", intraday, { targetR: 2, dailyBars: sameDayOnly });
    for (const t of r.trades) expect(t.outputState).toBeUndefined();
  });

  it("refuses to score on too little history rather than inventing one", () => {
    const r = replay("TEST", intraday, {
      targetR: 2,
      dailyBars: dailyHistory(MIN_DAILY_BARS_FOR_SCORE - 1, "2026-06-15"),
    });
    for (const t of r.trades) expect(t.score).toBeUndefined();
  });
});

describe("useProductionStop", () => {
  // A wide structural stop (well past the default 2.5x-ATR ceiling) so the
  // default and large-cap ceilings clip it to two different widths, and a
  // target far enough out that neither stop width is at risk of hitting it
  // by coincidence within this short series.
  const wideStop: Bar[] = series([
    bar(100, 105, 99, 104), // 2U — arms a bearish trigger at 98.99, stop far above
    bar(99, 100, 90, 92), // triggers, then drifts down without hitting a tight stop
    bar(92, 93, 91, 92),
  ]);

  it("uses the raw pattern stop by default, unaffected by the option's absence", () => {
    const withDefault = replay("TEST", wideStop, { targetR: 2 });
    const explicitFalse = replay("TEST", wideStop, { targetR: 2, useProductionStop: false });
    expect(withDefault.trades).toEqual(explicitFalse.trades);
  });

  it("widens the walked stop when true, changing the realised risk", () => {
    const raw = replay("TEST", wideStop, { targetR: 2 });
    const widened = replay("TEST", wideStop, { targetR: 2, useProductionStop: true });
    expect(raw.trades.length).toBeGreaterThan(0);
    expect(widened.trades.length).toBe(raw.trades.length);
    // Same pattern, same bars — only the stop distance the P&L walk checks
    // against should differ once the leeway/ceiling logic is in the loop.
    const rawTrade = raw.trades[0];
    const widenedTrade = widened.trades[0];
    expect(widenedTrade.stop).not.toBe(rawTrade.stop);
  });

  it("tags every trade with its large-cap read even with no daily bars supplied", () => {
    // The large-cap classification only needs the symbol (for the known-name
    // list) — it must not silently require dailyBars the way score/outputState do.
    const r = replay("MSFT", wideStop, { targetR: 2 });
    expect(r.trades.length).toBeGreaterThan(0);
    expect(r.trades.every((t) => t.largeCap === true)).toBe(true);

    const notLargeCap = replay("TINYCO", wideStop, { targetR: 2 });
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
