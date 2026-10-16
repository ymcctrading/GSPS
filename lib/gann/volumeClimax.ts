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
 *   volume in years, "a sure sign of bottom"). Needs the monthly bars; the
 *   live coarse pre-filter has none, so only the full scan reads it.
 * - Completed sessions only, when `asOf` is given: a session still trading
 *   has part of its volume. The live scan and the replay pass it.
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
/** How close (percent) a later pivot must come to the earlier one to count as a retest of it. */
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
  /** The anchor retested the previous pivot of its kind (within 1%, or beyond) in a week of smaller volume (FV3). */
  retestOnLowerVolume: boolean;
  /**
   * When the anchor reached the previous pivot of its kind: the volume of the
   * anchor's week over the previous pivot's week (A-VOLUME-13, W006 pp.43-44:
   * a double top "on two-thirds the volume"; Master Course Ch.12: a third or
   * less). Context only, measured; nothing reads it to confirm (fork FV2).
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
  /** A low: the last completed month traded the least of the last five years (A-VOLUME-09). */
  volumeExtremeLow?: boolean;
  /** Gann's volume rule for this kind of turn holds (see the module header). */
  confirms: boolean;
}

/** "Much less" volume at a panic's secondary low: half the climax week's or less (labelled). */
export const PANIC_SECONDARY_RATIO = 0.5;
/** A bear low is the lowest of the last this-many sessions read (a year, the live scan's daily span), labelled. */
export const BEAR_LOW_SESSIONS = 252;
/** "In years": the completed months read for the smallest monthly volume, and the fewest that will do. */
export const EXTREME_LOW_MONTHS = 60;
export const EXTREME_LOW_MIN_MONTHS = 36;
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
  // Whole UTC days since the epoch (a Thursday), back to that week's Monday.
  const day = Math.floor(Date.parse(t) / 86_400_000);
  return (day - ((day + 3) % 7)) * 86_400_000;
}

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

/** The last completed month traded the least of the last `EXTREME_LOW_MONTHS` completed months. */
export function smallestMonthInYears(monthly: Bar[] | null | undefined, asOf: Date | undefined): boolean {
  // Without the session being read, the month in progress can't be told apart, so nothing is read.
  if (!monthly || !asOf) return false;
  const current = etDateKey(asOf).slice(0, 7);
  // A month bar is stamped at the start of its month (New York midnight, the
  // same date in UTC), so its key is its own date's month; formatting each
  // bar's date in New York time cost a second per 250 symbols.
  const done = monthly.filter((m) => m.t.slice(0, 7) < current).slice(-EXTREME_LOW_MONTHS);
  if (done.length < EXTREME_LOW_MIN_MONTHS) return false;
  const last = done[done.length - 1].v;
  return last > 0 && done.slice(0, -1).every((m) => m.v > last);
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
  return heaviest >= low && since[heaviest].v > VOLUME_CLIMAX_THRESHOLD * mean(since.map((w) => w.v));
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
    if (previous) {
      const tol = (previous.price * RETEST_TOLERANCE_PCT) / 100;
      const reached = kind === "low" ? anchor.price <= previous.price + tol : anchor.price >= previous.price - tol;
      // FV3 b: the two turns' own weeks, second over first (W006 p.46: the weekly chart).
      const prevWeek = weekVolume(bars, previous.index);
      const ratio = prevWeek > 0 ? weekVolume(bars, anchor.index) / prevWeek : null;
      retestOnLowerVolume = reached && ratio !== null && ratio < 1;
      if (reached) retestWeekVolumeRatio = ratio;
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
          secondaryOnLowerVolume = !reached && heavyDecline && ratio !== null && ratio < 1;
        } else {
          // Rule 4: the first advance out of a bear market (the earlier low is
          // the lowest of the year before it, labelled), a higher secondary
          // low on less volume than that advance, then a heavier advance.
          // The year is the last `BEAR_LOW_SESSIONS` sessions read, so a year of
          // history and six give the same answer.
          const bearLow = bars.slice(Math.max(0, bars.length - BEAR_LOW_SESSIONS), previous.index).every((b) => b.l > previous.price);
          const advance = meanVolume(bars, previous.index + 1, mid);
          const reaction = meanVolume(bars, mid + 1, anchor.index);
          const after = meanVolume(bars, anchor.index + 1, bars.length - 1);
          secondaryOnLowerVolume = !reached && bearLow && reaction < advance && after > reaction;
          // A-VOLUME-06: a panic bottom on large volume, a rally, then a
          // secondary decline on much less volume, at or above the panic low.
          const prevRvol = relativeVolume(bars.slice(0, previous.index + 1), lookback);
          panicSecondary =
            prevRvol !== null && prevRvol > VOLUME_CLIMAX_THRESHOLD && anchor.price >= previous.price - tol && ratio !== null && ratio <= PANIC_SECONDARY_RATIO;
        }
      }
    }
    if (kind === "high") heavyAdvance = heaviestWeekBeforeTop(bars, anchor.index);
    const volumeExtremeLow = kind === "low" && smallestMonthInYears(opts.monthly, opts.asOf);
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
      confirms,
    });
  }
  return readings;
}
