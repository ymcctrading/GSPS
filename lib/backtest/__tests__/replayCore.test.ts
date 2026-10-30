import { describe, expect, it } from "vitest";
import { isCoreTrade, replayCore, summariseCore, type CoreRule } from "@/lib/backtest/replayCore";
import { readMonthlyMainTrend } from "@/lib/gann/mainTrend";
import { toMonthlyBars } from "@/lib/gann/disclosedRules";
import type { Bar } from "@/lib/types";

/** A seeded random walk of weekday daily bars drifting `drift` a day. */
function walk(seed: number, n: number, start: number, drift = 0, d0 = Date.UTC(2019, 0, 2)): Bar[] {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out: Bar[] = [];
  let p = start;
  for (let day = 0; out.length < n; day++) {
    const d = new Date(d0 + day * 86_400_000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const o = p;
    const c = Math.max(1, o * (1 + drift + (rnd() - 0.5) * 0.04));
    const h = Math.max(o, c) * (1 + rnd() * 0.01);
    const l = Math.min(o, c) * (1 - rnd() * 0.01);
    out.push({ t: `${d.toISOString().slice(0, 10)}T05:00:00Z`, o, h, l, c, v: 1e6 * (0.5 + rnd()) });
    p = c;
  }
  return out;
}

describe("bare core replay", () => {
  const up = walk(7, 1500, 40, 0.0015);
  const down = walk(11, 700, 400, -0.003);
  const flat = walk(3, 1500, 60, 0);

  it("buys only with a monthly uptrend: no shorts in a market that only rises", () => {
    const result = replayCore("UP", up, { dailyBars: up });
    expect(result.trades.length).toBeGreaterThan(0);
    const months = toMonthlyBars(up);
    for (const t of result.trades) {
      // Every entry is with the main trend read on the months completed before it.
      const m = t.openedAt.slice(0, 7);
      expect(readMonthlyMainTrend(months.filter((b) => b.t.slice(0, 7) < m))).toBe(t.direction);
    }
    expect(result.trades.some((t) => t.direction === "bullish")).toBe(true);
  }, 60_000);

  it("sells short only in a monthly downtrend", () => {
    const result = replayCore("DN", down, { dailyBars: down });
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.trades.every((t) => t.direction === "bearish")).toBe(true);
    const longsOnly = replayCore("DN", down, { dailyBars: down, shorts: false });
    expect(longsOnly.trades.every((t) => t.direction === "bullish")).toBe(true);
  }, 60_000);

  it("pyramids winners and measures the whole line per campaign", () => {
    const result = replayCore("UP", up, { dailyBars: up });
    const trades = result.trades.filter(isCoreTrade);
    const pyramided = trades.filter((t) => t.lotFills.length > 1);
    expect(pyramided.length).toBeGreaterThan(0);
    for (const t of pyramided) {
      // Adds only in profit: each lot filled beyond the last.
      for (let k = 1; k < t.lotFills.length; k++) expect(t.lotFills[k].fill).toBeGreaterThan(t.lotFills[k - 1].fill);
      expect(t.lots).toBe(t.lotFills.length);
    }
    const noPyramid = replayCore("UP", up, { dailyBars: up, pyramid: false }).trades.filter(isCoreTrade);
    expect(noPyramid.every((t) => t.lotFills.length === 1 && Math.abs(t.rMultiple - t.rFirstLot) < 1e-9)).toBe(true);
    const s = summariseCore(result.trades);
    expect(s.campaigns).toBe(trades.length);
    expect(s.pyramided).toBe(pyramided.length);
    expect(s.lineR).toBeCloseTo(result.totalR, 9);
  }, 60_000);

  it("risks the first lot's 3-point stop: no initial-stop loss beyond it unless the open gapped through", () => {
    for (const bars of [up, down, flat]) {
      for (const t of replayCore("X", bars, { dailyBars: bars }).trades.filter(isCoreTrade)) {
        expect(Math.abs(t.entry - t.stop)).toBeGreaterThan(0);
        if (t.exitReason === "initial" && t.lotFills.length === 1 && t.exitPrice === t.stop) {
          expect(t.rFirstLot).toBeGreaterThanOrEqual(-1.01);
        }
      }
    }
  }, 60_000);

  it("never looks ahead: a run on the first sessions closes the same campaigns", () => {
    const full = replayCore("F", flat, { dailyBars: flat }).trades;
    const cut = 900;
    const part = replayCore("F", flat.slice(0, cut), { dailyBars: flat.slice(0, cut) }).trades;
    const lastBar = flat[cut - 1].t;
    const done = (ts: typeof full) => ts.filter((t) => t.exitReason !== "open_at_end" && (t.closedAt ?? "") < lastBar);
    expect(done(part).map((t) => [t.openedAt, t.closedAt, t.rMultiple])).toEqual(
      done(full).filter((t) => (t.closedAt ?? "") < lastBar).map((t) => [t.openedAt, t.closedAt, t.rMultiple]),
    );
  }, 60_000);

  it("trades only from the first execution bar, reading the record before it", () => {
    const bars = up.slice(700);
    const result = replayCore("UP", bars, { dailyBars: up });
    expect(result.trades.every((t) => t.openedAt >= bars[0].t)).toBe(true);
  }, 60_000);

  it("gates on a refusing rule and only tags in tag mode", () => {
    const seen: string[] = [];
    const refuse: CoreRule = {
      name: "never",
      allows: (ctx) => {
        // Completed bars only: nothing on or after the decision's session.
        expect(ctx.sessions[ctx.sessions.length - 1].t.slice(0, 10) < ctx.asOf).toBe(true);
        expect(ctx.months.every((m) => m.t.slice(0, 7) < ctx.asOf.slice(0, 7))).toBe(true);
        seen.push(ctx.side);
        return false;
      },
    };
    const gated = replayCore("UP", up, { dailyBars: up, rules: [refuse] });
    expect(gated.trades.length).toBe(0);
    expect(seen.length).toBeGreaterThan(0);
    const plain = replayCore("UP", up, { dailyBars: up });
    const tagged = replayCore("UP", up, { dailyBars: up, rules: [refuse], ruleMode: "tag" });
    expect(tagged.trades.map((t) => t.openedAt)).toEqual(plain.trades.map((t) => t.openedAt));
    expect(tagged.trades.filter(isCoreTrade).every((t) => t.rulesRefused?.includes("never"))).toBe(true);
  }, 60_000);

  it("takes nothing without a monthly reading", () => {
    const short = walk(5, 15, 50, 0.01);
    expect(replayCore("S", short, { dailyBars: short }).trades.length).toBe(0);
  });
});
