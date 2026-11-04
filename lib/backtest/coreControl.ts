/**
 * The like-for-like control for the bare core (quant validation, slice 2).
 * Measurement only: nothing here changes a verdict, score, plan or order.
 *
 * Slice 1's control (`controls.ts`) drew random entries and held one lot for
 * the real campaign's length, so it measured entry timing only and left the
 * core's trailing exit, trend-change exit and pyramid out. This one keeps all
 * of them: for every real campaign it draws a random session within
 * `windowSessions` of the real entry, on the same symbol, with the same stop
 * distance as a share of price, and runs `replayCore` with those entries in
 * place of its own two entry rules (`entryOverride`). Everything after the
 * fill is the core's own code. Two questions follow:
 *
 * 1. **Do the core's entries add value?** The real ledger's mean R against the
 *    distribution of the control's mean R (same exits, random entries).
 * 2. **Do the core's exits add value?** The control with the pyramid off
 *    (the exits alone) against a fixed hold on exactly the entries it took,
 *    held for the matched real campaign's length with the same stop
 *    (`controlTradeAt`), one lot.
 * 3. **Does the pyramid add value?** The control with the pyramid against
 *    the same drawn sessions without it (its break-even stops close campaigns
 *    at other times, so the entries taken can differ; both counts reported).
 *
 * Engineering choices, labelled: ±21 sessions, the draw seed, and that a drawn
 * session is skipped when the core is already in a campaign or the main trend
 * is against it (the core's own rules), so a draw can hold fewer campaigns
 * than the ledger; the count is reported. Membership is read only through the
 * real entries (each real campaign was in the universe on its own date).
 *
 * Design basis (AGENTS.md mandate). Gann: measurement, no rule. It keeps his
 * exit, trend and pyramid rules exactly and varies only the entry, so the test
 * is fair to them. Cycles: Dewey's base rate. Hermetic: Polarity (the rule
 * against no rule). Law of Creation: entry ⊗ exit; each control removes one
 * of the pair to see what the pair creates.
 */

import type { Bar } from "@/lib/types";
import { replayCore, type CoreTrade } from "@/lib/backtest/replayCore";
import { controlTradeAt } from "@/lib/backtest/controls";
import { seededRandom } from "@/lib/backtest/selectionBias";
import { etDateKey } from "@/lib/market/session";

export interface CoreSeries {
  /** The execution bars the run replayed (daily, from its `--since`). */
  bars: Bar[];
  daily: Bar[];
  monthly?: Bar[];
}

export interface RealCampaign {
  symbol: string;
  openedAt: string;
  entry: number;
  stop: number;
  barsHeld: number;
  rMultiple: number;
}

export interface CoreControlDraw {
  /** Campaigns the core took on the drawn sessions (pyramid on). */
  campaigns: number;
  /** Campaigns with the pyramid off: its break-even stops close campaigns at other times, so later draws can differ. */
  noPyramidCampaigns: number;
  /** Real campaigns a session was drawn for. */
  drawn: number;
  /** Draws dropped because every try landed on a session another campaign already held. */
  collisions: number;
  meanR: number;
  /** The same entries with the pyramid off: the core's exits alone. */
  noPyramidMeanR: number;
  /** A fixed hold of the real length on exactly the pyramid-off run's entries, one lot. */
  fixedHoldMeanR: number;
  fixedHoldN: number;
}

function quantile(sorted: number[], p: number): number {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : NaN;
}

