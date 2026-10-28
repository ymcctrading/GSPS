/**
 * GSPS — the evening reports the owner tests by email (owner, 2026-10-28:
 * "Start sending the evening focus list as well as the daily recap ...
 * starting tonight ... for now, desire to run tests").
 *
 * Two reports, both pure functions of what the platform stored and the day's
 * bars, so the route (`app/api/evening-report/route.ts`) only reads and sends:
 * - The focus list for the next session: which names are executable, each in
 *   plain English (where to enter, the stop, the take profits), and why every
 *   other name is on the list.
 * - The recap of the session just closed: the top movers by dollars, percent
 *   and Gann points, and what GSPS had said about each, with every setup it
 *   offered judged by its own entry rule, misses and losses included.
 *
 * Three-question basis (AGENTS.md):
 * 1. Gann: he chose his active stocks from the daily charts the night before
 *    and timed them in the session (Master Course Ch. 13), so the focus list
 *    goes out in the evening, after the daily scan has read the close. He
 *    measured moves in points, and a price-scaled point is how GSPS reads
 *    them (`pointScale.ts#pricePoint`), so the movers are ranked in Gann points
 *    beside dollars and percent. He judged his method by its trade record,
 *    losses included (the series-of-losses rule; *Tunnel* pp.198-199), so a
 *    setup counts only when its own entry rule would have filled it (rule 9,
 *    `confirmationFromBars`, as placement reads it) and is judged on where
 *    price went after the fill, not on the day's direction.
 * 2. Cycles: one session, no periodicity claim; Dewey's checklist does not
 *    apply. Nothing here is a measured record (one day is one observation).
 * 3. Hermetic: Cause and Effect. The setup given the night before is the
 *    cause, the session's bars are the effect, and the recap sets them side by
 *    side. Law of Creation: plan ⊗ session interact (I=1) and the third they
 *    make is the trade record, which re-enters as the forward test.
 */

import type { Bar } from "@/lib/types";
import { pricePoint } from "@/lib/gann/pointScale";
import { confirmationFromBars } from "@/lib/lifecycle/confirmNow";
import type { FocusReason } from "@/lib/scanner/focusList";
import { priceUsd } from "@/lib/strat/priceText";
import { formatStage, OUTCOME_LABELS, splitMove, STAGE_KEYS, STAGE_LABELS, type CoverageStages, type MoverOutcome } from "@/lib/reports/coverage";

export type Side = "bullish" | "bearish";

// ---------------------------------------------------------------------------
// Movers

