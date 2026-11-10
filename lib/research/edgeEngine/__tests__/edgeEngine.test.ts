import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  DEFAULT_CONFIG, PRICE_FAMILIES, TIME_FAMILIES, BarClock, cells, creationTrades, decimalShifts, interaction, longTrades,
  percentLevels, prepare, ptsAt, quarterSquares, rangeDivisions, reproductionChecklist, ringSteps, squareDegrees,
  squareOfNineDynamic, squaredCount, swingWalk, timeCandidates, manageLong, type EngineConfig,
} from "@/lib/research/edgeEngine";

/** Weekday bars from 2016-01-04, a seeded random walk with swings. */
function synth(n: number, seed = 7): Bar[] {
  let a = seed;
  const r = () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out: Bar[] = [];
  let d = Date.UTC(2016, 0, 4);
  let c = 50;
  for (let i = 0; i < n; i++) {
    while ([0, 6].includes(new Date(d).getUTCDay())) d += 86_400_000;
    const drift = Math.sin(i / 15) * 0.6;
    const o = c;
    c = Math.max(5, c + drift + (r() - 0.5) * 2);
    const h = Math.max(o, c) + r();
    const l = Math.min(o, c) - r();
    out.push({ t: new Date(d).toISOString().slice(0, 10), o, h, l, c, v: 1000 });
    d += 86_400_000;
  }
  return out;
}

const cfg: EngineConfig = { ...DEFAULT_CONFIG, priceOn: { ...DEFAULT_CONFIG.priceOn }, timeOn: { ...DEFAULT_CONFIG.timeOn } };

describe("swing engine", () => {
  it("never reports a pivot before the bar that turned the line", () => {
    const bars = synth(300);
    const w = swingWalk(bars, 2);
    expect(w.pivots.length).toBeGreaterThan(10);
    for (const p of w.pivots.slice(1)) expect(p.known).toBeGreaterThan(p.index);
    // the line turns up exactly where a bottom became known
    for (const i of w.turnsUp) expect(w.line[i]).toBe(1);
  });
  it("alternates tops and bottoms", () => {
    const w = swingWalk(synth(300), 3);
    for (let i = 1; i < w.pivots.length; i++) expect(w.pivots[i].kind).not.toBe(w.pivots[i - 1].kind);
  });
});

describe("price engine arithmetic (checklist R2, T1)", () => {
  it("rings and quarter squares", () => {
    expect(ringSteps(5)).toEqual([28, 31, 34, 37, 40, 43, 46, 49]);
    expect(quarterSquares(8150, 4).filter((x) => x >= 8100 && x <= 8290).map(Math.round)).toEqual([8100, 8145, 8190, 8236, 8281]);
  });
  it("a full turn of the square adds 2 to the root", () => {
    const up360 = squareOfNineDynamic(100).find((x) => x.deg === 360)!;
    expect(up360.price).toBeCloseTo(144, 6);
    expect(squareDegrees(144, 100)).toBeCloseTo(360, 6);
  });
  it("50% sits in the middle of the range; 6.25% steps", () => {
    expect(rangeDivisions(100, 200).find((x) => x.frac === 0.5)!.price).toBe(150);
    expect(percentLevels(100, 200, 1).map((x) => x.price)).toEqual([187.5, 106.25]);
  });
});

describe("time engine", () => {
  it("squares bar counts and shifts the decimal (H5)", () => {
    expect(squaredCount(13)).toBeCloseTo(16.9, 10);
    expect(squaredCount(9)).toBe(81);
    expect(decimalShifts(150, 5, 1100)).toEqual([15, 150]);
  });
  it("no candidate is available before its pivot is known", () => {
    const bars = synth(400);
    const dates = bars.map((b) => b.t);
    const w = swingWalk(bars, "weekly");
    const cands = timeCandidates({ bars, dates, clock: new BarClock(dates), pivots: w.pivots, cfg });
    expect(cands.length).toBeGreaterThan(100);
    const knownAts = new Set(w.pivots.map((p) => p.known));
    for (const c of cands) if (c.avail > 0) expect(knownAts.has(c.avail) || c.family === "T7.cycle").toBe(true);
  });
});

