/**
 * Volume climax at the anchor pivot.
 *
 * Gann held that a genuine turning point prints on climax volume, not a
 * quiet one — a swing low made on unusually heavy volume argues for real
 * accumulation there, not just an ordinary lull. This reads
 * `lib/signals/indicators.ts`'s `relativeVolume()` off the bars *ending at*
 * each candidate pivot, so its "latest bar" is the pivot itself and the
 * trailing lookback it compares against is whatever came before that pivot —
 * not the scan's current bar. Reuses the same `>1.5x` threshold
 * `lib/signals/regime.ts` already validated for "unusual volume" there
 * (`acceptedBreakout`), rather than re-deriving a new ratio and cutoff, per
 * AGENTS.md's cross-platform consistency principle.
 *
 * Shares `lib/analysis/pivots.ts`'s pivot detection and the dual-anchor
 * convention `computeAngleSlopes`/`computeTimePriceSquare` already use (a
 * low anchor for the bullish reading, a high anchor for the bearish one) —
 * `anchorPrice`/`anchorKind` below is always the single most recent pivot of
 * each kind, same as those siblings, so a trade judged against this reading
 * is judged against the same swing point they'd use. Only the volume check
 * itself looks wider — see `RECENT_PIVOTS_CHECKED` below.
 *
 * **Gann's volume rule, not only the climax (parity X1/D1, owner decision
 * 2026-09-27: "Gann's method supersedes my own").** Three of his texts agree
 * that sales increase near tops and *decrease* near bottoms: after a long
 * decline, volume shrinks and the range narrows as liquidation runs its
 * course (Master Course Ch. 12; *45 Years in Wall Street* Ch. X;
 * *Commodities* p. 63). Heavy volume at a low is the exception, the panic or
 * selling climax (*New Stock Trend Detector* pp. 39-45). A retest of the low
 * on smaller volume says liquidation is over (*Wall Street Stock Selector*
 * Ch. VII), and the mirror, a secondary top on smaller volume than the final
 * advance, says the trend is turning down (*New Stock Trend Detector* Rule 7).
 * So each reading now carries all of them, and `confirms` is the rule for
 * its kind:
 *   - a low confirms on volume drying up (the normal bottom), a retest on
 *     lower volume, or a climax (the panic exception);
 *   - a high confirms on heavy volume (tops come on large sales) or a
 *     secondary top on lower volume.
 * The criterion key stays `volumeClimax` so stored runs and weights still
 * line up; what it measures is Gann's full rule.
 *
 * **Item 8 step 3 (2026-10-16, forks FV1-FV5 at their recommendations).**
 * - Retests compare the raw volume of each turn's calendar week, second over
 *   first (FV3; W006 p.46 makes the weekly chart the trading chart), not
 *   each pivot bar's volume against its own trailing 20.
 * - A secondary move need not retest (FV1): a lower top after a decline from
 *   the first on heavy volume, on smaller volume (Rules 1 and 7, W006
 *   pp.39-40, 48: Apr 1930's rally to 297, 23% under the top); a higher low
 *   out of a bear on less volume than the first advance, with the advance
 *   after it heavier (Rule 4, W006 p.40: Feb 1933's 49½ against the 40½
 *   low); and a panic's secondary low at or above the climax low on half the
 *   climax week's volume or less (W006 p.48, "much less").
 * - A high also confirms when the heaviest week since the last major top
 *   came in the advance into it and stood out (FV4; Master Course Ch.12: the
 *   largest volume often comes before the final top). A first version, the
 *   heaviest week since the previous local top, passed 80% of random-walk
 *   tops and was dropped.
 * - A low also confirms when the last completed month traded the least of the
 *   last five years (FV5; W006 pp.43-44 and Master Course Ch.12: the smallest
 *   volume in years, "a sure sign of bottom"), the low is a bottom (the lowest
 *   of the half year before it) and it was printed in that month, up to two
 *   months before it, or in the month since. Both conditions tie the quiet
 *   month to a bottom: without them an uptrend whose share volume falls as
 *   the price rises read "a sign of bottom" near its high (item 8 review H1).
 *   Needs the monthly bars; the live coarse pre-filter has none, so only the
 *   full scan reads it.
 * - Completed sessions only, when `asOf` is given: a session still trading
 *   has part of its volume. The live scan and the replay pass it.
 * Not read, labelled: Rule 1/7's "sharp" decline (only "heavy" is read);
 * Rule 4's advance after the higher low is read on its volume alone, not on
 * price advancing; A-VOLUME-06's rally "on fair volume" between the panic low
 * and the secondary low. The heaviest week before a top confirms any
 * strength-4 high it precedes, not only a final top: Gann's "often comes
 * before the final top" can't be told from "before a top" until later.
 * After the close, and on a weekend, the trims read through the last session
 * before the day being read, one session (or week) stale but the same on the
 * scan and the replay. Crypto daily bars are not read by the scored rule's
 * week comparisons as a separate case; a 7-day week can put two pivots in one
 * week, which then compare at exactly 1 (never smaller).
 * Engineering choices, labelled: "heavy" decline = its mean volume above the
 * `lookback` sessions before the first top; the bear low = the lowest of the
 * last `BEAR_LOW_SESSIONS` sessions read; "much less" = `PANIC_SECONDARY_RATIO`;
 * "years" = `EXTREME_LOW_MONTHS` with at least `EXTREME_LOW_MIN_MONTHS`.
 * Whether the data feed split-adjusts volume could not be checked; a reverse
 * split inside the five years would make the months after it look small.
 *
 * Engineering choices, labelled as such: "drying up" compares the mean
 * volume and mean bar range of the `DRY_UP_BARS` bars ending at the pivot
 * with the `lookback` bars before them, and requires both to have shrunk;
 * a retest is a pivot within `RETEST_TOLERANCE_PCT` of, or beyond, the one
 * before it. Gann gives the observation, not the window.
 *
 * **Documented asset-class exception, not an oversight (2026-09-16 audit):**
 * *How to Make Profits Trading in Commodities* (1941/51) discloses a fifth
 * culmination rule alongside the volume-of-sales ones this module already
 * approximates — rising open interest into a low reads as accumulation,
 * falling open interest into a high on rising price reads as distribution
 * near a top. Open interest is a derivatives-contract concept (who holds an
 * open futures/options position), not a property of a share of stock or a
 * spot crypto holding — `AssetClass` (`lib/types.ts`) is `"us_equity" |
 * "crypto"` only, and `Bar` (same file) carries no open-interest field for
 * either. Per AGENTS.md's cross-platform-consistency carve-out ("a concept
 * that shouldn't apply somewhere... is a real exception, not a violation"),
 * this rule has no surface to implement against in GSPS today and is
 * intentionally not built — not silently dropped.
 */

