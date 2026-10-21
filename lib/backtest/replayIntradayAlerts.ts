/**
 * The intraday alerts, replayed: what the live intraday scan
 * (`lib/scanner/intraday.ts#scanIntraday`) would have alerted on each past
 * session, and what those alerts would have made had each been entered.
 * Replay only; nothing a person sees changes.
 *
 * It answers two questions the intraday thread asked after the intraday
 * profile failed its pre-registered test (2026-10-21,
 * `/mnt/project-files/replay-diagnosis/2026-10-21-intraday-profile-verdict.md`):
 *
 * 1. Does `plan_level_held` (the daily plan's entry, timed on the session's
 *    chart, PR #402) have an edge? It reads each session's daily plan, so the
 *    replay rebuilds that plan the way the daily scan prices it
 *    (`ReplayOptions.sessionPlans`), from the sessions before it.
 * 2. Does the evening focus list (`lib/scanner/focusList.ts`) pick better
 *    names than the fixed list's single stocks? The list is rebuilt each
 *    evening from the completed sessions and the day's plan, as the live job
 *    builds it, and the next session's alerts on its names are compared with
 *    the alerts on the fixed names over the same sessions.
 *
 * **How a session is walked.** The scan runs on the bars closed so far, at
 * the live system scan's cadence (every 15 minutes), with the inputs the live
 * route builds (`app/api/intraday-scan/route.ts#buildInput`): the session's
 * bars, the prior close, the same-time-of-day volume baseline, the daily ATR,
 * the completed daily sessions, the recent five-minute bars for the hourly
 * chart, the day's plan and the alerts already fired this session (so the
 * scan's own cooldown applies). An alert the scan shows is entered at the
 * next bar's open, one position per symbol at a time. Its stop is the alert's
 * own exit level (`invalidation`), and R is measured on the distance from the
 * fill to that stop.
 *
 * **Exits.** An alert a person trades goes through the order ticket, and every
 * protected position is managed on `LIVE_EXIT_RULE`, which is "gann" since Q14
 * (no fixed target). So each trade is walked on `walkGannExit`, the same walk
 * the swing replay's `exitRule: "gann"` uses, held at most ten sessions.
 *
 * **Engineering choices, labelled.** The bars are five-minute bars (the live
 * scan reads one-minute bars; the free feed's minute history is the binding
 * limit), and only the regular session is read. The fill is the next bar's
 * open with no feed delay. The focus list is the evening's top `FOCUS_SIZE`,
 * held for the whole session (live, a name whose daily stop breaks is
 * replaced through the day). The daily plan is the replay's rebuild: it reads
 * completed sessions only, where the live daily scan also sees the session in
 * progress.
 *
 * Three-question basis: 1. Gann, through the modules it replays (each cites
 * its own source); nothing new is decided here. 2. No periodicity claim, so
 * Dewey's checklist does not gate it; the result is read by his standard where
 * it applies (a base rate, the two halves). 3. Correspondence: the daily plan
 * and the session's chart are one plan read at two scales, and the replay
 * reads both as the live surfaces do. Law of Creation: daily plan ⊗ session
 * timing, the pair the alert claims creates a third; this measures whether it
 * does.
 */

import type { Bar } from "@/lib/types";
import { atr } from "@/lib/analysis/pivots";
import { etDateKey, etParts } from "@/lib/market/session";
import { readLiquidity } from "@/lib/scan/liquidity";
import {
  DEFAULT_CONFIG,
  scanIntraday,
  volumeBaseline,
  type Alert,
  type AssetKind,
  type DailyPlanLevels,
  type SignalType,
  type SymbolInput,
} from "@/lib/scanner/intraday";
import { DEFAULT_COST_PER_SHARE_USD } from "@/lib/trade/friction";
import { isTimeoutReason, walkGannExit, type ReplayTrade, type SessionDailyPlan } from "./replay";

