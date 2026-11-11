/**
 * Daily trade cards from the strategy modes, and their forward record.
 *
 * Owner, 2026-11-10: publish setup cards (entry, stop, first target) that
 * people use because they have a real chance to be profitable, and log every
 * card, losses included. Which kinds are published is decided by their
 * held-out record (`lib/setups/cardRecords.ts`); every kind is still recorded
 * here, unpublished, so a kind can earn a record going forward too.
 *
 * The card is exactly what the held-out read scored
 * (private-research/card-goodcall/PREREG-GC1.md, internal):
 * - the mode's own evaluator on the last `CARD_WINDOW_BARS` completed daily
 *   bars (the research ran the same evaluators on the same window);
 * - long only (a cash buyer cannot sell what he does not own);
 * - a buy stop at the card's entry, good for the next session only: no trade
 *   that session is a card that never filled;
 * - filled at the entry, or at the open when the session opens through it;
 * - from the fill, TP1 before the stop is a good call, the stop first (or
 *   both in one bar) a bad call (`lib/shadow/goodCall.ts`).
 * A buy stop rests at the broker, so the feed's delay does not move the fill
 * (`lib/data/timeliness.ts` governs decisions read from bars, and the card's
 * decision is read from the closed daily bar the night before).
 *
 * Three-question basis:
 * 1. Gann: none in the cards themselves (Strategy Modes carve-out; their
 *    copy names only the public technique). The rule for which are shown is
 *    "when in doubt, keep out" (How to Make Profits in Commodities, p. 255;
 *    internal citation).
 * 2. Cycles: a returning nightly cycle, anchored to the daily bars, so a
 *    missed night is rebuilt from the charts the next ("Cycles as
 *    architecture"). No periodicity claim.
 * 3. Hermetic: Cause and Effect: each card is held to its effect, good or
 *    bad, and the record shows both. Law of Creation: the card kind and the
 *    stock's drift are the pair; only a kind that beat random days on fresh
 *    stocks (a creation) is published.
 */

import type { Bar } from "@/lib/types";
import { evaluateStrategyMode, NON_GANN_STRATEGY_EVALUATORS, type NonGannStrategyModeId } from "@/lib/strategies/registry";
import { etDateKey } from "@/lib/market/session";
import { walkGoodCall, GOOD_CALL_MAX_SESSIONS, type CallOutcome } from "@/lib/shadow/goodCall";
import { changeInTrend, CHANGE_IN_TREND_FIRST_SESSION } from "@/lib/gann/changeInTrend";
import type { CardKind } from "@/lib/setups/cardRecords";

/** Daily bars a mode reads, as the held-out read ran it (`--window 250`). */
export const CARD_WINDOW_BARS = 250;

/** The daily modes cards are built from; VWAP is intraday only and has no daily card. */
export const CARD_MODES: readonly NonGannStrategyModeId[] = (Object.keys(NON_GANN_STRATEGY_EVALUATORS) as NonGannStrategyModeId[]).filter(
  (m) => m !== "vwap",
);

/**
 * Every kind recorded each night: the modes' own cards, the RSI reversal
 * card on a day Gann's Rule 10 also holds (`timedCards`), and the engine's
 * own card (lib/cards/edgeCard.ts, written by /api/cards/edge).
 */
export const CARD_KINDS: readonly CardKind[] = [...CARD_MODES, "rsiReversalTimed", "edgeBottom"];

/** Where the long history `timedCards` reads begins (the research data's first session). */
export const TIMED_HISTORY_START = CHANGE_IN_TREND_FIRST_SESSION;

export interface CardCall {
  kind: CardKind;
  symbol: string;
  /** The completed daily bar the card was read on (YYYY-MM-DD). */
  signalDate: string;
  entry: number;
  stop: number;
  tp1: number;
  /** Second target (the strongest level) and master take profit, where the kind has them (owner, 2026-11-11). TP1 alone decides the call. */
  tp2?: number | null;
  mtp?: number | null;
  /** The signal bar's close as read that night, so a later stock split can be scaled out (`walkCardCall`). */
  signalClose: number;
}

/** A daily bar's New York session date. */
const dateOf = (b: Bar) => etDateKey(new Date(b.t));

/**
 * Pure. The long cards the modes arm on the last completed bar, one per mode
 * at most. A card whose stop is not below its entry, or whose TP1 is not
 * above it, is no card.
 */
export function buildCards(symbol: string, completedDaily: readonly Bar[], modes: readonly NonGannStrategyModeId[] = CARD_MODES): CardCall[] {
  if (completedDaily.length === 0) return [];
  const window = completedDaily.slice(-CARD_WINDOW_BARS) as Bar[];
  const signalDate = dateOf(window[window.length - 1]);
  const signalClose = window[window.length - 1].c;
  const cards: CardCall[] = [];
  for (const kind of modes) {
    let levels;
    try {
      levels = evaluateStrategyMode(kind, window);
    } catch {
      continue;
    }
    if (!levels || levels.direction !== "bullish") continue;
    const { entry, stopLoss: stop, takeProfit1: tp1 } = levels;
    if (![entry, stop, tp1].every(Number.isFinite) || !(entry > stop) || !(tp1 > entry)) continue;
    cards.push({ kind, symbol, signalDate, entry, stop, tp1, signalClose });
  }
  return cards;
}