import { findPivots, majorPivots } from "@/lib/analysis/pivots";
import { relativeVolume } from "@/lib/signals/indicators";
import type { Bar } from "@/lib/types";
import { etDateKey } from "@/lib/market/session";
import { beyondByThreePoints, threePoints } from "@/lib/gann/pointScale";
import { DOUBLE_BOTTOM_MIN_DAYS } from "@/lib/gann/entryKind";

/**
 * Held at the `lib/signals/regime.ts`-matched 1.5x since 2026-09-14, when a
 * brief widening to 1.25x (part of the since-closed Execute-collapse
 * stopgap) turned out to dilute the signal toward noise rather than just
 * admit more of it — see `lib/validation/criteria-registry.ts`'s
 * `volumeClimax` entry. `RECENT_PIVOTS_CHECKED` below is what actually fixed
 * the starvation this was trying to patch: the problem was "too few
 * candidate anchors ever clear 1.5x," not "1.5x itself is wrong." Confirmed
 * on the 2026-09-23 fresh run (12-symbol universe, 615 unconditioned trades,
 * `docs/replay-runs/2026-09-23-15Min-2R-within-all-12sym.json`): 273/615
 * (44.4%) passing, Δ+0.645R, the strongest single-criterion effect on that
 * board — well clear of saturation and clearly informative at 1.5x.
 */
