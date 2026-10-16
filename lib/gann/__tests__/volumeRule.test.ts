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
    expect(high.retestWeekVolumeRatio!).toBeGreaterThan(1);
  });

  it("measures a double top's volume as the second top's week over the first's (A-VOLUME-13)", () => {
    // Weekday bars, Monday 2026-01-05 on: the first top's week trades 9,000, the second's 6,000 (two-thirds).
    const t0 = Date.UTC(2026, 0, 5);
    const day = (k: number) => t0 + (Math.floor(k / 5) * 7 + (k % 5)) * 86_400_000;
    const closes: number[] = [];
    for (let i = 0; i < 30; i++) closes.push(70 + i);
    closes.push(100, 99, 98, 97, 96);
    for (let i = 0; i < 5; i++) closes.push(95 - i);
    for (let i = 0; i < 4; i++) closes.push(92 + 2 * i);
    closes.push(100.2);
    for (let i = 0; i < 10; i++) closes.push(99 - i);
    const rows = closes.map((c, k) => {
      // Uneven inside each week, so the top days' own volumes (1,000 and 1,800) give a different ratio.
      const v = k >= 30 && k < 35 ? [1000, 3000, 1800, 1800, 1400][k - 30] : k >= 40 && k < 45 ? [600, 1200, 1200, 1200, 1800][k - 40] : 1000;
      return { t: new Date(day(k)).toISOString(), o: c, h: c + 1, l: c - 1, c, v };
    });
    const high = computeVolumeClimax(rows).find((r) => r.anchorKind === "high")!;
    expect(high.anchorPrice).toBeCloseTo(101.2, 6);
    expect(high.retestWeekVolumeRatio).toBeCloseTo(2 / 3, 6);
    // FV3: the weeks decide, though the second top's own day (1,800) outweighs the first's (1,000).
    expect(high.retestOnLowerVolume).toBe(true);
    // A second top that stops short of the first is not a double top: no ratio.
    const short = rows.map((r, k) => (k >= 40 ? { ...r, o: r.o - 8, h: r.h - 8, l: r.l - 8, c: r.c - 8 } : r));
    expect(computeVolumeClimax(short).find((r) => r.anchorKind === "high")!.retestWeekVolumeRatio).toBeNull();
  });

  it("puts the second top's volume on the setup and measures two-thirds and a third", async () => {
    const { describeDisclosedRules } = await import("@/lib/gann/disclosedRules");
    const { contextFactorsFor } = await import("@/lib/gann/contextFactors");
    const { readDisclosedRules } = await import("@/lib/gann/disclosedRules");
    const t0 = Date.UTC(2026, 0, 5);
    const day = (k: number) => t0 + (Math.floor(k / 5) * 7 + (k % 5)) * 86_400_000;
    const closes: number[] = [];
    for (let i = 0; i < 30; i++) closes.push(70 + i);
    closes.push(100, 99, 98, 97, 96);
    for (let i = 0; i < 5; i++) closes.push(95 - i);
    for (let i = 0; i < 4; i++) closes.push(92 + 2 * i);
    closes.push(100.2);
    for (let i = 0; i < 10; i++) closes.push(99 - i);
    const rows = closes.map((c, k) => {
      const v = k >= 30 && k < 35 ? 3600 : k >= 40 && k < 45 ? 1200 : 1000;
      return { t: new Date(day(k)).toISOString(), o: c, h: c + 1, l: c - 1, c, v };
    });
    const ctx = readDisclosedRules(rows, 90, null, new Date(rows[rows.length - 1].t));
    expect(ctx.secondTopVolumeRatio).toBeCloseTo(6000 / 18000, 6);
    expect(describeDisclosedRules(ctx).some((l) => l.startsWith("A second top at the first top's level on 33% of its week's volume."))).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 90)).toMatchObject({ secondTopTwoThirdsVolumeAgainst: true, secondTopThirdVolumeAgainst: true });
    expect(contextFactorsFor(ctx, "bearish", 90)).toMatchObject({ secondTopTwoThirdsVolumeWith: true, secondTopThirdVolumeWith: true, secondTopThirdVolumeAgainst: false });
    expect(contextFactorsFor({ ...ctx, secondTopVolumeRatio: 0.5 }, "bullish", 90)).toMatchObject({ secondTopTwoThirdsVolumeAgainst: true, secondTopThirdVolumeAgainst: false });
    expect(contextFactorsFor(ctx, "bearish", 90)).toMatchObject({ secondTopTwoThirdsVolumeAgainst: false });
    expect(contextFactorsFor(ctx, "bullish", 90)).toMatchObject({ secondTopTwoThirdsVolumeWith: false });
    const heavier = { ...ctx, secondTopVolumeRatio: 0.8 };
    expect(contextFactorsFor(heavier, "bullish", 90)).toMatchObject({ secondTopTwoThirdsVolumeAgainst: false });
    expect(describeDisclosedRules(heavier).some((l) => l.startsWith("A second top"))).toBe(false);
  });

  it("reads the same pivots the same way on one year or six years of history ending on the same day", () => {
    const rows: Array<[number, number, number]> = [];
    for (let i = 0; i < 2000; i++) rows.push([100 + 10 * Math.sin(i / 9) + 3 * Math.sin(i / 2.3), 1000 + 400 * Math.sin(i / 5), 2]);
    const all = bars(rows);
    const tail = all.slice(-260);
    const key = (rs: ReturnType<typeof computeVolumeClimax>) =>
      rs.map((r) => [r.anchorKind, r.anchorPrice, r.climax, r.dryingUp, r.retestOnLowerVolume, r.secondaryOnLowerVolume, r.panicSecondary, r.heavyAdvance, r.confirms]);
    expect(key(computeVolumeClimax(tail))).toEqual(key(computeVolumeClimax(all)));
  });
});

