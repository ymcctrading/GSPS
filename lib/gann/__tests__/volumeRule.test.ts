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

/** A rise into a high, then a decline, with volume and range set for the last bars into the high. */
function rallyThenDecline(intoHigh: { volume: number; range: number }): Bar[] {
  const rows: Array<[number, number, number]> = [];
  for (let i = 0; i < 30; i++) rows.push([70 + i, 1000, 2]); // steady advance on normal volume
  for (let i = 0; i < 5; i++) rows.push([100 + i * 0.5, intoHigh.volume, intoHigh.range]); // into the high
  for (let i = 1; i <= 8; i++) rows.push([102 - i, 1000, 2]); // decline away
  return bars(rows);
}

// W006 pp.39-40 (Volume Rules 1-2) and Rule 7 p.48: volume swells at tops.
// A top that comes on drying-up volume is Gann's bottom pattern, not a top.
describe("the volume rule at a high (W006 pp.39-40, 48)", () => {
  it("confirms a top made on heavy volume", () => {
    const high = computeVolumeClimax(rallyThenDecline({ volume: 4000, range: 4 })).find((r) => r.anchorKind === "high")!;
    expect(high.climax).toBe(true);
    expect(high.confirms).toBe(true);
  });

  it("does not confirm a top on drying-up volume (that is the bottom pattern)", () => {
    const high = computeVolumeClimax(rallyThenDecline({ volume: 400, range: 0.8 })).find((r) => r.anchorKind === "high")!;
    expect(high.dryingUp).toBe(true);
    expect(high.climax).toBe(false);
    expect(high.retestOnLowerVolume).toBe(false);
    expect(high.confirms).toBe(false);
  });

  it("confirms a secondary top that reaches the first on lower volume", () => {
    const rows: Array<[number, number, number]> = [];
    for (let i = 0; i < 30; i++) rows.push([70 + i, 1000, 2]);
    rows.push([100, 3000, 2]); // first top on heavy volume
    for (let i = 1; i <= 6; i++) rows.push([100 - i, 1000, 2]);
    for (let i = 1; i <= 6; i++) rows.push([94 + i, 1000, 2]);
    rows.push([100.2, 1500, 2]); // secondary top at the same level, less volume
    for (let i = 1; i <= 6; i++) rows.push([100 - i, 1000, 2]);
    const high = computeVolumeClimax(bars(rows)).find((r) => r.anchorKind === "high")!;
    expect(high.retestOnLowerVolume).toBe(true);
    expect(high.confirms).toBe(true);
  });

  it("does not read a second top on heavier volume than the first as a retest (A-VOLUME-13)", () => {
    const rows: Array<[number, number, number]> = [];
    for (let i = 0; i < 30; i++) rows.push([70 + i, 1000, 2]);
    rows.push([100, 1500, 2]); // first top
    for (let i = 1; i <= 6; i++) rows.push([100 - i, 1000, 2]);
    for (let i = 1; i <= 6; i++) rows.push([94 + i, 1000, 2]);
    rows.push([100.2, 2500, 2]); // second top at the same level, on heavier volume
    for (let i = 1; i <= 6; i++) rows.push([100 - i, 1000, 2]);
    const high = computeVolumeClimax(bars(rows)).find((r) => r.anchorKind === "high")!;
    expect(high.retestOnLowerVolume).toBe(false);
  });

  it("reads the same pivots the same way on one year or six years of history ending on the same day", () => {
    const rows: Array<[number, number, number]> = [];
    for (let i = 0; i < 2000; i++) rows.push([100 + 10 * Math.sin(i / 9) + 3 * Math.sin(i / 2.3), 1000 + 400 * Math.sin(i / 5), 2]);
    const all = bars(rows);
    const tail = all.slice(-260);
    const key = (rs: ReturnType<typeof computeVolumeClimax>) => rs.map((r) => [r.anchorKind, r.anchorPrice, r.climax, r.dryingUp, r.retestOnLowerVolume, r.confirms]);
    expect(key(computeVolumeClimax(tail))).toEqual(key(computeVolumeClimax(all)));
  });
});