export const VOLUME_CLIMAX_THRESHOLD = 1.5;

/**
 * How many of the most recent pivots of each kind get checked for climax
 * volume, instead of only the single latest one. Widening the anchor *pool*
 * this way — rather than lowering `VOLUME_CLIMAX_THRESHOLD` — keeps every
 * sibling criterion's shared anchor convention intact: `anchorPrice`/
 * `anchorKind` below still always name the single most recent pivot (the
 * same swing point `gannAngleSlope`/`timePriceSquare` judge their own
 * readings against), so this criterion never reads off a different swing
 * point than they do. Only the question "did a real climax happen near
 * here recently" gets to look past the single latest swing.
 *
 * 3 chosen to roughly match the reach `findPivots(bars, 4)`'s own strength
 * window already gives a single pivot (a candidate has to be extreme across
 * 4 bars each side to register at all, so the last 3 pivots of a kind
 * already span a meaningfully wider stretch than 3 raw bars would). Not yet
 * measured against outcomes — needs its own fresh committed run, same as
 * every other number in this file.
 */
export const RECENT_PIVOTS_CHECKED = 3;

/** Bars ending at the pivot that are compared with the bars before them for "drying up". */
export const DRY_UP_BARS = 5;
/** The 1% retest band used until 2026-10-16 (review M3); the band is now Gann's 3 points. No longer read. */
export const RETEST_TOLERANCE_PCT = 1;

export interface VolumeClimaxReading {
  anchorKind: "high" | "low";
  anchorPrice: number;
  /** Bar index of the anchor pivot — lets a caller (e.g. lib/gann/boilingPoint.ts) measure elapsed time from it without re-detecting pivots. */
  anchorIndex: number;
  /** Relative volume at the anchor pivot itself — kept for display/debugging. */
  relativeVolume: number;
  /** Highest relative volume among the last `RECENT_PIVOTS_CHECKED` pivots of this kind. */
  bestRecentRelativeVolume: number;
  /** Whether the anchor pivot or one of the last few pivots of its kind printed on climax volume. */
  climax: boolean;
  /** Volume and range both shrank into the anchor pivot (Gann's normal bottom; context for a high). */
  dryingUp: boolean;
  /** The anchor retested the previous pivot of its kind (within Gann's 3 points) in a week of two-thirds its volume or less (FV2, FV3). */
  retestOnLowerVolume: boolean;
  /**
   * When the anchor reached the previous pivot of its kind: the volume of the
   * anchor's week over the previous pivot's week (A-VOLUME-13, W006 pp.43-44:
   * a double top "on two-thirds the volume"; Master Course Ch.12: a third or
   * less). The retest confirms at two-thirds or less (`RETEST_VOLUME_RATIO`, fork FV2).
   */
  retestWeekVolumeRatio?: number | null;
  /**
   * A secondary move on smaller volume that does not retest (FV1 b): for a
   * high, a lower top after a decline from the first on heavy volume
   * (Rules 1 and 7, A-VOLUME-07); for a low, a higher low after the first
   * advance out of a bear, on less volume than that advance, with the next
   * advance heavier (Rule 4, A-VOLUME-05).
   */
  secondaryOnLowerVolume?: boolean;
  /** A low: a later low at or above a climax low on half its week's volume or less (A-VOLUME-06). */
  panicSecondary?: boolean;
  /** A high: the heaviest week since the last major top came in the advance into this one, and stood out (FV4 b). See `heaviestWeekBeforeTop`. */
  heavyAdvance?: boolean;
  /** A bottom printed near the last completed month, which traded the least of the last five years (A-VOLUME-09). */
  volumeExtremeLow?: boolean;
  /** A high: a second test of a top that came on heavy volume, Gann's double-top sell (A-ENTRY-20). Already counted in `climax`. */
  retestOfHeavyTop?: boolean;
  /** Gann's volume rule for this kind of turn holds (see the module header). */
  confirms: boolean;
}