/**
 * Pure. The "rsiReversalTimed" cards: each RSI reversal card whose signal bar
 * is also a Rule 10 change-in-trend day (lib/gann/changeInTrend.ts), with the
 * RSI card's own entry, stop and TP1. That pairing is what the held-out read
 * measured (internal: private-research/card-goodcall/PREREG-GC2.md,
 * RESULT-GC2.md: 1,307 fills, 53.6% good calls against 44.4% to break even,
 * +0.22R a call; the RSI cards outside it +0.05R).
 *
 * Recorded beside that: from mid-2021 on the pair is still positive and beats
 * random days (+0.13 to +0.14R), but its gain over the plain RSI card is
 * only +0.03 to +0.05R and not significant (RESULT-GC2.md Addendum B); the
 * forward record is the test of it.
 *
 * `history` is the symbol's completed daily bars from `TIMED_HISTORY_START`
 * through the signal bar, as the research read them (the rule's charts and
 * "all time" extremes depend on where the bars begin). The live feed's daily
 * history starts 2020-07-27, so live bars begin there: measured on 249
 * held-out stocks, 96% of 2025-26 bars read alike from either start, every
 * difference in the anniversary part. A history that does not end on the
 * card's signal bar gives no card: the rule is never read on a different
 * day's bars.
 *
 * Three-question basis: 1. Gann, 45 Years in Wall Street (1949) ch. II
 * p. 13, Rule 10 (internal citation). 2. Cycles: his dated periods, fixed in
 * advance (Dewey's criterion 7) and measured out of sample. 3. Hermetic:
 * Gender, the card's active price trigger joined to the receptive time
 * window. Law of Creation: price x time, a creation (+0.17R over the RSI
 * card without it).
 */
export function timedCards(cards: readonly CardCall[], history: readonly Bar[]): CardCall[] {
  const rsi = cards.filter((c) => c.kind === "rsiReversal");
  if (rsi.length === 0 || history.length < 2) return [];
  const bars = history.map((b) => ({ date: dateOf(b), h: b.h, l: b.l }));
  const last = bars[bars.length - 1].date;
  const out: CardCall[] = [];
  for (const c of rsi) {
    if (c.signalDate !== last) continue;
    if (changeInTrend(bars).fired) out.push({ ...c, kind: "rsiReversalTimed" });
  }
  return out;
}

export interface CardCallResult {
  call: CallOutcome | "no_fill" | "pending" | "unresolved";
  fill: number | null;
  /** The session the card traded (the first after its signal), once it is in. */
  session: string | null;
}

/**
 * Pure. What became of a card over the daily bars after its signal. `pending`
 * while its session is not in yet; `open` while filled and neither level is
 * touched; `unresolved` once `GOOD_CALL_MAX_SESSIONS` sessions have passed
 * with neither (counted apart, never re-read). The card trades the first bar
 * after its signal bar in the data (the next session the stock traded), as
 * the held-out read did.
 *
 * The bars are re-read each night split-adjusted, while the card's levels
 * were priced on the bars of its night. When the signal bar is in the bars
 * read and its close differs from `signalClose`, the levels are scaled by
 * that ratio first, so a split after the signal doesn't read as a no fill or
 * a stop. The fill is returned on the card's own basis, beside its stored levels.
 */
export function walkCardCall(
  card: Pick<CardCall, "signalDate" | "entry" | "stop" | "tp1"> & { signalClose?: number | null },
  daily: readonly Bar[],
): CardCallResult {
  const signalBar = daily.find((b) => dateOf(b) === card.signalDate);
  const ratio =
    signalBar && card.signalClose != null && card.signalClose > 0 && signalBar.c > 0 ? signalBar.c / card.signalClose : 1;
  // A sub-cent drift between two reads of the same bar is not a split.
  const k = Math.abs(ratio - 1) < 0.001 ? 1 : ratio;
  const entry = card.entry * k;
  const stop = card.stop * k;
  const tp1 = card.tp1 * k;
  const after = daily.filter((b) => dateOf(b) > card.signalDate);
  if (after.length === 0) return { call: "pending", fill: null, session: null };
  const first = after[0];
  const session = dateOf(first);
  if (first.h < entry) return { call: "no_fill", fill: null, session };
  const fill = Math.max(first.o, entry);
  if (fill <= stop || fill >= tp1) return { call: "no_fill", fill: null, session };
  const call = walkGoodCall({ long: true, fill, stop, tp1, bars: after.slice(0, GOOD_CALL_MAX_SESSIONS + 1) });
  return { call: call === "open" && after.length > GOOD_CALL_MAX_SESSIONS ? "unresolved" : call, fill: fill / k, session };
}
