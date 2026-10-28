/**
 * GSPS — the intraday focus list: the stocks the evening reads as primed for
 * the next session, so the intraday scan times those instead of a fixed list
 * (owner, 2026-10-21: "Just take the highly likely, and track those.
 * invalidate and replace them with executable moves throughout the day").
 *
 * Gann chose his active stocks from the daily charts, then timed the entry on
 * the hourly and session charts (Master Course Ch. 13); he traded active
 * stocks (*Truth of the Stock Tape*). A stock is primed for one of four
 * reasons, each his:
 *
 * 1. `plan_near` — a standing Execute or Watch plan whose entry is within a
 *    day's range of the last close (`lib/setups/resting.ts`'s reading, the
 *    owner's own line between a plan to time today and a resting order).
 * 2. `narrow_range` — the market has been held narrow for two weeks or more
 *    (`narrowRangeSessions`, Master Course pp. 246-248: "2-6 or 10-13 weeks
 *    in a narrow range ... the longer in range, the bigger the move";
 *    *Commodities* p. 51). Flagged at the edge when the close is within the
 *    3-point allowance of the range's top or bottom, where the breakaway comes.
 * 3. `big_day` — the last session was a reverse signal day or a 7-10 Day
 *    turn (`readReverseSignal`, *Commodities* pp. 319-321), or a wide range on
 *    heavy volume, which marks a culmination or a breakaway the next session
 *    confirms or reverses (*45 Years* Ch. X; *New Stock Trend Detector*
 *    pp. 39-45). "Wide" is twice the 14-session average true range and
 *    "heavy" the volume climax's 1.5× (`VOLUME_CLIMAX_THRESHOLD`): the width
 *    is an engineering figure, labelled; Gann gives none.
 * 4. `old_level` — the close within the 3-point allowance of the last
 *    completed 3-Day Chart top above it or bottom below it, the old level his
 *    crossing rule acts on (W006 p. 20; `lib/gann/entryTrigger.ts`).
 *
 * Gann ranks none of these above another (AGENTS.md, "The scorecard's
 * role"), so the list orders by how many reasons a stock has, then by its
 * average dollar volume (the more active stock first). `FOCUS_SIZE` is an
 * engineering figure sized to the free feed, labelled.
 *
 * Mandate: Gann as cited. Dewey: no periodicity claim. Hermetic: Cause and
 * Effect (each reason is a cause the chart already shows; the session is its
 * effect) and Rhythm (the list is rebuilt every evening and thinned through
 * the day as stops break, a wheel, not a batch). Law of Creation: the evening
 * read ⊗ the session's timing; neither alone says "this stock, now".
 */

import type { Bar } from "@/lib/types";
import type { DailyPlanLevels } from "@/lib/scanner/intraday";
import { atr } from "@/lib/analysis/pivots";
import { narrowRangeSessions, BREAKAWAY_RANGE_DAYS } from "@/lib/gann/breakaway";
import { readReverseSignal } from "@/lib/gann/extremeRules";
import { threePoints } from "@/lib/gann/pointScale";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import { VOLUME_CLIMAX_THRESHOLD } from "@/lib/gann/volumeClimax";
import { readLiquidity } from "@/lib/scan/liquidity";

/** Names the intraday scan times from the list at once (engineering, labelled). */
export const FOCUS_SIZE = 36;
/** Names stored per evening, so a broken one is replaced by the next. */
export const FOCUS_STORED = 72;
/** A wide day is this many 14-session average true ranges (engineering, labelled). */
export const WIDE_DAY_ATRS = 2;
/** Sessions read for the average true range and volume. */
const AVERAGE_SESSIONS = 20;

export type BigDaySignal =
  | "reverse_top"
  | "reverse_bottom"
  | "seven_to_ten_top"
  | "seven_to_ten_bottom"
  | "wide_up"
  | "wide_down";

export type FocusReason =
  | { kind: "plan_near"; direction: "up" | "down"; verdict: "Execute" | "Watch"; entry: number; distance: number }
  | { kind: "narrow_range"; sessions: number; top: number; bottom: number; edge: "top" | "bottom" | null }
  | { kind: "big_day"; signal: BigDaySignal }
  | { kind: "old_level"; level: number; side: "top" | "bottom" };

export interface FocusReading {
  symbol: string;
  reasons: FocusReason[];
  close: number;
  avgDollarVolume: number;
}

/** Calendar milliseconds in a day. */
const DAY_MS = 86_400_000;

