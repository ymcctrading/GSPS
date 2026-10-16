import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readTopVolumeWarning } from "@/lib/gann/topVolume";

const DAY = 86_400_000;

/** Weekly bars starting on Mondays from 2024-01-01, from [close, volume] pairs. */
function weeks(rows: [number, number][]): Bar[] {
  return rows.map(([c, v], i) => ({ t: new Date(Date.UTC(2024, 0, 1) + i * 7 * DAY).toISOString(), o: c, h: c + 1, l: c - 1, c, v }));
}

/** A rise to a top in week 20 on heavy volume, a reaction, then a second rise. */
function campaign(lastVolume: number): Bar[] {
  const rows: [number, number][] = [];
  for (let i = 0; i < 20; i++) rows.push([60 + 2 * i, 1000]);
  rows.push([100, 5000]); // the major top
  for (let i = 1; i <= 8; i++) rows.push([100 - 3 * i, 1200]);
  for (let i = 1; i <= 10; i++) rows.push([76 + 2 * i, 1500 + 100 * i]);
  rows.push([97, lastVolume]);
  return weeks(rows);
}

const after = (w: Bar[]) => new Date(Date.parse(w[w.length - 1].t) + 7 * DAY + DAY);

describe("the largest weekly volume since a prior top (A-VOLUME-12, W006 p.44)", () => {
  it("warns when the last completed week is the heaviest since the last major top", () => {
    const w = campaign(4000);
    const r = readTopVolumeWarning(w, after(w))!;
    expect(r.warning).toBe(true);
    expect(r.sinceTop).toBe(w[20].t.slice(0, 10));
    expect(r.weekVolume).toBe(4000);
  });

  it("does not warn when a heavier week came after the top, and counts only weeks after it", () => {
    expect(readTopVolumeWarning(campaign(2400), after(campaign(2400)))!.warning).toBe(false);
    // Heavier than every week since the top, though lighter than the top week itself.
    const w = campaign(4900);
    expect(readTopVolumeWarning(w, after(w))!.warning).toBe(true);
  });

  it("does not count the week still in progress", () => {
    const w = campaign(4000);
    // asOf inside the last week: that week is partial, so the last completed week is the one before it.
    const inWeek = new Date(Date.parse(w[w.length - 1].t) + 2 * DAY);
    const r = readTopVolumeWarning(w, inWeek)!;
    expect(r.weekVolume).toBe(2500);
    expect(r.warning).toBe(true);
  });

  it("is null with no major top to count from", () => {
    const w = weeks(Array.from({ length: 30 }, (_, i) => [50 + i, 1000] as [number, number]));
    expect(readTopVolumeWarning(w, after(w))).toBeNull();
  });

  it("reads the same on a year of weeks or three years ending on the same day", () => {
    const early = weeks(Array.from({ length: 104 }, (_, i) => [200 + 30 * Math.sin(i / 6), 9000] as [number, number]));
    const w = campaign(4000);
    const shifted = w.map((b, i) => ({ ...b, t: new Date(Date.parse(early[early.length - 1].t) + (i + 1) * 7 * DAY).toISOString() }));
    const long = [...early, ...shifted];
    const asOf = after(long);
    expect(readTopVolumeWarning(long.slice(-52), asOf)).toEqual(readTopVolumeWarning(long, asOf));
  });

  it("is read from the daily bars on the setup, shown on the card and measured against a long", async () => {
    const { readDisclosedRules, describeDisclosedRules } = await import("@/lib/gann/disclosedRules");
    const { contextFactorsFor } = await import("@/lib/gann/contextFactors");
    const w = campaign(4000);
    const daily: Bar[] = w.flatMap((b) => Array.from({ length: 5 }, (_, d) => ({ ...b, t: new Date(Date.parse(b.t) + d * DAY).toISOString(), v: b.v / 5 })));
    const asOf = after(w);
    const ctx = readDisclosedRules(daily, 97, null, asOf);
    expect(ctx.topVolume?.warning).toBe(true);
    expect(describeDisclosedRules(ctx).some((l) => l.includes("the heaviest weekly volume since the") && l.includes("Watch for a top."))).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 97).topVolumeWarningAgainst).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 97).topVolumeWarningWith).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 97).topVolumeWarningAgainst).toBe(false);
  });
});
