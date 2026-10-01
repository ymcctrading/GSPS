/**
 * Setup cards — the one shape every "here is a setup" surface reads from.
 * -----------------------------------------------------------------------------
 * Project owner direction, 2026-09-30: the Trade Reviews card (Portfolio) — what
 * lined up, what didn't, one score — is the model for how Novice and Pro read a
 * setup, "all the information from the chart in one simple place". This module
 * turns a setup, from wherever it came (the daily market scan, a symbol scanned
 * on its own, the intraday scanner), into that card: a headline, a one-or-two
 * sentence synopsis, the four levels, and a plain list of what lined up.
 *
 * It is a pure presentation model. It scores nothing, gates nothing and reads
 * nothing the scan hadn't already published: the daily rows carry the same
 * pillar rollup `lib/scoring/public-summary.ts` already lets across the API
 * boundary (met / total per pillar — never which named condition decided it),
 * and the intraday alert's confidence factors were already on screen.
 *
 * Three-question basis (AGENTS.md):
 * 1. Gann: no new technique. The four levels are the scan's own trade plan
 *    (entry, stop, first target, master take profit); this only lays them out.
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic: Polarity, as in the Trade Reviews card it follows — the novice
 *    pole (one sentence, one score) and the expert pole (every pillar, every
 *    level) are one card at two depths, not a cut-down copy of the other. And
 *    Correspondence: the same card on the daily list, the tracked list and the
 *    intraday panel, so a setup reads the same wherever it turns up.
 *
 * "MTP" is the master take profit — the level the platform's chart, portfolio
 * and order rows already call MTP. It was "MP" on the chart and "Master" here;
 * one name everywhere (2026-09-30).
 */

import { SCORE_PILLAR_LABELS } from "@/lib/scoring/public-summary";
import type { PublicScoreSummary, ScorePillar, StratPattern } from "@/lib/types";
import type { PublicSignalSummary } from "@/lib/signals/publicSummary";
import { PATTERN_GLOSSARY_TERM } from "@/lib/education/patterns";
import { SCANNER_STATE_META } from "@/lib/signals/types";
import { formatUsd } from "@/lib/utils";
import { tickerHref } from "@/lib/routes";

export type SetupSide = "buy" | "sell";

export interface SetupLevels {
  entry: number | null;
  /** The exit if the setup fails — the stop-loss. */
  stop: number | null;
  tp1: number | null;
  /** Master take profit. */
  mtp: number | null;
}

/** One line of "what lined up": a pillar of the scorecard, or an intraday confidence factor. */
export interface SetupCheck {
  label: string;
  state: "met" | "partial" | "missed";
  /** "3 of 4", or the factor's own one-line detail. */
  detail: string | null;
}

export interface SetupCardModel {
  symbol: string;
  side: SetupSide;
  /** Live or scan-time price; null when neither is known. */
  price: number | null;
  levels: SetupLevels;
  /** "Execute" | "Watch" | "Reject" — or the intraday signal's own label. */
  verdict: string;
  checks: SetupCheck[];
  /** Why the state sits below what the score alone implies, when the scan said so. */
  stateNote: string | null;
  /** The Signal Engine's 0–100 Rules Alignment, when the scan carried one. */
  alignmentScore: number | null;
  /** The Signal Engine's own read — a separate read from the score, never merged into it. */
  signal: { tierLabel: string; stateLabel: string; tradeable: boolean } | null;
  /** "Monthly rising, weekly rising, daily falling", or null. */
  higherTimeframes: string | null;
  /** The approved plain-English name of the reversal pattern, or null. */
  patternLabel: string | null;
  /** True for a momentum continuation: it trades with the trend the rest of the list fades. */
  continuation: boolean;
  synopsis: string;
  tickerHref: string;
}

// ---------------------------------------------------------------------------
// Pillars -> checks
// ---------------------------------------------------------------------------

export function checksFromSummary(summary: PublicScoreSummary | null | undefined): SetupCheck[] {
  if (!summary) return [];
  return summary.pillars.map((p) => ({
    label: SCORE_PILLAR_LABELS[p.pillar as ScorePillar] ?? p.pillar,
    state: p.met >= p.total ? "met" : p.met <= 0 ? "missed" : "partial",
    detail: `${p.met} of ${p.total}`,
  }));
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/**
 * How far a target sits from the entry, as a multiple of the risk (entry to
 * stop). Null when any of the three prices is missing or the risk is zero.
 */
export function rewardToRisk(levels: SetupLevels, target: number | null): number | null {
  const { entry, stop } = levels;
  if (entry == null || stop == null || target == null) return null;
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  return Math.abs(target - entry) / risk;
}

export function hasPlan(levels: SetupLevels): boolean {
  return levels.entry != null && levels.stop != null && levels.tp1 != null;
}

// ---------------------------------------------------------------------------
// Synopsis
// ---------------------------------------------------------------------------

const VERDICT_STATUS: Record<string, string> = {
  Execute: "ready to act on",
  Watch: "worth watching",
};

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * One or two sentences, in this order: how strong it is and where it is weak,
 * then the plan. Never longer — the full card carries the rest.
 *
 * `scoreText` is the score as the viewer's tier displays it (half-point
 * rounding for Novice and Pro; `lib/scoring/display.ts`), so the sentence can
 * never disagree with the badge beside it.
 */
