/**
 * GSPS — the pre-open notice: before the session, each equity plan whose line
 * is within reach that morning (owner, 2026-10-28, on TXN: up $28 over three
 * sessions with nothing said until the evening; "catch moves before they
 * run").
 *
 * Gann chose his stocks from the daily charts the night before and timed them
 * in the session (Master Course Ch. 13; *Truth of the Stock Tape* Ch. XIV).
 * The night's plan names the line (the old level its crossing waits on, W006
 * p.20, Rules 3(b)-(c), through `planLineAhead`), and the session's own
 * notices (`line_approach`, `line_crossed`) tell a member once price nears or
 * trades through it. Before the open no session has traded, so the only
 * reading is the prior close; this notice says which lines that close left
 * within reach, so a member can be watching before the first bar.
 *
 * "Within reach" is the method's own measure of near, not a chosen
 * threshold: the line ahead of the prior close by no more than Gann's 3-point
 * allowance at the line (`threePoints`, the same reading
 * `focusList.ts#breakawayLinesFirst` orders its breakaway lines by). A plan
 * whose prior close already stands through its stop is retired, not within
 * reach of anything. Resting and expired plans are left out (the route reads
 * their flags), and only US equities are read (owner, 2026-10-28: equities
 * only on the scans for now).
 *
 * Wording (NOTIFY-FRESHNESS-001): everything is as of that close. No "now",
 * no arrival time, no minutes away; the message says the price has not been
 * checked since the close and that it is not a buy. Every delivery passes
 * `checkNotificationFreshness` first, as an observation on the daily chart:
 * on the delayed feed it is informational at best, and suppressed when its
 * provenance is missing or its time has passed. Push and the bell only, never
 * email.
 *
 * Mandate: 1. Gann as above; nothing new is decided here, the plan's line and
 * the allowance are the method's. 2. No periodicity claim (Dewey N/A); the
 * line-notice replay (`lib/backtest/lineNotices.ts`) is where a notice is read
 * against its base rate. 3. Cause and Effect: the close left the line within
 * reach (cause), the session decides whether it is crossed (effect), and the
 * notice claims only the first. Law of Creation: the night's plan ⊗ the
 * morning's attention; the plan alone was TXN's, and nobody was watching it.
 */

import { pricePoint, threePoints } from "@/lib/gann/pointScale";
import { isTradingDay } from "@/lib/market/calendar";
import { isCryptoSymbol } from "@/lib/market/cryptoSymbol";
import { etDateKey, etParts } from "@/lib/market/session";
import { planLineAhead, type DailyPlanLevels } from "@/lib/scanner/intraday";
import type { DeliverableFreshness } from "@/lib/notifications/intradayBell";
import type { FreshnessEvidence } from "@/lib/notifications/freshness";
import type { PushMessage } from "@/lib/notifications/web-push";
import { tickerHref } from "@/lib/routes";

/** The notice's window, in New York minutes: from 8:30 to the 9:30 open. */
export const PRE_OPEN_FROM_MINUTE = 8 * 60 + 30;
export const PRE_OPEN_TO_MINUTE = 9 * 60 + 30;
/** Lines named in one push; the bell carries one row a symbol. */
export const PRE_OPEN_PUSH_LINES = 6;
/** The bell's and the log's label for the notice. */
export const PRE_OPEN_LABEL = "Line within reach before the open";

export interface PreOpenLine {
  symbol: string;
  direction: "up" | "down";
  verdict: "Execute" | "Watch";
  entry: number;
  stop: number;
  /** The line the session would have to reach: the entry, or the close that confirms it. */
  line: number;
  confirmingClose: number;
  atEntry: boolean;
  prevClose: number;
  /** The prior session's New York date. */
  prevSession: string;
  /** Dollars from the prior close to the line. */
  distance: number;
  /** The same in the method's points at the line (3 at most). */
  points: number;
  /** distance / the 3-point allowance, 0 to 1: the order of the list. */
  nearness: number;
}

/** True from 8:30 to the 9:30 open, New York time, on a trading day. */
export function inPreOpenWindow(now: Date): boolean {
  if (!isTradingDay(now)) return false;
  const m = etParts(now).minutes;
  return m >= PRE_OPEN_FROM_MINUTE && m < PRE_OPEN_TO_MINUTE;
}

/**
 * The plan's line within reach of the prior close, or null. Pure.
 */
export function readPreOpenLine(
  symbol: string,
  plan: DailyPlanLevels,
  prevClose: number | null | undefined,
  prevSession: string,
): PreOpenLine | null {
  if (isCryptoSymbol(symbol)) return null;
  if (prevClose == null || !(prevClose > 0)) return null;
  const up = plan.direction === "up";
  // A close through the stop retired the plan; there is no line to reach.
  if (up ? prevClose <= plan.stop : prevClose >= plan.stop) return null;
  const ahead = planLineAhead(plan, prevClose);
  if (!ahead) return null;
  const distance = up ? ahead.line - prevClose : prevClose - ahead.line;
  const allowance = threePoints(ahead.line);
  if (!(distance > 0) || !(allowance > 0) || distance > allowance) return null;
  return {
    symbol,
    direction: plan.direction,
    verdict: plan.verdict,
    entry: plan.entry,
    stop: plan.stop,
    line: ahead.line,
    confirmingClose: ahead.confirmingClose,
    atEntry: ahead.atEntry,
    prevClose,
    prevSession,
    distance,
    points: distance / pricePoint(ahead.line),
    nearness: distance / allowance,
  };
}

