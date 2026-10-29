import { describe, expect, it } from "vitest";
import type { Bar, ScanResult } from "@/lib/types";
import { longMayLead, readLeadership, selectionStrength } from "@/lib/gann/leadership";
import { compareForList, rankShortlist, type CoarseCandidate } from "@/lib/marketScan";
import { visibilityRank } from "@/lib/scan/listOrder";

function bars(closes: number[], start = "2025-01-01"): Bar[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
}

/**
 * 2025 runs between 80 and 100 (prior-year top 100.5); 2026 rallies through
 * that top, the stock `stockLead` days earlier than the market.
 */
function crossingSeries(crossDay: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 365; i++) out.push(90 + 10 * Math.sin(i / 20));
  for (let d = 0; d < 120; d++) out.push(d < crossDay ? 92 : 92 + (d - crossDay + 1) * 1.5);
  return out;
}

describe("early leaders in a bull market (A-SELECTION-02)", () => {
  it("marks a stock that crossed last year's top well before the market as having crossed first", () => {
    const stock = bars(crossingSeries(20));
    const market = bars(crossingSeries(60).map((c) => c * 4));
    const r = readLeadership(stock, market, null)!;
    expect(r.crossedTopsFirst).toBe(true);
  });

  it("does not mark a crossing made with the market", () => {
    const stock = bars(crossingSeries(40));
    const market = bars(crossingSeries(40).map((c) => c * 4));
    expect(readLeadership(stock, market, null)!.crossedTopsFirst).toBe(false);
  });

  it("reads no late bottom against a market that rose all year (its lowest bar is no swing bottom)", () => {
    // The market climbs every session for 300: its window low is the window's first bar.
    const market = bars(Array.from({ length: 300 }, (_, i) => 100 + i * 0.5));
    // The stock dips in the middle of the year and recovers: a real 3-Day Chart bottom.
    const stock = bars(Array.from({ length: 300 }, (_, i) => 100 + i * 0.3 - (i > 140 && i < 170 ? (15 - Math.abs(i - 155)) * 3 : 0)));
    const r = readLeadership(stock, market, null)!;
    expect(r.bottomedLate).toBe(false);
    expect(r.bottomedFirst).toBe(false);
  });

  it("reads a stock that bottomed while the market is still making new lows as first", () => {
    // The market falls every session, its low on the last bar: it has not bottomed yet.
    const market = bars(Array.from({ length: 300 }, (_, i) => 400 - i * 0.5));
    // The stock fell to session 250, turned, and has risen since.
    const stock = bars(Array.from({ length: 300 }, (_, i) => (i <= 250 ? 200 - i * 0.4 : 100 + (i - 250) * 0.6)));
    const r = readLeadership(stock, market, null)!;
    expect(r.bottomedFirst).toBe(true);
    expect(r.bottomedLate).toBe(false);
  });

  it("ranks an early leader above a stock that is not one on the buy side", () => {
    const leader = { bottomedFirst: true, bottomedLate: false, toppedFirst: false, toppedLate: false, lateBottomExpected: false, earlyBottomExpected: false, crossedTopsFirst: false, brokeBottomsFirst: false, firstYearHighCrossed: null };
    const plain = { ...leader, bottomedFirst: false };
    expect(selectionStrength("bullish", leader, null)).toBeGreaterThan(selectionStrength("bullish", plain, null));
    expect(selectionStrength("bullish", { ...plain, crossedTopsFirst: true }, null)).toBeGreaterThan(0);
    // G25: no step for leading or rank once the first-year high is failed.
    const strong = { strongest: true, weakest: false };
    expect(selectionStrength("bullish", { ...plain, crossedTopsFirst: true, firstYearHighCrossed: false }, null, strong)).toBe(0);
    expect(selectionStrength("bullish", { ...plain, crossedTopsFirst: true, firstYearHighCrossed: true }, null, strong)).toBe(2);
    expect(longMayLead(null)).toBe(true);
    expect(longMayLead({ firstYearHighCrossed: null })).toBe(true);
  });
});

