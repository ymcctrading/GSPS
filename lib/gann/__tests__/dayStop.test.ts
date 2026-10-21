import { describe, expect, it } from "vitest";
import { gannDayStop, trailDayStop } from "@/lib/gann/dayStop";
import { gannPoint } from "@/lib/gann/pointScale";

describe("the day stop (W006 Rule 2: 3 points, the safest)", () => {
  it("sits 3 points under the day's low for a long, over the day's high for a short", () => {
    expect(gannDayStop({ extreme: 42.5, side: "long" })).toBeCloseTo(39.5, 6);
    expect(gannDayStop({ extreme: 42.5, side: "short" })).toBeCloseTo(45.5, 6);
    expect(gannDayStop({ extreme: 100, side: "long", points: 1 })).toBeCloseTo(100 - gannPoint(100), 9);
  });

  it("never sits looser than the plan's own stop", () => {
    expect(gannDayStop({ extreme: 42.5, side: "long", planStop: 40 })).toBe(40);
    expect(gannDayStop({ extreme: 42.5, side: "long", planStop: 38 })).toBeCloseTo(39.5, 6);
    expect(gannDayStop({ extreme: 42.5, side: "short", planStop: 45 })).toBe(45);
  });

  it("trails one way only", () => {
    const first = trailDayStop(null, { extreme: 50, side: "long" });
    expect(trailDayStop(first, { extreme: 48, side: "long" })).toBe(first);
    expect(trailDayStop(first, { extreme: 55, side: "long" })!).toBeGreaterThan(first!);
  });

  it("returns null without a price", () => {
    expect(gannDayStop({ extreme: 0, side: "long" })).toBeNull();
  });
});
