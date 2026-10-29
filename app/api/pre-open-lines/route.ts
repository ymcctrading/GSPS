/**
 * GSPS — /api/pre-open-lines: before the open, tells members which equity
 * plans' lines the prior close left within reach (`lib/notifications/preOpenLines.ts`).
 *
 * Run by the database's scheduler at 12:50 and 13:50 UTC on weekdays
 * (migration 0135); the route acts only inside 8:30 to 9:30 New York time on
 * a trading day, so one of the two runs falls in the window under daylight
 * time and the other under standard time. Returns rather than drains
 * ("Cycles as architecture"): each morning reads its own prior close, and a
 * missed morning is simply missed.
 *
 * Reads: the standing plans (`loadDailyPlans`: the latest lists, the
 * monitors and the night's sweep, as the intraday scan reads them), the
 * universe's daily bars in batched requests for the prior close, and the
 * latest lists' flags (resting, expired, retired) and scores. Writes the bell
 * for members watching a symbol (watchlist or open monitor) and one push a
 * member, both gated by tier as the session's line notices are, and both
 * deduplicated once a New York day per symbol and side. Never email.
 *
 * `?dry=1` with the cron secret returns the lines without writing or sending;
 * `?force=1` skips the window (for an operator's check, never scheduled).
 */

import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getMarketDataProvider } from "@/lib/data/provider";
import { MARKET_DATA_UNAVAILABLE, syntheticDataRefusal } from "@/lib/data/feed-mode";
import { resolveFeedPolicy, sessionCloseAt } from "@/lib/data/timeliness";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { inQuietHours } from "@/lib/entitlements/delivery";
import { etDateKey } from "@/lib/market/session";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { chooseSweepBasis } from "@/lib/scan/universeSweep";
import { loadDailyPlans } from "@/lib/scanner/dailyPlans";
import { completedDailyBars } from "@/lib/scanner/priorClose";
import type { DailyPlanLevels } from "@/lib/scanner/intraday";
import { checkNotificationFreshness, type NotificationFreshnessResult } from "@/lib/notifications/freshness";
import { sendPushToProfile, vapidConfig } from "@/lib/notifications/web-push";
import {
  inPreOpenWindow,
  preOpenBellRow,
  preOpenEvidence,
  preOpenHash,
  preOpenPushMessage,
  preOpenSessionKey,
  readPreOpenLines,
  type PreOpenLine,
} from "@/lib/notifications/preOpenLines";
import type { Bar } from "@/lib/types";

export const maxDuration = 60;

/** Calendar days of daily bars read: enough to hold the prior session across a long weekend. */
const HISTORY_DAYS = 10;
/** Symbols per plan read, so the request stays a sensible length. */
const PLAN_CHUNK = 200;

type Deliverable = Exclude<NotificationFreshnessResult, { disposition: "suppress" }>;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const params = req.nextUrl.searchParams;
  const dry = params.get("dry") === "1";
  if (params.get("force") !== "1" && !inPreOpenWindow(now)) {
    return NextResponse.json({ skipped: "outside the pre-open window (8:30-9:30 ET on a trading day)" });
  }
  const provider = getMarketDataProvider();
  if (syntheticDataRefusal("send the pre-open line notice", provider)) {
    return NextResponse.json({ error: MARKET_DATA_UNAVAILABLE, code: "synthetic_market_data" }, { status: 503 });
  }
  if (!provider.fetchBarsBatch) {
    return NextResponse.json({ error: "The market data provider has no batched bars." }, { status: 503 });
  }

  const service = createServiceClient();
  // The scan universe's equities only: a watched name outside it has no
  // stored plan from the lists or the sweep, so it has no line to read.
  const universe = LARGE_CAP_UNIVERSE.filter((s) => !s.includes("/"));
  const sweepBasis = await chooseSweepBasis(service, now).catch(() => null);
  const plans = new Map<string, DailyPlanLevels>();
  for (let i = 0; i < universe.length; i += PLAN_CHUNK) {
    const chunk = await loadDailyPlans(service, universe.slice(i, i + PLAN_CHUNK), null, { sweepBasis }).catch(
      () => new Map<string, DailyPlanLevels>(),
    );
    for (const [k, v] of chunk) plans.set(k, v);
  }
  if (plans.size === 0) return NextResponse.json({ lines: 0, note: "no standing plans read" });

  const symbols = [...plans.keys()];
  let bars: Map<string, Bar[]>;
  try {
    bars = await provider.fetchBarsBatch(symbols, "1Day", new Date(now.getTime() - HISTORY_DAYS * 86_400_000), null, "us_equity");
  } catch (err) {
    return NextResponse.json({ error: `Daily bars not read: ${String(err)}` }, { status: 502 });
  }
  const today = etDateKey(now);
  const closes = new Map<string, { close: number; session: string }>();
  for (const symbol of symbols) {
    const done = completedDailyBars(bars.get(symbol) ?? [], today, false);
    const last = done[done.length - 1];
    if (last && last.c > 0) closes.set(symbol, { close: last.c, session: etDateKey(new Date(last.t)) });
  }

  const { skip, scores } = await readListFlags(service, symbols);
  const lines = readPreOpenLines(plans, closes, skip);
  if (dry || lines.length === 0) {
    return NextResponse.json({ dry, sweepBasis, plans: plans.size, lines });
  }

  // The freshness of each line at dispatch (NOTIFY-FRESHNESS-001): the data
  // is the prior session's close, read now; never actionable before the open.
  const feed = resolveFeedPolicy({ assetClass: "us_equity", isLive: provider.isLive, source: provider.name });
  const fresh = (line: PreOpenLine, dispatchAt: Date): Deliverable | null => {
    const f = checkNotificationFreshness(
      preOpenEvidence(line, { closeAt: sessionCloseAt(line.prevSession), evaluatedAt: now, feed: feed.entitlement, delayMs: feed.contractualDelayMs }),
      dispatchAt,
    );
    if (f.disposition === "suppress") {
      console.info(`[pre-open-lines] suppressed ${line.symbol}: ${f.reason}`);
      return null;
    }
    return f;
  };

  const sessionKey = preOpenSessionKey(now);
  const bell = await writeBells(service, lines, fresh, now).catch((err) => {
    console.error("[pre-open-lines] bell failed:", err);
    return 0;
  });
  const push = await sendPushes(service, lines, scores, fresh, sessionKey).catch((err) => {
    console.error("[pre-open-lines] push failed:", err);
    return 0;
  });
  return NextResponse.json({ lines: lines.length, symbols: lines.map((l) => l.symbol), bell, push });
}

