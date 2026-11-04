import { describe, expect, it } from "vitest";
import { coreControlDraw, runCoreControl, type CoreSeries, type RealCampaign } from "@/lib/backtest/coreControl";
import { replayCore } from "@/lib/backtest/replayCore";
import type { Bar } from "@/lib/types";

function walk(seed: number, n: number, start: number, drift: number): Bar[] {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out: Bar[] = [];
  let p = start;
  for (let day = 0; out.length < n; day++) {
    const d = new Date(Date.UTC(2019, 0, 2) + day * 86_400_000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const o = p;
    const c = Math.max(1, o * (1 + drift + (rnd() - 0.5) * 0.04));
    out.push({ t: `${d.toISOString().slice(0, 10)}T05:00:00Z`, o, h: Math.max(o, c) * (1 + rnd() * 0.01), l: Math.min(o, c) * (1 - rnd() * 0.01), c, v: 1e6 });
    p = c;
  }
  return out;
}

describe("core control (random entries, the core's own exits)", () => {
  const daily = walk(7, 1500, 40, 0.0015);
  const series = new Map<string, CoreSeries>([["UP", { bars: daily.slice(300), daily }]]);
  const real: RealCampaign[] = replayCore("UP", daily.slice(300), { dailyBars: daily, shorts: false }).trades.map((t) => ({
    symbol: "UP",
    openedAt: t.openedAt,
    entry: t.entry,
    stop: t.stop,
    barsHeld: t.barsHeld,
    rMultiple: t.rMultiple,
  }));

  it("has real campaigns to match", () => {
    expect(real.length).toBeGreaterThan(3);
  }, 60_000);

  it("is reproducible from its seed and draws one session a real campaign", () => {
    const by = new Map([["UP", real]]);
    const a = coreControlDraw(series, by, { seed: 3 });
    expect(a).toEqual(coreControlDraw(series, by, { seed: 3 }));
    expect(a.drawn).toBe(real.length);
    expect(a.campaigns).toBeLessThanOrEqual(real.length);
    expect(a.fixedHoldN).toBeGreaterThan(0);
  }, 60_000);

  it("reports the real mean, the control's spread and the exit value", () => {
    const res = runCoreControl(series, real, 5);
    expect(res.realN).toBe(real.length);
    expect(res.draws).toHaveLength(5);
    expect(res.control.p05).toBeLessThanOrEqual(res.control.p95);
    expect(res.control.shareAtOrAboveReal).toBeGreaterThan(0);
    expect(res.control.shareAtOrAboveReal).toBeLessThanOrEqual(1);
    expect(Number.isFinite(res.exitValue.p50)).toBe(true);
    expect(Number.isFinite(res.pyramidValue.p50)).toBe(true);
  }, 120_000);

  it("ignores campaigns whose symbol has no series, and refuses zero draws", () => {
    const res = runCoreControl(series, [...real, { ...real[0], symbol: "NONE" }], 1);
    expect(res.realN).toBe(real.length);
    expect(() => runCoreControl(series, real, 0)).toThrow();
  }, 60_000);
});
