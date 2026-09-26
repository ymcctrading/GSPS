import { describe, expect, it } from "vitest";
import { yearCycleConvergence, type TimeCycleResult } from "@/lib/gann/timeCycles";
import {
  CYCLE_WINDOW_BONUS,
  YEAR_CYCLE_BONUS_CAP,
  coarseReversion,
  rankShortlist,
  type CoarseCandidate,
} from "@/lib/marketScan";
import type { Bar } from "@/lib/types";
import { buildMacroContext } from "@/lib/backtest/replay";

/** Monthly bars from Jan 2020, a single V (or inverted V) turning at `turnIndex`. */
function monthlyV(turnIndex: number, months: number, kind: "low" | "high"): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < months; i++) {
    const depth = Math.abs(i - turnIndex);
    const c = kind === "low" ? 100 + depth * 2 : 200 - depth * 2;
    const t = new Date(Date.UTC(2020, i, 1)).toISOString();
    bars.push({ t, o: c, h: c + 1, l: c - 1, c, v: 1_000_000 });
  }
  return bars;
}

describe("yearCycleConvergence", () => {
  // Turn at index 30 = July 2022.
  it("counts a major low exactly one cycle length back as a bullish hit", () => {
    const bars = monthlyV(30, 72, "low");
    expect(yearCycleConvergence(bars, new Date(Date.UTC(2027, 6, 15)))).toEqual({
      bullishHits: 1, // 5-year cycle
      bearishHits: 0,
    });
  });

  it("counts a major high the same way on the bearish side", () => {
    const bars = monthlyV(30, 72, "high");
    expect(yearCycleConvergence(bars, new Date(Date.UTC(2029, 6, 1)))).toEqual({
      bullishHits: 0,
      bearishHits: 1, // 7-year cycle
    });
  });

  it("matches the month exactly — one month off is no hit", () => {
    const bars = monthlyV(30, 72, "low");
    expect(yearCycleConvergence(bars, new Date(Date.UTC(2027, 7, 15))).bullishHits).toBe(0);
  });

  it("needs at least two years of monthly history", () => {
    const bars = monthlyV(10, 20, "low");
    expect(yearCycleConvergence(bars, new Date(Date.UTC(2021, 10, 1)))).toEqual({
      bullishHits: 0,
      bearishHits: 0,
    });
  });
});

function candidate(symbol: string, coarseScore: number, direction: "bullish" | "bearish" = "bullish"): CoarseCandidate {
  return { symbol, direction, kind: "reversion", coarseScore };
}

describe("rankShortlist", () => {
  const pool = [candidate("A", 6), candidate("B", 5), candidate("C", 4), candidate("D", 4)];

  it("is the plain coarse-order slice when the re-rank did not run", () => {
    expect(rankShortlist(pool, 2, null).map((c) => c.symbol)).toEqual(["A", "B"]);
  });

  it("lets converging cycles lift a candidate over a higher coarse score", () => {
    // C: 4 + 2 = 6 — past B (5), into the cut; ties A and stays behind it.
    const hits = new Map([["C", { bullishHits: 2, bearishHits: 0 }]]);
    expect(rankShortlist(pool, 2, hits).map((c) => c.symbol)).toEqual(["A", "C"]);
  });

  it("caps the bonus, so cycles cannot outrank several structural points", () => {
    const hits = new Map([["D", { bullishHits: 9, bearishHits: 0 }]]);
    const ranked = rankShortlist([candidate("A", 7), candidate("D", 4)], 1, hits);
    expect(ranked[0].symbol).toBe("A");
    expect(4 + YEAR_CYCLE_BONUS_CAP).toBeLessThan(7);
  });

  it("ignores hits on the other side of the candidate's direction", () => {
    const hits = new Map([["C", { bullishHits: 0, bearishHits: 2 }]]);
    expect(rankShortlist(pool, 2, hits).map((c) => c.symbol)).toEqual(["A", "B"]);
  });

  it("keeps coarse order on ties", () => {
    const hits = new Map([["D", { bullishHits: 1, bearishHits: 0 }]]);
    // B=5, D=4+1=5: B came first in coarse order, so it stays ahead.
    expect(rankShortlist(pool, 3, hits).map((c) => c.symbol)).toEqual(["A", "B", "D"]);
  });
});

