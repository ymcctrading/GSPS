import { describe, expect, it } from "vitest";
import {
  MIN_PEERS,
  STRENGTH_MONTHS,
  buildUniverseStrength,
  groupTopCount,
  readUniverseRank,
  strengthPosition,
} from "@/lib/gann/universeStrength";
import { buildGroupMap } from "@/lib/gann/industryGroups";
import type { Bar } from "@/lib/types";

/** Monthly bars from Jan 2025, each a 2-point range around `mid(i)`, closing at `close(i)`. */
function months(n: number, mid: (i: number) => number, close: (i: number) => number = mid): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const m = mid(i);
    return { t: new Date(Date.UTC(2025, i, 1, 5)).toISOString(), o: m, h: m + 1, l: m - 1, c: close(i), v: 1000 };
  });
}

/** A universe of `count` flat stocks whose last close sits at `k / count` of their range. */
function universe(count: number, n: number): Map<string, Bar[]> {
  const out = new Map<string, Bar[]>();
  for (let k = 0; k < count; k++) {
    const close = 99 + (2 * k) / (count - 1);
    out.set(`S${k}`, months(n, () => 100, (i) => (i === n - 1 ? close : 100)));
  }
  return out;
}

const n = STRENGTH_MONTHS + 2;
// Readings in the month after the last bar: Jan 2025 + n months.
const readAt = new Date(Date.UTC(2025, n, 15, 15));

