/**
 * GSPS — /api/price-alerts/sweep
 *
 * The delivery half of durable custom price alerts (migration 0077,
 * app/api/price-alerts/route.ts). A price alert created on the chart is
 * only useful cross-device/tab-closed if something checks it without the
 * browser open — this is that check.
 *
 * One live price fetch per distinct alerted symbol (never a full scan),
 * same shape as app/api/monitors/invalidation-sweep/route.ts. An alert
 * triggers when its `direction` (resolved once at creation — see the
 * migration's header) is confirmed by the current price: "above" fires at
 * price >= target, "below" fires at price <= target. A triggered alert is
 * marked `triggered = true` and emailed once; it never re-fires.
 *
 * Same bearer-secret auth pattern as every other cron-invoked route here.
 * No trading-day gate, unlike the invalidation sweep — crypto trades every
 * day, and an equity alert simply won't cross while its market is shut, so
 * a run outside trading hours is cheap and safe, not wasted (same reasoning
 * app/api/market-scan/route.ts's cron already documents for itself).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { sendPriceAlertEmail } from "@/lib/notifications/resend-handler";
import { isPriceAlertFired } from "@/lib/trade/price-alert";

export const maxDuration = 60;

function isAuthorized(authorizationHeader: string | null): boolean {
  return Boolean(process.env.CRON_SECRET) && authorizationHeader === `Bearer ${process.env.CRON_SECRET}`;
}

interface AlertRow {
  id: string;
  user_id: string;
  symbol: string;
  target_price: number;
  direction: "above" | "below";
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const index = i++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("price-alerts/sweep: CRON_SECRET is not set — the sweep cannot run");
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  }
  if (!isAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: alerts, error: alertsError } = await service
    .from("custom_price_alerts")
    .select("id, user_id, symbol, target_price, direction")
    .eq("triggered", false);
  if (alertsError || !alerts) {
    console.error(`price-alerts/sweep: could not list open alerts — ${alertsError?.message}`);
    return NextResponse.json({ error: "Could not list open alerts" }, { status: 503 });
  }
  const openAlerts = alerts as AlertRow[];
  if (openAlerts.length === 0) {
    return NextResponse.json({ checked: 0, triggered: 0 });
  }

  const symbols = [...new Set(openAlerts.map((a) => a.symbol))];
  const provider = getMarketDataProvider();
  const priceBySymbol = new Map<string, number | null>();
  await mapWithConcurrency(symbols, 6, async (symbol) => {
    try {
      const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
      priceBySymbol.set(symbol, await provider.fetchLatestPrice(symbol, assetClass));
    } catch {
      priceBySymbol.set(symbol, null);
    }
  });

  // One auth.users lookup for the whole run — sending an alert email needs a
  // real address, which isn't on any table RLS already lets this route read.
  // Paginated the same way app/api/trade-journal/daily-email/route.ts
  // already does, rather than assuming every user fits on one page.
  const emailByUserId = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data: userPage, error: userListError } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (userListError) {
      console.error(`price-alerts/sweep: could not list users for email lookup — ${userListError.message}`);
      break;
    }
    for (const u of userPage.users) if (u.email) emailByUserId.set(u.id, u.email);
    if (userPage.users.length < 200) break;
  }

  let triggeredCount = 0;
  for (const alert of openAlerts) {
    const price = priceBySymbol.get(alert.symbol);
    if (price == null || !Number.isFinite(price)) continue;

    if (!isPriceAlertFired(alert.direction, alert.target_price, price)) continue;

    const now = new Date().toISOString();
    const { error: updateError } = await service
      .from("custom_price_alerts")
      .update({ triggered: true, triggered_at: now })
      .eq("id", alert.id)
      .eq("triggered", false); // last-writer-wins guard against a concurrent sweep run
    if (updateError) {
      console.error(`price-alerts/sweep: could not mark alert ${alert.id} triggered — ${updateError.message}`);
      continue;
    }
    triggeredCount += 1;

    const userEmail = emailByUserId.get(alert.user_id);
    if (!userEmail) continue;
    try {
      await sendPriceAlertEmail({
        userEmail,
        symbol: alert.symbol,
        targetPrice: alert.target_price,
        direction: alert.direction,
        currentPrice: price,
      });
    } catch (err) {
      console.error(`price-alerts/sweep: email not sent for alert ${alert.id} — ${String(err)}`);
    }
  }

  return NextResponse.json({ checked: openAlerts.length, triggered: triggeredCount });
}
