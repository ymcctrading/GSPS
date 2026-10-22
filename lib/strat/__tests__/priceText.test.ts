import { describe, expect, it } from "vitest";
import { priceText, priceUsd, roundPrice } from "../priceText";

describe("priceText", () => {
  it("keeps cents at a dollar and above, three significant figures below", () => {
    expect(priceText(12.5)).toBe("12.50");
    expect(priceText(0.16123)).toBe("0.1612");
    expect(priceText(0.5)).toBe("0.50");
    expect(roundPrice(0.16123)).toBe(0.1612);
  });

  it("shows a sub-dollar price that rounds to a dollar in cents", () => {
    expect(priceText(0.99999)).toBe("1.00");
  });

  it("reads a missing or non-finite price as a dash", () => {
    expect(priceText(null)).toBe("—");
    expect(priceText(undefined)).toBe("—");
    expect(priceText(Number.NaN)).toBe("—");
    expect(priceText(Infinity)).toBe("—");
  });
});

describe("priceUsd", () => {
  it("adds the dollar sign and thousands separators", () => {
    expect(priceUsd(67123.45)).toBe("$67,123.45");
    expect(priceUsd(1234567.891)).toBe("$1,234,567.89");
    expect(priceUsd(0.16123)).toBe("$0.1612");
    expect(priceUsd(999)).toBe("$999.00");
  });

  it("puts the sign before the dollar and never prints a dollar on a dash", () => {
    expect(priceUsd(-0.5)).toBe("-$0.50");
    expect(priceUsd(-1234.5)).toBe("-$1,234.50");
    expect(priceUsd(null)).toBe("—");
  });
});
