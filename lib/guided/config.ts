/**
 * Guided Decision Mode — the caps, and why each one exists.
 *
 * Guided Mode shows one recommended action per symbol, sized for the user, and
 * asks them to confirm it. That is a different product from the rest of GSPS: the
 * normal ticker page shows its work and lets the user decide, so a user who
 * over-trades there did it with the numbers in front of them. Here the numbers
 * are deliberately out of the way, which means every limit that would otherwise
 * be the user's judgement has to be a number in this file.
 *
 * The defaults are conservative on purpose. They are the shipped values, not the
 * maximums a user may set: a permissive default is a decision made on the user's
 * behalf in the direction that costs them money.
 */

/**
 * Share of paper equity risked on one guided trade — the distance from entry to
 * stop, not the position's notional. 1% is the conventional floor of the
 * "risk per trade" range, and it is what sizes the share count: the user's tap
 * never sets the quantity.
 */
export const DEFAULT_RISK_PCT = 1;

/** Bounds a user may move the per-trade risk cap between, once Settings exposes it. */
export const MIN_RISK_PCT = 0.25;
export const MAX_RISK_PCT = 2;

/**
 * New guided positions per day and per rolling week. The failure mode Guided
 * Mode invites is a novice tapping through a whole watchlist in one sitting;
 * three a day is enough for the setups that actually clear the Execute bar and
 * few enough that the fourth requires a deliberate decision made elsewhere.
 */
export const DEFAULT_MAX_TRADES_PER_DAY = 3;
export const DEFAULT_MAX_TRADES_PER_WEEK = 10;

/**
 * Ceiling on capital deployed through Guided Mode at once, as a share of paper
 * equity. Position sizing caps what any single trade can lose; this caps what
 * the whole mode can tie up, which the per-trade cap alone does not — ten
 * correctly-sized trades in correlated names are one bet, not ten.
 */
export const DEFAULT_MAX_DEPLOYED_PCT = 25;

/**
 * Minimum shares a guided order may be placed for.
 *
 * The protocol exits in tranches — 60% at TP1, half of the rest at the master
 * target, the remainder running behind a trailing stop. A single share cannot be
 * split, so `planProtocolExit` degrades it to "exits whole at TP1", which
 * silently converts the trade's reward from the staged plan the card described
 * into a flat 1.5R. Guided Mode states a dollar reward computed from the staged
 * plan, so it must not place an order that cannot follow it.
 */
export const MIN_GUIDED_QTY = 2;

/**
 * How long a recommendation stays tappable.
 *
 * Nothing here is a standing authorization: a recommendation is single-use and
 * short-lived, so a user who walks away comes back to a fresh scan rather than
 * to a stale one-tap Buy button for a setup that de-armed an hour ago. The
 * plan is re-verified against a live scan at submission regardless — this
 * window is what stops the card from *looking* live in the meantime.
 */
export const RECOMMENDATION_TTL_MINUTES = 15;

/**
 * How many candidates a single request will re-scan live. Each one is a full
 * multi-timeframe scan; the cap is what keeps the request inside a serverless
 * function's budget, and a guided list longer than this is not a shortlist.
 */
/**
 * Symbols Guided may scan in one request.
 *
 * Was 8, drawn only from the published daily list. That budget assumed the list
 * always exists and is always fresh; when it is neither — a deployment whose
 * first cron has not run, a weekend, a provider outage during the scan — Guided
 * had nothing to look at and reported "nothing worth trading right now", which
 * is a sentence about the market that was actually a sentence about our own
 * pipeline. A novice cannot tell those apart.
 *
 * 40 is a *ceiling*, not a target. Scanning stops the moment enough
 * recommendations exist (see `GUIDED_SCAN_BATCH`), so the common case still
 * costs the same handful of scans it always did and the wider reach is only
 * paid for on the days it is needed. The ceiling exists because `scanTicker`
 * costs several provider requests per symbol and Alpaca's data API allows
 * roughly 200 a minute — see docs/THIRD_PARTY_LIMITS.md.
 */
export const MAX_CANDIDATES_SCANNED = 40;

/**
 * Symbols scanned per round before checking whether we can stop.
 *
 * Batched rather than all-at-once so a day with an obvious setup at the top of
 * the list costs one round trip's worth of scanning, and rather than
 * one-at-a-time so a day without one does not serialise forty sequential
 * network calls into the user's page load.
 */
export const GUIDED_SCAN_BATCH = 8;

/** Most cards rendered at once, after eligibility. */
export const MAX_RECOMMENDATIONS = 3;

/**
 * The disclosure. Shown on the card and again on the confirmation dialog,
 * directly above the button that places the order — not linked, not collapsed,
 * not dismissable.
 */
export const GUIDED_DISCLOSURE =
  "This is an automated signal based on GSPS's scoring rules, not personalized financial advice. Past performance shown in Backtest does not guarantee future results.";

/** Why Guided Mode is paper-only, shown when a live brokerage is connected. */
export const LIVE_BROKERAGE_BLOCK =
  "Guided recommendations are paper-only. You have a live brokerage linked to this account, so Guided Mode is turned off — the rest of GSPS is unaffected.";

export interface GuidedCaps {
  riskPct: number;
  maxTradesPerDay: number;
  maxTradesPerWeek: number;
  maxDeployedPct: number;
}

export const DEFAULT_GUIDED_CAPS: GuidedCaps = {
  riskPct: DEFAULT_RISK_PCT,
  maxTradesPerDay: DEFAULT_MAX_TRADES_PER_DAY,
  maxTradesPerWeek: DEFAULT_MAX_TRADES_PER_WEEK,
  maxDeployedPct: DEFAULT_MAX_DEPLOYED_PCT,
};

/**
 * Read caps from a user's stored preferences, falling back to the defaults for
 * anything unset or out of bounds. A stored value that is not a number, or that
 * sits outside the permitted range, is not a reason to fail the request — it is
 * a reason to use the conservative default.
 */
export function resolveGuidedCaps(prefs: unknown): GuidedCaps {
  const stored = (prefs as { guided?: Record<string, unknown> } | null)?.guided ?? {};
  const num = (key: string, fallback: number, min: number, max: number): number => {
    const v = Number(stored[key]);
    return Number.isFinite(v) && v >= min && v <= max ? v : fallback;
  };
  return {
    riskPct: num("riskPct", DEFAULT_RISK_PCT, MIN_RISK_PCT, MAX_RISK_PCT),
    maxTradesPerDay: num("maxTradesPerDay", DEFAULT_MAX_TRADES_PER_DAY, 1, 20),
    maxTradesPerWeek: num("maxTradesPerWeek", DEFAULT_MAX_TRADES_PER_WEEK, 1, 50),
    maxDeployedPct: num("maxDeployedPct", DEFAULT_MAX_DEPLOYED_PCT, 5, 100),
  };
}
