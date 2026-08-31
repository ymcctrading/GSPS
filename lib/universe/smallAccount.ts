/**
 * Small-account mechanics — "A $450 account is a learning-sized account. It
 * can execute valid plans only if position quantity, risk, allocation, and
 * exit mechanics are feasible. Do not lower liquidity/quality standards to
 * make share count look larger."
 *
 * That last line is why this module never adjusts anything upstream of it —
 * it only reads the quantity a correctly-sized plan produces (from
 * `lib/guided/sizing.ts` or `lib/risk/dynamic-risk.ts`, whichever priced the
 * trade) and judges whether *that* plan is mechanically executable, never
 * loosens a filter to make it look like it is.
 */

import { MIN_WHOLE_UNITS_FOR_STAGED_EXIT } from "./config";
import type { DataProvenance, UniverseFilterResult } from "./types";

/** `policy_values`-overridable floor — see lib/universe/policy.ts. Default is the same constant this file always used. */
export interface SmallAccountThresholds {
  minWholeUnitsForStagedExit: number;
}

export const DEFAULT_SMALL_ACCOUNT_THRESHOLDS: SmallAccountThresholds = {
  minWholeUnitsForStagedExit: MIN_WHOLE_UNITS_FOR_STAGED_EXIT,
};

/**
 * Whether a staged TP1/TP2/runner exit is feasible at the computed size, or
 * the spec's all-in/all-out fallback applies instead.
 *
 * "Whole-share-equivalent units" is the quantity in units the staged exit can
 * actually split across (whole shares normally; a broker's fractional
 * increment when fractional support is confirmed) — not the raw notional.
 */
export function exitMechanics(
  qty: number,
  fractionalSupported: boolean,
  thresholds: SmallAccountThresholds = DEFAULT_SMALL_ACCOUNT_THRESHOLDS,
): {
  stagedExitFeasible: boolean;
  fallback: "staged" | "all_in_all_out";
  reason: string | null;
} {
  if (!Number.isFinite(qty) || qty <= 0) {
    return { stagedExitFeasible: false, fallback: "all_in_all_out", reason: "No positive quantity to size an exit for." };
  }

  // Fractional support means the broker can split the position at whatever
  // granularity the protocol's tranches need, so the whole-unit floor below
  // does not apply — the position itself, not its share count, is what has
  // to be nonzero.
  if (fractionalSupported) {
    return { stagedExitFeasible: true, fallback: "staged", reason: null };
  }

  if (qty < thresholds.minWholeUnitsForStagedExit) {
    return {
      stagedExitFeasible: false,
      fallback: "all_in_all_out",
      reason: `${qty} whole-share-equivalent unit(s) is below the ${thresholds.minWholeUnitsForStagedExit} needed for scaled TP1/TP2/runner exits without fractional support — falling back to all-in/all-out.`,
    };
  }

  return { stagedExitFeasible: true, fallback: "staged", reason: null };
}

/** Everything the spec requires be checked about the account before presenting executable sizing. */
export interface AccountFeasibilityInputs {
  settledFunds: number;
  buyingPower: number;
  accountType: "cash" | "margin";
  /** True when the position's cost basis would need funds still pending T+1 settlement. */
  reliesOnUnsettledFunds: boolean;
  brokerRestrictions: string[];
  /** The plan's total cost/notional at entry. */
  plannedNotionalUsd: number;
  /** Dollars at risk if the stop is hit, for the allocation-vs-risk distinction below. */
  plannedRiskUsd: number;
  /** Ceiling on how much of the account a single position may occupy — see `lib/risk/config.ts`'s allocation ceilings for a live account, or Guided's deployed-capital cap for paper. */
  maxAllocationPct: number;
}

export interface AccountFeasibilityVerdict {
  executable: boolean;
  filters: UniverseFilterResult[];
  reasons: string[];
}