/** Index of the first daily bar on or after `iso`'s UTC day. */
function indexOn(daily: readonly Bar[], iso: string): number {
  const day = iso.slice(0, 10);
  let lo = 0;
  let hi = daily.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (daily[mid].t.slice(0, 10) < day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** One seeded draw over every symbol. */
export function coreControlDraw(
  seriesBySymbol: ReadonlyMap<string, CoreSeries>,
  campaignsBySymbol: ReadonlyMap<string, readonly RealCampaign[]>,
  { seed, windowSessions = 21, costPerShare = 0.02, shorts = false, trail = "weeklySwing" }: { seed: number; windowSessions?: number; costPerShare?: number; shorts?: boolean; trail?: "weeklySwing" | "eachWeek" },
): CoreControlDraw {
  const rand = seededRandom(seed);
  let sum = 0;
  let n = 0;
  let drawn = 0;
  let fixedSum = 0;
  let fixedN = 0;
  let npSum = 0;
  let npN = 0;
  let collisions = 0;
  // Symbols in a fixed order so a seed always draws the same sessions.
  for (const symbol of [...campaignsBySymbol.keys()].sort()) {
    const series = seriesBySymbol.get(symbol);
    const real = campaignsBySymbol.get(symbol) ?? [];
    if (!series || series.daily.length === 0 || real.length === 0 || series.bars.length === 0) continue;
    const daily = series.daily;
    const first = Math.max(0, daily.findIndex((b) => b.t >= series.bars[0].t));
    // ET date → stop share, and the matched real campaign's length for the fixed hold.
    const entries = new Map<string, number>();
    const heldOn = new Map<string, number>();
    for (const c of real) {
      const share = validShare(c);
      if (share === null) continue;
      const at = indexOn(daily, c.openedAt);
      // A symmetric window, narrowed at the series' edges so a draw never skews to one side.
      const w = Math.max(0, Math.min(windowSessions, at - first, daily.length - 1 - at));
      if (at < first || at >= daily.length) continue;
      drawn++;
      // Redraw a session another campaign already drew (up to 10 tries), so each real campaign gets its own.
      let date = "";
      for (let tries = 0; tries < 10; tries++) {
        const k = at - w + Math.floor(rand() * (2 * w + 1));
        date = etDateKey(new Date(daily[k].t));
        if (!entries.has(date)) break;
      }
      if (entries.has(date)) {
        collisions++;
        continue;
      }
      entries.set(date, share);
      heldOn.set(date, Math.max(1, Math.round(c.barsHeld)));
    }
    if (entries.size === 0) continue;
    const res = replayCore(symbol, series.bars, { dailyBars: daily, monthlyBars: series.monthly, shorts, costPerShare, trail, entryOverride: entries });
    for (const t of res.trades as CoreTrade[]) {
      if (!Number.isFinite(t.rMultiple)) continue;
      sum += t.rMultiple;
      n++;
    }
    const flat = replayCore(symbol, series.bars, { dailyBars: daily, monthlyBars: series.monthly, shorts, costPerShare, trail, entryOverride: entries, pyramid: false });
    for (const t of flat.trades) {
      if (!Number.isFinite(t.rMultiple)) continue;
      npSum += t.rMultiple;
      npN++;
      // The fixed hold on exactly the entries this run took: same session, stop share and the real campaign's length.
      const k = indexOn(daily, t.openedAt);
      const date = etDateKey(new Date(daily[k].t));
      const share = entries.get(date);
      const held = heldOn.get(date);
      if (share === undefined || held === undefined) continue;
      const fixed = controlTradeAt(symbol, daily, k, t.direction === "bearish" ? "short" : "long", share, held, costPerShare);
      if (fixed) {
        fixedSum += fixed.rMultiple;
        fixedN++;
      }
    }
  }
  return {
    campaigns: n,
    noPyramidCampaigns: npN,
    drawn,
    collisions,
    meanR: n ? sum / n : NaN,
    noPyramidMeanR: npN ? npSum / npN : NaN,
    fixedHoldMeanR: fixedN ? fixedSum / fixedN : NaN,
    fixedHoldN: fixedN,
  };
}

/** The stop's distance as a share of the entry, or null when it can't be used. */
function validShare(c: RealCampaign): number | null {
  const share = c.entry > 0 ? Math.abs(c.entry - c.stop) / c.entry : NaN;
  return share > 0 && share < 1 ? share : null;
}

export interface CoreControlResult {
  draws: CoreControlDraw[];
  realMean: number;
  realN: number;
  control: { p05: number; p50: number; p95: number; shareAtOrAboveReal: number };
  fixedHold: { p05: number; p50: number; p95: number };
  /** Per draw, the core's exits alone (pyramid off) minus a fixed hold on exactly those entries. */
  exitValue: { p05: number; p50: number; p95: number; shareAtOrBelowZero: number };
  /** Per draw, with the pyramid minus without it, from the same drawn sessions (the taken entries can differ). */
  pyramidValue: { p05: number; p50: number; p95: number; shareAtOrBelowZero: number };
}

export function runCoreControl(
  seriesBySymbol: ReadonlyMap<string, CoreSeries>,
  campaigns: readonly RealCampaign[],
  draws: number,
  options: { seed?: number; windowSessions?: number; costPerShare?: number; trail?: "weeklySwing" | "eachWeek" } = {},
): CoreControlResult {
  if (!(Number.isInteger(draws) && draws >= 1)) throw new Error("runCoreControl: draws must be a whole number >= 1");
  const usable = campaigns.filter((c) => seriesBySymbol.has(c.symbol) && Number.isFinite(c.rMultiple) && validShare(c) !== null);
  const bySymbol = new Map<string, RealCampaign[]>();
  for (const c of usable) {
    if (!bySymbol.has(c.symbol)) bySymbol.set(c.symbol, []);
    bySymbol.get(c.symbol)!.push(c);
  }
  const base = options.seed ?? 20261105;
  const out: CoreControlDraw[] = [];
  for (let d = 0; d < draws; d++) out.push(coreControlDraw(seriesBySymbol, bySymbol, { ...options, seed: base + d }));
  const realMean = usable.length ? usable.reduce((s, c) => s + c.rMultiple, 0) / usable.length : NaN;
  const means = out.map((x) => x.meanR).filter(Number.isFinite).sort((a, b) => a - b);
  const fixed = out.map((x) => x.fixedHoldMeanR).filter(Number.isFinite).sort((a, b) => a - b);
  const diffs = out.map((x) => x.noPyramidMeanR - x.fixedHoldMeanR).filter(Number.isFinite).sort((a, b) => a - b);
  const pyr = out.map((x) => x.meanR - x.noPyramidMeanR).filter(Number.isFinite).sort((a, b) => a - b);
  const spread = (xs: number[]) => ({
    p05: quantile(xs, 0.05),
    p50: quantile(xs, 0.5),
    p95: quantile(xs, 0.95),
    shareAtOrBelowZero: xs.length ? xs.filter((x) => x <= 0).length / xs.length : NaN,
  });
  return {
    draws: out,
    realMean,
    realN: usable.length,
    control: {
      p05: quantile(means, 0.05),
      p50: quantile(means, 0.5),
      p95: quantile(means, 0.95),
      shareAtOrAboveReal: (means.filter((m) => m >= realMean).length + 1) / (means.length + 1),
    },
    fixedHold: { p05: quantile(fixed, 0.05), p50: quantile(fixed, 0.5), p95: quantile(fixed, 0.95) },
    exitValue: spread(diffs),
    pyramidValue: spread(pyr),
  };
}
