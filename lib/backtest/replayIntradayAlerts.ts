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
 * bars, the prior close, the same-time-of-day volume baseline (regular session
 * only, as the numerator), the daily ATR, the completed daily sessions of
 * the last `INTRADAY_DAILY_HISTORY_DAYS` calendar days (the span the route
 * fetches), the recent
 * five-minute bars for the hourly chart, the day's plan and the alerts already
 * fired this session (so the scan's own cooldown applies).
 *
 * **Which alerts are entered.** Every alert the panel offers as a trade.
 * `reversal_risk` is not one: the card prices no levels for it and its own
 * text says to stand aside (`lib/setups/intraday.ts#isReversalRisk`). A
 * reaction back under a crossed top is the long's exit (NSTD p. 20), not a
 * selling point (Rule 4, NSTD p. 46). It still counts toward the cooldown.
 * Nor is an alert against the daily trend (`Alert.againstDailyTrend`, audit
 * I-02, 2026-10-28): the panel shows it for study and offers no trade, "never
 * buck the trend" (never-failing rule 5, *Commodities* pp. 43-45).
 *
 * **The fill.** A person sees an alert a feed delay after the bars it read
 * (the system scan reads data ending 16 minutes before it runs), so the fill
 * is the open `feedDelayBars` bars after the next one (3 by default), within
 * the same session. Refused, and counted by reason: no fill left in the
 * session, a stop that traded before the fill, a bad print, a fill through
 * the stop or past the first target, and a risk smaller than the session's
 * Gann point (`SessionMetrics.point`), which is inside the lost motion Gann
 * allows any level. The floor is an engineering reading of that allowance.
 * Its stop is the alert's own exit level (`invalidation`), and R is measured
 * on the distance from the fill to that stop.
 *
 * **Exits.** An alert a person trades goes through the order ticket, and every
 * protected position is managed on `LIVE_EXIT_RULE`, which is "structure" since Q14
 * (no fixed target). So each trade is walked on `walkGannExit`, the same walk
 * the swing replay's `exitRule: "structure"` uses, with the level the entry crossed
 * (`entryCrossedLevel`, as `readGannExitFromBars` reads it live) and the share
 * count (D2), held at most ten sessions. Reversals and re-buys are not walked:
 * a manual trade gets them only as offers in the exit notes.
 *
 * **Engineering choices, labelled.** The bars are five-minute bars (the live
 * scan reads one-minute bars; the free feed's minute history is the binding
 * limit), and only the regular session is read. The daily ATR and average
 * volume read completed sessions only, where live also reads today's partial
 * bar. The focus list is the evening's top `FOCUS_SIZE`, held for the whole
 * session (live, a name whose daily stop breaks is replaced through the day).
 * The daily plan is the replay's rebuild: it reads completed sessions only,
 * where the live daily scan also sees the session in progress, and it carries
 * no data-lag hold (live, Execute is held to Watch during the session on the
 * delayed feed).
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
import { delayedFillIndex, replayFeedDelayMs } from "@/lib/data/timeliness";
import { etDateKey, etParts } from "@/lib/market/session";
import { isEarlyClose } from "@/lib/market/calendar";
import { readLiquidity } from "@/lib/scan/liquidity";
import { completedDailyBars, priorDailyClose } from "@/lib/scanner/priorClose";
import {
  DEFAULT_CONFIG,
  INTRADAY_DAILY_HISTORY_DAYS,
  NOTICE_SIGNALS,
  planLineAhead,
  scanIntraday,
  sessionMetrics,
  volumeBaseline,
  type Alert,
  type AssetKind,
  type DailyPlanLevels,
  type SignalType,
  type SymbolInput,
} from "@/lib/scanner/intraday";
import { isReversalRisk } from "@/lib/setups/intraday";
import { entryCrossedLevel } from "@/lib/trade/gann-exit-live";
import { DEFAULT_COST_PER_SHARE_USD } from "@/lib/trade/friction";
import type { GannEntryKind } from "@/lib/gann/entryKind";
import { scoreLineSession, type LineSessionRecord } from "./lineNotices";
import { isTimeoutReason, walkGannExit, type ReplayTrade, type SessionDailyPlan } from "./replay";

/** Five-minute bars in a regular session. */
export const ALERT_BARS_PER_SESSION = 78;
/** The live system scan's cadence, in minutes (`.github/workflows/intraday-scan.yml`). */
export const ALERT_SCAN_MINUTES = 15;
/**
 * Five-minute bars between the bars a scan read and the first fill a person
 * can get: the system scan reads data ending 16 minutes before it runs
 * (`buildInput`'s `end`), so about three bars.
 */
export const ALERT_FEED_DELAY_BARS = 3;
/** Sessions of five-minute bars the volume baseline reads (the route's `BASELINE_DAYS`, calendar days). */
const BASELINE_DAYS = 12;
/** Regular session, ET minutes after midnight. */
const OPEN_MINUTE = 9 * 60 + 30;
const CLOSE_MINUTE = 16 * 60;
/** 1:00 PM ET, an NYSE early close, as the live scanner reads it. */
const EARLY_CLOSE_MINUTE = 13 * 60;

/** An alert entered and walked, with what it was. */
export interface AlertTrade extends ReplayTrade {
  signal: SignalType;
  /** The session's daily plan verdict, when the alert read one. */
  planVerdict: "Execute" | "Watch" | null;
  session: string;
  /** The best price reached while held, in R from the fill (the walk's `best`); null when none was read. */
  bestR: number | null;
}

/** Why an alert that was chosen for entry was not entered. */
export type AlertRefusal =
  | "session_ended"
  | "stopped_before_fill"
  | "bad_print"
  | "through_stop"
  | "past_target"
  | "risk_under_point"
  /** No first target, or one that pays no more than the risk: the live alert offers no trade (M-K5). */
  | "target_unpaid";

export interface AlertReplayResult {
  trades: AlertTrade[];
  refused: Partial<Record<AlertRefusal, number>>;
  /** Each session a plan's line was ahead, with its line notices (`collectLineNotices`). */
  lineSessions?: LineSessionRecord[];
}

export interface AlertReplayInput {
  symbol: string;
  kind: AssetKind;
  /** Five-minute bars, oldest first. Only regular-session bars are read. */
  bars: Bar[];
  /** Completed daily bars, oldest first. */
  dailyBars: Bar[];
  /** Monthly bars, for the level the entry crossed (`entryCrossedLevel`). */
  monthlyBars?: Bar[];
  /** Split-adjusted shares outstanding on a date, for the D2 exit. */
  sharesOn?: (date: string) => number | null;
  /** The daily plan each session stood on (`ReplayOptions.sessionPlans`), keyed by ET date. */
  plans: Map<string, SessionDailyPlan | null>;
  /** Sessions to walk (ET dates). Every session in the bars when absent. */
  sessions?: ReadonlySet<string>;
  /** Alert types entered. Every tradeable type when absent. */
  signals?: ReadonlySet<SignalType>;
  /**
   * Bars between the next bar and the fill. When absent the fill is the first
   * bar opening at or after the scan's evaluation (`delayedFillIndex`), which
   * under the 15-minute delay is `ALERT_FEED_DELAY_BARS` after the next.
   */
  feedDelayBars?: number;
  /** The data delay modeled, in ms (DATA-DELAY-001); the feed's contract by default. */
  feedDelayMs?: number;
  costPerShare?: number;
  maxBarsHeld?: number;
  /** Record the line notices and their outcomes (`lib/backtest/lineNotices.ts`). */
  collectLineNotices?: boolean;
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
    awaitsCrossing: plan.awaitsCrossing,
  };
}

