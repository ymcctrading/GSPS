/**
 * The publishable half of a score.
 *
 * `ScanDecision.breakdown` is the scoring model written out longhand: every
 * criterion, the threshold it tested, and the value that passed or failed it.
 * That is the product, and it used to be serialised straight into `/api/scan`,
 * where anyone could read the whole model out of a network response — the UI
 * rendering it was only the visible half of the leak.
 *
 * So the breakdown stops at the API boundary. What crosses it is this rollup:
 * how many points each broad pillar of the analysis earned, out of how many it
 * could have. A reader learns that a setup is strong on trend and empty on
 * timing — which is what the number is for — and learns nothing about which
 * conditions decide either.
 */

import type {
  PublicScoreSummary,
  ScanDecision,
  ScanResult,
  ScorePillar,
  ScorePillarSummary,
} from "@/lib/types";
import { redactScanSignals } from "@/lib/signals/publicSummary";

/** Display order. Broad to specific: context first, then the trade itself. */
export const SCORE_PILLARS: ScorePillar[] = [
  "trend",
  "structure",
  "setup",
  "timing",
  "riskReward",
];

export const SCORE_PILLAR_LABELS: Record<ScorePillar, string> = {
  trend: "Trend",
  structure: "Structure",
  setup: "Setup",
  timing: "Timing",
  riskReward: "Risk/reward",
};

/**
 * What each pillar means to a reader, in the vocabulary the glossary already
 * uses. Deliberately describes the *question* the pillar asks, never the
 * conditions that answer it. Each covers every point its group holds
 * (`lib/scoring/score.ts`, re-worded 2026-10-20 for the nine pillars):
 * trend holds the trend on every timeframe and relative strength; structure
 * the price levels and the angles; setup activity and volume; timing the
 * market and cycle position and time; risk/reward the definite indication
 * with the stop placed.
 */
export const SCORE_PILLAR_DESCRIPTIONS: Record<ScorePillar, string> = {
  trend: "Whether the trend runs this way on every timeframe, and whether this stock is leading the market or lagging it.",
  structure: "Whether price is at levels that have mattered before, with its trend angle holding and room to move.",
  setup: "Whether the stock is active and trades normally, and volume or a long base stands behind the move.",
  timing: "Whether the market, the stock's cycles and the time since its last turn favour a move here.",
  riskReward: "Whether the trigger is armed, the stop sits behind an old level, and the pullback has not outgrown the trend's largest so far.",
};

/**
 * Held back when the state is lower than the score alone implies. States the
 * consequence, not the rule — the rules are the model.
 */
const CAPPED_STATE_NOTE =
  "This setup scores well on context, but the state is held lower because the trade plan has not met every condition for a live signal.";

/**
 * The one hold that is safe to name precisely. The others describe conditions
 * inside the model; this one describes the data feed, which the reader is
 * already told about elsewhere and — more to the point — can act on. Being coy
 * about it would leave a held state looking arbitrary when the cause is simply
 * that the bars are late.
 */
const DATA_LAG_STATE_NOTE =
  "The state is held lower because the price data behind it is a full execution bar or more behind the market. Confirm the trigger against a live quote before acting.";

/**
 * Also safe to name: it describes where price is against a stop the reader can
 * already see on the setup, not anything inside the model.
 */
const STOP_BREACH_STATE_NOTE =
  "This plan is retired: its stop has broken. It stands again only if a bar closes back through the broken level by the usual allowance (a false break), or a new plan from the new structure replaces it.";

export function toPublicScoreSummary(decision: ScanDecision): PublicScoreSummary {
  const counts = new Map<ScorePillar, ScorePillarSummary>();

  for (const item of decision.breakdown) {
    // Items appended after scoring carry no pillar and no point. They explain a
    // capped state, which the note covers, so they must not inflate a total.
    if (!item.pillar) continue;
    // A check feeds a point; only the point counts.
    const entry = counts.get(item.pillar) ?? { pillar: item.pillar, met: 0, total: 0 };
    entry.total += 1;
    if (item.passed) entry.met += 1;
    counts.set(item.pillar, entry);
  }

  const pillars = SCORE_PILLARS.map((p) => counts.get(p)).filter(
    (p): p is ScorePillarSummary => p !== undefined,
  );

  const holds = decision.breakdown.filter((item) => !item.pillar && !item.checkOf && !item.passed);
  const laggedOnly = holds.length > 0 && holds.every((item) => item.key === "dataLag");
  const retired = holds.some((item) => item.key === "stopBreach");

  return {
    score: decision.score,
    max: pillars.reduce((sum, p) => sum + p.total, 0),
    pillars,
    stateNote:
      holds.length === 0
        ? null
        : retired
          ? STOP_BREACH_STATE_NOTE
          : laggedOnly
            ? DATA_LAG_STATE_NOTE
            : CAPPED_STATE_NOTE,
  };
}

/**
 * Swap a decision's breakdown for its summary. The breakdown is emptied rather
 * than deleted so the shape stays a `ScanDecision` for every existing consumer.
 */
export function redactDecision(decision: ScanDecision): ScanDecision {
  return {
    score: decision.score,
    outputState: decision.outputState,
    breakdown: [],
    summary: toPublicScoreSummary(decision),
  };
}

/**
 * The same, for a whole scan result on its way out of an API route. Also
 * redacts `signals` — the Signal and Regime Engine's own verdicts carry the
 * same kind of per-criterion breakdown `decision` does, and are just as
 * subject to this file's rule; see `lib/signals/publicSummary.ts`. Also
 * drops `dailyBars` — full OHLCV history is bulk internal data carried only
 * so `lib/learning/record.ts` can persist it without a second fetch, not a
 * public response field.
 */
export function redactScanResult(result: ScanResult): ScanResult {
  return {
    ...result,
    decision: redactDecision(result.decision),
    signals: redactScanSignals(result.signals),
    dailyBars: undefined,
  };
}
