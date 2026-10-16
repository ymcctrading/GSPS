/**
 * The coarse pass reads the trend as the full scan does (PLAN.md item 6 step 7
 * and review R1, A-TREND-01, W006 p.19): monthly for the main trend when its
 * bars are in, the weekly next, the daily only for fast, active stocks. The trend reads are pinned per
 * timeframe here so the wiring, not the swing charts, is under test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

const dirs: Record<string, "bullish" | "bearish" | "sideways"> = {};
vi.mock("@/lib/analysis/trend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analysis/trend")>();
  return {
    ...actual,
    readTrend: (bars: Bar[], tf: string) => {
      const r = actual.readTrend(bars, tf as never);
      return dirs[tf] ? { ...r, direction: dirs[tf] } : r;
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