function result(symbol: string, score: number, outputState: "Execute" | "Watch" | "Reject", selection: number): ScanResult {
  return { symbol, decision: { score, outputState, breakdown: [] }, selectionStrength: selection } as unknown as ScanResult;
}

describe("list order puts the leaders first", () => {
  it("lists an early leader ahead of a higher score with the same verdict", () => {
    const list = [result("HIGH", 8, "Execute", 0), result("LEAD", 6, "Execute", 1)].sort(compareForList);
    expect(list.map((r) => r.symbol)).toEqual(["LEAD", "HIGH"]);
  });

  it("keeps score order between two setups of equal standing", () => {
    const list = [result("B", 6, "Execute", 0), result("A", 7, "Execute", 0)].sort(compareForList);
    expect(list.map((r) => r.symbol)).toEqual(["A", "B"]);
  });

  it("lists a resting Execute behind an Execute price is near, in the Resting tier ahead of Watch (SE, 2026-10-23; tier 2026-10-28)", () => {
    const sell = (symbol: string, score: number, state: "Execute" | "Watch", entry: number) =>
      ({
        ...result(symbol, score, state, 0),
        direction: "bearish",
        currentPrice: 75.69,
        dayRange: 3.72,
        levels: { entry, stopLoss: entry + 5, takeProfit1: entry - 6.63, masterProfit: entry - 12 },
      }) as unknown as ScanResult;
    const resting = sell("SE", 7, "Execute", 100);
    const near = sell("NEAR", 6, "Execute", 76.5);
    const watch = sell("WAIT", 8, "Watch", 77);
    expect([resting, watch, near].sort(compareForList).map((r) => r.symbol)).toEqual(["NEAR", "SE", "WAIT"]);
    expect(visibilityRank(near)).toBeGreaterThan(visibilityRank(resting));
    expect(visibilityRank(resting)).toBeGreaterThan(visibilityRank(watch));
  });

  it("never lists a held or rejected leader ahead of an actionable setup", () => {
    const list = [result("LEAD", 5, "Watch", 1), result("ACT", 6, "Execute", 0)].sort(compareForList);
    expect(list.map((r) => r.symbol)).toEqual(["ACT", "LEAD"]);
  });

  it("gives an early leader a shortlist slot ahead of a higher coarse score", () => {
    const pool: CoarseCandidate[] = [
      { symbol: "A", direction: "bullish", kind: "reversion", coarseScore: 6 },
      { symbol: "B", direction: "bullish", kind: "reversion", coarseScore: 4 },
    ];
    const strength = new Map([["B", () => 1]]);
    expect(rankShortlist(pool, 1, null, strength).map((c) => c.symbol)).toEqual(["B"]);
  });
});

/** The mirror of `crossingSeries`: 2026 breaks the prior year's low. */
function breakingSeries(breakDay: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 365; i++) out.push(90 + 10 * Math.sin(i / 20));
  for (let d = 0; d < 120; d++) out.push(d < breakDay ? 88 : 88 - (d - breakDay + 1) * 1.5);
  return out;
}

describe("early leaders in a bear market (A-SELECTION-03)", () => {
  it("marks a stock that broke last year's bottom well before the market as having broken first", () => {
    const r = readLeadership(bars(breakingSeries(20)), bars(breakingSeries(60).map((c) => c * 4)), null)!;
    expect(r.brokeBottomsFirst).toBe(true);
  });

  it("ranks a stock that topped first, or broke its bottoms first, above one that did neither on the sell side", () => {
    const plain = { bottomedFirst: false, bottomedLate: false, toppedFirst: false, toppedLate: false, lateBottomExpected: false, earlyBottomExpected: false, crossedTopsFirst: false, brokeBottomsFirst: false, firstYearHighCrossed: null };
    expect(selectionStrength("bearish", { ...plain, toppedFirst: true }, null)).toBeGreaterThan(selectionStrength("bearish", plain, null));
    expect(selectionStrength("bearish", { ...plain, brokeBottomsFirst: true }, null)).toBeGreaterThan(0);
    // A buy-side leader is no reason to sell it short.
    expect(selectionStrength("bearish", { ...plain, bottomedFirst: true }, null)).toBe(0);
  });
});
