import { describe, expect, it } from "vitest";
import { chooseSizeRung, costFigures, rungOf } from "@/lib/automation/sizeLadder";

describe("costFigures / rungOf", () => {
  it("counts whole-dollar digits", () => {
    expect(costFigures(87.4)).toBe(2);
    expect(costFigures(999.99)).toBe(3);
    expect(costFigures(1_250)).toBe(4);
    expect(costFigures(48_734)).toBe(5);
    expect(costFigures(0.5)).toBe(0);
    expect(costFigures(Number.NaN)).toBe(0);
  });
  it("puts five figures and up on the full rung", () => {
    expect(rungOf(29_000)).toBe("full");
    expect(rungOf(250_000)).toBe("full");
    expect(rungOf(5)).toBeNull();
  });
});

describe("chooseSizeRung", () => {
  it("starts an empty book on the smallest rung the price allows", () => {
    // $72 stock, account size 387 shares: 1 share is a 2-figure position.
    expect(chooseSizeRung({ entry: 72, accountQty: 387, openCosts: [] })).toEqual({ rung: 2, qty: 1 });
  });

  it("takes the rung the book holds fewest of", () => {
    // Book: one 2-figure, one 3-figure; next is 4 figures, 9,500 / 72 = 131 shares.
    const c = chooseSizeRung({ entry: 72, accountQty: 387, openCosts: [70, 700] });
    expect(c).toEqual({ rung: 4, qty: 131 });
    expect(131 * 72).toBeLessThan(10_000);
    expect(chooseSizeRung({ entry: 72, accountQty: 387, openCosts: [70, 700, 9_000] })).toEqual({ rung: "full", qty: 387 });
  });

  it("skips a rung the share price is too high for", () => {
    // $528 a share: no 2-figure position exists; 1 share is 3 figures.
    expect(chooseSizeRung({ entry: 528, accountQty: 60, openCosts: [] })).toEqual({ rung: 3, qty: 1 });
  });

  it("never sizes above the account's own shares", () => {
    // The account's size is 3 shares ($216), already 3 figures: no 3- or 4-figure cap applies.
    const c = chooseSizeRung({ entry: 72, accountQty: 3, openCosts: [70] });
    expect(c).toEqual({ rung: "full", qty: 3 });
    for (const open of [[], [70], [70, 700], [70, 700, 9_000]]) {
      const r = chooseSizeRung({ entry: 72, accountQty: 3, openCosts: open });
      expect(r!.qty).toBeLessThanOrEqual(3);
    }
  });

  it("keeps a capped position inside its rung with headroom for the fill", () => {
    for (const entry of [11.3, 47.9, 99, 320.62, 3_100]) {
      for (const rung of [2, 3, 4] as const) {
        const openCosts = [2, 3, 4].filter((r) => r < rung).map((r) => 10 ** r - 1);
        const c = chooseSizeRung({ entry, accountQty: 100_000, openCosts });
        if (c && c.rung === rung) {
          expect(c.qty * entry).toBeLessThanOrEqual(0.95 * 10 ** rung);
          expect(c.qty).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("returns nothing for no shares or no price", () => {
    expect(chooseSizeRung({ entry: 50, accountQty: 0, openCosts: [] })).toBeNull();
    expect(chooseSizeRung({ entry: 0, accountQty: 10, openCosts: [] })).toBeNull();
  });
});
