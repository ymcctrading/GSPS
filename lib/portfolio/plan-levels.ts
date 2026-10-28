/**
 * The swing or intraday plan's levels for an open position's Edit flow
 * (owner, 2026-10-28: the order ticket's choice of the swing plan, the
 * intraday plan or the person's own levels, carried to every surface it fits).
 *
 * An open trade keeps the management it was placed under (`lib/trade/exit-style.ts`:
 * the style is fixed at the fill, W006 Rule 2), so the Edit flow offers the
 * plans' levels only. And a stop is never loosened (`updateProtocolExit`): it
 * moves only once the trade is in profit, and only toward price, so a plan's
 * stop is taken only when it does that.
 *
 * Three-question basis: 1. The plan's own levels, as the scan priced them, and
 * Gann's rule that a stop is raised, never lowered. 2. No periodicity claim.
 * 3. Correspondence: the same three choices the ticket offers, on the trade.
 */

export interface PlanExitLevels {
  stopLoss: number;
  takeProfit: number;
  masterProfit: number | null;
}

export type PlanPick = { ok: true; levels: PlanExitLevels } | { ok: false; reason: string };

/** The fields of the scan result this reads. */
export interface SwingPlanResult {
  direction?: string;
  decision?: { outputState?: string } | null;
  planExpired?: unknown;
  levels?: { stopLoss?: number | null; takeProfit1?: number | null; masterProfit?: number | null } | null;
}

/** The fields of an intraday plan this reads (`IntradayChartPlan`). */
export interface IntradayPlanLevels {
  stop: number | null;
  firstTarget: number | null;
  masterTarget?: number | null;
}

const isPrice = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** The daily (swing) plan's levels, when it stands on the position's side. */
export function swingPlanForSide(result: SwingPlanResult | null, side: "long" | "short"): PlanPick {
  const wanted = side === "long" ? "bullish" : "bearish";
  const l = result?.levels;
  // A rejected plan (its stop broke, or it expired) offers no levels to take.
  if (result?.decision?.outputState === "Reject" || result?.planExpired) {
    return { ok: false, reason: "The swing plan doesn't stand right now, so it has no levels to offer." };
  }
  if (!result || result.direction !== wanted || !l || !isPrice(l.stopLoss) || !isPrice(l.takeProfit1)) {
    return { ok: false, reason: `The swing plan has no levels for a ${side} right now.` };
  }
  return {
    ok: true,
    levels: { stopLoss: l.stopLoss, takeProfit: l.takeProfit1, masterProfit: isPrice(l.masterProfit) ? l.masterProfit : null },
  };
}

/** The intraday plan's levels, when one stands on the position's side. */
export function intradayPlanForSide(plan: IntradayPlanLevels | null, side: "long" | "short"): PlanPick {
  if (!plan || !isPrice(plan.stop) || !isPrice(plan.firstTarget)) {
    return { ok: false, reason: "No intraday plan stands for this symbol right now." };
  }
  const long = plan.firstTarget > plan.stop;
  if ((side === "long") !== long) {
    return { ok: false, reason: `The intraday plan is on the other side of a ${side}.` };
  }
  return {
    ok: true,
    levels: { stopLoss: plan.stop, takeProfit: plan.firstTarget, masterProfit: isPrice(plan.masterTarget) ? plan.masterTarget : null },
  };
}

/**
 * The stop the Edit form takes from a plan: the plan's, when the trade is in
 * profit and it tightens the stop; otherwise the current one, with the reason.
 */
export function planStopForEdit(args: {
  planStop: number;
  currentStop: number | null;
  side: "long" | "short";
  inProfit: boolean;
}): { stop: number | null; note: string | null } {
  const { planStop, currentStop, side, inProfit } = args;
  if (!inProfit) return { stop: currentStop, note: "The stop stays where it is until the trade is in profit." };
  const tighter = currentStop == null || (side === "long" ? planStop > currentStop : planStop < currentStop);
  if (!tighter) return { stop: currentStop, note: "The plan's stop would loosen yours, so your stop stays." };
  return { stop: planStop, note: null };
}