describe("the relative strength rank among the universe (S6)", () => {
  it("places the last close in its year of monthly highs and lows", () => {
    expect(strengthPosition(months(STRENGTH_MONTHS, (i) => 50 + i))).toBeCloseTo((61 - 49) / (62 - 49));
    expect(strengthPosition(months(STRENGTH_MONTHS - 1, (i) => 50 + i))).toBeNull();
  });

  it("ranks the strongest quarter for a long and the weakest for a short", () => {
    const u = buildUniverseStrength(universe(200, n));
    const top = readUniverseRank("S199", null, readAt, u)!;
    expect(top.peers).toBe(199);
    expect(top.percentile).toBe(1);
    expect(top.strongest).toBe(true);
    expect(top.weakest).toBe(false);
    const bottom = readUniverseRank("S0", null, readAt, u)!;
    expect(bottom.percentile).toBe(0);
    expect(bottom.weakest).toBe(true);
    const middle = readUniverseRank("S100", null, readAt, u)!;
    expect(middle.strongest).toBe(false);
    expect(middle.weakest).toBe(false);
  });

  it("ranks a symbol outside the universe from its own closed months", () => {
    const u = buildUniverseStrength(universe(200, n));
    const leader = months(n, (i) => 50 + i);
    const r = readUniverseRank("ZZZ", leader, readAt, u)!;
    expect(r.peers).toBe(200);
    expect(r.strongest).toBe(true);
    // The month in progress is not a monthly high or low: adding one changes nothing.
    const withCurrent = [...leader, { t: new Date(Date.UTC(2025, n, 1, 5)).toISOString(), o: 1, h: 1, l: 0.5, c: 0.5, v: 1 }];
    expect(readUniverseRank("ZZZ", withCurrent, readAt, u)).toEqual(r);
  });

  it("reads each month from the months closed before it, never a later one", () => {
    const u = buildUniverseStrength(universe(200, n));
    // A month earlier every stock sat at 100, mid-range on a flat year: all tied.
    const earlier = readUniverseRank("S199", null, new Date(Date.UTC(2025, n - 1, 15)), u)!;
    expect(earlier.percentile).toBe(0.5);
    expect(readUniverseRank("S199", null, new Date(Date.UTC(2025, n + 1, 15)), u)).toBeNull();
  });

  it("gives the same month's reading whatever span was fetched, as the live scan and the replay fetch different spans", () => {
    const full = universe(200, n + 6);
    const short = new Map([...full].map(([s, bars]) => [s, bars.slice(6)]));
    const month = new Date(Date.UTC(2025, n + 6, 15)).toISOString().slice(0, 7);
    expect(buildUniverseStrength(short).get(month)).toEqual(buildUniverseStrength(full).get(month));
  });

  it("ranks a stock within its industry group as well (S4)", () => {
    const u = buildUniverseStrength(universe(200, n));
    // Five members of one group, S195..S199 (the universe's strongest), and five of another, S0..S4.
    const sics: Record<string, { sic: string; description: string }> = {};
    for (let k = 195; k < 200; k++) sics[`S${k}`] = { sic: "3711", description: "MOTOR VEHICLES" };
    for (let k = 0; k < 5; k++) sics[`S${k}`] = { sic: "2911", description: "PETROLEUM REFINING" };
    const groups = buildGroupMap(sics);
    // The weakest of the strong group is no short: Gann ranks the group first (TST Ch. XVI-XVII).
    const r = readUniverseRank("S195", null, readAt, u, groups)!;
    expect(r.strongest).toBe(true);
    expect(r.group).toMatchObject({ key: "371", peers: 4, percentile: 0, weakest: false, strongest: false });
    expect(r.group!.groupPercentile).toBeGreaterThan(0.75);
    // The strongest of the weak group is no long either (before the review of #388 it read strongest).
    const w = readUniverseRank("S4", null, readAt, u, groups)!;
    expect(w.weakest).toBe(true);
    expect(w.group).toMatchObject({ key: "291", strongest: false });
    expect(w.group!.groupPercentile).toBeLessThan(0.25);
    // In a group of middling standing the strongest of five is the strongest, and the second is not
    // (a percentile cut let the top two of five through).
    for (let k = 98; k < 103; k++) sics[`S${k}`] = { sic: "2834", description: "PHARMACEUTICAL PREPARATIONS" };
    const mid = buildGroupMap(sics);
    expect(readUniverseRank("S102", null, readAt, u, mid)!.group).toMatchObject({ key: "283", strongest: true, weakest: false });
    expect(readUniverseRank("S101", null, readAt, u, mid)!.group).toMatchObject({ strongest: false, weakest: false });
    expect(readUniverseRank("S98", null, readAt, u, mid)!.group).toMatchObject({ strongest: false, weakest: true });
    expect(mid.get("S98")?.label).toBe("SIC 283 (PHARMACEUTICAL PREPARATIONS)");
    // No group, or too small a group: no group reading.
    expect(readUniverseRank("S100", null, readAt, u, groups)!.group).toBeNull();
    expect(buildGroupMap({ A: { sic: "3711", description: "" }, B: { sic: "3711", description: "" } }).size).toBe(0);
  });

  it("falls back to the two-digit major group when the industry group is small", () => {
    const sics: Record<string, { sic: string; description: string }> = {
      A: { sic: "3711", description: "" }, B: { sic: "3713", description: "" }, C: { sic: "3720", description: "" },
      D: { sic: "3730", description: "" }, E: { sic: "3740", description: "" },
    };
    const g = buildGroupMap(sics);
    expect(g.get("A")?.key).toBe("37");
    expect(g.get("C")?.key).toBe("37");
    expect(g.get("A")?.label).toBe("SIC 37");
  });

  it("reads the group rank from the stock's own months, counts ties and larger groups, and mirrors the gates", () => {
    const u = buildUniverseStrength(universe(200, n));
    const sics: Record<string, { sic: string; description: string }> = {};
    // Eight members, S100..S107: the strongest two of eight pass.
    for (let k = 100; k < 108; k++) sics[`S${k}`] = { sic: "2834", description: "PHARMA" };
    const g = buildGroupMap(sics);
    expect(groupTopCount(8)).toBe(2);
    expect(groupTopCount(5)).toBe(1);
    expect(readUniverseRank("S106", null, readAt, u, g)!.group).toMatchObject({ peers: 7, strongest: true });
    expect(readUniverseRank("S105", null, readAt, u, g)!.group).toMatchObject({ strongest: false });
    expect(readUniverseRank("S101", null, readAt, u, g)!.group).toMatchObject({ weakest: true });
    // An even group's standing is the average of its two middle readings: S103 and S104's,
    // the universe's middle, so neither gate shuts.
    const r = readUniverseRank("S107", null, readAt, u, g)!.group!;
    expect(r.groupPercentile).toBeCloseTo(0.52, 3); // the lower middle alone read 0.5175
    // The stock's own months, read stronger than the universe's reading of it: its own
    // stored reading is not counted as a peer above it.
    const strongMonths = months(n, () => 100, (i) => (i === n - 1 ? 101 : 100));
    const fromMonths = readUniverseRank("S100", strongMonths, readAt, u, g)!.group!;
    expect(fromMonths.peers).toBe(7);
    expect(fromMonths.strongest).toBe(true);
    // Read weaker than its stored reading: S106's own months put it between S105 and S106,
    // so only S107 is above it; counting its own stored reading as a peer would make two.
    const between = months(n, () => 100, (i) => (i === n - 1 ? 99 + (2 * 105.5) / 199 : 100));
    expect(readUniverseRank("S106", between, readAt, u, g)!.group).toMatchObject({ peers: 7, strongest: true });
  });

  it("gates on the group's standing at the universe's quarter, both sides", () => {
    const u = buildUniverseStrength(universe(200, n));
    // A group at the very bottom (S0..S4) and one at the very top (S195..S199).
    const sics: Record<string, { sic: string; description: string }> = {};
    for (let k = 0; k < 5; k++) sics[`S${k}`] = { sic: "2911", description: "OIL" };
    for (let k = 195; k < 200; k++) sics[`S${k}`] = { sic: "3711", description: "MOTORS" };
    const g = buildGroupMap(sics);
    const low = readUniverseRank("S4", null, readAt, u, g)!.group!;
    const high = readUniverseRank("S195", null, readAt, u, g)!.group!;
    expect(low.groupPercentile).toBeLessThanOrEqual(0.25);
    expect(high.groupPercentile).toBeGreaterThanOrEqual(0.75);
    expect(low.strongest).toBe(false);
    expect(high.weakest).toBe(false);
    // The short side of the weak group and the long side of the strong one stay open.
    expect(readUniverseRank("S0", null, readAt, u, g)!.group!.weakest).toBe(true);
    expect(readUniverseRank("S199", null, readAt, u, g)!.group!.strongest).toBe(true);
  });

  it("counts the major group over the stocks left without an industry group", () => {
    // Five 371s make an industry group; the lone 3720 is not a major group of one.
    const sics: Record<string, { sic: string; description: string }> = { X: { sic: "3720", description: "" } };
    for (const s of ["A", "B", "C", "D", "E"]) sics[s] = { sic: "3711", description: "" };
    const g = buildGroupMap(sics);
    expect(g.get("A")?.key).toBe("371");
    expect(g.get("X")).toBeUndefined();
  });

  it("reads nothing on too few peers, or with no universe", () => {
    const u = buildUniverseStrength(universe(MIN_PEERS, n));
    expect(readUniverseRank("S0", null, readAt, u)).toBeNull();
    expect(readUniverseRank("S0", null, readAt, null)).toBeNull();
  });
});
