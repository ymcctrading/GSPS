import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeVolumeClimax } from "../volumeClimax";

/** Daily bars from a list of [close, volume, range] triples. */
function bars(rows: Array<[number, number, number]>): Bar[] {
  return rows.map(([c, v, r], i) => ({
    t: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
    o: c,
    h: c + r / 2,
    l: c - r / 2,
    c,
    v,
  }));
}

/** A decline into a low, then a rally, with volume and range set for the last bars into the low. */
function declineThenRally(intoLow: { volume: number; range: number }): Bar[] {
  const rows: Array<[number, number, number]> = [];
  for (let i = 0; i < 30; i++) rows.push([130 - i, 1000, 2]); // steady decline on normal volume
  for (let i = 0; i < 5; i++) rows.push([100 - i * 0.5, intoLow.volume, intoLow.range]); // into the low
  for (let i = 1; i <= 8; i++) rows.push([98 + i, 1000, 2]); // rally away
  return bars(rows);
}

describe("the volume rule at a low (parity D1)", () => {
  it("confirms a normal bottom on drying-up volume and a narrowing range", () => {
    const low = computeVolumeClimax(declineThenRally({ volume: 400, range: 0.8 })).find((r) => r.anchorKind === "low")!;
    expect(low.dryingUp).toBe(true);
    expect(low.climax).toBe(false);
    expect(low.confirms).toBe(true);
  });

  it("confirms a panic bottom on climax volume (the exception)", () => {
    const low = computeVolumeClimax(declineThenRally({ volume: 4000, range: 4 })).find((r) => r.anchorKind === "low")!;
    expect(low.climax).toBe(true);
    expect(low.confirms).toBe(true);
  });

  it("does not confirm a low on ordinary volume and range", () => {
    const low = computeVolumeClimax(declineThenRally({ volume: 1000, range: 2 })).find((r) => r.anchorKind === "low")!;
    expect(low.dryingUp).toBe(false);
    expect(low.climax).toBe(false);
    expect(low.retestOnLowerVolume).toBe(false);
    expect(low.confirms).toBe(false);
  });
});