export function buildSetupSynopsis(args: {
  side: SetupSide;
  verdict: string;
  /** Null when the setup carries no score (a setup saved without one). */
  scoreText: string | null;
  scoreMax: number;
  checks: SetupCheck[];
  levels: SetupLevels;
}): string {
  const { side, verdict, scoreText, scoreMax, checks, levels } = args;
  const status = VERDICT_STATUS[verdict] ?? "not yet strong enough to act on";
  const noun = side === "buy" ? "buy" : "sell";

  const strong = checks.filter((c) => c.state === "met").map((c) => c.label.toLowerCase());
  const missing = checks.filter((c) => c.state === "missed").map((c) => c.label.toLowerCase());

  let first: string;
  if (scoreText == null) {
    first = `A ${noun} setup.`;
  } else {
    first = `A ${noun} setup ${status}: ${scoreText} of ${scoreMax} checks line up`;
    if (strong.length > 0) first += `, strongest on ${joinNames(strong.slice(0, 2))}`;
    if (missing.length > 0) first += `, still missing ${joinNames(missing.slice(0, 2))}`;
    first += ".";
  }

  if (!hasPlan(levels)) {
    return `${first} No trade plan has armed yet, so there are no levels to act on.`;
  }

  const r1 = rewardToRisk(levels, levels.tp1);
  const second =
    `Enter near ${formatUsd(levels.entry!)}, exit at ${formatUsd(levels.stop!)} if it fails, ` +
    `first target ${formatUsd(levels.tp1!)}` +
    (r1 != null ? ` (${r1.toFixed(1)}× the risk)` : "") +
    ".";
  return `${first} ${second}`;
}

// ---------------------------------------------------------------------------
// Higher timeframes
// ---------------------------------------------------------------------------

const TIMEFRAME_WORD: Record<string, string> = {
  "1Year": "Yearly",
  "1Month": "Monthly",
  "1Week": "Weekly",
  "1Day": "Daily",
  "4Hour": "4-hour",
  "2Hour": "2-hour",
  "1Hour": "Hourly",
};

export function describeTrends(trends: { timeframe: string; direction: string }[] | null | undefined): string | null {
  if (!trends || trends.length === 0) return null;
  const named = trends
    .filter((t) => t.timeframe in TIMEFRAME_WORD && t.timeframe !== "1Hour")
    .map(
      (t) =>
        `${TIMEFRAME_WORD[t.timeframe]} ${t.direction === "sideways" ? "flat" : t.direction === "bullish" ? "rising" : "falling"}`,
    );
  return named.length > 0 ? named.join(", ") : null;
}

// ---------------------------------------------------------------------------
// Daily scan rows
// ---------------------------------------------------------------------------

const TIER_LABEL: Record<PublicSignalSummary["tier"], string> = {
  watchlistOnly: "Watchlist",
  qualified: "Qualified",
  aTier: "A-tier",
  aPlusTier: "A+",
};

/** The fields of a scan row the card reads — structural, so `ScanRow` satisfies it without this module importing a component. */
export interface DailySetupInput {
  symbol: string;
  score: number;
  outputState: string;
  direction: string;
  entry: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  masterProfit: number | null;
  patternName?: string | null;
  setupKind?: "reversion" | "continuation";
  currentPrice?: number | null;
  signal?: PublicSignalSummary | null;
  scoreSummary?: PublicScoreSummary | null;
  trends?: { timeframe: string; direction: string }[] | null;
}

export function buildDailyCardModel(
  row: DailySetupInput,
  opts: { scoreText: string | null; scoreMax: number; livePrice?: number | null },
): SetupCardModel {
  const side: SetupSide = row.direction === "bearish" ? "sell" : "buy";
  const levels: SetupLevels = {
    entry: row.entry,
    stop: row.stopLoss,
    tp1: row.takeProfit1,
    mtp: row.masterProfit,
  };
  const checks = checksFromSummary(row.scoreSummary);
  const price = opts.livePrice ?? (row.currentPrice != null && row.currentPrice > 0 ? row.currentPrice : null);
  const patternLabel =
    row.patternName && row.patternName in PATTERN_GLOSSARY_TERM
      ? PATTERN_GLOSSARY_TERM[row.patternName as StratPattern["name"]]
      : null;

  return {
    symbol: row.symbol,
    side,
    price,
    levels,
    verdict: row.outputState,
    checks,
    stateNote: row.scoreSummary?.stateNote ?? null,
    alignmentScore: row.signal?.alignmentScore ?? null,
    signal: row.signal
      ? {
          tierLabel: TIER_LABEL[row.signal.tier],
          stateLabel: SCANNER_STATE_META[row.signal.state].label,
          tradeable: row.signal.tradeable,
        }
      : null,
    higherTimeframes: describeTrends(row.trends),
    patternLabel,
    continuation: row.setupKind === "continuation",
    synopsis: buildSetupSynopsis({
      side,
      verdict: row.outputState,
      scoreText: opts.scoreText,
      scoreMax: opts.scoreMax,
      checks,
      levels,
    }),
    tickerHref: tickerHref(row.symbol),
  };
}
