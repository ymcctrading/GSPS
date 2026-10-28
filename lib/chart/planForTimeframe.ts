/**
 * Which plan the chart draws for the timeframe on screen (owner, 2026-10-27:
 * "How can I make space for both of them separately, without creating
 * confusion, of having to create another chart to display them
 * individually").
 *
 * One chart, and the timeframe buttons are the switch. Gann reads one method
 * on every chart: the monthly, weekly and daily charts decide the trade, and
 * the hourly and 15-minute charts time it in an active market (Master Course
 * Ch. 13; *Commodities* p. 31). So a daily, weekly or monthly chart draws the
 * daily (Swing) plan's entry, stop, TP1 and MTP, and an intraday chart draws
 * the intraday alert's own levels for the session, labelled "Intraday", or no
 * plan lines when no alert stands. The structural levels (support and
 * resistance from the price structure) are not a plan and show on every
 * timeframe.
 *
 * Three-question basis: 1. Gann, as cited. 2. No cycle claim; Dewey's
 * checklist does not apply. 3. Correspondence: one law read at two scales, on
 * one chart. Law of Creation: daily plan ⊗ intraday timing, joined by the
 * timeframe, gives a chart whose lines always belong to the bars under them.
 */

import { INTRADAY_TFS } from "@/lib/timeframe";
import type { Timeframe } from "@/lib/types";

export interface PlanMarker {
  price: number;
  label: string;
  kind: "entry" | "stop" | "target" | "structural";
}

/** An intraday alert's plan: entry, stop, first target and MTP. */
export interface IntradayChartPlan {
  entry: number | null;
  stop: number | null;
  firstTarget: number | null;
  masterTarget: number | null;
}

export function isIntradayChart(timeframe: Timeframe): boolean {
  return INTRADAY_TFS.includes(timeframe);
}

const usable = (n: number | null): n is number => n != null && Number.isFinite(n) && n > 0;

/**
 * The intraday plan the chart is given, read from the intraday panel's state.
 * `undefined` means the panel has no say: it covers several symbols, its
 * answer hasn't come, the plan has no intraday access (Novice, or not signed
 * in), or its read failed. Then the chart keeps the daily plan on every
 * timeframe, as the public chart does, since the intraday charts time the
 * daily plan (Master Course Ch. 13). `null` means the panel answered and no
 * alert stands for the symbol.
 */
export function panelChartPlan(
  panel: { symbol: string | null; known: boolean; locked: boolean; failed: boolean },
  read: (symbol: string) => IntradayChartPlan | null,
): IntradayChartPlan | null | undefined {
  if (!panel.symbol || !panel.known || panel.locked || panel.failed) return undefined;
  return read(panel.symbol);
}

/**
 * The intraday plan as chart lines, each labelled Intraday; `undefined` (the
 * panel has no say) stays `undefined`, so the chart draws the daily plan.
 */
export function intradayMarkers(plan: IntradayChartPlan | null): PlanMarker[];
export function intradayMarkers(plan: IntradayChartPlan | null | undefined): PlanMarker[] | undefined;
export function intradayMarkers(plan: IntradayChartPlan | null | undefined): PlanMarker[] | undefined {
  if (plan === undefined) return undefined;
  if (!plan) return [];
  const out: PlanMarker[] = [];
  if (usable(plan.entry)) out.push({ price: plan.entry, label: "Intraday entry", kind: "entry" });
  if (usable(plan.stop)) out.push({ price: plan.stop, label: "Intraday SL", kind: "stop" });
  if (usable(plan.firstTarget)) out.push({ price: plan.firstTarget, label: "Intraday TP1", kind: "target" });
  if (usable(plan.masterTarget)) out.push({ price: plan.masterTarget, label: "Intraday MTP", kind: "target" });
  return out;
}

/**
 * The lines for `timeframe`: the daily markers as given on a daily or longer
 * chart; on an intraday chart, the structural ones and the intraday plan's in
 * place of the daily plan's.
 */
export function markersForTimeframe<M extends PlanMarker>(
  timeframe: Timeframe,
  daily: readonly M[],
  intraday: readonly M[],
): M[] {
  if (!isIntradayChart(timeframe)) return [...daily];
  return [...daily.filter((m) => m.kind === "structural"), ...intraday];
}
