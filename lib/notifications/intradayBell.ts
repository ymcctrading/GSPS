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
 * the scanner's cooldown are never in `alerts`, and a member gets one notice a
 * move: a signal is written again on the same New York day only once the same
 * symbol's same signal has turned the other way since (`isNewMove`). Gann acts
 * on the first change in trend (Master Course Ch. 13), not on a standing one.
 * Until 2026-10-28 it was written again whenever the scanner's 30-minute
 * cooldown had passed, so a signal standing all session reached each member
 * about every 45 minutes: 4,515 notices for 1,115 member-signal pairs on
 * 2026-10-26. A notice nearing or at a plan's entry is written again once
 * `NOTICE_REPEAT_HOURS` have passed.
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
import { SIGNAL_LABELS, tradeHold } from "@/lib/scanner/intradayDisplay";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { DEFAULT_PRO_INTRADAY_POLICY } from "@/lib/promotion/config";
import { isConfirmedIntradayEntry } from "@/lib/promotion/pro-intraday";
import { etDateKey } from "@/lib/market/session";
import { NOTICE_SIGNALS } from "@/lib/scanner/intradayDisplay";
import { APPROACH_LEAD_DEFAULT_MINUTES, approachDue } from "@/lib/scanner/entryApproach";

/** A notice is written once in this many hours a member, not once a cooldown. */
const NOTICE_REPEAT_HOURS = 12;

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
  if (NOTICE_SIGNALS.has(alert.type)) {
    const entry = plan.entry ?? alert.move.current;
    const eta = alert.approach ? Math.round(alert.approach.etaMinutes) : null;
    const when =
      alert.type === "entry_reached"
        ? "Price is at the entry now"
        : eta != null && eta > 0
          ? `About ${eta} minute${eta === 1 ? "" : "s"} away at the current pace`
          : "It may be there already";
    const parts = [`entry ${price(entry)}`];
    if (alert.invalidation != null) parts.push(`stop ${price(alert.invalidation)}`);
    if (plan.firstTarget != null) parts.push(`TP1 ${price(plan.firstTarget)}`);
    if (plan.masterTarget != null) parts.push(`MTP ${price(plan.masterTarget)}`);
    return {
      symbol: alert.symbol,
      verdict: "Intraday",
      title: `${alert.symbol} ${side === "up" ? "buy" : "sell"}: ${SIGNAL_LABELS[alert.type]}`,
      body: `${when} (price ${price(alert.move.current)}). Daily plan: ${parts.join(", ")}. Open the plan to be ready: once a bar closes at the entry, its entry goes at the market. The pace can change.`,
    };
  }
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

/** The symbol and signal of a bell title, without its direction. */
export function moveKey(title: string): string {
  return title.replace(/ intraday, (up|down): /, " intraday: ");
}

/** The latest title written for each symbol and signal. */
export function latestTitleByMove(rows: { title: string; created_at: string }[]): Map<string, string> {
  const latest = new Map<string, { title: string; at: string }>();
  for (const r of rows) {
    const key = moveKey(r.title);
    const prev = latest.get(key);
    if (!prev || r.created_at > prev.at) latest.set(key, { title: r.title, at: r.created_at });
  }
  return new Map([...latest].map(([k, v]) => [k, v.title]));
}

/**
 * A notice is a new move when nothing was written today for its symbol and
 * signal, or the last one written went the other way.
 */
export function isNewMove(title: string, latest: Map<string, string>): boolean {
  return latest.get(moveKey(title)) !== title;
}

/**
 * Which alerts a member's tier lets through: all of them with full intraday
 * access, Pro's confirmed entries only, none without intraday. A signal held
 * from trading (`tradeHold`: measured losing, or against the daily trend)
 * reaches no one's bell or push; it stays on the panel, labelled.
 */