function narrowRange(sessions: Bar[], close: number): FocusReason | null {
  const last = sessions[sessions.length - 1];
  const cutoff = Date.parse(last.t) - BREAKAWAY_RANGE_DAYS * DAY_MS;
  const window = sessions.filter((b) => Date.parse(b.t) > cutoff);
  const run = narrowRangeSessions(window);
  if (!run) return null;
  const top = Math.max(...run.map((b) => b.h));
  const bottom = Math.min(...run.map((b) => b.l));
  const toTop = top - close <= threePoints(top) ? top - close : Infinity;
  const toBottom = close - bottom <= threePoints(bottom) ? close - bottom : Infinity;
  const edge = toTop === Infinity && toBottom === Infinity ? null : toTop <= toBottom ? "top" : "bottom";
  return { kind: "narrow_range", sessions: run.length, top, bottom, edge };
}

function bigDay(sessions: Bar[]): FocusReason | null {
  const reverse = readReverseSignal(sessions);
  if (reverse.signal) {
    const prefix = reverse.rule === "sevenToTenDay" ? "seven_to_ten" : "reverse";
    return { kind: "big_day", signal: `${prefix}_${reverse.signal}` as BigDaySignal };
  }
  if (sessions.length < AVERAGE_SESSIONS + 2) return null;
  const last = sessions[sessions.length - 1];
  const prior = sessions.slice(0, -1);
  const prev = prior[prior.length - 1];
  const range = Math.max(last.h - last.l, Math.abs(last.h - prev.c), Math.abs(last.l - prev.c));
  const avgRange = atr(prior.slice(-(AVERAGE_SESSIONS + 1)), 14);
  const avgVolume = prior.slice(-AVERAGE_SESSIONS).reduce((s, b) => s + b.v, 0) / AVERAGE_SESSIONS;
  if (!(avgRange > 0) || !(avgVolume > 0)) return null;
  if (range < WIDE_DAY_ATRS * avgRange || last.v < VOLUME_CLIMAX_THRESHOLD * avgVolume) return null;
  return { kind: "big_day", signal: last.c >= prev.c ? "wide_up" : "wide_down" };
}

function oldLevel(sessions: Bar[], close: number): FocusReason | null {
  const pivots = walkSwingChart(sessions, THREE_DAY_CHART).pivots;
  const top = [...pivots].reverse().find((p) => p.kind === "top" && p.price > close);
  const bottom = [...pivots].reverse().find((p) => p.kind === "bottom" && p.price < close);
  const nearTop = top && top.price - close <= threePoints(top.price) ? top.price - close : Infinity;
  const nearBottom = bottom && close - bottom.price <= threePoints(bottom.price) ? close - bottom.price : Infinity;
  if (nearTop === Infinity && nearBottom === Infinity) return null;
  return nearTop <= nearBottom
    ? { kind: "old_level", level: top!.price, side: "top" }
    : { kind: "old_level", level: bottom!.price, side: "bottom" };
}

function planNear(plan: DailyPlanLevels | null, close: number, dayRange: number): FocusReason | null {
  if (!plan || !(dayRange > 0)) return null;
  const distance = Math.abs(close - plan.entry);
  if (distance > dayRange) return null;
  // A plan whose stop the close is already through is broken, not near.
  if (plan.direction === "up" ? close <= plan.stop : close >= plan.stop) return null;
  return { kind: "plan_near", direction: plan.direction, verdict: plan.verdict, entry: plan.entry, distance };
}

/**
 * Why `sessions` (completed daily bars, oldest first) is primed for the next
 * session, or null when it has no reason or too little history.
 */
export function readFocus(symbol: string, sessions: Bar[], plan: DailyPlanLevels | null): FocusReading | null {
  if (sessions.length < AVERAGE_SESSIONS + 2) return null;
  const close = sessions[sessions.length - 1].c;
  if (!(close > 0)) return null;
  const liquidity = readLiquidity(sessions);
  const dayRange = atr(sessions.slice(-(14 + 1)), 14);
  const reasons = [
    planNear(plan, close, dayRange),
    narrowRange(sessions, close),
    bigDay(sessions),
    oldLevel(sessions, close),
  ].filter((r): r is FocusReason => r !== null);
  if (reasons.length === 0) return null;
  return { symbol, reasons, close, avgDollarVolume: liquidity?.avgDollarVolume ?? 0 };
}

/** More reasons first, then the more active stock (Gann ranks no reason above another). */
export function rankFocus(readings: FocusReading[], limit = FOCUS_STORED): FocusReading[] {
  return [...readings]
    .sort((a, b) => b.reasons.length - a.reasons.length || b.avgDollarVolume - a.avgDollarVolume)
    .slice(0, limit);
}

