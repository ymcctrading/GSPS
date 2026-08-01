/**
 * Single source of truth for platform-wide config values that would
 * otherwise get hardcoded in multiple places (UI copy, schema comments,
 * docs). Change the value here once instead of chasing it across the repo.
 */

/** How long historical scan/chat data is retained, in years. */
export const DATA_RETENTION_WINDOW_YEARS = 6;

/** Human-readable label derived from the constant above — use this in copy. */
export const DATA_RETENTION_WINDOW_LABEL = `${DATA_RETENTION_WINDOW_YEARS} years`;
