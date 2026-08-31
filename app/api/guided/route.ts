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
 *
 * Deliberately NOT wired to the Phase 3E Watch -> Execute monitor system
 * (lib/entitlements/monitor-store.ts). Two independent reasons, not an
 * oversight: docs/GSPS_TIER_ENTITLEMENT_SPEC.md's "Eligible monitor sources" list
 * excludes guided scans entirely (it names scheduled scans, manual dashboard
 * scans, single-ticker scans, and Expert/Wall Street intraday -- guided
 * scans are absent from that list); and a guided recommendation already has
 * its own complete, deliberately single-use lifecycle (shown -> dismissed /
 * executed / expired, logged to guided_recommendations, expired on every
 * fresh load per `expireOutstanding` below) that a lingering WATCH/EXECUTE
 * monitor would sit awkwardly alongside -- this mode's whole design is "one
 * clear decision, right now," not something to keep watching after the
 * user has already moved on. Confirmed 2026-08-26.
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { killSwitchRefusal } from "@/lib/trade/kill-switch";
import { readCapUsage } from "@/lib/guided/caps";
import {
  GUIDED_DISCLOSURE,
  LIVE_BROKERAGE_BLOCK,
  MAX_CANDIDATES_SCANNED,
  resolveGuidedCaps,
} from "@/lib/guided/config";
import { orderedCandidates } from "@/lib/guided/universe";
import {
  buildRecommendations,
  candidateSymbols,
  hasLiveBrokerage,
  readGuidedAccount,
  type Recommendation,
} from "@/lib/guided/service";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { finalizeUsageReservation, reserveUsageSlot } from "@/lib/entitlements/quota";
import { getUniversePolicy } from "@/lib/universe/policy";

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
      nearMiss: null,
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
        nearMiss: null,
      });
    }

    // Phase 3C: guided_scan quota, metered from here -- after the structural
    // blocks above (live brokerage, kill switch, Guided Mode's own risk/trade
    // caps) so a request that never reaches the actual scan doesn't cost the
    // user a daily unit for it.
    const service = createServiceClient();
    const policy = await getUserEntitlementPolicy(service, user.id);
    const reservation = await reserveUsageSlot(service, {
      profileId: user.id,
      usageKey: "guided_scan",
      limit: policy.guidedScansPerDay,
      requestId: randomUUID(),
    });

    if (reservation.status === "quota_exceeded") {
      return NextResponse.json({
        enabled: false,
        blockedReason: "Daily guided scan limit reached for your plan.",
        disclosure: GUIDED_DISCLOSURE,
        caps,
        usage,
        recommendations: [],
        nearMiss: null,
      });
    }
    const reservationId = reservation.reservationId!;

    try {
      // Whatever was on screen before this request is gone the moment this one
      // answers, so it is resolved as expired rather than left `shown` forever.
      // That keeps the three outcomes the ledger promises — executed, dismissed,
      // expired — actually exhaustive, and it keeps a card open in another tab
      // from staying tappable: a recommendation is single-use.
      await expireOutstanding(supabase, user.id);

      // The published list leads; `orderedCandidates` appends the wider universe
      // behind it and applies the scan ceiling once. See lib/guided/universe.ts.
      const published = await candidateSymbols(supabase);
      const { universe: universeThresholds } = await getUniversePolicy(service);
      const { recommendations, skipped, nearMiss, scanned } = await buildRecommendations({
        symbols: orderedCandidates(published, MAX_CANDIDATES_SCANNED),
        account,
        caps,
        deployedUsd: usage.deployedUsd,
        universeThresholds,
      });

      const logged = await logRecommendations(supabase, user.id, recommendations, caps.riskPct, account.equity);

      // A completed scan that recommended nothing is still a completed scan --
      // the reservation is finalized either way, never released for that reason.
      await finalizeUsageReservation(service, { profileId: user.id, reservationId, status: "finalized" });

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
        // The closest candidate, when there was nothing to recommend. Carries no
        // size, risk or reward and has no execute path — it exists so the screen
        // explains itself rather than going blank. Deliberately NOT merged into
        // `recommendations`: nothing downstream should be able to reach the buy
        // flow with one of these.
        nearMiss,
        scanned,
        // Not shown to the user by default — this is what a maintainer reads when
        // a symbol they expected on the dashboard did not become a recommendation.
        skipped,
      });
    } catch (err) {
      // The scan itself failed before producing a completed result -- release
      // the reservation rather than charge the user's daily quota for it.
      await finalizeUsageReservation(service, {
        profileId: user.id,
        reservationId,
        status: "released",
      }).catch(() => {
        // Best-effort: a failure here must not mask the original scan error.
      });
      throw err;
    }
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
    side: r.action,
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
