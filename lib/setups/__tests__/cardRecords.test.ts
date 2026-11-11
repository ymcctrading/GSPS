import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CARD_RECORDS, cardKindShown, type CardKind } from "@/lib/setups/cardRecords";

// The held-out read the records come from (private-research/card-goodcall/RESULT-GC1.md).
const RUN = JSON.parse(readFileSync(path.join(process.cwd(), "docs/card-records/2026-11-10-gc1-holdout.json"), "utf8")) as Record<
  string,
  { fills: number; rate: number; breakeven: number; expR: number; random_expR_mean: number; PASS: boolean }
>;

describe("CARD_RECORDS", () => {
  it("holds each measured kind to the committed held-out run", () => {
    for (const [kind, rec] of Object.entries(CARD_RECORDS)) {
      if (rec == null) continue;
      const run = RUN[kind];
      expect(run, kind).toBeDefined();
      expect(rec.fills).toBe(run.fills);
      expect(rec.goodRate).toBeCloseTo(run.rate, 3);
      expect(rec.breakEven).toBeCloseTo(run.breakeven, 3);
      expect(rec.expectancyR).toBeCloseTo(run.expR, 3);
      expect(rec.randomExpectancyR).toBeCloseTo(run.random_expR_mean, 3);
      expect(rec.passed).toBe(run.PASS);
    }
  });

  it("shows every kind positive on the held-out read (owner, 2026-11-11), not the one below break-even", () => {
    const shown = (Object.keys(CARD_RECORDS) as CardKind[]).filter((k) => cardKindShown(k));
    expect(shown.sort()).toEqual(
      ["bollinger", "donchian", "elliottWave", "maCrossover", "macdMomentum", "psarSupertrend", "rsiReversal", "stochastic"].sort(),
    );
    expect(cardKindShown("saraStrat")).toBe(false);
  });

  it("never shows a kind with no record, short of break-even or at or under zero R; the random day is not a gate", () => {
    const base = { fills: 500, goodRate: 0.5, breakEven: 0.45, expectancyR: 0.1, randomExpectancyR: 0, period: "x", passed: true, summary: "x" };
    const records = {
      ...CARD_RECORDS,
      donchian: base,
      macdMomentum: { ...base, goodRate: 0.4 },
      maCrossover: { ...base, randomExpectancyR: 0.2, passed: false },
      stochastic: { ...base, expectancyR: 0 },
      gsps: null,
    };
    expect(cardKindShown("donchian", records)).toBe(true);
    expect(cardKindShown("macdMomentum", records)).toBe(false);
    expect(cardKindShown("maCrossover", records)).toBe(true);
    expect(cardKindShown("stochastic", records)).toBe(false);
    expect(cardKindShown("gsps", records)).toBe(false);
  });

  it("names no confidential source in a summary a member reads", () => {
    // Split so the copy gate (scripts/check-banned-terms.mjs) doesn't read the list itself as copy.
    const banned = new RegExp(["ga" + "nn", "jen" + "sen", "de" + "wey", "herm" + "etic", "cyc" + "le", "as" + "tro"].join("|"), "i");
    for (const rec of Object.values(CARD_RECORDS)) {
      if (rec) expect(rec.summary).not.toMatch(banned);
    }
  });
});
