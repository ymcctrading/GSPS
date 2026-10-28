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
  LegacyScorePillar,
  PublicScoreSummary,
  ScanDecision,
  ScanResult,
  ScorePillar,
  ScorePillarSummary,
} from "@/lib/types";
import { redactScanSignals } from "@/lib/signals/publicSummary";
import { CRITERION_KEYS, EXECUTE_SCORE_THRESHOLD, type CriterionKey } from "@/lib/scoring/weights";

/**
 * Display order: the nine points in the order they are scored
 * (`CRITERION_KEYS`), context first, then the trade itself. Each point is its
 * own row since 2026-10-22 (owner: the card's five groups were out of date with
 * what is actually scored). The named checks behind each point stay
 * server-side, as before.
 */
export const SCORE_PILLARS: ScorePillar[] = [...CRITERION_KEYS];

/** The old groups, after the nine, for a stored breakdown whose points carry no key. */
const LEGACY_SCORE_PILLARS: LegacyScorePillar[] = ["trend", "structure", "setup", "timing", "riskReward"];

function isCriterionKey(key: string | undefined): key is CriterionKey {
  return key !== undefined && (CRITERION_KEYS as readonly string[]).includes(key);
}

export const SCORE_PILLAR_LABELS: Record<ScorePillar, string> = {
  marketCycle: "Market and cycle",
  trendAllTimeframes: "Trend",
  relativeStrength: "Relative strength",
  activity: "Activity",
  priceLevels: "Price levels",
  geometricAngles: "Angles",
  timeFactors: "Time",
  volumeAccumulation: "Volume",
  definiteIndication: "Entry and stop",
  // Summaries stored before 2026-10-22 carry the old groups.
  trend: "Trend",
  structure: "Structure",
  setup: "Setup",
  timing: "Timing",
  riskReward: "Risk/reward",
};

/**
 * What each point means to a reader. Describes the *question* the point asks,
 * never the conditions that answer it (`lib/scoring/pillars.ts` holds those).
 */
export const SCORE_PILLAR_DESCRIPTIONS: Record<ScorePillar, string> = {
  marketCycle: "Whether the broad market and the stock's place in its cycles favour a move this way.",
  trendAllTimeframes: "Whether the trend runs this way on the weekly and daily charts.",
  relativeStrength: "Whether this stock is stronger than its group or the market (weaker, for a short).",
  activity: "Whether the stock is active and trades normally enough to act on.",
  priceLevels: "Whether price is holding at a level that has mattered before.",
  geometricAngles: "Whether the stock's trend angle is still holding.",
  timeFactors: "Whether time since the last turn favours a move here.",
  volumeAccumulation: "Whether volume, or a long base, stands behind the move.",
  definiteIndication: "Whether the market has given a definite signal to enter, with the stop placed behind an old level.",
  trend: "Whether the trend runs this way on every timeframe, and whether this stock is leading the market or lagging it.",
  structure: "Whether price is at levels that have mattered before, with its trend angle holding and room to move.",
  setup: "Whether the stock is active and trades normally, and volume or a long base stands behind the move.",
  timing: "Whether the market, the stock's cycles and the time since its last turn favour a move here.",
  riskReward: "Whether the trigger is armed, the stop sits behind an old level, and the pullback has not outgrown the trend's largest so far.",
};

/**
 * Held back when the state is lower than the score alone implies, for a
 * Reject. A held Watch names what it waits for instead (`heldNote`, owner
 * 2026-10-27: the card says what a high-scoring Watch is missing), in plain
 * words about the chart, never a criterion, threshold or point.
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

/**
 * What a held setup is waiting for, in plain words (owner, 2026-10-27: a 9/9
 * on Watch names what it lacks). Each phrase says where the setup stands
 * against something the reader can see or check on the chart, not which
 * named checks the score is built from.
 */
const HOLD_PHRASES: Partial<Record<string, string>> = {
  tradePlanPriced: "the trade plan is not complete (nothing armed to enter, or a first target that pays no more than the risk)",
  reversionConfirmation: "the turn against the trend is not confirmed yet",
  breakaway: "the market is moving sideways and the entry stays inside its range",
  monthlyBreak: "this month has broken last month's extreme against the trade",
  distributionBreakdown: "the stock has broken down after a lower top",
  failedTop: "a failed top or bottom sits between the entry and the first target",
  timeWindowTurn: "the turn against the trend is not due yet",
  queerActing: "the stock is not acting the way it normally does",
  weakStock: "the stock is in a weak position for a buy",
  figureCrossing: "price is at a round number it has not cleared yet",
  dataLag: "the price data is a bar or more behind the market",
};

