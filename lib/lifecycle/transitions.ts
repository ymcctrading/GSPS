/**
 * The trade-plan state machine.
 *
 * WATCHLIST -> QUALIFIED -> ARMED -> ENTERED -> TP1_REACHED -> TP2_REACHED ->
 * MASTER_REACHED -> RUNNER -> CLOSED
 * Any pre-entry state -> EXPIRED when the trigger doesn't occur by `expiresAt`.
 * Any active (post-entry) state -> INVALIDATED when the stop/invalidation rule fires.
 *
 * Cooldown gates the ENTER transition only. It never blocks CLOSE, or the
 * risk-reducing actions (TP fills, invalidation) that can fire from an active
 * state — see the spec's "Cooldown affects new-entry transition only" rule,
 * mirrored here rather than in `lib/risk/cooldown.ts`'s account-level gate.
 *
 * Every transition appends one `PlanAuditEntry` and bumps `version` — "all
 * plan edits" must be audited, and a risk increase (`plannedDollarRisk` or
 * `approvedQuantity` rising) is rejected unless the caller passes
 * `userConfirmed: true` on the edit.
 */

import type { PlanAuditEntry, PlanState, TradePlan } from "./types";
import { ACTIVE_STATES, PRE_ENTRY_STATES } from "./types";

export type PlanEvent =
  | { type: "qualify"; at: string; reason: string }
  | { type: "arm"; at: string; reason: string }
  | { type: "enter"; at: string; fillPrice: number; cooldownBlocksNewEntry: boolean }
  | { type: "tp1_fill"; at: string }
  | { type: "tp2_fill"; at: string }
  /** `closedBarConfirmed` — Master Profit activates only on a confirmed closed bar, never a transient print. */
  | { type: "master_fill"; at: string; closedBarConfirmed: boolean }
  | { type: "start_runner"; at: string }
  | { type: "close"; at: string; reason: string }
  | { type: "expire"; at: string }
  | { type: "invalidate"; at: string; reason: string }
  | {
      type: "edit";
      at: string;
      reason: string;
      patch: Partial<Pick<TradePlan["risk"], "plannedDollarRisk" | "approvedQuantity">>;
      userConfirmed: boolean;
    }
  /** Ratchets the Master-Profit floor upward; never accepted if it would lower it. */
  | { type: "raise_floor"; at: string; price: number }
  | { type: "mark_price"; at: string; price: number };

export type TransitionResult =
  | { ok: true; plan: TradePlan }
  | { ok: false; error: string };

function audit(
  plan: TradePlan,
  entry: Omit<PlanAuditEntry, "version">,
): TradePlan {
  const auditEntry: PlanAuditEntry = { ...entry, version: plan.version + 1 };
  return { ...plan, version: plan.version + 1, audit: [...plan.audit, auditEntry] };
}

function fail(error: string): TransitionResult {
  return { ok: false, error };
}

export function applyPlanEvent(plan: TradePlan, event: PlanEvent): TransitionResult {
  switch (event.type) {
    case "qualify": {
      if (plan.state !== "watchlist") return fail(`Cannot qualify a plan in state "${plan.state}".`);
      return advanceActive(plan, "watchlist", "qualified", event.at, event.reason, "plan_edit");
    }
    case "arm": {
      if (plan.state !== "qualified") return fail(`Cannot arm a plan in state "${plan.state}".`);
      return advanceActive(plan, "qualified", "armed", event.at, event.reason, "plan_edit");
    }
    default:
      return applyRemainingEvent(plan, event);
  }
}