/**
 * Every plan's line within reach, nearest first (in allowances), Execute
 * before Watch on a tie, then by symbol. `skip` holds symbols whose stored
 * plan is resting or expired. Pure.
 */
export function readPreOpenLines(
  plans: ReadonlyMap<string, DailyPlanLevels>,
  closes: ReadonlyMap<string, { close: number; session: string }>,
  skip: ReadonlySet<string> = new Set(),
): PreOpenLine[] {
  const out: PreOpenLine[] = [];
  for (const [symbol, plan] of plans) {
    if (skip.has(symbol)) continue;
    const c = closes.get(symbol);
    if (!c) continue;
    const line = readPreOpenLine(symbol, plan, c.close, c.session);
    if (line) out.push(line);
  }
  return out.sort(
    (a, b) =>
      a.nearness - b.nearness ||
      Number(b.verdict === "Execute") - Number(a.verdict === "Execute") ||
      a.symbol.localeCompare(b.symbol),
  );
}

/**
 * The freshness evidence of one line: an observation on the daily chart, its
 * data the prior session's close, read when the route ran. Never actionable:
 * no scan authorised an entry, and a close is not a price at the open.
 */
export function preOpenEvidence(
  line: Pick<PreOpenLine, "symbol">,
  args: { closeAt: Date; evaluatedAt: Date; feed: FreshnessEvidence["feed"]; delayMs: number },
): FreshnessEvidence {
  return {
    symbol: line.symbol,
    purpose: "observation",
    feed: args.feed,
    delayMs: args.delayMs,
    dataAsOf: args.closeAt.toISOString(),
    evaluatedAt: args.evaluatedAt.toISOString(),
    barMinutes: 24 * 60,
  };
}

function price(value: number): string {
  return value >= 1 ? value.toFixed(2) : value.toPrecision(4);
}

/** "Oct 27" for a New York date key. */
function sessionLabel(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export interface PreOpenBellRow {
  symbol: string;
  verdict: "Intraday";
  title: string;
  body: string;
}

/** The bell's title for a line: one a symbol, side and New York day. */
export function preOpenTitle(line: Pick<PreOpenLine, "symbol" | "direction">): string {
  return `${line.symbol} ${line.direction === "up" ? "buy" : "sell"}: ${PRE_OPEN_LABEL}`;
}

/**
 * The bell's row for one line, written as of the prior close whatever the
 * disposition (none is actionable before the open). Pure.
 */
export function preOpenBellRow(line: PreOpenLine, freshness: DeliverableFreshness): PreOpenBellRow {
  const up = line.direction === "up";
  const pct = (line.distance / line.prevClose) * 100;
  const lineText = line.atEntry ? "its daily plan's line" : "the close that would confirm its daily plan's line";
  const held = freshness.disposition === "informational" && freshness.reason === "entry_held" ? " This plan is held, so there is no trade to take on it." : "";
  const confirm = line.atEntry
    ? ` A close ${up ? "at or above" : "at or below"} ${price(line.confirmingClose)} would confirm it, and the entry, ${price(line.entry)}, would then be taken on a pullback.`
    : ` A close there would confirm it, and the entry, ${price(line.entry)}, would then be taken on a pullback.`;
  return {
    symbol: line.symbol,
    verdict: "Intraday",
    title: preOpenTitle(line),
    body:
      `At the ${sessionLabel(line.prevSession)} close, ${line.symbol} stood $${price(line.distance)} (${pct.toFixed(1)}%) ` +
      `${up ? "under" : "over"} ${lineText} at ${price(line.line)}; it closed at ${price(line.prevClose)}.` +
      `${confirm} Its price has not been checked since that close.${held} Not a buy yet.`,
  };
}

/** One push naming the lines within reach, nearest first. Pure. */
export function preOpenPushMessage(lines: PreOpenLine[], sessionKey: string): PushMessage {
  const shown = lines.slice(0, PRE_OPEN_PUSH_LINES);
  const more = lines.length - shown.length;
  const items = shown.map((l) => `${l.symbol} ${l.direction === "up" ? "buy" : "sell"} line ${price(l.line)} (closed ${price(l.prevClose)})`);
  const prev = lines[0]?.prevSession;
  return {
    title: lines.length === 1 ? `${lines[0].symbol}: ${PRE_OPEN_LABEL}` : `${lines.length} lines within reach before the open`,
    body:
      `As of the ${prev ? sessionLabel(prev) : "last"} close: ${items.join("; ")}${more > 0 ? `; and ${more} more` : ""}. ` +
      "Prices have not been checked since that close. Not a buy yet.",
    url: lines.length === 1 ? tickerHref(lines[0].symbol) : "/dashboard",
    tag: `preopen-${sessionKey}`,
  };
}

/** The log key a line's push is deduplicated on: once a New York day, symbol and side. */
export function preOpenHash(line: Pick<PreOpenLine, "symbol" | "direction">, sessionKey: string): string {
  return `${line.symbol}-preopen_line-${line.direction === "up" ? "bullish" : "bearish"}-${sessionKey}`;
}

/** The New York day the notice is for. */
export function preOpenSessionKey(now: Date): string {
  return etDateKey(now);
}