/** "Much less" volume at a panic's secondary low: half the climax week's or less (labelled). */
export const PANIC_SECONDARY_RATIO = 0.5;
/**
 * A retest confirms on two-thirds of the first turn's week or less (fork FV2,
 * answered from Gann 2026-10-28): W006 pp.43-44's double top "on two-thirds the
 * volume"; the Master Course's sell signal (Ch.12, "a third or less") lies
 * inside it. Rules 1 and 7's "smaller volume" gives no figure, so the one Gann
 * names is read. Bottoms mirror tops (Polarity). Until then any smaller week
 * confirmed, which noise passes about half the time once the 3-point band is hit.
 */
export const RETEST_VOLUME_RATIO = 2 / 3;
/** A bear low is the lowest of the last this-many sessions read (a year, the live scan's daily span), labelled. */
export const BEAR_LOW_SESSIONS = 252;
/** "In years": the completed months read for the smallest monthly volume, and the fewest that will do. */
export const EXTREME_LOW_MONTHS = 60;
export const EXTREME_LOW_MIN_MONTHS = 36;
/** The quiet month may come up to this many months after the low it confirms (Sep 1934 after July's bottom). */
export const EXTREME_LOW_LEAD_MONTHS = 2;
/** A bottom: the lowest low of this many sessions before it, half a year. */
export const BOTTOM_SESSIONS = 126;
/**
 * Weeks read for the heaviest week before a top: 48, inside the live scan's
 * year of daily bars (fetched 365 days back, so its first week may be a part
 * week, and the top's week can sit a week or two before the last session).
 * The replay's longer history then reads exactly the same weeks.
 */
export const HEAVY_WEEKS_READ = 48;

export interface VolumeClimaxOptions {
  /** The session being read. Bars dated on or after it (the session still trading) are not read. */
  asOf?: Date;
  /** Monthly bars, for the smallest monthly volume in years (A-VOLUME-09). The month in progress is not read. */
  monthly?: Bar[] | null;
}

const mean = (xs: number[]) => (xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length);

function driedUp(bars: Bar[], index: number, lookback: number): boolean {
  const end = index + 1;
  const recent = bars.slice(Math.max(0, end - DRY_UP_BARS), end);
  const before = bars.slice(Math.max(0, end - DRY_UP_BARS - lookback), Math.max(0, end - DRY_UP_BARS));
  if (recent.length < DRY_UP_BARS || before.length < lookback / 2) return false;
  const vol = mean(recent.map((b) => b.v)) < mean(before.map((b) => b.v));
  const range = mean(recent.map((b) => b.h - b.l)) < mean(before.map((b) => b.h - b.l));
  return vol && range;
}

/** Monday (UTC midnight, ms) of the calendar week holding `t`. */
function weekOf(t: string): number {
  const hit = WEEKS.get(t);
  if (hit !== undefined) return hit;
  // Whole UTC days since the epoch (a Thursday), back to that week's Monday.
  const day = Math.floor(Date.parse(t) / 86_400_000);
  const week = (day - ((day + 3) % 7)) * 86_400_000;
  if (WEEKS.size > 200_000) WEEKS.clear();
  WEEKS.set(t, week);
  return week;
}
/** Timestamps already resolved: the replay reads the same sessions on every day it walks. */
const WEEKS = new Map<string, number>();

/** Total volume of the calendar week holding bar `index`. */
function weekVolume(bars: Bar[], index: number): number {
  const w = weekOf(bars[index].t);
  let v = 0;
  for (let i = index; i >= 0 && weekOf(bars[i].t) === w; i--) v += bars[i].v;
  for (let i = index + 1; i < bars.length && weekOf(bars[i].t) === w; i++) v += bars[i].v;
  return v;
}

/** Mean volume of bars `from`..`to` inclusive (NaN when empty). */
function meanVolume(bars: Bar[], from: number, to: number): number {
  return mean(bars.slice(Math.max(0, from), to + 1).map((b) => b.v));
}

