/**
 * Reads GSPS's plan from a request's query string for the explain-the-math
 * routes: `direction`, `entry`, `stop`, `tp1`, `mtp`. Returns null when any
 * is missing or the levels don't sit on the plan's own sides, so a route
 * answers with the technique's state only rather than reading a malformed plan.
 */

import type { PlanInput } from "./types";

export function parsePlanParams(params: URLSearchParams): PlanInput | null {
  const direction = params.get("direction");
  if (direction !== "bullish" && direction !== "bearish") return null;
  const num = (k: string) => {
    const raw = params.get(k);
    const v = raw == null ? NaN : Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const entry = num("entry");
  const stopLoss = num("stop");
  const takeProfit1 = num("tp1");
  const masterTarget = num("mtp");
  if (
    entry == null ||
    stopLoss == null ||
    takeProfit1 == null ||
    masterTarget == null
  )
    return null;
  const d = direction === "bullish" ? 1 : -1;
  if (d * (entry - stopLoss) <= 0 || d * (takeProfit1 - entry) <= 0)
    return null;
  return { direction, entry, stopLoss, takeProfit1, masterTarget };
}

/** The query string the client sends for a plan: the inverse of `parsePlanParams`. */
export function planQuery(plan: PlanInput): string {
  return new URLSearchParams({
    direction: plan.direction,
    entry: String(plan.entry),
    stop: String(plan.stopLoss),
    tp1: String(plan.takeProfit1),
    mtp: String(plan.masterTarget),
  }).toString();
}
