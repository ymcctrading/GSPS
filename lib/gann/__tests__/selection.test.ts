import { describe, expect, it } from "vitest";
import type { Bar, ScanResult } from "@/lib/types";
import { readLeadership, selectionStrength } from "@/lib/gann/leadership";
import { compareForList, rankShortlist, type CoarseCandidate } from "@/lib/marketScan";

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

  it("ranks an early leader above a stock that is not one on the buy side", () => {
    const leader = { bottomedFirst: true, bottomedLate: false, toppedFirst: false, toppedLate: false, lateBottomExpected: false, earlyBottomExpected: false, crossedTopsFirst: false, brokeBottomsFirst: false, firstYearHighCrossed: null };
    const plain = { ...leader, bottomedFirst: false };
    expect(selectionStrength("bullish", leader, null)).toBeGreaterThan(selectionStrength("bullish", plain, null));
    expect(selectionStrength("bullish", { ...plain, crossedTopsFirst: true }, null)).toBeGreaterThan(0);
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
