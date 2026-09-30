/**
 * The intraday alert, as a setup card.
 * -----------------------------------------------------------------------------
 * The same card the daily lists use (`lib/setups/card.ts`), fed from the
 * intraday scanner's `Alert` — project owner direction, 2026-09-30: "the
 * intraday scan should also contain the same cards".
 *
 * How an alert maps onto the four levels, stated so the card never claims more
 * than the scanner computed:
 *
 *  - **Entry** is the level the alert's own plan says to wait on: a bar closing
 *    beyond the price the move had reached when it was flagged ("wait for a bar
 *    to close … rather than entering into the move"). It is not a fill price.
 *  - **Exit (S/L)** is the alert's invalidation — the opening-range extreme, or
 *    the day's 50% point, depending on the signal.
 *  - **TP1** is the plan's first target: twice the distance from entry to exit.
 *    That is a risk multiple, not a price level the chart marks — the card shows
 *    "2.0× risk" beside it so it reads as what it is. (Whether an intraday first
 *    target should be a structural level instead is an open question written up
 *    in `docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md`, Part 3.)
 *  - **MTP** is empty: the intraday scanner prices an exit and a first target
 *    and no master take profit.
 *
 * A **reversal risk** alert is a warning to stand aside, not a setup, so it
 * carries no levels at all — the card says so instead of pricing a trade the
 * scanner itself advises against.
 */

import { SIGNAL_LABELS, SIGNAL_DESCRIPTIONS, type Alert } from "@/lib/scanner/intraday";
import { tickerHref } from "@/lib/routes";
import { rewardToRisk, type SetupCardModel, type SetupCheck, type SetupLevels } from "@/lib/setups/card";
import { formatUsd } from "@/lib/utils";

export function isReversalRisk(alert: Alert): boolean {
  return alert.type === "reversal_risk";
}

export function intradayLevels(alert: Alert): SetupLevels {
  if (isReversalRisk(alert)) return { entry: null, stop: null, tp1: null, mtp: null };
  return {
    entry: alert.move.current,
    stop: alert.invalidation,
    tp1: alert.continuationPlan.firstTarget,
    mtp: null,
  };
}

export function intradayChecks(alert: Alert): SetupCheck[] {
  return alert.confidenceFactors.map((f) => ({
    label: f.label,
    state: f.passed ? "met" : "missed",
    detail: `${f.weight} pts — ${f.detail}`,
  }));
}

export function buildIntradaySynopsis(alert: Alert): string {
  if (isReversalRisk(alert)) {
    return `${SIGNAL_DESCRIPTIONS.reversal_risk} ${alert.whyThisAppeared}`;
  }

  const total = alert.confidenceFactors.length;
  const passed = alert.confidenceFactors.filter((f) => f.passed).length;
  const up = alert.direction === "up";
  const first = `${SIGNAL_LABELS[alert.type]}, ${up ? "up" : "down"}: ${passed} of ${total} checks line up (confidence ${alert.confidence}/100).`;

  const levels = intradayLevels(alert);
  if (levels.entry == null || levels.stop == null || levels.tp1 == null) return first;
  const multiple = rewardToRisk(levels, levels.tp1);
  return (
    `${first} Wait for a bar to close ${up ? "above" : "below"} ${formatUsd(levels.entry)}, ` +
    `exit at ${formatUsd(levels.stop)} if it fails, first target ${formatUsd(levels.tp1)}` +
    (multiple != null ? ` (${multiple.toFixed(1)}× the risk)` : "") +
    "."
  );
}

export function buildIntradayCardModel(alert: Alert): SetupCardModel {
  return {
    symbol: alert.symbol,
    side: alert.direction === "up" ? "buy" : "sell",
    price: alert.move.current,
    levels: intradayLevels(alert),
    verdict: SIGNAL_LABELS[alert.type],
    checks: intradayChecks(alert),
    stateNote: null,
    alignmentScore: null,
    signal: null,
    higherTimeframes: null,
    patternLabel: null,
    continuation: false,
    synopsis: buildIntradaySynopsis(alert),
    tickerHref: tickerHref(alert.symbol),
  };
}
