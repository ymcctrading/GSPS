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
 * triggers when the field it watches (last, bid, ask, mark, the completed
 * close, net or % change, the day's high or low, volume; migration 0103,
 * `lib/alerts/rules.ts`) compares to its threshold as set. The chart line's
 * rows are Last >= or <= their price, the side resolved once at creation. A
 * triggered alert is marked `triggered = true` with the value it read, put on
 * the member's bell, pushed and emailed once; it never re-fires. A "day"
 * alert still waiting at the close it was set for is removed.
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
import { syntheticDataRefusal } from "@/lib/data/feed-mode";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { sendPriceAlertEmail } from "@/lib/notifications/resend-handler";
import {
  FIELD_LABELS,
  comparatorOf,
  describeAlertRule,
  formatThreshold,
  isAlertRuleFired,
  readAlertField,
  type AlertComparator,
  type AlertField,
  type AlertQuote,
} from "@/lib/alerts/rules";
import type { AssetClass } from "@/lib/types";
import { priceAlertPushMessage, sendPushToProfile } from "@/lib/notifications/web-push";
import { isCronAuthorized } from "@/lib/cron-auth";
import { inQuietHours } from "@/lib/entitlements/delivery";

export const maxDuration = 60;

function isAuthorized(authorizationHeader: string | null): boolean {
  return isCronAuthorized(authorizationHeader);
}

interface AlertRow {
  id: string;
  user_id: string;
  symbol: string;
  target_price: number;
  direction: "above" | "below";
  field: AlertField;
  comparator: AlertComparator | null;
  origin: "chart" | "editor";
  level_source: string | null;
  note: string | null;
  expires_at: string | null;
}