/** Five-minute bars in a regular session. */
export const ALERT_BARS_PER_SESSION = 78;
/** The live system scan's cadence, in minutes (`.github/workflows/intraday-scan.yml`). */
export const ALERT_SCAN_MINUTES = 15;
/** Sessions of five-minute bars the volume baseline reads (the route's `BASELINE_DAYS`, calendar days). */
const BASELINE_DAYS = 12;
/** Regular session, ET minutes after midnight. */
const OPEN_MINUTE = 9 * 60 + 30;
const CLOSE_MINUTE = 16 * 60;

/** An alert entered and walked, with what it was. */
export interface AlertTrade extends ReplayTrade {
  signal: SignalType;
  /** The session's daily plan verdict, when the alert read one. */
  planVerdict: "Execute" | "Watch" | null;
  session: string;
}

export interface AlertReplayInput {
  symbol: string;
  kind: AssetKind;
  /** Five-minute bars, oldest first. Only regular-session bars are read. */
  bars: Bar[];
  /** Completed daily bars, oldest first. */
  dailyBars: Bar[];
  /** The daily plan each session stood on (`ReplayOptions.sessionPlans`), keyed by ET date. */
  plans: Map<string, SessionDailyPlan | null>;
  /** Sessions to walk (ET dates). Every session in the bars when absent. */
  sessions?: ReadonlySet<string>;
  /** Alert types entered. Every type when absent. */
  signals?: ReadonlySet<SignalType>;
  costPerShare?: number;
  maxBarsHeld?: number;
}

/** The plan as the live route hands it to the scan: Execute or Watch, its stop on the right side. */
export function asDailyPlanLevels(plan: SessionDailyPlan | null | undefined): DailyPlanLevels | null {
  if (!plan || (plan.verdict !== "Execute" && plan.verdict !== "Watch")) return null;
  if (!(plan.entry > 0) || !(plan.stop > 0)) return null;
  if (plan.direction === "up" ? plan.stop >= plan.entry : plan.stop <= plan.entry) return null;
  return {
    direction: plan.direction,
    verdict: plan.verdict,
    entry: plan.entry,
    stop: plan.stop,
    tp1: plan.tp1 > 0 ? plan.tp1 : null,
    mtp: plan.mtp > 0 ? plan.mtp : null,
  };
}

const minuteOf = (b: Bar) => etParts(new Date(b.t)).minutes;
const sessionOf = (b: Bar) => etDateKey(new Date(b.t));

/**
 * Walk a symbol's sessions on the live intraday scan and enter each alert it
 * shows. Returns one trade per alert entered.
 */