/**
 * The last completed month traded the least of the last `EXTREME_LOW_MONTHS`
 * completed months, and the low being read was printed near it: in that
 * month, in the `EXTREME_LOW_LEAD_MONTHS` months before it, or in the month
 * since (`lowMonth`, "YYYY-MM"). Gann's cases are a low printed on the quiet
 * month (Feb 1933) and a quiet month just after a bottom (Sep 1934, after
 * July's low); a quiet month far from the low says nothing about it.
 */
export function smallestMonthInYears(monthly: Bar[] | null | undefined, asOf: Date | undefined, lowMonth?: string): boolean {
  // Without the session being read, the month in progress can't be told apart, so nothing is read.
  if (!monthly || !asOf) return false;
  const current = etDateKey(asOf).slice(0, 7);
  // A month bar is stamped at the start of its month (New York midnight, the
  // same date in UTC), so its key is its own date's month; formatting each
  // bar's date in New York time cost a second per 250 symbols.
  const done = monthly.filter((m) => m.t.slice(0, 7) < current).slice(-EXTREME_LOW_MONTHS);
  if (done.length < EXTREME_LOW_MIN_MONTHS) return false;
  const last = done[done.length - 1].v;
  if (!(last > 0 && done.slice(0, -1).every((m) => m.v > last))) return false;
  if (lowMonth === undefined) return true;
  const quiet = done[done.length - 1].t.slice(0, 7);
  const gap = monthIndex(quiet) - monthIndex(lowMonth);
  return gap >= -1 && gap <= EXTREME_LOW_LEAD_MONTHS;
}

/** Months since year 0, from a "YYYY-MM" key. */
function monthIndex(key: string): number {
  return Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
}

/**
 * A bottom: no lower low in the `BOTTOM_SESSIONS` sessions before it (half a
 * year, Gann's 26 weeks; both of his cases qualify, Feb 1933's low the lowest
 * since July 1932 and July 1934's since October 1933). An engineering choice,
 * labelled: Gann names the market "at a low", not a lookback.
 */
function isBottom(bars: Bar[], index: number, price: number): boolean {
  if (index < BOTTOM_SESSIONS) return false;
  return bars.slice(index - BOTTOM_SESSIONS, index).every((b) => b.l > price);
}

/**
 * FV4 b: the heaviest week since the last major top came in the advance into
 * the top at `index`, and stood out (A-VOLUME-07/-12; Master Course Ch.12:
 * the largest volume of sales often comes before the final top). Weekly bars
 * rolled from `bars` up to the top's week, within the last `HEAVY_WEEKS_READ`
 * weeks of all the bars read, so a year of history and six read the same weeks. Engineering choices,
 * labelled: the last major top is `majorPivots(findPivots(weeks, 3))`'s last
 * high (the A-VOLUME-12 reading); the advance starts at
 * the lowest week since it; "stood out" is `VOLUME_CLIMAX_THRESHOLD` times the
 * mean week since it. The weeks are the last `HEAVY_WEEKS_READ` of all the
 * bars read, so a year of history and six read the same ones.
 */
