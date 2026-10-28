/**
 * The forward test's daily record: every Execute call the platform recorded
 * (lib/shadow/record.ts), grouped by the session it trades, with what became
 * of it (lib/shadow/evaluate.ts): filled and won, lost or timed out, still
 * held, never reacted into its zone (expired), called off by its stop first
 * (retired), or not read yet. Losses and non-fills stay in, so the record is
 * the whole of what was called (owner, "Only the real").
 *
 * Read by the owner-only `GET /api/shadow/daily` and nothing else: it is the
 * platform's unpublished record, shown to the owner's two accounts
 * (`lib/auth/owner.ts`) so the result can be checked before any live trading
 * or public figure. Every fill and exit in it is read with the feed's
 * 15-minute delay (DATA-DELAY-001, `delayedFillIndex`).
 *
 * Rule versions are shown as their labels (`publicVersionLabel`), never the
 * internal names, since this leaves the server.
 */

import { publicVersionLabel } from "@/lib/backtest/publicVersion";

export interface ShadowRecordRow {
  symbol: string;
  direction: string;
  strategy_version: string;
  entry: number | string;
  stop_loss: number | string;
  score: number | string | null;
  source: string | null;
  scanned_at: string;
  session_date: string | null;
  outcome: string | null;
  r_multiple: number | string | null;
  bars_held: number | null;
  fill_price: number | string | null;
}

export type ShadowCallState = "win" | "loss" | "timeout" | "held" | "expired" | "retired" | "unread";

export interface ShadowCall {
  symbol: string;
  side: "long" | "short";
  version: string;
  score: number | null;
  scannedAt: string;
  entry: number;
  stop: number;
  fill: number | null;
  state: ShadowCallState;
  r: number | null;
  sessionsHeld: number | null;
}

export interface ShadowDay {
  session: string;
  calls: number;
  /** Filled trades: decided (win, loss, timeout) and still held. */
  filled: number;
  wins: number;
  losses: number;
  timeouts: number;
  held: number;
  expired: number;
  retired: number;
  unread: number;
  /** Sum of R over the day's decided trades. */
  totalR: number;
  /** Mean R over the day's decided trades; null with none. */
  averageR: number | null;
  items: ShadowCall[];
}

export interface ShadowTotals {
  calls: number;
  /**
   * Distinct plans among the calls: a plan still published the next session is
   * recorded again as that session's call, so the calls count each repeat.
   */
  plans: number;
  decided: number;
  wins: number;
  losses: number;
  timeouts: number;
  held: number;
  expired: number;
  retired: number;
  unread: number;
  totalR: number;
  averageR: number | null;
  /** Wins over decided trades; null with none. */
  winRate: number | null;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** What became of one call. A trade on with no outcome yet is held; no fill and no outcome is unread. */
export function callState(row: Pick<ShadowRecordRow, "outcome" | "fill_price">): ShadowCallState {
  switch (row.outcome) {
    case "win":
    case "loss":
    case "timeout":
    case "expired":
    case "retired":
      return row.outcome;
    default:
      return num(row.fill_price) != null ? "held" : "unread";
  }
}

const DECIDED: ReadonlySet<ShadowCallState> = new Set(["win", "loss", "timeout"]);

/** Groups the record by session, newest first, calls in the order they were recorded. Pure. */
export function buildShadowDays(rows: readonly ShadowRecordRow[]): ShadowDay[] {
  const days = new Map<string, ShadowDay>();
  const sorted = [...rows].sort((a, b) => a.scanned_at.localeCompare(b.scanned_at) || a.symbol.localeCompare(b.symbol));
  for (const row of sorted) {
    const session = row.session_date ?? row.scanned_at.slice(0, 10);
    let day = days.get(session);
    if (!day) {
      day = { session, calls: 0, filled: 0, wins: 0, losses: 0, timeouts: 0, held: 0, expired: 0, retired: 0, unread: 0, totalR: 0, averageR: null, items: [] };
      days.set(session, day);
    }
    const state = callState(row);
    const r = DECIDED.has(state) ? num(row.r_multiple) : null;
    day.items.push({
      symbol: row.symbol,
      side: row.direction === "bearish" ? "short" : "long",
      version: publicVersionLabel(row.strategy_version),
      score: num(row.score),
      scannedAt: row.scanned_at,
      entry: Number(row.entry),
      stop: Number(row.stop_loss),
      fill: num(row.fill_price),
      state,
      r,
      sessionsHeld: row.bars_held,
    });
    day.calls++;
    if (state === "win") day.wins++;
    else if (state === "loss") day.losses++;
    else if (state === "timeout") day.timeouts++;
    else if (state === "held") day.held++;
    else if (state === "expired") day.expired++;
    else if (state === "retired") day.retired++;
    else day.unread++;
    if (r != null) day.totalR += r;
  }
  for (const day of days.values()) {
    day.filled = day.wins + day.losses + day.timeouts + day.held;
    const decided = day.wins + day.losses + day.timeouts;
    day.averageR = decided > 0 ? day.totalR / decided : null;
  }
  return [...days.values()].sort((a, b) => b.session.localeCompare(a.session));
}

/** The record's totals over the days given. Pure. */
export function shadowTotals(days: readonly ShadowDay[]): ShadowTotals {
  const t: ShadowTotals = { calls: 0, plans: 0, decided: 0, wins: 0, losses: 0, timeouts: 0, held: 0, expired: 0, retired: 0, unread: 0, totalR: 0, averageR: null, winRate: null };
  const plans = new Set<string>();
  for (const d of days) {
    for (const c of d.items) plans.add(`${c.symbol}|${c.side}|${c.entry}|${c.stop}|${c.version}`);
    t.calls += d.calls;
    t.wins += d.wins;
    t.losses += d.losses;
    t.timeouts += d.timeouts;
    t.held += d.held;
    t.expired += d.expired;
    t.retired += d.retired;
    t.unread += d.unread;
    t.totalR += d.totalR;
  }
  t.plans = plans.size;
  t.decided = t.wins + t.losses + t.timeouts;
  if (t.decided > 0) {
    t.averageR = t.totalR / t.decided;
    t.winRate = t.wins / t.decided;
  }
  return t;
}
