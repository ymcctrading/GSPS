/**
 * Gann's fixed annual calendar cycle: a small set of calendar-date windows
 * that repeat every year regardless of the instrument or its own price
 * history — "a permanent cycle which does not change," per *Wall Street
 * Stock Selector* (1930). Distinct from `lib/gann/timeCycles.ts`'s
 * anniversary-of-a-pivot projections, which are per-symbol and anchored to
 * that symbol's own swing highs/lows: this cycle is the same eight windows
 * for every instrument, every year, with no anchor at all. See
 * `docs/GANN_METHODOLOGY_FULL_REPORT.md` §4.1 and §18.2 (Layer 2, item 5).
 *
 * Gann names the months (early February/March/May/June/August/September/
 * November/December) but the recovered source text does not give exact
 * day-of-month boundaries for "early." `EARLY_MONTH_DAY` below is this
 * codebase's own documented interpretation (the first ten calendar days of
 * the named month), not a literal reading — flagged the same way
 * `coordinateLedger.ts`'s trailing-session windows and `timeCycles.ts`'s
 * wheel counts are.
 *
 * Unmeasured, diagnostic-only candidate (see
 * `docs/PROPOSAL_NEW_GANN_CRITERIA.md`'s validation discipline and
 * `lib/validation/criteria-registry.ts`'s `annualCycleActive` entry) — not
 * one of the nine scored criteria, and not directional: Gann's own
 * description ties this to "watching for a trend change," not to which way
 * the change runs, so this reads identically for a bullish and a bearish
 * setup. `lib/scoring/score.ts` appends it to every decision's breakdown
 * with no `pillar`, which keeps it out of the score while still recording
 * it for `lib/backtest/attribution.ts` to measure.
 */

/** The eight calendar months A4 names, 1-indexed. */
const CYCLE_MONTHS = [2, 3, 5, 6, 8, 9, 11, 12] as const;

/** This codebase's documented reading of "early" — see the module header. */
export const EARLY_MONTH_DAY = 10;

export interface AnnualCycleReading {
  /** Today falls inside (or within `windowDays` of) one of the eight windows. */
  active: boolean;
  /** The calendar window matched, as "YYYY-MM" — null when not active. */
  window: string | null;
  /** The nearest window's start date, for display — always populated. */
  nearestWindowStart: string;
}

/**
 * `windowDays` extends each window's first `EARLY_MONTH_DAY` days by this
 * many days on either side, the same tolerance shape `timeCycles.ts` uses
 * for its own wheel-count/anniversary dates, rather than requiring an exact
 * calendar-day hit.
 */
export function computeAnnualCycle(asOf: Date = new Date(), windowDays = 3): AnnualCycleReading {
  const dayMs = 24 * 3600 * 1000;
  const year = asOf.getUTCFullYear();

  // Every window's start/end across the year straddling `asOf` (the previous,
  // current, and next calendar year) so a window near a year boundary — or the
  // nearest upcoming one when none is active — is never missed.
  const windows = [year - 1, year, year + 1].flatMap((y) =>
    CYCLE_MONTHS.map((month) => {
      const start = new Date(Date.UTC(y, month - 1, 1));
      const end = new Date(Date.UTC(y, month - 1, EARLY_MONTH_DAY));
      return { start, end, label: `${y}-${String(month).padStart(2, "0")}` };
    }),
  );

  let active: (typeof windows)[number] | null = null;
  let nearest = windows[0];
  let nearestDistance = Infinity;

  for (const w of windows) {
    const loBound = w.start.getTime() - windowDays * dayMs;
    const hiBound = w.end.getTime() + windowDays * dayMs;
    if (asOf.getTime() >= loBound && asOf.getTime() <= hiBound) {
      active = w;
    }
    const distance =
      asOf.getTime() < w.start.getTime()
        ? w.start.getTime() - asOf.getTime()
        : asOf.getTime() > w.end.getTime()
          ? asOf.getTime() - w.end.getTime()
          : 0;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = w;
    }
  }

  return {
    active: active !== null,
    window: active?.label ?? null,
    nearestWindowStart: nearest.start.toISOString().slice(0, 10),
  };
}