/** Weekday bars from Monday 2025-01-06, stamped at midnight New York time; each spans close ± 1. */
function weekdays(rows: Array<[number, number]>): Bar[] {
  const t0 = Date.UTC(2025, 0, 6, 5);
  return rows.map(([c, v], k) => ({ t: new Date(t0 + (Math.floor(k / 5) * 7 + (k % 5)) * 86_400_000).toISOString(), o: c, h: c + 1, l: c - 1, c, v }));
}

/** An advance to a top at 100, a decline to 80 at `declineVolume`, a rally to a lower top at 90 with the given day volumes, then a decline. */
function lowerSecondaryTop(declineVolume: number, rallyVolumes: number[], after = 10): Bar[] {
  const rows: Array<[number, number]> = [];
  for (let i = 0; i < 30; i++) rows.push([70 + i, 1000]);
  rows.push([100, 1400]);
  for (let i = 1; i <= 4; i++) rows.push([100 - i * 0.5, 1400]); // the first top's week
  for (let i = 1; i <= 10; i++) rows.push([98 - i * 1.8, declineVolume]); // to 80
  for (let i = 1; i <= 5; i++) rows.push([80 + i * 2, rallyVolumes[i - 1]]); // to the lower top, 90
  for (let i = 1; i <= after; i++) rows.push([89 - i, 1000]);
  return weekdays(rows);
}

