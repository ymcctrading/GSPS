import { describe, expect, it } from "vitest";
import {
  buildDigitalRootFeature,
  calculateGannDr,
  classifyConfluence,
  digitalRoot1to9,
  gannComplement,
  resolvesToCompletion,
  vortexClass,
} from "../digitalRoot";

describe("digitalRoot1to9", () => {
  it("computes DR(n) = 1 + ((n - 1) mod 9) for the canonical sequence", () => {
    expect(digitalRoot1to9(1)).toBe(1);
    expect(digitalRoot1to9(9)).toBe(9);
    expect(digitalRoot1to9(10)).toBe(1);
    expect(digitalRoot1to9(17)).toBe(8);
    expect(digitalRoot1to9(18)).toBe(9);
  });

  it("throws for zero, negative, non-integer, or non-finite input", () => {
    expect(() => digitalRoot1to9(0)).toThrow(RangeError);
    expect(() => digitalRoot1to9(-5)).toThrow(RangeError);
    expect(() => digitalRoot1to9(4.5)).toThrow(RangeError);
    expect(() => digitalRoot1to9(NaN)).toThrow(RangeError);
    expect(() => digitalRoot1to9(Infinity)).toThrow(RangeError);
  });
});

describe("calculateGannDr (legacy decimal-strip)", () => {
  it("strips non-digit characters and reduces what remains", () => {
    expect(calculateGannDr("$123.45")).toBe(digitalRoot1to9(12345));
    expect(calculateGannDr(123.45)).toBe(digitalRoot1to9(12345));
  });

  it("returns null (absence), never root 9, for missing or all-zero input", () => {
    expect(calculateGannDr("")).toBeNull();
    expect(calculateGannDr("abc")).toBeNull();
    expect(calculateGannDr("$0.00")).toBeNull();
    expect(calculateGannDr(0)).toBeNull();
  });
});

describe("gannComplement / resolvesToCompletion", () => {
  it("matches the fixed polarity-pair table", () => {
    expect(gannComplement(1)).toBe(8);
    expect(gannComplement(8)).toBe(1);
    expect(gannComplement(2)).toBe(7);
    expect(gannComplement(3)).toBe(6);
    expect(gannComplement(4)).toBe(5);
    expect(gannComplement(9)).toBe(9);
  });

  it("throws for a root outside 1-9", () => {
    expect(() => gannComplement(0)).toThrow(RangeError);
    expect(() => gannComplement(10)).toThrow(RangeError);
  });

  it("resolves complement pairs to completion (sum digital-roots to 9)", () => {
    expect(resolvesToCompletion(1, 8)).toBe(true);
    expect(resolvesToCompletion(3, 6)).toBe(true);
    expect(resolvesToCompletion(9, 9)).toBe(true);
    expect(resolvesToCompletion(1, 2)).toBe(false);
  });
});

describe("vortexClass", () => {
  it("classifies 1, 2, 4, 8, 7, 5 as VORTEX_FLOW (root 1 included, not a separate node)", () => {
    for (const root of [1, 2, 4, 8, 7, 5]) {
      expect(vortexClass(root)).toBe("VORTEX_FLOW");
    }
  });

  it("classifies 3 and 6 as POLARITY_AXIS", () => {
    expect(vortexClass(3)).toBe("POLARITY_AXIS");
    expect(vortexClass(6)).toBe("POLARITY_AXIS");
  });

  it("classifies 9 as COMPLETION_NODE", () => {
    expect(vortexClass(9)).toBe("COMPLETION_NODE");
  });
});

describe("classifyConfluence", () => {
  it("reports NINE_COMPLETION when either root is 9 (and not also a named pair)", () => {
    expect(classifyConfluence(9, 2)).toBe("NINE_COMPLETION");
  });

  it("reports COMPLEMENTARY_PAIR for a named polarity-pair match", () => {
    expect(classifyConfluence(1, 8)).toBe("COMPLEMENTARY_PAIR");
    expect(classifyConfluence(2, 7)).toBe("COMPLEMENTARY_PAIR");
  });

  it("reports THREE_SIX_POLARITY for a 3/6-only pair", () => {
    expect(classifyConfluence(3, 3)).toBe("THREE_SIX_POLARITY");
  });

  it("reports MULTI_FACTOR_CONFLUENCE when more than one condition matches at once", () => {
    // 3 and 6 are both a named complementary pair AND both on the 3/6 axis.
    expect(classifyConfluence(3, 6)).toBe("MULTI_FACTOR_CONFLUENCE");
    // 9 and 9 are both the named 9:9 complementary pair AND a nine-completion.
    expect(classifyConfluence(9, 9)).toBe("MULTI_FACTOR_CONFLUENCE");
  });

  it("reports NO_CONFLUENCE when no relationship matches", () => {
    expect(classifyConfluence(2, 4)).toBe("NO_CONFLUENCE");
  });
});

describe("buildDigitalRootFeature", () => {
  it("carries full provenance for a valid normalized integer", () => {
    const feature = buildDigitalRootFeature(17, {
      normalizationMethod: "bars_since_pivot",
      sourceTimeframe: "1d",
      featureVersion: "0.1.0",
      asOf: "2026-09-08T00:00:00Z",
    });
    expect(feature).toEqual({
      rawValue: 17,
      normalizationMethod: "bars_since_pivot",
      integerValue: 17,
      mod9Residue: 8,
      activeDigitalRoot: 8,
      inputTimestamp: "2026-09-08T00:00:00Z",
      sourceTimeframe: "1d",
      featureVersion: "0.1.0",
    });
  });

  it("returns null (absence) for zero, negative, or non-integer input rather than a guessed root", () => {
    const ctx = { normalizationMethod: "x", sourceTimeframe: "1d", featureVersion: "0.1.0" };
    expect(buildDigitalRootFeature(0, ctx)).toBeNull();
    expect(buildDigitalRootFeature(-3, ctx)).toBeNull();
    expect(buildDigitalRootFeature(1.5, ctx)).toBeNull();
  });
});