/** Zig-zag downtrend that clears the coarse reversion gate (coarse score 4). */
function extendedDowntrend(scale = 1): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < 120; i++) {
    // A declining zig-zag (so the trend read has swings to find — a straight
    // line reads as sideways) with a final leg down that leaves price
    // extended below its 50-bar mean.
    const trend = 150 - i * 0.5;
    //
    // The final leg falls four points a bar, fast enough that ten straight
    // closes decline. Since 2026-09-26 the trend read is Gann's 9-day swing
    // chart confirmed by stepping 3-day swings (lib/gann/trendStrength.ts),
    // not SMA 20/50. A 9-day chart only turns down after nine closes against
    // it, which the old 1.5-point tail on 5-bar legs never produced, so that
    // fixture read as no trend at all.
    const wiggle = 6 * Math.sin((i / 12) * 2 * Math.PI);
    const tail = i >= 110 ? (i - 109) * 4 : 0;
    const c = (trend + wiggle - tail) * scale;
    const t = new Date(Date.UTC(2025, 0, 1 + i)).toISOString();
    bars.push({ t, o: c, h: c * 1.01, l: c * 0.99, c, v: 1_000_000 });
  }
  return bars;
}

function cycles(bullishActive: boolean, bearishActive: boolean): TimeCycleResult {
  return {
    active: bullishActive || bearishActive,
    bullishActive,
    bearishActive,
    dates: [],
    fixedCalendarActive: false,
    fixedCalendarDates: [],
  };
}

describe("coarseReversion day-count cycle bonus", () => {
  const bars = extendedDowntrend();
  const base = coarseReversion("X", bars);

  it("adds the bonus when a window matching the candidate's direction is active", () => {
    expect(base).not.toBeNull();
    expect(base?.direction).toBe("bullish");
    expect(coarseReversion("X", bars, cycles(true, false))?.coarseScore).toBe(
      (base?.coarseScore ?? 0) + CYCLE_WINDOW_BONUS,
    );
  });

  it("adds nothing for a window arguing the other direction", () => {
    expect(coarseReversion("X", bars, cycles(false, true))?.coarseScore).toBe(base?.coarseScore);
  });
});

describe("buildMacroContext time-cycle date (replay)", () => {
  // Daily V with its low on 2024-01-21 (index 20); 110 bars, so the session
  // after the last bar is exactly 90 days — one wheel count — past the low.
  function dailyV(): Bar[] {
    const bars: Bar[] = [];
    for (let i = 0; i < 110; i++) {
      const c = 100 + Math.abs(i - 20);
      const t = new Date(Date.UTC(2024, 0, 1 + i)).toISOString();
      bars.push({ t, o: c, h: c + 0.5, l: c - 0.5, c, v: 1_000_000 });
    }
    return bars;
  }

  it("reads turn windows relative to the replayed session, not the wall clock", () => {
    const bars = dailyV();
    const price = bars[bars.length - 1].c;
    expect(buildMacroContext(bars, price).gann.timeCycleBullishActive).toBe(true);
    expect(
      buildMacroContext(bars, price, new Date(Date.UTC(2024, 3, 20))).gann.timeCycleBullishActive,
    ).toBe(true);
  });

  it("is not active for a session that isn't on a wheel count", () => {
    const bars = dailyV();
    const price = bars[bars.length - 1].c;
    expect(
      buildMacroContext(bars, price, new Date(Date.UTC(2026, 8, 25))).gann.timeCycleBullishActive,
    ).toBe(false);
  });
});
