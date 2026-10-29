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
 *  - **Exit (S/L)** is the alert's invalidation — a point beyond the crossed old level, or
 *    the day's 50% point, depending on the signal.
 *  - **TP1** is the plan's first target: the nearest old top or bottom beyond the
 *    price, or a round number just short of one (`gannFirstTarget`,
 *    `lib/scanner/intraday.ts`; project owner, 2026-09-30: "everything must align
 *    with Gann"). It replaced twice the distance from entry to exit, a risk
 *    multiple with no source in his method. It can be empty: when no old level
 *    lies ahead the method fixes no target and the stop trails the move, and the
 *    card says so instead of inventing one.
 *  - **MTP** is the next old level or round number beyond TP1
 *    (`gannMasterTarget`, owner 2026-10-22: "Include a mtp for intraday
 *    trades"), where the move is measured to; nothing sells there (Q14). Empty
 *    when no level lies beyond TP1. "Daily plan's level held" carries the daily
 *    plan's TP1 and MTP (2026-10-21).
 *  - A first target that pays no more than the risk (`paysRisk === false`) is
 *    said so: Gann takes no such trade (M-K5).
 *
 * A **reversal risk** alert is a warning to stand aside, not a setup, so it
 * carries no levels at all — the card says so instead of pricing a trade the
 * scanner itself advises against.
 */

import { NOTICE_SIGNALS, SIGNAL_LABELS, SIGNAL_DESCRIPTIONS, tradeHold } from "@/lib/scanner/intradayDisplay";
import type { Alert, RecentSystemAlert } from "@/lib/scanner/intraday";
import type { IntradayChartPlan } from "@/lib/chart/planForTimeframe";
import { tickerHref } from "@/lib/routes";
import { rewardToRisk, type SetupCardModel, type SetupCheck, type SetupLevels } from "@/lib/setups/card";
import { priceUsd } from "@/lib/strat/priceText";

export function isReversalRisk(alert: Alert): boolean {
  return alert.type === "reversal_risk";
}

export function intradayLevels(alert: Alert): SetupLevels {
  if (isReversalRisk(alert)) return { entry: null, stop: null, tp1: null, mtp: null };
  return {
    // A notice's entry is the daily plan's own (`NOTICE_SIGNALS`); every other
    // signal's is the price it was flagged at.
    entry: alert.continuationPlan.entry ?? alert.move.current,
    stop: alert.invalidation,
    tp1: alert.continuationPlan.firstTarget,
    // The next level beyond TP1, or the daily plan's MTP on `plan_level_held`.
    mtp: alert.continuationPlan.masterTarget ?? null,
  };
}

/**
 * The intraday plan a chart draws for `symbol` on an intraday timeframe
 * (`lib/chart/planForTimeframe.ts`): the highest-confidence alert of the
 * latest scan that offers a trade, the same alerts "Trade this" is offered on
 * (a stop and a first target that pays the risk, not a reversal risk, not a
 * signal held from trading by `tradeHold`). With no scan read yet, today's scheduled alerts
 * stand in, on the same tests their stored rows allow. Null when none does.
 */
export function intradayChartPlan(
  symbol: string,
  alerts: readonly Alert[] | null,
  recent: readonly RecentSystemAlert[],
): IntradayChartPlan | null {
  const sym = symbol.toUpperCase();
  const offered = (a: { type: Alert["type"]; againstDailyTrend?: boolean; againstMarketTrend?: boolean }, stop: number | null, tp1: number | null) =>
    a.type !== "reversal_risk" && !NOTICE_SIGNALS.has(a.type) && !tradeHold(a) && stop != null && tp1 != null;
  if (alerts) {
    const best = alerts
      .filter((a) => a.symbol.toUpperCase() === sym && a.continuationPlan.paysRisk !== false)
      .filter((a) => offered(a, a.continuationPlan.invalidation, a.continuationPlan.firstTarget))
      .sort((a, b) => b.confidence - a.confidence)[0];
    if (!best) return null;
    const l = intradayLevels(best);
    return { entry: l.entry, stop: l.stop, firstTarget: l.tp1, masterTarget: l.mtp };
  }
  // A stored alert whose first target paid no more than the risk offers no
  // trade, as on a fresh scan.
  const r = recent.find((x) => x.symbol.toUpperCase() === sym && x.paysRisk !== false && offered(x, x.stop, x.firstTarget));
  return r ? { entry: r.entry, stop: r.stop, firstTarget: r.firstTarget, masterTarget: r.masterTarget } : null;
}

export function intradayChecks(alert: Alert): SetupCheck[] {
  return alert.confidenceFactors.map((f) => ({
    label: f.label,
    state: f.passed ? "met" : "missed",
    detail: f.detail,
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

  // A signal held from trading (measured losing, or against the daily trend)
  // is shown for study, not as a plan.
  const held = tradeHold(alert);
  if (held) return `${first} ${held}`;

  const levels = intradayLevels(alert);
  if (levels.entry == null || levels.stop == null) return first;
  if (NOTICE_SIGNALS.has(alert.type)) {
    const targets = levels.tp1 != null ? `, first target ${priceUsd(levels.tp1)}${levels.mtp != null ? `, then ${priceUsd(levels.mtp)} (MTP)` : ""}` : "";
    return `${SIGNAL_LABELS[alert.type]}, ${up ? "buy" : "sell"}. ${alert.whyThisAppeared} The daily plan: entry ${priceUsd(levels.entry)}, exit at ${priceUsd(levels.stop)}${targets}.`;
  }
  const wait =
    alert.type === "plan_level_held"
      ? `${first} The daily plan's level held and a bar has closed back ${up ? "above" : "below"} it: entry near ${priceUsd(levels.entry)}, exit at ${priceUsd(levels.stop)} if it fails`
      : `${first} Wait for a bar to close ${up ? "above" : "below"} ${priceUsd(levels.entry)}, exit at ${priceUsd(levels.stop)} if it fails`;
  if (levels.tp1 == null) {
    // No old top or bottom lies ahead: name none rather than invent one.
    return `${wait}. No target is fixed: there is no old ${up ? "high" : "low"} ahead of price, so the stop trails under each ${up ? "higher bottom" : "lower top"} instead.`;
  }
  const multiple = rewardToRisk(levels, levels.tp1);
  const base = `${wait}, first target ${priceUsd(levels.tp1)}${multiple != null ? ` (${multiple.toFixed(1)}× the risk)` : ""}${levels.mtp != null ? `, then ${priceUsd(levels.mtp)} (MTP)` : ""}.`;
  if (alert.continuationPlan.paysRisk === false) {
    return `${base} That target pays no more than the risk, so the method takes no trade here: profits must exceed losses.`;
  }
  return base;
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
    higherTimeframes: null,
    patternLabel: null,
    continuation: false,
    // Not read here, deliberately: an intraday alert is priced from the
    // session in progress and carries no daily range; the resting-order read
    // (lib/setups/resting.ts) covers the daily plans.
    resting: null,
    setAsideNote: null,
    synopsis: buildIntradaySynopsis(alert),
    tickerHref: tickerHref(alert.symbol),
  };
}