/** The latest lists' resting, expired and retired flags, and each symbol's best score. */
async function readListFlags(
  service: SupabaseClient,
  symbols: string[],
): Promise<{ skip: Set<string>; scores: Map<string, number> }> {
  const skip = new Set<string>();
  const scores = new Map<string, number>();
  const { data: latest } = await service.from("daily_scans").select("scan_date").order("scan_date", { ascending: false }).limit(1).maybeSingle();
  if (!latest?.scan_date) return { skip, scores };
  const data: unknown[] = [];
  for (let i = 0; i < symbols.length; i += PLAN_CHUNK) {
    const { data: chunk } = await service
      .from("daily_scans")
      .select("symbol, score, output_state, detail")
      .eq("scan_date", latest.scan_date)
      .in("symbol", symbols.slice(i, i + PLAN_CHUNK));
    data.push(...(chunk ?? []));
  }
  for (const r of data as { symbol: string; score: number | string | null; output_state: string | null; detail: Record<string, unknown> | null }[]) {
    const d = r.detail ?? {};
    if (r.output_state === "Execute" || r.output_state === "Watch") {
      if (d.resting === true || d.planExpired === true || d.retired === true) skip.add(r.symbol);
      const s = Number(r.score);
      if (Number.isFinite(s)) scores.set(r.symbol, Math.max(scores.get(r.symbol) ?? 0, s));
    }
  }
  return { skip, scores };
}

/** Line notices reach members with intraday access, as the session's do. */
function hasLineNotices(policy: { intradayScansEnabled: boolean; proIntradayModuleEnabled: boolean }): boolean {
  return policy.intradayScansEnabled || policy.proIntradayModuleEnabled;
}

/** Members watching each symbol: watchlist items and open monitors (as the intraday bell reads them). */
async function loadWatchers(service: SupabaseClient, symbols: string[]): Promise<Map<string, Set<string>>> {
  const watchers = new Map<string, Set<string>>();
  const add = (profile: string, symbol: string) => {
    const set = watchers.get(profile) ?? new Set<string>();
    set.add(symbol.toUpperCase());
    watchers.set(profile, set);
  };
  const [items, monitors] = await Promise.all([
    service.from("watchlist_items").select("symbol, watchlists!inner(user_id)").in("symbol", symbols),
    service.from("active_monitors").select("profile_id, symbol").in("symbol", symbols).in("state", ["WATCH", "EXECUTE"]),
  ]);
  for (const row of (items.data ?? []) as unknown as { symbol: string; watchlists: { user_id: string } | { user_id: string }[] }[]) {
    const owners = Array.isArray(row.watchlists) ? row.watchlists : [row.watchlists];
    for (const o of owners) if (o?.user_id) add(o.user_id, row.symbol);
  }
  for (const row of (monitors.data ?? []) as { profile_id: string; symbol: string }[]) add(row.profile_id, row.symbol);
  return watchers;
}

