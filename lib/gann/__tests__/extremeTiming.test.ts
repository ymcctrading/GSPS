import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readGaps, readReverseSignal } from "../extremeRules";
import { readTiming } from "../timeConvergence";
import { detectSpectralCycle } from "../spectralCycle";

function bar(i: number, o: number, h: number, l: number, c: number): Bar {
  return { t: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(), o, h, l, c, v: 1000 };
}
/** Plain bars around a close, one per calendar day. */
function rise(n: number, from = 100, step = 1): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const c = from + i * step;
    return bar(i, c - 0.2, c + 0.5, c - 0.5, c);
  });
}

describe("reverse signal day and the 7-10 Day Rule", () => {
  it("reads a top reverse day: opens above the prior high, new high, closes near the low", () => {
    const bars = rise(10);
    const prev = bars[bars.length - 1];
    bars.push(bar(10, prev.h + 1, prev.h + 2, prev.l - 1, prev.l - 0.8));
    expect(readReverseSignal(bars)).toMatchObject({ signal: "top", rule: "reverseDay" });
  });

  it("reads the 7-10 Day Rule after a run with no lower lows", () => {
    const bars = rise(10); // 9 days in a row without breaking the prior low
    const prev = bars[bars.length - 1];
    bars.push(bar(10, prev.c, prev.c + 0.3, prev.l - 1, prev.l - 0.9));
    expect(readReverseSignal(bars)).toMatchObject({ signal: "top", rule: "sevenToTenDay", runDays: 9 });
  });

  it("finds no signal on an ordinary day", () => {
    expect(readReverseSignal(rise(10)).signal).toBeNull();
  });
});

describe("gap rules", () => {
  it("reads an exhaust gap: a one-day gap to a new high, then a reverse signal day (Commodities p.319)", () => {
    const bars = rise(25);
    const p = bars[bars.length - 1];
    bars.push(bar(25, p.h + 2, p.h + 3, p.h + 1, p.h + 2.5)); // gap up to a new high
    bars.push(bar(26, p.h + 3.2, p.h + 3.6, p.h - 0.5, p.h - 0.2)); // opens over it, new high, closes near the low
    expect(readGaps(bars).exhaustGap).toBe("top");
  });

  it("reads an exhaust gap when the gap day is itself the reverse signal day", () => {
    const bars = rise(25);
    const p = bars[bars.length - 1];
    bars.push(bar(25, p.h + 2, p.h + 3, p.h + 1, p.h + 1.1));
    expect(readGaps(bars).exhaustGap).toBe("top");
  });

  it("no longer reads a gap filled the next day without a reverse signal day as exhaust", () => {
    const bars = rise(25);
    const p = bars[bars.length - 1];
    bars.push(bar(25, p.h + 2, p.h + 3, p.h + 1, p.h + 2.5));
    bars.push(bar(26, p.h + 1.5, p.h + 1.8, p.h - 0.5, p.h - 0.2)); // fills it, but opens inside the gap day
    expect(readGaps(bars).exhaustGap).toBeNull();
  });

  it("mirrors at a bottom", () => {
    const bars = rise(25, 200, -1);
    const p = bars[bars.length - 1];
    bars.push(bar(25, p.l - 2, p.l - 1, p.l - 3, p.l - 2.5)); // gap down to a new low
    bars.push(bar(26, p.l - 3.2, p.l + 0.5, p.l - 3.6, p.l + 0.2)); // opens under it, new low, closes near the high
    expect(readGaps(bars).exhaustGap).toBe("bottom");
  });

  it("keeps 3-4 gaps in new territory as the culmination count and flags 6 or more as extended (p.321)", () => {
    const three = rise(25);
    for (let k = 0; k < 3; k++) {
      const q = three[three.length - 1];
      three.push(bar(25 + k, q.h + 1, q.h + 2, q.h + 0.5, q.h + 1.5));
    }
    expect(readGaps(three).gapsInNewTerritory).toMatchObject({ direction: "up", count: 3, extended: false });
    const many = rise(30, 100, 2); // every bar gaps over the one before
    const g = readGaps(many).gapsInNewTerritory!;
    expect(g.count).toBeGreaterThanOrEqual(6);
    expect(g.extended).toBe(true);
  });

  it("reads a filled gap as reversing the minor trend against it", () => {
    const bars = rise(25);
    const p = bars[bars.length - 1];
    bars.push(bar(25, p.h + 2, p.h + 3, p.h + 1, p.h + 2.5));
    bars.push(bar(26, p.h + 2.5, p.h + 3.5, p.h + 2, p.h + 3));
    bars.push(bar(27, p.h + 2, p.h + 2.2, p.h - 0.5, p.h));
    expect(readGaps(bars).filledGapReversal).toBe("bearish");
  });
});