/** One line a person reads for a reason. */
export function describeFocusReason(reason: FocusReason): string {
  switch (reason.kind) {
    case "plan_near":
      return `${reason.verdict} plan's entry ${reason.entry.toFixed(2)} is within a day's range`;
    case "narrow_range":
      return `${reason.sessions} sessions in a narrow range${reason.edge ? `, at its ${reason.edge}` : ""}`;
    case "big_day":
      return {
        reverse_top: "Reverse signal day at a top",
        reverse_bottom: "Reverse signal day at a bottom",
        seven_to_ten_top: "7-10 day run turned down",
        seven_to_ten_bottom: "7-10 day run turned up",
        wide_up: "Wide range up on heavy volume",
        wide_down: "Wide range down on heavy volume",
      }[reason.signal];
    case "old_level":
      return `Close to the old ${reason.side} at ${reason.level.toFixed(2)}`;
  }
}

/** A night's plan on a focus name, as `breakawayLinesFirst` reads it. */
export interface FocusPlanRow {
  symbol: string;
  direction: string | null;
  entry: number | string | null;
  output_state: string | null;
  invalidated_at?: string | null;
}

/** A stored focus row, as `breakawayLinesFirst` reads it. */
export interface StoredFocusRow {
  symbol: string;
  close: number | string | null;
  reasons: unknown;
}

/**
 * The focus names, with those at a breakaway first (owner, 2026-10-28, on
 * TXN: on the evening of October 26 it had sat 21 sessions in a narrow range,
 * closed at its top and at an old top, and the night's plan put its line at
 * 301.86; it ranked 42nd, past the slots the session timed, and crossed the
 * line the next morning with nobody watching).
 *
 * A breakaway line is where Gann's two night-before readings meet: the market
 * held narrow and closing at the range's edge, "2-6 or 10-13 weeks in a narrow
 * range ... the longer in range, the bigger the move" (Master Course pp.
 * 246-248; *Commodities* p. 51), and the night's plan whose crossing is on that
 * same side, still ahead of the close by no more than his 3-point allowance
 * (W006 p.20, the crossing his buy waits for). Gann chose such a stock from the
 * daily chart the night before and timed it in the session (Master Course
 * Ch. 13), so these lead the focus tier and take its reserved slots.
 *
 * Order among them: nearer the line first, read in allowances (the session
 * most likely to make the crossing), then the longer range (his "the longer in
 * range, the bigger the move"), then the evening's own rank. The nearness
 * order is an engineering reading, labelled. The rest keep the evening's
 * order. A plan the session has already retired (`invalidated_at`) or a
 * Reject is never a line. Pure.
 */
export function breakawayLinesFirst(
  focus: readonly StoredFocusRow[],
  plans: readonly FocusPlanRow[],
): { symbols: string[]; lines: string[] } {
  const planBy = new Map(plans.map((p) => [p.symbol.trim().toUpperCase(), p]));
  const lines: { symbol: string; nearness: number; sessions: number; rank: number }[] = [];
  const rest: string[] = [];
  focus.forEach((row, rank) => {
    const symbol = row.symbol.trim().toUpperCase();
    const line = breakawayLine(row, planBy.get(symbol));
    if (line) lines.push({ symbol, ...line, rank });
    else rest.push(symbol);
  });
  lines.sort((a, b) => a.nearness - b.nearness || b.sessions - a.sessions || a.rank - b.rank);
  const ordered = lines.map((l) => l.symbol);
  return { symbols: [...ordered, ...rest], lines: ordered };
}

function breakawayLine(row: StoredFocusRow, plan: FocusPlanRow | undefined): { nearness: number; sessions: number } | null {
  if (!plan || plan.invalidated_at) return null;
  if (plan.output_state !== "Execute" && plan.output_state !== "Watch") return null;
  const close = Number(row.close);
  const entry = Number(plan.entry);
  if (!(close > 0) || !(entry > 0)) return null;
  const up = plan.direction === "bullish" || plan.direction === "up";
  const down = plan.direction === "bearish" || plan.direction === "down";
  if (!up && !down) return null;
  const reasons = Array.isArray(row.reasons) ? (row.reasons as Partial<FocusReason>[]) : [];
  const range = reasons.find(
    (r): r is Extract<FocusReason, { kind: "narrow_range" }> => r?.kind === "narrow_range" && (r as { edge?: unknown }).edge === (up ? "top" : "bottom"),
  );
  if (!range) return null;
  // The crossing still ahead of the close, within one allowance of it.
  const ahead = up ? entry - close : close - entry;
  if (!(ahead > 0)) return null;
  const allowance = threePoints(entry);
  if (!(allowance > 0) || ahead > allowance) return null;
  return { nearness: ahead / allowance, sessions: Number(range.sessions) || 0 };
}