const minuteOf = (b: Bar) => etParts(new Date(b.t)).minutes;
const sessionOf = (b: Bar) => etDateKey(new Date(b.t));

/**
 * Walk a symbol's sessions on the live intraday scan and enter each alert it
 * offers as a trade. Returns one trade per alert entered, and the refusals.
 */
export function replayIntradayAlerts(input: AlertReplayInput): AlertReplayResult {
  const { symbol, kind, dailyBars, plans, sessions, signals, costPerShare = DEFAULT_COST_PER_SHARE_USD } = input;
  const maxBarsHeld = input.maxBarsHeld ?? ALERT_BARS_PER_SESSION * 10;
  const feedDelayBars = Math.max(0, input.feedDelayBars ?? ALERT_FEED_DELAY_BARS);
  // The run's delay model: the feed's contract, never today's environment.
  const feedDelayMs = input.feedDelayMs ?? replayFeedDelayMs(kind === "crypto" ? "crypto" : "us_equity");
  const bars = input.bars.filter((b) => {
    const m = minuteOf(b);
    const close = isEarlyClose(etDateKey(new Date(b.t))) ? EARLY_CLOSE_MINUTE : CLOSE_MINUTE;
    return m >= OPEN_MINUTE && m < close;
  });
  const trades: AlertTrade[] = [];
  const refused: Partial<Record<AlertRefusal, number>> = {};
  const lineSessions: { s: number; rec: LineSessionRecord }[] = [];
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
    // The live route's window: the completed sessions of the days it fetches,
    // keyed by market as it keys them (lib/scanner/priorClose.ts).
    const dailyFrom = new Date(Date.parse(`${date}T00:00:00Z`) - INTRADAY_DAILY_HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
    const priorDaily = completedDailyBars(dailyBars, date, kind === "crypto", dailyFrom);
    if (priorDaily.length < 3) continue;
    const baselineFrom = Date.parse(`${date}T00:00:00Z`) - BASELINE_DAYS * 86_400_000;
    const baselineStart = bars.findIndex((b) => Date.parse(b.t) >= baselineFrom);
    const sessionPlan = plans.get(date);
    const dailyPlan = asDailyPlanLevels(sessionPlan);
    const liquidity = readLiquidity(priorDaily);
    const dailyAtr = atr(priorDaily.slice(-20), 14);
    // A non-positive prior close reads as none, as on the live scan.
    const prevClose = priorDailyClose(priorDaily, date, kind === "crypto");
    const fired: { type: SignalType; direction: "up" | "down"; at: string }[] = [];
    // The session's line, when the plan still waits on its crossing: one
    // record whether a notice fires or not, so the notices meet a base rate.
    const ahead = input.collectLineNotices && dailyPlan ? planLineAhead(dailyPlan, prevClose) : null;
    const lineRec: LineSessionRecord | null =
      ahead && dailyPlan && prevClose != null
        ? {
            symbol, session: date, direction: dailyPlan.direction, verdict: dailyPlan.verdict, entry: dailyPlan.entry, stop: dailyPlan.stop,
            line: ahead.line, confirmingClose: ahead.confirmingClose, atEntry: ahead.atEntry, prevClose, approach: null, crossed: null, outcome: null,
          }
        : null;
    if (lineRec) lineSessions.push({ s, rec: lineRec });

    // The last bar of the session cannot be entered on: its fill is the next session.
    for (let k = from; k < to - 1; k++) {
      const last = bars[k];
      const end = Date.parse(last.t) + 5 * 60_000;
      if (etParts(new Date(end)).minutes % ALERT_SCAN_MINUTES !== 0) continue;
      // DATA-DELAY-001 (2026-10-28): the scan that reads bars through `last`
      // runs once they are usable, the last bar's close plus the feed's delay,
      // and is evaluated then, as the live scan is (no receipt time is
      // recorded in history, so the replay assumes the minimum delay).
      const evaluatedAt = new Date(end + feedDelayMs);
      const scanInput: SymbolInput = {
        symbol,
        kind,
        bars: bars.slice(from, k + 1),
        barIntervalMinutes: 5,
        prevClose,
        quote: { price: last.c, at: new Date(end).toISOString() },
        volumeBaseline: volumeBaseline(bars.slice(Math.max(0, baselineStart), from), minuteOf(last), date, 2, kind !== "crypto"),
        dailyAtr,
        recentBars: bars.slice(Math.max(0, baselineStart), k + 1),
        priorDailyBars: priorDaily,
        avgDailyVolume: liquidity?.avgVolume ?? null,
        dailyPlan,
        lastAlerts: fired,
        marketClosed: false,
        feedDelayMs,
        feed: kind === "crypto" ? "realtime" : "delayed",
      };
      const { alerts } = scanIntraday([scanInput], DEFAULT_CONFIG, evaluatedAt);
      for (const alert of alerts) fired.push({ type: alert.type, direction: alert.direction, at: evaluatedAt.toISOString() });
      if (lineRec) {
        for (const alert of alerts) {
          const hit = { at: evaluatedAt.toISOString(), barIndex: k, price: alert.move.current };
          if (alert.type === "line_approach" && !lineRec.approach) lineRec.approach = hit;
          if (alert.type === "line_crossed" && !lineRec.crossed) lineRec.crossed = hit;
        }
      }
      // The first bar a person could fill on opens at or after the evaluation
      // (`delayedFillIndex`): three five-minute bars after the next under the
      // 15-minute delay. `feedDelayBars` keeps the older fixed count for a
      // caller that asks for it.
      const at = input.feedDelayBars != null ? k + 1 + feedDelayBars : delayedFillIndex(bars, k, { assetClass: kind === "crypto" ? "crypto" : "us_equity", delayMs: feedDelayMs, intervalMinutes: 5 });
      if (at < 0) continue;
      if (at < busyUntil) continue;
      // A notice (nearing or at a daily plan's entry) prices no session trade.
      const alert = alerts.find(
        (a) =>
          !isReversalRisk(a) &&
          !NOTICE_SIGNALS.has(a.type) &&
          !a.againstDailyTrend &&
          // Held live too (2026-10-29): its stop sat inside one point of the
          // alert's price, so it was never offered; the fill-time
          // `risk_under_point` check below still refuses the rest.
          !a.riskUnderPoint &&
          (!signals || signals.has(a.type)),
      );
      if (!alert) continue;
      const point = sessionMetrics(scanInput)?.point ?? 0;
      const entered = enterAlert({
        alert, bars, from: k + 1, at, sessionEnd: to, point, dailyBars, monthlyBars: input.monthlyBars ?? [], sharesOn: input.sharesOn,
        maxBarsHeld, costPerShare, symbol, kind, date, dailyPlan, planEntryKind: sessionPlan?.entryKind,
      });
      if (typeof entered === "string") {
        refused[entered] = (refused[entered] ?? 0) + 1;
        continue;
      }
      trades.push(entered);
      busyUntil = at + entered.barsHeld;
    }
  }
  if (!input.collectLineNotices) return { trades, refused };
  const bounds = dates.map((date, i) => ({ date, from: starts.get(date)!, to: i + 1 < dates.length ? starts.get(dates[i + 1])! : bars.length }));
  for (const { s, rec } of lineSessions) rec.outcome = scoreLineSession(bars, bounds, s, rec);
  return { trades, refused, lineSessions: lineSessions.map((l) => l.rec) };
}

