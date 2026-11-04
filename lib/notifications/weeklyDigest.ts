/**
 * GSPS — the weekly digest (Q3 plan item 5, `docs/Q3_PLAN.md`): one summary a
 * week, after Friday's close, of the member's own closed trades, the setups
 * they tracked and what became of each, and the industry groups' standing.
 *
 * Gann reviewed his charts weekly and judged the trend by the week's close
 * (the weekly green and red trend line and the weekly swing chart, *Master
 * Stock Market Course* Ch. 8 and 18, Tier A, as `lib/gann/weeklyOneBar.ts`
 * carries them), so the review comes once, at the week's close,
 * rather than as a stream. The groups line reads the same monthly rank the
 * Scanner's Groups tab and the score read (`lib/scanner/groupView.ts`, Gann's
 * "position of groups", *Truth of the Stock Tape* Ch. XVI-XVII); it changes
 * only when the month does, so the moves since last month are named in the
 * first digest of a month only, and the other weeks name where the strongest
 * and weakest groups stand.
 *
 * The record is the member's own: how many trades closed, with a gain or a
 * loss, and their net in dollars. No rate, average or expectancy, and nothing
 * about GSPS's signals ("Only the real", 2026-10-21). Member-facing text names
 * no method (confidential-sources rule).
 *
 * Delivered by the bell and push first (`keyNotice.ts`, the "Summary" kind,
 * so no migration), with an email only to members who turned email on, and
 * only within the day's "digest" budget (`email-budget.ts`). It runs inside the
 * evening journal's existing cron on a Friday, so it adds no cron and no
 * Actions minutes. A Friday holiday still gets it: the week has closed.
 *
 * Three-question basis: 1. Gann as cited above, Tier A (the weekly chart and
 * the group positions). 2. Cycles: a calendar week is the reporting period,
 * not a periodicity claim, so Dewey's checklist does not apply. 3. Hermetic:
 * Rhythm, one review at each week's close in place of a stream. Law of
 * Creation: the member's own week ⊗ the market's week is a creation, the
 * member's trades read beside the groups they traded in, which re-enters as
 * the next week's plan.
 */

import { etDateKey } from "@/lib/market/session";
import type { GroupView } from "@/lib/scanner/groupView";

/** The weekday (ET, 0 = Sunday) the digest goes out on, after the close. */
export const WEEKLY_DIGEST_WEEKDAY = 5;

/** How many groups each line names. */
const GROUPS_NAMED = 3;

export interface DigestTrade {
  exit_timestamp: string | null;
  outcome: "profit" | "loss" | "pending" | null;
  profit_loss_dollars: number | null;
}

export interface DigestMonitor {
  symbol: string;
  state: "WATCH" | "EXECUTE" | "INVALIDATED" | "NO_SETUP" | "EXPIRED";
}

export interface WeekTrades {
  closed: number;
  gains: number;
  losses: number;
  /** Closed with no gain or loss. */
  even: number;
  net: number;
}

export interface GroupMove {
  label: string;
  /** Places moved: positive is up the ranking. */
  places: number;
}

export interface WeeklyGroups {
  strongest: string[];
  weakest: string[];
  /** Set only in the first digest of a month. */
  movedUp: GroupMove[];
  movedDown: GroupMove[];
}

export interface WeeklyDigest {
  /** Monday's date, YYYY-MM-DD (ET). */
  weekOf: string;
  title: string;
  /** One sentence each, for the bell and the email. */
  lines: string[];
  /** Short enough for a phone's notice. */
  pushBody: string;
  trades: WeekTrades;
  tracked: Record<DigestMonitor["state"], number> & { total: number };
  groups: WeeklyGroups | null;
}