describe("secondary moves on smaller volume, not only retests (FV1, FV3)", () => {
  it("confirms a lower secondary top on smaller volume after a decline on heavy volume (Rules 1 and 7, A-VOLUME-07)", () => {
    const high = computeVolumeClimax(lowerSecondaryTop(2500, [800, 800, 800, 800, 800])).find((r) => r.anchorKind === "high")!;
    expect(high.anchorPrice).toBeCloseTo(91, 6);
    expect(high.climax).toBe(false);
    expect(high.retestOnLowerVolume).toBe(false);
    expect(high.secondaryOnLowerVolume).toBe(true);
    expect(high.confirms).toBe(true);
  });

  it("reads a second top at the first's level as a retest, not a lower secondary top", () => {
    const b = lowerSecondaryTop(2500, [800, 800, 800, 800, 800]).map((x, k) => (k >= 45 && k < 50 ? { ...x, c: x.c + 10, h: x.h + 10, l: x.l + 10, o: x.o + 10 } : x));
    const high = computeVolumeClimax(b).find((r) => r.anchorKind === "high")!;
    expect(high.anchorPrice).toBeCloseTo(101, 6);
    expect(high.retestOnLowerVolume).toBe(true);
    expect(high.secondaryOnLowerVolume).toBe(false);
  });

  it("does not when the decline from the first top came on light volume", () => {
    const high = computeVolumeClimax(lowerSecondaryTop(700, [800, 800, 800, 800, 800])).find((r) => r.anchorKind === "high")!;
    expect(high.secondaryOnLowerVolume).toBe(false);
    expect(high.heavyAdvance).toBe(false);
    expect(high.confirms).toBe(false);
    // A heavy decline, but the lower rally's week outweighs the first top's: not on smaller volume.
    expect(computeVolumeClimax(lowerSecondaryTop(2500, [3000, 3000, 3000, 3000, 900])).find((r) => r.anchorKind === "high")!.secondaryOnLowerVolume).toBe(false);
  });

  it("confirms a top whose heaviest week since the last top came in the advance into it (FV4)", () => {
    const high = computeVolumeClimax(lowerSecondaryTop(700, [3000, 3000, 3000, 3000, 900])).find((r) => r.anchorKind === "high")!;
    expect(high.climax).toBe(false);
    // The rally's week outweighs the first top's, so it is not a secondary top on smaller volume.
    expect(high.secondaryOnLowerVolume).toBe(false);
    expect(high.heavyAdvance).toBe(true);
    expect(high.confirms).toBe(true);
  });

  it("reads the heaviest week before a top the same on a year of history or six", () => {
    const b = lowerSecondaryTop(700, [3000, 3000, 3000, 3000, 900]);
    const t0 = Date.parse(b[0].t);
    // Five years of swings before it, with bigger swings in the older years
    // (more major tops for the top quartile to rank against).
    const prefix = Array.from({ length: 1300 }, (_, k) => {
      const c = 60 + (k < 1000 ? 20 : 4) * Math.sin(k / 15);
      // The older years also trade heavier, so reading them would change the answer.
      return { t: new Date(t0 - (1300 - k) * 86_400_000 * 1.4).toISOString(), o: c, h: c + 1, l: c - 1, c, v: k < 1000 ? 4000 : 1000 };
    });
    const long = [...prefix, ...b];
    const read = (x: Bar[]) => computeVolumeClimax(x).find((r) => r.anchorKind === "high")!.heavyAdvance;
    expect(read(long.slice(-252))).toBe(true);
    expect(read(long)).toBe(true);
  });

  it("does not count a heavy week in the decline before the advance", () => {
    // The decline's first week trades 30,000, far above the rest: before the low, so it is not the advance's.
    const b = lowerSecondaryTop(700, [800, 800, 800, 800, 800]).map((x, k) => (k >= 35 && k < 40 ? { ...x, v: 6000 } : x));
    const high = computeVolumeClimax(b).find((r) => r.anchorKind === "high")!;
    expect(high.heavyAdvance).toBe(false);
  });

  it("reads the heaviest week before a top over the same weeks on a year of history or six, wherever the top sits", () => {
    // Six years of a seeded random walk with an occasional heavy day. On these
    // seeds, reading every week, or the 48 before the top, changes the answer.
    for (const seed of [6, 16, 23, 230]) {
      let s = seed >>> 0;
      const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 2 ** 32);
      let p = 100;
      const t0 = Date.UTC(2020, 0, 6, 5);
      const all: Bar[] = [];
      for (let i = 0; i < 1500; i++) {
        p *= 1 + (rand() - 0.5) * 0.05;
        const v = 1e6 * (rand() < 0.03 ? 6 : 1) * Math.exp((rand() - 0.5) * 0.6);
        all.push({ t: new Date(t0 + (Math.floor(i / 5) * 7 + (i % 5)) * 86_400_000).toISOString(), o: p, h: p * 1.01, l: p * 0.99, c: p, v });
      }
      const read = (x: Bar[]) => computeVolumeClimax(x).find((r) => r.anchorKind === "high")!.heavyAdvance;
      expect(read(all.slice(-252))).toBe(read(all));
    }
  });

  it("does not when the heaviest week does not stand out", () => {
    const high = computeVolumeClimax(lowerSecondaryTop(700, [1500, 1500, 1500, 1500, 900])).find((r) => r.anchorKind === "high")!;
    expect(high.heavyAdvance).toBe(false);
  });

  /** A year's decline to a bear low at 80, an advance at `advanceVolume`, a higher low at 85 on 800, then an advance at `afterVolume`. */
  function secondaryLow(advanceVolume: number, afterVolume: number): Bar[] {
    const rows: Array<[number, number]> = [];
    for (let i = 0; i < 40; i++) rows.push([120 - i, 1000]);
    rows.push([80, 1000]);
    for (let i = 1; i <= 10; i++) rows.push([80 + i, advanceVolume]); // to 90
    for (let i = 1; i <= 5; i++) rows.push([90 - i, 800]); // the secondary reaction to 85
    for (let i = 1; i <= 9; i++) rows.push([85 + i * 1.2, afterVolume]);
    return weekdays(rows);
  }

  it("confirms a higher secondary low out of a bear on less volume, with the next advance heavier (Rule 4, A-VOLUME-05)", () => {
    const low = computeVolumeClimax(secondaryLow(2000, 1500)).find((r) => r.anchorKind === "low")!;
    expect(low.anchorPrice).toBeCloseTo(84, 6);
    expect(low.retestOnLowerVolume).toBe(false);
    expect(low.dryingUp).toBe(false);
    expect(low.climax).toBe(false);
    expect(low.secondaryOnLowerVolume).toBe(true);
    expect(low.confirms).toBe(true);
  });

  it("does not when the advance after it is lighter, or the reaction heavier than the first advance", () => {
    expect(computeVolumeClimax(secondaryLow(2000, 600)).find((r) => r.anchorKind === "low")!.secondaryOnLowerVolume).toBe(false);
    expect(computeVolumeClimax(secondaryLow(700, 1500)).find((r) => r.anchorKind === "low")!.secondaryOnLowerVolume).toBe(false);
  });

  it("reads the bear low over the same year on one year of history or six", () => {
    const b = secondaryLow(2000, 1500);
    // A deeper low older than the year read, but within a year of the first low.
    const t0 = Date.parse(b[0].t);
    const prefix = Array.from({ length: 1500 }, (_, k) => {
      const c = k === 1500 - 200 ? 60 : 130 + 5 * Math.sin(k / 7);
      return { t: new Date(t0 - (1500 - k) * 86_400_000).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1000 };
    });
    const long = [...prefix, ...b];
    const read = (x: Bar[]) => computeVolumeClimax(x).find((r) => r.anchorKind === "low")!.secondaryOnLowerVolume;
    expect(read(long)).toBe(true);
    expect(read(long.slice(-252))).toBe(true);
  });

  it("does not when the first low was not a bear low", () => {
    // A lower low inside the year before it: the first low is a reaction, not the bear's end.
    const b = secondaryLow(2000, 1500);
    const deeper = b.map((x, k) => (k === 20 ? { ...x, l: 70 } : x));
    expect(computeVolumeClimax(deeper).find((r) => r.anchorKind === "low")!.secondaryOnLowerVolume).toBe(false);
  });

  /** A decline to a panic low at 80 on `panicVolume`, a rally, a secondary low near 84 on `secondaryVolume` a day, then a rise. */
  function panic(panicVolume: number, secondaryVolume: number): Bar[] {
    const rows: Array<[number, number]> = [];
    for (let i = 0; i < 40; i++) rows.push([120 - i, 1000]);
    rows.push([80, panicVolume]);
    for (let i = 1; i <= 7; i++) rows.push([80 + i * 1.5, 1000]); // a rally to 90.5
    for (let i = 1; i <= 5; i++) rows.push([90.5 - i * 1.3, secondaryVolume]); // the secondary decline to 84
    for (let i = 1; i <= 8; i++) rows.push([84 + i, 1000]);
    return weekdays(rows);
  }

  it("reads a panic's secondary low on half the climax week's volume or less (A-VOLUME-06)", () => {
    const low = computeVolumeClimax(panic(5000, 500)).find((r) => r.anchorKind === "low")!;
    expect(low.anchorPrice).toBeCloseTo(83, 6);
    expect(low.panicSecondary).toBe(true);
    expect(low.confirms).toBe(true);
    expect(computeVolumeClimax(panic(5000, 1200)).find((r) => r.anchorKind === "low")!.panicSecondary).toBe(false);
    // Without the climax at the first low there is no panic to follow.
    expect(computeVolumeClimax(panic(1100, 100)).find((r) => r.anchorKind === "low")!.panicSecondary).toBe(false);
    // A new low under the panic low is not its secondary low.
    const lower = panic(5000, 500).map((x, k) => (k === 53 ? { ...x, l: 70 } : x));
    const l = computeVolumeClimax(lower).find((r) => r.anchorKind === "low")!;
    expect(l.anchorPrice).toBe(70);
    expect(l.panicSecondary).toBe(false);
  });
});

