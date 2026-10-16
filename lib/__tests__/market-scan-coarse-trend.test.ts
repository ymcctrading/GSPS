/**
 * The coarse pass reads the weekly trend first (PLAN.md item 6 step 7,
 * A-TREND-01, W006 p.19): monthly for the main trend, the weekly next, the
 * daily only for fast, active stocks. The trend reads are pinned per
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

/** A steady advance whose last 20 days widen, and a 4-hour spike on its last bar. */
function expandingAdvance(): { daily: Bar[]; bars4h: Bar[] } {
  const daily: Bar[] = [];
  for (let i = 0; i < 130; i++) {
    const c = 100 + i * 0.4;
    const half = i >= 110 ? 2 : 0.5;
    daily.push({ t: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(), o: c, h: c + half, l: c - half, c, v: 2e6 });
  }
  const bars4h: Bar[] = Array.from({ length: 21 }, (_, i) => {
    const big = i === 20;
    return { t: new Date(Date.UTC(2025, 4, 1, 4 * i)).toISOString(), o: 150, h: 150 + (big ? 3 : 0.5), l: 150 - (big ? 3 : 0.5), c: 151, v: big ? 5e5 : 1e5 };
  });
  return { daily, bars4h };
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
    const { daily, bars4h } = expandingAdvance();
    expect(coarseContinuation("X", daily, bars4h)?.direction).toBe("bullish");
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

  it("admits a symbol on its trend alone: no 4-hour spike, no range expansion, under 120 sessions", () => {
    Object.assign(dirs, { "1Week": "bullish" });
    expect(coarseContinuation("X", quietAdvance(), [])).toMatchObject({ direction: "bullish", kind: "continuation" });
  });

  it("ranks a trend with momentum behind it ahead of a quiet one", () => {
    Object.assign(dirs, { "1Week": "bullish" });
    const { daily, bars4h } = expandingAdvance();
    expect(coarseContinuation("X", daily, bars4h)!.coarseScore).toBeGreaterThan(coarseContinuation("Y", quietAdvance(), [])!.coarseScore);
  });

  it("admits nothing without a trend", () => {
    Object.assign(dirs, { "1Week": "sideways", "1Day": "sideways" });
    expect(coarseContinuation("X", quietAdvance(), [])).toBeNull();
  });
});
