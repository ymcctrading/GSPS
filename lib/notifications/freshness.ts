/**
 * GSPS — whether a notification may go out as actionable, as informational,
 * or not at all (owner, 2026-10-28, NOTIFY-FRESHNESS-001).
 *
 * One check for the bell, push and any retry of either, made with the clock
 * at dispatch, never the scan's start. It reads the timing the scan recorded
 * on the alert (`Alert.timeliness`, `lib/scanner/intraday.ts#alertTimeliness`)
 * and never makes up an authorization of its own: a notification is
 * actionable only when the scan said its decision could be acted on, the
 * authorization is for this symbol, signal and plan, and it is still fresh
 * when the message leaves. The member's channel, tier, quiet hours, budgets,
 * the measured-losing hold and deduplication stay separate gates; passing this
 * one lifts none of them, and deduplication is never read as freshness.
 *
 * Outcomes (the owner's type, below):
 * - actionable: data usable at evaluation, the scan's authorization current
 *   and matching, nothing upstream holding it;
 * - informational: a valid observation worth telling, carrying its as-of time
 *   and the delay, with no instruction to act and no "now";
 * - suppress: bad or missing provenance, data that could not have been read
 *   at evaluation, a notice past its time or a plan that was replaced.
 *
 * A protective warning (a plan broken, a stop traded) is never suppressed for
 * want of an entry authorization: it is informational at worst.
 *
 * Expiry is the platform's own cadence, not a chosen TTL: a scheduled scan
 * re-reads every symbol each `SCAN_CADENCE_MINUTES`, so an entry notice older
 * than that has been superseded by a newer reading. Under a real-time feed an
 * authorization lapses once its data is older than one bar of the chart it
 * was read on (`staleUnderRealtime`).
 *
 * Mandate: no market rule of its own (a delivery gate), Dewey N/A. Cause and
 * Effect: a message may claim only what its cause supports. Law of Creation:
 * observation ⊗ dispatch clock gives the disposition; neither alone says
 * whether a message is still true.
 */

import type { FeedEntitlement } from "@/lib/data/timeliness";
import { availability, newerBarUsable, observationAgeMs, staleUnderRealtime, timeframeForMinutes, usableBy } from "@/lib/data/timeliness";
import { SCAN_CADENCE_MINUTES } from "@/lib/scanner/entryApproach";
import type { Alert } from "@/lib/scanner/intraday";
import { MEASURED_LOSING } from "@/lib/scanner/intradayDisplay";

export type NotificationFreshnessResult =
  | {
      disposition: "actionable";
      reason: "current_authorization";
      dataAsOf: string;
      checkedAt: string;
      authorizationId: string;
    }
  | {
      disposition: "informational";
      reason: "delayed_observation" | "actionability_unverified" | "authorization_expired" | "entry_held";
      dataAsOf: string;
      checkedAt: string;
    }
  | {
      disposition: "suppress";
      reason:
        | "invalid_provenance"
        | "unavailable_at_evaluation"
        | "expired_notification"
        | "superseded_plan"
        | "delivery_not_permitted";
      checkedAt: string;
    };

/** What a notification is for. "protective" covers a broken plan or a traded stop. */
export type NotificationPurpose = "observation" | "approach" | "entry" | "protective";

export interface FreshnessEvidence {
  symbol: string;
  purpose: NotificationPurpose;
  feed: FeedEntitlement;
  /** The contractual delay the observation carries, in ms. */
  delayMs: number;
  /** Candle close (or a trade's own time) of the newest data the decision read. */
  dataAsOf: string | null | undefined;
  receivedAt?: string | null;
  evaluatedAt: string | null | undefined;
  /** The bar length the decision read, in minutes. */
  barMinutes: number;
  /**
   * Close of the newest bar the decision's structure read, when it differs
   * from `dataAsOf` (a quote can be newer than the bars). undefined = not
   * recorded; null = unknown, which is never current.
   */
  structureAsOf?: string | null;
  /** The plan the decision read, and the plan standing at dispatch (undefined = not re-read). */
  planKey?: string | null;
  currentPlanKey?: string | null;
  /** The scan's authorization: present only when it said the decision could be acted on. */
  authorizationId?: string | null;
  /** The authorization's own decision identity, to match against this notification. */
  authorizationFor?: { symbol: string; planKey: string | null } | null;
  /** True when any trade rule holds the entry (a target that doesn't pay, a measured-losing signal, against the trend). */
  entryHeld?: boolean;
  /** False when delivery is not permitted at all (channel, tier); those gates are separate, this only records them. */
  deliveryPermitted?: boolean;
}

/**
 * The disposition of one notification at `dispatchAt`. Deterministic: every
 * clock is passed in.
 */
