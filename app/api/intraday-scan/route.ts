/**
 * GSPS — /api/intraday-scan
 *
 * Intraday momentum scan, reachable two ways.
 *
 * Signed-in user (no `Authorization` header): on-demand, driven by the
 * Scanner page while a user has it open. This project runs on Vercel's
 * Hobby plan, which caps scheduled jobs at two per project and one run per
 * day (see docs/THIRD_PARTY_LIMITS.md), and both slots are already spent on
 * the daily market scan — so a scan that needs to run every few minutes
 * during the session cannot come from `vercel.json`. Results persist to
 * `intraday_alerts`, per-user, for that user's own cooldown history.
 *
 * `Authorization: Bearer CRON_SECRET` (system scan): the background
 * coverage this project didn't have — see
 * .github/workflows/intraday-scan.yml, which calls this on a timer both
 * during market hours and, since equities can't move outside them, on a
 * second, crypto-only schedule the rest of the week. It ignores `?symbols=`,
 * which is a personal override, not a market-wide one, but does honor
 * `?universe=crypto` — the one thing the off-hours cron sets, to scan
 * crypto alone rather than a watchlist mostly made of instruments whose
 * market is shut. Every other system scan, including a manual
 * `workflow_dispatch` run, covers the full default watchlist. This path
 * persists to `intraday_system_alerts` (no per-user cooldown to key off),
 * and emails every user whose notification preferences match — this is the
 * path that actually answers "why didn't the scanner notify me."
 *
 * A signed-in user's refreshes are metered per tier — a per-day and a per-week
 * budget on `EntitlementPolicy` (2026-09-30, `lib/entitlements/intraday-refresh.ts`).
 * `?budget=1` reads the budget without running (or spending) a scan; a scan
 * over budget is refused with 429 and the budget. The system scan is never
 * metered.
 *
 * Market data only. Nothing here touches broker or order state — those are
 * different sources with different trust properties, and the separation is
 * deliberate.
 */

