/**
 * GSPS — /api/price-alerts
 * GET:  every custom price alert for the signed-in user (optionally scoped
 *       to one symbol via ?symbol=), newest first.
 * POST: create a durable, cross-device price alert. Enforces
 *       lib/entitlements/policy.ts's maxCustomAlertRules — previously a
 *       reserved limit with nothing behind it to enforce.
 *
 * See supabase/migrations/0077_custom_price_alerts.sql and
 * app/api/price-alerts/sweep/route.ts (the delivery half).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { quotePrice, assetClassOf } from "@/lib/brokers/simulator";

const CreateAlertSchema = z.object({
  symbol: z.string().min(1).max(20),
  targetPrice: z.number().positive(),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const symbol = req.nextUrl.searchParams.get("symbol");

  try {
    let query = supabase
      .from("custom_price_alerts")
      .select("*")
      .order("created_at", { ascending: false });
    if (symbol) query = query.eq("symbol", symbol.toUpperCase());

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ alerts: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * DELETE ?symbol=X: remove this user's untriggered alert(s) for a symbol.
 * The chart's alert toggle only knows the symbol, not an alert id (it
 * doesn't track one) — this is the counterpart that lets it clear without
 * a round trip to look the id up first.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol query param required" }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from("custom_price_alerts")
      .delete()
      .eq("symbol", symbol.toUpperCase())
      .eq("triggered", false);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = CreateAlertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid price alert" }, { status: 400 });
  }
  const { targetPrice } = parsed.data;
  const symbol = parsed.data.symbol.toUpperCase();

  try {
    const policy = await getUserEntitlementPolicy(supabase, user.id);
    if (policy.maxCustomAlertRules !== "unlimited") {
      const { count, error: countError } = await supabase
        .from("custom_price_alerts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("triggered", false);
      if (countError) throw countError;
      if ((count ?? 0) >= policy.maxCustomAlertRules) {
        return NextResponse.json(
          {
            error: `You've reached your plan's limit of ${policy.maxCustomAlertRules} active price alerts.`,
            code: "alert_limit_reached",
          },
          { status: 403 },
        );
      }
    }

    const currentPrice = await quotePrice(symbol, assetClassOf(symbol));
    // Direction resolved once, from the price right now — see the
    // migration's header for why this is stable rather than re-derived at
    // sweep time. A symbol with no readable quote right now (provider
    // outage, an unrecognized symbol) can't have a crossing direction
    // established, so the alert is refused rather than guessed.
    if (currentPrice == null) {
      return NextResponse.json(
        { error: `Couldn't read a current price for ${symbol} to set the alert direction.` },
        { status: 502 },
      );
    }
    const direction = targetPrice >= currentPrice ? "above" : "below";

    // At most one active alert per symbol, matching the chart's own UX (one
    // draggable line per symbol) — replace rather than stack a second row
    // when the price is moved.
    const { error: replaceError } = await supabase
      .from("custom_price_alerts")
      .delete()
      .eq("user_id", user.id)
      .eq("symbol", symbol)
      .eq("triggered", false);
    if (replaceError) throw replaceError;

    const { data, error } = await supabase
      .from("custom_price_alerts")
      .insert({ user_id: user.id, symbol, target_price: targetPrice, direction })
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, alert: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
