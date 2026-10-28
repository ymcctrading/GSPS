/**
 * GSPS — shadow discovery of newly active stocks during the session (owner,
 * 2026-10-28: "examines the eligible universe broadly enough to notice newly
 * active stocks ... tracks candidates without starvation"). On October 27 the
 * evening's lists held 2 of the day's 20 biggest movers (ASML at rank 35, BA
 * as a reserve at 48); nothing during the session could bring an unlisted
 * stock that started to act to the intraday scan's attention.
 *
 * SHADOW ONLY. A discovery is a reason to examine a stock, never a trade: the
 * reading carries no entry, stop or target, it is not read by the score, the
 * plan, placement, Guided Mode, automation or any notification, and the queue
 * (`lib/scanner/queue.ts`) that would give it a slot runs in shadow beside the
 * live selection. A percentage, dollar or point move ranks the list for
 * attention; it is never an entry signal ("buying a stock because it is up a
 * large percentage" is not a reason).
 *
 * The conditions, each tagged with its basis:
 * - `old_level_crossed` (sourced): the session has traded 3 points past the
 *   last completed 3-Day Chart top above the prior close, or bottom below it,
 *   the crossing Gann's buying and selling points act on (W006 p.20;
 *   `lib/gann/entryTrigger.ts`). The entry itself still needs the close 3
 *   points past and the reaction (Rule 3(b)-(c)); discovery only notices.
 * - `at_old_level` (sourced): the session is within the 3-point allowance of
 *   that old level (*Truth of the Stock Tape*: the first reaction to an old
 *   top; the focus list's `old_level` read intraday).
 * - `new_13_week_extreme` (sourced): the session is beyond the high or low of
 *   the last 13 weeks of completed sessions, the range Gann's breakaway reads
 *   (Master Course pp. 246-248, "2-6 or 10-13 weeks in a narrow range";
 *   `BREAKAWAY_RANGE_DAYS`).
 * - `narrow_range_breakaway` (sourced): a narrow range of at least two weeks
 *   (`narrowRangeSessions`) crossed by 3 points (*Truth of the Stock Tape*,
 *   "3 points beyond the old top or bottom of a sideways move").
 * - `wide_range_volume` (heuristic, engineering): the session's range so far
 *   is at least `WIDE_DAY_ATRS` average true ranges and its volume, scaled to
 *   the part of the session observed, at least the volume climax's 1.5×. The
 *   width and the pacing are engineering figures (Gann gives none), labelled.
 *
 * Group leadership and the hourly chart are not read here: the group rank
 * needs the month's close and the hourly chart needs intraday bars this pass
 * does not fetch (stated gaps, not silent ones).
 *
 * Delay. The equity feed is delayed 15 minutes (owner, confirmed 2026-10-28).
 * The session bar is read as observed through `observedThrough`, the latest
 * instant the delayed feed can include, never as current; completed sessions
 * are those `availableBars` (the shared timeliness contract) admits at the
 * evaluation time. Every reading records both times.
 *
 * Cost. Pure arithmetic over daily bars the market scan's coarse pass already
 * holds for the whole universe; no request of its own.
 *
 * Mandate: 1. Gann as cited per condition; he chose active stocks from the
 * charts and watched for the crossing of old tops and bottoms. 2. No
 * periodicity claim; Dewey N/A. 3. Cause and Effect (the crossing is a cause
 * the session shows; examination is its effect) and Polarity (every
 * condition reads both sides, mirrored). Law of Creation: the evening's list
 * ⊗ the session's action creates the third, "examine this one now", which
 * re-enters as a queue candidate.
 */

import type { Bar } from "@/lib/types";
import { atr } from "@/lib/analysis/pivots";
import { BREAKAWAY_RANGE_DAYS, narrowRangeSessions } from "@/lib/gann/breakaway";
import { gannPoint, gannThreePoints } from "@/lib/gann/pointScale";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import { VOLUME_CLIMAX_THRESHOLD } from "@/lib/gann/volumeClimax";
import { WIDE_DAY_ATRS } from "@/lib/scanner/focusList";
import { availableBars } from "@/lib/data/timeliness";
import { etDateKey, etParts } from "@/lib/market/session";

export type DiscoveryBasis = "sourced" | "heuristic";

export type DiscoveryCondition =
  | { kind: "old_level_crossed"; basis: "sourced"; side: "top" | "bottom"; level: number }
  | { kind: "at_old_level"; basis: "sourced"; side: "top" | "bottom"; level: number }
  | { kind: "new_13_week_extreme"; basis: "sourced"; side: "high" | "low"; level: number }
  | { kind: "narrow_range_breakaway"; basis: "sourced"; side: "top" | "bottom"; level: number; sessions: number }
  | { kind: "wide_range_volume"; basis: "heuristic"; rangeAtrs: number; volumePace: number };