import { planQueue, rotationTick } from "@/lib/scanner/queue";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserEntitlementPolicy, type EntitlementPolicy } from "@/lib/entitlements/policy";
import { evaluateMonitor } from "@/lib/entitlements/monitor-store";
import {
  computeIntradayRefreshBudget,
  countIntradayRefreshes,
  describeRefreshBlock,
  recordIntradayRefresh,
  type IntradayRefreshBudget,
  type IntradayRefreshUsage,
} from "@/lib/entitlements/intraday-refresh";
import { DEFAULT_PRO_INTRADAY_POLICY } from "@/lib/promotion/config";
import { isConfirmedIntradayEntry, remainingSetupsDisplayable } from "@/lib/promotion/pro-intraday";
import { getMarketDataProvider } from "@/lib/data/provider";
import { MARKET_DATA_UNAVAILABLE, syntheticDataRefusal } from "@/lib/data/feed-mode";
import { isCryptoSymbol, normalizeCryptoSymbol } from "@/lib/data/alpaca";
import { atr } from "@/lib/analysis/pivots";
import { equitySession, etParts } from "@/lib/market/session";
import { readLiquidity } from "@/lib/scan/liquidity";
import { barCloseAt, resolveFeedPolicy, timeframeForMinutes } from "@/lib/data/timeliness";
import { completedDailyBars, INTRADAY_DAILY_FETCH_LIMIT, priorDailyClose } from "@/lib/scanner/priorClose";
import { notifySubscribedUsers } from "@/lib/notifications/intradayDelivery";
import { NOTICE_SIGNALS } from "@/lib/scanner/intradayDisplay";
import { recordIntradayBells } from "@/lib/notifications/intradayBell";
import { loadDailyPlans } from "@/lib/scanner/dailyPlans";
import { chooseSweepBasis } from "@/lib/scan/universeSweep";
import { FOCUS_SIZE, FOCUS_STORED } from "@/lib/scanner/focusList";
import {
  barsSincePlan,
  invalidateBrokenSweep,
  stopTraded,
  loadSessionSetups,
  SESSION_SETUPS_MAX,
  SESSION_SETUPS_ON_DEMAND,
} from "@/lib/scanner/sessionSetups";
import { withTimeout } from "@/lib/utils";
import {
  DEFAULT_CONFIG,
  WATCHLIST,
  barsForSession,
  etDateKey,
  scanIntraday,
  volumeBaseline,
  type Alert,
  type AssetKind,
  type DailyPlanLevels,
  type Direction,
  type RecentSystemAlert,
  type ScannerConfig,
  type SignalType,
  type SymbolInput,
  INTRADAY_DAILY_HISTORY_DAYS,
} from "@/lib/scanner/intraday";
import type { Bar } from "@/lib/types";
import { isCronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 120;

/** Sessions of history behind the relative-volume baseline. */
const BASELINE_DAYS = 12;
/** Daily history fetched per symbol (`INTRADAY_DAILY_HISTORY_DAYS`, shared with the alert replay). */
const DAILY_HISTORY_DAYS = INTRADAY_DAILY_HISTORY_DAYS;

/**
 * `intraday_alerts` (migration 0016, renumbered from 0008 — see that file's
 * header) was shaped for the confluence scan, so
 * three of its columns carry intraday values under names that don't say so.
 * The mapping is stated once, here, and used by both the read and the write —
 * a round trip that disagrees with itself would silently disable the cooldown.
 *
 *   signal_id            ← the signal mode ("overnight_turn", …). Also what
 *                          makes the table's (user, symbol, signal_id,
 *                          poll_cycle_timestamp) key mean one row per
 *                          symbol+mode per scan, which is the grain we want.
 *   signal_type          ← direction, in the vocabulary its CHECK allows
 *                          ("up" → bullish, "down" → bearish).
 *   poll_cycle_timestamp ← when the scan ran; the cooldown's clock.
 *
 * `score` is NOT NULL and bounded 0–9, but an intraday alert carries a 0–100
 * confidence. It is banded to fit and the true value kept in `metadata`.
 */
type PriorAlert = NonNullable<SymbolInput["lastAlerts"]>[number];

const DIRECTION_TO_SIGNAL_TYPE: Record<Direction, string> = { up: "bullish", down: "bearish" };

/** How far back the cooldown can possibly look, whatever `cooldownMinutes` is. */
const COOLDOWN_LOOKBACK_HOURS = 24;

/** Bounded so a hand-typed symbol list can't turn into an unbounded fan-out. */
const MAX_SYMBOLS = 25;

/**
 * True when the request carries the shared cron secret. Same check as
 * `/api/market-scan`: Vercel only attaches this header for its own scheduled
 * invocations, so an unset secret means the check fails closed, not open.
 */
function isSystemScan(req: NextRequest): boolean {
  return isCronAuthorized(req.headers.get("authorization"));
}

export async function GET(req: NextRequest) {
  const systemScan = isSystemScan(req);
  const now = new Date();

  const supabase = systemScan ? createServiceClient() : await createClient();
  let userId: string | null = null;
  let proBounded = false;
  // Hoisted out of the `!systemScan` block below so the monitor-wiring step
  // near the end of this handler (on-demand path only) can read the same
  // policy's `maxActiveWatchMonitors` without re-fetching it.
  let policy: EntitlementPolicy | null = null;
  let usageBefore: IntradayRefreshUsage | null = null;
  let budgetBefore: IntradayRefreshBudget | null = null;
  if (!systemScan) {
    const {
      data: { user },
    } = await (supabase as Supabase).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    userId = user.id;

    // Phase 3F: intraday scans are Expert+ (INVESTOR_MODE/SYSTEM_MASTERY)
    // per docs/GSPS_TIER_ENTITLEMENT_SPEC.md. This route had no tier gate at all
    // before this -- confirmed as an intentional restriction of previously
    // open access, not left unenforced by oversight. Pro (STANDARD) was added
    // 2026-08-29 (see docs/GSPS_TIER_ENTITLEMENT_SPEC.md's correction note and
    // ROADMAP.md) as a distinct, separately bounded module rather than a
    // widening of full intraday access -- see the `proBounded` filtering below.
    policy = await getUserEntitlementPolicy(supabase as Supabase, userId);
    if (!policy.intradayScansEnabled && !policy.proIntradayModuleEnabled) {
      return NextResponse.json(
        { error: "Intraday scans are available on the Pro plan and above." },
        { status: 403 },
      );
    }
    proBounded = !policy.intradayScansEnabled && policy.proIntradayModuleEnabled;

    // The refresh budget (2026-09-30). Read before the scan, charged after it
    // succeeds — a scan that errors costs nothing.
    usageBefore = await countIntradayRefreshes(createServiceClient(), userId, now);
    budgetBefore = computeIntradayRefreshBudget(
      { perDay: policy.intradayRefreshesPerDay, perWeek: policy.intradayRefreshesPerWeek },
      usageBefore,
    );
    if (new URL(req.url).searchParams.get("budget") === "1") {
      // The budget read costs nothing, so it also carries what today's
      // scheduled scans already flagged: the panel shows those at once while
      // the person decides whether to spend a refresh (2026-10-21, a scan
      // that took minutes left the panel empty in the meantime).
      const narrowed = new URL(req.url).searchParams.get("symbols");
      const recent = await loadRecentSystemAlerts(
        createServiceClient(),
        now,
        narrowed ? resolveUniverse(narrowed).map((u) => u.symbol) : null,
        !policy.intradayScansEnabled && policy.proIntradayModuleEnabled,
      ).catch(() => []);
      return NextResponse.json({ budget: budgetBefore, recent });
    }
    if (!budgetBefore.allowed) {
      return NextResponse.json({ error: describeRefreshBlock(budgetBefore), budget: budgetBefore }, { status: 429 });
    }
  }

  const params = new URL(req.url).searchParams;
  // A system scan ignores `?symbols=` — that's a personal narrowing a
  // signed-in user asked for, not something a background run driven by
  // GitHub Actions has an opinion about. It does honor `?universe=crypto`,
  // but only that one value: the off-hours cron schedule in
  // .github/workflows/intraday-scan.yml uses it to scan crypto alone
  // outside the equity session, when the rest of the watchlist can't have
  // moved because the market it trades on is closed. Every other system
  // scan — the equity-hours cron, and a manual `workflow_dispatch` run at
  // any hour — covers the full watchlist, same as before this parameter
  // existed.
  // The night's sweep, resolved once for the session's setups, the plans and
  // the stop test (SUS-21); started here so nothing waits on it twice.
  // A crypto-only scan reads no sweep (the sweep holds stocks only).
  const sweepBasisP =
    systemScan && params.get("universe") === "crypto"
      ? Promise.resolve(null)
      : chooseSweepBasis(createServiceClient(), now).catch(() => null);
  const universe = systemScan
    ? await resolveSystemUniverse(params.get("universe"), supabase as ServiceSupabase, sweepBasisP)
    : await resolveOnDemandUniverse(params.get("symbols"), now, sweepBasisP);
  const config = resolveConfig(params);
  const provider = getMarketDataProvider();
  if (syntheticDataRefusal("run the intraday scan and send its alerts", provider)) {
    return NextResponse.json({ error: MARKET_DATA_UNAVAILABLE, code: "synthetic_market_data" }, { status: 503 });
  }

  const todayEt = etDateKey(now);
  const nowEtMinute = etParts(now).minutes;

  // Cooldown history for the whole universe in one query rather than one per
  // symbol — the fan-out is already bounded, and a round trip per symbol
  // would dominate the scan's latency.
  const priorAlerts = systemScan
    ? await loadPriorSystemAlerts(supabase as ServiceSupabase, universe.map((u) => u.symbol), now)
    : await loadPriorAlerts(supabase as Supabase, universe.map((u) => u.symbol), now);

  // The daily plans standing on these symbols, for "Daily plan's level held"
  // (lib/scanner/intraday.ts#detectPlanLevelHeld): the intraday chart times
  // the daily plan's own entry. One read for the universe, best-effort.
  // A sweep-only setup is timed from its own stored plan.
  const sweepBasis = await sweepBasisP;
  const dailyPlans = await loadDailyPlans(createServiceClient(), universe.map((u) => u.symbol), userId, {
    sweepBasis,
  }).catch((err) => {
    console.error("[intraday-scan] daily plans not read:", err);
    return new Map<string, DailyPlanLevels>();
  });

  // Every symbol's bars in a few batched requests (100 symbols each) instead
  // of three per symbol: the per-symbol reads ran the free feed into its rate
  // limit at about 20 symbols (2026-10-21). A batch that fails leaves those
  // symbols to the per-symbol reads, as before.
  const prefetched = await prefetchBars(provider, universe, now);

  const inputs = await mapWithConcurrency(universe, 4, async (entry) =>
    withTimeout(
      buildInput(
        entry,
        todayEt,
        provider,
        priorAlerts.get(entry.symbol) ?? [],
        now,
        dailyPlans.get(entry.symbol) ?? null,
        prefetched.get(entry.symbol) ?? null,
      ),
      15_000,
      `buildInput for ${entry.symbol}`
    ).catch((err) => {
      console.error(`[intraday-scan] buildInput failed for ${entry.symbol}:`, err);
      return null;
    }),
  );

  const resolved = inputs.filter((i): i is SymbolInput => i !== null);
  const unreachable = universe
    .filter((u) => !resolved.some((r) => r.symbol === u.symbol))
    .map((u) => u.symbol);

  // Evaluated when the decision is computed, after the bars arrived, never
  // backdated to the request's start (DATA-DELAY-001 §4).
  let output = scanIntraday(resolved, config, new Date());

  if (systemScan) {
    // A broken stop retires the plan on the focus list and on the night's
    // sweep alike (SUS-21), so the next scan times the next name.
    const sessionBars = new Map(resolved.map((i) => [i.symbol, { kind: i.kind, bars: i.bars }]));
    await Promise.all([
      invalidateBrokenFocus(supabase as ServiceSupabase, resolved, now).catch(() => undefined),
      invalidateBrokenSweep(supabase as ServiceSupabase, sweepBasis, sessionBars, now).catch(() => undefined),
    ]);
  }

  // Pro's bounded module (docs/GSPS_TIER_ENTITLEMENT_SPEC.md correction,
  // 2026-08-29): a separately defined, more conservative slice of the same
  // engine Expert+ uses unrestricted, not a shortened swing timeframe.
  // Confirmation is restricted to the module's allowed closed-bar lengths
  // (5/15/30 minutes) -- today that means only the scanner's 5-minute-bar
  // alerts qualify, since it has no native 15/30-minute path yet, which is a
  // real (if currently narrow) restriction rather than a fabricated one --
  // and the count still displayable today is capped against what this user
  // has already been shown, read from their own `intraday_alerts` history
  // rather than a new counter.
  if (proBounded) {
    const intervalBySymbol = new Map(resolved.map((i) => [i.symbol, i.barIntervalMinutes]));
    const confirmed = output.alerts.filter(
      (alert) =>
        !NOTICE_SIGNALS.has(alert.type) &&
        isConfirmedIntradayEntry(intervalBySymbol.get(alert.symbol) ?? 1, true, DEFAULT_PRO_INTRADAY_POLICY),
    );
    // A notice (nearing or at a daily plan's entry) is not a setup shown: it
    // takes none of the module's daily bound.
    const notices = output.alerts.filter((alert) => NOTICE_SIGNALS.has(alert.type));
    const shownToday = await countProIntradaySetupsShownToday(supabase as Supabase, userId!, now);
    const remaining = remainingSetupsDisplayable({ setupsDisplayedToday: shownToday }, DEFAULT_PRO_INTRADAY_POLICY);
    // Held alerts were shown before, so they count against nothing new.
    const heldConfirmed = output.heldAlerts.filter((alert) =>
      isConfirmedIntradayEntry(intervalBySymbol.get(alert.symbol) ?? 1, true, DEFAULT_PRO_INTRADAY_POLICY),
    );
    output = { ...output, alerts: [...confirmed.slice(0, remaining), ...notices], heldAlerts: heldConfirmed };
  }

  // Persisting the alerts is what makes the cooldown survive across runs, but
  // it is not what the caller asked for. A write failure must not discard a
  // scan that already succeeded — it is reported alongside the result and the
  // cooldown degrades to within-run only, which is where it was before.
  //
  // Notices (nearing or at a daily plan's entry) are not stored: they are a
  // live countdown re-read every scan, delivered from the scan itself, and a
  // row per scan would crowd "Flagged today", the demo account's candidates
  // and Pro's daily count (review, 2026-10-28).
  const stored = output.alerts.filter((alert) => !NOTICE_SIGNALS.has(alert.type));
  const alertsPersisted = systemScan
    ? await persistSystemAlerts(supabase as ServiceSupabase, stored, resolved)
    : await persistAlerts(supabase as Supabase, userId!, stored, resolved);

  // Feed this user's own `active_monitors` — the same WATCH/EXECUTE tracker
  // `manual_dashboard` scans (app/api/batch-scan/route.ts) and the scheduled
  // system scans already keep current via evaluateMonitor. Before this, an
  // intraday-only mover never touched a profile's monitor state at all, so
  // the Scanner page's History tab (app/api/scan-history/route.ts, which
  // reads "current status" straight off active_monitors) and the dashboard
  // could both go on showing a symbol as untracked, or stuck on a stale
  // daily-scan state, after intraday had already confirmed a real move on
  // it — the exact gap that made app/api/scan-history/route.ts's "kept
  // current by every scan of any source... including intraday" claim false
  // when it was written. System-scan runs are deliberately excluded: that
  // path has no single profile to attribute a monitor to, and fanning a
  // per-alert monitor write out to every entitled user on a job that polls
  // every few minutes is a materially different cost/architecture decision
  // left open rather than made silently here (see ROADMAP.md).
  //
  // Every intraday alert maps to EXECUTE, never WATCH: unlike the four-state
  // Signal & Regime Engine's Watch tier, an intraday alert is not a pending
  // setup awaiting confirmation — per this module's own header, "every
  // output is a *confirmation* of a move that has already happened," so
  // there is no earlier, unconfirmed state for it to occupy.
  // Best-effort and isolated per alert: one symbol's monitor write failing
  // must not discard alerts that already scanned, persisted, and are about
  // to be returned to the caller.
  //
  // Every completed on-demand scan is recorded as a `scan_executions` row —
  // that row is what the refresh budget counts — and the monitor pass reuses
  // the same row as its evaluation id.
  let budgetAfter: IntradayRefreshBudget | null = null;
  if (!systemScan && policy && userId && usageBefore) {
    const executionId = await recordIntradayRefresh(createServiceClient(), userId, {
      eligible: output.alerts.length,
      visible: output.alerts.length,
    }, now);
    budgetAfter = computeIntradayRefreshBudget(
      { perDay: policy.intradayRefreshesPerDay, perWeek: policy.intradayRefreshesPerWeek },
      // A write that failed didn't spend a refresh, so it doesn't show as one.
      executionId ? { today: usageBefore.today + 1, week: usageBefore.week + 1 } : usageBefore,
    );
    if (executionId && output.alerts.length > 0) {
      await applyMonitorsForUser(userId, output.alerts, policy.maxActiveWatchMonitors, executionId).catch((err) => {
        console.error("[intraday-scan] monitor wiring failed:", err);
      });
    }
  }

  // The email fan-out is what actually answers "why wasn't I notified" — it
  // only runs for the system scan. A signed-in user's own on-demand check is
  // them looking, not the market moving; emailing every viewer of the
  // Scanner page on every tab-open would turn a convenience feature into
  // spam. Best-effort: a notification failure must not turn a scan that
  // already succeeded, and already persisted, into an error response.
  if (systemScan && output.alerts.length > 0) {
    // The bell first (owner, 2026-10-21): it reaches a member while email is
    // still held by the sandbox sender. Only members watching the symbol.
    try {
      await recordIntradayBells(supabase as ServiceSupabase, output.alerts, {
        intervalBySymbol: new Map(resolved.map((i) => [i.symbol, i.barIntervalMinutes])),
        now,
      });
    } catch (err) {
      console.error("[intraday-scan] bell notices failed:", err);
    }
    try {
      await notifySubscribedUsers(supabase as ServiceSupabase, output.alerts, {
        intervalBySymbol: new Map(resolved.map((i) => [i.symbol, i.barIntervalMinutes])),
        now,
      });
    } catch (err) {
      console.error("[intraday-scan] notification fan-out failed:", err);
    }
  }

  return NextResponse.json({
    ...output,
    alertsPersisted,
    // Null on a system scan, which is never metered.
    budget: budgetAfter,
    // Freshness and provenance travel with the result. A scan run against the
    // synthetic demo provider must never be presentable as a live one.
    dataSource: provider.name,
    dataIsLive: provider.isLive,
    session: sessionLabelFor(nowEtMinute, now),
    // Symbols whose market data could not be fetched at all. Reported, not
    // dropped: "we didn't scan it" is different from "we scanned it and it was
    // quiet", and the caller has to be able to say which.
    unreachable,
  });
}

/**
 * Symbols added to this cap beyond the curated `WATCHLIST` come from users'
 * own GSPS watchlists (below). Bounded so a popular-symbol tail can't turn a
 * ~20-name scan into one large enough to blow the route's duration budget —
 * see the `maxDuration` comment at the top of this file.
 */
const MAX_SYSTEM_UNIVERSE = 50;
/** An evening focus list older than this (calendar days) is not read: it spans a weekend and a holiday. */
const FOCUS_MAX_AGE_DAYS = 5;

/**
 * System-scan universe: the curated watchlist plus whatever symbols users
 * have actually added to their own GSPS watchlists, or crypto alone.
 *
 * The curated `WATCHLIST` was hand-picked before GSPS had its own
 * watchlist feature (`watchlist_items`, migration 0001) and was never
 * revisited after — so a symbol a user actually tracks (WFC, UAL, PG, GM,
 * PLTR, GE, BA, RCL, NOC, TXN, SNDK, LMT, …) could move double digits in a
 * session and this scan would never fetch a single bar for it, because
 * nothing here ever looked past the hardcoded 21 names. Merging in the
 * real watchlists closes that for anything the data providers can actually
 * quote. It does not close it for index or futures symbols (SPX, /ESU25,
 * /VXU25): `watchlist_items.asset_class` only allows `us_equity`/`crypto`,
 * and `kindFor` below has no index/futures branch because the approved
 * market-data sources carry no such quotes — that gap needs a new data
 * source, not a bigger universe, and is left open rather than silently
 * "fixed" here.
 *
 * `"crypto"` is the only recognized `universeParam` value — anything else
 * (including a typo, or a future value nobody has wired up yet) falls back
 * to the full universe rather than silently scanning nothing, since a
 * scheduled run that scans zero symbols would look identical to one that
 * ran and found nothing.
 */
async function resolveSystemUniverse(
  universeParam: string | null,
  supabase: ServiceSupabase,
  sweepBasisP: Promise<string | null>,
): Promise<{ symbol: string; kind: AssetKind }[]> {
  if (universeParam === "crypto") return WATCHLIST.filter((entry) => entry.kind === "crypto");

  // The evening's focus list (owner, 2026-10-21): when one stands, the fixed
  // single stocks give way to the names the daily charts read as primed, and
  // the index funds, crypto and members' watchlists stay on. With no list
  // (a missed evening), the core list as before.
  //
  // The session's setups come first after the core (owner, 2026-10-28: the
  // 15-minute scans feed the intraday scanner): the daily setups ready to be
  // taken today, chosen from the whole universe by the overnight sweep and
  // the lists the 15-minute market scan keeps current
  // (lib/scanner/sessionSetups.ts). Gann chose from the daily charts and timed
  // the entry in the session (Master Course Ch. 13).
  const [watched, focus, setups] = await Promise.all([
    loadWatchedSymbols(supabase),
    loadFocusSymbols(supabase),
    sweepBasisP.then((basis) => loadSessionSetups(supabase, new Date(), SESSION_SETUPS_MAX, basis)).catch(() => [] as string[]),
  ]);
  const core = focus.length > 0 || setups.length > 0 ? WATCHLIST.filter((w) => w.kind !== "equity") : WATCHLIST;
  const seen = new Set(core.map((w) => w.symbol));
  const out = [...core];
  const asEntry = (symbol: string) => ({ symbol, kind: kindFor(symbol) });
  for (const entry of [...setups.map(asEntry), ...watched, ...focus.slice(0, FOCUS_SIZE).map(asEntry)]) {
    if (out.length >= MAX_SYSTEM_UNIVERSE) break;
    if (seen.has(entry.symbol)) continue;
    seen.add(entry.symbol);
    out.push(entry);
  }
  logShadowQueue(out, core, setups, watched, focus);
  return out;
}

/**
 * The fair queue (`lib/scanner/queue.ts`) run in shadow beside the live
 * selection above: logged only, so its picks can be compared before it
 * selects anything. The discovery tier is empty here until discoveries are
 * stored where this route can read them (the market scan logs them).
 */
function logShadowQueue(
  live: readonly { symbol: string }[],
  core: readonly { symbol: string }[],
  setups: readonly string[],
  watched: readonly { symbol: string }[],
  focus: readonly string[],
): void {
  try {
    const plan = planQueue({
      core: core.map((c) => c.symbol),
      plans: setups,
      discovery: [],
      focus,
      watched: watched.map((w) => w.symbol),
      tick: rotationTick(new Date()),
    });
    const liveSet = new Set(live.map((l) => l.symbol));
    const shadowSet = new Set(plan.selected.map((e) => e.symbol));
    const adds = plan.selected.filter((e) => !liveSet.has(e.symbol)).map((e) => `${e.symbol}(${e.sourceTier} ${e.tierRank})`);
    const drops = live.filter((l) => !shadowSet.has(l.symbol)).map((l) => l.symbol);
    console.info(
      `intraday-scan: shadow queue ${plan.selected.length}/${plan.capacity} (live ${live.length}), deferred ${plan.deferred.length}, adds ${adds.join(" ") || "none"}, drops ${drops.join(" ") || "none"}`,
    );
  } catch (err) {
    console.warn(`intraday-scan: shadow queue failed — ${String(err)}`);
  }
}

/**
 * The latest evening focus list's live names, best rank first: those not yet
 * invalidated today, so a broken name is replaced by the next one on each
 * scan. A list older than `FOCUS_MAX_AGE_DAYS` is not read. A read failure
 * returns none, and the scan falls back to its core list.
 */
async function loadFocusSymbols(supabase: ServiceSupabase): Promise<string[]> {
  const since = etDateKey(new Date(Date.now() - FOCUS_MAX_AGE_DAYS * 86_400_000));
  const { data: latest } = await supabase
    .from("intraday_focus")
    .select("basis_date")
    .gte("basis_date", since)
    .order("basis_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest?.basis_date) return [];
  const { data, error } = await supabase
    .from("intraday_focus")
    .select("symbol")
    .eq("basis_date", latest.basis_date)
    .is("invalidated_at", null)
    .order("rank", { ascending: true })
    .limit(FOCUS_STORED);
  if (error || !data) return [];
  return data.map((r) => String(r.symbol).toUpperCase());
}

/**
 * A focus name whose daily plan's stop the session has traded through is
 * spent for the day (a breach retires the plan, owner 2026-09-30): it is
 * marked invalidated, and the next scan takes the next name on the list.
 * Best-effort; a failed write leaves the name on for another scan.
 */
async function invalidateBrokenFocus(supabase: ServiceSupabase, inputs: SymbolInput[], now: Date): Promise<void> {
  const withPlan = inputs.filter((i) => i.dailyPlan && i.bars.length > 0);
  if (withPlan.length === 0) return;
  const since = etDateKey(new Date(now.getTime() - FOCUS_MAX_AGE_DAYS * 86_400_000));
  // Only bars printed after the list was built, in the regular session for a
  // stock or fund, can break its plan (SUS-21 review): a holiday's scan reads
  // the session the list was built from, and a pre-market print never moves
  // a stop (lib/scanner/sessionSetups.ts#barsSincePlan).
  const { data: rows, error: readError } = await supabase
    .from("intraday_focus")
    .select("symbol, built_at")
    .in("symbol", withPlan.map((i) => i.symbol))
    .is("invalidated_at", null)
    .gte("basis_date", since);
  if (readError || !rows) return;
  const builtAt = new Map<string, number>();
  for (const r of rows) {
    const at = Date.parse(String(r.built_at));
    if (Number.isFinite(at) && at > (builtAt.get(String(r.symbol)) ?? -Infinity)) builtAt.set(String(r.symbol), at);
  }
  const broken = withPlan.filter((i) => {
    const at = builtAt.get(i.symbol);
    if (at == null) return false;
    const plan = i.dailyPlan as DailyPlanLevels;
    return stopTraded(plan.direction, plan.stop, barsSincePlan({ kind: i.kind, bars: i.bars }, at));
  });
  if (broken.length === 0) return;
  const { error } = await supabase
    .from("intraday_focus")
    .update({ invalidated_at: now.toISOString(), invalidated_reason: "daily plan's stop traded through" })
    .in("symbol", broken.map((i) => i.symbol))
    .is("invalidated_at", null)
    .gte("basis_date", since);
  if (error) console.error("[intraday-scan] focus invalidation not written:", error.message);
}

/**
 * Every distinct symbol any user has added to a GSPS watchlist, ranked by how
 * many users track it (so a capped universe keeps the most-watched additions
 * first rather than an arbitrary slice). `asset_class` only ever holds
 * `us_equity` or `crypto` (migration 0001's check constraint), which maps
 * directly onto this scanner's `equity`/`crypto` kinds — a symbol already in
 * `WATCHLIST` keeps its hand-picked kind there (e.g. ETF) instead of being
 * counted a second time as a plain equity.
 *
 * A read failure returns no additions rather than throwing: this is a
 * widening of the scan, not its foundation, and losing it for one run should
 * degrade to "the curated list only", not fail the whole scan.
 */
async function loadWatchedSymbols(supabase: ServiceSupabase): Promise<{ symbol: string; kind: AssetKind }[]> {
  const { data, error } = await supabase.from("watchlist_items").select("symbol, asset_class").limit(20_000);
  if (error || !data) return [];

  const counts = new Map<string, { kind: AssetKind; count: number }>();
  for (const row of data) {
    const symbol = row.symbol?.trim().toUpperCase();
    if (!symbol) continue;
    const kind: AssetKind = row.asset_class === "crypto" ? "crypto" : "equity";
    const existing = counts.get(symbol);
    if (existing) existing.count += 1;
    else counts.set(symbol, { kind, count: 1 });
  }

  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([symbol, v]) => ({ symbol, kind: v.kind }));
}

/**
 * A person's own refresh: the symbols they asked for, or, with none, the
 * session's best setups (lib/scanner/sessionSetups.ts) ahead of the core
 * watchlist, so the Scanner page times the same daily setups the scheduled
 * scan does. A failed read leaves the core watchlist, as before.
 */
async function resolveOnDemandUniverse(
  param: string | null,
  now: Date,
  sweepBasisP: Promise<string | null>,
): Promise<{ symbol: string; kind: AssetKind }[]> {
  if (param?.trim()) return resolveUniverse(param);
  const setups = await sweepBasisP
    .then((basis) => loadSessionSetups(createServiceClient(), now, SESSION_SETUPS_ON_DEMAND, basis))
    .catch(() => [] as string[]);
  const seen = new Set<string>();
  const out: { symbol: string; kind: AssetKind }[] = [];
  for (const entry of [...setups.map((symbol) => ({ symbol, kind: kindFor(symbol) })), ...WATCHLIST]) {
    if (seen.has(entry.symbol)) continue;
    seen.add(entry.symbol);
    out.push(entry);
  }
  return out;
}

/** Symbols to scan: the caller's list, or the core watchlist. */
function resolveUniverse(param: string | null): { symbol: string; kind: AssetKind }[] {
  if (!param?.trim()) return WATCHLIST;

  const requested = param
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS);

  const seen = new Set<string>();
  const universe: { symbol: string; kind: AssetKind }[] = [];
  for (const symbol of requested) {
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    universe.push({ symbol, kind: kindFor(symbol) });
  }
  return universe.length > 0 ? universe : WATCHLIST;
}