/** One alert's fill or refusal, exported for its tests. */
export function enterAlert(input: {
  alert: Alert;
  bars: Bar[];
  /** The first bar after the scan. */
  from: number;
  /** The fill bar. */
  at: number;
  /** One past the session's last bar. */
  sessionEnd: number;
  point: number;
  dailyBars: Bar[];
  monthlyBars: Bar[];
  sharesOn?: (date: string) => number | null;
  maxBarsHeld: number;
  costPerShare: number;
  symbol: string;
  kind: AssetKind;
  date: string;
  dailyPlan: DailyPlanLevels | null;
  /** How the session's daily plan was armed; recorded on a `plan_level_held` trade only. */
  planEntryKind?: GannEntryKind;
}): AlertTrade | AlertRefusal {
  const { alert, bars, from, at, sessionEnd, point, dailyBars, monthlyBars, sharesOn, maxBarsHeld, costPerShare, symbol, kind, date, dailyPlan, planEntryKind } = input;
  if (at >= sessionEnd) return "session_ended";
  const long = alert.direction === "up";
  const dir = long ? 1 : -1;
  const stop = alert.invalidation;
  if (stop == null || !Number.isFinite(stop) || !(stop > 0)) return "bad_print";
  // The plan is retired once its stop trades, before a person could fill it.
  for (let j = from; j < at; j++) if (long ? bars[j].l <= stop : bars[j].h >= stop) return "stopped_before_fill";
  const entry = bars[at].o;
  if (!Number.isFinite(entry) || !(entry > 0)) return "bad_print";
  // A fill that opened through the alert's own exit is no trade.
  if (long ? entry <= stop : entry >= stop) return "through_stop";
  const target = alert.continuationPlan.firstTarget;
  // The live alert offers no "Trade this" without a first target, or with one
  // that pays no more than the risk ("profits must exceed losses", *Wall
  // Street Stock Selector* Ch. II; M-K5), so the replay trades neither
  // (recheck 2026-10-22: it traded both).
  if (target == null || !Number.isFinite(target) || alert.continuationPlan.paysRisk === false) return "target_unpaid";
  if (long ? entry >= target : entry <= target) return "past_target";
  const risk = Math.abs(entry - stop);
  if (point > 0 && risk < point) return "risk_under_point";
  const side = long ? "long" : "short";
  const crossedLevel = entryCrossedLevel(side, entry, bars[at].t, dailyBars, monthlyBars);
  const walked = walkGannExit({
    bars, from: at, maxBarsHeld, long, entry, stop, dailyBars, crossedLevel,
    sharesOn, isStock: kind !== "crypto",
  });
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
    target: target ?? NaN,
    atrMultiple: 0,
    largeCap: false,
    barsHeld: walked.barsHeld,
    closedAt: bars[Math.min(bars.length - 1, at + walked.barsHeld - 1)].t,
    outcome: isTimeoutReason(exitReason) ? "timeout" : r > 0 ? "win" : "loss",
    exitReason,
    crossedLevel,
    exitPrice: walked.finalExit,
    rMultiple: r,
    ambiguous: false,
    signal: alert.type,
    planVerdict: alert.type === "plan_level_held" && dailyPlan ? dailyPlan.verdict : null,
    ...(alert.type === "plan_level_held" && dailyPlan && planEntryKind ? { entryKind: planEntryKind } : {}),
    session: date,
    bestR: walked.best == null ? null : (dir * (walked.best - entry)) / risk,
  };
}
