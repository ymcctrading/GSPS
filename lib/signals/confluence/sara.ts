/**
 * Sara Confluence Layer — the addendum's cross-market price-action,
 * multi-timeframe confirmation module. Wraps GSPS's existing,
 * already-authorized closed-bar reversal/continuation pattern detector
 * (`lib/strat/patterns.ts`) rather than inventing a new taxonomy: those
 * pattern codes are exactly what CHANGELOG.md documents as already scrubbed
 * of proprietary naming, already implemented and already routed through
 * `lib/education/patterns.ts`'s `PATTERN_GLOSSARY_TERM` to keep proprietary
 * naming off user-facing surfaces.
 *
 * Kept separate from the generic GSPS Trend Pullback / Breakout / Confirmed
 * Reversal / Range Reversion states (`lib/signals/states/*`) so its criteria
 * can be independently tested and enabled, per the addendum. Uses closed
 * candles only. Role: a confluence factor that cannot override eligibility,
 * data freshness, event risk, account risk, or cooldown status.
 */

import type { AssetClass, Bar, Direction, StratPattern } from "@/lib/types";
import { atr } from "@/lib/analysis/pivots";
import { PATTERN_GLOSSARY_TERM } from "@/lib/education/patterns";
import { detectPatterns, gapRuleViolated, riskFloorViolated } from "@/lib/strat/patterns";
import { routeMarketAdapter } from "./marketAdapters";
import type { ConfluenceAlignment, ConfluenceModuleMeta, SaraConfluenceResult } from "./types";

export const SARA_CONFLUENCE_MODULE: ConfluenceModuleMeta = {
  moduleId: "sara_sniper_confluence_layer",
  moduleType: "sara",
  displayName: "Price-Action Confirmation Confluence",
  authorizedSource:
    "lib/strat/patterns.ts (closed-bar reversal/continuation taxonomy: 2-2, 1-2-2, 3-2-2, 2-1-2, 3-1-2, momentum exhaustion reversal) — already-authorized, documented internal logic; display names routed through lib/education/patterns.ts's PATTERN_GLOSSARY_TERM.",
  version: "0.1.0",
};

export interface SaraConfluenceInputs {
  assetClass: AssetClass;
  symbol: string;
  /** Closed bars only — the addendum requires closed-candle confirmation. */
  closedExecutionBars: Bar[];
  currentPrice: number;
  /** Higher-timeframe direction to check continuity against — informational, never overridden by this module. */
  htfDirection: Exclude<Direction, "none"> | null;
}

const MIN_EXECUTION_BARS = 4;

export function evaluateSaraConfluence(inputs: SaraConfluenceInputs): SaraConfluenceResult {
  const adapter = routeMarketAdapter(inputs.assetClass);
  const sourceTimestamp = new Date().toISOString();

  if (adapter.status === "unsupported" || inputs.closedExecutionBars.length < MIN_EXECUTION_BARS) {
    const reason =
      adapter.status === "unsupported"
        ? adapter.note
        : `Insufficient closed-bar history (${inputs.closedExecutionBars.length} < ${MIN_EXECUTION_BARS}) for price-action confluence.`;
    return {
      module: SARA_CONFLUENCE_MODULE,
      market: adapter.market,
      marketAdapterStatus: adapter.status,
      alignment: "notImplemented",
      scenarioId: null,
      direction: "none",
      timeframeContinuity: "notConfirmed",
      confirmationState: "noArmedScenario",
      evidence: {
        calculationVersion: SARA_CONFLUENCE_MODULE.version,
        inputs: { symbol: inputs.symbol, assetClass: inputs.assetClass },
        sourceTimestamp,
        explanationTrace: [reason],
      },
      note: reason,
    };
  }

  const executionAtr = atr(inputs.closedExecutionBars.slice(-30), 14);
  const armed = detectPatterns(inputs.closedExecutionBars).filter(
    (p) => !gapRuleViolated(p, inputs.currentPrice) && !riskFloorViolated(p, executionAtr),
  );
  const scenario: StratPattern | null = armed[0] ?? null;

  const explanationTrace: string[] = [];
  let alignment: ConfluenceAlignment = "neutral";
  let timeframeContinuity: "confirmed" | "notConfirmed" = "notConfirmed";

  if (scenario) {
    explanationTrace.push(
      `Armed scenario: ${PATTERN_GLOSSARY_TERM[scenario.name]} (${scenario.name}), ${scenario.direction}. ${scenario.description}`,
    );
    if (inputs.htfDirection) {
      const continuous = scenario.direction === inputs.htfDirection;
      timeframeContinuity = continuous ? "confirmed" : "notConfirmed";
      alignment = continuous ? "aligned" : "conflict";
      explanationTrace.push(
        `Higher-timeframe direction ${inputs.htfDirection} — ${continuous ? "continuity confirmed" : "conflicts with the scenario's direction"}.`,
      );
    } else {
      explanationTrace.push("No higher-timeframe direction supplied — continuity not assessed.");
    }
  } else {
    explanationTrace.push("No armed scenario on the current closed-bar series.");
  }

  return {
    module: SARA_CONFLUENCE_MODULE,
    market: adapter.market,
    marketAdapterStatus: adapter.status,
    alignment,
    scenarioId: scenario?.name ?? null,
    direction: scenario?.direction ?? "none",
    timeframeContinuity,
    confirmationState: scenario ? "closedBarConfirmed" : "noArmedScenario",
    evidence: {
      calculationVersion: SARA_CONFLUENCE_MODULE.version,
      inputs: {
        symbol: inputs.symbol,
        assetClass: inputs.assetClass,
        currentPrice: inputs.currentPrice,
        htfDirection: inputs.htfDirection,
      },
      sourceTimestamp,
      explanationTrace,
    },
    note:
      "Confluence factor only — cannot override eligibility, data freshness, event risk, account risk, or cooldown status.",
  };
}
