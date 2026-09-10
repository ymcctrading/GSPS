import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeVolumeClimax, VOLUME_CLIMAX_THRESHOLD } from "../volumeClimax";

/**
 * 20 flat baseline bars (volume 1000, so relativeVolume() always has a full
 * trailing lookback before either pivot), then the same low/high pivot
 * shape lib/gann/__tests__/timePriceSquare.test.ts uses (low pivot at
 * absolute index 25, high pivot at absolute index 35), with each pivot's
 * own volume set independently so a test can climax one anchor without
 * touching the other's trailing average.
 */
function bars(lowVolume = 1000, highVolume = 1000): Bar[] {
  const baseline = Array.from({ length: 20 }, () => 100);
  const shape = [
    100, 98, 96, 94, 92, 90, 92, 94, 96, 98, 100, 110, 120, 125, 128, 130, 128, 126, 124, 122, 120,
    119, 118, 117, 116,
  ];
  const closes = [...baseline, ...shape];
  return closes.map((c, i) => {
    const v = i === 25 ? lowVolume : i === 35 ? highVolume : 1000;
    return { t: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, o: c, h: c, l: c, c, v };
  });
}

describe("computeVolumeClimax", () => {
  it("reads both the low-anchored and high-anchored pivot", () => {
    const readings = computeVolumeClimax(bars());
    const kinds = readings.map((r) => r.anchorKind).sort();
    expect(kinds).toEqual(["high", "low"]);
  });

  it("flags a climax when the anchor's own volume clears the threshold against its trailing average", () => {
    const readings = computeVolumeClimax(bars(2000, 1000));
    const low = readings.find((r) => r.anchorKind === "low");
    expect(low?.relativeVolume).toBe(2);
    expect(low?.climax).toBe(true);
  });

  it("does not flag a climax at ordinary volume", () => {
    const readings = computeVolumeClimax(bars(1000, 1000));
    const low = readings.find((r) => r.anchorKind === "low");
    expect(low?.relativeVolume).toBe(1);
    expect(low?.climax).toBe(false);
  });

  it("treats the two anchors independently", () => {
    const readings = computeVolumeClimax(bars(1000, 2500));
    const low = readings.find((r) => r.anchorKind === "low");
    const high = readings.find((r) => r.anchorKind === "high");
    expect(low?.climax).toBe(false);
    expect(high?.relativeVolume).toBe(2.5);
    expect(high?.climax).toBe(true);
  });

  it("sits exactly on the documented threshold at the boundary", () => {
    // Exactly at the threshold does not climax — the check is strictly >.
    const atThreshold = computeVolumeClimax(bars(VOLUME_CLIMAX_THRESHOLD * 1000, 1000));
    expect(atThreshold.find((r) => r.anchorKind === "low")?.climax).toBe(false);
  });

  it("returns no readings when there isn't enough history for either pivot detection or the volume lookback", () => {
    expect(computeVolumeClimax(bars().slice(0, 10))).toEqual([]);
  });
});
