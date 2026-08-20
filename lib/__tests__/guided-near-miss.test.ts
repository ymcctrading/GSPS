/**
 * The near miss must stay un-tradeable.
 *
 * Guided refuses anything below an Execute verdict because the app's own
 * Backtest puts Watch-tier expectancy slightly negative — a Watch behind a
 * friendly Buy button is a losing trade wearing a winning interface. Showing
 * the closest candidate on a quiet day is a teaching device, and the moment it
 * acquires a size, a dollar risk or a confirm path it stops being one and
 * becomes the exact thing the Execute gate exists to prevent.
 *
 * So these tests are mostly about absence: what a `NearMiss` must NOT carry.
 */

import { describe, expect, it } from "vitest";
import { missingFor, pickNearestMiss } from "@/lib/guided/near-miss";
import type { ScanResult } from "@/lib/types";

function scan(over: Partial<ScanResult> & { symbol: string; score: number }): ScanResult {
  const { score, ...rest } = over;
  return {
    assetClass: "us_equity",
    currentPrice: 100,
    direction: "bullish",
    levels: null,
    error: null,
    decision: {
      score,
      outputState: score >= 7 ? "Execute" : score >= 4 ? "Watch" : "Reject",
      summary: { score, max: 9, pillars: [], stateNote: null },
    },
    ...rest,
  } as unknown as ScanResult;
}

describe("pickNearestMiss", () => {
  it("returns nothing when nothing was scanned", () => {
    expect(pickNearestMiss([])).toBeNull();
    expect(pickNearestMiss([null, null])).toBeNull();
  });

  it("ignores scans that failed outright", () => {
    // A symbol whose data could not be fetched is not "close to qualifying" —
    // it is unknown, and presenting it as the day's best candidate would be a
    // claim the scan never made.
    const failed = scan({ symbol: "AAA", score: 8, error: "no data" });
    expect(pickNearestMiss([failed])).toBeNull();
  });

  it("picks the highest score", () => {
    const result = pickNearestMiss([
      scan({ symbol: "LOW", score: 3 }),
      scan({ symbol: "HIGH", score: 6 }),
      scan({ symbol: "MID", score: 5 }),
    ]);
    expect(result?.symbol).toBe("HIGH");
    expect(result?.score).toBe(6);
  });

  it("breaks a tie toward the one with a priced plan", () => {
    // Of two equally-scored candidates, the one that has already priced an
    // entry and a stop is the one a reader can learn something concrete from.
    const bare = scan({ symbol: "BARE", score: 6 });
    const priced = scan({
      symbol: "PRICED",
      score: 6,
      levels: { entry: 10, stopLoss: 9, takeProfit1: 12, masterProfit: 14 },
    } as never);
    expect(pickNearestMiss([bare, priced])?.symbol).toBe("PRICED");
    // Order must not decide it.
    expect(pickNearestMiss([priced, bare])?.symbol).toBe("PRICED");
  });

  it("carries nothing that could place an order", () => {
    const near = pickNearestMiss([scan({ symbol: "AAA", score: 6 })])!;
    // The guard this whole module exists for. If any of these ever appear, a
    // near miss has become sizeable, and sizeable is one prop away from
    // tappable.
    for (const forbidden of ["qty", "notionalUsd", "riskUsd", "rewardUsd", "action", "id"]) {
      expect(near).not.toHaveProperty(forbidden);
    }
  });

  it("links to the full scan so the user can judge it themselves", () => {
    const near = pickNearestMiss([scan({ symbol: "AAA", score: 6 })])!;
    expect(near.tickerHref).toContain("AAA");
  });
});

describe("what it says is missing", () => {
  it("names the score against the bar, in words a beginner can use", () => {
    const reasons = missingFor(scan({ symbol: "AAA", score: 6 }), 6);
    expect(reasons.join(" ")).toMatch(/6 out of 9/);
    expect(reasons.join(" ")).toMatch(/7 or better/);
  });

  it("flags an unpriced plan", () => {
    const reasons = missingFor(scan({ symbol: "AAA", score: 6, levels: null }), 6);
    expect(reasons.some((r) => /no entry, stop or target/i.test(r))).toBe(true);
  });

  it("flags a missing direction", () => {
    const reasons = missingFor(scan({ symbol: "AAA", score: 5, direction: "none" } as never), 5);
    expect(reasons.some((r) => /no clear direction/i.test(r))).toBe(true);
  });

  it("mentions the borrow requirement only for a short", () => {
    const long = missingFor(scan({ symbol: "AAA", score: 6 }), 6);
    const short = missingFor(scan({ symbol: "AAA", score: 6, direction: "bearish" } as never), 6);
    expect(long.some((r) => /borrow/i.test(r))).toBe(false);
    expect(short.some((r) => /borrow/i.test(r))).toBe(true);
  });

  it("never comes back empty", () => {
    // A card headed "what it would still need" that lists nothing reads as a
    // bug. Covers the gates this function does not model individually.
    const executeGrade = scan({
      symbol: "AAA",
      score: 8,
      levels: { entry: 10, stopLoss: 9, takeProfit1: 12, masterProfit: 14 },
    } as never);
    expect(missingFor(executeGrade, 8).length).toBeGreaterThan(0);
  });
});
