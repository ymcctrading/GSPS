import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { holm } from "@/lib/research/calendarTest";
import {
  coverage,
  readBaseRates,
  scoreFamily,
  symbolWindows,
  WINDOW_DAYS,
  WINDOW_FAMILIES,
  YEAR_CYCLE_FAMILY_YEARS,
  type SymbolWindows,
} from "@/lib/research/timeWindowBaseRate";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";

const DAY = 86_400_000;
const T0 = Date.UTC(2015, 0, 1);

/** A seeded generator, so the fixtures are the same on every run. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Calendar-day sessions with turns spaced 20 to 60 days apart. */
function series(days: number, seed: number): { sessions: number[]; turns: number[] } {
  const rand = lcg(seed);
  const sessions = Array.from({ length: days }, (_, i) => T0 + i * DAY);
  const turns: number[] = [];
  for (let i = 30; i < days; i += 20 + Math.floor(rand() * 40)) turns.push(i);
  return { sessions, turns };
}

const empty = (): SymbolWindows["windows"] => ({ anniversary1: [], anniversary2: [], anniversary3: [], wheel: [], dayBands: [], yearCycles: [] });

describe("time-window base rates", () => {
  it("gives a low p to windows planted on the turns and a high p to windows placed at random", () => {
    const all: SymbolWindows[] = [];
    for (let k = 0; k < 4; k++) {
      const { sessions, turns } = series(1500, 7 + k);
      const windows = empty();
      for (const i of turns.filter((i) => i < 1100)) windows.wheel.push([sessions[i] - WINDOW_DAYS * DAY, sessions[i] + WINDOW_DAYS * DAY]);
      const rand = lcg(100 + k);
      for (let j = 0; j < 25; j++) {
        const c = T0 + Math.floor(30 + rand() * 1050) * DAY;
        windows.dayBands.push([c - WINDOW_DAYS * DAY, c + WINDOW_DAYS * DAY]);
      }
      all.push({ sessions, turns, windows });
    }
    const planted = scoreFamily(all, "wheel");
    expect(planted.hitRate).toBe(1);
    expect(planted.hitRate).toBeGreaterThan(planted.baseMean);
    // Shifts of 1 and 2 days still hold the turn inside a ±2-day window, so they tie the observed rate.
    expect(planted.p).toBeCloseTo(3 / 365, 6);
    const random = scoreFamily(all, "dayBands");
    expect(random.p).toBeGreaterThan(0.05);
  });

  it("drops shifted windows that run past the record", () => {
    // One turn, on day 350 of 400. Window B sits on it; window A sits on day 50
    // and reaches the turn only when moved 298 to 302 days. B leaves the record
    // after a 47-day shift, so from then on only A is scored.
    const sessions = Array.from({ length: 400 }, (_, i) => T0 + i * DAY);
    const windows = empty();
    windows.wheel.push([sessions[50] - 2 * DAY, sessions[50] + 2 * DAY]);
    windows.wheel.push([sessions[350] - 2 * DAY, sessions[350] + 2 * DAY]);
    const r = scoreFamily([{ sessions, turns: [350], windows }], "wheel");
    expect(r.instances).toBe(2);
    expect(r.hitRate).toBe(0.5);
    // Shifts 1-2: both windows scored, B still catches (0.5). Shifts 298-302: A alone, and it catches (1).
    expect(r.baseMean).toBeCloseTo((2 * 0.5 + 5 * 1) / 364, 10);
  });

  it("does not call a family better than random when its edge is not significant", () => {
    // Turns every 4 to 6 days: a five-day window catches one most of the time wherever it sits.
    const sessions = Array.from({ length: 1500 }, (_, i) => T0 + i * DAY);
    const turns: number[] = [];
    for (let i = 10, k = 0; i < 1500; i += 4 + (k++ % 3)) turns.push(i);
    const windows = empty();
    windows.anniversary1.push([sessions[turns[50]] - 2 * DAY, sessions[turns[50]] + 2 * DAY]);
    const report = readBaseRates([{ sessions, turns, windows }]);
    const a = report.families.find((f) => f.family === "anniversary1")!;
    expect(a.hitRate).toBeGreaterThan(a.baseMean);
    expect(a.holmSignificant).toBe(false);
    expect(a.beatsRandom).toBe(false);
  });

  it("reads 0.02 as significant alone but not as the best of five families", () => {
    type R = { p: number; holmSignificant?: boolean };
    expect(holm<R>([{ p: 0.02 }])[0].holmSignificant).toBe(true);
    const five = holm<R>([{ p: 0.02 }, { p: 0.4 }, { p: 0.5 }, { p: 0.6 }, { p: 0.7 }]);
    expect(five.every((r) => r.holmSignificant === false)).toBe(true);
  });

  it("measures how much of the calendar the windows cover", () => {
    const { sessions, turns } = series(100, 1);
    const windows = empty();
    windows.wheel.push([sessions[10], sessions[19]]);
    windows.dayBands.push([sessions[15], sessions[29]]);
    const s = [{ sessions, turns, windows }];
    expect(coverage(s, ["wheel"])).toBeCloseTo(0.1, 10);
    expect(coverage(s, ["wheel", "dayBands"])).toBeCloseTo(0.2, 10);
  });

  it("marks a family as beating random only when Holm-significant and above the shifted mean", () => {
    const all: SymbolWindows[] = [];
    for (let k = 0; k < 4; k++) {
      const { sessions, turns } = series(1500, 7 + k);
      const windows = empty();
      for (const i of turns.filter((i) => i < 1100)) windows.wheel.push([sessions[i] - 2 * DAY, sessions[i] + 2 * DAY]);
      all.push({ sessions, turns, windows });
    }
    const report = readBaseRates(all);
    expect(report.families.map((f) => f.family)).toEqual([...WINDOW_FAMILIES]);
    const wheel = report.families.find((f) => f.family === "wheel")!;
    expect(wheel.holmSignificant).toBe(true);
    expect(wheel.beatsRandom).toBe(true);
    for (const f of report.families.filter((f) => f.family !== "wheel")) expect(f.beatsRandom).toBe(false);
  });

  it("corrects the year-cycle re-rank's own counts: monthly major pivots, every cycle, the whole month (CYC-51)", async () => {
    const { yearCycleConvergence, MAJOR_CYCLE_YEARS } = await import("@/lib/gann/timeCycles");
    expect(WINDOW_FAMILIES).toContain("yearCycles");
    expect([...YEAR_CYCLE_FAMILY_YEARS]).toEqual([...MAJOR_CYCLE_YEARS]);
    const bars: Bar[] = Array.from({ length: 2300 }, (_, i) => {
      const c = 100 + 20 * Math.sin((2 * Math.PI * i) / 300);
      return { t: new Date(T0 + i * DAY).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1000 };
    });
    const w = symbolWindows(bars);
    expect(w.windows.yearCycles.length).toBeGreaterThan(0);
    // Every session inside a yearCycles window is a month the re-rank counts a hit in, and the reverse.
    const months: Bar[] = [];
    for (const b of bars) {
      const m = months[months.length - 1];
      if (m && m.t.slice(0, 7) === b.t.slice(0, 7)) { m.h = Math.max(m.h, b.h); m.l = Math.min(m.l, b.l); m.c = b.c; } else months.push({ ...b });
    }
    // Read on the whole record (the windows are, like every family's), over the months wholly inside it.
    const lastMonth = new Date(w.sessions[w.sessions.length - 1]).toISOString().slice(0, 7);
    for (const t of w.sessions) {
      const asOf = new Date(t);
      if (asOf.toISOString().slice(0, 7) >= lastMonth) continue;
      const inside = w.windows.yearCycles.some(([a, b]) => t >= a && t <= b);
      const r = yearCycleConvergence(months, asOf);
      expect(inside).toBe(r.bullishHits + r.bearishHits > 0);
    }
  });

  it("applies Holm across the six families: a raw 0.02 among six is not significant", async () => {
    type R = { p: number; holmSignificant?: boolean };
    const six = holm<R>([{ p: 0.02 }, { p: 0.4 }, { p: 0.5 }, { p: 0.6 }, { p: 0.7 }, { p: 0.8 }]);
    expect(six[0].holmSignificant).toBe(false);
    const fs = await import("node:fs");
    expect(fs.readFileSync("lib/research/timeWindowBaseRate.ts", "utf8")).toMatch(/const families = holm\(WINDOW_FAMILIES\.map/);
  });

  it("opens each family's windows from the record's major pivots, inside the record", () => {
    const bars: Bar[] = Array.from({ length: 1400 }, (_, i) => {
      const c = 100 + 20 * Math.sin((2 * Math.PI * i) / 180) + 5 * Math.sin((2 * Math.PI * i) / 23);
      return { t: new Date(T0 + i * DAY).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1000 };
    });
    const w = symbolWindows(bars);
    const first = w.sessions[0];
    const last = w.sessions[w.sessions.length - 1];
    for (const f of WINDOW_FAMILIES) for (const [a, b] of w.windows[f]) {
      expect(a).toBeGreaterThanOrEqual(first);
      expect(b).toBeLessThanOrEqual(last);
    }
    const anchors = majorPivots(findPivots(bars, 5)).map((p) => Date.parse(p.bar.t.slice(0, 10)));
    expect(anchors.length).toBeGreaterThan(0);
    for (const [a] of w.windows.anniversary1) {
      const centre = new Date(a + WINDOW_DAYS * DAY);
      centre.setUTCFullYear(centre.getUTCFullYear() - 1);
      expect(anchors).toContain(centre.getTime());
    }
    expect(w.windows.anniversary1.length).toBeGreaterThan(0);
    expect(w.windows.wheel.length).toBeGreaterThan(0);
    expect(w.turns.every((i) => i >= 0 && i < bars.length)).toBe(true);
  });
});