export function replayIntradayAlerts(input: AlertReplayInput): AlertTrade[] {
  const { symbol, kind, dailyBars, plans, sessions, signals, costPerShare = DEFAULT_COST_PER_SHARE_USD } = input;
  const maxBarsHeld = input.maxBarsHeld ?? ALERT_BARS_PER_SESSION * 10;
  const bars = input.bars.filter((b) => {
    const m = minuteOf(b);
    return m >= OPEN_MINUTE && m < CLOSE_MINUTE;
  });
  const trades: AlertTrade[] = [];
  let busyUntil = 0;

  // Index the session each bar starts and ends at.
  const starts = new Map<string, number>();
  for (let i = 0; i < bars.length; i++) {
    const d = sessionOf(bars[i]);
    if (!starts.has(d)) starts.set(d, i);
  }
  const dates = [...starts.keys()];

  for (let s = 0; s < dates.length; s++) {
    const date = dates[s];
    if (sessions && !sessions.has(date)) continue;
    const from = starts.get(date)!;
    const to = s + 1 < dates.length ? starts.get(dates[s + 1])! : bars.length;
    const priorDaily = dailyBars.filter((b) => b.t.slice(0, 10) < date);
    if (priorDaily.length < 3) continue;
    const baselineFrom = Date.parse(`${date}T00:00:00Z`) - BASELINE_DAYS * 86_400_000;
    const baselineStart = bars.findIndex((b) => Date.parse(b.t) >= baselineFrom);
    const dailyPlan = asDailyPlanLevels(plans.get(date));
    const liquidity = readLiquidity(priorDaily);
    const dailyAtr = priorDaily.length > 2 ? atr(priorDaily.slice(-20), 14) : null;
    const prevClose = priorDaily[priorDaily.length - 1].c;
    const fired: { type: SignalType; direction: "up" | "down"; at: string }[] = [];

    // The last bar of the session cannot be entered on: its fill is the next session.
    for (let k = from; k < to - 1; k++) {
      const last = bars[k];
      const end = Date.parse(last.t) + 5 * 60_000;
      if (etParts(new Date(end)).minutes % ALERT_SCAN_MINUTES !== 0) continue;
      const scanInput: SymbolInput = {
        symbol,
        kind,
        bars: bars.slice(from, k + 1),
        barIntervalMinutes: 5,
        prevClose,
        quote: { price: last.c, at: last.t },
        volumeBaseline: volumeBaseline(bars.slice(Math.max(0, baselineStart), from), minuteOf(last), date),
        dailyAtr,
        recentBars: bars.slice(Math.max(0, baselineStart), k + 1),
        priorDailyBars: priorDaily,
        avgDailyVolume: liquidity?.avgVolume ?? null,
        dailyPlan,
        lastAlerts: fired,
        marketClosed: false,
      };
      const { alerts } = scanIntraday([scanInput], DEFAULT_CONFIG, new Date(end));
      for (const alert of alerts) fired.push({ type: alert.type, direction: alert.direction, at: new Date(end).toISOString() });
      if (k + 1 < busyUntil) continue;
      const alert = alerts.find((a) => !signals || signals.has(a.type));
      if (!alert) continue;
      const trade = enterAlert({ alert, bars, at: k + 1, dailyBars, maxBarsHeld, costPerShare, symbol, date, dailyPlan });
      if (!trade) continue;
      trades.push(trade);
      busyUntil = k + 1 + trade.barsHeld;
    }
  }
  return trades;
}

function enterAlert(input: {
  alert: Alert;
  bars: Bar[];
  at: number;
  dailyBars: Bar[];
  maxBarsHeld: number;
  costPerShare: number;
  symbol: string;
  date: string;
  dailyPlan: DailyPlanLevels | null;
}): AlertTrade | null {
  const { alert, bars, at, dailyBars, maxBarsHeld, costPerShare, symbol, date, dailyPlan } = input;
  const long = alert.direction === "up";
  const dir = long ? 1 : -1;
  const entry = bars[at].o;
  const stop = alert.invalidation;
  if (stop == null || !(stop > 0)) return null;
  const risk = Math.abs(entry - stop);
  // A fill that opened through the alert's own exit is no trade (the scan
  // retires such an alert before showing it; the gap to the next open can still cross it).
  if (!(risk > 0) || (long ? entry <= stop : entry >= stop)) return null;
  const walked = walkGannExit({ bars, from: at, maxBarsHeld, long, entry, stop, dailyBars, crossedLevel: null });
  const r = (dir * (walked.exit - entry) - costPerShare) / risk;
  const exitReason = walked.reason;
  return {
    symbol,
    openedAt: bars[at].t,
    pattern: null,
    setupKind: "continuation",
    direction: long ? "bullish" : "bearish",
    entry,
    stop,
    target: alert.continuationPlan.firstTarget ?? NaN,
    atrMultiple: 0,
    largeCap: false,
    barsHeld: walked.barsHeld,
    closedAt: bars[Math.min(bars.length - 1, at + walked.barsHeld - 1)].t,
    outcome: isTimeoutReason(exitReason) ? "timeout" : r > 0 ? "win" : "loss",
    exitReason,
    crossedLevel: null,
    exitPrice: walked.finalExit,
    rMultiple: r,
    ambiguous: false,
    signal: alert.type,
    planVerdict: alert.type === "plan_level_held" && dailyPlan ? dailyPlan.verdict : null,
    session: date,
  };
}