export function checkNotificationFreshness(e: FreshnessEvidence, dispatchAt: Date): NotificationFreshnessResult {
  const checkedAt = Number.isFinite(dispatchAt.getTime()) ? dispatchAt.toISOString() : new Date(0).toISOString();
  const suppress = (reason: Extract<NotificationFreshnessResult, { disposition: "suppress" }>["reason"]): NotificationFreshnessResult => ({
    disposition: "suppress",
    reason,
    checkedAt,
  });
  if (e.deliveryPermitted === false) return suppress("delivery_not_permitted");

  // 1. Identity and timestamps, in a possible order. Missing age is not zero age.
  const dataAsOf = parse(e.dataAsOf);
  const evaluatedAt = parse(e.evaluatedAt);
  const dispatch = dispatchAt.getTime();
  if (!e.symbol || dataAsOf == null || evaluatedAt == null || !Number.isFinite(dispatch) || !(e.delayMs >= 0)) {
    return suppress("invalid_provenance");
  }
  if (evaluatedAt > dispatch || dataAsOf > dispatch) return suppress("invalid_provenance");
  if (e.receivedAt != null && parse(e.receivedAt) == null) return suppress("invalid_provenance");

  // 2. The data was usable when the decision was made: close + delay, and
  // receipt where recorded. No second delay is added here.
  if (!usableBy(availability(new Date(dataAsOf), e.delayMs, e.receivedAt ?? null), new Date(evaluatedAt))) {
    return suppress("unavailable_at_evaluation");
  }

  const asOf = new Date(dataAsOf).toISOString();
  const info = (reason: Extract<NotificationFreshnessResult, { disposition: "informational" }>["reason"]): NotificationFreshnessResult => ({
    disposition: "informational",
    reason,
    dataAsOf: asOf,
    checkedAt,
  });

  // 3. Supersession and expiry, at dispatch. A protective warning about a plan
  // that has since been replaced is no longer about anything standing.
  if (e.currentPlanKey !== undefined && e.planKey != null && e.currentPlanKey !== e.planKey) return suppress("superseded_plan");
  if (e.purpose === "protective") return info(e.feed === "realtime" ? "actionability_unverified" : "delayed_observation");
  if (dispatch - evaluatedAt > SCAN_CADENCE_MINUTES * 60_000) return suppress("expired_notification");

  // 4-5. Actionability: the scan's own authorization, for this decision, still fresh.
  if (e.entryHeld) return info("entry_held");
  if (e.feed !== "realtime") return info("delayed_observation");
  if (!e.authorizationId) return info("actionability_unverified");
  const forThis = e.authorizationFor;
  if (!forThis || forThis.symbol !== e.symbol || (forThis.planKey ?? null) !== (e.planKey ?? null)) return info("actionability_unverified");
  // Every dependency, not only the newest: a fresh quote over bars a newer
  // bar has since followed is not a current decision.
  if (e.structureAsOf !== undefined && newerBarUsable(e.structureAsOf, e.barMinutes, e.delayMs, dispatchAt)) return info("authorization_expired");
  const timeframe = timeframeForMinutes(e.barMinutes);
  if (!timeframe || staleUnderRealtime(observationAgeMs(new Date(dataAsOf), dispatchAt), timeframe)) return info("authorization_expired");

  return { disposition: "actionable", reason: "current_authorization", dataAsOf: asOf, checkedAt, authorizationId: e.authorizationId };
}

function parse(v: string | null | undefined): number | null {
  if (v == null) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The evidence one intraday alert carries, read from what the scan recorded
 * (`Alert.timeliness`). An alert without it has no provenance and is
 * suppressed. A signal the replay measured losing, or whose first target
 * does not pay the risk, is held upstream: it can be told, never acted on.
 */
export function alertFreshnessEvidence(
  alert: Alert,
  extra: { currentPlanKey?: string | null; deliveryPermitted?: boolean } = {},
): FreshnessEvidence {
  const t = alert.timeliness;
  // A reversal-risk warning tells a member to stand aside: protective, so it
  // is never suppressed for want of an entry authorization.
  const purpose: NotificationPurpose =
    alert.type === "reversal_risk" ? "protective" : alert.type === "entry_approach" ? "approach" : "entry";
  return {
    symbol: alert.symbol,
    purpose,
    feed: t?.feed ?? "unknown",
    delayMs: t?.delayMs ?? Number.NaN,
    dataAsOf: t?.dataAsOf ?? null,
    receivedAt: t?.receivedAt ?? null,
    evaluatedAt: t?.evaluatedAt ?? null,
    barMinutes: t?.barMinutes ?? Number.NaN,
    structureAsOf: t?.structureAsOf,
    planKey: t?.planKey ?? null,
    currentPlanKey: extra.currentPlanKey,
    authorizationId: t?.actionable ? t.authorizationId : null,
    authorizationFor: t?.actionable ? { symbol: alert.symbol, planKey: t.planKey } : null,
    entryHeld: Boolean(MEASURED_LOSING[alert.type]) || alert.continuationPlan.paysRisk === false,
    deliveryPermitted: extra.deliveryPermitted,
  };
}

/** The disposition of one intraday alert at `dispatchAt`. */
export function checkAlertFreshness(
  alert: Alert,
  dispatchAt: Date,
  extra: { currentPlanKey?: string | null; deliveryPermitted?: boolean } = {},
): NotificationFreshnessResult {
  return checkNotificationFreshness(alertFreshnessEvidence(alert, extra), dispatchAt);
}
