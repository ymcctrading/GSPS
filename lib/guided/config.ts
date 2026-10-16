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
 * Guided Mode's trade-count, deployed-percent and per-trade budget caps were
 * retired on 2026-10-16 (owner, "Switch all nine", Q12) for Gann's own capital
 * rules, the same ones every order path checks (`lib/risk/gannCapital.ts`):
 * 30 points of capital behind every share held (A-RISK-01), at most three
 * markets open at once (A-RISK-08), and the three-loss pause
 * (`lib/risk/lossSeries.ts`). Gann sets no daily trade count (Q8: his capital
 * ceilings plus the loss pause, no daily cap).
 */

/**
 * Minimum shares a guided order may be placed for.
 *
 * Was 2 while the protocol sold 60% at TP1, because one share cannot be split.
 * Since 2026-10-16 (owner, Q14) nothing leaves at a fixed target: the whole
 * position runs on Gann's stop and exit signals, so one share follows the
 * plan as well as a hundred.
 */
export const MIN_GUIDED_QTY = 1;

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
 * 16 is a *ceiling*, not a target. Scanning stops the moment enough
 * recommendations exist (see `GUIDED_SCAN_BATCH`), so the common case still
 * costs the same handful of scans it always did and the wider reach is only
 * paid for on the days it is needed.
 *
 * The number is set by arithmetic rather than taste. `scanTicker` costs roughly
 * six provider requests per symbol (one per timeframe, distinct URLs, so the
 * cache does not help), and Alpaca's data API allows about 200 a minute — see
 * docs/THIRD_PARTY_LIMITS.md. 16 symbols is ~96 requests, which leaves room for
 * the rest of the app inside the same minute. An earlier draft of this used 40,
 * or ~240 requests, which is over the whole per-minute budget for one page load
 * by a single user.
 */
export const MAX_CANDIDATES_SCANNED = 16;

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
}

export const DEFAULT_GUIDED_CAPS: GuidedCaps = {
  riskPct: DEFAULT_RISK_PCT,
};

/**
 * Every `policy_values`-overridable Guided Mode platform threshold, bundled
 * so a caller can pass one `getGuidedPolicy()` result through instead of a
 * dozen separate parameters — see lib/guided/policy.ts. Distinct from
 * `GuidedCaps`: these are the *platform* ceilings/defaults an operator tunes,
 * not a user's own per-account risk preference (which still
 * live in `settings.prefs.guided`, clamped against these bounds).
 */
export interface GuidedPolicy {
  defaultRiskPct: number;
  minRiskPct: number;
  maxRiskPct: number;
  minGuidedQty: number;
  recommendationTtlMinutes: number;
  maxCandidatesScanned: number;
  guidedScanBatch: number;
  maxRecommendations: number;
}

export const DEFAULT_GUIDED_POLICY: GuidedPolicy = {
  defaultRiskPct: DEFAULT_RISK_PCT,
  minRiskPct: MIN_RISK_PCT,
  maxRiskPct: MAX_RISK_PCT,
  minGuidedQty: MIN_GUIDED_QTY,
  recommendationTtlMinutes: RECOMMENDATION_TTL_MINUTES,
  maxCandidatesScanned: MAX_CANDIDATES_SCANNED,
  guidedScanBatch: GUIDED_SCAN_BATCH,
  maxRecommendations: MAX_RECOMMENDATIONS,
};

/**
 * Read caps from a user's stored preferences, falling back to the policy's
 * defaults for anything unset or out of bounds. A stored value that is not a
 * number, or that sits outside the permitted range, is not a reason to fail
 * the request — it is a reason to use the conservative default. `policy`
 * defaults to the code constants, so every existing caller is unaffected.
 */
export function resolveGuidedCaps(prefs: unknown, policy: GuidedPolicy = DEFAULT_GUIDED_POLICY): GuidedCaps {
  const stored = (prefs as { guided?: Record<string, unknown> } | null)?.guided ?? {};
  const num = (key: string, fallback: number, min: number, max: number): number => {
    const v = Number(stored[key]);
    return Number.isFinite(v) && v >= min && v <= max ? v : fallback;
  };
  return {
    riskPct: num("riskPct", policy.defaultRiskPct, policy.minRiskPct, policy.maxRiskPct),
  };
}
