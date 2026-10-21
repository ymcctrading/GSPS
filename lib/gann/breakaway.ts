/**
 * Gann's breakaway rule for sideways markets (owner decision 5, 2026-09-27).
 *
 * Gann: when a market moves sideways in a narrow range, for 2 to 6 weeks or
 * 10 to 13 weeks, it is accumulating or distributing, and the trader stays
 * out until it breaks away. Buy when it crosses the top of the range, sell
 * when it breaks the bottom; a trade inside the range is a guess about which
 * way it will leave (*How to Make Profits in Commodities*, 1951, pp. 51-52;
 * `docs/memory-bank/sources/A08_*`, Tier A).
 *
 * So a range-bound market can be context (Watch) but not an instruction to
 * act (Execute) unless the armed entry is the breakaway itself: the trigger
 * crosses the highest completed top (long) or lowest completed bottom (short)
 * of the range.
 *
 * Engineering choices, labelled as such:
 * - "Range-bound" is `isGannRangeBound` (the weekly swing chart's trend is
 *   not confirmed by stepping 3-day swings, `trendStrength.ts`) AND a narrow
 *   range (`narrowRangeSessions`). Until 2026-10-21 it was the first alone,
 *   which is true of about half the readings of a steadily rising random walk
 *   (46% at +0.2% a day) and of most turns; Gann's rule is for a market held
 *   in a narrow range for weeks, and this module's volume half already read
 *   it that way. The width is `NARROW_RANGE_ALLOWANCES`, an engineering
 *   figure; Gann gives none (his dated ranges, 2 points on the 1897 Rails,
 *   2½ on the 1911 Rails, 56-60 in 1898, all sit inside it).
 * - The narrow range is counted back from the latest session (2026-10-21,
 *   the 2-6 week case): Gann's "2 to 6 weeks or 10 to 13 weeks in a narrow
 *   range, then crossing the tops or breaking the bottoms of the previous
 *   weeks" (Master Course pp. 246-248; *Commodities* p. 51, "Many Weeks in
 *   Narrow Range") measures the range the market is in now, however wide it
 *   was before. So the range is the longest run of sessions ending at the
 *   latest that stays narrow, at least `MIN_RANGE_SESSIONS` (Gann's two
 *   weeks) and at most `BREAKAWAY_RANGE_DAYS` (his 13). When the whole 13
 *   weeks are narrow that is all of them, as before; after a wide 13 weeks it
 *   is the 2-6 weeks of narrow sessions at the end. The 7-9 weeks between
 *   his two bands are read too: his own examples include 8 and 9 weeks
 *   (Rails 1911, 1897), so the bands are what he saw, not a rule against
 *   the weeks between.
 * - Its extremes are the completed 3-Day Chart tops and bottoms inside that
 *   run. The same chart arms the entry trigger, so the comparison is like for
 *   like.
 *
 * Three-question basis:
 * 1. Gann: as cited above, Tier A.
 * 2. Cycles: the 2-6 and 10-13 week durations are Gann's observed lengths of
 *    accumulation, used here only as the shortest and longest range read. No periodicity claim
 *    is made, so Dewey's checklist does not apply.
 * 3. Hermetic: Polarity. A range is the market held between two poles, and
 *    the rule acts only once one pole gives way. Rhythm also fits: the range
 *    is the market's rest between swings, and the breakaway is the next beat.
 */

import { beyondByThreePoints, gannThreePoints } from "@/lib/gann/pointScale";
import type { Bar } from "@/lib/types";
import type { GannEntryTrigger } from "@/lib/gann/entryTrigger";
import { restsWithoutCrossing } from "@/lib/gann/entryKind";
import { isGannRangeBound } from "@/lib/gann/trendStrength";
import { swingPivots } from "@/lib/gann/swingChart";
import { etDateKey } from "@/lib/market/session";

/** Gann's upper bound for a narrow sideways range: 13 weeks. */
export const BREAKAWAY_RANGE_DAYS = 91;

