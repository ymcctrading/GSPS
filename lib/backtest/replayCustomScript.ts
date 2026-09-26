/**
 * Historical walk-forward over one compiled custom script
 * (`lib/strategies/custom/`), Phase 4 of `docs/STRATEGY_MODES.md`'s
 * "Custom-script / plugin system" — parallel infrastructure to
 * `replaySignals.ts`'s own walk-forward over the Signal & Regime Engine,
 * reused deliberately rather than inventing a third backtest engine.
 *
 * Three-question design basis (AGENTS.md's Three-question mandate):
 * 1. Gann grounding: none, by design — same answer every other custom-
 *    script module in this family gives (`types.ts`'s header).
 * 2. Cycle theory: not applicable to the mechanism itself, which claims no
 *    periodicity of its own; applies per-script if a specific script makes
 *    a periodicity claim (same carve-out `entryTrigger.ts` and the nine
 *    built-in Strategy Modes give).
 * 3. Hermetic principle: Correspondence ("as above, so below") — this
 *    module's shape is a direct mirror of `replaySignals.ts`'s own
 *    walk-forward, applied to a new domain rather than reinvented for one.
 *
 * Scoped as **evidence-gathering, not trade simulation** — the same
 * restraint `replaySignals.ts`'s own header documents, and for the same
 * reason: honestly reporting "did this bar arm this script" needs no
 * unvalidated model, but "what happened after" needs a fill/stop/target
 * touch simulation this module does not build. That restraint matters more
 * here than for the Signal & Regime Engine, not less — a custom script is
 * user-authored, arbitrarily numerous, and this project has no reviewed
 * methodology for simulating fills against an arbitrary author's own
 * entry/stop/target logic. Fabricating a win-rate/R-multiple claim from an
 * unvalidated fill model would be exactly the "public accuracy claims
 * outrunning validated methodology" problem `GSPS_DOCTRINE_ALIGNMENT_AUDIT.md`
 * §4 already flags. What this reports — how often, in which direction, and
 * at what prices a script would have armed — is real, honest evidence a
 * script's author can use to judge whether it is even close to reasonable
 * before ever trusting it live; it is not, and must never be presented as,
 * a performance claim.
 */

import type { Bar } from "@/lib/types";
import { compileCustomScript } from "@/lib/strategies/custom/compile";
import type { ScriptIdentity } from "@/lib/strategies/custom/interpret";
import type { StrategyDirection } from "@/lib/strategies/types";

export interface CustomScriptReplayEvent {
  index: number;
  date: string;
  direction: StrategyDirection;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  masterTarget: number;
  riskPerShare: number;
}

export type CustomScriptReplayResult =
  | {
      ok: true;
      symbol: string;
      scriptId: string;
      scriptName: string;
      author: string;
      version: number;
      barsEvaluated: number;
      events: CustomScriptReplayEvent[];
      armedCount: number;
      bullishCount: number;
      bearishCount: number;
    }
  | { ok: false; errors: string[] };

/**
 * Walks `bars` forward one bar at a time, re-evaluating the script against
 * every closed-history window (`bars.slice(0, i + 1)`) — the same growing-
 * window shape `replaySignals.ts#replaySignalEngine` uses. `null` on a given
 * window ("nothing armed") is skipped, not recorded as an event, same
 * convention every built-in mode and the DSL evaluator itself use.
 */
export function replayCustomScript(
  symbol: string,
  identity: ScriptIdentity,
  source: string,
  bars: Bar[],
): CustomScriptReplayResult {
  const compiled = compileCustomScript(source, identity);
  if (!compiled.ok) {
    return { ok: false, errors: compiled.errors };
  }

  const events: CustomScriptReplayEvent[] = [];
  let bullishCount = 0;
  let bearishCount = 0;

  for (let i = 1; i < bars.length; i++) {
    const window = bars.slice(0, i + 1);
    const result = compiled.evaluator!(window);
    if (!result) continue;

    if (result.direction === "bullish") bullishCount++;
    else bearishCount++;

    events.push({
      index: i,
      date: bars[i].t,
      direction: result.direction,
      entry: result.entry,
      stopLoss: result.stopLoss,
      takeProfit1: result.takeProfit1,
      masterTarget: result.masterTarget,
      riskPerShare: result.riskPerShare,
    });
  }

  return {
    ok: true,
    symbol,
    scriptId: identity.scriptId,
    scriptName: identity.scriptName,
    author: identity.author,
    version: identity.version,
    barsEvaluated: bars.length,
    events,
    armedCount: events.length,
    bullishCount,
    bearishCount,
  };
}