/** One stock's discovery reading. No entry, stop or target, by construction. */
export interface DiscoveryReading {
  readonly shadow: true;
  symbol: string;
  conditions: DiscoveryCondition[];
  /** Attention only: the move from the prior close, percent, dollars and price-scaled points. */
  attention: { pct: number; dollars: number; points: number; gapPct: number };
  priorClose: number;
  /** The latest instant the delayed session data can include. */
  dataAsOf: string;
  evaluatedAt: string;
}

/**
 * Completed sessions read at most (engineering, labelled): the 13-week window
 * (about 63 sessions) with room for the 3-Day Chart's last swings before it.
 * Bounds the cost over the whole universe.
 */
const MAX_SESSIONS_READ = 130;

/** Sessions read for the average true range and volume (as the focus list). */
const AVERAGE_SESSIONS = 20;
const DAY_MS = 86_400_000;
/** Regular session length in minutes (a full day; an early close reads shorter elapsed time, so a higher pace). */
const SESSION_MINUTES = 390;

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const goodBar = (b: Bar) => [b.o, b.h, b.l, b.c].every((n) => finite(n) && n > 0) && b.h >= b.l && finite(b.v) && b.v >= 0;

export interface DiscoveryInput {
  symbol: string;
  /** Daily bars, oldest first: completed sessions and, last, the session in progress if any. */
  bars: readonly Bar[];
  /** When the reading is made. */
  evaluatedAt: Date;
  /** The latest instant the delayed feed's session data can include (fetch end, or evaluatedAt − delay). */
  observedThrough: Date;
  /** The feed's contractual delay (`resolveFeedPolicy(...).contractualDelayMs`). */
  delayMs: number;
}

/**
 * The session in progress and the completed sessions a decision at
 * `evaluatedAt` may read. The session bar is the last bar dated the
 * evaluation's own New York day that is not yet a completed session; with
 * none (before the open, a holiday) there is nothing to discover.
 */
export function splitSession(input: DiscoveryInput): { completed: Bar[]; session: Bar | null } {
  const bars = input.bars.filter(goodBar);
  const completed = availableBars(bars, { timeframe: "1Day", assetClass: "us_equity", delayMs: input.delayMs, evaluatedAt: input.evaluatedAt });
  const last = bars[bars.length - 1];
  const today = etDateKey(input.evaluatedAt);
  const session = last && etDateKey(new Date(last.t)) === today && !completed.includes(last) ? last : null;
  return { completed, session };
}

function lastPivots(completed: Bar[], priorClose: number): { top: number | null; bottom: number | null } {
  const pivots = walkSwingChart(completed, THREE_DAY_CHART).pivots;
  // The last completed top and bottom: an old top already under the prior
  // close (or bottom over it) has been crossed and is not the level ahead.
  const lastTop = [...pivots].reverse().find((p) => p.kind === "top")?.price ?? null;
  const lastBottom = [...pivots].reverse().find((p) => p.kind === "bottom")?.price ?? null;
  const top = lastTop != null && lastTop > priorClose ? lastTop : null;
  const bottom = lastBottom != null && lastBottom < priorClose ? lastBottom : null;
  return { top, bottom };
}

/**
 * The discovery reading for one stock, or null when it shows no condition,
 * has no session in progress, or has too little clean history. Deterministic:
 * the same bars and times give the same reading.
 */
