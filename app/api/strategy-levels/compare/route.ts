/**
 * GSPS — /api/strategy-levels/compare
 *
 * Every technique the signed-in person may use, read against GSPS's plan in
 * one call, the ones that align with the plan first (owner, 2026-10-22; see
 * `lib/strategies/compare.ts` for the rule). A technique that aligns trades
 * GSPS's plan; every other one offers its own entry, stop and TP1, never an
 * MTP. The person's own active scripts are read too, after the built-in modes.
 *
 * Tier-gated the same way as `/api/strategy-levels`: only the modes
 * `lib/entitlements/policy.ts#allowedStrategyModes` grants, so Novice gets an
 * empty list. Never wired into scanning, scoring, SignalGates, the plan or
 * Automation (AGENTS.md "Strategy Modes"). One bar fetch serves every
 * technique; each evaluation is a few hundred bars of arithmetic.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { TF_LOOKBACK_DAYS, TF_MAX_BARS, parseTimeframe } from "@/lib/timeframe";
import { evaluateStrategyMode } from "@/lib/strategies/registry";
import { isStrategyModeAllowedForPolicy } from "@/lib/strategies/access";
import { NON_GANN_STRATEGY_MODES, STRATEGY_MODE_LABELS } from "@/lib/strategies/types";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { explainCustomScript, explainPlan, parsePlanParams } from "@/lib/strategies/explain";
import { compileCustomScript } from "@/lib/strategies/custom/compile";
import { rankTechniques, readTechnique, type TechniqueRead } from "@/lib/strategies/compare";

// Same reasoning as /api/strategy-levels: a symbol fetch can queue behind the
// shared per-provider rate limiter.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const timeframe = parseTimeframe(searchParams.get("timeframe"), "5Min");
  if (!symbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }

  const policy = await getUserEntitlementPolicy(supabase, user.id);
  const modes = NON_GANN_STRATEGY_MODES.filter((m) => isStrategyModeAllowedForPolicy(policy, m));

  // Private to the person: scoped to their own rows, as the evaluate route is.
  const { data: plugins, error: pluginError } = await supabase
    .from("strategy_plugins")
    .select("id, name, author, source, version, active")
    .eq("user_id", user.id)
    .eq("active", true);
  if (pluginError) {
    return NextResponse.json({ error: pluginError.message }, { status: 500 });
  }

  const plan = parsePlanParams(searchParams);
  if (modes.length === 0 && (plugins ?? []).length === 0) {
    return NextResponse.json({ symbol: symbol.toUpperCase(), timeframe, plan, techniques: [] });
  }

  const provider = getMarketDataProvider();
  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  const start = new Date(Date.now() - TF_LOOKBACK_DAYS[timeframe] * 24 * 3600 * 1000);
  const end =
    assetClass === "crypto" || !provider.isLive ? null : new Date(Date.now() - 16 * 60 * 1000);

  try {
    const bars = await provider.fetchBars(
      symbol,
      timeframe,
      start,
      end,
      assetClass,
      TF_MAX_BARS[timeframe],
    );
    if (!bars || bars.length === 0) {
      return NextResponse.json({ error: "No bar data available" }, { status: 404 });
    }

    const reads: TechniqueRead[] = modes.map((mode) =>
      readTechnique(
        mode,
        STRATEGY_MODE_LABELS[mode],
        plan,
        evaluateStrategyMode(mode, bars),
        plan ? explainPlan(mode, bars, plan) : null,
      ),
    );
    for (const p of plugins ?? []) {
      const compiled = compileCustomScript(p.source, {
        scriptId: p.id,
        scriptName: p.name,
        author: p.author,
        version: p.version,
      });
      // A script that no longer compiles is left out, not reported as a reading.
      if (!compiled.ok) continue;
      reads.push(
        readTechnique(
          `custom:${p.id}`,
          p.name,
          plan,
          compiled.evaluator!(bars),
          plan
            ? explainCustomScript({ id: p.id, name: p.name }, compiled.ast!, compiled.evaluator!, bars, plan)
            : null,
        ),
      );
    }

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      timeframe,
      plan,
      techniques: rankTechniques(reads),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
