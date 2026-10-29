/**
 * The line notices, replayed: how often "Nearing the plan's line"
 * (`line_approach`) and "Through the plan's line" (`line_crossed`) come ahead
 * of a crossing the close confirms, and how often they come before nothing.
 * Research only: the notices are never trades, and nothing here feeds a
 * verdict.
 *
 * Each session a standing daily plan still waits on its crossing
 * (`planLineAhead`) is one record, whether or not a notice fired, so the
 * notices can be read against that base rate. The replay
 * (`replayIntradayAlerts`, `collectLineNotices`) records the first approach and
 * the first crossing notice of the session; this module judges each record
 * over the next `LINE_NOTICE_HORIZON_SESSIONS` sessions:
 *
 * - **confirmed**: a session close at or past the confirming close, the line
 *   3 points past the old level (W006 p.20, Rules 3(b)-(c)), before the
 *   plan's stop trades;
 * - **stopped**: the plan's stop trades first;
 * - **faded**: neither within the horizon.
 *
 * And how far price went after the notice, in Gann points at the notice's
 * price (`pricePoint`), best and worst, so "ahead of the move" is read as
 * the points still to come when the notice fired. A stopped record's
 * excursion ends at the bar that traded the stop.
 *
 * Engineering choices, labelled: the horizon (3 sessions), a session's close
 * as its last regular-session five-minute bar's close, and the size of a
 * "move" for the capture count (`LINE_MOVE_POINTS`, two 3-point allowances).
 *
 * Three-question basis: 1. Gann's crossing rule (W006 p.20, Rules 3(b)-(c)),
 * through `planLineAhead`; nothing new is decided here. 2. No periodicity
 * claim; read against a base rate, as Dewey asks of any signal. 3. Cause and
 * Effect: the notice claims a cause (the session nearing the line) for an
 * effect (the close confirming it), and this counts how often the effect
 * follows. Law of Creation: notice ⊗ base rate; either alone says nothing.
 */

import type { Bar } from "@/lib/types";
import { pricePoint } from "@/lib/gann/pointScale";

/** Sessions a notice is judged over, its own included (engineering, labelled). */
export const LINE_NOTICE_HORIZON_SESSIONS = 3;
/** Gann points a move must run, from the session's open, to count as one (engineering: two 3-point allowances). */
export const LINE_MOVE_POINTS = 6;

export interface LineNoticeHit {
  /** When the scan that raised it was evaluated (ISO). */
  at: string;
  /** The last bar the scan read, in the replay's regular-session bars. */
  barIndex: number;
  /** The last price the scan read. */
  price: number;
}

export interface LineOutcome {
  /** The horizon was read whole, or the record resolved inside what was read. */
  complete: boolean;
  resolution: "confirmed" | "stopped" | "faded";
  /** Sessions after this one the confirming close came (0: the same session). */
  confirmedAfter: number | null;
  /** The confirming session's close (ISO of its last bar), for the lead time. */
  confirmedAt: string | null;
  /** Best and worst excursion from the session's open over the horizon, in Gann points. */
  fromOpen: { bestPts: number; worstPts: number };
  /** The same from the first notice's price, after it; null with no notice. */
  fromNotice: { bestPts: number; worstPts: number } | null;
  /** Minutes from the first notice to the confirming close; null when none. */
  leadMinutes: number | null;
}

export interface LineSessionRecord {
  symbol: string;
  session: string;
  direction: "up" | "down";
  verdict: "Execute" | "Watch";
  entry: number;
  stop: number;
  line: number;
  confirmingClose: number;
  atEntry: boolean;
  prevClose: number;
  approach: LineNoticeHit | null;
  crossed: LineNoticeHit | null;
  outcome: LineOutcome | null;
}

export interface SessionBounds {
  date: string;
  /** First bar of the session. */
  from: number;
  /** One past its last bar. */
  to: number;
}

/**
 * Judge one record over the horizon. `bars` are the replay's regular-session
 * bars, `bounds` its sessions in order, `s` the record's session.
 */