export function readDiscovery(input: DiscoveryInput): DiscoveryReading | null {
  if (!Number.isFinite(input.evaluatedAt.getTime()) || !Number.isFinite(input.observedThrough.getTime())) return null;
  if (!(input.delayMs >= 0)) return null;
  // Only the recent bars are read, before the session split: the split's
  // availability test reads each bar's New York date, the pass's main cost.
  const split = splitSession({ ...input, bars: input.bars.slice(-(MAX_SESSIONS_READ + 2)) });
  const session = split.session;
  const completed = split.completed.slice(-MAX_SESSIONS_READ);
  if (!session || completed.length < AVERAGE_SESSIONS + 2) return null;
  const prior = completed[completed.length - 1];
  const priorClose = prior.c;
  const conditions: DiscoveryCondition[] = [];

  const { top, bottom } = lastPivots(completed, priorClose);
  if (top != null) {
    const allowance = gannThreePoints(top);
    if (session.h >= top + allowance) conditions.push({ kind: "old_level_crossed", basis: "sourced", side: "top", level: top });
    else if (top - session.h <= allowance) conditions.push({ kind: "at_old_level", basis: "sourced", side: "top", level: top });
  }
  if (bottom != null) {
    const allowance = gannThreePoints(bottom);
    if (session.l <= bottom - allowance) conditions.push({ kind: "old_level_crossed", basis: "sourced", side: "bottom", level: bottom });
    else if (session.l - bottom <= allowance) conditions.push({ kind: "at_old_level", basis: "sourced", side: "bottom", level: bottom });
  }

  const cutoff = Date.parse(prior.t) - BREAKAWAY_RANGE_DAYS * DAY_MS;
  const window = completed.filter((b) => Date.parse(b.t) > cutoff);
  if (window.length > 0) {
    const hi = Math.max(...window.map((b) => b.h));
    const lo = Math.min(...window.map((b) => b.l));
    if (session.h > hi) conditions.push({ kind: "new_13_week_extreme", basis: "sourced", side: "high", level: hi });
    if (session.l < lo) conditions.push({ kind: "new_13_week_extreme", basis: "sourced", side: "low", level: lo });
    const run = narrowRangeSessions(window);
    if (run) {
      const rTop = Math.max(...run.map((b) => b.h));
      const rBottom = Math.min(...run.map((b) => b.l));
      if (session.h >= rTop + gannThreePoints(rTop)) conditions.push({ kind: "narrow_range_breakaway", basis: "sourced", side: "top", level: rTop, sessions: run.length });
      if (session.l <= rBottom - gannThreePoints(rBottom)) conditions.push({ kind: "narrow_range_breakaway", basis: "sourced", side: "bottom", level: rBottom, sessions: run.length });
    }
  }

  const avgRange = atr(completed.slice(-(AVERAGE_SESSIONS + 1)), 14);
  const avgVolume = completed.slice(-AVERAGE_SESSIONS).reduce((s, b) => s + b.v, 0) / AVERAGE_SESSIONS;
  const elapsed = Math.min(SESSION_MINUTES, Math.max(0, etParts(input.observedThrough).minutes - (9 * 60 + 30)));
  if (avgRange > 0 && avgVolume > 0 && elapsed > 0) {
    const range = Math.max(session.h - session.l, Math.abs(session.h - priorClose), Math.abs(session.l - priorClose));
    const rangeAtrs = range / avgRange;
    const volumePace = session.v / (avgVolume * (elapsed / SESSION_MINUTES));
    if (rangeAtrs >= WIDE_DAY_ATRS && volumePace >= VOLUME_CLIMAX_THRESHOLD) {
      conditions.push({ kind: "wide_range_volume", basis: "heuristic", rangeAtrs, volumePace });
    }
  }

  if (conditions.length === 0) return null;
  const point = gannPoint(priorClose);
  const dollars = session.c - priorClose;
  return {
    shadow: true,
    symbol: input.symbol.toUpperCase(),
    conditions,
    attention: {
      pct: (dollars / priorClose) * 100,
      dollars,
      points: point > 0 ? dollars / point : 0,
      gapPct: ((session.o - priorClose) / priorClose) * 100,
    },
    priorClose,
    dataAsOf: input.observedThrough.toISOString(),
    evaluatedAt: input.evaluatedAt.toISOString(),
  };
}

/**
 * Discoveries, most worth examining first: more sourced conditions, then more
 * heuristic ones, then the larger price-scaled move (attention), then the
 * symbol. Gann ranks none of his conditions above another, so they are
 * counted, not weighed.
 */
export function rankDiscoveries(readings: readonly DiscoveryReading[]): DiscoveryReading[] {
  const sourced = (r: DiscoveryReading) => r.conditions.filter((c) => c.basis === "sourced").length;
  const heuristic = (r: DiscoveryReading) => r.conditions.length - sourced(r);
  return [...readings].sort(
    (a, b) =>
      sourced(b) - sourced(a) ||
      heuristic(b) - heuristic(a) ||
      Math.abs(b.attention.points) - Math.abs(a.attention.points) ||
      (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0),
  );
}

/** Read every stock's bars and rank the discoveries. One bad series never stops the rest. */
export function discoverUniverse(
  series: ReadonlyMap<string, readonly Bar[]>,
  at: { evaluatedAt: Date; observedThrough: Date; delayMs: number },
): DiscoveryReading[] {
  const out: DiscoveryReading[] = [];
  for (const [symbol, bars] of series) {
    try {
      const r = readDiscovery({ symbol, bars, ...at });
      if (r) out.push(r);
    } catch {
      // A malformed series reads as no discovery, never as a failed pass.
    }
  }
  return rankDiscoveries(out);
}