/** The held state's note: the ready-now reason in full, then the rest named. */
function heldNote(holds: ScanDecision["breakdown"], score: number): string {
  const ready = holds.find((h) => h.key === "readyNow");
  const others = [...new Set(
    holds.filter((h) => h.key !== "readyNow").map((h) => (h.key && HOLD_PHRASES[h.key]) || "another condition for a live signal is not met"),
  )];
  const readyText = ready ? ready.note.replace(/ Held from Execute to Watch\.$/, "") : null;
  if (readyText && others.length === 0) return `Held at Watch: ${readyText}`;
  if (readyText) return `Held at Watch: ${readyText} It is also waiting because ${others.join("; ")}.`;
  // Below the cutoff the score alone keeps it at Watch; the holds are extra.
  return score >= EXECUTE_SCORE_THRESHOLD ? `Held at Watch because ${others.join("; ")}.` : `Also waiting because ${others.join("; ")}.`;
}

export function toPublicScoreSummary(decision: ScanDecision): PublicScoreSummary {
  const counts = new Map<ScorePillar, ScorePillarSummary>();

  for (const item of decision.breakdown) {
    // Items appended after scoring carry no pillar and no point. They explain a
    // capped state, which the note covers, so they must not inflate a total.
    if (!item.pillar) continue;
    // A check feeds a point; only the point counts. A breakdown stored before
    // 2026-10-22 names the old group as its pillar: a point is counted under
    // its own key whenever it has one, so those rows show the nine rows too.
    const pillar: ScorePillar = isCriterionKey(item.key) ? item.key : item.pillar;
    const entry = counts.get(pillar) ?? { pillar, met: 0, total: 0 };
    entry.total += 1;
    if (item.passed) entry.met += 1;
    counts.set(pillar, entry);
  }

  const pillars = [...SCORE_PILLARS, ...LEGACY_SCORE_PILLARS].map((p) => counts.get(p)).filter(
    (p): p is ScorePillarSummary => p !== undefined,
  );

  const holds = decision.breakdown.filter((item) => !item.pillar && !item.checkOf && !item.passed);
  const laggedOnly = holds.length > 0 && holds.every((item) => item.key === "dataLag");
  const retired = holds.some((item) => item.key === "stopBreach");
  // An expired plan (lib/gann/planExpiry.ts): its note names only prices the
  // reader can see and what the stock is waiting for, so it crosses as is.
  const expired = holds.find((item) => item.key === "planExpired");

  return {
    score: decision.score,
    max: pillars.reduce((sum, p) => sum + p.total, 0),
    pillars,
    stateNote:
      holds.length === 0
        ? null
        : retired
          ? STOP_BREACH_STATE_NOTE
          : expired
            ? expired.note
            : laggedOnly
              ? DATA_LAG_STATE_NOTE
              : decision.outputState === "Reject"
                ? CAPPED_STATE_NOTE
                : heldNote(holds, decision.score),
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
    // The state is derived from the verdict and direction and names no
    // condition, so it crosses the boundary (D-06).
    ...(decision.decisionState ? { decisionState: decision.decisionState } : {}),
    // A tier read from the verdict and the entry's distance, naming no condition.
    ...(decision.resting ? { resting: true } : {}),
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
    gann: redactGannLevels(result.gann),
    decision: redactDecision(result.decision),
    signals: redactScanSignals(result.signals),
    dailyBars: undefined,
    // The plan and its note only, never the reason key or the figures behind
    // it, whatever built the result (owner's disclosure rule, 2026-10-28).
    planExpired: result.planExpired
      ? { entry: result.planExpired.entry, takeProfit1: result.planExpired.takeProfit1, note: result.planExpired.note }
      : undefined,
  };
}

/**
 * The Gann readings no screen draws are the method's working, not its
 * output: the digital-root pairs (price and time roots), each angle's slope
 * and anchor, the retracement fractions and the projected cycle dates. They
 * stay on the server (review finding S-02, 2026-10-21). The levels a chart
 * draws (fan lines, Square of Nine prices) and the time flags it shows pass.
 * Emptied rather than deleted so the shape stays a `GannLevels`.
 */
export function redactGannLevels(gann: ScanResult["gann"]): ScanResult["gann"] {
  return {
    ...gann,
    angleSlopes: [],
    retracementLevels: [],
    digitalRootConfluences: [],
    timeCycleDates: [],
    timeCycleFixedCalendarDates: gann.timeCycleFixedCalendarDates ? [] : undefined,
  };
}

/**
 * What a visitor with no session gets from `/api/scan`, which serves the
 * public shareable chart (`components/chart/public-chart.tsx`): the plan's
 * levels, the price levels the chart draws, the verdict's rollup and the
 * trend reads, and nothing else. The Signal & Regime Engine's verdicts and
 * the confluence readings are for signed-in members only.
 */
export function toAnonymousScanResult(result: ScanResult): ScanResult {
  const redacted = redactScanResult(result);
  return {
    ...redacted,
    pattern: null,
    armedPatterns: [],
    signals: undefined,
    executionBar: undefined,
    liquidity: undefined,
    volatilityRead: undefined,
    volumeRead: undefined,
    noviceUniverse: undefined,
  };
}
