/**
 * Gann's rules for managing an open trade (parity roadmap Stage C, owner
 * decisions 2 and 6, 2026-09-27: "Gann's method supersedes my own").
 *
 * Gann never fixes a profit objective. A trade leaves on its stop, on a rule
 * that says the entry was wrong, or on a change of trend, and the stop is
 * moved on the market's own structure as the trade proves itself.
 *
 * Rules and sources (all Tier A; see `docs/memory-bank/sources/`):
 * - **C1 hold test.** After crossing an old top, a market that is going
 *   higher should not react back 3 points under it (*New Stock Trend
 *   Detector* p. 20; *Commodities* p. 53). A daily close back under the
 *   crossed level by the allowance ends the trade.
 * - **C1 three adverse closes.** If the trade closes against you the third
 *   successive day, you are wrong: get out (*New Stock Trend Detector* p. 23).
 * - **C2 break-even.** Move the stop to break-even after 3-4 points of profit,
 *   with a 3-point stop (*Truth of the Stock Tape*, Book II; *Wall Street
 *   Stock Selector*, Rule 3). That is a profit equal to the risk taken, so the
 *   price-scaled form is: break-even once the trade has gone one risk unit in
 *   its favour.
 * - **C3 structural trail.** Keep the stop under each higher bottom as the
 *   swings step up (the 3-Day Chart's bottoms, *45 Years in Wall Street*), and
 *   under the prior month's low once the trade has run into a new month
 *   (*Stock Selector* Ch. IV, VII). In the final stage of a campaign (its 3rd
 *   section or later), trail by the size of the last reaction, and after a
 *   2-day counter-move, under the prior day (*Stock Selector* Ch. VII;
 *   *Commodities* BP/SP #9). Short trades are the mirror throughout.
 * - **C4 trend change.** The runner leaves on a change of trend, not at a
 *   fixed price (*Truth of the Stock Tape*, "never fix a target price"): the
 *   weekly swing chart turning against the trade after entry, or the
 *   campaign's greatest reaction over-balanced in space or time (Master
 *   Course Ch. 7; *Commodities* p. 51).
 *
 * Engineering choices, labelled as such:
 * - Gann's "3 points" is the codebase's existing price-scaled lost-motion
 *   allowance (`LOST_MOTION_BUFFER_PCT`), the same one the entry trigger uses
 *   to cross the level, so the hold test and the stops under swing points
 *   use the same allowance the entry did.
 * - Every rule reads completed daily sessions only. Callers act on a signal
 *   at the next opportunity (the replay at the next session's open).
 *
 * Three-question basis:
 * 1. Gann: as cited above.
 * 2. Cycles: the monthly and final-stage rules are about how long reactions
 *    last in a campaign. No periodicity is claimed, so Dewey's checklist does
 *    not apply; the replay measures each rule against the fixed bracket.
 * 3. Hermetic: Cause and Effect (each exit names the cause that ends the
 *    trade: a failed test, adverse closes, a changed trend) and Rhythm (the
 *    stop follows the market's own swings instead of a fixed distance).
 *    Polarity: every rule has its mirror for shorts.
 */