/**
 * Asset kind for a symbol the user typed.
 *
 * The watchlist's own classifications win — they are curated. Everything else
 * falls back to crypto-pair detection and, failing that, "equity". Index
 * symbols are not inferred: the approved market-data sources carry no index
 * quotes, so claiming a symbol is an index would promise data that cannot be
 * delivered.
 */
function kindFor(symbol: string): AssetKind {
  const known = WATCHLIST.find((w) => w.symbol === symbol);
  if (known) return known.kind;
  return isCryptoSymbol(symbol) ? "crypto" : "equity";
}

/** Detection thresholds are query-tunable so a mode can be selected per scan. */
function resolveConfig(params: URLSearchParams): ScannerConfig {
  const num = (key: string, fallback: number): number => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };

  return {
    relativeVolumeThreshold: num("rvol", DEFAULT_CONFIG.relativeVolumeThreshold),
    minMovePct: num("minMovePct", DEFAULT_CONFIG.minMovePct),
    maxDataAgeSeconds: num("maxDataAge", DEFAULT_CONFIG.maxDataAgeSeconds),
    cooldownMinutes: num("cooldown", DEFAULT_CONFIG.cooldownMinutes),
    minSessionVolume: num("minVolume", DEFAULT_CONFIG.minSessionVolume),
  };
}