const DAY_MS = 24 * 3600 * 1000;
/**
 * A trigger built on the range's own top is exactly its extreme plus 3
 * points, which is the breakaway; this absorbs floating-point noise so that
 * case counts.
 */
const EPS = 1e-9;

/**
 * A double or triple bottom (top) is a test of the range's own edge, and Gann
 * gives it its own stop 3 points beyond the level (W006 pp.11, 20, 46), so it
 * is not held to Watch here; the hold still applies to a crossing inside a
 * range. Put to the owner on 2026-10-15 as a decision against owner decision
 * 5 (PLAN.md item 5, step 2); built on the recommended option until answered.
 * A single bottom that held (step 4) is read the same way, under the same
 * decision: it is a bottom of the range with its own stop 3 points under it.
 * The bear-market rally sell (step 4b) is exempt too, on a different reading,
 * labelled as such (step 4b review R3): it is offered only while the weekly
 * chart is down, so for Gann it is a sale with the trend, not a guess inside a
 * sideways market, and the daily chart reads "range-bound" during it only
 * because the rally itself has stopped confirming the decline.
 */
export const OLD_LEVEL_BUYS_IN_RANGE = true;

export interface BreakawayReading {
  rangeBound: boolean;
  /** The range's highest completed top and lowest completed bottom, when range-bound. */
  rangeHigh: number | null;
  rangeLow: number | null;
  /** The armed entry crosses the range's extreme in its own direction. */
  breaksAway: boolean;
}

export function readBreakaway(daily: Bar[], trigger: GannEntryTrigger | null): BreakawayReading {
  if (daily.length === 0 || !isGannRangeBound(daily)) {
    return { rangeBound: false, rangeHigh: null, rangeLow: null, breaksAway: true };
  }
  // A held level was crossed earlier and is bought on the reaction (PLAN.md
  // item 5). The range it broke away from is the one before that crossing;
  // the top made after it is the breakaway's own move, not the range.
  const end = trigger?.held && trigger.crossedAt ? Date.parse(trigger.crossedAt) : Infinity;
  const cutoff = Math.min(Date.parse(daily[daily.length - 1].t), end) - BREAKAWAY_RANGE_DAYS * DAY_MS;
  // Gann's sideways market is a narrow range held for weeks (Commodities
  // pp. 51-52; Master Course: "2-6 or 10-13 weeks in a narrow range"), not
  // any market whose trend is unconfirmed (2026-10-21): the same narrow
  // sessions `breakawayVolumeMet` reads, counted back from the latest, at
  // least Gann's two weeks of them.
  const range = narrowRangeSessions(
    daily.filter((b) => {
      const t = Date.parse(b.t);
      return t >= cutoff && t < end;
    }),
  );
  if (!range) {
    return { rangeBound: false, rangeHigh: null, rangeLow: null, breaksAway: true };
  }
  const from = Date.parse(range[0].t);
  const pivots = swingPivots(daily, trigger?.swingDays ?? 3).filter((p) => {
    const t = Date.parse(daily[p.index].t);
    return t >= from && t < end;
  });
  const tops = pivots.filter((p) => p.kind === "top").map((p) => p.price);
  const bottoms = pivots.filter((p) => p.kind === "bottom").map((p) => p.price);
  const rangeHigh = tops.length > 0 ? Math.max(...tops) : null;
  const rangeLow = bottoms.length > 0 ? Math.min(...bottoms) : null;

  let breaksAway = false;
  // A bottom that held (step 4) is a bottom of the range too.
  if (restsWithoutCrossing(trigger?.kind) && OLD_LEVEL_BUYS_IN_RANGE) {
    breaksAway = true;
  } else if (trigger) {
    breaksAway =
      trigger.direction === "bullish"
        ? rangeHigh === null || trigger.triggerPrice >= beyondByThreePoints(rangeHigh, 1) - EPS * rangeHigh
        : rangeLow === null || trigger.triggerPrice <= beyondByThreePoints(rangeLow, -1) + EPS * rangeLow;
  }
  return { rangeBound: true, rangeHigh, rangeLow, breaksAway };
}

