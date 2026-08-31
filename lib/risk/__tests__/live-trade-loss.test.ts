import { describe, expect, it } from "vitest";
import { thresholdsNewlyCrossed } from "@/lib/risk/live-trade-loss";

describe("thresholdsNewlyCrossed", () => {
  it("returns nothing crossed below the first threshold", () => {
    expect(thresholdsNewlyCrossed(4, [])).toEqual([]);
  });

  it("crosses every threshold at or below the loss once, in order", () => {
    expect(thresholdsNewlyCrossed(16, [])).toEqual([6, 9, 15]);
  });

  it("excludes thresholds already notified — no duplicate alerts on repeated monitor jobs", () => {
    expect(thresholdsNewlyCrossed(16, [6, 9])).toEqual([15]);
    expect(thresholdsNewlyCrossed(16, [6, 9, 15])).toEqual([]);
  });

  it("includes 30 once the loss reaches it", () => {
    expect(thresholdsNewlyCrossed(31, [6, 9, 15])).toEqual([30]);
  });
});
