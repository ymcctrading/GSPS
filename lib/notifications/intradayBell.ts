/**
 * GSPS — bell notices for new intraday signals (owner decision, 2026-10-21:
 * "Yes, build and apply it").
 *
 * Email to members is held by the sandbox sender until a domain is verified,
 * and the fast moves the owner most wants to catch can't wait on an inbox. So
 * every new signal from the scheduled intraday scan also goes in the bell
 * (`in_app_notifications`, verdict 'Intraday', migration 0100) for each member
 * who watches the symbol: on one of their watchlists, or tracked by an open
 * WATCH/EXECUTE monitor. A member's tier decides what reaches them, as it does
 * on the panel: no intraday access, nothing; Pro's bounded module, only the
 * confirmed entries it shows (`isConfirmedIntradayEntry`). Held repeats inside
 * the scanner's cooldown are never in `alerts`, and a notice already written
 * for the same symbol, signal and direction inside the cooldown is not written
 * again, so a member gets one notice a move.
 *
 * The notice says what Gann's method uses an intraday signal for: timing a
 * daily plan (Master Course Ch. 13), not a system of its own. The intraday
 * profile has no measured record yet (2026-10-21 replay), and the notice says
 * so rather than reading as a trade call.
 *
 * Mandate: Gann sourcing as above. No periodicity claim (Dewey N/A). Cause and
 * Effect: the market's move is the cause and the notice its effect, written
 * only when the scheduled scan, not a member's own look, saw it. Law of
 * Creation: watchlist ⊗ live scan; neither alone tells a member a move is
 * happening on a name they care about.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Alert } from "@/lib/scanner/intraday";
import { MEASURED_LOSING, SIGNAL_LABELS } from "@/lib/scanner/intradayDisplay";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { DEFAULT_PRO_INTRADAY_POLICY } from "@/lib/promotion/config";
import { isConfirmedIntradayEntry } from "@/lib/promotion/pro-intraday";
import { etDateKey } from "@/lib/market/session";

export interface IntradayBellRow {
  symbol: string;
  verdict: "Intraday";
  title: string;
  body: string;
}

function price(value: number): string {
  return value >= 1 ? value.toFixed(2) : value.toPrecision(4);
}

/** The bell's title and body for one intraday signal. */
export function buildIntradayBellRow(alert: Alert): IntradayBellRow {
  const side = alert.direction === "up" ? "up" : "down";
  const plan = alert.continuationPlan;
  const levels: string[] = [`Price ${price(alert.move.current)}`];
  if (alert.invalidation != null) levels.push(`stop ${price(alert.invalidation)}`);
  levels.push(plan.firstTarget != null ? `TP1 ${price(plan.firstTarget)}` : "no target fixed, the stop trails");
  if (plan.masterTarget != null) levels.push(`MTP ${price(plan.masterTarget)}`);
  const noTrade =
    plan.paysRisk === false ? " No trade here: the first target does not pay more than the risk." : "";
  return {
    symbol: alert.symbol,
    verdict: "Intraday",
    title: `${alert.symbol} intraday, ${side}: ${SIGNAL_LABELS[alert.type]}`,
    body: `${levels.join(", ")}.${noTrade} Timing for a daily plan; intraday signals have no measured record yet.`,
  };
}

/**
 * Which alerts a member's tier lets through: all of them with full intraday
 * access, Pro's confirmed entries only, none without intraday. A signal the
 * replay measured losing (`MEASURED_LOSING`) reaches no one's bell, email or
 * push; it stays on the panel, labelled.
 */
export function alertsForTier(
  alerts: Alert[],
  access: { intradayScansEnabled: boolean; proIntradayModuleEnabled: boolean },
  intervalBySymbol: Map<string, number>,
): Alert[] {
  alerts = alerts.filter((a) => !MEASURED_LOSING[a.type]);
  if (access.intradayScansEnabled) return alerts;
  if (!access.proIntradayModuleEnabled) return [];
  return alerts.filter((a) =>
    isConfirmedIntradayEntry(intervalBySymbol.get(a.symbol) ?? 1, true, DEFAULT_PRO_INTRADAY_POLICY),
  );
}