describe("the smallest monthly volume in years (A-VOLUME-09)", () => {
  const months = (n: number, vol: (i: number) => number) =>
    Array.from({ length: n }, (_, i) => ({ t: new Date(Date.UTC(2021, 1 + i, 1, 5)).toISOString(), o: 100, h: 101, l: 99, c: 100, v: vol(i) }));
  // 61 months, February 2021 to February 2026; February 2026 is in progress on the 20th.
  const asOf = new Date("2026-02-20T15:00:00Z");
  const quietLow = declineThenRally({ volume: 1000, range: 2 });

  it("confirms a low when the last completed month traded the least of five years", () => {
    const monthly = months(61, (i) => (i === 59 ? 1e5 : i === 60 ? 1e3 : 1e6));
    const low = computeVolumeClimax(quietLow, 20, { monthly, asOf }).find((r) => r.anchorKind === "low")!;
    expect(low.dryingUp || low.climax || low.retestOnLowerVolume).toBe(false);
    expect(low.volumeExtremeLow).toBe(true);
    expect(low.confirms).toBe(true);
  });

  it("does not count the month in progress, however small", () => {
    const monthly = months(61, (i) => (i === 60 ? 1e3 : 1e6 + i));
    expect(computeVolumeClimax(quietLow, 20, { monthly, asOf }).find((r) => r.anchorKind === "low")!.volumeExtremeLow).toBe(false);
  });

  it("needs three years of months, and reads only the last five", () => {
    expect(computeVolumeClimax(quietLow, 20, { monthly: months(61, (i) => (i === 59 ? 1e5 : 1e6)).slice(-35), asOf }).find((r) => r.anchorKind === "low")!.volumeExtremeLow).toBe(false);
    // An even smaller month six years back does not count against it.
    const monthly = [{ ...months(1, () => 1)[0], t: new Date(Date.UTC(2020, 0, 1, 5)).toISOString() }, ...months(61, (i) => (i === 59 ? 1e5 : 1e6))];
    expect(computeVolumeClimax(quietLow, 20, { monthly, asOf }).find((r) => r.anchorKind === "low")!.volumeExtremeLow).toBe(true);
  });

  it("never reads a high as a volume-extreme bottom", () => {
    const monthly = months(61, (i) => (i === 59 ? 1e5 : 1e6));
    const high = computeVolumeClimax(rallyThenDecline({ volume: 1000, range: 2 }), 20, { monthly, asOf }).find((r) => r.anchorKind === "high")!;
    expect(high.volumeExtremeLow).toBe(false);
  });
});