function applyRemainingEvent(plan: TradePlan, event: PlanEvent): TransitionResult {
  switch (event.type) {
    case "enter": {
      if (plan.state !== "armed") return fail(`Cannot enter a plan in state "${plan.state}".`);
      if (event.cooldownBlocksNewEntry) {
        return fail("New entry blocked by an active cooldown.");
      }
      return {
        ok: true,
        plan: {
          ...audit(plan, {
            at: event.at,
            kind: "execution",
            fromState: plan.state,
            toState: "entered",
            reason: "Entry filled.",
            riskIncreased: false,
            userConfirmed: true,
          }),
          state: "entered",
          actualEntryPrice: event.fillPrice,
          actualEntryAt: event.at,
          highWater: event.fillPrice,
        },
      };
    }

    case "tp1_fill":
      return advanceActive(plan, "entered", "tp1_reached", event.at, "TP1 reached.");

    case "tp2_fill":
      return advanceActive(plan, "tp1_reached", "tp2_reached", event.at, "TP2 reached.");

    case "master_fill": {
      if (plan.state !== "tp2_reached") {
        return fail(`Cannot mark Master Profit reached from state "${plan.state}".`);
      }
      if (!event.closedBarConfirmed) {
        return fail(
          "Master Profit activates only on a confirmed closed bar, not a transient print.",
        );
      }
      const withFloor = plan.coordinates.masterProfit != null
        ? { masterProfitFloor: plan.coordinates.masterProfit }
        : {};
      return {
        ok: true,
        plan: {
          ...audit(plan, {
            at: event.at,
            kind: "price_event",
            fromState: plan.state,
            toState: "master_reached",
            reason: "Master Profit target reached on a confirmed closed bar.",
            riskIncreased: false,
            userConfirmed: true,
          }),
          state: "master_reached",
          ...withFloor,
        },
      };
    }

    case "start_runner":
      return advanceActive(plan, "master_reached", "runner", event.at, "Runner engaged.");

    case "close": {
      if (!ACTIVE_STATES.includes(plan.state)) {
        return fail(`Cannot close a plan in state "${plan.state}".`);
      }
      return {
        ok: true,
        plan: {
          ...audit(plan, {
            at: event.at,
            kind: "user_action",
            fromState: plan.state,
            toState: "closed",
            reason: event.reason,
            riskIncreased: false,
            userConfirmed: true,
          }),
          state: "closed",
          closedAt: event.at,
          closeReason: event.reason,
        },
      };
    }

    case "expire": {
      if (!PRE_ENTRY_STATES.includes(plan.state)) {
        return fail(`Cannot expire a plan in state "${plan.state}"; expiry only applies pre-entry.`);
      }
      return {
        ok: true,
        plan: {
          ...audit(plan, {
            at: event.at,
            kind: "plan_edit",
            fromState: plan.state,
            toState: "expired",
            reason: `Trigger did not occur by ${plan.expiresAt}.`,
            riskIncreased: false,
            userConfirmed: true,
          }),
          state: "expired",
          closedAt: event.at,
          closeReason: "expired",
        },
      };
    }

    case "invalidate": {
      if (!ACTIVE_STATES.includes(plan.state)) {
        return fail(`Cannot invalidate a plan in state "${plan.state}"; invalidation only applies post-entry.`);
      }
      return {
        ok: true,
        plan: {
          ...audit(plan, {
            at: event.at,
            kind: "price_event",
            fromState: plan.state,
            toState: "invalidated",
            reason: event.reason,
            riskIncreased: false,
            userConfirmed: true,
          }),
          state: "invalidated",
          closedAt: event.at,
          closeReason: event.reason,
        },
      };
    }

    case "edit": {
      const nextRisk = { ...plan.risk, ...event.patch };
      const riskIncreased =
        (event.patch.plannedDollarRisk != null &&
          event.patch.plannedDollarRisk > plan.risk.plannedDollarRisk) ||
        (event.patch.approvedQuantity != null &&
          event.patch.approvedQuantity > plan.risk.approvedQuantity);
      if (riskIncreased && !event.userConfirmed) {
        return fail("Risk may not be increased without re-evaluation and user confirmation.");
      }
      return {
        ok: true,
        plan: {
          ...audit(plan, {
            at: event.at,
            kind: "plan_edit",
            fromState: plan.state,
            toState: plan.state,
            reason: event.reason,
            riskIncreased,
            userConfirmed: event.userConfirmed,
          }),
          risk: nextRisk,
        },
      };
    }

    case "raise_floor": {
      const current = plan.masterProfitFloor;
      if (current != null && event.price <= current) {
        return fail("The Master-Profit floor may ratchet upward but never downward.");
      }
      return {
        ok: true,
        plan: {
          ...audit(plan, {
            at: event.at,
            kind: "price_event",
            fromState: plan.state,
            toState: plan.state,
            reason: `Master-Profit floor raised to ${event.price}.`,
            riskIncreased: false,
            userConfirmed: true,
          }),
          masterProfitFloor: event.price,
        },
      };
    }

    case "mark_price": {
      const long = plan.direction === "bullish";
      const highWater =
        plan.highWater == null
          ? event.price
          : long
            ? Math.max(plan.highWater, event.price)
            : Math.min(plan.highWater, event.price);
      return { ok: true, plan: { ...plan, highWater } };
    }

    default:
      return fail(`Unhandled event.`);
  }
}

function advanceActive(
  plan: TradePlan,
  from: PlanState,
  to: PlanState,
  at: string,
  reason: string,
  kind: PlanAuditEntry["kind"] = "price_event",
): TransitionResult {
  if (plan.state !== from) {
    return fail(`Cannot advance to "${to}" from state "${plan.state}"; expected "${from}".`);
  }
  return {
    ok: true,
    plan: {
      ...audit(plan, {
        at,
        kind,
        fromState: from,
        toState: to,
        reason,
        riskIncreased: false,
        userConfirmed: true,
      }),
      state: to,
    },
  };
}
