import { describe, expect, it } from "vitest";
import { stopBrokenSince } from "@/lib/lifecycle/armFromBars";

const bar = (h: number, l: number) => ({ h, l });

describe("stopBrokenSince", () => {
  it("is broken once a bar since generation traded through a long's stop", () => {
    expect(stopBrokenSince("bullish", 95, [bar(101, 97), bar(99, 94.9), bar(102, 98)], 101)).toBe(true);
  });

  it("is broken when the latest price is through a short's stop", () => {
    expect(stopBrokenSince("bearish", 105, [bar(104, 100)], 105.2)).toBe(true);
  });

  it("is intact while no bar or price has reached the stop", () => {
    expect(stopBrokenSince("bullish", 95, [bar(101, 97), bar(100, 96)], 99)).toBe(false);
    expect(stopBrokenSince("bearish", 105, [bar(104, 100)], 103)).toBe(false);
    expect(stopBrokenSince("bullish", 95, [], null)).toBe(false);
  });
});