/** A snapshot holding only the last trade, for a provider without alert quotes. */
function lastOnly(price: number | null): AlertQuote {
  return { last: price, bid: null, ask: null, dayHigh: null, dayLow: null, dayVolume: null, completedClose: null, changeFrom: null };
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

  const now = new Date();
  // A "day" alert lasts until the close it was set for.
  const { error: expireError } = await service
    .from("custom_price_alerts")
    .delete()
    .eq("triggered", false)
    .lt("expires_at", now.toISOString());
  if (expireError) console.error(`price-alerts/sweep: expired alerts not removed — ${expireError.message}`);

  const { data: alerts, error: alertsError } = await service
    .from("custom_price_alerts")
    .select("id, user_id, symbol, target_price, direction, field, comparator, origin, level_source, note, expires_at")
    .eq("triggered", false);
  if (alertsError || !alerts) {
    console.error(`price-alerts/sweep: could not list open alerts — ${alertsError?.message}`);
    return NextResponse.json({ error: "Could not list open alerts" }, { status: 503 });
  }
  const openAlerts = (alerts as AlertRow[]).filter((a) => !a.expires_at || new Date(a.expires_at) > now);
  if (openAlerts.length === 0) {
    return NextResponse.json({ checked: 0, triggered: 0 });
  }

  const symbols = [...new Set(openAlerts.map((a) => a.symbol))];
  const provider = getMarketDataProvider();
  const refused = syntheticDataRefusal("check price alerts", provider);
  if (refused) return NextResponse.json({ error: refused, code: "synthetic_market_data" }, { status: 503 });
  const quoteBySymbol = new Map<string, AlertQuote>();
  const byClass = new Map<AssetClass, string[]>();
  for (const symbol of symbols) {
    const assetClass: AssetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
    byClass.set(assetClass, [...(byClass.get(assetClass) ?? []), symbol]);
  }
  for (const [assetClass, group] of byClass) {
    if (provider.fetchAlertQuotes) {
      try {
        for (const [symbol, quote] of await provider.fetchAlertQuotes(group, assetClass, now)) quoteBySymbol.set(symbol, quote);
        continue;
      } catch (err) {
        console.error(`price-alerts/sweep: alert quotes not read, last trade only — ${String(err)}`);
      }
    }
    await mapWithConcurrency(group, 6, async (symbol) => {
      try {
        quoteBySymbol.set(symbol, lastOnly(await provider.fetchLatestPrice(symbol, assetClass)));
      } catch {
        /* no reading: the alert waits for the next sweep */
      }
    });
  }

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

  // Browser push goes only to members who turned it on (lib/notifications/web-push.ts).
  const pushUserIds = new Set<string>();
  const alertUserIds = [...new Set(openAlerts.map((a) => a.user_id))];
  if (alertUserIds.length > 0) {
    const { data: pushPrefs, error: pushPrefError } = await service
      .from("notification_preferences")
      .select("user_id")
      .eq("push_enabled", true)
      .in("user_id", alertUserIds);
    if (pushPrefError) console.error(`price-alerts/sweep: push preferences not read — ${pushPrefError.message}`);
    for (const row of (pushPrefs ?? []) as { user_id: string }[]) pushUserIds.add(row.user_id);
  }

  let triggeredCount = 0;
  for (const alert of openAlerts) {
    const quote = quoteBySymbol.get(alert.symbol);
    if (!quote) continue;
    const comparator = comparatorOf(alert);
    const field: AlertField = alert.field ?? "last";
    const threshold = Number(alert.target_price);
    if (!isAlertRuleFired({ field, comparator, threshold }, quote)) continue;
    const value = readAlertField(field, quote)!;

    const firedAt = new Date().toISOString();
    const { data: marked, error: updateError } = await service
      .from("custom_price_alerts")
      .update({ triggered: true, triggered_at: firedAt, triggered_value: value })
      .eq("id", alert.id)
      .eq("triggered", false) // a concurrent sweep run marks it once
      .select("id");
    if (updateError) {
      console.error(`price-alerts/sweep: could not mark alert ${alert.id} triggered — ${updateError.message}`);
      continue;
    }
    if (!marked || marked.length === 0) continue;
    triggeredCount += 1;

    const editorRule =
      alert.origin === "editor"
        ? {
            condition: describeAlertRule({ symbol: alert.symbol, field, comparator, threshold }),
            reading: `${FIELD_LABELS[field]} ${formatThreshold(field, value)}`,
            note: alert.note,
            source: alert.level_source,
          }
        : undefined;
    const price = quote.last ?? value;

    // The bell is written whatever the member's channels or quiet hours: it
    // has no send cost (migration 0067), and it is where a fired alert stays.
    const { error: bellError } = await service.from("in_app_notifications").insert({
      profile_id: alert.user_id,
      symbol: alert.symbol,
      verdict: "Price alert",
      title: editorRule ? `Alert: ${editorRule.condition}` : `${alert.symbol} ${alert.direction === "above" ? "rose above" : "fell below"} ${formatThreshold("last", threshold)}`,
      body: editorRule
        ? [`Read at the check: ${editorRule.reading}`, editorRule.source ? `Level: ${editorRule.source}` : null, editorRule.note ? `Note: ${editorRule.note}` : null]
            .filter(Boolean)
            .join(". ") + "."
        : `Last price checked: ${formatThreshold("last", price)}.`,
    });
    if (bellError) console.error(`price-alerts/sweep: bell notice not written for alert ${alert.id} — ${bellError.message}`);

    // Quiet hours hold this send like every other alert's (preferenceHold).
    // The alert still reads triggered on the member's price-alerts list.
    if (await inQuietHours(service, alert.user_id)) continue;

    if (pushUserIds.has(alert.user_id)) {
      const pushed = await sendPushToProfile(
        service,
        alert.user_id,
        priceAlertPushMessage({
          symbol: alert.symbol,
          direction: alert.direction,
          targetPrice: threshold,
          currentPrice: price,
          rule: editorRule,
        }),
      );
      if (!pushed.success && !pushed.skipped) {
        console.error(`price-alerts/sweep: push not sent for alert ${alert.id} — ${pushed.error}`);
      }
    }

    const userEmail = emailByUserId.get(alert.user_id);
    if (!userEmail) continue;
    try {
      await sendPriceAlertEmail({
        userEmail,
        symbol: alert.symbol,
        targetPrice: threshold,
        direction: alert.direction,
        currentPrice: price,
        rule: editorRule,
      });
    } catch (err) {
      console.error(`price-alerts/sweep: email not sent for alert ${alert.id} — ${String(err)}`);
    }
  }

  return NextResponse.json({ checked: openAlerts.length, triggered: triggeredCount });
}
