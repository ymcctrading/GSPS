/**
 * Retires a pre-entry `trade_plans` row when the scan reports its stop broken.
 *
 * Owner decision 2026-09-30 (AGENTS.md finding F3.7): a breach retires the plan
 * until Gann's own test of a false break confirms it or a new plan replaces it.
 * The scan carries that rule (`lib/gann/stopBreach.ts`: the verdict is Reject,
 * `ScanResult.stopBreach` names the stop, the price and the line a close has to
 * get back through), and the monitors already go INVALIDATED from it. What the
 * `trade_plans` lifecycle never had was a pre-entry way out: a plan sitting in
 * WATCHLIST..ARMED whose stop had already broken stayed live-reading until its
 * clock ran out (`lib/lifecycle/reaper.ts`), and the Automated Portfolio
 * Manager's candidate query lists open plans. This closes that gap with one
 * transition, `retire` (`lib/lifecycle/transitions.ts`), into the existing
 * terminal INVALIDATED state: no new state, no migration.
 *
 * **Gated on a recorded compliance sign-off, off until one exists.** The spec
 * pack this module implements defines INVALIDATED for open positions only, and
 * its header requires securities/compliance counsel review before the lifecycle
 * changes (`lib/lifecycle/types.ts`, `reaper.ts`). The owner told the build to
 * start on 2026-10-01; counsel's review is a separate act that code cannot
 * perform, so the transition ships dormant behind the repo's own mechanism for
 * that, `compliance_signoffs` (`lib/compliance/signoff.ts`, feature
 * `preentry_plan_retirement`). With no active row, `retirePlansForBrokenStops`
 * does nothing and reads no plans, and a plan behaves exactly as before: not
 * advanced once the scan rejects it, expired on its clock, refused at the
 * bracket if an order is placed at its levels. Fails closed on a read error.
 *
 * **Which plan.** Each stored plan is its own plan with its own stop, so the
 * scan retires only the plan it priced: same symbol, same direction, and an
 * invalidation level equal to the stop the scan reports broken (a cent of drift
 * is rounding, as in `lib/guided/eligibility.ts#stillMatches`). A plan from
 * earlier structure whose stop differs is left to expire; the scan's current
 * plan is the one that replaced it. The reading is the scan's own, so the
 * lifecycle can't apply a second, divergent breach test (the `harmonicProximity`
 * failure shape): the same price, the same session closes, the same reclaim
 * line.
 *
 * **Retired is terminal here.** The scan holds no stored flag and can stand a
 * plan again when a close clears the reclaim line. A row cannot, and should not:
 * Gann never resumes a stopped trade at its old levels (Master Course,
 * Overnight Chart rule 4; *New Stock Trend Detector* Rule 6, "if stopped, cover
 * and go long again" is a new trade; *Tunnel*, re-bought at 218 with a new stop
 * at 212). A failed break that stands the setup again reaches the lifecycle the
 * way every plan does, as a fresh WATCH -> EXECUTE transition with its own
 * signal id and its own row, so the audit trail shows a retired plan and a
 * replacement rather than one row that flipped back.
 *
 * Three-question basis (AGENTS.md):
 * 1. Gann, as above and in `lib/gann/stopBreach.ts` (Tier A, NSTD, Master
 *    Course, *Tunnel*). The sign-off gate is access control, not technique.
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply. The
 *    engineering property borrowed is phase-resumption after distortion: each
 *    scan pass decides again from the current plan, so a missed pass retires the
 *    plan on the next one, and retirement is idempotent (a plan already
 *    INVALIDATED is no longer pre-entry, so it is not read again).
 * 3. Hermetic. Cause and Effect: a caught stop is an effect whose cause, the
 *    broken structure, has to be read again before another entry, so the old
 *    plan's row records the effect and the new plan records the new reading.
 *    Polarity: the broken level changes sides, so the row that sat on it is
 *    closed, not turned around. (Correspondence, one rule on every surface, is
 *    why this reads the scan's own `stopBreach` instead of redoing the test.)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScanResult } from "@/lib/types";
import { isFeatureAuthorized } from "@/lib/compliance/signoff";
import { applyEventAndPersist, listPreEntryPlansForInstruments } from "./store";
import type { TradePlan } from "./types";

/** What the scan reports about one plan it retired. */
export interface RetiredPlanSignal {
  symbol: string;
  direction: "bullish" | "bearish";
  /** The broken stop, the price the scan ran at, and the line a close has to clear to stand it again. */
  stop: number;
  price: number;
  reclaimAt: number;
}

/** A cent of drift is the rounding stored levels already carry. */
const STOP_MATCH_TOLERANCE = 0.011;

/** The retirement a scan result carries, or null when its plan stands (or it has none). */
export function retiredSignalFromScan(result: ScanResult): RetiredPlanSignal | null {
  if (result.error || !result.stopBreach || result.direction === "none") return null;
  return {
    symbol: result.symbol,
    direction: result.direction,
    stop: result.stopBreach.stop,
    price: result.stopBreach.price,
    reclaimAt: result.stopBreach.reclaimAt,
  };
}

export function retiredSignalsFrom(results: readonly ScanResult[]): RetiredPlanSignal[] {
  return results.flatMap((r) => {
    const signal = retiredSignalFromScan(r);
    return signal ? [signal] : [];
  });
}

/** True when this stored plan is the one the scan reports broken. */
export function planIsRetiredBy(plan: Pick<TradePlan, "instrument" | "direction" | "coordinates">, signal: RetiredPlanSignal): boolean {
  return (
    plan.instrument === signal.symbol &&
    plan.direction === signal.direction &&
    Math.abs(plan.coordinates.invalidation - signal.stop) <= STOP_MATCH_TOLERANCE
  );
}

export interface RetireOutcome {
  /** False when no active `preentry_plan_retirement` sign-off exists; nothing was read or written. */
  authorized: boolean;
  retired: number;
}

/**
 * Retires this profile's open pre-entry plans that the scan reports broken.
 * Best-effort per plan, like the rest of the fan-out: one plan's failure never
 * blocks another's, and none of it may hold up a monitor or a notification.
 */
export async function retirePlansForBrokenStops(
  service: SupabaseClient,
  profileId: string,
  signals: readonly RetiredPlanSignal[],
  now: Date = new Date(),
): Promise<RetireOutcome> {
  if (signals.length === 0) return { authorized: true, retired: 0 };
  if (!(await isFeatureAuthorized(service, "preentry_plan_retirement"))) {
    return { authorized: false, retired: 0 };
  }

  let plans: TradePlan[];
  try {
    plans = await listPreEntryPlansForInstruments(service, profileId, [...new Set(signals.map((s) => s.symbol))]);
  } catch (err) {
    console.error(`retirePlansForBrokenStops: plan lookup failed — ${String(err)}`);
    return { authorized: true, retired: 0 };
  }

  let retired = 0;
  for (const plan of plans) {
    const signal = signals.find((s) => planIsRetiredBy(plan, s));
    if (!signal) continue;
    try {
      const result = await applyEventAndPersist(service, profileId, plan.planId, {
        type: "retire",
        at: now.toISOString(),
        reason: `Stop ${signal.stop.toFixed(2)} broke before entry (price ${signal.price.toFixed(2)}); the plan is retired. A close back through ${signal.reclaimAt.toFixed(2)} is a failed break, which earns a new plan, never this one.`,
      });
      if (result.ok) retired += 1;
    } catch (err) {
      console.error(`retirePlansForBrokenStops: retire failed for plan ${plan.planId} — ${String(err)}`);
    }
  }
  return { authorized: true, retired };
}
