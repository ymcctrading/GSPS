import { describe, expect, it } from "vitest";
import { fixedHorizonTrade, monthBlockBootstrap, runFixedHorizonControl, type HBar } from "@/lib/backtest/fixedHorizonControl";

function walk(seed: number, n: number, start: number, drift: number): HBar[] {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out: HBar[] = [];
  let p = start;
  for (let day = 0; out.length < n; day++) {
    const d = new Date(Date.UTC(2019, 0, 2) + day * 86_400_000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const o = p;
    const c = Math.max(1, o * (1 + drift + (rnd() - 0.5) * 0.04));
    out.push({ t: `${d.toISOString().slice(0, 10)}T05:00:00Z`, o, h: Math.max(o, c) * (1 + rnd() * 0.01), l: Math.min(o, c) * (1 - rnd() * 0.01), c });
    p = c;
  }
  return out;
}
const flat = (n: number, px = 100): HBar[] => Array.from({ length: n }, (_, k) => ({ t: `2024-01-${String(k + 1).padStart(2, "0")}T05:00:00Z`, o: px, h: px + 1, l: px - 1, c: px }));

describe("fixed-horizon first-lot comparison", () => {
  it("exits at the horizon session's close, horizon sessions after entry (the core's convention)", () => {
    const bars = flat(20);
    bars[5] = { ...bars[5], c: 103 };
    const t = fixedHorizonTrade(bars, 2, 1, 100, 95, 3, 0)!;
    expect(t.exitIndex).toBe(5);
    expect(t.exitReason).toBe("horizon");
    expect(t.rMultiple).toBeCloseTo(3 / 5, 12);
  });

  it("stops at the open when a later bar gaps through, at the stop when the range reaches it", () => {
    const bars = flat(20);
    bars[4] = { t: bars[4].t, o: 90, h: 91, l: 89, c: 90 };
    expect(fixedHorizonTrade(bars, 2, 1, 100, 95, 5, 0)).toMatchObject({ exitIndex: 4, exitPrice: 90, exitReason: "stop" });
    const b2 = flat(20);
    b2[3] = { ...b2[3], l: 94 };
    expect(fixedHorizonTrade(b2, 2, 1, 100, 95, 5, 0)).toMatchObject({ exitIndex: 3, exitPrice: 95 });
  });

  it("returns null when the data can't carry the whole horizon (censored, never truncated)", () => {
    expect(fixedHorizonTrade(flat(10), 7, 1, 100, 95, 3, 0)).toBeNull();
    expect(fixedHorizonTrade(flat(10), 6, 1, 100, 95, 3, 0)).not.toBeNull();
  });

  it("gives a zero paired difference when the control can only draw the actual session", () => {
    const bars = walk(3, 400, 50, 0.001);
    const cs = [100, 150, 200].map((i) => ({ symbol: "X", openedAt: bars[i].t, entry: bars[i].o, stop: bars[i].o * 0.93, side: "long" as const }));
    const r = runFixedHorizonControl(cs, new Map([["X", bars]]), { horizons: [10], draws: 5, windowSessions: 0, resamples: 50 });
    expect(r.horizons[0].used).toBe(3);
    expect(r.horizons[0].pairedDiff.mean).toBeCloseTo(0, 12);
    expect(r.horizons[0].actualMeanR).toBeCloseTo(r.horizons[0].controlMeanR.p50, 12);
  });

  it("is reproducible, counts censored and missing campaigns, and refuses zero draws", () => {
    const bars = walk(5, 300, 40, 0.0015);
    const cs = [
      { symbol: "X", openedAt: bars[100].t, entry: bars[100].o, stop: bars[100].o * 0.95, side: "long" as const },
      { symbol: "X", openedAt: bars[290].t, entry: bars[290].o, stop: bars[290].o * 0.95, side: "long" as const },
      { symbol: "NONE", openedAt: bars[100].t, entry: 10, stop: 9 },
    ];
    const run = () => runFixedHorizonControl(cs, new Map([["X", bars]]), { horizons: [21], draws: 20, resamples: 100 });
    expect(run()).toEqual(run());
    expect(run().horizons[0]).toMatchObject({ used: 1, censored: 1, missing: 1 });
    expect(() => runFixedHorizonControl(cs, new Map(), { draws: 0 })).toThrow();
  });

  it("counts campaigns whose window narrowed at the series' edge", () => {
    const bars = walk(9, 300, 40, 0.001);
    const cs = [5, 150].map((i) => ({ symbol: "X", openedAt: bars[i].t, entry: bars[i].o, stop: bars[i].o * 0.9, side: "long" as const }));
    const r = runFixedHorizonControl(cs, new Map([["X", bars]]), { horizons: [10], draws: 5, resamples: 50 });
    expect(r.horizons[0]).toMatchObject({ used: 2, narrowed: 1 });
  });

  it("bootstraps by month blocks", () => {
    const r = monthBlockBootstrap([{ month: "2024-01", values: [1, 1] }, { month: "2024-02", values: [-1] }, { month: "2024-03", values: [2] }], { resamples: 200 });
    expect(r.mean).toBeCloseTo(0.75, 12);
    expect(r.lo).toBeLessThanOrEqual(r.hi);
    expect(r.months).toBe(3);
  });
});
