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
  // Targets are optional: an intraday alert may fix no TP1 or MTP.
  const takeProfit1 = num("tp1");
  const masterTarget = num("mtp");
  if (entry == null || stopLoss == null) return null;
  if (params.has("tp1") && takeProfit1 == null) return null;
  if (params.has("mtp") && masterTarget == null) return null;
  const d = direction === "bullish" ? 1 : -1;
  if (d * (entry - stopLoss) <= 0) return null;
  if (takeProfit1 != null && d * (takeProfit1 - entry) <= 0) return null;
  return { direction, entry, stopLoss, takeProfit1, masterTarget };
}

/** The query string the client sends for a plan: the inverse of `parsePlanParams`. */
export function planQuery(plan: PlanInput): string {
  const q = new URLSearchParams({
    direction: plan.direction,
    entry: String(plan.entry),
    stop: String(plan.stopLoss),
  });
  if (plan.takeProfit1 != null) q.set("tp1", String(plan.takeProfit1));
  if (plan.masterTarget != null) q.set("mtp", String(plan.masterTarget));
  return q.toString();
}

/**
 * GSPS's plan from a surface's own four levels, or null when no plan has
 * armed (no entry or no stop). `side` is a card's buy/sell or a scan row's
 * direction. Used by every surface that shows a plan's levels.
 */
export function planFromLevels(
  side: "buy" | "sell" | "bullish" | "bearish",
  levels: {
    entry: number | null | undefined;
    stop: number | null | undefined;
    tp1?: number | null;
    mtp?: number | null;
  },
): PlanInput | null {
  const { entry, stop } = levels;
  if (entry == null || stop == null) return null;
  const direction =
    side === "buy" || side === "bullish" ? "bullish" : "bearish";
  const d = direction === "bullish" ? 1 : -1;
  if (d * (entry - stop) <= 0) return null;
  const tp1 =
    levels.tp1 != null && d * (levels.tp1 - entry) > 0 ? levels.tp1 : null;
  const mtp =
    levels.mtp != null && d * (levels.mtp - entry) > 0 ? levels.mtp : null;
  return {
    direction,
    entry,
    stopLoss: stop,
    takeProfit1: tp1,
    masterTarget: mtp,
  };
}
