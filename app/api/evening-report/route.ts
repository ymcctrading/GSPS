/**
 * GSPS — /api/evening-report: emails the owner the next session's focus list
 * and the recap of the session just closed (owner, 2026-10-28: "Start sending
 * the evening focus list as well as the daily recap, to icharles and
 * ymcctrading emails starting tonight ... for now, desire to run tests").
 *
 * Run by the database's scheduler after the evening daily scan has stored the
 * session's plans (migration 0123). It waits for them: with no plans stored
 * for the session yet it sends nothing and says so, and the later run sends.
 * Each report carries an idempotency key for its session, so the second run on
 * an evening that already sent is a no-op at Resend. Off every user's path.
 *
 * The reports themselves are pure (`lib/reports/eveningReport.ts`); this route
 * reads the stored plans, focus list and intraday notices, the day's bars, and
 * sends. `?dry=1` returns both reports as text without sending. `?late=1`
 * (owner, 2026-10-28, after gsps.world's suspension held the first evening's
 * send past midnight: "Send the email now") sends the last session's reports
 * after its evening has passed, while the next session has not yet closed; the
 * scheduled runs never pass it.
 *
 * The owner's own session may read the reports without sending: `?dry=1`
 * signed in as one of the two owner accounts (`lib/auth/owner.ts`) returns
 * the text, the coverage stages and each mover's attribution. Any other
 * session, or a dry read with neither, gets a 404, so hindsight data reaches
 * no one else (owner, 2026-10-28). A signed-in owner can never send.
 *
 * Returns rather than drains (AGENTS.md, "Cycles as architecture"): each
 * evening reads its own session, so a missed evening is simply missed, never
 * carried into the next.
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ownerOf } from "@/lib/auth/owner";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getMarketDataProvider } from "@/lib/data/provider";
import { MARKET_DATA_UNAVAILABLE, syntheticDataRefusal } from "@/lib/data/feed-mode";
import { barSession, etDateKey, etParts, mostRecentClose, nextClose } from "@/lib/market/session";
import { isEarlyClose } from "@/lib/market/calendar";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { FOCUS_SIZE, FOCUS_STORED, type FocusReason } from "@/lib/scanner/focusList";
import { ownerReportRecipients } from "@/lib/auth/owner";
import { barCloseAt, etInstant, availability, resolveFeedPolicy } from "@/lib/data/timeliness";
import {
  attributePrefilter,
  attributeSweep,
  distinctDetections,
  focusStanding,
  moverAttributionLine,
  remainingAfter,
  stage,
  type CoverageStages,
  type FocusListRow,
  type MoverOutcome,
  type SystemDetection,
} from "@/lib/reports/coverage";
import { SIGNAL_LABELS } from "@/lib/scanner/intradayDisplay";
import { appUrl, fromHeader, sandboxBlockReason } from "@/lib/notifications/resend-handler";
import type { AssetClass, Bar, Timeframe } from "@/lib/types";
import {
  firstDeliveries,
  judgeDailySetup,
  judgeIntradaySignal,
  parseBellNotice,
  renderFocusEmail,
  renderRecapEmail,
  toMover,
  type DailySetup,
  type FocusRow,
  type IntradaySignal,
  type Mover,
  type NextPlan,
  type Side,
} from "@/lib/reports/eveningReport";

export const maxDuration = 60;

/**
 * Who the test reports go to: the owner's two accounts only
 * (`lib/auth/owner.ts`). `OWNER_REPORT_EMAILS` may narrow the list but never
 * widen it (owner, 2026-10-28: hindsight ranking goes to those two accounts
 * and no one else).
 */
function recipients(): string[] {
  return ownerReportRecipients();
}