/** Completed sessions read for the breakaway's volume: inside the live scan's year of daily bars (about 250). */
export const BREAKAWAY_VOLUME_SESSIONS = 240;

export interface BreakawayVolumeReading {
  /** The way the last completed session left the range. */
  direction: "bullish" | "bearish";
  /** That session's volume over the mean volume of the narrow range's sessions before it (`narrowRangeSessions`). */
  ratio: number;
}

/**
 * Gann: avoid stocks in long, narrow ranges until they break out on volume
 * (A-VOLUME-10; W006 p.20; Master Course: volume rises as a stock starts from
 * dullness). Context only for now; fork FV6 puts the test at entry
 * confirmation.
 *
 * Reads completed sessions only, so the live scan and the replay read the
 * same ones: when the sessions before the last were range-bound
 * (`readBreakaway`, whose range is null outside one) and the last closed beyond the range's top or bottom by
 * the 3-point allowance, the ratio of its volume to the range sessions' mean.
 * Null otherwise. Engineering choices, labelled: the mean is over the
 * narrow range's sessions (`narrowRangeSessions`); the last `BREAKAWAY_VOLUME_SESSIONS`
 * are read, which bounds the cost on the replay's longer history.
 */
export function readBreakawayVolume(daily: Bar[], asOf: Date): BreakawayVolumeReading | null {
  const today = etDateKey(asOf);
  let end = daily.length;
  while (end > 0 && etDateKey(new Date(daily[end - 1].t)) >= today) end--;
  const done = daily.slice(Math.max(0, end - BREAKAWAY_VOLUME_SESSIONS), end);
  if (done.length < 2) return null;
  const last = done[done.length - 1];
  const prior = done.slice(0, -1);
  const range = readBreakaway(prior, null);
  const direction =
    range.rangeHigh !== null && last.c > beyondByThreePoints(range.rangeHigh, 1)
      ? "bullish"
      : range.rangeLow !== null && last.c < beyondByThreePoints(range.rangeLow, -1)
        ? "bearish"
        : null;
  if (!direction) return null;
  const cutoff = Date.parse(prior[prior.length - 1].t) - BREAKAWAY_RANGE_DAYS * DAY_MS;
  // The same narrow range `readBreakaway` read (review 20): a wide one is not one.
  const sessions = narrowRangeSessions(prior.filter((b) => Date.parse(b.t) >= cutoff));
  if (!sessions) return null;
  const mean = sessions.reduce((s, b) => s + b.v, 0) / sessions.length;
  if (!(mean > 0)) return null;
  return { direction, ratio: last.v / mean };
}

/**
 * Gann: avoid stocks in long, narrow ranges until they break out on volume
 * (A-VOLUME-10; W006 p.20; Master Course: volume rises as a stock starts from
 * dullness). Fork FV6 (b): the test acts at entry confirmation, because the
 * plan is priced before the break and the break's volume exists only once a
 * session has closed past the line.
 *
 * `chart` is completed daily sessions only (the entry chart, so the live scan
 * and the replay read the same ones); `line` is the crossing line, the level
 * plus the 3-point allowance. The breakout session is the latest completed
 * session that closed past the line after one that did not, within the last
 * `BREAKAWAY_RANGE_DAYS`. When the sessions before it (or every session, when
 * none has closed past yet) are range-bound (`isGannRangeBound`, the same
 * reading `readBreakaway` holds a range-bound Execute on), the entry is
 * ready only once that session has closed past the line on more than the
 * mean volume of the narrow range before it (`narrowRangeSessions`, 2 to 13
 * weeks). A market that is not range-bound has no volume condition, nor does
 * one with no narrow run of at least two weeks before the crossing.
 * Engineering choices, labelled: "on volume" is above the range sessions'
 * mean; the search window is the 91-day range bound; the width limit.
 */
