import { describe, expect, it } from "vitest";
import { isBinaryEventInHoldPeriod } from "../earnings";

describe("isBinaryEventInHoldPeriod", () => {
  it("returns null (unknown) for a symbol outside the covered mega-cap universe", () => {
    expect(isBinaryEventInHoldPeriod("ZZZZ_NOT_COVERED", new Date("2026-06-01T00:00:00Z"), 7)).toBeNull();
  });

  it("returns a boolean for a covered mega-cap symbol", () => {
    const result = isBinaryEventInHoldPeriod("AAPL", new Date("2026-06-01T00:00:00Z"), 7);
    expect(typeof result).toBe("boolean");
  });

  it("is deterministic across repeated calls for the same inputs", () => {
    const asOf = new Date("2026-03-15T00:00:00Z");
    const first = isBinaryEventInHoldPeriod("MSFT", asOf, 10);
    const second = isBinaryEventInHoldPeriod("MSFT", asOf, 10);
    expect(first).toBe(second);
  });
});