type ScanRow = {
  symbol: string;
  direction: string;
  output_state: string;
  score: number | string;
  entry: number | string | null;
  stop_loss: number | string | null;
  take_profit_1: number | string | null;
  master_profit: number | string | null;
  detail: { currentPrice?: number; dayRange?: number; entryAwaitsCrossing?: boolean; scannedAt?: string } | null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const sideOf = (d: string): Side => (d === "bearish" ? "bearish" : "bullish");
const assetOf = (symbol: string): AssetClass => (symbol.includes("/") ? "crypto" : "us_equity");

function toNextPlan(r: ScanRow): NextPlan | null {
  const entry = num(r.entry);
  const stop = num(r.stop_loss);
  if (entry == null || stop == null) return null;
  const verdict = r.output_state === "Execute" || r.output_state === "Watch" ? r.output_state : "Reject";
  return {
    symbol: r.symbol,
    direction: sideOf(r.direction),
    verdict,
    score: num(r.score) ?? 0,
    entry,
    stop,
    tp1: num(r.take_profit_1),
    mtp: num(r.master_profit),
    price: num(r.detail?.currentPrice),
    dayRange: num(r.detail?.dayRange),
    entryAwaitsCrossing: r.detail?.entryAwaitsCrossing === true,
  };
}

/** The bell's label back to the signal's stored id. */
const signalIdOfLabel = new Map(Object.entries(SIGNAL_LABELS).map(([id, label]) => [label.toLowerCase(), id]));

/** Rows a read returns in one page: PostgREST stops at 1,000 without an error. */
const PAGE = 1000;
const MAX_PAGES = 20;

async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE, (i + 1) * PAGE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return { rows, error: null };
}

/** The basis session's bars: its regular session for a stock, its New York day for crypto. */
function sessionBarsOf(bars: Bar[], basisDate: string, asset: AssetClass): Bar[] {
  return bars.filter((b) => etDateKey(new Date(b.t)) === basisDate && (asset === "crypto" || barSession(b.t, asset) === "regular"));
}

async function batchBars(symbols: string[], timeframe: Timeframe, start: Date, end: Date): Promise<Map<string, Bar[]>> {
  const provider = getMarketDataProvider();
  const out = new Map<string, Bar[]>();
  const equities = symbols.filter((s) => assetOf(s) === "us_equity");
  const crypto = symbols.filter((s) => assetOf(s) === "crypto");
  const reads: Promise<void>[] = [];
  if (equities.length > 0 && provider.fetchBarsBatch) {
    reads.push(provider.fetchBarsBatch(equities, timeframe, start, end, "us_equity").then((m) => { for (const [k, v] of m) out.set(k, v); }));
  }
  if (crypto.length > 0 && provider.fetchBarsBatch) {
    reads.push(provider.fetchBarsBatch(crypto, timeframe, start, end, "crypto").then((m) => { for (const [k, v] of m) out.set(k, v); }));
  }
  await Promise.all(reads);
  return out;
}

/** A crypto pair is keyed without its slash by some reads; find it either way. */
function barsFor(map: Map<string, Bar[]>, symbol: string): Bar[] {
  return map.get(symbol) ?? map.get(symbol.toUpperCase()) ?? map.get(symbol.replace("/", "")) ?? [];
}

