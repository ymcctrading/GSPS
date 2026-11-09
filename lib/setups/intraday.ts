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

/** The fields of an alert, fresh or stored, that decide whether it offers a trade. */
type OfferFields = {
  type: Alert["type"];
  againstDailyTrend?: boolean;
  reactionOverbalanced?: boolean;
  againstMainTrend?: boolean;
  riskUnderPoint?: boolean;
};

/**
 * True when an alert offers a trade: "Trade this" is shown on it, the chart
 * draws it and the ticket takes it. Not a reversal risk or a notice, not held
 * from trading (`tradeHold`: study only), a stop and a first target priced, and
 * the target paying more than the risk (M-K5, "profits must exceed losses",
 * *Wall Street Stock Selector* Ch. II).
 */
export function offersTrade(
  a: OfferFields,
  stop: number | null,
  tp1: number | null,
  paysRisk: boolean | null | undefined,
): boolean {
  return (
    a.type !== "reversal_risk" &&
    !NOTICE_SIGNALS.has(a.type) &&
    !tradeHold(a) &&
    stop != null &&
    tp1 != null &&
    paysRisk !== false
  );
}

export function alertOffersTrade(a: Alert): boolean {
  return offersTrade(a, a.continuationPlan.invalidation, a.continuationPlan.firstTarget, a.continuationPlan.paysRisk);
}

/**
 * The one alert a symbol's card leads with and its chart draws (2026-10-29,
 * owner: "Intraday setups are misaligned on the charts page"). The card had
 * led with the highest-confidence alert while the chart drew the
 * highest-confidence alert that offered a trade, so FAST's card showed a
 * study-only daily swing signal and its chart another signal's levels. Now
 * both read this: an alert that offers a trade first, then confidence. The
 * others stay on the card as confirming signals.
 */
export function leadIntradayAlert<T>(alerts: readonly T[], offers: (a: T) => boolean, confidence: (a: T) => number | null): T | null {
  let lead: T | null = null;
  for (const a of alerts) {
    if (lead == null) {
      lead = a;
      continue;
    }
    const ao = offers(a);
    const lo = offers(lead);
    if (ao !== lo) {
      if (ao) lead = a;
      continue;
    }
    if ((confidence(a) ?? -1) > (confidence(lead) ?? -1)) lead = a;
  }
  return lead;
}

/** An alert list's lead for a symbol, fresh alerts. */
export function leadAlert(alerts: readonly Alert[]): Alert | null {
  return leadIntradayAlert(alerts, alertOffersTrade, (a) => a.confidence);
}

/**
 * The intraday plan a chart draws for `symbol` on an intraday timeframe
 * (`lib/chart/planForTimeframe.ts`): the symbol's lead alert (`leadAlert`, the
 * one its card shows) when it offers a trade, and nothing when it does not, so
 * no chart, ticket or position form draws levels the card holds for study or
 * calls no trade. With no scan read yet, today's scheduled alerts stand in,
 * read the same way from their stored rows. Null when none does.
 */
export function intradayChartPlan(
  symbol: string,
  alerts: readonly Alert[] | null,
  recent: readonly RecentSystemAlert[],
): IntradayChartPlan | null {
  const sym = symbol.toUpperCase();
  if (alerts) {
    const lead = leadAlert(alerts.filter((a) => a.symbol.toUpperCase() === sym));
    if (!lead || !alertOffersTrade(lead)) return null;
    const l = intradayLevels(lead);
    return { entry: l.entry, stop: l.stop, firstTarget: l.tp1, masterTarget: l.mtp };
  }
  const r = leadIntradayAlert(
    recent.filter((x) => x.symbol.toUpperCase() === sym),
    (x) => offersTrade(x, x.stop, x.firstTarget, x.paysRisk),
    (x) => x.confidence,
  );
  if (!r || !offersTrade(r, r.stop, r.firstTarget, r.paysRisk)) return null;
  return { entry: r.entry, stop: r.stop, firstTarget: r.firstTarget, masterTarget: r.masterTarget };
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

  // A signal held from trading (measured losing, against the main trend, or after its pullback over-balanced)
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
