/**
 * The coarse pass reads the trend as the full scan does (PLAN.md item 6 step 7
 * and review R1, A-TREND-01, W006 p.19): monthly for the main trend when its
 * bars are in, the weekly next, the daily only for fast, active stocks. The trend reads are pinned per
 * timeframe here so the wiring, not the swing charts, is under test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

const dirs: Record<string, "bullish" | "bearish" | "sideways"> = {};
/** Pinned daily support levels, when a test sets them. */
let support: number[] | null = null;
vi.mock("@/lib/analysis/trend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analysis/trend")>();
  return {
    ...actual,
    readTrend: (bars: Bar[], tf: string) => {
      const r = actual.readTrend(bars, tf as never);
      const pinned = tf === "1Day" && support ? { ...r, support } : r;
      return dirs[tf] ? { ...pinned, direction: dirs[tf] } : pinned;
    },
  };
});

const { coarseContinuation, coarseReversion, coarseTrendDirection } = await import("@/lib/marketScan");

/** The extended-downtrend fixture of market-scan-filters, with heavy volume at its last swing low. */
function extendedDowntrend(): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < 120; i++) {
    const c = 150 - i * 0.5 + 6 * Math.sin((i / 12) * 2 * Math.PI) - (i >= 110 ? (i - 109) * 4 : 0);
    bars.push({ t: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(), o: c, h: c * 1.01, l: c * 0.99, c, v: i === 105 ? 4e6 : 1e6 });
  }
  return bars;
}

/** A steady advance, 130 sessions; `widen` widens the last 20 days' range (ATR expansion). */
function advance(widen = false, lastVolume = 2e6): Bar[] {
  const daily: Bar[] = [];
  for (let i = 0; i < 130; i++) {
    const c = 100 + i * 0.4;
    const half = widen && i >= 110 ? 2 : 0.5;
    daily.push({ t: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(), o: c, h: c + half, l: c - half, c, v: i >= 120 ? lastVolume : 2e6 });
  }
  return daily;
}

beforeEach(() => {
  for (const k of Object.keys(dirs)) delete dirs[k];
  support = null;
});

describe("the coarse pass's trend", () => {
  it("is the weekly chart's when it has one, whatever the daily says", () => {
    Object.assign(dirs, { "1Week": "bearish", "1Day": "bullish" });
    expect(coarseTrendDirection(extendedDowntrend())).toBe("bearish");
  });

  it("falls back to the daily only when the weekly shows no trend", () => {
    Object.assign(dirs, { "1Week": "sideways", "1Day": "bullish" });
    expect(coarseTrendDirection(extendedDowntrend())).toBe("bullish");
    Object.assign(dirs, { "1Day": "sideways" });
    expect(coarseTrendDirection(extendedDowntrend())).toBe("sideways");
  });

  it("sets the reversion's direction against the weekly trend, not the daily", () => {
    Object.assign(dirs, { "1Week": "bearish", "1Day": "bullish" });
    expect(coarseReversion("X", extendedDowntrend())?.direction).toBe("bullish");
  });

  it("sets the continuation's direction with the weekly trend, not the daily", () => {
    Object.assign(dirs, { "1Week": "bullish", "1Day": "bearish" });
    expect(coarseContinuation("X", advance(true))?.direction).toBe("bullish");
  });
});

/** Two years of monthly bars; the trend read on them is pinned through `dirs`. */
function monthlyBars(): Bar[] {
  return Array.from({ length: 24 }, (_, i) => {
    const c = 100 + i;
    return { t: new Date(Date.UTC(2024, i, 1)).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1e6 };
  });
}

describe("the coarse pass's main trend (item 6 review R1, A-TREND-01)", () => {
  it("is the monthly chart's when the monthly bars are in, over a weekly and daily against it", () => {
    Object.assign(dirs, { "1Month": "bearish", "1Week": "bullish", "1Day": "bullish" });
    expect(coarseTrendDirection(extendedDowntrend(), monthlyBars())).toBe("bearish");
  });

  it("is the monthly chart's when the weekly is sideways and the daily is against it", () => {
    Object.assign(dirs, { "1Month": "bullish", "1Week": "sideways", "1Day": "bearish" });
    expect(coarseTrendDirection(extendedDowntrend(), monthlyBars())).toBe("bullish");
  });

  it("reads the weekly first, as before, when no monthly bars are in", () => {
    Object.assign(dirs, { "1Month": "bullish", "1Week": "bearish", "1Day": "bearish" });
    expect(coarseTrendDirection(extendedDowntrend(), undefined)).toBe("bearish");
  });

  it("asks a continuation for the monthly chart's side", () => {
    Object.assign(dirs, { "1Month": "bullish", "1Week": "bearish", "1Day": "bearish" });
    const daily = advance(true);
    const read = coarseTrendDirection(daily, monthlyBars());
    expect(coarseContinuation("X", daily, undefined, read)?.direction).toBe("bullish");
  });

  it("admits a symbol with no trend to the reversion pool on its better side, as the full scan arms it", () => {
    Object.assign(dirs, { "1Month": "sideways", "1Week": "sideways", "1Day": "sideways" });
    // Heavy volume at the last swing low: the buy side scores, the sell side does not.
    expect(coarseReversion("X", extendedDowntrend(), undefined, "sideways")?.direction).toBe("bullish");
  });
});

