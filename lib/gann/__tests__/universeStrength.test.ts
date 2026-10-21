import { describe, expect, it } from "vitest";
import {
  MIN_PEERS,
  STRENGTH_MONTHS,
  buildUniverseStrength,
  readUniverseRank,
  strengthPosition,
} from "@/lib/gann/universeStrength";
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

  it("reads nothing on too few peers, or with no universe", () => {
    const u = buildUniverseStrength(universe(MIN_PEERS, n));
    expect(readUniverseRank("S0", null, readAt, u)).toBeNull();
    expect(readUniverseRank("S0", null, readAt, null)).toBeNull();
  });
});