export interface DayRow {
  symbol: string;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Mover extends DayRow {
  dollars: number;
  pct: number;
  /** The change counted in Gann points at the prior close's scale. */
  gannPoints: number;
  /** Where the close sat in the day's range, 0 at the low and 1 at the high. */
  closeInRange: number | null;
}

export function toMover(row: DayRow): Mover | null {
  const { prevClose, close, high, low } = row;
  if (![prevClose, close, high, low, row.open].every((n) => Number.isFinite(n) && n > 0)) return null;
  const dollars = close - prevClose;
  const point = pricePoint(prevClose);
  return {
    ...row,
    dollars,
    pct: (dollars / prevClose) * 100,
    gannPoints: point > 0 ? dollars / point : 0,
    closeInRange: high > low ? (close - low) / (high - low) : null,
  };
}

export type MoverMeasure = "dollars" | "pct" | "gannPoints";

/** The `limit` largest moves either way by one measure, largest first. */
export function topMovers(movers: Mover[], measure: MoverMeasure, limit = 10): Mover[] {
  return [...movers].sort((a, b) => Math.abs(b[measure]) - Math.abs(a[measure]) || a.symbol.localeCompare(b.symbol)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Daily setups, judged on the session's closed 15-minute bars

export interface DailySetup {
  symbol: string;
  direction: Side;
  verdict: "Execute" | "Watch";
  score: number;
  entry: number;
  stop: number;
  tp1: number | null;
  mtp: number | null;
  /** True when the plan's crossing is still to be made (`GannEntryTrigger.held`). */
  entryAwaitsCrossing: boolean;
}

export type DailyOutcome =
  | "tp1_first"
  | "stop_first"
  | "open_ahead"
  | "open_behind"
  | "called_off"
  | "no_fill_moved_its_way"
  | "no_fill"
  | "past_tp1_before_open"
  | "no_bars";

export interface DailyJudgement {
  setup: DailySetup;
  outcome: DailyOutcome;
  fill: number | null;
  fillAt: string | null;
  /** Result in R at the session's close (or at the stop or TP1 when reached). */
  r: number | null;
}

function sideSign(direction: Side): 1 | -1 {
  return direction === "bullish" ? 1 : -1;
}

/**
 * Walks one setup through the session as placement would have taken it.
 * Entry: the first closed bar at which `confirmationFromBars` reads it ready
 * (a plan still awaiting its crossing needs the close 3 points past first; an
 * armed one is ready once a bar trades into the buying zone), filled at the
 * next bar's open, as the replay fills (rule 9). A close through the stop
 * first calls it off. After the fill, a bar that reaches both the stop and
 * TP1 is counted as the stop (the bar's order is unknown, so the worse case).
 */
export function judgeDailySetup(setup: DailySetup, bars: Bar[], prevClose: number | null): DailyJudgement {
  const base = { setup, fill: null, fillAt: null, r: null };
  const sign = sideSign(setup.direction);
  if (setup.tp1 != null && prevClose != null && sign * (prevClose - setup.tp1) >= 0) {
    return { ...base, outcome: "past_tp1_before_open" };
  }
  if (bars.length === 0) return { ...base, outcome: "no_bars" };
  const kind = setup.entryAwaitsCrossing ? undefined : "oldLevel";
  let fillIndex = -1;
  for (let i = 0; i < bars.length; i++) {
    const read = confirmationFromBars(bars.slice(0, i + 1), setup.direction, setup.entry, setup.stop, kind);
    if (read.stage === "dead") return { ...base, outcome: "called_off" };
    if (read.ready) {
      fillIndex = i + 1;
      break;
    }
  }
  if (fillIndex < 0 || fillIndex >= bars.length) {
    const last = bars[bars.length - 1].c;
    const movedItsWay = prevClose != null && sign * (last - prevClose) > 0;
    return { ...base, outcome: movedItsWay ? "no_fill_moved_its_way" : "no_fill" };
  }
  const fill = bars[fillIndex].o;
  const risk = sign * (fill - setup.stop);
  const fillAt = bars[fillIndex].t;
  if (!(risk > 0)) return { setup, outcome: "stop_first", fill, fillAt, r: -1 };
  for (let i = fillIndex; i < bars.length; i++) {
    const b = bars[i];
    const hitStop = sign > 0 ? b.l <= setup.stop : b.h >= setup.stop;
    const hitTp1 = setup.tp1 != null && (sign > 0 ? b.h >= setup.tp1 : b.l <= setup.tp1);
    if (hitStop) return { setup, outcome: "stop_first", fill, fillAt, r: -1 };
    if (hitTp1) return { setup, outcome: "tp1_first", fill, fillAt, r: (sign * (setup.tp1! - fill)) / risk };
  }
  const r = (sign * (bars[bars.length - 1].c - fill)) / risk;
  return { setup, outcome: r >= 0 ? "open_ahead" : "open_behind", fill, fillAt, r };
}

// ---------------------------------------------------------------------------
// Intraday signals, as each member received them

export interface IntradaySignal {
  member: string;
  symbol: string;
  direction: Side;
  label: string;
  /** When the member first received it. */
  at: string;
  price: number;
  stop: number;
  tp1: number | null;
  mtp: number | null;
  /** How many times the same signal reached the member that day. */
  deliveries: number;
}

/**
 * Reads a bell notice ("NVDA intraday, down: Reversal risk" / "Price 217.61,
 * stop 217.96, TP1 216.41, MTP 213.07. ..."), which is exactly what the member
 * saw. Null when it does not parse.
 */
export function parseBellNotice(title: string, body: string): { direction: Side; label: string; price: number; stop: number; tp1: number | null; mtp: number | null } | null {
  const head = /intraday,\s*(up|down):\s*(.+)$/i.exec(title.trim());
  const num = (key: string) => {
    const m = new RegExp(`${key}\\s+\\$?(-?[\\d,]*\\.?\\d+)`, "i").exec(body);
    return m ? Number(m[1].replace(/,/g, "")) : null;
  };
  const price = num("Price");
  const stop = num("stop");
  if (!head || price == null || stop == null) return null;
  return { direction: head[1].toLowerCase() === "up" ? "bullish" : "bearish", label: head[2].trim(), price, stop, tp1: num("TP1"), mtp: num("MTP") };
}

/** One signal per member, symbol, side and kind: the first delivery, with the repeats counted. */
export function firstDeliveries(signals: Omit<IntradaySignal, "deliveries">[]): IntradaySignal[] {
  const byKey = new Map<string, IntradaySignal>();
  for (const s of [...signals].sort((a, b) => a.at.localeCompare(b.at))) {
    const key = `${s.member}|${s.symbol}|${s.direction}|${s.label.toLowerCase()}`;
    const seen = byKey.get(key);
    if (seen) seen.deliveries += 1;
    else byKey.set(key, { ...s, deliveries: 1 });
  }
  return [...byKey.values()];
}

export type IntradayOutcome = "tp1_first" | "stop_first" | "ahead_at_cutoff" | "behind_at_cutoff" | "after_cutoff" | "no_bars";

export interface IntradayJudgement {
  signal: IntradaySignal;
  outcome: IntradayOutcome;
  fill: number | null;
  r: number | null;
}

/**
 * Takes the signal at the market on the first 1-minute bar that opens at or
 * after the member received it, and holds it on its own stop until TP1, the
 * stop, or the Intraday style's close (3:45 PM ET, 12:45 PM on an early
 * close; `cutoffMs`). A bar that reaches both counts as the stop. The style's
 * trailing stop is not walked here, so this reads the signal's levels as
 * given, labelled as such in the email.
 */
export function judgeIntradaySignal(signal: IntradaySignal, bars: Bar[], cutoffMs: number): IntradayJudgement {
  const base = { signal, fill: null, r: null };
  const at = Date.parse(signal.at);
  if (at >= cutoffMs) return { ...base, outcome: "after_cutoff" };
  const window = bars.filter((b) => Date.parse(b.t) >= at && Date.parse(b.t) < cutoffMs);
  if (window.length === 0) return { ...base, outcome: "no_bars" };
  const sign = sideSign(signal.direction);
  const fill = window[0].o;
  const risk = sign * (fill - signal.stop);
  if (!(risk > 0)) return { signal, outcome: "stop_first", fill, r: -1 };
  for (const b of window) {
    const hitStop = sign > 0 ? b.l <= signal.stop : b.h >= signal.stop;
    const hitTp1 = signal.tp1 != null && (sign > 0 ? b.h >= signal.tp1 : b.l <= signal.tp1);
    if (hitStop) return { signal, outcome: "stop_first", fill, r: -1 };
    if (hitTp1) return { signal, outcome: "tp1_first", fill, r: (sign * (signal.tp1! - fill)) / risk };
  }
  const r = (sign * (window[window.length - 1].c - fill)) / risk;
  return { signal, outcome: r >= 0 ? "ahead_at_cutoff" : "behind_at_cutoff", fill, r };
}

// ---------------------------------------------------------------------------
// Neutral wording. Owner, 2026-10-28: nothing user-facing names the method,
// its sources or its tools, so the emails describe setups in plain trading
// terms (trend, support and resistance, entry, stop, target) with their own
// words here rather than the platform's internal labels.

/** A focus reason in plain trading words. */
export function plainFocusReason(reason: FocusReason): string {
  switch (reason.kind) {
    case "plan_near":
      return `${reason.verdict} plan's entry ${priceUsd(reason.entry)} is within a day's range`;
    case "narrow_range":
      return `${reason.sessions} sessions in a tight range${reason.edge ? `, now at its ${reason.edge}` : ""}`;
    case "big_day":
      return {
        reverse_top: "Sharp reversal down from a high",
        reverse_bottom: "Sharp reversal up from a low",
        seven_to_ten_top: "A run of up days turned down",
        seven_to_ten_bottom: "A run of down days turned up",
        wide_up: "Wide range up on heavy volume",
        wide_down: "Wide range down on heavy volume",
      }[reason.signal];
    case "old_level":
      return `Near the prior ${reason.side} at ${priceUsd(reason.level)}`;
  }
}

/** Intraday signal kinds in plain trading words, keyed by the stored signal id. */
export const PLAIN_SIGNAL_LABELS: Record<string, string> = {
  old_level_cross: "Broke a prior high or low",
  trend_continuation: "Trend continuation",
  space_overbalance: "Pullback larger than any before it",
  overnight_turn: "Daily swing turned",
  hourly_turn: "Hourly swing turned",
  plan_level_held: "Daily plan's entry held",
  reversal_risk: "Reversal risk",
};

export function plainSignalLabel(kind: string): string {
  return PLAIN_SIGNAL_LABELS[kind] ?? "Intraday signal";
}

// ---------------------------------------------------------------------------
// The focus list's plain English

export interface NextPlan {
  symbol: string;
  direction: Side;
  verdict: "Execute" | "Watch" | "Reject";
  score: number;
  entry: number;
  stop: number;
  tp1: number | null;
  mtp: number | null;
  price: number | null;
  dayRange: number | null;
  entryAwaitsCrossing: boolean;
}

/** What to look for on an executable plan, in plain English. */
export function executableSentences(p: NextPlan): { entry: string; stop: string; targets: string } {
  const long = p.direction === "bullish";
  const verb = long ? "Buy" : "Sell short";
  const toward = p.price == null ? "" : long ? (p.price > p.entry ? "a pullback down to" : "a rise up to") : p.price < p.entry ? "a rally back up to" : "a drop down to";
  const crossing = p.entryAwaitsCrossing
    ? ` First it needs a 15-minute close about 3 points ${long ? "above" : "below"} the old ${long ? "top" : "bottom"} the entry sits on.`
    : "";
  const entry =
    `${verb} on ${toward || "price reaching"} ${priceUsd(p.entry)}.${crossing} ` +
    `Once a completed 15-minute bar trades at ${priceUsd(p.entry)} or ${long ? "lower" : "higher"}, the order goes at the market.`;
  const stop = `Stop at ${priceUsd(p.stop)}. A close ${long ? "below" : "above"} it before you're in calls the trade off.`;
  const targets =
    p.tp1 == null
      ? "No first target is fixed; the stop trails the move."
      : `First take profit (TP1) ${priceUsd(p.tp1)}${p.mtp != null ? `, master take profit (MTP) ${priceUsd(p.mtp)}` : ""}. ` +
        "Under GSPS's exits nothing sells at a fixed target: the stop moves to break-even once the trade is 3 points ahead and then trails, so these are the levels the move is measured to.";
  return { entry, stop, targets };
}

/** Why a plan on the list is not executable tonight, in one line. */
export function notExecutableReason(p: NextPlan): string {
  const long = p.direction === "bullish";
  if (p.verdict === "Reject") return "GSPS stands aside on this one (no trade).";
  if (p.price != null && p.tp1 != null && (long ? p.price >= p.tp1 : p.price <= p.tp1)) {
    return `Price ${priceUsd(p.price)} is already past TP1 ${priceUsd(p.tp1)}, so the setup has run; watch only.`;
  }
  if (p.score < 7) return `Scores ${p.score} of 9; executable starts at 7.`;
  if (p.price != null && p.dayRange != null && Math.abs(p.price - p.entry) > p.dayRange) {
    const away = Math.abs(p.price - p.entry);
    return `The entry ${priceUsd(p.entry)} is ${priceUsd(away)} (${((away / p.price) * 100).toFixed(1)}%) from price, more than a day's range, so it rests until price comes back.`;
  }
  if (p.entryAwaitsCrossing) return "The crossing of the old level hasn't been made yet.";
  return "Held at Watch by the ready-now check (the indication, the entry's distance or the targets).";
}

// ---------------------------------------------------------------------------
// Rendering

export interface FocusRow {
  rank: number;
  symbol: string;
  reasons: FocusReason[];
  close: number;
  plan: NextPlan | null;
}

export interface FocusEmailInput {
  /** The session the list is for, "YYYY-MM-DD". */
  forDate: string;
  /** The session it was read from. */
  basisDate: string;
  focus: FocusRow[];
  /** Every executable plan from tonight's scan, on the focus list or not. */
  executable: NextPlan[];
  appUrl: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const side = (d: Side) => (d === "bullish" ? "Long" : "Short");
const signed = (n: number, digits = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;

function dayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

const WRAP_OPEN = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;color:#0f172a;font-size:14px;line-height:1.5">`;
const FOOTER = (appUrl: string) =>
  `<p style="color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:24px">A test email from GSPS, sent to the owner only. One session is one observation, not a measured record. <a href="${appUrl}" style="color:#0ea5e9">Open GSPS</a></p></div>`;

export function renderFocusEmail(input: FocusEmailInput): { subject: string; html: string; text: string } {
  const subject = `GSPS evening focus list for ${dayLabel(input.forDate)}: ${input.executable.length} executable`;
  const onFocus = new Set(input.focus.map((f) => f.symbol));
  const html: string[] = [WRAP_OPEN, `<h2 style="margin:0 0 4px">Focus list for ${dayLabel(input.forDate)}</h2>`];
  const text: string[] = [`GSPS focus list for ${dayLabel(input.forDate)} (read from ${dayLabel(input.basisDate)}'s close)`, ""];
  html.push(`<p style="color:#64748b;margin:0 0 16px">Read from ${dayLabel(input.basisDate)}'s close. Executable means a score of 7 or more out of 9, the entry within a day's range of price, and both take profits still ahead.</p>`);

  html.push(`<h3 style="margin:16px 0 8px">Executable (${input.executable.length})</h3>`);
  text.push(`EXECUTABLE (${input.executable.length})`);
  if (input.executable.length === 0) {
    html.push(`<p>Nothing is executable for this session. Every name below is a watch.</p>`);
    text.push("Nothing is executable for this session.");
  }
  for (const p of input.executable) {
    const s = executableSentences(p);
    const where = onFocus.has(p.symbol) ? "" : " (not on the focus list)";
    html.push(
      `<div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:10px 14px;margin:0 0 10px;border-radius:4px">` +
        `<p style="margin:0;font-weight:700">${esc(p.symbol)} · ${side(p.direction)} · ${p.score}/9${esc(where)}${p.price != null ? ` · last ${priceUsd(p.price)}` : ""}</p>` +
        `<p style="margin:6px 0 0"><b>Entry:</b> ${esc(s.entry)}</p>` +
        `<p style="margin:4px 0 0"><b>Stop:</b> ${esc(s.stop)}</p>` +
        `<p style="margin:4px 0 0"><b>Take profits:</b> ${esc(s.targets)}</p></div>`,
    );
    text.push(`${p.symbol} ${side(p.direction)} ${p.score}/9${where}`, `  Entry: ${s.entry}`, `  Stop: ${s.stop}`, `  Take profits: ${s.targets}`, "");
  }

  html.push(`<h3 style="margin:20px 0 8px">The rest of the focus list (${input.focus.filter((f) => f.plan?.verdict !== "Execute").length})</h3>`);
  html.push(`<p style="color:#64748b;margin:0 0 8px">Not executable. On the list because the daily-chart signs say to watch them tomorrow; the intraday scan times them.</p>`);
  html.push(`<table style="border-collapse:collapse;width:100%;font-size:13px">`);
  text.push("", "WATCH ONLY");
  for (const f of input.focus) {
    if (f.plan?.verdict === "Execute") continue;
    const why = f.reasons.map(plainFocusReason).join("; ");
    const plan = f.plan
      ? `${f.plan.verdict} ${side(f.plan.direction).toLowerCase()} ${f.plan.score}/9: ${notExecutableReason(f.plan)}`
      : "No plan from the daily scan.";
    html.push(
      `<tr style="border-top:1px solid #e2e8f0"><td style="padding:6px 8px 6px 0;vertical-align:top;font-weight:700;white-space:nowrap">${f.rank}. ${esc(f.symbol)}</td>` +
        `<td style="padding:6px 0;vertical-align:top">${priceUsd(f.close)} · ${esc(why)}<br><span style="color:#475569">${esc(plan)}</span></td></tr>`,
    );
    text.push(`${f.rank}. ${f.symbol} ${priceUsd(f.close)}: ${why}`, `   ${plan}`);
  }
  html.push(`</table>`, FOOTER(input.appUrl));
  text.push("", "A test email from GSPS, sent to the owner only.");
  return { subject, html: html.join(""), text: text.join("\n") };
}

export interface RecapEmailInput {
  basisDate: string;
  /** The session the setups were built from, "YYYY-MM-DD". */
  setupsFrom: string | null;
  /** Each pipeline stage's count, kept apart (`lib/reports/coverage.ts`). */
  coverage: CoverageStages;
  /** Per mover: the last stage it reached, in one line. */
  attribution: Map<string, { outcome: MoverOutcome; line: string }>;
  movers: Mover[];
  daily: DailyJudgement[];
  intraday: IntradayJudgement[];
  /** Symbols on the focus list going into the session. */
  focus: Set<string>;
  /** Member label → tier, for the per-member table. */
  members: Map<string, string>;
  appUrl: string;
}

const DAILY_LABEL: Record<DailyOutcome, string> = {
  tp1_first: "filled, reached TP1 before the stop",
  stop_first: "filled, stopped out",
  open_ahead: "filled, ahead at the close",
  open_behind: "filled, behind at the close",
  called_off: "called off: closed through the stop before the entry",
  no_fill_moved_its_way: "never filled, but price moved its way",
  no_fill: "never filled",
  past_tp1_before_open: "already past TP1 before the open (stale)",
  no_bars: "no bars read",
};

const INTRADAY_LABEL: Record<IntradayOutcome, string> = {
  tp1_first: "TP1 before the stop",
  stop_first: "stopped out",
  ahead_at_cutoff: "ahead at the cutoff",
  behind_at_cutoff: "behind at the cutoff",
  after_cutoff: "arrived after the cutoff, not judged",
  no_bars: "no bars read",
};

/** What GSPS had said about a mover, in one line. */
export function moverVerdict(m: Mover, daily: DailyJudgement[], intraday: IntradayJudgement[], onFocus: boolean): { aligned: boolean; line: string } {
  const moveSide: Side = m.dollars >= 0 ? "bullish" : "bearish";
  const parts: string[] = [];
  let aligned = false;
  for (const j of daily.filter((d) => d.setup.symbol === m.symbol)) {
    const withMove = j.setup.direction === moveSide;
    const paid = j.outcome === "tp1_first" || j.outcome === "open_ahead";
    if (withMove && paid && j.setup.verdict === "Execute") aligned = true;
    parts.push(`${j.setup.verdict} ${side(j.setup.direction).toLowerCase()} ${withMove ? "with" : "against"} the move: ${DAILY_LABEL[j.outcome]}${j.r != null ? ` (${signed(j.r)}R)` : ""}`);
  }
  const sigs = intraday.filter((i) => i.signal.symbol === m.symbol);
  if (sigs.length > 0) {
    // One per signal across members: the earliest delivery's judgement.
    const distinct = new Map<string, IntradayJudgement>();
    for (const s of [...sigs].sort((a, b) => a.signal.at.localeCompare(b.signal.at))) {
      const key = `${s.signal.direction}|${s.signal.label.toLowerCase()}`;
      if (!distinct.has(key)) distinct.set(key, s);
    }
    const withMove = [...distinct.values()].filter((s) => s.signal.direction === moveSide);
    const hits = withMove.filter((s) => s.outcome === "tp1_first" || s.outcome === "ahead_at_cutoff").length;
    if (hits > 0) aligned = true;
    parts.push(`${distinct.size} intraday signal${distinct.size === 1 ? "" : "s"}, ${withMove.length} with the move, ${hits} of them paid`);
  }
  if (onFocus) parts.push("on the focus list");
  // Plans and delivered signals only: the full stage attribution (the
  // overnight reading, the focus list's reserves, system detections) is
  // `moverAttributionLine`'s, so a mover with none of these is not "missed".
  if (parts.length === 0) return { aligned: false, line: "Missed: no standing plan or delivered signal." };
  return { aligned, line: parts.join("; ") };
}

function tally<T extends string>(items: T[]): string {
  const counts = new Map<T, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts.entries()].map(([k, n]) => `${n} ${k}`).join(", ");
}

function meanR(rs: (number | null)[]): string {
  const v = rs.filter((r): r is number => r != null);
  return v.length === 0 ? "—" : `${signed(v.reduce((a, b) => a + b, 0) / v.length)}R over ${v.length}`;
}

export function renderRecapEmail(input: RecapEmailInput): { subject: string; html: string; text: string } {
  const day = dayLabel(input.basisDate);
  const execs = input.daily.filter((d) => d.setup.verdict === "Execute");
  const subject = `GSPS daily recap for ${day}`;
  const html: string[] = [WRAP_OPEN, `<h2 style="margin:0 0 4px">Daily recap for ${day}</h2>`];
  const text: string[] = [`GSPS daily recap for ${day}`, ""];
  html.push(
    `<p style="color:#64748b;margin:0 0 16px">Owner-only report: the movers are ranked by a move that had already happened, so nothing here is shown to members or used by a scan. Setups are the plans standing at ${input.setupsFrom ? `${dayLabel(input.setupsFrom)}'s` : "the prior"} close, run through a simplified simulation: GSPS's entry rule on the session's 15-minute bars, filled at the next bar's open, then the plan's own stop and TP1 only. It is not production-faithful: it leaves out the trailing exits, costs and slippage, the placement holds (a breakdown standing, a failed top in the way) and the data delay, and a bar that touched both the stop and TP1 counts as the stop.</p>`,
  );
  html.push(`<h3 style="margin:16px 0 4px">Coverage by stage</h3><p style="color:#64748b;margin:0 0 6px">Each stage counted on its own; "not recorded" means GSPS kept no record of it, not zero.</p><table style="border-collapse:collapse;width:100%;font-size:13px">`);
  text.push("COVERAGE BY STAGE (each counted on its own; \"not recorded\" is not zero)");
  for (const k of STAGE_KEYS) {
    const v = formatStage(input.coverage[k]);
    html.push(`<tr style="border-top:1px solid #e2e8f0"><td style="padding:4px 8px 4px 0;vertical-align:top">${esc(STAGE_LABELS[k])}</td><td style="padding:4px 0">${esc(v)}</td></tr>`);
    text.push(`  ${STAGE_LABELS[k]}: ${v}`);
  }
  html.push(`</table>`);
  text.push("");

  const sections: [MoverMeasure, string, (m: Mover) => string][] = [
    ["dollars", "Top movers by dollars", (m) => signed(m.dollars)],
    ["pct", "Top movers by percent", (m) => `${signed(m.pct)}%`],
    ["gannPoints", "Top movers in price-scaled points", (m) => `${signed(m.gannPoints, 1)} pts`],
  ];
  for (const [measure, title, fmt] of sections) {
    const list = topMovers(input.movers, measure);
    const alignedCount = list.filter((m) => moverVerdict(m, input.daily, input.intraday, input.focus.has(m.symbol)).aligned).length;
    const outcomes = tally(list.map((m) => OUTCOME_LABELS[input.attribution.get(m.symbol)?.outcome ?? "not_examined"].toLowerCase()));
    html.push(`<h3 style="margin:20px 0 4px">${title}</h3><p style="color:#64748b;margin:0 0 6px">${esc(outcomes)}. ${alignedCount} of ${list.length} lined up with a setup that paid in the simplified simulation.</p><table style="border-collapse:collapse;width:100%;font-size:13px">`);
    text.push(`${title.toUpperCase()} (${outcomes}; ${alignedCount} of ${list.length} lined up with a setup that paid in the simplified simulation)`);
    for (const m of list) {
      const v = moverVerdict(m, input.daily, input.intraday, input.focus.has(m.symbol));
      const a = input.attribution.get(m.symbol);
      const range = m.closeInRange == null ? "" : `, closed ${Math.round(m.closeInRange * 100)}% up its range`;
      const split = splitMove(m.prevClose, m.open, m.close);
      const splitText = split ? `gap ${signed(split.gapPct)}% at the open, ${signed(split.sessionPct)}% open to close` : "";
      const stages = a ? `${a.line}.` : "";
      const plans = v.line.startsWith("Missed:") ? "" : ` Plans and signals: ${v.line}.`;
      html.push(
        `<tr style="border-top:1px solid #e2e8f0"><td style="padding:6px 8px 6px 0;vertical-align:top;white-space:nowrap"><b>${esc(m.symbol)}</b> ${fmt(m)}</td>` +
          `<td style="padding:6px 0;vertical-align:top">${priceUsd(m.prevClose)} → ${priceUsd(m.close)} (${signed(m.pct)}%, ${signed(m.dollars)}, ${signed(m.gannPoints, 1)} pts${range}${splitText ? `; ${splitText}` : ""})<br>` +
          `<span style="color:${v.aligned ? "#15803d" : "#475569"}">${v.aligned ? "✓ " : ""}${esc(stages + plans)}</span></td></tr>`,
      );
      text.push(`${m.symbol} ${fmt(m)} (${priceUsd(m.prevClose)} -> ${priceUsd(m.close)}${range}${splitText ? `; ${splitText}` : ""}): ${v.aligned ? "[aligned] " : ""}${stages}${plans}`);
    }
    html.push(`</table>`);
    text.push("");
  }

  html.push(`<h3 style="margin:20px 0 4px">Every executable setup standing (${execs.length})</h3>`);
  text.push(`EVERY EXECUTABLE SETUP STANDING (${execs.length}): ${tally(execs.map((j) => DAILY_LABEL[j.outcome]))}`);
  html.push(`<p style="color:#64748b;margin:0 0 6px">${esc(tally(execs.map((j) => DAILY_LABEL[j.outcome])) || "None.")} Mean ${esc(meanR(execs.map((j) => j.r)))}.</p><ul style="margin:0;padding-left:18px">`);
  for (const j of execs) {
    const line = `${j.setup.symbol} ${side(j.setup.direction).toLowerCase()} ${j.setup.score}/9, entry ${priceUsd(j.setup.entry)}, stop ${priceUsd(j.setup.stop)}, TP1 ${priceUsd(j.setup.tp1)}: ${DAILY_LABEL[j.outcome]}${j.fill != null ? ` at ${priceUsd(j.fill)}` : ""}${j.r != null ? `, ${signed(j.r)}R` : ""}`;
    html.push(`<li>${esc(line)}</li>`);
    text.push(`  ${line}`);
  }
  html.push(`</ul>`);
  const watches = input.daily.filter((d) => d.setup.verdict === "Watch");
  const watchTally = tally(watches.map((j) => DAILY_LABEL[j.outcome]));
  html.push(`<p style="margin:10px 0 0"><b>Watch setups (${watches.length}, not offered for trade):</b> ${esc(watchTally || "none")}. Mean ${esc(meanR(watches.map((j) => j.r)))} had they been taken.</p>`);
  text.push(`WATCH SETUPS (${watches.length}, not offered for trade): ${watchTally}. Mean ${meanR(watches.map((j) => j.r))}.`, "");

  html.push(`<h3 style="margin:20px 0 4px">Intraday signals, as each member received them</h3>`);
  html.push(
    `<p style="color:#64748b;margin:0 0 6px">Each signal counted once, from the first time it reached the member, taken at the market on the next 1-minute bar and held on its own stop to TP1, the stop or the Intraday style's cutoff (3:45 PM for stocks, the 4 PM close for crypto). The style's trailing stop is not walked here. Intraday signals have no measured record.</p>`,
  );
  text.push("INTRADAY SIGNALS, AS EACH MEMBER RECEIVED THEM");
  html.push(`<table style="border-collapse:collapse;width:100%;font-size:13px">`);
  const byMember = new Map<string, IntradayJudgement[]>();
  for (const j of input.intraday) byMember.set(j.signal.member, [...(byMember.get(j.signal.member) ?? []), j]);
  if (byMember.size === 0) {
    html.push(`<tr><td>No intraday signals reached a member this session.</td></tr>`);
    text.push("No intraday signals reached a member this session.");
  }
  for (const [member, js] of [...byMember.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const notices = js.reduce((n, j) => n + j.signal.deliveries, 0);
    const line = `${js.length} signals (${notices} notices): ${tally(js.map((j) => INTRADAY_LABEL[j.outcome]))}. Mean ${meanR(js.map((j) => j.r))}.`;
    html.push(`<tr style="border-top:1px solid #e2e8f0"><td style="padding:6px 8px 6px 0;vertical-align:top;white-space:nowrap"><b>${esc(member)}</b> ${esc(input.members.get(member) ?? "")}</td><td style="padding:6px 0">${esc(line)}</td></tr>`);
    text.push(`${member} ${input.members.get(member) ?? ""}: ${line}`);
  }
  html.push(`</table>`);
  const distinctSignals = new Map<string, IntradayJudgement>();
  for (const j of input.intraday) distinctSignals.set(`${j.signal.symbol}|${j.signal.direction}|${j.signal.label}|${j.signal.at}|${j.signal.price}`, j);
  if (distinctSignals.size > 0) {
    html.push(`<p style="margin:10px 0 4px"><b>The signals themselves</b></p><ul style="margin:0;padding-left:18px">`);
    const seen = new Set<string>();
    for (const j of [...distinctSignals.values()].sort((a, b) => a.signal.at.localeCompare(b.signal.at))) {
      const k = `${j.signal.symbol}|${j.signal.direction}|${j.signal.label}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const t = new Date(j.signal.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
      const line = `${t} ${j.signal.symbol} ${j.signal.direction === "bullish" ? "up" : "down"}, ${plainSignalLabel(j.signal.label)}: price ${priceUsd(j.signal.price)}, stop ${priceUsd(j.signal.stop)}, TP1 ${priceUsd(j.signal.tp1)} → ${INTRADAY_LABEL[j.outcome]}${j.r != null ? ` (${signed(j.r)}R)` : ""}`;
      html.push(`<li>${esc(line)}</li>`);
      text.push(`  ${line}`);
    }
    html.push(`</ul>`);
  }
  html.push(FOOTER(input.appUrl));
  text.push("", "A test email from GSPS, sent to the owner only. One session is one observation, not a measured record.");
  return { subject, html: html.join(""), text: text.join("\n") };
}
