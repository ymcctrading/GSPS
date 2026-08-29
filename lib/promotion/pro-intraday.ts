/**
 * Pro intraday module — bounded gating logic, per the spec pack's "Intraday
 * boundary for Pro+" and "Pro intraday initial policy" table.
 *
 * Pure and stateless, same posture as `lib/guided/caps.ts` and
 * `lib/risk/circuit-breaker.ts`: this module only decides whether a new
 * intraday entry is currently allowed under Pro's bounded caps and whether a
 * candidate signal's confirmation basis qualifies — it does not read or
 * write anything itself, so it can be wired to a route (session/usage
 * tracking, the actual scan call) without this file changing.
 *
 * Deliberately NOT the same pathway as Expert/Wall Street's full intraday
 * scans (`lib/scanner/intraday.ts` gated by `intradayScansEnabled`): the
 * spec pack is explicit that Pro must get "separately defined modules with
 * session, spread, liquidity, timeframe, daily-loss, and trade-count
 * rules," not a shortened version of the Novice swing timeframe or a
 * smaller slice of the existing full-intraday product. This module is that
 * separate definition.
 *
 * Wired into `app/api/intraday-scan/route.ts` (2026-08-29) via the
 * `proIntradayModuleEnabled` entitlement flag (`lib/entitlements/policy.ts`),
 * a capability distinct from `intradayScansEnabled` — which stays `false`
 * for Pro/STANDARD, preserving the existing, deliberately confirmed Phase 3F
 * restriction in `docs/GSPS_TIER_ENTITLEMENT_SPEC.md` that only Expert+ gets
 * full, unrestricted intraday scanning. See that doc's 2026-08-29 correction
 * note and ROADMAP.md for the product decision behind widening Pro this far
 * and no further: entries/day, concurrent-position, consecutive-loss, and
 * daily-loss gating live here (pure) but are not yet called from an
 * order-placement path — nothing in this codebase tags an order as
 * "intraday-sourced" today, for any tier, so those four gates currently have
 * no live caller. The route wires only what it can enforce on the scan side:
 * setups-displayed and entry-confirmation.
 */

import { DEFAULT_PRO_INTRADAY_POLICY, type ProIntradayPolicy } from "@/lib/promotion/config";

export interface ProIntradayUsage {
  /** Distinct setups already shown today, across all calls. */
  setupsDisplayedToday: number;
  /** New intraday positions already opened today. */
  entriesToday: number;
  /** Intraday positions currently open. */
  concurrentOpen: number;
  /** Consecutive stopped-out intraday trades since the last winner (or session start). */
  consecutiveLosses: number;
  /** Realized intraday loss today, as a percent of account equity. */
  dailyLossPct: number;
}

export interface ProIntradayDecision {
  allowed: boolean;
  /** Plain-language reason, set whenever `allowed` is false. */
  reason: string | null;
}

/** How many more setups may still be displayed today without exceeding the module's daily ceiling. */
export function remainingSetupsDisplayable(
  usage: Pick<ProIntradayUsage, "setupsDisplayedToday">,
  policy: ProIntradayPolicy = DEFAULT_PRO_INTRADAY_POLICY,
): number {
  return Math.max(0, policy.setupsDisplayedPerDayMax - usage.setupsDisplayedToday);
}

/**
 * Whether a new intraday entry may be taken right now under the Pro
 * module's bounds. Checks every gate independently and returns the first
 * one that fails — unlike `evaluatePromotionReadiness`, an entry decision
 * is a single yes/no gate a route acts on immediately, not a checklist a
 * user reviews, so returning only the first blocking reason is the right
 * shape here.
 */
export function canEnterNewIntradayPosition(
  usage: ProIntradayUsage,
  dailyLossLockPct: number,
  policy: ProIntradayPolicy = DEFAULT_PRO_INTRADAY_POLICY,
): ProIntradayDecision {
  if (usage.dailyLossPct >= dailyLossLockPct) {
    return { allowed: false, reason: "Daily loss lock reached — no new intraday entries for the rest of the session." };
  }
  if (usage.consecutiveLosses >= policy.consecutiveLossPauseCount) {
    return {
      allowed: false,
      reason: `${policy.consecutiveLossPauseCount} consecutive stopped-out trades — intraday entries paused for the rest of the session.`,
    };
  }
  if (usage.concurrentOpen >= policy.concurrentPositionsMax) {
    return { allowed: false, reason: `Already at the ${policy.concurrentPositionsMax}-position concurrent-intraday limit.` };
  }
  if (usage.entriesToday >= policy.newEntriesPerDayDefault) {
    return { allowed: false, reason: `Already at today's ${policy.newEntriesPerDayDefault}-entry intraday limit.` };
  }
  return { allowed: true, reason: null };
}

/**
 * Entry confirmation must be a closed bar of one of the module's allowed
 * lengths — never an unconfirmed intrabar signal, per the spec pack.
 */
export function isConfirmedIntradayEntry(
  barIntervalMinutes: number,
  barIsClosed: boolean,
  policy: ProIntradayPolicy = DEFAULT_PRO_INTRADAY_POLICY,
): boolean {
  return barIsClosed && (policy.entryConfirmationBarMinutes as readonly number[]).includes(barIntervalMinutes);
}
