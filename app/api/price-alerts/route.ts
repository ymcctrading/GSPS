/**
 * GSPS — /api/price-alerts
 * GET:  every custom price alert for the signed-in user (optionally scoped
 *       to one symbol via ?symbol=), newest first.
 * POST: create a durable, cross-device alert. Two bodies:
 *       - the chart line's `{ symbol, targetPrice }`: a Last alert whose side
 *         is read from the price now, one per symbol (moving the line replaces
 *         it), `origin` "chart";
 *       - the alert editor's `{ symbol, field, comparator, threshold, ... }`
 *         (`lib/alerts/rules.ts#EditorAlertSchema`), `origin` "editor", any
 *         number per symbol up to the plan's limit.
 *       Both count against lib/entitlements/policy.ts's maxCustomAlertRules.
 * DELETE ?symbol=X: remove the chart line's untriggered alert for a symbol.
 *
 * See supabase/migrations/0077_custom_price_alerts.sql, 0103_price_alert_editor.sql
 * and app/api/price-alerts/sweep/route.ts (the delivery half).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { quotePrice, assetClassOf } from "@/lib/brokers/simulator";
import { EditorAlertSchema, dayExpiry, directionOf, roundThreshold, thresholdProblem } from "@/lib/alerts/rules";
import { nextClose } from "@/lib/market/session";

const ChartAlertSchema = z.object({
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
 * DELETE ?symbol=X: remove this user's untriggered chart-line alert for a
 * symbol. The chart's alert toggle only knows the symbol, not an alert id (it
 * doesn't track one) — this is the counterpart that lets it clear without
 * a round trip to look the id up first. The editor's alerts are removed one
 * by one through /api/price-alerts/[id].
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
      .eq("origin", "chart")
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

  const body = await req.json().catch(() => null);
  const isEditor = body != null && typeof body === "object" && "field" in body;
  const editor = isEditor ? EditorAlertSchema.safeParse(body) : null;
  const chart = isEditor ? null : ChartAlertSchema.safeParse(body);
  if ((editor && !editor.success) || (chart && !chart.success)) {
    return NextResponse.json({ error: "Invalid price alert" }, { status: 400 });
  }
  const symbol = (editor?.data?.symbol ?? chart?.data?.symbol ?? "").toUpperCase();

  if (editor?.data) {
    const problem = thresholdProblem(editor.data.field, editor.data.threshold);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  try {
    const policy = await getUserEntitlementPolicy(supabase, user.id);
    if (policy.maxCustomAlertRules !== "unlimited") {
      // A day alert past its close is gone in effect, even before the sweep removes it.
      const { count: open, error: countError } = await supabase
        .from("custom_price_alerts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("triggered", false)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
      if (countError) throw countError;
      // Moving the chart line replaces its own row, so that row doesn't count.
      let replaced = 0;
      if (chart) {
        const { count: own, error: ownError } = await supabase
          .from("custom_price_alerts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("symbol", symbol)
          .eq("origin", "chart")
          .eq("triggered", false);
        if (ownError) throw ownError;
        replaced = own ?? 0;
      }
      const count = (open ?? 0) - replaced;
      if (count >= policy.maxCustomAlertRules) {
        return NextResponse.json(
          {
            error: `You've reached your plan's limit of ${policy.maxCustomAlertRules} active price alerts.`,
            code: "alert_limit_reached",
          },
          { status: 403 },
        );
      }
    }

    if (editor?.data) {
      const d = editor.data;
      // Only a symbol the feed can price is stored: an unknown one would only
      // sit in every sweep's request.
      if ((await quotePrice(symbol, assetClassOf(symbol))) == null) {
        return NextResponse.json({ error: `Couldn't read a price for ${symbol}.` }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("custom_price_alerts")
        .insert({
          user_id: user.id,
          symbol,
          field: d.field,
          comparator: d.comparator,
          direction: directionOf(d.comparator),
          target_price: roundThreshold(d.field, d.threshold),
          origin: "editor",
          level_source: d.levelSource || null,
          note: d.note || null,
          expires_at: d.expiry === "day" ? dayExpiry(d.field, nextClose(new Date())).toISOString() : null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, alert: data });
    }

    const targetPrice = chart!.data!.targetPrice;
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

    // At most one active chart-line alert per symbol, matching the chart's
    // own UX (one draggable line per symbol) — replace rather than stack a
    // second row when the line is moved. The editor's alerts are untouched.
    const { error: replaceError } = await supabase
      .from("custom_price_alerts")
      .delete()
      .eq("user_id", user.id)
      .eq("symbol", symbol)
      .eq("origin", "chart")
      .eq("triggered", false);
    if (replaceError) throw replaceError;

    const { data, error } = await supabase
      .from("custom_price_alerts")
      .insert({
        user_id: user.id,
        symbol,
        target_price: targetPrice,
        direction,
        field: "last",
        comparator: direction === "above" ? ">=" : "<=",
        origin: "chart",
      })
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
