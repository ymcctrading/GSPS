import { describe, expect, it } from "vitest";
import { isReconstructed, RECONSTRUCTED_LABEL, RECONSTRUCTED_NOTE } from "@/lib/scan/reconstructed";

describe("a reconstructed scan day", () => {
  it("is marked by the backfill's stamp and nothing else", () => {
    expect(isReconstructed({ backfilledAt: "2026-11-30T16:05:00Z" })).toBe(true);
    expect(isReconstructed({ backfilledAt: "" })).toBe(false);
    expect(isReconstructed({ backfilledAt: null })).toBe(false);
    expect(isReconstructed({})).toBe(false);
    expect(isReconstructed(null)).toBe(false);
    expect(isReconstructed(undefined)).toBe(false);
  });

  it("says what differs from a list published that evening", () => {
    expect(RECONSTRUCTED_LABEL).toBe("Reconstructed after the fact");
    expect(RECONSTRUCTED_NOTE).toContain("fixed list of large companies");
    expect(RECONSTRUCTED_NOTE).toContain("split");
    expect(RECONSTRUCTED_NOTE).toContain("No member saw this list that evening");
  });
});
