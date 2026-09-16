import { describe, expect, it } from "vitest";
import { computeDecadeCycle } from "../decadeCycle";

describe("computeDecadeCycle", () => {
  it("reads a '1' year (bear ends, bull begins) as bullish", () => {
    expect(computeDecadeCycle(new Date("2021-06-01T00:00:00Z"))).toMatchObject({
      yearDigit: 1,
      bias: "bullish",
    });
  });

  it("reads a '9' year (strongest bull peak, then reversal) as mixed", () => {
    expect(computeDecadeCycle(new Date("2029-06-01T00:00:00Z"))).toMatchObject({
      yearDigit: 9,
      bias: "mixed",
    });
  });

  it("reads a year ending in 0 as digit 10, per Gann's own numbering", () => {
    expect(computeDecadeCycle(new Date("2030-06-01T00:00:00Z"))).toMatchObject({
      yearDigit: 10,
      bias: "bearish",
    });
  });

  it("reads a '7' year as bearish", () => {
    expect(computeDecadeCycle(new Date("2027-06-01T00:00:00Z"))).toMatchObject({
      yearDigit: 7,
      bias: "bearish",
    });
  });
});
