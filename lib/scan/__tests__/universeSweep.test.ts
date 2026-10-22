import { describe, expect, it } from "vitest";
import { mergeSweptIntoShortlist, nextUnswept, pickSweepBasis, sweptCandidates, type SweepRow } from "@/lib/scan/universeSweep";

const row = (symbol: string, output_state: string | null, score: number | null, direction: string | null = "bullish"): SweepRow => ({
  basis_date: "2026-10-23",
  symbol,
  direction,
  score,
  output_state,
});

describe("nextUnswept", () => {
  it("takes the universe in order, skipping what is stored and repeats", () => {
    expect(nextUnswept(["aapl", "MSFT", "AAPL", "DE", "KO"], new Set(["MSFT"]), 2)).toEqual(["AAPL", "DE"]);
  });
  it("is empty once every symbol is stored", () => {
    expect(nextUnswept(["A", "B"], new Set(["A", "B"]), 10)).toEqual([]);
  });
});

describe("sweptCandidates", () => {
  it("puts Execute first, then the higher score, and drops rejects and plans with no side", () => {
    const rows = [
      row("KO", "Watch", 6),
      row("DE", "Execute", 7),
      row("BP", "Execute", 8, "bearish"),
      row("X", "Reject", 3),
      row("Y", "Watch", 5, "none"),
      row("Z", null, null),
      row("AMD", "Watch", 4),
    ];
    expect(sweptCandidates(rows, 10)).toEqual(["BP", "DE", "KO", "AMD"]);
  });
  it("keeps at most the slots given", () => {
    expect(sweptCandidates([row("A", "Execute", 7), row("B", "Execute", 7)], 1)).toEqual(["A"]);
  });
});

describe("mergeSweptIntoShortlist", () => {
  const c = (symbol: string) => ({ symbol, coarseScore: 5 });
  it("puts the swept setups first and fills with the coarse shortlist to the same size", () => {
    const out = mergeSweptIntoShortlist(["DE", "msft"], [c("AAPL"), c("MSFT"), c("KO")], 3, (s) => ({ symbol: s, coarseScore: 0 }));
    expect(out.map((x) => x.symbol)).toEqual(["DE", "MSFT", "AAPL"]);
    // A swept symbol the coarse pass also shortlisted keeps its coarse candidate.
    expect(out[1].coarseScore).toBe(5);
    expect(out[0].coarseScore).toBe(0);
  });
  it("is the coarse shortlist unchanged with nothing swept", () => {
    const coarse = [c("A"), c("B")];
    expect(mergeSweptIntoShortlist([], coarse, 5, (s) => ({ symbol: s, coarseScore: 0 }))).toEqual(coarse);
  });
});

describe("pickSweepBasis", () => {
  it("prefers the newest night that scored at least half the universe", () => {
    const counts = [
      { basis_date: "2026-10-23", count: 120 },
      { basis_date: "2026-10-22", count: 832 },
    ];
    expect(pickSweepBasis(counts, 832, "2026-10-23")).toBe("2026-10-22");
  });
  it("falls back to the newest night when none is half done", () => {
    expect(pickSweepBasis([{ basis_date: "2026-10-23", count: 50 }, { basis_date: "2026-10-22", count: 60 }], 832, "2026-10-23")).toBe("2026-10-23");
  });
  it("never reads a night older than the age limit", () => {
    expect(pickSweepBasis([{ basis_date: "2026-10-10", count: 832 }], 832, "2026-10-23")).toBeNull();
  });
});