import type { Bar } from "@/lib/types";
import { LOST_MOTION_BUFFER_PCT } from "@/lib/gann/entryTrigger";
import { THREE_DAY_CHART, WEEKLY_SWING_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import { buildCampaignLedger } from "@/lib/gann/campaignLedger";

export const EXIT_ALLOWANCE_PCT = LOST_MOTION_BUFFER_PCT;

/** Gann's final stage: the 3rd section of a campaign or later. */
export const FINAL_STAGE_SECTION = 3;

export interface GannExitPosition {
  side: "long" | "short";
  /** The fill price. */
  entry: number;
  /** The stop the trade was opened with; its distance from entry is the risk unit. */
  initialStop: number;
  /** YYYY-MM-DD of the session the trade was filled in. */
  entryDate: string;
  /** The old top (long) or bottom (short) the entry crossed, for the hold test. */
  crossedLevel: number | null;
}

export type GannStopReason = "initial" | "break_even" | "last_reaction" | "prior_month" | "final_stage";
export type GannExitReason = "hold_test_failed" | "three_adverse_closes" | "trend_change";

export interface GannExitReading {
  /** The tightest stop Gann's rules allow now. Callers ratchet: never loosen a stop already placed. */
  stop: number;
  stopReason: GannStopReason;
  /** Set when a rule says to leave now, at the next opportunity. */
  exit: { reason: GannExitReason; note: string } | null;
}

const day = (b: Bar) => b.t.slice(0, 10);

/**
 * Read Gann's exit rules for one open position.
 *
 * `daily` is the completed daily sessions up to now, oldest first, including
 * history from before the entry (the swing charts and the campaign need it).
 * `best` is the best price the trade has seen since the fill.
 */
export function readGannExit(pos: GannExitPosition, daily: Bar[], best: number | null): GannExitReading {
  const long = pos.side === "long";
  const a = EXIT_ALLOWANCE_PCT / 100;
  const below = (p: number) => (long ? p * (1 - a) : p * (1 + a));
  const tighter = (x: number, y: number) => (long ? x > y : x < y);

  let stop = pos.initialStop;
  let stopReason: GannStopReason = "initial";
  const adopt = (candidate: number | null, reason: GannStopReason) => {
    if (candidate === null || !Number.isFinite(candidate)) return;
    if (tighter(candidate, stop)) {
      stop = candidate;
      stopReason = reason;
    }
  };

  const firstAfter = daily.findIndex((b) => day(b) >= pos.entryDate);
  const since = firstAfter === -1 ? [] : daily.slice(firstAfter);
  if (since.length === 0) return { stop, stopReason, exit: null };
  const last = since[since.length - 1];

  // C1: the hold test and three adverse closes.
  let exit: GannExitReading["exit"] = null;
  if (pos.crossedLevel !== null) {
    const failed = since.some((b) => (long ? b.c < below(pos.crossedLevel!) : b.c > below(pos.crossedLevel!)));
    if (failed) {
      exit = {
        reason: "hold_test_failed",
        note: `Closed back ${long ? "under" : "over"} the ${long ? "top" : "bottom"} it crossed (${pos.crossedLevel.toFixed(2)}): the breakout did not hold.`,
      };
    }
  }
  if (!exit && since.length >= 3) {
    const adverse = since.slice(-3).every((b) => (long ? b.c < pos.entry : b.c > pos.entry));
    if (adverse) exit = { reason: "three_adverse_closes", note: "Closed against the trade three days running." };
  }

  // C4: a change of trend after entry.
  if (!exit) {
    const weekly = walkSwingChart(daily, WEEKLY_SWING_CHART);
    const changedAt = weekly.trendChanges[weekly.trendChanges.length - 1];
    const against = long ? "bearish" : "bullish";
    if (weekly.trend === against && changedAt !== undefined && changedAt >= firstAfter) {
      exit = { reason: "trend_change", note: "The weekly swing chart turned against the trade." };
    }
  }
  const ledger = buildCampaignLedger(daily);
  const withCampaign = ledger !== null && ledger.trend === (long ? "bullish" : "bearish");
  // Only a reaction that began after the fill: one already running at entry
  // was part of the setup, not a signal about this trade.
  const reactionStart = ledger && ledger.legs.length > 0 ? ledger.legs[ledger.legs.length - 1].toIndex : -1;
  if (!exit && withCampaign && reactionStart >= firstAfter && (ledger!.spaceOverbalanced || ledger!.timeOverbalanced)) {
    exit = {
      reason: "trend_change",
      note: `The current reaction is larger than any earlier one in this campaign (${[
        ledger!.spaceOverbalanced && "price",
        ledger!.timeOverbalanced && "time",
      ]
        .filter(Boolean)
        .join(" and ")}): the trend is changing.`,
    };
  }

  // C2: break-even after a profit equal to the risk taken.
  const risk = Math.abs(pos.entry - pos.initialStop);
  if (best !== null && risk > 0 && (long ? best >= pos.entry + risk : best <= pos.entry - risk)) {
    adopt(pos.entry, "break_even");
  }

  // C3: under the last higher bottom (over the last lower top) since entry.
  const swings = walkSwingChart(daily, THREE_DAY_CHART);
  const lastSwing = [...swings.pivots].reverse().find((p) => p.kind === (long ? "bottom" : "top") && p.index >= firstAfter);
  if (lastSwing) adopt(below(lastSwing.price), "last_reaction");

  // C3: under the prior month's low once the trade has run into a new month.
  const month = day(last).slice(0, 7);
  if (month > pos.entryDate.slice(0, 7)) {
    const prior = daily.filter((b) => day(b).slice(0, 7) < month);
    const priorMonth = prior.length > 0 ? day(prior[prior.length - 1]).slice(0, 7) : null;
    if (priorMonth) {
      const bars = prior.filter((b) => day(b).slice(0, 7) === priorMonth);
      adopt(below(long ? Math.min(...bars.map((b) => b.l)) : Math.max(...bars.map((b) => b.h))), "prior_month");
    }
  }

  // C3: the final stage of the campaign.
  if (withCampaign && ledger!.sections >= FINAL_STAGE_SECTION && best !== null) {
    const counter = [...ledger!.legs].reverse().find((l) => l.direction === (long ? "down" : "up"));
    if (counter) adopt(long ? best * (1 - counter.pct / 100) : best * (1 + counter.pct / 100), "final_stage");
    if (since.length >= 3) {
      const [p2, p1, p0] = since.slice(-3);
      const twoDayCounter = long ? p1.c < p2.c && p0.c < p1.c : p1.c > p2.c && p0.c > p1.c;
      if (twoDayCounter) adopt(below(long ? p0.l : p0.h), "final_stage");
    }
  }

  return { stop, stopReason, exit };
}
