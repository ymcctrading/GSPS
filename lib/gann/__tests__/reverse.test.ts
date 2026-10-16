import { describe, expect, it } from "vitest";
import { gannReversal, reversesOn } from "../reverse";
import { gannThreePoints } from "../pointScale";

describe("reverse when caught", () => {
  it("a long caught at its stop goes short at the stop, its stop 3 points over the top", () => {
    const r = gannReversal({ side: "long", brokenLevel: 72, extreme: 75 });
    expect(r).toEqual({ side: "short", entry: 72, stop: 75 + gannThreePoints(75) });
  });

  it("a short caught goes long, its stop 3 points under the bottom", () => {
    const r = gannReversal({ side: "short", brokenLevel: 48, extreme: 44 });
    expect(r).toEqual({ side: "long", entry: 48, stop: 44 - gannThreePoints(44) });
  });

  it("reverses on a stop and on a change of trend, not on the hold test or three adverse closes", () => {
    expect(reversesOn("initial")).toBe(true);
    expect(reversesOn("last_reaction")).toBe(true);
    expect(reversesOn("trend_change")).toBe(true);
    expect(reversesOn("failed_top")).toBe(true);
    expect(reversesOn("distribution")).toBe(true);
    expect(reversesOn("hold_test_failed")).toBe(false);
    expect(reversesOn("three_adverse_closes")).toBe(false);
    expect(reversesOn(null)).toBe(false);
  });

  it("refuses degenerate geometry", () => {
    expect(gannReversal({ side: "long", brokenLevel: 0, extreme: 75 })).toBeNull();
    expect(gannReversal({ side: "long", brokenLevel: 200, extreme: 75 })).toBeNull();
  });
});