/**
 * "Check settled funds, available buying power, cash versus margin account
 * type, T+1 implications, and broker restrictions before presenting
 * executable sizing. Flag account plans whose position allocation is too
 * large even if planned stop risk is within budget."
 *
 * That last sentence is the reason allocation is checked as its own gate,
 * separate from risk: a plan can pass every risk-per-trade ceiling and still
 * put an outsized share of a small account into one name, which is a
 * concentration problem risk sizing alone does not catch.
 */
export function assessAccountFeasibility(inputs: AccountFeasibilityInputs): AccountFeasibilityVerdict {
  const filters: UniverseFilterResult[] = [];

  filters.push(
    inputs.plannedNotionalUsd <= inputs.settledFunds || inputs.accountType === "margin"
      ? { key: "settled_funds", pass: true, reason: null }
      : {
          key: "settled_funds",
          pass: false,
          reason: `Plan costs $${inputs.plannedNotionalUsd.toFixed(2)}, above the $${inputs.settledFunds.toFixed(2)} in settled funds on a cash account.`,
        },
  );

  filters.push(
    inputs.plannedNotionalUsd <= inputs.buyingPower
      ? { key: "buying_power", pass: true, reason: null }
      : {
          key: "buying_power",
          pass: false,
          reason: `Plan costs $${inputs.plannedNotionalUsd.toFixed(2)}, above the $${inputs.buyingPower.toFixed(2)} available buying power.`,
        },
  );

  filters.push(
    !inputs.reliesOnUnsettledFunds || inputs.accountType === "margin"
      ? { key: "t_plus_1", pass: true, reason: null }
      : {
          key: "t_plus_1",
          pass: false,
          reason: "Plan relies on funds from a sale that has not yet reached T+1 settlement on a cash account.",
        },
  );

  filters.push(
    inputs.brokerRestrictions.length === 0
      ? { key: "broker_restrictions", pass: true, reason: null }
      : {
          key: "broker_restrictions",
          pass: false,
          reason: `Broker restriction(s) apply: ${inputs.brokerRestrictions.join(", ")}.`,
        },
  );

  const equity = Math.max(inputs.settledFunds, inputs.buyingPower);
  const allocationPct = equity > 0 ? (inputs.plannedNotionalUsd / equity) * 100 : Infinity;
  filters.push(
    allocationPct <= inputs.maxAllocationPct
      ? { key: "allocation", pass: true, reason: null }
      : {
          key: "allocation",
          pass: false,
          reason: `Position allocation is ${allocationPct.toFixed(1)}% of the account, above the ${inputs.maxAllocationPct}% ceiling — flagged even though planned stop risk may be within budget.`,
        },
  );

  const reasons = filters.filter((f) => !f.pass).map((f) => f.reason!).filter((r): r is string => r !== null);
  return { executable: reasons.length === 0, filters, reasons };
}

/**
 * "Record whether account data is broker-verified, manually entered,
 * delayed, or unavailable."
 *
 * A thin labeler rather than a data source — callers already know which of
 * these applies (a live SnapTrade/Alpaca read vs. a user-entered balance vs.
 * a cached snapshot past its freshness window vs. no read at all); this just
 * gives that fact one shared vocabulary and a fixed rendering label so it
 * isn't restated ad hoc per surface, the same role `ESTIMATE_LABEL` plays in
 * `lib/risk/account.ts` for the narrower verified/estimate distinction.
 */
export function accountDataProvenanceLabel(provenance: DataProvenance): string {
  switch (provenance) {
    case "broker_verified":
      return "Broker-verified";
    case "vendor_live":
      return "Live market data";
    case "manual":
      return "Manually entered — not broker-verified";
    case "delayed":
      return "Delayed — may not reflect the account's current state";
    case "simulated":
      return "Simulated — not real account data";
    case "unavailable":
      return "Unavailable";
  }
}

/** Whether risk automation may act on this account data at all, per "risk automation disabled if not verified." */
export function riskAutomationAllowed(provenance: DataProvenance): boolean {
  return provenance === "broker_verified" || provenance === "vendor_live";
}