export async function GET(req: NextRequest) {
  const cron = isCronAuthorized(req.headers.get("authorization"));
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  if (!cron) {
    // Only the owner's own session, and only a dry read: nothing is sent.
    if (!dry) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!ownerOf(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const startedAt = Date.now();
  const marks: Record<string, number> = {};
  const mark = (k: string) => (marks[k] = Date.now() - startedAt);
  const late = req.nextUrl.searchParams.get("late") === "1";
  const now = new Date();
  const provider = getMarketDataProvider();
  if (syntheticDataRefusal("build the evening report", provider)) {
    return NextResponse.json({ error: MARKET_DATA_UNAVAILABLE, code: "synthetic_market_data" }, { status: 503 });
  }

  const close = mostRecentClose(now);
  const basisDate = etDateKey(close);
  const forDate = etDateKey(nextClose(now));
  // Only on the evening of the session itself: after a holiday the last close
  // is an earlier session, already reported (Resend's keys last 24 hours).
  if (etDateKey(now) !== basisDate && !late) {
    return NextResponse.json({ sent: false, reason: `No session closed today (${etDateKey(now)}); ${basisDate} was reported on its own evening.` }, { status: 202 });
  }
  const service = createServiceClient();

  // Tonight's plans: wait for the evening scan, the first read after the close.
  const { data: tonightRows, error: tonightError } = await service
    .from("daily_scans")
    .select("symbol, direction, output_state, score, entry, stop_loss, take_profit_1, master_profit, detail")
    .eq("scan_date", basisDate);
  if (tonightError) return NextResponse.json({ error: `Plans not read: ${tonightError.message}` }, { status: 500 });
  // The market scan writes the session's rows all day; only a read stamped
  // after the close has seen the closing bar.
  const readAfterClose = (tonightRows ?? []).some((r) => {
    const at = (r as ScanRow).detail?.scannedAt;
    return typeof at === "string" && Date.parse(at) >= close.getTime();
  });
  if (!readAfterClose) {
    return NextResponse.json({ sent: false, reason: `The plans for ${basisDate} haven't been read after the close yet.` }, { status: 202 });
  }
  const tonight = new Map<string, NextPlan>();
  for (const r of tonightRows as ScanRow[]) {
    const p = toNextPlan(r);
    if (p && (!tonight.has(p.symbol) || tonight.get(p.symbol)!.verdict === "Reject")) tonight.set(p.symbol, p);
  }

  const { data: focusRows } = await service
    .from("intraday_focus")
    .select("rank, symbol, reasons, close")
    .eq("basis_date", basisDate)
    .is("invalidated_at", null)
    .order("rank", { ascending: true })
    .limit(FOCUS_SIZE);
  const focus: FocusRow[] = (focusRows ?? []).map((f) => ({
    rank: f.rank as number,
    symbol: f.symbol as string,
    reasons: (f.reasons ?? []) as FocusReason[],
    close: num(f.close) ?? 0,
    plan: tonight.get(f.symbol as string) ?? null,
  }));
  const executable = [...tonight.values()].filter((p) => p.verdict === "Execute").sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));

  // The setups standing at the prior close: the last stored before the session.
  // The market scan rewrites the session's own rows through the day, so these
  // are the plans a member woke up to, not every intraday revision.
  const { data: priorDateRow } = await service.from("daily_scans").select("scan_date").lt("scan_date", basisDate).order("scan_date", { ascending: false }).limit(1);
  const setupsFrom = (priorDateRow?.[0]?.scan_date as string | undefined) ?? null;
  const setups: DailySetup[] = [];
  let priorFocus = new Set<string>();
  if (setupsFrom) {
    const { data } = await service
      .from("daily_scans")
      .select("symbol, direction, output_state, score, entry, stop_loss, take_profit_1, master_profit, detail")
      .eq("scan_date", setupsFrom)
      .in("output_state", ["Execute", "Watch"]);
    for (const r of (data ?? []) as ScanRow[]) {
      const p = toNextPlan(r);
      if (!p || p.verdict === "Reject") continue;
      setups.push({ symbol: p.symbol, direction: p.direction, verdict: p.verdict, score: p.score, entry: p.entry, stop: p.stop, tp1: p.tp1, mtp: p.mtp, entryAwaitsCrossing: p.entryAwaitsCrossing });
    }
    const { data: pf } = await service.from("intraday_focus").select("symbol").eq("basis_date", setupsFrom).order("rank", { ascending: true }).limit(FOCUS_SIZE);
    priorFocus = new Set((pf ?? []).map((r) => r.symbol as string));
  }
  // Every focus row from the prior basis to the session's own (the session's
  // own list is built after its close, so it earns no pre-session credit),
  // reserves included: the list stores FOCUS_STORED and times FOCUS_SIZE.
  const focusRowsBySymbol = new Map<string, FocusListRow[]>();
  {
    const { data: fr } = await service
      .from("intraday_focus")
      .select("basis_date, symbol, rank, built_at")
      .gte("basis_date", setupsFrom ?? basisDate)
      .lte("basis_date", basisDate)
      .order("basis_date", { ascending: true })
      .order("rank", { ascending: true })
      .limit(FOCUS_STORED * 8);
    for (const r of fr ?? []) {
      const sym = String(r.symbol).toUpperCase();
      focusRowsBySymbol.set(sym, [...(focusRowsBySymbol.get(sym) ?? []), { basisDate: String(r.basis_date), rank: Number(r.rank), builtAt: (r.built_at as string | null) ?? null }]);
    }
  }
  mark("stored");

  // What the pipeline itself recorded about the session, for the coverage
  // stages and each mover's attribution. All owner-only hindsight.
  // The overnight sweep is filed under the session it is for.
  type SweepDbRow = { symbol: string; direction: string | null; score: number | string | null; output_state: string | null; setup_kind: string | null; entry: number | string | null; error: string | null };
  const sweepRows = await readAll<SweepDbRow>((from, to) =>
    service.from("universe_sweep").select("symbol, direction, score, output_state, setup_kind, entry, error").eq("basis_date", basisDate).order("symbol", { ascending: true }).range(from, to),
  );
  const sweepOf = new Map(sweepRows.rows.map((r) => [r.symbol.toUpperCase(), r]));
  // The market scan's pre-filter keeps one row per stock per day, overwritten
  // by each scan: the day's last reading, not a history.
  type PrefilterDbRow = { symbol: string; atr_pct: number | string | null; cleared_reversion: boolean | null; cleared_continuation: boolean | null; shortlisted: boolean | null; full_scan_score: number | string | null; full_scan_output_state: string | null };
  const prefilterRows = await readAll<PrefilterDbRow>((from, to) =>
    service
      .from("coarse_gate_telemetry")
      .select("symbol, atr_pct, cleared_reversion, cleared_continuation, shortlisted, full_scan_score, full_scan_output_state")
      .eq("scan_date", basisDate)
      .order("symbol", { ascending: true })
      .range(from, to),
  );
  const prefilterOf = new Map(prefilterRows.rows.map((r) => [r.symbol.toUpperCase(), r]));
  // System detections: what the scheduled intraday scan found, delivered or not.
  type SystemDbRow = { symbol: string; signal_id: string; signal_type: string; poll_cycle_timestamp: string | null; created_at: string; metadata: { dataTimestamp?: string; barIntervalMinutes?: number } | null };
  const systemRows = await readAll<SystemDbRow>((from, to) =>
    service
      .from("intraday_system_alerts")
      .select("symbol, signal_id, signal_type, poll_cycle_timestamp, created_at, metadata")
      .gte("created_at", dayStart)
      .lt("created_at", dayEnd)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const detectionsRaw: SystemDetection[] = [];
  for (const r of systemRows.rows) {
    const evaluatedAt = r.poll_cycle_timestamp ?? r.created_at;
    if (etDateKey(new Date(evaluatedAt)) !== basisDate) continue;
    const asset = assetOf(r.symbol);
    const tf: Timeframe = r.metadata?.barIntervalMinutes === 15 ? "15Min" : "1Min";
    const dataBarOpen = typeof r.metadata?.dataTimestamp === "string" ? r.metadata.dataTimestamp : null;
    const delayMs = resolveFeedPolicy({ assetClass: asset, isLive: true, source: "alpaca" }).contractualDelayMs;
    const usable = dataBarOpen ? availability(barCloseAt(dataBarOpen, tf, asset), delayMs) : null;
    detectionsRaw.push({
      symbol: r.symbol.toUpperCase(),
      kind: r.signal_id,
      side: r.signal_type === "bearish" ? "bearish" : "bullish",
      evaluatedAt,
      dataBarOpen,
      usableAt: usable ? usable.usableAt.toISOString() : null,
    });
  }
  const detections = distinctDetections(detectionsRaw);
  // Orders placed during the session, and those filled: counts only.
  const sessionOpenAt = etInstant(basisDate, 9 * 60 + 30);
  const { count: ordersPlaced, error: ordersError } = await service
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sessionOpenAt.toISOString())
    .lt("created_at", close.toISOString());
  const { count: ordersFilled, error: filledError } = await service
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sessionOpenAt.toISOString())
    .lt("created_at", close.toISOString())
    .gt("filled_qty", 0);
  mark("pipeline records");

  // The intraday signals each member received during the session: the bell
  // notices (exactly what was shown) and the member's own panel alerts.
  const dayStart = new Date(close.getTime() - 20 * 3_600_000).toISOString();
  const dayEnd = new Date(close.getTime() + 8 * 3_600_000).toISOString();
  const raw: Omit<IntradaySignal, "deliveries">[] = [];
  type BellRow = { profile_id: string | null; symbol: string; title: string | null; body: string | null; created_at: string };
  const bells = await readAll<BellRow>((from, to) =>
    service
      .from("in_app_notifications")
      .select("profile_id, symbol, title, body, created_at")
      .eq("verdict", "Intraday")
      .gte("created_at", dayStart)
      .lt("created_at", dayEnd)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (bells.error) return NextResponse.json({ error: `Notices not read: ${bells.error}` }, { status: 500 });
  for (const b of bells.rows) {
    if (!b.profile_id) continue;
    if (etDateKey(new Date(b.created_at as string)) !== basisDate) continue;
    const parsed = parseBellNotice(String(b.title ?? ""), String(b.body ?? ""));
    if (!parsed) continue;
    // Keyed by the signal's id, so one signal seen on the bell and the panel counts once.
    const kind = signalIdOfLabel.get(parsed.label.toLowerCase()) ?? parsed.label.toLowerCase();
    raw.push({ member: b.profile_id, symbol: b.symbol, at: b.created_at, ...parsed, label: kind });
  }
  type PanelRow = {
    user_id: string | null;
    symbol: string;
    signal_id: string;
    signal_type: string;
    entry_level: number | string | null;
    stop_loss_level: number | string | null;
    take_profit_1_level: number | string | null;
    master_profit_level: number | string | null;
    created_at: string;
  };
  const panel = await readAll<PanelRow>((from, to) =>
    service
      .from("intraday_alerts")
      .select("user_id, symbol, signal_id, signal_type, entry_level, stop_loss_level, take_profit_1_level, master_profit_level, created_at")
      .gte("created_at", dayStart)
      .lt("created_at", dayEnd)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (panel.error) return NextResponse.json({ error: `Panel alerts not read: ${panel.error}` }, { status: 500 });
  for (const a of panel.rows) {
    if (!a.user_id) continue;
    if (etDateKey(new Date(a.created_at as string)) !== basisDate) continue;
    const price = num(a.entry_level);
    const stop = num(a.stop_loss_level);
    if (price == null || stop == null) continue;
    raw.push({
      member: a.user_id,
      symbol: a.symbol,
      direction: sideOf(String(a.signal_type)),
      label: String(a.signal_id),
      at: a.created_at,
      price,
      stop,
      tp1: num(a.take_profit_1_level),
      mtp: num(a.master_profit_level),
    });
  }
  const signals = firstDeliveries(raw);

  // Members, labelled for the owner: the recipients' own accounts by address,
  // everyone else by number, tier and whether it is a demo account.
  const memberIds = Array.from(new Set(signals.map((s) => s.member)));
  const labelOf = new Map<string, string>();
  const tierOf = new Map<string, string>();
  if (memberIds.length > 0) {
    const profiles = new Map<string, { tier: string | null; is_demo: boolean | null }>();
    for (let i = 0; i < memberIds.length; i += 200) {
      const { data } = await service.from("profiles").select("id, tier, is_demo").in("id", memberIds.slice(i, i + 200));
      for (const p of data ?? []) profiles.set(p.id as string, { tier: p.tier as string | null, is_demo: p.is_demo as boolean | null });
    }
    // The recipients' own accounts, read once (one page of users).
    const owners = new Set(recipients());
    const ownerEmailOf = new Map<string, string>();
    const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 }).catch(() => ({ data: null }));
    for (const u of users?.users ?? []) {
      const email = u.email?.toLowerCase();
      if (email && owners.has(email)) ownerEmailOf.set(u.id, email);
    }
    let n = 0;
    for (const id of memberIds.sort()) {
      const p = profiles.get(id);
      const email = ownerEmailOf.get(id);
      const label = email ? `You (${email})` : `Member ${++n}`;
      labelOf.set(id, label);
      tierOf.set(label, `${p?.tier ?? ""}${p?.is_demo ? ", demo" : ""}`);
    }
  }
  for (const s of signals) s.member = labelOf.get(s.member) ?? s.member;
  mark("signals");

  // Bars: the universe's daily bars for the movers, the setups' 15-minute bars
  // and the signals' 1-minute bars for the session.
  const end = new Date(Math.min(now.getTime(), close.getTime() + 8 * 3_600_000));
  let daily: Map<string, Bar[]>;
  let fifteen: Map<string, Bar[]>;
  let minute: Map<string, Bar[]>;
  try {
    [daily, fifteen, minute] = await Promise.all([
      batchBars(LARGE_CAP_UNIVERSE, "1Day", new Date(close.getTime() - 14 * 86_400_000), end),
      batchBars(Array.from(new Set(setups.map((s) => s.symbol))), "15Min", new Date(close.getTime() - 20 * 3_600_000), end),
      batchBars(Array.from(new Set([...signals.map((s) => s.symbol), ...detections.map((d) => d.symbol)])), "1Min", new Date(close.getTime() - 8 * 3_600_000), end),
    ]);
  } catch (err) {
    return NextResponse.json({ error: `Bars not read: ${String(err)}` }, { status: 502 });
  }
  mark("bars");

  const movers: Mover[] = [];
  const prevCloseOf = new Map<string, number>();
  for (const symbol of LARGE_CAP_UNIVERSE) {
    const bars = barsFor(daily, symbol);
    const i = bars.findIndex((b) => etDateKey(new Date(b.t)) === basisDate);
    if (i < 1) continue;
    const day = bars[i];
    prevCloseOf.set(symbol, bars[i - 1].c);
    const m = toMover({ symbol, prevClose: bars[i - 1].c, open: day.o, high: day.h, low: day.l, close: day.c });
    if (m) movers.push(m);
  }

  const dailyJudged = setups.map((s) => {
    const asset = assetOf(s.symbol);
    const bars = sessionBarsOf(barsFor(fifteen, s.symbol), basisDate, asset);
    const prev = prevCloseOf.get(s.symbol) ?? null;
    return judgeDailySetup(s, bars, prev);
  });

  // The Intraday style closes from 3:45 PM ET (12:45 PM on an early close).
  const cutoffMinutes = isEarlyClose(basisDate) ? 12 * 60 + 45 : 15 * 60 + 45;
  const cutoffMs = close.getTime() - (etParts(close).minutes - cutoffMinutes) * 60_000;
  const intradayJudged = signals.map((s) => {
    const asset = assetOf(s.symbol);
    return judgeIntradaySignal(s, sessionBarsOf(barsFor(minute, s.symbol), basisDate, asset), asset === "crypto" ? close.getTime() : cutoffMs);
  });
  mark("judged");

  // Coverage by stage, each counted on its own (lib/reports/coverage.ts).
  const sweptOk = sweepRows.rows.filter((r) => !r.error).length;
  const candidates = sweepRows.rows.filter((r) => !r.error && (r.output_state === "Execute" || r.output_state === "Watch") && (r.direction === "bullish" || r.direction === "bearish")).length;
  const deliveredDistinct = new Set(signals.map((s2) => `${s2.symbol}|${s2.direction}|${s2.label}`)).size;
  const coverage: CoverageStages = {
    priceData: stage(movers.length, `of ${LARGE_CAP_UNIVERSE.length} in the scan universe, prior close and session both read`),
    selected: stage(null, "the intraday scan's selection is not recorded; see the evaluation ledger proposal"),
    evaluated: stage(sweepRows.error ? null : sweptOk, `overnight sweep readings without an error${prefilterRows.error ? "" : `; the daytime pre-filter's last reading covered ${prefilterRows.rows.length}`}`),
    deferredCapacity: stage(null, "not recorded before the evaluation ledger"),
    unavailable: stage(sweepRows.error ? null : sweepRows.rows.length - sweptOk, "overnight sweep readings that failed"),
    candidates: stage(sweepRows.error ? null : candidates, "overnight Execute or Watch with a side"),
    plansQualified: stage(setups.filter((x) => x.verdict === "Execute").length, `Execute plans standing at the prior close (${setups.length} Execute or Watch)`),
    detected: stage(systemRows.error ? null : detections.length, "distinct system detections (symbol, kind, side)"),
    delivered: stage(deliveredDistinct, `distinct signals delivered to a member (${signals.length} member-signal pairs)`),
    entries: stage(ordersError ? null : ordersPlaced, "orders placed during the session, any source"),
    simulated: stage(dailyJudged.length + intradayJudged.length, "simplified: plan stop and TP1 only, no trailing exits, costs or delay"),
    fills: stage(filledError ? null : ordersFilled, "orders placed during the session with a fill"),
  };

  const attribution = new Map<string, { outcome: MoverOutcome; line: string }>();
  const executeSyms = new Set(setups.filter((x) => x.verdict === "Execute").map((x) => x.symbol.toUpperCase()));
  const watchSyms = new Set(setups.filter((x) => x.verdict === "Watch").map((x) => x.symbol.toUpperCase()));
  for (const m of movers) {
    const sym = m.symbol.toUpperCase();
    const sw = sweepOf.get(sym) ?? null;
    const pre = prefilterOf.get(sym) ?? null;
    const side: Side = m.dollars >= 0 ? "bullish" : "bearish";
    const mine = detections.filter((d) => d.symbol === sym);
    const first = mine[0] ?? null;
    const sweep = attributeSweep(
      sw ? { state: sw.output_state, score: num(sw.score), direction: sw.direction, setupKind: sw.setup_kind, entry: num(sw.entry), error: sw.error } : null,
      m.prevClose,
      pre ? num(pre.atr_pct) : null,
    );
    const firstBars = first ? sessionBarsOf(barsFor(minute, sym), basisDate, assetOf(sym)) : [];
    attribution.set(
      m.symbol,
      moverAttributionLine({
        symbol: sym,
        side,
        sweep,
        sweepState: sw?.output_state ?? null,
        sweepError: Boolean(sw?.error),
        prefilter: attributePrefilter(
          pre
            ? {
                clearedReversion: pre.cleared_reversion === true,
                clearedContinuation: pre.cleared_continuation === true,
                shortlisted: pre.shortlisted === true,
                fullScanScore: num(pre.full_scan_score),
                fullScanState: pre.full_scan_output_state,
              }
            : null,
        ),
        focus: focusStanding(focusRowsBySymbol.get(sym) ?? [], basisDate, sessionOpenAt),
        detections: mine,
        deliveries: new Set(signals.filter((s2) => s2.symbol.toUpperCase() === sym).map((s2) => `${s2.direction}|${s2.label}`)).size,
        executePlan: executeSyms.has(sym),
        watchPlan: watchSyms.has(sym),
        examined: sw != null || pre != null,
        remainingAfterFirst: first ? remainingAfter(firstBars, first.usableAt ? new Date(first.usableAt) : null, first.side) : null,
      }),
    );
  }

  const url = appUrl();
  const focusEmail = renderFocusEmail({ forDate, basisDate, focus, executable, appUrl: url });
  const recapEmail = renderRecapEmail({
    basisDate,
    setupsFrom,
    coverage,
    attribution,
    movers,
    daily: dailyJudged,
    intraday: intradayJudged,
    focus: priorFocus,
    members: tierOf,
    appUrl: url,
  });

  const summary = {
    basisDate,
    forDate,
    setupsFrom,
    executable: executable.map((p) => p.symbol),
    focus: focus.length,
    movers: movers.length,
    setups: setups.length,
    signals: signals.length,
    detections: detections.length,
    marks,
  };
  if (dry) {
    return NextResponse.json(
      { ...summary, coverage, attribution: Object.fromEntries(attribution), focusEmail: focusEmail.text, recapEmail: recapEmail.text },
      { headers: { "cache-control": "private, no-store" } },
    );
  }

  if (!process.env.RESEND_API_KEY) return NextResponse.json({ ...summary, sent: false, reason: "RESEND_API_KEY is not set." }, { status: 503 });
  const to = recipients().filter((e) => {
    const blocked = sandboxBlockReason(e);
    if (blocked) console.warn(`[evening-report] ${blocked}`);
    return !blocked;
  });
  if (to.length === 0) return NextResponse.json({ ...summary, sent: false, reason: "Every recipient is blocked by the sender's sandbox." }, { status: 503 });
  const resend = new Resend(process.env.RESEND_API_KEY);
  const sends = await Promise.all(
    [
      { mail: focusEmail, key: `evening-focus-${basisDate}`, from: "GSPS Focus List" },
      { mail: recapEmail, key: `daily-recap-${basisDate}`, from: "GSPS Daily Recap" },
    ].map(async ({ mail, key, from }) => {
      const result = await resend.emails.send({ from: fromHeader(from), to, subject: mail.subject, html: mail.html, text: mail.text }, { idempotencyKey: key });
      return { key, id: result.data?.id ?? null, error: result.error?.message ?? null };
    }),
  );
  const failed = sends.filter((s) => s.error);
  return NextResponse.json({ ...summary, to, sends, ms: Date.now() - startedAt }, { status: failed.length > 0 ? 502 : 200 });
}
