/**
 * The engine's setup card: entry, stop, TP1, TP2 and MTP for a long setup, as of
 * the close of one bar. Read live by lib/cards/edgeCard.ts (server only).
 *
 * Owner direction (2026-11-11): TP1 is the closest level, so the trade goes
 * positive; TP2 is the strongest level, to take profit; MTP is the largest
 * profit, for the user who wants to ride the move. Scored by the good-call rule
 * in PREREG-EE1 Addendum GC-3 (private research folder, RESULT-EE1-GC3.md).
 *
 * - Entry: a buy stop at the high of the lowest bar since the event (E2, the
 *   break of the bottom bar's high); the card is void once confirmBars pass.
 * - Stop: that low less one price point (pricePoint at that price).
 * - TP1: nearest level more than 0.5% above entry (`nearestLevelAbove`).
 * - TP2: the strongest level above TP1 and below entry + 3R. Strength is the
 *   count of distinct price families with a level inside the band around it
 *   (Gann: where several angles and levels meet, resistance is stronger).
 *   Ties go to a cluster holding the range's 50% (Gann: the most important
 *   level), then to the nearer price. Unweighted: the fitted weights zero the
 *   50% level. Null when no level stands there.
 * - MTP: the first level at or beyond entry + 3R, else entry + 3R itself
 *   (`mtpFallback`; the 3R floor is an engineering choice).
 *
 * Levels come only from the level set standing at the close of `asOf`, so the
 * card uses nothing after that bar. The research scoring read the same set at
 * the fill bar's open, which is the same set unless a new pivot became known on
 * the bar the card was published.
 */
import { pricePoint } from "@/lib/gann/pointScale";
import { levelAt } from "./price";
import { atr, type Prepared } from "./pts";
import type { EngineConfig } from "./config";
import { nearestLevelAbove } from "./trade";

export interface StrongLevel {
  price: number;
  families: number;
  half: boolean;
}

export interface CardLevels {
  entry: number;
  stop: number;
  tp1: number;
  tp2: number | null;
  mtp: number;
  mtpFallback: boolean;
  /** Number of price families agreeing at TP2 (0 when there is none). */
  tp2Families: number;
  /** Last bar on which the entry may still fill; after it the card is void. */
  validThrough: number;
}

function standingSet(P: Prepared, t: number) {
  for (let k = P.levelSets.length - 1; k >= 0; k--) if (P.levelSets[k].at <= t - 1) return P.levelSets[k];
  return null;
}

/** Strongest level strictly between lo and hi, as read at bar t (levels known by t - 1). */
export function strongestLevel(P: Prepared, t: number, lo: number, hi: number, band: number): StrongLevel | null {
  const set = standingSet(P, t);
  if (!set) return null;
  const lv = set.levels.map((L) => ({ f: L.family, p: levelAt(L, t) }));
  let best: StrongLevel | null = null;
  for (const a of lv) {
    if (!(a.p > lo && a.p < hi)) continue;
    const fams = new Set(lv.filter((b) => Math.abs(b.p - a.p) <= band).map((b) => b.f));
    const c = { price: a.p, families: fams.size, half: fams.has("P2.half") };
    if (
      !best ||
      c.families > best.families ||
      (c.families === best.families && (Number(c.half) > Number(best.half) || (c.half === best.half && c.price < best.price)))
    )
      best = c;
  }
  return best;
}

/** First level at or above floor, as read at bar t. */
export function levelAtOrAbove(P: Prepared, t: number, floor: number): number | null {
  const set = standingSet(P, t);
  if (!set) return null;
  let best: number | null = null;
  for (const L of set.levels) {
    const p = levelAt(L, t);
    if (p >= floor && (best === null || p < best)) best = p;
  }
  return best;
}

/**
 * The card for a bottom event at `eventIndex`, as of the close of `asOf`
 * (eventIndex <= asOf). Null when the entry already filled, the window has
 * passed, or the levels can't be formed.
 */
export function cardLevels(P: Prepared, eventIndex: number, asOf: number, cfg: EngineConfig): CardLevels | null {
  const { bars } = P;
  if (eventIndex < 0 || asOf < eventIndex || asOf >= bars.length) return null;
  const validThrough = eventIndex + cfg.confirmBars;
  if (asOf >= validThrough) return null;
  let lowest = eventIndex;
  for (let i = eventIndex; i <= asOf; i++) {
    if (bars[i].l < bars[lowest].l) lowest = i;
    // a later bar already broke the bottom bar's high: the entry filled
    if (i > lowest && bars[i].h > bars[lowest].h) return null;
  }
  const entry = bars[lowest].h;
  const stop = bars[lowest].l - pricePoint(bars[lowest].l);
  const R = entry - stop;
  if (!(R > 0)) return null;
  const t = asOf + 1;
  const tp1 = nearestLevelAbove(P, t, entry);
  if (tp1 === null) return null;
  const band = Math.max((cfg.bandPct / 100) * bars[asOf].c, cfg.bandAtr * atr(bars, asOf));
  const floor = entry + 3 * R;
  const strong = strongestLevel(P, t, tp1, floor, band);
  const mtpLevel = levelAtOrAbove(P, t, floor);
  return {
    entry,
    stop,
    tp1,
    tp2: strong ? strong.price : null,
    mtp: mtpLevel ?? floor,
    mtpFallback: mtpLevel === null,
    tp2Families: strong ? strong.families : 0,
    validThrough,
  };
}