export function alertsForTier(
  alerts: Alert[],
  access: { intradayScansEnabled: boolean; proIntradayModuleEnabled: boolean },
  intervalBySymbol: Map<string, number>,
): Alert[] {
  alerts = alerts.filter((a) => !tradeHold(a));
  if (access.intradayScansEnabled) return alerts;
  if (!access.proIntradayModuleEnabled) return [];
  // A notice is not a setup, so the module's bar-length bound does not apply
  // to it, as on the panel.
  return alerts.filter(
    (a) =>
      NOTICE_SIGNALS.has(a.type) ||
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

/** True for a notice's bell title (nearing or at a plan's entry), which counts against no bound. */
export function isNoticeTitle(title: string): boolean {
  return [...NOTICE_SIGNALS].some((type) => title.endsWith(`: ${SIGNAL_LABELS[type]}`));
}

/** The rows a Pro member may still be told about today, by symbol. Notices take none of the bound. */
async function withinProDailyBound(
  service: SupabaseClient,
  profileId: string,
  rows: IntradayBellRow[],
  now: Date,
): Promise<IntradayBellRow[]> {
  const today = etDateKey(now);
  const { data } = await service
    .from("in_app_notifications")
    .select("symbol, title, created_at")
    .eq("profile_id", profileId)
    .eq("verdict", "Intraday")
    .gte("created_at", new Date(now.getTime() - 30 * 3600_000).toISOString());
  const shown = new Set(
    ((data ?? []) as { symbol: string; title?: string; created_at: string }[])
      .filter((r) => etDateKey(new Date(r.created_at)) === today && !isNoticeTitle(r.title ?? ""))
      .map((r) => r.symbol.toUpperCase()),
  );
  const max = DEFAULT_PRO_INTRADAY_POLICY.setupsDisplayedPerDayMax;
  return rows.filter((r) => {
    if (isNoticeTitle(r.title)) return true;
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
  args: { intervalBySymbol: Map<string, number>; now: Date },
): Promise<number> {
  if (alerts.length === 0) return 0;
  const symbols = [...new Set(alerts.map((a) => a.symbol.toUpperCase()))];
  const watchers = await loadWatchers(service, symbols);
  if (watchers.size === 0) return 0;

  // Wide enough to hold the whole New York day; rows are filtered to it below.
  const since = new Date(args.now.getTime() - 30 * 3600_000).toISOString();
  const noticeSince = Date.parse(new Date(args.now.getTime() - NOTICE_REPEAT_HOURS * 3600_000).toISOString());
  let written = 0;
  for (const [profileId, watched] of watchers) {
    try {
      const policy = await getUserEntitlementPolicy(service, profileId);
      // The bell reads no per-member lead: a heads-up is written once it is
      // within the default lead plus one scan.
      const mine = alertsForTier(
        alerts.filter(
          (a) =>
            watched.has(a.symbol.toUpperCase()) &&
            (a.type !== "entry_approach" || (a.approach != null && approachDue(a.approach.etaMinutes, APPROACH_LEAD_DEFAULT_MINUTES))),
        ),
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
      const { data: recent, error: readError } = await service
        .from("in_app_notifications")
        .select("title, created_at")
        .eq("profile_id", profileId)
        .eq("verdict", "Intraday")
        .gte("created_at", since)
        .in("symbol", [...new Set(rows.map((r) => r.symbol))]);
      if (readError) {
        // Unread history would repeat every standing signal; skip the member.
        console.error("[intraday-bell] history read failed:", readError.message);
        continue;
      }
      const history = (recent ?? []) as { title: string; created_at: string }[];
      // A notice (nearing or at a plan's entry) repeats at most once in
      // `NOTICE_REPEAT_HOURS`; a signal, once a move over the New York day.
      const noticesSeen = new Set(
        history.filter((r) => isNoticeTitle(r.title) && Date.parse(r.created_at) >= noticeSince).map((r) => r.title),
      );
      const today = etDateKey(args.now);
      const latest = latestTitleByMove(
        history.filter((r) => !isNoticeTitle(r.title) && etDateKey(new Date(r.created_at)) === today),
      );
      const fresh = rows.filter(
        (r, i) =>
          (isNoticeTitle(r.title) ? !noticesSeen.has(r.title) : isNewMove(r.title, latest)) &&
          rows.findIndex((x) => x.title === r.title) === i,
      );
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
