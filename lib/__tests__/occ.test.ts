import { describe, it, expect } from "vitest";
import { parseOccSymbol, isOccOptionSymbol } from "@/lib/portfolio/occ";

describe("parseOccSymbol", () => {
  it("parses a standard OCC symbol", () => {
    const p = parseOccSymbol("AAPL250117C00220000");
    expect(p).toEqual({
      underlying: "AAPL",
      expiration: "2025-01-17",
      type: "call",
      strike: 220,
    });
  });

  it("parses a put with a fractional strike", () => {
    const p = parseOccSymbol("TSM250815P00120500");
    expect(p?.type).toBe("put");
    expect(p?.strike).toBeCloseTo(120.5);
    expect(p?.underlying).toBe("TSM");
  });

  it("accepts single-letter roots and lowercase input", () => {
    const p = parseOccSymbol("f250117c00012000");
    expect(p?.underlying).toBe("F");
    expect(p?.strike).toBe(12);
  });

  it("returns null for a plain equity ticker", () => {
    expect(parseOccSymbol("AAPL")).toBeNull();
    expect(parseOccSymbol("SPY")).toBeNull();
  });

  it("returns null for malformed suffixes", () => {
    expect(parseOccSymbol("AAPL25011C00220000")).toBeNull(); // short date
    expect(parseOccSymbol("AAPL250117X00220000")).toBeNull(); // bad C/P flag
    expect(parseOccSymbol("AAPL250117C0022000")).toBeNull(); // short strike
  });
});

describe("isOccOptionSymbol", () => {
  it("agrees with parseOccSymbol", () => {
    expect(isOccOptionSymbol("AAPL250117C00220000")).toBe(true);
    expect(isOccOptionSymbol("AAPL")).toBe(false);
  });
});