type Provider = ReturnType<typeof getMarketDataProvider>;
type Supabase = Awaited<ReturnType<typeof createClient>>;
type ServiceSupabase = ReturnType<typeof createServiceClient>;

/**
 * Every symbol's recent alerts, in one query, keyed by symbol.
 *
 * Rows are scoped to the signed-in user by RLS; the explicit `user_id` filter
 * says so at the call site rather than relying on a policy defined elsewhere.
 * A read failure yields an empty map — the cooldown then suppresses nothing,
 * which shows a duplicate alert rather than hiding a real one.
 */
async function loadPriorAlerts(
  supabase: Supabase,
  symbols: string[],
  now: Date,
): Promise<Map<string, PriorAlert[]>> {
  const bySymbol = new Map<string, PriorAlert[]>();
  if (symbols.length === 0) return bySymbol;

  const since = new Date(now.getTime() - COOLDOWN_LOOKBACK_HOURS * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("intraday_alerts")
    .select("symbol, signal_id, signal_type, poll_cycle_timestamp")
    .in("symbol", symbols)
    .gte("poll_cycle_timestamp", since)
    .order("poll_cycle_timestamp", { ascending: false });

  if (error || !data) return bySymbol;

  for (const row of data) {
    const prior: PriorAlert = {
      type: row.signal_id as SignalType,
      direction: row.signal_type === "bearish" ? "down" : "up",
      at: row.poll_cycle_timestamp,
    };
    const existing = bySymbol.get(row.symbol);
    if (existing) existing.push(prior);
    else bySymbol.set(row.symbol, [prior]);
  }
  return bySymbol;
}

/**
 * Distinct symbols already shown to this user today, for the Pro-bounded
 * module's setups-displayed ceiling. Reads the existing `intraday_alerts`
 * persistence rather than a new counter -- a read failure counts as zero
 * shown so far, which under-restricts rather than blocking a user's scan on
 * a bookkeeping hiccup.
 */
async function countProIntradaySetupsShownToday(supabase: Supabase, userId: string, now: Date): Promise<number> {
  const todayEt = etDateKey(now);
  // Wide enough UTC window to contain every instant that could map to today's
  // ET date (ET is always UTC-4 or UTC-5); the exact ET-day match happens per
  // row below, so this bound only needs to avoid excluding a real row.
  const since = new Date(now.getTime() - 30 * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("intraday_alerts")
    .select("symbol, poll_cycle_timestamp")
    .eq("user_id", userId)
    .gte("poll_cycle_timestamp", since);
  if (error || !data) return 0;
  const today = new Set(
    data.filter((r) => etDateKey(new Date(r.poll_cycle_timestamp)) === todayEt).map((r) => r.symbol),
  );
  return today.size;
}

/**
 * Record this run's alerts so the cooldown outlives the request.
 *
 * One statement for the batch, and failure is reported rather than thrown: the
 * scan the caller asked for has already succeeded by this point, and losing it
 * to a bookkeeping write would repeat the fault that stopped the daily scan
 * saving for four days.
 */
async function persistAlerts(
  supabase: Supabase,
  userId: string,
  alerts: Alert[],
  inputs: SymbolInput[],
): Promise<boolean> {
  if (alerts.length === 0) return true;

  const intervalBySymbol = new Map(inputs.map((i) => [i.symbol, i.barIntervalMinutes]));

  const rows = alerts.map((alert) => ({
    user_id: userId,
    symbol: alert.symbol,
    signal_id: alert.type,
    alert_type: "new_signal",
    // 0–100 confidence banded into the column's 0–9 range; the unrounded value
    // travels in metadata so nothing depends on the lossy copy.
    score: Math.max(0, Math.min(9, Math.round((alert.confidence / 100) * 9))),
    signal_type: DIRECTION_TO_SIGNAL_TYPE[alert.direction],
    timeframe: intervalBySymbol.get(alert.symbol) === 5 ? "5m" : "1m",
    entry_level: alert.continuationPlan.entry ?? alert.move.current,
    stop_loss_level: alert.invalidation,
    take_profit_1_level: alert.continuationPlan.firstTarget,
    poll_cycle_timestamp: alert.triggerTime,
    metadata: {
      confidence: alert.confidence,
      direction: alert.direction,
      relativeVolume: alert.relativeVolume,
      dataTimestamp: alert.dataTimestamp,
      masterTarget: alert.continuationPlan.masterTarget ?? null,
      paysRisk: alert.continuationPlan.paysRisk ?? null,
    },
  }));

  const { error } = await supabase
    .from("intraday_alerts")
    .upsert(rows, { onConflict: "user_id,symbol,signal_id,poll_cycle_timestamp" });

  if (error) {
    console.error("[intraday-scan] could not persist alerts:", error);
    return false;
  }
  return true;
}

/**
 * Evaluates an `active_monitors` transition for every alert's symbol against
 * this profile, exactly as `evaluateMonitor` already does for `manual_dashboard`
 * scans (app/api/batch-scan/route.ts). The `scan_executions` row that records
 * this on-demand scan (source: `"intraday"`) is written by the caller — one per
 * scan whether or not it found anything, since the refresh budget counts them —
 * and passed in as the evaluation id. Deliberately does not call
 * `evaluateMonitorsAndNotify` / dispatch a notification: an on-demand scan
 * is the user looking, not the market moving, and intraday alerts already
 * have their own, separate email path for actual market-driven moves
 * (`notifySubscribedUsers`, system-scan only) — reusing the WATCH -> EXECUTE
 * notification trigger here would double-fire on every manual check.
 */
async function applyMonitorsForUser(
  profileId: string,
  alerts: Alert[],
  maxActiveWatchMonitors: EntitlementPolicy["maxActiveWatchMonitors"],
  executionId: string,
): Promise<void> {
  const service = createServiceClient();

  // One alert can name a symbol more than once across signal types in the
  // same run; a monitor is per profile+symbol, not per alert, so evaluate
  // each symbol at most once here.
  const bySymbol = new Map<string, Alert>();
  for (const alert of alerts) {
    if (!bySymbol.has(alert.symbol)) bySymbol.set(alert.symbol, alert);
  }

  // An intraday alert is not a scored Execute verdict, so it only ever opens
  // a WATCH monitor for a symbol with none open, and never touches one that
  // is. Marking alert symbols EXECUTE put Watch/Reject setups on Home's
  // tracked Execute card with no score (project owner, 2026-09-28).
  const { data: openMonitors } = await service
    .from("active_monitors")
    .select("symbol")
    .eq("profile_id", profileId)
    .in("state", ["WATCH", "EXECUTE"]);
  const alreadyOpen = new Set((openMonitors ?? []).map((m) => String(m.symbol).toUpperCase()));

  for (const alert of bySymbol.values()) {
    if (alreadyOpen.has(alert.symbol.toUpperCase())) continue;
    try {
      await evaluateMonitor(service, {
        profileId,
        symbol: alert.symbol,
        source: "intraday",
        candidateState: "WATCH",
        evaluationId: executionId,
        maxActiveWatchMonitors,
      });
    } catch (err) {
      console.error(`[intraday-scan] monitor evaluation failed for ${alert.symbol}:`, err);
    }
  }
}

/**
 * System-scan counterpart to `loadPriorAlerts`: cooldown history from
 * `intraday_system_alerts` instead of the per-user table, since a background
 * run has no `user_id` to scope by.
 */
async function loadPriorSystemAlerts(
  supabase: ServiceSupabase,
  symbols: string[],
  now: Date,
): Promise<Map<string, PriorAlert[]>> {
  const bySymbol = new Map<string, PriorAlert[]>();
  if (symbols.length === 0) return bySymbol;

  const since = new Date(now.getTime() - COOLDOWN_LOOKBACK_HOURS * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("intraday_system_alerts")
    .select("symbol, signal_id, signal_type, poll_cycle_timestamp")
    .in("symbol", symbols)
    .gte("poll_cycle_timestamp", since)
    .order("poll_cycle_timestamp", { ascending: false });

  if (error || !data) return bySymbol;

  for (const row of data) {
    const prior: PriorAlert = {
      type: row.signal_id as SignalType,
      direction: row.signal_type === "bearish" ? "down" : "up",
      at: row.poll_cycle_timestamp,
    };
    const existing = bySymbol.get(row.symbol);
    if (existing) existing.push(prior);
    else bySymbol.set(row.symbol, [prior]);
  }
  return bySymbol;
}

/** System-scan counterpart to `persistAlerts`: writes `intraday_system_alerts`, no `user_id`. */
async function persistSystemAlerts(
  supabase: ServiceSupabase,
  alerts: Alert[],
  inputs: SymbolInput[],
): Promise<boolean> {
  if (alerts.length === 0) return true;

  const intervalBySymbol = new Map(inputs.map((i) => [i.symbol, i.barIntervalMinutes]));

  const rows = alerts.map((alert) => ({
    symbol: alert.symbol,
    signal_id: alert.type,
    score: Math.max(0, Math.min(9, Math.round((alert.confidence / 100) * 9))),
    signal_type: DIRECTION_TO_SIGNAL_TYPE[alert.direction],
    entry_level: alert.continuationPlan.entry ?? alert.move.current,
    stop_loss_level: alert.invalidation,
    take_profit_1_level: alert.continuationPlan.firstTarget,
    poll_cycle_timestamp: alert.triggerTime,
    metadata: {
      confidence: alert.confidence,
      direction: alert.direction,
      relativeVolume: alert.relativeVolume,
      dataTimestamp: alert.dataTimestamp,
      barIntervalMinutes: intervalBySymbol.get(alert.symbol) ?? 1,
      masterTarget: alert.continuationPlan.masterTarget ?? null,
      paysRisk: alert.continuationPlan.paysRisk ?? null,
    },
  }));

  const { error } = await supabase
    .from("intraday_system_alerts")
    .upsert(rows, { onConflict: "symbol,signal_id,poll_cycle_timestamp" });

  if (error) {
    console.error("[intraday-scan] could not persist system alerts:", error);
    return false;
  }
  return true;
}

/**
 * Today's scheduled-scan alerts, latest first and one per symbol and signal,
 * read from `intraday_system_alerts`. Pro's bounded module sees only the
 * closed-bar lengths it allows, and no more symbols than its daily bound, as
 * on a scan it runs itself.
 */
async function loadRecentSystemAlerts(
  supabase: ServiceSupabase,
  now: Date,
  symbols: string[] | null,
  proBounded: boolean,
): Promise<RecentSystemAlert[]> {
  const todayEt = etDateKey(now);
  let query = supabase
    .from("intraday_system_alerts")
    .select("symbol, signal_id, signal_type, entry_level, stop_loss_level, take_profit_1_level, poll_cycle_timestamp, metadata")
    .gte("poll_cycle_timestamp", new Date(now.getTime() - 20 * 3600_000).toISOString())
    .order("poll_cycle_timestamp", { ascending: false })
    .limit(200);
  if (symbols && symbols.length > 0) query = query.in("symbol", symbols);
  const { data, error } = await query;
  if (error || !data) return [];

  const seen = new Set<string>();
  const symbolsShown = new Set<string>();
  const out: RecentSystemAlert[] = [];
  for (const row of data) {
    if (etDateKey(new Date(row.poll_cycle_timestamp)) !== todayEt) continue;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (
      proBounded &&
      !isConfirmedIntradayEntry(Number(meta.barIntervalMinutes ?? 1), true, DEFAULT_PRO_INTRADAY_POLICY)
    ) {
      continue;
    }
    const direction: Direction = row.signal_type === "bearish" ? "down" : "up";
    const key = `${row.symbol}|${row.signal_id}|${direction}`;
    if (seen.has(key)) continue;
    // Pro's module shows a bounded number of setups a day; the free list
    // honours that bound as a scan does (review, 2026-10-21).
    if (
      proBounded &&
      !symbolsShown.has(row.symbol) &&
      symbolsShown.size >= DEFAULT_PRO_INTRADAY_POLICY.setupsDisplayedPerDayMax
    ) {
      continue;
    }
    symbolsShown.add(row.symbol);
    seen.add(key);
    const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
    out.push({
      symbol: row.symbol,
      type: row.signal_id as SignalType,
      direction,
      entry: num(row.entry_level),
      stop: num(row.stop_loss_level),
      firstTarget: num(row.take_profit_1_level),
      masterTarget: num(meta.masterTarget),
      confidence: num(meta.confidence),
      at: row.poll_cycle_timestamp,
    });
  }
  return out;
}

interface PrefetchedBars {
  minute: Bar[];
  baseline: Bar[];
  daily: Bar[];
  /** When the batch arrived (DATA-DELAY-001: a bar is usable no earlier than its receipt). */
  receivedAt: string;
}

/**
 * The three bar series every symbol needs, read per asset class in batched
 * requests. Uses the same windows `buildInput` asks for one symbol at a time.
 * A symbol missing from a successful batch is read as having no bars, as a
 * per-symbol read would; a batch that throws is left to the per-symbol reads.
 */
async function prefetchBars(
  provider: Provider,
  universe: { symbol: string; kind: AssetKind }[],
  now: Date,
): Promise<Map<string, PrefetchedBars>> {
  const out = new Map<string, PrefetchedBars>();
  if (!provider.fetchBarsBatch) return out;
  const groups: { assetClass: "crypto" | "us_equity"; symbols: string[] }[] = [
    { assetClass: "us_equity", symbols: universe.filter((u) => u.kind !== "crypto").map((u) => u.symbol) },
    { assetClass: "crypto", symbols: universe.filter((u) => u.kind === "crypto").map((u) => u.symbol) },
  ];
  await Promise.all(
    groups
      .filter((g) => g.symbols.length > 0)
      .map(async ({ assetClass, symbols }) => {
        const marketClosed = assetClass === "us_equity" && equitySession(now) === "closed";
        const end = assetClass === "crypto" || !provider.isLive ? null : new Date(Date.now() - 16 * 60 * 1000);
        try {
          const [minute, baseline, daily] = await Promise.all([
            provider.fetchBarsBatch!(symbols, "1Min", daysAgo(marketClosed ? 6 : 2), end, assetClass),
            provider.fetchBarsBatch!(symbols, "5Min", daysAgo(BASELINE_DAYS), end, assetClass),
            provider.fetchBarsBatch!(symbols, "1Day", daysAgo(DAILY_HISTORY_DAYS), end, assetClass),
          ]);
          const key = (s: string) => (assetClass === "crypto" ? normalizeCryptoSymbol(s) : s.toUpperCase());
          const receivedAt = new Date().toISOString();
          for (const symbol of symbols) {
            out.set(symbol, {
              minute: minute.get(key(symbol)) ?? [],
              baseline: baseline.get(key(symbol)) ?? [],
              daily: daily.get(key(symbol)) ?? [],
              receivedAt,
            });
          }
        } catch (err) {
          console.error(`[intraday-scan] batched ${assetClass} bars failed, reading per symbol:`, err);
        }
      }),
  );
  return out;
}

/**
 * Assemble one symbol's scan input from three bar series.
 *
 * Minute bars for the live session (the resolution a fast move needs),
 * five-minute bars across recent sessions for the same-time-of-day volume
 * baseline, and daily bars for the previous close and the symbol's usual range.
 *
 * Any failure returns null rather than a partially-populated input: a scan
 * running on half a symbol's data produces confident nonsense, and the caller
 * reports the symbol as unreachable instead.
 */
async function buildInput(
  entry: { symbol: string; kind: AssetKind },
  todayEt: string,
  provider: Provider,
  lastAlerts: PriorAlert[],
  now: Date,
  dailyPlan: DailyPlanLevels | null = null,
  prefetched: PrefetchedBars | null = null,
): Promise<SymbolInput | null> {
  const { symbol, kind } = entry;
  const assetClass = kind === "crypto" ? "crypto" : "us_equity";

  // Crypto never closes. Equities do, and when they're closed there's no
  // fresher data to wait for — the scan runs on the most recent session's
  // bars instead of refusing to run at all (see pickSessionBars below).
  const marketClosed = assetClass === "us_equity" && equitySession(now) === "closed";

  // Crypto has no feed delay. Free IEX stock data can't serve the most recent
  // ~15 minutes, and asking for it returns an empty tail rather than an error —
  // which would look like a symbol that stopped trading.
  const end =
    assetClass === "crypto" || !provider.isLive ? null : new Date(Date.now() - 16 * 60 * 1000);

  // A closed market can mean a weekend, or a holiday sitting right next to
  // one, so the minute-bar lookback is widened to find the last session that
  // actually traded. Alpaca pages newest-first and drops the oldest bars past
  // `limit`, so widening this never costs the recent data the live path needs.
  const minuteLookbackDays = marketClosed ? 6 : 2;

  try {
    const [minuteBars, baselineBars, dailyBars] = prefetched
      ? [prefetched.minute.slice(-2000), prefetched.baseline.slice(-5000), prefetched.daily.slice(-INTRADAY_DAILY_FETCH_LIMIT)]
      : await Promise.all([
          provider.fetchBars(symbol, "1Min", daysAgo(minuteLookbackDays), end, assetClass, 2000),
          provider.fetchBars(symbol, "5Min", daysAgo(BASELINE_DAYS), end, assetClass, 5000),
          provider.fetchBars(symbol, "1Day", daysAgo(DAILY_HISTORY_DAYS), end, assetClass, INTRADAY_DAILY_FETCH_LIMIT),
        ]);

    const receivedAt = prefetched?.receivedAt ?? new Date().toISOString();
    const sessionBars = pickSessionBars(minuteBars, baselineBars, todayEt, marketClosed);
    if (sessionBars.bars.length === 0) return null;

    const last = sessionBars.bars[sessionBars.bars.length - 1];
    // The feed's policy for this instrument, resolved here on the server
    // (DATA-DELAY-001): the scan reads only what was usable when it ran.
    const feed = resolveFeedPolicy({ assetClass, isLive: provider.isLive, source: provider.name });
    const lastTf = timeframeForMinutes(sessionBars.intervalMinutes);
    // The quote is the last bar's close, at the time the bar closed (its
    // stamp is its open).
    const lastClose = lastTf ? barCloseAt(last.t, lastTf, assetClass) : null;
    // Completed sessions only, keyed as the alert replay keys them
    // (lib/scanner/priorClose.ts): a crypto daily bar is the UTC day.
    const crypto = assetClass === "crypto";
    const completedDaily = completedDailyBars(dailyBars, sessionBars.sessionDate, crypto);

    return {
      symbol,
      kind,
      bars: sessionBars.bars,
      barIntervalMinutes: sessionBars.intervalMinutes,
      prevClose: priorDailyClose(dailyBars, sessionBars.sessionDate, crypto),
      quote: lastClose ? { price: last.c, at: lastClose.toISOString() } : null,
      // The baseline must cover exactly the window today's bars cover, not the
      // window the wall clock covers. The free IEX feed can't serve the most
      // recent ~15 minutes, so today's cumulative volume stops there while a
      // baseline measured to `now` kept counting — which made every symbol read
      // roughly 0.5x normal through the morning and suppressed the alerts this
      // scanner exists to produce. Measure the baseline to the last bar we
      // actually received, against the same session the bars came from.
      volumeBaseline: volumeBaseline(
        baselineBars,
        etParts(new Date(last.t)).minutes,
        sessionBars.sessionDate,
        2,
        assetClass === "us_equity",
      ),
      dailyAtr: completedDaily.length > 2 ? atr(completedDaily.slice(-20), 14) : null,
      // Completed sessions only: the prior session's high and low are the old
      // top and bottom the crossing alerts read, and today is appended by the
      // scanner itself from the session's own bars.
      // Recent sessions' five-minute bars, rolled up by the scanner into Gann's
      // hourly chart ("the Hourly Chart will give the first change in trend").
      recentBars: baselineBars,
      priorDailyBars: completedDaily,
      // The volume half of the platform-wide liquidity floor, read off the
      // daily bars already fetched above for the ATR — see lib/scan/liquidity.ts.
      avgDailyVolume: readLiquidity(completedDaily)?.avgVolume ?? null,
      lastAlerts,
      marketClosed,
      dailyPlan,
      feedDelayMs: feed.contractualDelayMs,
      feed: feed.entitlement,
      receivedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Session bars at the best resolution available.
 *
 * Minute bars for today are preferred. When the feed returns none for today —
 * which happens on a thinly-traded name, or when the delayed window swallows a
 * short session — the five-minute series is used instead, and the caller is
 * told which, because a signal derived from five-minute bars can miss a move
 * that reverses inside one.
 *
 * When the market is closed and nothing has printed today at all (before the
 * open, over a weekend, or on a holiday), there is no "today" to fall back
 * within — the most recent session that actually traded is used instead, so a
 * closed market shows the last real move rather than nothing. `sessionDate`
 * always names which Eastern session the returned bars belong to, so callers
 * measuring "today's" volume or reference price against the right day.
 */
function pickSessionBars(
  minuteBars: Bar[],
  fallbackBars: Bar[],
  todayEt: string,
  marketClosed: boolean,
): { bars: Bar[]; intervalMinutes: number; sessionDate: string } {
  const minute = barsForSession(minuteBars, todayEt);
  if (minute.length > 0) return { bars: minute, intervalMinutes: 1, sessionDate: todayEt };

  const fiveMin = barsForSession(fallbackBars, todayEt);
  if (fiveMin.length > 0) return { bars: fiveMin, intervalMinutes: 5, sessionDate: todayEt };

  if (!marketClosed) return { bars: [], intervalMinutes: 1, sessionDate: todayEt };

  const staleDate = latestSessionDate(minuteBars) ?? latestSessionDate(fallbackBars);
  if (!staleDate || staleDate === todayEt) {
    return { bars: [], intervalMinutes: 1, sessionDate: todayEt };
  }

  const staleMinute = barsForSession(minuteBars, staleDate);
  if (staleMinute.length > 0) return { bars: staleMinute, intervalMinutes: 1, sessionDate: staleDate };

  return { bars: barsForSession(fallbackBars, staleDate), intervalMinutes: 5, sessionDate: staleDate };
}

/** The most recent Eastern calendar date any bar belongs to, or null if none. */
function latestSessionDate(bars: Bar[]): string | null {
  let latest: string | null = null;
  for (const bar of bars) {
    if (Number.isNaN(Date.parse(bar.t))) continue;
    const date = etDateKey(new Date(bar.t));
    if (latest === null || date > latest) latest = date;
  }
  return latest;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 3600 * 1000);
}

/**
 * The session label shown next to every result, so a scan run at 08:00 or on a
 * Saturday is never mistaken for a live one.
 */
function sessionLabelFor(nowEtMinute: number, now: Date): string {
  const weekday = etParts(now).weekday;
  if (weekday === 0 || weekday === 6) return "Weekend — US equity markets are closed";
  if (nowEtMinute < 4 * 60) return "Overnight — US equity markets are closed";
  if (nowEtMinute < 9 * 60 + 30) return "Pre-market";
  if (nowEtMinute < 16 * 60) return "Regular session";
  if (nowEtMinute < 20 * 60) return "After hours";
  return "Closed";
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
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