describe("the continuation pool (item 6 step 11, A-TREND-09)", () => {
  /** A steady advance with no range expansion, 80 sessions, and no 4-hour bars at all. */
  function quietAdvance(): Bar[] {
    return Array.from({ length: 80 }, (_, i) => {
      const c = 100 + i * 0.4;
      return { t: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 2e6 };
    });
  }

  it("admits a symbol on its trend alone: no range expansion, under 120 sessions", () => {
    Object.assign(dirs, { "1Week": "bullish" });
    expect(coarseContinuation("X", quietAdvance())).toMatchObject({ direction: "bullish", kind: "continuation" });
  });

  it("does not rank on a widening daily range, which has no source in the rules", () => {
    Object.assign(dirs, { "1Week": "bullish" });
    expect(coarseContinuation("X", advance(true))!.coarseScore).toBe(coarseContinuation("Y", advance(false))!.coarseScore);
  });

  it("ranks a trend with volume increasing behind it ahead of one on ordinary volume", () => {
    Object.assign(dirs, { "1Week": "bullish" });
    expect(coarseContinuation("X", advance(false, 4e6))!.coarseScore).toBeGreaterThan(coarseContinuation("Y", advance(false))!.coarseScore);
  });

  it("admits nothing without a trend", () => {
    Object.assign(dirs, { "1Week": "sideways", "1Day": "sideways" });
    expect(coarseContinuation("X", quietAdvance())).toBeNull();
  });
});

describe("the continuation's strongest points read the major range (gann-alignment-audit SUS-02)", () => {
  /** A long fall from 200 to 100, then a rise to `to`: the extreme range is 100-200. */
  function fallThenRise(to: number): Bar[] {
    const bars: Bar[] = [];
    for (let i = 0; i < 100; i++) {
      const c = 200 - i;
      bars.push({ t: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 2e6 });
    }
    for (let i = 1; i <= 30; i++) {
      const c = 100 + ((to - 100) * i) / 30;
      bars.push({ t: new Date(Date.UTC(2025, 0, 100 + i)).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 2e6 });
    }
    return bars;
  }

  it("ranks a long holding above the half-way point of the extreme range ahead of one under it", () => {
    Object.assign(dirs, { "1Week": "bullish" });
    // 160 is above 150 (half of 100-200) by more than a point; 130 is under it.
    // Both are above 100, half the highest price, so only the range point differs.
    const above = coarseContinuation("X", fallThenRise(160))!.coarseScore;
    const under = coarseContinuation("Y", fallThenRise(130))!.coarseScore;
    expect(above - under).toBe(1);
  });

  it("does not take the point from a minor swing's midpoint: a recent rise under the half-way point scores none", () => {
    Object.assign(dirs, { "1Week": "bullish" });
    // The last 20 bars rise steadily, so price is above their midpoint (the old reading),
    // but 130 sits under the half-way point of 100-200.
    // The base 3, and half the highest price (100) held; no range point.
    expect(coarseContinuation("X", fallThenRise(130))!.coarseScore).toBe(3 + 1);
  });

  it("reads the monthly record when it is in", () => {
    Object.assign(dirs, { "1Week": "bullish" });
    // The sessions alone run 100-160 (half 130, price 160 above it); a monthly high of 400
    // makes the extreme range 100-400 (half 250) and half the highest price 200, both above 160.
    const daily: Bar[] = Array.from({ length: 70 }, (_, i) => {
      const c = 100 + (60 * (i + 1)) / 70;
      return { t: new Date(Date.UTC(2025, 3, 1 + i)).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 2e6 };
    });
    const monthly: Bar[] = [{ t: "2024-06-01T00:00:00.000Z", o: 300, h: 400, l: 300, c: 350, v: 1e8 }];
    const without = coarseContinuation("X", daily)!.coarseScore;
    const withMonthly = coarseContinuation("X", daily, undefined, undefined, monthly)!.coarseScore;
    expect(without - withMonthly).toBe(2);
  });
});

describe("the reversion's level point needs a level held (gann-alignment-audit SUS-01)", () => {
  /**
   * Completed sessions ending two days before today (the scan reads a held
   * level over the last year of closed sessions): a decline that reacts to
   * `low` and comes back to `last`.
   */
  function reaction(low: number, last: number, closeThrough = false): Bar[] {
    const bars: Bar[] = [];
    const start = Date.now() - 91 * 86_400_000;
    const day = (n: number) => new Date(start + n * 86_400_000).toISOString();
    for (let i = 0; i < 80; i++) {
      const c = 160 - i * 0.5;
      bars.push({ t: day(i), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 });
    }
    const path = [118, 112, 106, low + 1, closeThrough ? low - 8 : low + 1, low + 3, last - 2, last - 1, last];
    path.forEach((c, k) => {
      const l = k === 3 ? low : c - 0.5;
      bars.push({ t: day(80 + k), o: c, h: c + 0.5, l, c, v: 1e6 });
    });
    return bars;
  }

  // An active buying window (+1) so a reading with the level point clears the pool's floor of 3.
  const window = { active: true, bullishActive: true, bearishActive: false } as never;

  it("scores the level when the last reaction stopped at it and held", () => {
    Object.assign(dirs, { "1Week": "bearish" });
    support = [100];
    const held = coarseReversion("X", reaction(100, 104), window, "bearish");
    support = [60];
    const none = coarseReversion("X", reaction(100, 104), window, "bearish");
    expect(held).toMatchObject({ direction: "bullish", coarseScore: (none?.coarseScore ?? 1) + 2 });
  });

  it("does not score a level price is merely near once a close went 3 points through it", () => {
    Object.assign(dirs, { "1Week": "bearish" });
    support = [100];
    const broken = coarseReversion("X", reaction(100, 104, true), window, "bearish");
    support = [60];
    const none = coarseReversion("X", reaction(100, 104, true), window, "bearish");
    expect(broken?.coarseScore ?? 0).toBe(none?.coarseScore ?? 0);
  });
});
