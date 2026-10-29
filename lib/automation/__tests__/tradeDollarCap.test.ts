import { describe, expect, it } from "vitest";
import { capRefusal, capShares, maxSharesForCap, readTradeDollarCap } from "@/lib/automation/tradeDollarCap";

describe("per-trade dollar limit", () => {
  it("reads a stored limit, and none for blank, zero, negative or junk", () => {
    expect(readTradeDollarCap(250)).toBe(250);
    expect(readTradeDollarCap("1000")).toBe(1000);
    for (const v of [null, undefined, 0, -5, "", "abc", Number.NaN, Infinity]) expect(readTradeDollarCap(v)).toBeNull();
  });

  it("buys the whole shares that fit under the limit, with the ladder's headroom", () => {
    expect(maxSharesForCap(1000, 301.86)).toBe(3); // $905.58
    expect(maxSharesForCap(250, 52.5)).toBe(4);
    expect(maxSharesForCap(50, 23.36)).toBe(2);
    expect(maxSharesForCap(50, 432.35)).toBe(0);
    expect(maxSharesForCap(null, 432.35)).toBe(Infinity);
    expect(maxSharesForCap(100, 0)).toBe(0);
  });

  it("only ever takes shares away", () => {
    expect(capShares(21, 1000, 432.35)).toBe(2);
    expect(capShares(1, 1000, 100)).toBe(1);
    expect(capShares(40, null, 100)).toBe(40);
    expect(capShares(5, 50, 432.35)).toBe(0);
  });

  it("says plainly why a stock was skipped", () => {
    expect(capRefusal("ISRG", 50, 432.35)).toBe("One share of ISRG at $432.35 costs more than your $50 per-trade limit.");
  });
});