export function scoreLineSession(
  bars: readonly Bar[],
  bounds: readonly SessionBounds[],
  s: number,
  rec: Pick<LineSessionRecord, "direction" | "stop" | "confirmingClose" | "approach" | "crossed">,
  horizon: number = LINE_NOTICE_HORIZON_SESSIONS,
): LineOutcome | null {
  const here = bounds[s];
  if (!here || here.to <= here.from) return null;
  const up = rec.direction === "up";
  const dir = up ? 1 : -1;
  const last = Math.min(bounds.length, s + horizon);
  let resolution: LineOutcome["resolution"] = "faded";
  let confirmedAfter: number | null = null;
  let confirmedAt: string | null = null;
  let stopBar = -1;
  outer: for (let k = s; k < last; k++) {
    const { from, to } = bounds[k];
    for (let i = from; i < to; i++) {
      if (up ? bars[i].l <= rec.stop : bars[i].h >= rec.stop) {
        resolution = "stopped";
        stopBar = i;
        break outer;
      }
    }
    if (to > from && (up ? bars[to - 1].c >= rec.confirmingClose : bars[to - 1].c <= rec.confirmingClose)) {
      resolution = "confirmed";
      confirmedAfter = k - s;
      confirmedAt = bars[to - 1].t;
      break;
    }
  }
  const complete = resolution !== "faded" || s + horizon <= bounds.length;
  // A stopped plan is over at the stop: nothing after it counts as its move.
  const end = stopBar >= 0 ? stopBar + 1 : bounds[last - 1].to;
  const excursion = (start: number, price: number) => {
    const unit = pricePoint(price);
    if (!(unit > 0)) return null;
    let best = 0;
    let worst = 0;
    for (let i = start; i < end; i++) {
      best = Math.max(best, dir * ((up ? bars[i].h : bars[i].l) - price));
      worst = Math.min(worst, dir * ((up ? bars[i].l : bars[i].h) - price));
    }
    return { bestPts: best / unit, worstPts: worst / unit };
  };
  const fromOpen = excursion(here.from, bars[here.from].o) ?? { bestPts: 0, worstPts: 0 };
  const first = [rec.approach, rec.crossed].filter((h): h is LineNoticeHit => h != null).sort((a, b) => a.barIndex - b.barIndex)[0] ?? null;
  const fromNotice = first ? excursion(first.barIndex + 1, first.price) : null;
  const leadMinutes = first && confirmedAt ? Math.round((Date.parse(confirmedAt) + 5 * 60_000 - Date.parse(first.at)) / 60_000) : null;
  return { complete, resolution, confirmedAfter, confirmedAt, fromOpen, fromNotice, leadMinutes };
}

export interface LineGroupSummary {
  /** Records judged over a whole horizon (or resolved inside it). */
  n: number;
  confirmed: number;
  /** Confirmed by the close of the notice's own session. */
  confirmedSameSession: number;
  stopped: number;
  faded: number;
  confirmedRate: number | null;
  medianBestPts: number | null;
  medianWorstPts: number | null;
  medianLeadMinutes: number | null;
}

export interface LineNoticeSummary {
  horizonSessions: number;
  movePoints: number;
  /** Every session a plan's line was ahead: the base rate. */
  eligible: LineGroupSummary;
  /** Sessions with no notice at all. */
  noNotice: LineGroupSummary;
  approach: LineGroupSummary;
  crossed: LineGroupSummary;
  crossedExecute: LineGroupSummary;
  crossedWatch: LineGroupSummary;
  /** Sessions whose move from the open reached `movePoints`, and how many a notice came ahead of. */
  moves: { n: number; withNotice: number; medianPtsLeftAfterNotice: number | null };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function summariseGroup(records: LineSessionRecord[], fromNotice: boolean): LineGroupSummary {
  const judged = records.filter((r) => r.outcome?.complete);
  const count = (res: LineOutcome["resolution"]) => judged.filter((r) => r.outcome!.resolution === res).length;
  const confirmed = count("confirmed");
  const excursions = judged.map((r) => (fromNotice ? r.outcome!.fromNotice : r.outcome!.fromOpen)).filter((e): e is { bestPts: number; worstPts: number } => e != null);
  return {
    n: judged.length,
    confirmed,
    confirmedSameSession: judged.filter((r) => r.outcome!.confirmedAfter === 0).length,
    stopped: count("stopped"),
    faded: count("faded"),
    confirmedRate: judged.length > 0 ? confirmed / judged.length : null,
    medianBestPts: median(excursions.map((e) => e.bestPts)),
    medianWorstPts: median(excursions.map((e) => e.worstPts)),
    medianLeadMinutes: fromNotice ? median(judged.map((r) => r.outcome!.leadMinutes).filter((m): m is number => m != null)) : null,
  };
}

export function summariseLineNotices(records: LineSessionRecord[]): LineNoticeSummary {
  const notified = (r: LineSessionRecord) => r.approach != null || r.crossed != null;
  const crossed = records.filter((r) => r.crossed != null);
  const moves = records.filter((r) => r.outcome?.complete && r.outcome.fromOpen.bestPts >= LINE_MOVE_POINTS);
  const ahead = moves.filter(notified);
  return {
    horizonSessions: LINE_NOTICE_HORIZON_SESSIONS,
    movePoints: LINE_MOVE_POINTS,
    eligible: summariseGroup(records, false),
    noNotice: summariseGroup(records.filter((r) => !notified(r)), false),
    approach: summariseGroup(records.filter((r) => r.approach != null), true),
    crossed: summariseGroup(crossed, true),
    crossedExecute: summariseGroup(crossed.filter((r) => r.verdict === "Execute"), true),
    crossedWatch: summariseGroup(crossed.filter((r) => r.verdict === "Watch"), true),
    moves: {
      n: moves.length,
      withNotice: ahead.length,
      medianPtsLeftAfterNotice: median(ahead.map((r) => r.outcome!.fromNotice?.bestPts).filter((x): x is number => x != null)),
    },
  };
}
