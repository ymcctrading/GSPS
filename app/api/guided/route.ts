/**
 * GSPS — /api/guided
 *
 * GET:  the recommendations Guided Decision Mode is willing to show right now,
 *       each one re-verified against a live scan and sized against the user's
 *       own paper equity. Every recommendation rendered is logged before it is
 *       returned — the audit stream is the whole point (see the migration
 *       0013 header), and logging only the acted-on ones would make it useless.
 * POST: resolve a recommendation the user dismissed.
 *
 * This route never places an order. Submission is a separate, deliberate step
 * at /api/guided/execute, which re-verifies everything again.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { killSwitchRefusal } from "@/lib/trade/kill-switch";
import { readCapUsage } from "@/lib/guided/caps";
import {
  GUIDED_DISCLOSURE,
  LIVE_BROKERAGE_BLOCK,
  resolveGuidedCaps,
} from "@/lib/guided/config";
import {
  buildRecommendations,
  candidateSymbols,
  hasLiveBrokerage,
  readGuidedAccount,
  type Recommendation,
} from "@/lib/guided/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Blocked states are answered with a 200 and an explanation rather than an
  // error status: "Guided Mode is off for you, here is why" is a legitimate
  // answer to the question, and a page that renders it is not in a failure state.
  const blocked = async (reason: string) =>
    NextResponse.json({
      enabled: false,
      blockedReason: reason,
      disclosure: GUIDED_DISCLOSURE,
      recommendations: [],
    });

  if (await hasLiveBrokerage(supabase, user.id)) {
    return blocked(LIVE_BROKERAGE_BLOCK);
  }
  const halted = killSwitchRefusal();
  if (halted) return blocked(halted.error);

  try {
    const { data: settings } = await supabase
      .from("settings")
      .select("prefs")
      .eq("user_id", user.id)
      .maybeSingle();
    const caps = resolveGuidedCaps((settings as { prefs?: unknown } | null)?.prefs ?? null);

    const account = await readGuidedAccount(supabase, user.id);
    const usage = await readCapUsage(supabase, user.id, caps, account.equity, account.openSymbols);
    if (usage.blockedReason) {
      return NextResponse.json({
        enabled: false,
        blockedReason: usage.blockedReason,
        disclosure: GUIDED_DISCLOSURE,
        caps,
        usage,
        recommendations: [],
      });
    }

    // Whatever was on screen before this request is gone the moment this one
    // answers, so it is resolved as expired rather than left `shown` forever.
    // That keeps the three outcomes the ledger promises — executed, dismissed,
    // expired — actually exhaustive, and it keeps a card open in another tab
    // from staying tappable: a recommendation is single-use.
    await expireOutstanding(supabase, user.id);

    const symbols = await candidateSymbols(supabase);
    const { recommendations, skipped } = await buildRecommendations({
      symbols,
      account,
      caps,
      deployedUsd: usage.deployedUsd,
    });

    const logged = await logRecommendations(supabase, user.id, recommendations, caps.riskPct, account.equity);

    return NextResponse.json({
      enabled: true,
      blockedReason: null,
      disclosure: GUIDED_DISCLOSURE,
      caps,
      usage,
      recommendations: logged,
      // Standing aside is a valid output: a scan that found nothing is not an
      // error, and the UI says so rather than showing an empty list.
      standAside: logged.length === 0,
      // Not shown to the user by default — this is what a maintainer reads when
      // a symbol they expected on the dashboard did not become a recommendation.
      skipped,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

/** Resolve every still-open recommendation for this user as expired. */
async function expireOutstanding(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("guided_recommendations")
    .update({
      status: "expired",
      resolved_at: new Date().toISOString(),
      resolution_note: "Superseded by a fresh scan before it was acted on.",
    })
    .eq("user_id", userId)
    .eq("status", "shown");
  if (error) console.error(`guided: outstanding recommendations not expired — ${error.message}`);
}

/**
 * Write one row per recommendation *shown*, and hand back the same cards
 * carrying their row ids — the id is what the confirm step submits, so a card
 * that failed to log cannot be executed at all. That is deliberate: an order
 * whose recommendation was never recorded is exactly the trade the audit stream
 * would later be missing.
 */
async function logRecommendations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  recommendations: Recommendation[],
  riskPct: number,
  equity: number,
): Promise<Recommendation[]> {
  if (recommendations.length === 0) return [];

  const rows = recommendations.map((r) => ({
    user_id: userId,
    symbol: r.symbol,
    asset_class: r.assetClass,
    side: "buy",
    score: r.why.score.score,
    verdict: r.why.verdict,
    pattern_name: r.why.patternName,
    agreed_entry: r.why.entry,
    agreed_stop_loss: r.why.stopLoss,
    agreed_take_profit_1: r.why.takeProfit1,
    agreed_master_profit: r.why.masterProfit,
    qty: r.qty,
    risk_usd: r.riskUsd,
    reward_usd: r.rewardUsd,
    notional_usd: r.notionalUsd,
    equity_at_surface: equity,
    risk_pct: riskPct,
    reason: r.reason,
    expires_at: r.expiresAt,
    status: "shown",
  }));

  const { data, error } = await supabase.from("guided_recommendations").insert(rows).select("id, symbol");
  if (error) {
    console.error(`guided: recommendations not logged — ${error.message}`);
    return [];
  }

  const ids = new Map((data as { id: string; symbol: string }[]).map((d) => [d.symbol, d.id]));
  return recommendations
    .map((r) => ({ ...r, id: ids.get(r.symbol) ?? null }))
    .filter((r) => r.id !== null);
}

const DismissSchema = z.object({ id: z.uuid() });

/** Mark a recommendation dismissed. Single-use: it does not come back. */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = DismissSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid recommendation id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("guided_recommendations")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .eq("status", "shown");
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  return NextResponse.json({ dismissed: true });
}