describe("no look-ahead", () => {
  it("masks and events on the first bars do not change when later bars are added", { timeout: 60_000 }, () => {
    const bars = synth(500);
    const cut = 380;
    const full = prepare("X", bars, cfg);
    const part = prepare("X", bars.slice(0, cut), cfg);
    for (let t = 0; t < cut - 5; t++) {
      expect(part.lowMask[t]).toBe(full.lowMask[t]);
      expect(part.highMask[t]).toBe(full.highMask[t]);
      expect(part.timeMask[t]).toBe(full.timeMask[t]);
      expect(!!ptsAt(part, t, "bottom", cfg)).toBe(!!ptsAt(full, t, "bottom", cfg));
    }
  });
});

describe("detector, triggers and management", () => {
  const bars = synth(600, 11);
  const P = prepare("X", bars, cfg);
  it("every family has a bit", () => {
    expect(TIME_FAMILIES.length).toBeLessThanOrEqual(32);
    expect(PRICE_FAMILIES.length).toBeLessThanOrEqual(32);
  });
  it("trades carry their event's labels, a stop under the entry, and never exit before they enter", { timeout: 60_000 }, () => {
    const loose = { ...cfg, kt: 2, kp: 1 };
    for (const trig of ["E1", "E2", "E3", "E6"] as const) {
      const ts = longTrades(P, { ...loose, trigger: trig });
      for (const t of ts) {
        expect(t.stop).toBeLessThan(t.price);
        expect(t.exitIndex).toBeGreaterThanOrEqual(t.index);
        expect(t.event!.timeFamilies.length + t.event!.priceFamilies.length).toBeGreaterThan(0);
      }
    }
    expect(longTrades(P, loose).length).toBeGreaterThan(0);
  });
  it("a stop is never widened and a gap through it fills at the open", () => {
    const b2: Bar[] = [
      { t: "2020-01-02", o: 10, h: 10.5, l: 9.8, c: 10.2, v: 1 },
      { t: "2020-01-03", o: 10.2, h: 10.4, l: 10.0, c: 10.1, v: 1 },
      { t: "2020-01-06", o: 9.0, h: 9.2, l: 8.8, c: 9.0, v: 1 },
    ];
    const Q = prepare("Y", b2, cfg);
    const tr = manageLong(Q, { symbol: "Y", trigger: "E1", event: null, index: 1, price: 10.2, stop: 9.5, target: null }, cfg);
    expect(tr.exitReason).toBe("stop");
    expect(tr.exitPrice).toBe(9.0);
  });
  it("the creation cells partition the swing turns, and a pure mixture reads zero interaction", () => {
    const rows = creationTrades(P, cfg);
    expect(rows.length).toBeGreaterThan(5);
    const c = cells(rows);
    expect(c.both.n + c.time.n + c.price.n + c.neither.n).toBe(rows.length);
    const mix = { both: { n: 1, mean: 0.03, win: 1 }, time: { n: 1, mean: 0.01, win: 1 }, price: { n: 1, mean: 0.02, win: 1 }, neither: { n: 1, mean: 0, win: 0 } };
    expect(interaction(mix)).toBeCloseTo(0, 12);
  });
});

describe("reproduction checklist (section 8)", () => {
  const rows = reproductionChecklist();
  const v = (id: string) => rows.find((r) => r.id === id)!.verdict;
  it("the arithmetic rows match", () => {
    expect(v("R2")).toBe("MATCH");
    expect(v("H5")).toBe("MATCH");
    expect(v("H7")).toBe("MATCH");
    expect(v("G4")).toBe("MATCH");
  });
  it("reports T1 honestly: the stated 101 degrees does not follow from the formula", () => {
    expect(v("T1")).toBe("NO MATCH");
  });
  it("every row has a verdict", () => {
    for (const r of rows) expect(["MATCH", "CLOSE", "NO MATCH", "NOT RUN"]).toContain(r.verdict);
  });
});