describe("completed sessions only", () => {
  it("does not read the session still trading", () => {
    const b = lowerSecondaryTop(2500, [800, 800, 800, 800, 800]);
    // A huge last bar that is today's: read, it would be a new pivot week; dropped, nothing changes.
    const withToday = [...b, { ...b[b.length - 1], t: new Date(Date.parse(b[b.length - 1].t) + 3 * 86_400_000).toISOString(), v: 1e7, l: 0 }];
    const asOf = new Date(Date.parse(withToday[withToday.length - 1].t) + 10 * 3_600_000);
    expect(computeVolumeClimax(withToday, 20, { asOf })).toEqual(computeVolumeClimax(b, 20, { asOf }));
  });

  it("does not let today's part session make an advance look heavier", () => {
    const rows: Array<[number, number]> = [];
    for (let i = 0; i < 40; i++) rows.push([120 - i, 1000]);
    rows.push([80, 1000]);
    for (let i = 1; i <= 10; i++) rows.push([80 + i, 2000]);
    for (let i = 1; i <= 5; i++) rows.push([90 - i, 800]);
    for (let i = 1; i <= 9; i++) rows.push([85 + i * 1.2, 600]);
    rows.push([96, 1e7]); // today's session, still trading
    const b = weekdays(rows);
    const asOf = new Date(Date.parse(b[b.length - 1].t) + 10 * 3_600_000);
    expect(computeVolumeClimax(b, 20, { asOf }).find((r) => r.anchorKind === "low")!.secondaryOnLowerVolume).toBe(false);
  });
});