describe("timing: alternation, 144 convergence, projection dispersion", () => {
  it("reports days from the last pivot and a projection when the swings are regular", () => {
    const closes: number[] = [];
    for (let k = 0; k < 8; k++) {
      for (let i = 0; i < 7; i++) closes.push(100 + i);
      for (let i = 0; i < 7; i++) closes.push(106 - i);
    }
    const bars = closes.map((c, i) => bar(i, c, c + 0.5, c - 0.5, c));
    const t = readTiming(bars);
    expect(t.alternation).not.toBeNull();
    expect(t.projection).not.toBeNull();
    expect(t.projection!.spreadDays).toBeLessThanOrEqual(2); // a perfectly regular 14-day rhythm
  });
});

describe("the 7th, 14th and 21st day from the last swing (C-TIME-18, W003 p.19; W034 p.4)", () => {
  /** A 30-day rise to a top, then `k` days of decline with no further swing. */
  function topThen(k: number): Bar[] {
    const closes = [...Array.from({ length: 30 }, (_, i) => 100 + i), ...Array.from({ length: k }, (_, i) => 129 - (i + 1) * 0.5)];
    return closes.map((c, i) => bar(i, c, c + 0.5, c - 0.5, c));
  }

  it("marks days 7, 14 and 21 after the top, a day either side", () => {
    for (const [k, mark] of [[7, 7], [14, 14], [21, 21], [13, 14], [22, 21], [6, 7]] as const) {
      expect(readTiming(topThen(k)).alternation).toEqual({ daysSincePivot: k, mark });
    }
  });

  it("marks nothing between them", () => {
    for (const k of [10, 12, 16, 24]) expect(readTiming(topThen(k)).alternation?.mark).toBeNull();
  });
});

describe("spectral cycle significance (Schuster)", () => {
  it("gives a strong regular cycle a small Schuster p", () => {
    const bars = Array.from({ length: 240 }, (_, i) => {
      const c = 100 + 5 * Math.sin((2 * Math.PI * i) / 20);
      return bar(i, c, c + 0.5, c - 0.5, c);
    });
    const r = detectSpectralCycle(bars);
    expect(r.dominantPeriodBars).toBe(20);
    expect(r.schusterP).not.toBeNull();
    expect(r.schusterP!).toBeLessThan(0.05);
  });
});

describe("extended gap runs in the factor table", () => {
  it("records an extended run of gaps in the trade's direction", async () => {
    const { contextFactorsFor } = await import("../contextFactors");
    const { EMPTY_DISCLOSED_RULES } = await import("../disclosedRules");
    const ctx = {
      ...EMPTY_DISCLOSED_RULES,
      extremes: {
        ...EMPTY_DISCLOSED_RULES.extremes,
        gaps: { exhaustGap: null, filledGapReversal: null, gapsInNewTerritory: { direction: "up" as const, count: 7, extended: true } },
      },
    };
    expect(contextFactorsFor(ctx, "bullish", 100).extendedGapsInTradeDirection).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 100).extendedGapsInTradeDirection).toBe(false);
  });
});
