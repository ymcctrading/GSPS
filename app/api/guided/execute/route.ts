/**
 * GSPS — /api/guided/execute
 *
 * The confirm step. One tap, one dialog, one order — and between the tap and
 * the order, every check that produced the recommendation is run again:
 *
 *   1. Guided Mode is still allowed to run (paper-only, kill switch).
 *   2. The recommendation exists, belongs to this user, is unresolved, and has
 *      not expired. Nothing here is a standing authorization.
 *   3. A *fresh* scan still produces the same trade — same direction, still
 *      Execute, priced at the same entry, stop and targets the user agreed to.
 *   4. The caps still allow it, re-counted at this moment rather than trusted
 *      from the render.
 *   5. The size is re-derived from current equity, and refused if it no longer
 *      clears the minimum the staged exit needs.
 *
 * Only then does it submit, through the same `placeSimulatedOrder` path the
 * manual ticket uses — a real bracket, with stop, TP1 and master attached.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { scanTicker } from "@/lib/scanTicker";
import { killSwitchRefusal } from "@/lib/trade/kill-switch";
import { placeSimulatedOrder } from "@/lib/trade/place-order";
import { readCapUsage } from "@/lib/guided/caps";
import { sizeIsTradeable, stillMatches } from "@/lib/guided/eligibility";
import { sizeGuidedTrade } from "@/lib/guided/sizing";
import { LIVE_BROKERAGE_BLOCK, resolveGuidedCaps } from "@/lib/guided/config";
import { hasLiveBrokerage, readGuidedAccount, resolveShortable } from "@/lib/guided/service";

const ExecuteSchema = z.object({ id: z.uuid() });

interface RecommendationRow {
  id: string;
  symbol: string;
  side: string;
  qty: number;
  status: string;
  expires_at: string;
  agreed_entry: number;
  agreed_stop_loss: number;
  agreed_take_profit_1: number;
  agreed_master_profit: number;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = ExecuteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid recommendation id" }, { status: 400 });
  }

  const halted = killSwitchRefusal();
  if (halted) return NextResponse.json(halted, { status: 503 });
  if (await hasLiveBrokerage(supabase, user.id)) {
    return NextResponse.json({ error: LIVE_BROKERAGE_BLOCK, code: "live_brokerage" }, { status: 403 });
  }

  const { data } = await supabase
    .from("guided_recommendations")
    .select(
      "id, symbol, side, qty, status, expires_at, agreed_entry, agreed_stop_loss, agreed_take_profit_1, agreed_master_profit",
    )
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const rec = data as RecommendationRow | null;
  if (!rec) {
    return NextResponse.json({ error: "That recommendation no longer exists." }, { status: 404 });
  }
  if (rec.status !== "shown") {
    return NextResponse.json(
      { error: `This recommendation was already ${rec.status}. Refresh for the current list.`, code: "already_resolved" },
      { status: 409 },
    );
  }
  if (new Date(rec.expires_at).getTime() <= Date.now()) {
    await resolve(supabase, rec.id, "expired", "Expired before it was acted on.");
    return NextResponse.json(
      {
        error: "This recommendation has expired. Refresh for a current one — nothing was placed.",
        code: "expired",
      },
      { status: 409 },
    );
  }

  // The side the user confirmed. Everything downstream — the risk arithmetic,
  // the bracket legs, the order itself — is derived from this rather than from
  // whatever the fresh scan happens to arm, so a setup that flipped direction
  // is refused below instead of quietly submitted the other way round.
  const side: "buy" | "sell" = rec.side === "sell" ? "sell" : "buy";
  const agreed = {
    entry: Number(rec.agreed_entry),
    stopLoss: Number(rec.agreed_stop_loss),
    takeProfit1: Number(rec.agreed_take_profit_1),
    masterProfit: Number(rec.agreed_master_profit),
    direction: (side === "sell" ? "bearish" : "bullish") as "bullish" | "bearish",
  };

  // ---- Re-verify against the market as it is right now, not as it was.
  const fresh = await scanTicker(rec.symbol);
  // A short also has to still be borrowable at submission: availability moves
  // during the session, and a recommendation written when it was borrowable is
  // an order that dies at the broker when it is not.
  const shortable =
    side === "sell" ? (await resolveShortable([rec.symbol])).get(rec.symbol.toUpperCase()) : undefined;
  const match = stillMatches(fresh, agreed, shortable);
  if (!match.ok) {
    await resolve(supabase, rec.id, "expired", match.reason);
    return NextResponse.json({ error: match.reason, code: "changed" }, { status: 409 });
  }

  // ---- Caps and size, re-read at submission.
  const { data: settings } = await supabase
    .from("settings")
    .select("prefs")
    .eq("user_id", user.id)
    .maybeSingle();
  const caps = resolveGuidedCaps((settings as { prefs?: unknown } | null)?.prefs ?? null);

  const account = await readGuidedAccount(supabase, user.id);
  const usage = await readCapUsage(supabase, user.id, caps, account.equity, account.openSymbols);
  if (usage.blockedReason) {
    return NextResponse.json({ error: usage.blockedReason, code: "cap_reached" }, { status: 429 });
  }

  const sized = sizeGuidedTrade({
    side,
    equity: account.equity,
    buyingPower: account.buyingPower,
    entry: agreed.entry,
    stopLoss: agreed.stopLoss,
    takeProfit1: agreed.takeProfit1,
    masterProfit: agreed.masterProfit,
    riskPct: caps.riskPct,
    maxDeployedPct: caps.maxDeployedPct,
    deployedUsd: usage.deployedUsd,
  });
  if (sized.blockedReason || !sizeIsTradeable(sized.qty)) {
    return NextResponse.json(
      { error: sized.blockedReason ?? "This trade is too small to place under the protocol's staged exit.", code: "unsizeable" },
      { status: 422 },
    );
  }

  // The size the user confirmed is the size that gets placed. A re-derived size
  // that has *grown* changes nothing — the agreed quantity stands, because more
  // risk than was confirmed is not what was confirmed. One that has shrunk is
  // refused rather than quietly placed smaller, and the user re-taps a card that
  // says the truth.
  if (sized.qty < rec.qty) {
    return NextResponse.json(
      {
        error:
          "Your account can no longer support the size this recommendation was written for. Refresh for a correctly sized one — nothing was placed.",
        code: "resize_required",
      },
      { status: 409 },
    );
  }

  // ---- Claim the recommendation before placing anything.
  //
  // Every check above is a read, so two taps arriving together — a double tap,
  // a second tab, a retried request — would both pass them and both place an
  // order. The claim is a conditional write: `status = 'shown'` is the guard, so
  // exactly one request can flip it, and the loser is told the recommendation is
  // already resolved instead of buying the position twice. Same shape as the
  // `attach_claimed_at` claim in migration 0009, and for the same reason.
  //
  // It is claimed as `executed` rather than an interim state so that a crash
  // between here and the order leaves it resolved rather than tappable. The
  // failure path below puts it back.
  const claimedAt = new Date().toISOString();
  const { data: claimed } = await supabase
    .from("guided_recommendations")
    .update({ status: "executed", resolved_at: claimedAt })
    .eq("id", rec.id)
    .eq("user_id", user.id)
    .eq("status", "shown")
    .select("id");

  if (!claimed || claimed.length === 0) {
    return NextResponse.json(
      { error: "This recommendation was already acted on. Refresh for the current list.", code: "already_resolved" },
      { status: 409 },
    );
  }

  const placed = await placeSimulatedOrder(supabase, user.id, {
    symbol: rec.symbol,
    assetClass: "equity",
    side,
    qty: rec.qty,
    // At the protocol's entry price, exactly as the "Protocol Recommended" path
    // does from the ticket — never a market order at whatever is on the screen.
    entryMode: "advised",
    limitPrice: agreed.entry,
    referencePrice: fresh.currentPrice,
    attachLevels: {
      stopLoss: agreed.stopLoss,
      takeProfit: agreed.takeProfit1,
      masterProfit: agreed.masterProfit,
    },
    mode: "paper",
  });

  if (placed.status >= 400) {
    // The claim was optimistic and no order exists, so it is released back to
    // `shown` — a refused order the user can fix (a bad tick, a transient feed
    // failure) should not cost them the recommendation. The expiry still bounds
    // how long that second chance lasts.
    await supabase
      .from("guided_recommendations")
      .update({
        status: "shown",
        resolved_at: null,
        resolution_note: `Order refused at ${claimedAt}: ${String((placed.body as { error?: string }).error ?? "unknown error")}`,
      })
      .eq("id", rec.id)
      .eq("user_id", user.id)
      .eq("status", "executed");
    return NextResponse.json(placed.body, { status: placed.status });
  }

  // Already claimed as executed above; this attaches the order it produced.
  await supabase
    .from("guided_recommendations")
    .update({ order_id: placed.orderId ?? null })
    .eq("id", rec.id)
    .eq("user_id", user.id);

  return NextResponse.json({
    ...placed.body,
    // Where the user goes next is Portfolio, with the position and its real
    // bracket levels — not back to a "recommend the next trade" screen.
    next: "/portfolio",
  });
}

async function resolve(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  status: "expired" | "dismissed",
  note: string | null,
): Promise<void> {
  await supabase
    .from("guided_recommendations")
    .update({ status, resolved_at: new Date().toISOString(), resolution_note: note })
    .eq("id", id);
}
