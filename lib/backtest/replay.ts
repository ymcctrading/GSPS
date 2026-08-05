/**
 * Bar-by-bar replay of the protocol's own entry logic.
 *
 * This exists because win rate and expectancy were being quoted from ad-hoc
 * scripts. It replays the same functions the live scan uses — detectPatterns,
 * the gap rule, the risk floor — so a number quoted from here describes the
 * shipped system rather than a re-implementation of it.
 *
 * Deliberately pessimistic wherever a bar is ambiguous:
 *   - A setup arms on a closed bar and may only trigger on the very next one,
 *     as the protocol requires. It is not carried forward.
 *   - When a single bar's range covers both the stop and the target there is
 *     no way to know which came first, so it counts as a loss.
 *   - Round-trip friction is charged against every trade, widening losses and
 *     narrowing wins.
 *
 * What it cannot see: the true intra-bar path, the real bid/ask at the moment
 * of the fill, and overnight gaps beyond the session data supplied. Treat the
 * output as an upper bound on a strategy's quality, never a promise.
 */

import type { Bar, StratPattern } from "@/lib/types";
import { detectPatterns, gapRuleViolated, riskFloorViolated } from "@/lib/strat/patterns";
import { atr } from "@/lib/analysis/pivots";

/** 6.5 hours of 15-minute candles. */
export const BARS_PER_SESSION = 26;

export interface ReplayOptions {
  /** Take-profit distance as a multiple of the trade's risk. */
  targetR: number;
  /**
   * Round-trip friction per share — spread crossed twice plus slippage on a
   * stop entry. Charged against every trade, win or lose.
   */
  costPerShare?: number;
  /** Abandon a position that has not resolved within this many bars. */
  maxBarsHeld?: number;
  /** Minimum bars of history before a setup may be taken. */
  warmupBars?: number;
}

export interface ReplayTrade {
  symbol: string;
  pattern: StratPattern["name"];
  direction: "bullish" | "bearish";
  entry: number;
  stop: number;
  target: number;
  barsHeld: number;
  outcome: "win" | "loss" | "timeout";
  /** Realised result in units of the trade's own risk, after costs. */
  rMultiple: number;
  /** True when one bar covered both stop and target, and the loss was assumed. */
  ambiguous: boolean;
  /**
   * Stop width as a multiple of the execution-timeframe ATR at entry. This is
   * the one measure of "too tight" that is knowable before the trade, which
   * makes it the lever worth tuning — unlike bars-held, which is only known
   * afterwards.
   */
  atrMultiple: number;
}

export interface ReplayResult {
  trades: ReplayTrade[];
  armed: number;
  triggered: number;
  wins: number;
  losses: number;
  timeouts: number;
  ambiguous: number;
  winRate: number;
  /** Mean result per trade, in R, after costs. */
  expectancyR: number;
  /** Sum of all results, in R. */
  totalR: number;
}

const EMPTY: Omit<ReplayResult, "trades"> = {
  armed: 0, triggered: 0, wins: 0, losses: 0, timeouts: 0, ambiguous: 0,
  winRate: 0, expectancyR: 0, totalR: 0,
};

export function replay(symbol: string, bars: Bar[], options: ReplayOptions): ReplayResult {
  const {
    targetR,
    costPerShare = 0.02,
    maxBarsHeld = BARS_PER_SESSION * 10,
    warmupBars = 40,
  } = options;

  const trades: ReplayTrade[] = [];
  let armed = 0;
  let triggered = 0;

  for (let i = warmupBars; i < bars.length - 1; i++) {
    const history = bars.slice(0, i);
    const live = bars[i]; // the candle the setup is armed for
    const executionAtr = atr(history.slice(-30), 14);
    const lastClose = history[history.length - 1].c;

    for (const pattern of detectPatterns(history)) {
      if (gapRuleViolated(pattern, lastClose)) continue;
      if (riskFloorViolated(pattern, executionAtr)) continue;
      armed++;

      const long = pattern.direction === "bullish";
      const dir = long ? 1 : -1;
      // The trigger is a stop order: it fills only if this candle reaches it.
      const fired = long ? live.h >= pattern.triggerPrice : live.l <= pattern.triggerPrice;
      if (!fired) continue;
      triggered++;

      const entry = pattern.triggerPrice;
      const stop = pattern.stopPrice;
      const risk = Math.abs(entry - stop);
      if (!(risk > 0)) continue;
      const target = entry + dir * targetR * risk;

      let outcome: ReplayTrade["outcome"] = "timeout";
      let barsHeld = 0;
      let ambiguous = false;

      for (let j = i; j < Math.min(bars.length, i + maxBarsHeld); j++) {
        const b = bars[j];
        const hitStop = long ? b.l <= stop : b.h >= stop;
        const hitTarget = long ? b.h >= target : b.l <= target;
        if (!hitStop && !hitTarget) continue;
        barsHeld = j - i + 1;
        ambiguous = hitStop && hitTarget;
        // Both in one bar: no way to order them, so assume the loss.
        outcome = hitStop ? "loss" : "win";
        break;
      }

      if (outcome === "timeout") {
        // Marked out at the last close rather than silently dropped.
        barsHeld = Math.min(maxBarsHeld, bars.length - i);
        const exit = bars[Math.min(bars.length - 1, i + barsHeld - 1)].c;
        trades.push({
          symbol, pattern: pattern.name, direction: pattern.direction,
          entry, stop, target, barsHeld, outcome,
          rMultiple: (dir * (exit - entry) - costPerShare) / risk,
          ambiguous: false,
          atrMultiple: executionAtr > 0 ? risk / executionAtr : 0,
        });
        continue;
      }

      const gross = outcome === "win" ? targetR * risk : -risk;
      trades.push({
        symbol, pattern: pattern.name, direction: pattern.direction,
        entry, stop, target, barsHeld, outcome,
        rMultiple: (gross - costPerShare) / risk,
        ambiguous,
        atrMultiple: executionAtr > 0 ? risk / executionAtr : 0,
      });
    }
  }

  return summarise(trades, armed, triggered);
}

export function summarise(trades: ReplayTrade[], armed = 0, triggered = 0): ReplayResult {
  if (trades.length === 0) return { trades, ...EMPTY, armed, triggered };
  const wins = trades.filter((t) => t.outcome === "win").length;
  const losses = trades.filter((t) => t.outcome === "loss").length;
  const timeouts = trades.filter((t) => t.outcome === "timeout").length;
  const totalR = trades.reduce((s, t) => s + t.rMultiple, 0);
  return {
    trades,
    armed,
    triggered,
    wins,
    losses,
    timeouts,
    ambiguous: trades.filter((t) => t.ambiguous).length,
    // Timeouts are neither wins nor losses, but they are still trades taken —
    // excluding them from the denominator would flatter the win rate.
    winRate: wins / trades.length,
    expectancyR: totalR / trades.length,
    totalR,
  };
}

/** Merge per-symbol runs into one portfolio-level view. */
export function combine(results: ReplayResult[]): ReplayResult {
  const trades = results.flatMap((r) => r.trades);
  const armed = results.reduce((s, r) => s + r.armed, 0);
  const triggered = results.reduce((s, r) => s + r.triggered, 0);
  return summarise(trades, armed, triggered);
}
