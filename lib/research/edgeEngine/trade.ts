/**
 * Sections 5 and 6: entry triggers inside a PTS event, and Gann's trade
 * management as code. RESEARCH ONLY. Long side only on stocks (owner,
 * 2026-11-10: "you can't sell a stock that you don't already own"); the
 * short side is built for instruments that allow it.
 *
 * Gann's rules used (records in docs/memory-bank/sources/):
 * - Capital in 10 equal parts, never more than 1/10 on a trade (Master Course
 *   p.238); "never average a loss" (*Truth of the Stock Tape*, A02; *New Stock
 *   Trend Detector*, A05); never cancel a stop (*45 Years in Wall Street* Ch. II).
 * - Stop 1-3 points beyond the bottom or top (*New Stock Trend Detector*
 *   p.20, Rule 3); one point here, scaled by `pricePoint`.
 * - Raise the stop under each new bottom of the swing chart (*Commodities*
 *   pp.134-137).
 * - Exit when time and price balance again (the next PTS in the trade's
 *   direction), Master Course PDF p.202.
 * The 7-day tightening, the time stop and the maximum hold are the handoff's
 * management rules; the hold cap is an engineering safety, labelled.
 */
import { pricePoint } from "@/lib/gann/pointScale";
import type { EngineConfig, TriggerId } from "./config";
import { ptsAt, restingBuyAt, type Prepared, type PtsEvent } from "./pts";

export interface Entry {
  symbol: string;
  trigger: TriggerId;
  event: PtsEvent | null;
  /** Bar on which the entry fills, and the fill price. */
  index: number;
  price: number;
  /** Protective stop and the take-profit shown to the user (the nearest cluster level above). */
  stop: number;
  target: number | null;
  /** Bar from which the E3 "turn within 7 bars" cancel applies. */
  cancelUntil?: number;
}

export interface Trade extends Entry {
  exitIndex: number;
  exitPrice: number;
  exitReason: "stop" | "pts" | "time" | "turn" | "maxhold" | "end";
  /** Net return (fraction), after slippage both sides. */
  ret: number;
  /** Net return in units of initial risk. */
  r: number;
  bars: number;
}

/**
 * The trigger that confirms a bottom PTS event at bar e (long side). Returns
 * the entry or null. Reads bars up to the fill bar only.
 */
export function confirmLong(P: Prepared, ev: PtsEvent, cfg: EngineConfig, trigger: TriggerId = cfg.trigger): Entry | null {
  const { bars } = P;
  const e = ev.index;
  const n = bars.length;
  const end = Math.min(n - 1, e + cfg.confirmBars);
  let lowest = e;
  for (let i = e; i <= end; i++) {
    if (bars[i].l < bars[lowest].l) lowest = i;
    switch (trigger) {
      case "E1": {
        // the swing line turns up at the close of bar i; buy the next open
        if (P.minor.line[i] === 1 && P.minor.line[i - 1] === -1 && i + 1 < n) {
          const stop = bars[lowest].l - pricePoint(bars[lowest].l);
          const px = bars[i + 1].o;
          if (px <= stop) return null;
          return { symbol: P.symbol, trigger, event: ev, index: i + 1, price: px, stop, target: null };
        }
        break;
      }
      case "E2": {
        // buy when price breaks the high of the lowest bar (a resting stop order from the bar after it)
        if (i > lowest && bars[i].h > bars[lowest].h) {
          const px = Math.max(bars[i].o, bars[lowest].h);
          const stop = bars[lowest].l - pricePoint(bars[lowest].l);
          return { symbol: P.symbol, trigger, event: ev, index: i, price: px, stop, target: null };
        }
        break;
      }
      case "E3": {
        // the window day's range: buy the break of its high; a turn down within 7 bars cancels
        if (i > e && bars[i].h > bars[e].h) {
          const px = Math.max(bars[i].o, bars[e].h);
          const stop = Math.min(bars[e].l, bars[lowest].l) - pricePoint(bars[e].l);
          return { symbol: P.symbol, trigger, event: ev, index: i, price: px, stop, target: null, cancelUntil: i + 7 };
        }
        break;
      }
      case "E6":
        // E6 is a resting order, found by `restingBuyAt`, not a confirmation of a touched event
        return null;
    }
  }
  return null;
}

