/**
 * The names the backtest API takes for its exit rules (`?disableExits=`).
 *
 * The replay keys its exit rules by internal names, two of which name the
 * rule behind them. The API is read by members' browsers, so it takes and
 * reports neutral names for those two and the internal names for the rest,
 * which are plain trading words (prior_week, trend_change, distribution and
 * so on). An internal name that has a public one is not accepted at the API.
 */
import { GANN_EXIT_RULE_NAMES, type GannExitRuleName } from "@/lib/gann/exitRules";

const PUBLIC_FOR: Partial<Record<GannExitRuleName, string>> = {
  three_adverse_closes: "early_adverse_closes",
  boiling_point: "long_run_trail",
};

/** Every exit rule's API name, in the replay's order. */
export const PUBLIC_EXIT_RULE_NAMES: readonly string[] = GANN_EXIT_RULE_NAMES.map((n) => PUBLIC_FOR[n] ?? n);

/**
 * The internal rule for an API name, or null when the API doesn't take it
 * (unknown, or an internal name that has a public one).
 */
export function exitRuleFromPublicName(name: string): GannExitRuleName | null {
  const i = PUBLIC_EXIT_RULE_NAMES.indexOf(name);
  return i < 0 ? null : GANN_EXIT_RULE_NAMES[i];
}