/** Fewer completed sessions than this before the crossing are not read as a range. */
export const MIN_RANGE_SESSIONS = 10;
/**
 * A range wider than this many 3-point allowances at its low is not "narrow"
 * (Gann gives no width; an engineering figure, labelled; batch review A2).
 * Wider than `NARROW_SPELL_ALLOWANCES`, because a range of up to 13 weeks is
 * longer than the distribution spell.
 */
export const NARROW_RANGE_ALLOWANCES = 3;

/** The range's span is within `NARROW_RANGE_ALLOWANCES` 3-point allowances at its low. */
export function isNarrowRange(range: Bar[]): boolean {
  if (range.length === 0) return false;
  const low = Math.min(...range.map((b) => b.l));
  return Math.max(...range.map((b) => b.h)) - low <= NARROW_RANGE_ALLOWANCES * gannThreePoints(low);
}

/**
 * The narrow range the market is in now: the longest run of `sessions` ending
 * at the last one whose span stays within `NARROW_RANGE_ALLOWANCES` 3-point
 * allowances at its low, or null when it is shorter than `MIN_RANGE_SESSIONS`
 * (Gann's two weeks). Pass the sessions of the `BREAKAWAY_RANGE_DAYS` window
 * (his 13 weeks), so the run is 2 to 13 weeks long. Gann counts the weeks a
 * market has been held narrow before it crosses the tops or breaks the
 * bottoms of the previous weeks (Master Course pp. 246-248: "2-6 or 10-13
 * weeks in a narrow range"; *Commodities* p. 51), so a narrow spell after a
 * wide quarter is a range too. Widening the run only widens the span and
 * lowers its low, so the first session that breaks it ends the count.
 */
export function narrowRangeSessions(sessions: Bar[]): Bar[] | null {
  let high = -Infinity;
  let low = Infinity;
  let start = sessions.length;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const h = Math.max(high, sessions[i].h);
    const l = Math.min(low, sessions[i].l);
    if (h - l > NARROW_RANGE_ALLOWANCES * gannThreePoints(l)) break;
    high = h;
    low = l;
    start = i;
  }
  return sessions.length - start >= MIN_RANGE_SESSIONS ? sessions.slice(start) : null;
}

export function breakawayVolumeMet(chart: Bar[], direction: "bullish" | "bearish", line: number): boolean {
  const up = direction === "bullish";
  const beyond = (b: Bar) => (up ? b.c >= line : b.c <= line);
  const end = chart.length;
  if (end === 0) return true;
  const cutoff = Date.parse(chart[end - 1].t) - BREAKAWAY_RANGE_DAYS * DAY_MS;
  let k = -1;
  for (let i = end - 1; i >= 1 && Date.parse(chart[i].t) >= cutoff; i--) {
    if (beyond(chart[i]) && !beyond(chart[i - 1])) {
      k = i;
      break;
    }
  }
  const prior = k === -1 ? chart : chart.slice(0, k);
  // Gann's shortest range is about two weeks, so fewer sessions than that are
  // not read as a range (an engineering floor, labelled).
  if (prior.length < MIN_RANGE_SESSIONS || !isGannRangeBound(prior)) return true;
  const from = Date.parse((k === -1 ? chart[end - 1] : chart[k]).t) - BREAKAWAY_RANGE_DAYS * DAY_MS;
  // Gann's rule is for narrow ranges held for weeks: a wide one has no volume
  // condition. The range is `readBreakaway`'s, counted back from the crossing.
  const range = narrowRangeSessions(prior.filter((b) => Date.parse(b.t) >= from));
  if (!range) return true;
  if (k === -1) return false;
  const mean = range.reduce((s, b) => s + b.v, 0) / range.length;
  return mean > 0 && chart[k].v > mean;
}