/** One bell row a watched line, once a New York day per symbol and side. */
async function writeBells(
  service: SupabaseClient,
  lines: PreOpenLine[],
  fresh: (line: PreOpenLine, at: Date) => Deliverable | null,
  now: Date,
): Promise<number> {
  const watchers = await loadWatchers(service, lines.map((l) => l.symbol));
  const today = etDateKey(now);
  const since = new Date(now.getTime() - 30 * 3600_000).toISOString();
  let written = 0;
  for (const [profileId, watched] of watchers) {
    try {
      const policy = await getUserEntitlementPolicy(service, profileId);
      if (!hasLineNotices(policy)) continue;
      const rows = lines
        .filter((l) => watched.has(l.symbol))
        .flatMap((l) => {
          const f = fresh(l, new Date());
          return f ? [preOpenBellRow(l)] : [];
        });
      if (rows.length === 0) continue;
      const { data: recent, error } = await service
        .from("in_app_notifications")
        .select("title, created_at")
        .eq("profile_id", profileId)
        .eq("verdict", "Intraday")
        .gte("created_at", since)
        .in("title", rows.map((r) => r.title));
      if (error) continue;
      const seen = new Set(((recent ?? []) as { title: string; created_at: string }[]).filter((r) => etDateKey(new Date(r.created_at)) === today).map((r) => r.title));
      const fresh_ = rows.filter((r) => !seen.has(r.title));
      if (fresh_.length === 0) continue;
      const { error: insertError } = await service
        .from("in_app_notifications")
        .insert(fresh_.map((r) => ({ profile_id: profileId, transition_id: null, ...r })));
      if (insertError) {
        console.error("[pre-open-lines] bell insert failed:", insertError.message);
        continue;
      }
      written += fresh_.length;
    } catch (err) {
      console.error("[pre-open-lines] bell member skipped:", err);
    }
  }
  return written;
}

/** One push a member naming the lines not yet sent today, under their push, score and quiet-hours settings. */
async function sendPushes(
  service: SupabaseClient,
  lines: PreOpenLine[],
  scores: Map<string, number>,
  fresh: (line: PreOpenLine, at: Date) => Deliverable | null,
  sessionKey: string,
): Promise<number> {
  if (vapidConfig() === null) return 0;
  const { data: prefs, error } = await service.from("notification_preferences").select("user_id, push_enabled, min_score, quiet_hours_enabled");
  if (error) return 0;
  let sent = 0;
  for (const p of (prefs ?? []) as { user_id: string; push_enabled: boolean | null; min_score: number | null; quiet_hours_enabled: boolean | null }[]) {
    if (!p.push_enabled) continue;
    try {
      const policy = await getUserEntitlementPolicy(service, p.user_id);
      if (!hasLineNotices(policy)) continue;
      const minScore = p.min_score ?? 5;
      // A plan read only from a monitor or the sweep has no list score: it is
      // still a standing Execute or Watch, so it is not held back for want of one.
      const mine = lines.filter((l) => (scores.get(l.symbol) ?? minScore) >= minScore);
      if (mine.length === 0) continue;
      if (p.quiet_hours_enabled && (await inQuietHours(service, p.user_id))) continue;
      const hashes = mine.map((l) => preOpenHash(l, sessionKey));
      const { data: logged, error: logReadError } = await service
        .from("notification_log")
        .select("signal_hash")
        .eq("user_id", p.user_id)
        .eq("channel", "push")
        .in("signal_hash", hashes);
      // An unread log counts as sent, so a failed read never repeats the morning.
      if (logReadError) continue;
      const done = new Set(((logged ?? []) as { signal_hash: string }[]).map((r) => r.signal_hash));
      const dispatchAt = new Date();
      const due = mine.filter((l) => !done.has(preOpenHash(l, sessionKey)) && fresh(l, dispatchAt) != null);
      if (due.length === 0) continue;
      const result = await sendPushToProfile(service, p.user_id, preOpenPushMessage(due, sessionKey));
      if (!result.success && result.skipped) continue;
      if (result.success) sent += 1;
      const stamp = new Date().toISOString();
      const { error: logError } = await service.from("notification_log").insert(
        due.map((l) => ({
          user_id: p.user_id,
          symbol: l.symbol,
          direction: l.direction === "up" ? "bullish" : "bearish",
          score: Math.max(0, Math.min(9, Math.round(scores.get(l.symbol) ?? 0))),
          channel: "push",
          status: result.success ? "sent" : "failed",
          recipient: null,
          triggered_at: stamp,
          sent_at: result.success ? stamp : null,
          failed_at: result.success ? null : stamp,
          error_message: result.success ? null : (result.error ?? null),
          signal_hash: preOpenHash(l, sessionKey),
        })),
      );
      if (logError) console.error("[pre-open-lines] could not log push:", logError.message);
    } catch (err) {
      console.error("[pre-open-lines] push member skipped:", err);
    }
  }
  return sent;
}