/** Members watching each symbol: watchlist items and open monitors. */
async function loadWatchers(service: SupabaseClient, symbols: string[]): Promise<Map<string, Set<string>>> {
  const watchers = new Map<string, Set<string>>();
  const add = (profile: string, symbol: string) => {
    const set = watchers.get(profile) ?? new Set<string>();
    set.add(symbol.toUpperCase());
    watchers.set(profile, set);
  };

  const [items, monitors] = await Promise.all([
    service.from("watchlist_items").select("symbol, watchlists!inner(user_id)").in("symbol", symbols),
    service
      .from("active_monitors")
      .select("profile_id, symbol")
      .in("symbol", symbols)
      .in("state", ["WATCH", "EXECUTE"]),
  ]);
  if (items.error) console.error("[intraday-bell] watchlist read failed:", items.error.message);
  if (monitors.error) console.error("[intraday-bell] monitor read failed:", monitors.error.message);

  for (const row of (items.data ?? []) as unknown as { symbol: string; watchlists: { user_id: string } | { user_id: string }[] }[]) {
    const owners = Array.isArray(row.watchlists) ? row.watchlists : [row.watchlists];
    for (const o of owners) if (o?.user_id) add(o.user_id, row.symbol);
  }
  for (const row of (monitors.data ?? []) as { profile_id: string; symbol: string }[]) add(row.profile_id, row.symbol);
  return watchers;
}

/** The rows a Pro member may still be told about today, by symbol. */
async function withinProDailyBound(
  service: SupabaseClient,
  profileId: string,
  rows: IntradayBellRow[],
  now: Date,
): Promise<IntradayBellRow[]> {
  const today = etDateKey(now);
  const { data } = await service
    .from("in_app_notifications")
    .select("symbol, created_at")
    .eq("profile_id", profileId)
    .eq("verdict", "Intraday")
    .gte("created_at", new Date(now.getTime() - 30 * 3600_000).toISOString());
  const shown = new Set(
    ((data ?? []) as { symbol: string; created_at: string }[])
      .filter((r) => etDateKey(new Date(r.created_at)) === today)
      .map((r) => r.symbol.toUpperCase()),
  );
  const max = DEFAULT_PRO_INTRADAY_POLICY.setupsDisplayedPerDayMax;
  return rows.filter((r) => {
    const symbol = r.symbol.toUpperCase();
    if (shown.has(symbol)) return true;
    if (shown.size >= max) return false;
    shown.add(symbol);
    return true;
  });
}

/**
 * Writes a bell notice for each new alert to every member watching its
 * symbol. Best-effort: a failure is logged, never thrown into the scan.
 * Returns how many notices were written.
 */
export async function recordIntradayBells(
  service: SupabaseClient,
  alerts: Alert[],
  args: { intervalBySymbol: Map<string, number>; cooldownMinutes: number; now: Date },
): Promise<number> {
  if (alerts.length === 0) return 0;
  const symbols = [...new Set(alerts.map((a) => a.symbol.toUpperCase()))];
  const watchers = await loadWatchers(service, symbols);
  if (watchers.size === 0) return 0;

  const since = new Date(args.now.getTime() - args.cooldownMinutes * 60_000).toISOString();
  let written = 0;
  for (const [profileId, watched] of watchers) {
    try {
      const policy = await getUserEntitlementPolicy(service, profileId);
      const mine = alertsForTier(
        alerts.filter((a) => watched.has(a.symbol.toUpperCase())),
        policy,
        args.intervalBySymbol,
      );
      if (mine.length === 0) continue;

      let rows = mine.map(buildIntradayBellRow);
      // Pro's module shows a bounded number of setups a day
      // (`setupsDisplayedPerDayMax`); its notices keep to the same bound,
      // counted by symbol over the New York day (review, 2026-10-21).
      if (!policy.intradayScansEnabled) {
        rows = await withinProDailyBound(service, profileId, rows, args.now);
        if (rows.length === 0) continue;
      }
      const { data: recent } = await service
        .from("in_app_notifications")
        .select("title")
        .eq("profile_id", profileId)
        .eq("verdict", "Intraday")
        .gte("created_at", since)
        .in("title", rows.map((r) => r.title));
      const seen = new Set(((recent ?? []) as { title: string }[]).map((r) => r.title));
      const fresh = rows.filter((r, i) => !seen.has(r.title) && rows.findIndex((x) => x.title === r.title) === i);
      if (fresh.length === 0) continue;

      const { error } = await service
        .from("in_app_notifications")
        .insert(fresh.map((r) => ({ profile_id: profileId, transition_id: null, ...r })));
      if (error) {
        console.error("[intraday-bell] insert failed:", error.message);
        continue;
      }
      written += fresh.length;
    } catch (err) {
      console.error("[intraday-bell] member skipped:", err);
    }
  }
  return written;
}
