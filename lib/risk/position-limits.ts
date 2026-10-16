/**
 * Allocation and correlation constraints a new position must satisfy
 * simultaneously alongside risk sizing (lib/risk/dynamic-risk.ts) and
 * buying-power/fractional-share limits, which are already enforced
 * elsewhere (lib/guided/sizing.ts, lib/brokers/simulator.ts) and are not
 * duplicated here.
 */

import type { Limit } from "@/lib/entitlements/policy";
import {
  MAX_AGGREGATE_DEPLOYED_ALLOCATION_PCT,
  MAX_SINGLE_POSITION_ALLOCATION_PCT,
  MAX_TOTAL_OPEN_RISK_PCT,
} from "@/lib/risk/config";

export interface PositionLimitInputs {
  equity: number;
  newPositionNotionalUsd: number;
  /** Notional already deployed across all open positions, this one excluded. */
  currentlyDeployedUsd: number;
  /** Planned risk (entry-to-stop dollars) already committed across open positions. */
  currentOpenRiskUsd: number;
  newPositionRiskUsd: number;
  /** Correlated risk groups already open, this candidate's own group excluded. */
  openCorrelatedGroupsExcludingThis: number;
  /** True when this candidate belongs to a correlated group already represented above. */
  candidateJoinsExistingGroup: boolean;
  /**
   * The account tier's cap on open correlated groups
   * (`EntitlementPolicy.maxCorrelatedRiskGroups`): 1 for Novice, unlimited
   * otherwise. The three percentage ceilings apply to every tier.
   */
  maxCorrelatedRiskGroups: Limit;
}

export interface PositionLimitVerdict {
  ok: boolean;
  /** Every constraint that failed, in the order checked. Empty when ok. */
  violations: string[];
}

export function checkPositionLimits(input: PositionLimitInputs): PositionLimitVerdict {
  const violations: string[] = [];
  if (!(input.equity > 0)) {
    return { ok: false, violations: ["No equity to size a position against."] };
  }

  const singlePositionPct = (input.newPositionNotionalUsd / input.equity) * 100;
  if (singlePositionPct > MAX_SINGLE_POSITION_ALLOCATION_PCT) {
    violations.push(
      `Single-position allocation would be ${singlePositionPct.toFixed(1)}% of equity, over the ${MAX_SINGLE_POSITION_ALLOCATION_PCT}% ceiling.`,
    );
  }

  const aggregatePct = ((input.currentlyDeployedUsd + input.newPositionNotionalUsd) / input.equity) * 100;
  if (aggregatePct > MAX_AGGREGATE_DEPLOYED_ALLOCATION_PCT) {
    violations.push(
      `Aggregate deployed allocation would be ${aggregatePct.toFixed(1)}% of equity, over the ${MAX_AGGREGATE_DEPLOYED_ALLOCATION_PCT}% ceiling.`,
    );
  }

  const totalOpenRiskPct = ((input.currentOpenRiskUsd + input.newPositionRiskUsd) / input.equity) * 100;
  if (totalOpenRiskPct > MAX_TOTAL_OPEN_RISK_PCT) {
    violations.push(
      `Total planned open risk would be ${totalOpenRiskPct.toFixed(2)}% of equity, over the ${MAX_TOTAL_OPEN_RISK_PCT}% ceiling.`,
    );
  }

  const groupsAfter =
    input.openCorrelatedGroupsExcludingThis + (input.candidateJoinsExistingGroup ? 0 : 1);
  const maxGroups = input.maxCorrelatedRiskGroups;
  if (maxGroups !== "unlimited" && !input.candidateJoinsExistingGroup && groupsAfter > maxGroups) {
    violations.push(
      `This would open a new correlated risk group; Novice accounts may hold only ${maxGroups} at a time.`,
    );
  }

  return { ok: violations.length === 0, violations };
}
