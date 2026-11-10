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

/** Daily bars a mode reads, as the held-out read ran it (`--window 250`). */
export const CARD_WINDOW_BARS = 250;

/** The daily modes cards are built from; VWAP is intraday only and has no daily card. */
export const CARD_MODES: readonly NonGannStrategyModeId[] = (Object.keys(NON_GANN_STRATEGY_EVALUATORS) as NonGannStrategyModeId[]).filter(
  (m) => m !== "vwap",
);

export interface CardCall {
  kind: NonGannStrategyModeId;
  symbol: string;
  /** The completed daily bar the card was read on (YYYY-MM-DD). */
  signalDate: string;
  entry: number;
  stop: number;
  tp1: number;
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
    cards.push({ kind, symbol, signalDate, entry, stop, tp1 });
  }
  return cards;
}

export interface CardCallResult {
  call: CallOutcome | "no_fill" | "pending";
  fill: number | null;
  /** The session the card traded (the first after its signal), once it is in. */
  session: string | null;
}

/**
 * Pure. What became of a card over the daily bars after its signal. `pending`
 * while its session is not in yet; `open` while filled and neither level is
 * touched (and still `open` after `GOOD_CALL_MAX_SESSIONS`, counted apart).
 */
export function walkCardCall(card: Pick<CardCall, "signalDate" | "entry" | "stop" | "tp1">, daily: readonly Bar[]): CardCallResult {
  const after = daily.filter((b) => dateOf(b) > card.signalDate);
  if (after.length === 0) return { call: "pending", fill: null, session: null };
  const first = after[0];
  const session = dateOf(first);
  if (first.h < card.entry) return { call: "no_fill", fill: null, session };
  const fill = Math.max(first.o, card.entry);
  if (fill <= card.stop || fill >= card.tp1) return { call: "no_fill", fill: null, session };
  const call = walkGoodCall({ long: true, fill, stop: card.stop, tp1: card.tp1, bars: after.slice(0, GOOD_CALL_MAX_SESSIONS) });
  return { call, fill, session };
}