export function heaviestWeekBeforeTop(bars: Bar[], index: number): boolean {
  // The weeks end at the top's own week, which therefore can't be a weekly pivot itself.
  const weeks: Bar[] = [];
  for (let i = 0; i <= index; i++) {
    const b = bars[i];
    const w = weekOf(b.t);
    const last = weeks[weeks.length - 1];
    if (last && weekOf(last.t) === w) {
      last.h = Math.max(last.h, b.h);
      last.l = Math.min(last.l, b.l);
      last.c = b.c;
      last.v += b.v;
    } else weeks.push({ t: new Date(w).toISOString(), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
  }
  // The last `HEAVY_WEEKS_READ` weeks of the bars read, not of the top: a top
  // well back in the year is read over the same weeks on every history.
  const first = weekOf(bars[bars.length - 1].t) - (HEAVY_WEEKS_READ - 1) * 7 * 86_400_000;
  const read = weeks.filter((w) => Date.parse(w.t) >= first);
  const prior = majorPivots(findPivots(read, 3))
    .filter((p) => p.kind === "high")
    .pop();
  if (!prior) return false;
  const since = read.slice(prior.index + 1);
  if (since.length < 2) return false;
  const low = since.reduce((m, w, i) => (w.l < since[m].l ? i : m), 0);
  const heaviest = since.reduce((m, w, i) => (w.v > since[m].v ? i : m), 0);
  return heaviest > low && since[heaviest].v > VOLUME_CLIMAX_THRESHOLD * mean(since.map((w) => w.v));
}

export function computeVolumeClimax(allBars: Bar[], lookback = 20, opts: VolumeClimaxOptions = {}): VolumeClimaxReading[] {
  // Completed sessions only: a session still trading has part of its volume.
  // Dropping from the end keeps every index the same as in `allBars`.
  let end = allBars.length;
  if (opts.asOf) {
    const today = etDateKey(opts.asOf);
    while (end > 0 && etDateKey(new Date(allBars[end - 1].t)) >= today) end--;
  }
  const bars = end === allBars.length ? allBars : allBars.slice(0, end);
  const pivots = findPivots(bars, 4);

  const readings: VolumeClimaxReading[] = [];
  for (const kind of ["low", "high"] as const) {
    const recent = [...pivots].reverse().filter((p) => p.kind === kind).slice(0, RECENT_PIVOTS_CHECKED);
    const anchor = recent[0];
    if (!anchor) continue;

    const anchorRvol = relativeVolume(bars.slice(0, anchor.index + 1), lookback);
    if (anchorRvol === null) continue;

    let best = anchorRvol;
    for (const pivot of recent.slice(1)) {
      const rvol = relativeVolume(bars.slice(0, pivot.index + 1), lookback);
      if (rvol !== null && rvol > best) best = rvol;
    }

    const climax = best > VOLUME_CLIMAX_THRESHOLD;
    const dryingUp = driedUp(bars, anchor.index, lookback);
    const previous = recent[1];
    let retestOnLowerVolume = false;
    let retestWeekVolumeRatio: number | null = null;
    let secondaryOnLowerVolume = false;
    let panicSecondary = false;
    let heavyAdvance = false;
    let retestOfHeavyTop = false;
    if (previous) {
      // "The same level" on the near side is Gann's 3 points too, the band
      // double tops, level tests and the old-level entry read (review M3,
      // 2026-10-16; it was 1%, `RETEST_TOLERANCE_PCT`, kept for the record).
      const tol = threePoints(previous.price);
      // A retest reaches the old turn but does not cross it by Gann's 3 points
      // (W006 p.20): beyond them it is a crossing, not a second test (review
      // M3, 2026-10-16; until then a top any distance over the old one counted).
      const reached =
        kind === "low"
          ? anchor.price <= previous.price + tol && anchor.price >= beyondByThreePoints(previous.price, -1)
          : anchor.price >= previous.price - tol && anchor.price <= beyondByThreePoints(previous.price, 1);
      // FV3 b: the two turns' own weeks, second over first (W006 p.46: the weekly chart).
      const prevWeek = weekVolume(bars, previous.index);
      const ratio = prevWeek > 0 ? weekVolume(bars, anchor.index) / prevWeek : null;
      retestOnLowerVolume = reached && ratio !== null && ratio <= RETEST_VOLUME_RATIO + 1e-9;
      if (reached) retestWeekVolumeRatio = ratio;
      // A-ENTRY-20 (W006 p.28): a double top whose earlier high came on heavy
      // volume is a sell, the stop 3 points over the old high (the old-level
      // short). The heavy earlier top already counts in `climax` (the best of
      // the recent pivots); this names the case for the note. "Heavy" is
      // `VOLUME_CLIMAX_THRESHOLD` (an engineering figure, labelled). The two
      // tops are weeks apart, as the old-level sale reads a double top (W006
      // p.20, `DOUBLE_BOTTOM_MIN_DAYS`): a retest days later is the same swing.
      const weeksApart =
        Math.round((Date.parse(bars[anchor.index].t) - Date.parse(bars[previous.index].t)) / 86_400_000) >= DOUBLE_BOTTOM_MIN_DAYS;
      if (kind === "high" && reached && weeksApart) {
        const prevRvol = relativeVolume(bars.slice(0, previous.index + 1), lookback);
        retestOfHeavyTop = prevRvol !== null && prevRvol > VOLUME_CLIMAX_THRESHOLD;
      }
      // The opposite extreme between the two turns: the decline (rally) that separates them.
      const between = bars.slice(previous.index + 1, anchor.index);
      if (between.length > 0) {
        const pick = kind === "high" ? between.reduce((m, b) => (b.l < m.l ? b : m)) : between.reduce((m, b) => (b.h > m.h ? b : m));
        const mid = previous.index + 1 + between.indexOf(pick);
        if (kind === "high") {
          // Rules 1 and 7: after a sharp decline on heavy volume, a secondary
          // rally on smaller volume. "Heavy": the decline's mean volume above
          // the `lookback` sessions before the first top (labelled).
          const heavyDecline = meanVolume(bars, previous.index + 1, mid) > meanVolume(bars, previous.index - lookback, previous.index - 1);
          // A lower top: one crossing the old by more than 3 points is a
          // breakout, not Rule 1/7's secondary rally (review H1).
          secondaryOnLowerVolume = anchor.price < previous.price - tol && heavyDecline && ratio !== null && ratio < 1;
        } else {
          // Rule 4: the first advance out of a bear market (the earlier low is
          // the lowest of the year before it, labelled), a higher secondary
          // low on less volume than that advance, then a heavier advance.
          // The year is the last `BEAR_LOW_SESSIONS` sessions read, so a year of
          // history and six give the same answer.
          const start = Math.max(0, bars.length - BEAR_LOW_SESSIONS);
          // A low older than the year read has no year before it to be the lowest of.
          const bearLow = previous.index >= start && bars.slice(start, previous.index).every((b) => b.l > previous.price);
          const advance = meanVolume(bars, previous.index + 1, mid);
          const reaction = meanVolume(bars, mid + 1, anchor.index);
          const after = meanVolume(bars, anchor.index + 1, bars.length - 1);
          // A higher low: one breaking the old by more than 3 points is a
          // breakdown, not Rule 4's secondary low (review H1).
          secondaryOnLowerVolume = anchor.price > previous.price + tol && bearLow && reaction < advance && after > reaction;
          // A-VOLUME-06: a panic bottom on large volume, a rally, then a
          // secondary decline on much less volume, at or above the panic low.
          const prevRvol = relativeVolume(bars.slice(0, previous.index + 1), lookback);
          panicSecondary =
            prevRvol !== null && prevRvol > VOLUME_CLIMAX_THRESHOLD && anchor.price >= previous.price - tol && ratio !== null && ratio <= PANIC_SECONDARY_RATIO;
        }
      }
    }
    if (kind === "high") heavyAdvance = heaviestWeekBeforeTop(bars, anchor.index);
    const volumeExtremeLow =
      kind === "low" &&
      isBottom(bars, anchor.index, anchor.price) &&
      smallestMonthInYears(opts.monthly, opts.asOf, etDateKey(new Date(bars[anchor.index].t)).slice(0, 7));
    const confirms =
      kind === "low"
        ? dryingUp || retestOnLowerVolume || climax || secondaryOnLowerVolume || panicSecondary || volumeExtremeLow
        : climax || retestOnLowerVolume || secondaryOnLowerVolume || heavyAdvance;

    readings.push({
      anchorKind: anchor.kind,
      anchorPrice: anchor.price,
      anchorIndex: anchor.index,
      relativeVolume: anchorRvol,
      bestRecentRelativeVolume: best,
      climax,
      dryingUp,
      retestOnLowerVolume,
      retestWeekVolumeRatio,
      secondaryOnLowerVolume,
      panicSecondary,
      heavyAdvance,
      volumeExtremeLow,
      retestOfHeavyTop,
      confirms,
    });
  }
  return readings;
}
