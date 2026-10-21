/**
 * GSPS — the backtest's attribution scope constant, on its own so a client
 * page can read it without bundling the replay. `app/(app)/learning/page.tsx`
 * imported it from `run.ts`, which shipped the whole Gann engine, the
 * planetary ephemeris and Jensen's dated windows to the browser (review
 * finding R-033, 2026-10-21).
 */

/**
 * Attribute over every trade instead of one verdict bucket.
 *
 * Every `Bucket` is a slice the score itself selected, which makes all four
 * useless for one specific question: whether a criterion is *saturated* — true
 * for so many setups that it carries no information while still contributing
 * its weight. Inside a bucket defined by those criteria passing, saturation is
 * the bucket's definition rather than a defect, so measuring it there would
 * flag correct criteria and, worse, launder real saturation as expected
 * selection. Only an unconditioned population can answer it, and until this
 * existed the API could not produce one — see `lib/validation/health.ts`.
 */
export const UNCONDITIONED_ATTRIBUTION = "all";