/** The take-profit shown to the user: the nearest level above the entry in the active set. */
export function nearestLevelAbove(P: Prepared, t: number, price: number): number | null {
  let best: number | null = null;
  for (let k = P.levelSets.length - 1; k >= 0; k--) {
    if (P.levelSets[k].at > t - 1) continue;
    for (const L of P.levelSets[k].levels) {
      const p = L.slope ? L.price + L.slope * (t - (L.t0 ?? 0)) : L.price;
      if (p > price * 1.005 && (best === null || p < best)) best = p;
    }
    break;
  }
  return best;
}

/**
 * Runs Gann's management on a long entry: stop (never widened), raised under
 * each new minor-swing bottom, tightened to the prior day's low after N up
 * closes in a row, exit at the next top PTS, time stop when not in profit,
 * maximum hold. Returns the closed trade.
 */
export function manageLong(P: Prepared, en: Entry, cfg: EngineConfig): Trade {
  const { bars } = P;
  const n = bars.length;
  const slip = cfg.slippageBp / 10_000;
  let stop = en.stop;
  const risk = en.price - en.stop;
  let ups = 0;
  let exitIndex = n - 1;
  let exitPrice = bars[n - 1].c;
  let reason: Trade["exitReason"] = "end";
  let pendingExit: Trade["exitReason"] | null = null;
  for (let j = en.index; j < n; j++) {
    const b = bars[j];
    if (pendingExit && j > en.index) {
      exitIndex = j;
      exitPrice = b.o;
      reason = pendingExit;
      break;
    }
    // stop first (a resting order); on the entry bar only below the fill
    if (b.l <= stop) {
      exitIndex = j;
      exitPrice = Math.min(b.o, stop);
      if (j === en.index) exitPrice = stop;
      reason = "stop";
      break;
    }
    // end-of-bar decisions, acted on at the next open
    if (j > en.index && b.c > bars[j - 1].c) ups++;
    else if (j > en.index) ups = 0;
    if (P.minor.line[j] === 1 && P.minor.line[j - 1] === -1) {
      const bot = P.minor.pivots.find((p) => p.known === j && p.kind === "bottom");
      if (bot && bot.index >= en.index) stop = Math.max(stop, bot.price - pricePoint(bot.price));
    }
    if (ups >= cfg.sevenDayRule) stop = Math.max(stop, b.l);
    if (j > en.index && ptsAt(P, j, "top", cfg)) pendingExit = "pts";
    else if (en.cancelUntil !== undefined && j <= en.cancelUntil && P.minor.line[j] === -1 && P.minor.line[j - 1] === 1) pendingExit = "turn";
    else if (j - en.index >= cfg.timeStopBars && b.c <= en.price) pendingExit = "time";
    else if (j - en.index >= cfg.maxHoldBars) pendingExit = "maxhold";
  }
  const ret = (1 - slip) * (exitPrice / en.price) / (1 + slip) - 1;
  return { ...en, exitIndex, exitPrice, exitReason: reason, ret, r: risk > 0 ? (ret * en.price) / risk : 0, bars: exitIndex - en.index };
}

/** Every confirmed long trade on a symbol: each bottom PTS, its trigger, managed; no overlap per symbol. */
export function longTrades(P: Prepared, cfg: EngineConfig): Trade[] {
  const out: Trade[] = [];
  let busyUntil = -1;
  for (let t = 1; t < P.bars.length; t++) {
    if (t <= busyUntil) continue;
    if (cfg.trigger === "E6") {
      // a buy resting at the level: fill at the level, or at the open if it gapped below; stop 1 point under the level
      const r = restingBuyAt(P, t, cfg);
      if (!r) continue;
      const px = Math.min(P.bars[t].o, r.level);
      const stop = r.level - pricePoint(r.level);
      if (px <= stop) continue;
      const en: Entry = { symbol: P.symbol, trigger: "E6", event: r.event, index: t, price: px, stop, target: null };
      en.target = nearestLevelAbove(P, t, px);
      const tr = manageLong(P, en, cfg);
      out.push(tr);
      busyUntil = tr.exitIndex;
      continue;
    }
    const ev = ptsAt(P, t, "bottom", cfg);
    if (!ev) continue;
    const en = confirmLong(P, ev, cfg);
    if (!en) continue;
    en.target = nearestLevelAbove(P, en.index, en.price);
    const tr = manageLong(P, en, cfg);
    out.push(tr);
    busyUntil = tr.exitIndex;
    t = Math.max(t, en.index);
  }
  return out;
}
