/**
 * The platform's own setup card from the engine (kind "edgeBottom"): entry,
 * stop, TP1, TP2 and MTP for a long, read on the last completed daily bar.
 * Server only (the engine's comments and config name internal sources; no
 * client module imports this file).
 *
 * Owner, 2026-11-11: "Tp1 closest / Tp2 strongest / Mtp Largest profit".
 * The levels are `cardLevels` (lib/edgeEngine/card.ts) with the
 * fitted variant (`chosen-variant.json`, "fitted|t0.25|p0.5|E2"), the card
 * the held-out read scored (internal: private-research/edge-engine/
 * RESULT-EE1-GC.md and RESULT-EE1-GC3.md: 14,088 filled cards on 249
 * held-out stocks, TP1 before the stop 89.2% against 85.5% to break even,
 * +0.045R; TP2 63.7% against 57.1%, +0.141R).
 *
 * Which event gets a card follows the scoring script one for one
 * (gc/ee-gc3.mjs): a stock holds one card at a time. A bottom event arms a
 * buy stop at the high of the lowest bar since it, for `confirmBars`
 * sessions; while that card waits or its trade is open (until the stop or
 * TP1 trades), later events on the same stock are skipped. The script is
 * replayed here over the stock's bars through the read bar only, so a card
 * shown tonight is exactly the one the script would hold open at this close,
 * and nothing after the close is read.
 *
 * A card stays on offer each night until it fills or its window passes; each
 * night's row is walked as a buy stop for the next session
 * (`walkCardCall`), so the fill lands on the row of the night before it, as
 * the scoring's fill did. The other nights' rows read as no fills.
 *
 * Three-question basis:
 * 1. Gann: the engine's bottom (a turn where time and price agree) and its
 *    levels; TP2 is the level where most price families meet, "where several
 *    angles and levels meet, resistance is stronger" (internal citations in
 *    lib/edgeEngine/card.ts).
 * 2. Cycles: no periodicity claim; the rule was fixed before the held-out
 *    read (Dewey's criterion 7).
 * 3. Hermetic: Polarity (TP1 secures, MTP extends; the member picks the
 *    pole) and Rhythm (one card at a time, the next only after the last one
 *    resolves). Law of Creation: bottom event x strongest level, measured a
 *    creation at TP2 (+0.106R over random days with the same distances).
 */

import type { Bar } from "@/lib/types";
import firstTrades from "@/lib/gann/firstTradeDates.json";
import { DEFAULT_CONFIG, type EngineConfig } from "@/lib/edgeEngine/config";
import { prepare, ptsAt, type Prepared } from "@/lib/edgeEngine/pts";
import { nearestLevelAbove } from "@/lib/edgeEngine/trade";
import { cardLevels, type CardLevels } from "@/lib/edgeEngine/card";
import { pricePoint } from "@/lib/gann/pointScale";
import chosen from "@/lib/edgeEngine/chosen-variant.json";

/** The fitted engine the held-out read scored. */
export const EDGE_CARD_CONFIG: EngineConfig = { ...DEFAULT_CONFIG, ...(chosen.cfg as Partial<EngineConfig>) } as EngineConfig;

/** Where the daily history read begins: the scoring data's first session (the live feed's starts later, 2020-07-27). */
export const EDGE_HISTORY_START = "2018-01-02";

/** Parts the universe is read in, one scheduled call each (/api/cards/edge, migration 0150). Engineering choice sized to the 60-second budget. */
export const EDGE_PARTS = 12;

/** Pure. The symbols of part `k` of `n`: every n-th symbol, so each part mixes the list evenly. */
export function edgePart(symbols: readonly string[], k: number, n = EDGE_PARTS): string[] {
  return symbols.filter((_, i) => i % n === k);
}

/** Bars before the first event the replay considers (the scoring started 6 months into its data). Engineering choice. */
export const EDGE_WARMUP_BARS = 120;

/** The stock's first trade date as the scoring read it. */
export function natalDate(symbol: string): string | null {
  type Entry = { date?: string | null; wikidata?: string | null; sec?: string | null; yahoo?: string | null };
  const e = (firstTrades as unknown as { dates: Record<string, Entry | undefined> }).dates[symbol];
  return e ? (e.date ?? e.wikidata ?? e.sec ?? e.yahoo ?? null) : null;
}

export interface LiveEdgeCard extends CardLevels {
  /** The bar of the bottom event. */
  eventIndex: number;
}

/**
 * Pure. The card the scoring script would hold open at the close of the last
 * bar of `P`, or null (no event, the stock's card already filled and is still
 * running, or the levels can't be formed).
 */
export function openEdgeCard(P: Prepared, cfg: EngineConfig = EDGE_CARD_CONFIG, warmup = EDGE_WARMUP_BARS): LiveEdgeCard | null {
  const bars = P.bars;
  const asOf = bars.length - 1;
  let busy = -1;
  for (let t = Math.max(1, warmup); t <= asOf; t++) {
    if (t <= busy) continue;
    if (!ptsAt(P, t, "bottom", cfg)) continue;
    const end = t + cfg.confirmBars;
    let lowest = t;
    let fill = -1;
    let px = 0;
    for (let i = t; i <= Math.min(asOf, end); i++) {
      if (bars[i].l < bars[lowest].l) lowest = i;
      if (i > lowest && bars[i].h > bars[lowest].h) {
        fill = i;
        px = Math.max(bars[i].o, bars[lowest].h);
        break;
      }
    }
    if (fill < 0) {
      // Unfilled: still on offer if its window reaches past tonight, else void.
      if (end > asOf) {
        const levels = cardLevels(P, t, asOf, cfg);
        return levels ? { ...levels, eventIndex: t } : null;
      }
      busy = end;
      continue;
    }
    const stop = bars[lowest].l - pricePoint(bars[lowest].l);
    const tp = nearestLevelAbove(P, fill, px);
    if (tp === null || px <= stop) {
      busy = fill;
      continue;
    }
    // Filled: the stock is busy until the stop or TP1 trades.
    let k = fill;
    while (k <= asOf && !(bars[k].l <= stop || bars[k].h >= tp)) k++;
    if (k > asOf) return null;
    busy = k;
  }
  return null;
}

/**
 * Pure. The targets a member is shown: TP1 always; TP2 where a strongest
 * level stands between TP1 and 3R; MTP only when it lies beyond TP1. When the
 * nearest level already sits at or past entry + 3R, `cardLevels` gives MTP
 * equal to TP1 and no TP2, and the card shows that one target, as the
 * scoring treated it.
 */
export function shownTargets(c: Pick<CardLevels, "tp1" | "tp2" | "mtp">): { tp1: number; tp2: number | null; mtp: number | null } {
  return { tp1: c.tp1, tp2: c.tp2 != null && c.tp2 > c.tp1 ? c.tp2 : null, mtp: c.mtp > c.tp1 ? c.mtp : null };
}

/** The card for one stock from its completed daily bars (oldest first), or null. */
export function edgeCardFor(symbol: string, completedDaily: readonly Bar[], cfg: EngineConfig = EDGE_CARD_CONFIG): LiveEdgeCard | null {
  if (completedDaily.length < EDGE_WARMUP_BARS + 2) return null;
  const P = prepare(symbol, completedDaily as Bar[], cfg, natalDate(symbol));
  return openEdgeCard(P, cfg);
}