/** The Monday (ET) of the week `now` falls in, YYYY-MM-DD. */
export function weekStartKey(now: Date): string {
  const today = etDateKey(now);
  const d = new Date(`${today}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** True on the ET weekday the digest goes out. */
export function isWeeklyDigestDay(now: Date): boolean {
  const d = new Date(`${etDateKey(now)}T12:00:00Z`);
  return d.getUTCDay() === WEEKLY_DIGEST_WEEKDAY;
}

/** The member's trades closed from Monday to `now` (ET dates). */
export function weekTrades(trades: readonly DigestTrade[], now: Date): WeekTrades {
  const from = weekStartKey(now);
  const to = etDateKey(now);
  const out: WeekTrades = { closed: 0, gains: 0, losses: 0, even: 0, net: 0 };
  for (const t of trades) {
    if (!t.exit_timestamp || t.outcome === "pending") continue;
    const day = etDateKey(new Date(t.exit_timestamp));
    if (day < from || day > to) continue;
    const pl = Number.isFinite(t.profit_loss_dollars) ? (t.profit_loss_dollars as number) : 0;
    out.closed++;
    if (pl > 0) out.gains++;
    else if (pl < 0) out.losses++;
    else out.even++;
    out.net += pl;
  }
  out.net = Math.round(out.net * 100) / 100;
  return out;
}

/** The tracked setups by where each stands now, one per symbol. */
export function trackedOutcomes(monitors: readonly DigestMonitor[]): WeeklyDigest["tracked"] {
  const out = { WATCH: 0, EXECUTE: 0, INVALIDATED: 0, NO_SETUP: 0, EXPIRED: 0, total: 0 };
  const seen = new Set<string>();
  for (const m of monitors) {
    if (seen.has(m.symbol) || !(m.state in out)) continue;
    seen.add(m.symbol);
    out[m.state]++;
    out.total++;
  }
  return out;
}

function rankOf(view: GroupView): Map<string, { label: string; rank: number }> {
  const ranked = view.groups.filter((g) => g.standing != null);
  return new Map(ranked.map((g, i) => [g.key, { label: g.label, rank: i + 1 }]));
}

/**
 * Where the groups stand this month and, in the month's first week, how they
 * moved from last month's ranking. Groups ranked in both months only.
 */
export function weeklyGroups(current: GroupView | null, previous: GroupView | null, firstWeekOfMonth: boolean): WeeklyGroups | null {
  if (!current) return null;
  const ranked = current.groups.filter((g) => g.standing != null);
  if (ranked.length === 0) return null;
  const strongest = ranked.slice(0, GROUPS_NAMED).map((g) => g.label);
  // Weakest first, never a group already named strongest.
  const weakest = ranked.slice(Math.max(GROUPS_NAMED, ranked.length - GROUPS_NAMED)).reverse().map((g) => g.label);

  let movedUp: GroupMove[] = [];
  let movedDown: GroupMove[] = [];
  if (firstWeekOfMonth && previous && previous.month !== current.month) {
    const now = rankOf(current);
    const before = rankOf(previous);
    const moves: GroupMove[] = [];
    for (const [key, n] of now) {
      const b = before.get(key);
      if (b && b.rank !== n.rank) moves.push({ label: n.label, places: b.rank - n.rank });
    }
    const byLabel = (a: GroupMove, b: GroupMove) => (a.label < b.label ? -1 : 1);
    movedUp = moves.filter((m) => m.places > 0).sort((a, b) => b.places - a.places || byLabel(a, b)).slice(0, GROUPS_NAMED);
    movedDown = moves.filter((m) => m.places < 0).sort((a, b) => a.places - b.places || byLabel(a, b)).slice(0, GROUPS_NAMED);
  }
  return { strongest, weakest, movedUp, movedDown };
}

/** True on the month's first Friday (or any day 1 to 7): the first digest to read the new month's ranking. */
export function isFirstWeekOfMonth(now: Date): boolean {
  return Number(etDateKey(now).slice(8, 10)) <= 7;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function usd(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : n > 0 ? "+" : ""}$${abs}`;
}

function listText(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function shortDate(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The digest's text from the member's week and the groups' reading. */
export function buildWeeklyDigest(input: {
  now: Date;
  trades: readonly DigestTrade[];
  monitors: readonly DigestMonitor[];
  groups: WeeklyGroups | null;
}): WeeklyDigest {
  const weekOf = weekStartKey(input.now);
  const trades = weekTrades(input.trades, input.now);
  const tracked = trackedOutcomes(input.monitors);
  const lines: string[] = [];

  if (trades.closed === 0) lines.push("You closed no trades this week.");
  else {
    const split = [
      trades.gains > 0 ? `${trades.gains} with a gain` : null,
      trades.losses > 0 ? `${trades.losses} with a loss` : null,
      trades.even > 0 ? `${trades.even} even` : null,
    ].filter((s): s is string => s != null);
    lines.push(`You closed ${plural(trades.closed, "trade")} this week (${listText(split)}), net ${usd(trades.net)}.`);
  }

  if (tracked.total === 0) lines.push("No setups you tracked moved this week.");
  else {
    const states = [
      tracked.EXECUTE > 0 ? `${tracked.EXECUTE} at Execute` : null,
      tracked.WATCH > 0 ? `${tracked.WATCH} on Watch` : null,
      tracked.INVALIDATED > 0 ? `${tracked.INVALIDATED} broke ${tracked.INVALIDATED === 1 ? "its" : "their"} plan` : null,
      tracked.EXPIRED > 0 ? `${tracked.EXPIRED} expired` : null,
      tracked.NO_SETUP > 0 ? `${tracked.NO_SETUP} no longer a setup` : null,
    ].filter((s): s is string => s != null);
    lines.push(`Setups you tracked this week: ${tracked.total}. Now ${listText(states)}.`);
  }

  const g = input.groups;
  if (g) {
    if (g.movedUp.length > 0 || g.movedDown.length > 0) {
      const up = g.movedUp.map((m) => `${m.label} (up ${m.places})`);
      const down = g.movedDown.map((m) => `${m.label} (down ${-m.places})`);
      const parts = [up.length > 0 ? `up most: ${listText(up)}` : null, down.length > 0 ? `down most: ${listText(down)}` : null];
      lines.push(`Industry groups since last month, ${parts.filter(Boolean).join("; ")}.`);
    }
    const ends = [
      `strongest: ${listText(g.strongest)}`,
      g.weakest.length > 0 ? `weakest: ${listText(g.weakest)}` : null,
    ].filter(Boolean);
    lines.push(`Industry groups this month, ${ends.join("; ")}.`);
  }

  const pushParts = [
    trades.closed > 0 ? `${plural(trades.closed, "trade")} closed, net ${usd(trades.net)}` : "No trades closed",
    tracked.total > 0 ? `${plural(tracked.total, "tracked setup")}` : null,
  ].filter(Boolean);

  return {
    weekOf,
    title: `Your week on GSPS: week of ${shortDate(weekOf)}`,
    lines,
    pushBody: `${pushParts.join(", ")}. Your weekly review is in the app.`,
    trades,
    tracked,
    groups: g,
  };
}
