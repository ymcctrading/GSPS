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
 * sends. `?dry=1` returns both reports as text without sending.
 *
 * Returns rather than drains (AGENTS.md, "Cycles as architecture"): each
 * evening reads its own session, so a missed evening is simply missed, never
 * carried into the next.
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getMarketDataProvider } from "@/lib/data/provider";
import { MARKET_DATA_UNAVAILABLE, syntheticDataRefusal } from "@/lib/data/feed-mode";
import { barSession, etDateKey, etParts, mostRecentClose, nextClose } from "@/lib/market/session";
import { isEarlyClose } from "@/lib/market/calendar";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { FOCUS_SIZE, type FocusReason } from "@/lib/scanner/focusList";
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
 * Who the test reports go to (owner, 2026-10-28). `OWNER_REPORT_EMAILS`
 * (comma-separated) overrides it once the owner widens the list.
 */
const DEFAULT_RECIPIENTS = ["icharles.coleman@gmail.com", "ymcctrading@gmail.com"];

function recipients(): string[] {
  const raw = process.env.OWNER_REPORT_EMAILS;
  const list = (raw ? raw.split(",") : DEFAULT_RECIPIENTS).map((e) => e.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set(list));
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
  detail: { currentPrice?: number; dayRange?: number; entryAwaitsCrossing?: boolean } | null;
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
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const marks: Record<string, number> = {};
  const mark = (k: string) => (marks[k] = Date.now() - startedAt);
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const now = new Date();
  const provider = getMarketDataProvider();
  if (syntheticDataRefusal("build the evening report", provider)) {
    return NextResponse.json({ error: MARKET_DATA_UNAVAILABLE, code: "synthetic_market_data" }, { status: 503 });
  }

  const close = mostRecentClose(now);
  const basisDate = etDateKey(close);
  const forDate = etDateKey(nextClose(now));
  const service = createServiceClient();

  // Tonight's plans: wait for the evening scan to store them.
  const { data: tonightRows, error: tonightError } = await service
    .from("daily_scans")
    .select("symbol, direction, output_state, score, entry, stop_loss, take_profit_1, master_profit, detail")
    .eq("scan_date", basisDate);
  if (tonightError) return NextResponse.json({ error: `Plans not read: ${tonightError.message}` }, { status: 500 });
  if (!tonightRows || tonightRows.length === 0) {
    return NextResponse.json({ sent: false, reason: `No plans stored for ${basisDate} yet; the evening scan hasn't finished.` }, { status: 202 });
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

  // The setups shown during the session: the latest stored before it.
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
  mark("stored");

  // The intraday signals each member received during the session: the bell
  // notices (exactly what was shown) and the member's own panel alerts.
  const dayStart = new Date(close.getTime() - 20 * 3_600_000).toISOString();
  const dayEnd = new Date(close.getTime() + 8 * 3_600_000).toISOString();
  const raw: Omit<IntradaySignal, "deliveries">[] = [];
  const { data: bells } = await service
    .from("in_app_notifications")
    .select("profile_id, symbol, title, body, created_at")
    .eq("verdict", "Intraday")
    .gte("created_at", dayStart)
    .lt("created_at", dayEnd)
    .limit(20000);
  for (const b of bells ?? []) {
    if (etDateKey(new Date(b.created_at as string)) !== basisDate) continue;
    const parsed = parseBellNotice(String(b.title ?? ""), String(b.body ?? ""));
    if (!parsed) continue;
    raw.push({ member: b.profile_id as string, symbol: b.symbol as string, at: b.created_at as string, ...parsed });
  }
  const { data: panel } = await service
    .from("intraday_alerts")
    .select("user_id, symbol, signal_id, signal_type, entry_level, stop_loss_level, take_profit_1_level, master_profit_level, created_at")
    .gte("created_at", dayStart)
    .lt("created_at", dayEnd)
    .limit(20000);
  for (const a of panel ?? []) {
    if (etDateKey(new Date(a.created_at as string)) !== basisDate) continue;
    const price = num(a.entry_level);
    const stop = num(a.stop_loss_level);
    if (price == null || stop == null) continue;
    raw.push({
      member: a.user_id as string,
      symbol: a.symbol as string,
      direction: sideOf(String(a.signal_type)),
      label: String(a.signal_id).replace(/_/g, " "),
      at: a.created_at as string,
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
    const { data: profiles } = await service.from("profiles").select("id, tier, is_demo").in("id", memberIds);
    const owners = new Set(recipients());
    let n = 0;
    for (const id of memberIds.sort()) {
      const p = (profiles ?? []).find((x) => x.id === id);
      const { data: user } = await service.auth.admin.getUserById(id).catch(() => ({ data: null }));
      const email = user?.user?.email?.toLowerCase() ?? "";
      const label = owners.has(email) ? `You (${email})` : `Member ${++n}`;
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
      batchBars(Array.from(new Set(signals.map((s) => s.symbol))), "1Min", new Date(close.getTime() - 8 * 3_600_000), end),
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

  const url = appUrl();
  const focusEmail = renderFocusEmail({ forDate, basisDate, focus, executable, appUrl: url });
  const recapEmail = renderRecapEmail({
    basisDate,
    setupsFrom,
    universe: LARGE_CAP_UNIVERSE.length,
    read: movers.length,
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
    marks,
  };
  if (dry) return NextResponse.json({ ...summary, focusEmail: focusEmail.text, recapEmail: recapEmail.text });

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
