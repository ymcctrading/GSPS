/**
 * GSPS — coverage and attribution for the owner's daily recap (owner,
 * 2026-10-28: "explain precisely why an opportunity was offered, withheld,
 * missed or unavailable"; the October 27 recap called BA "Missed: no setup,
 * signal or focus listing" while BA sat at rank 48 of the stored focus list
 * and had an overnight Watch reading).
 *
 * Pure functions over what the platform stored, read by the email route
 * (`app/api/evening-report/route.ts`), whose dry read is also the owner's
 * coverage view. Nothing here is
 * a trading rule: it only says which stage of the pipeline a stock reached.
 *
 * The stages are kept apart and never summed into one "read" or "missed"
 * figure. A count the platform did not record is `null` ("not recorded"),
 * never 0: unknown is not "no signal".
 *
 * Hindsight. The recap ranks stocks by a move that had already happened, so
 * everything here is future-informed. It is shown to the owner's two accounts
 * only (`lib/auth/owner.ts`), never to a member, and never feeds a scan,
 * selection, score, plan or order.
 *
 * Mandate: 1. Gann judged his method by the full record, losses included
 * (*Tunnel Thru the Air* pp.198-199), so a stage a stock never reached is
 * stated, not hidden. 2. One session, no periodicity claim; Dewey N/A.
 * 3. Cause and Effect: each stage is the cause of the next; a mover is
 * attributed to the last stage it reached. Law of Creation: the pipeline's
 * record ⊗ the session's movers; neither alone says why a move was or was not
 * offered.
 */

import { FOCUS_SIZE } from "@/lib/scanner/focusList";
import { readResting } from "@/lib/setups/resting";
import { priceUsd } from "@/lib/strat/priceText";
import { firstExecutableBarIndex } from "@/lib/data/timeliness";
import type { Bar } from "@/lib/types";

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

// ---------------------------------------------------------------------------
// Stage counts

/** One stage's count; `value` null means the platform kept no record of it. */
export interface StageCount {
  value: number | null;
  note: string;
}

export const STAGE_KEYS = [
  "priceData",
  "selected",
  "evaluated",
  "deferredCapacity",
  "unavailable",
  "candidates",
  "plansQualified",
  "detected",
  "delivered",
  "entries",
  "simulated",
  "fills",
] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export const STAGE_LABELS: Record<StageKey, string> = {
  priceData: "Stocks with usable daily price data",
  selected: "Selected for evaluation",
  evaluated: "Evaluated successfully",
  deferredCapacity: "Not selected for lack of capacity",
  unavailable: "Selected but unavailable (data or error)",
  candidates: "Candidates identified",
  plansQualified: "Complete trade plans qualified",
  detected: "Signals detected by the system",
  delivered: "Signals delivered to a member",
  entries: "Entries authorized or placed",
  simulated: "Simulated outcomes (simplified)",
  fills: "Actual fills and realized outcomes",
};

export type CoverageStages = Record<StageKey, StageCount>;

/** A stage count, or "not recorded" when the input is not a finite count. */
export function stage(value: number | null | undefined, note: string): StageCount {
  return { value: finite(value) && value >= 0 ? Math.floor(value) : null, note };
}

export function formatStage(s: StageCount): string {
  return s.value == null ? `not recorded (${s.note})` : `${s.value} (${s.note})`;
}

// ---------------------------------------------------------------------------
// Focus list standing

export interface FocusListRow {
  basisDate: string;
  rank: number;
  builtAt: string | null;
}

export type FocusStanding =
  /** On the pre-session list within the slice the intraday scan times. */
  | { kind: "active"; rank: number; basisDate: string }
  /** Stored on the pre-session list as a reserve, past the timed slice. */
  | { kind: "reserve"; rank: number; basisDate: string }
  /** Only on a list built after the session opened: no pre-session credit. */
  | { kind: "post_session"; rank: number; basisDate: string }
  | { kind: "none" };

/**
 * Where a symbol stood on the focus lists going into a session. The list the
 * session read is the newest one built before the session opened; a list
 * built at or after the open (that evening's, read from the session's own
 * close) earns no pre-session credit. A row with no build time is read by its
 * basis date alone: before the session's date it is pre-session.
 */
export function focusStanding(
  rows: readonly FocusListRow[],
  sessionDate: string,
  sessionOpen: Date,
  activeSize: number = FOCUS_SIZE,
): FocusStanding {
  const open = sessionOpen.getTime();
  const isPre = (r: FocusListRow) => {
    const built = r.builtAt == null ? NaN : Date.parse(r.builtAt);
    return Number.isFinite(built) ? built < open : r.basisDate < sessionDate;
  };
  const valid = rows.filter((r) => finite(r.rank) && r.rank >= 1);
  const pre = valid.filter(isPre).sort((a, b) => b.basisDate.localeCompare(a.basisDate) || a.rank - b.rank);
  if (pre.length > 0) {
    // Only the newest pre-session list was the one the session read.
    const newest = pre[0].basisDate;
    const r = pre.filter((x) => x.basisDate === newest).sort((a, b) => a.rank - b.rank)[0];
    return { kind: r.rank <= activeSize ? "active" : "reserve", rank: r.rank, basisDate: r.basisDate };
  }
  const post = valid.filter((r) => !isPre(r)).sort((a, b) => a.basisDate.localeCompare(b.basisDate) || a.rank - b.rank);
  if (post.length > 0) return { kind: "post_session", rank: post[0].rank, basisDate: post[0].basisDate };
  return { kind: "none" };
}

/** The standing in plain words. */
export function describeFocusStanding(s: FocusStanding, activeSize: number = FOCUS_SIZE): string {
  switch (s.kind) {
    case "active":
      return `focus list rank ${s.rank} (within the ${activeSize} timed)`;
    case "reserve":
      return `focus list reserve, rank ${s.rank} (stored, past the ${activeSize} timed)`;
    case "post_session":
      return `added to the focus list after the session (rank ${s.rank}, ${s.basisDate}); no pre-session credit`;
    case "none":
      return "not on the focus list";
  }
}

// ---------------------------------------------------------------------------
// The overnight sweep's reading

export interface SweepReading {
  state: string | null;
  score: number | null;
  direction: string | null;
  setupKind: string | null;
  entry: number | null;
  error: string | null;
}

/**
 * An entry farther than this multiple of the prior close, either way, is
 * flagged for an anchor or corporate-action check (engineering, labelled: no
 * trading rule reads it; it only asks a person to look).
 */
export const SCALE_CHECK_RATIO = 1.8;

export interface SweepAttribution {
  line: string;
  /** Entry's distance from the prior close, percent (signed: + above). */
  entryDistancePct: number | null;
  /** More than a day's range from the prior close: a resting level, not a session entry. */
  resting: boolean | null;
  /** Entry and prior close differ by more than `SCALE_CHECK_RATIO`. */
  scaleCheck: boolean;
  directional: boolean;
}

/**
 * The overnight sweep's reading of one stock in plain words. The sweep stores
 * the selected candidate only (state, score, side, kind and entry), never a
 * stop, targets or the alternatives it set aside, so none are inferred.
 * `dayRangePct` is the daily average true range as a percent of price, when
 * known; without it the resting read is unknown, not false.
 */
export function attributeSweep(
  r: SweepReading | null,
  prevClose: number | null,
  dayRangePct: number | null,
  /** Where the day's range came from, when it is not the overnight reading's own. */
  rangeNote?: string,
): SweepAttribution {
  if (!r) return { line: "no overnight reading stored", entryDistancePct: null, resting: null, scaleCheck: false, directional: false };
  if (r.error) return { line: `overnight reading failed (${r.error})`, entryDistancePct: null, resting: null, scaleCheck: false, directional: false };
  const directional = r.direction === "bullish" || r.direction === "bearish";
  const side = r.direction === "bullish" ? "long" : r.direction === "bearish" ? "short" : "no side";
  const head = `overnight ${r.state ?? "unread"} ${finite(r.score) ? `${r.score}/9 ` : ""}${side}${r.setupKind ? ` (${r.setupKind})` : ""}`;
  if (!directional || !finite(r.entry) || !(r.entry > 0) || !finite(prevClose) || !(prevClose > 0)) {
    return { line: head, entryDistancePct: null, resting: null, scaleCheck: false, directional };
  }
  const pct = ((r.entry - prevClose) / prevClose) * 100;
  const ratio = r.entry / prevClose;
  const scaleCheck = ratio >= SCALE_CHECK_RATIO || ratio <= 1 / SCALE_CHECK_RATIO;
  const dayRange = finite(dayRangePct) && dayRangePct > 0 ? (dayRangePct / 100) * prevClose : null;
  const rest = dayRange == null ? null : readResting({ side: r.direction === "bullish" ? "buy" : "sell", price: prevClose, entry: r.entry, dayRange });
  const resting = dayRange == null ? null : rest != null;
  let line = `${head}, entry ${priceUsd(r.entry)} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% from the prior close)`;
  if (resting) line += `, a resting level more than a day's range away${rangeNote ? ` (${rangeNote})` : ""}, not a session entry`;
  if (scaleCheck) line += "; entry and price differ by more than the scale check, look at the anchor and any corporate action";
  return { line, entryDistancePct: pct, resting, scaleCheck, directional };
}

// ---------------------------------------------------------------------------
// The daytime pre-filter's last reading

export interface PrefilterReading {
  clearedReversion: boolean;
  clearedContinuation: boolean;
  shortlisted: boolean;
  fullScanScore: number | null;
  fullScanState: string | null;
}

/**
 * The market scan's cheap pre-filter, as last written for the day. The table
 * keeps one row per stock per day and each scan overwrites it, so this is the
 * day's last reading, not a history of the session.
 */
export function attributePrefilter(p: PrefilterReading | null): string {
  if (!p) return "no daytime pre-filter reading stored";
  if (p.shortlisted || p.fullScanScore != null) {
    return `daytime: shortlisted and fully scored${p.fullScanScore != null ? ` ${p.fullScanScore}/9` : ""}${p.fullScanState ? ` ${p.fullScanState}` : ""} (last reading of the day)`;
  }
  if (p.clearedReversion || p.clearedContinuation) return "daytime: cleared the pre-filter but not shortlisted (last reading of the day)";
  return "daytime: did not clear the pre-filter (last reading of the day)";
}

// ---------------------------------------------------------------------------
// The move, split

export interface MoveSplit {
  gap: number;
  gapPct: number;
  session: number;
  sessionPct: number;
}

/** Prior close to open (the overnight gap) and open to close (the session). */
export function splitMove(prevClose: number, open: number, close: number): MoveSplit | null {
  if (![prevClose, open, close].every((n) => finite(n) && n > 0)) return null;
  return {
    gap: open - prevClose,
    gapPct: ((open - prevClose) / prevClose) * 100,
    session: close - open,
    sessionPct: ((close - open) / open) * 100,
  };
}

/**
 * The move left after a detection became usable: from the open of the first
 * bar that opens at or after `usableAt` to the session's last close, signed
 * by the detection's side. Null when no bar opens after it (nothing was left
 * to take) or the input is unusable. The overnight gap is never in it.
 */
export function remainingAfter(bars: readonly Bar[], usableAt: Date | null, side: "bullish" | "bearish"): number | null {
  if (!usableAt || bars.length === 0) return null;
  const i = firstExecutableBarIndex(bars, usableAt);
  if (i < 0) return null;
  const from = bars[i].o;
  const to = bars[bars.length - 1].c;
  if (!finite(from) || !finite(to) || !(from > 0) || !(to > 0)) return null;
  return (side === "bullish" ? 1 : -1) * (to - from);
}

// ---------------------------------------------------------------------------
// System detections versus member deliveries

export interface SystemDetection {
  symbol: string;
  kind: string;
  side: "bullish" | "bearish";
  /** When the scan evaluated it. */
  evaluatedAt: string;
  /** The open of the newest bar it read (`metadata.dataTimestamp`). */
  dataBarOpen: string | null;
  /** That bar's close plus the feed's delay: when its data could first be seen. */
  usableAt: string | null;
}

/** One per symbol, kind and side: the earliest, with the repeats counted. */
export function distinctDetections(rows: readonly SystemDetection[]): (SystemDetection & { repeats: number })[] {
  const byKey = new Map<string, SystemDetection & { repeats: number }>();
  for (const r of [...rows].sort((a, b) => a.evaluatedAt.localeCompare(b.evaluatedAt))) {
    const key = `${r.symbol}|${r.kind}|${r.side}`;
    const seen = byKey.get(key);
    if (seen) seen.repeats += 1;
    else byKey.set(key, { ...r, repeats: 1 });
  }
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// A mover's attribution

export type MoverOutcome =
  | "offered"
  | "offered_against"
  | "detected_not_delivered"
  | "withheld"
  | "examined_no_candidate"
  | "unavailable"
  | "not_examined";

export const OUTCOME_LABELS: Record<MoverOutcome, string> = {
  offered: "Offered",
  offered_against: "Offered against the move",
  detected_not_delivered: "Detected, not delivered",
  withheld: "Withheld",
  examined_no_candidate: "Examined, no candidate",
  unavailable: "Unavailable",
  not_examined: "Not examined",
};

export interface MoverContext {
  symbol: string;
  side: "bullish" | "bearish";
  sweep: SweepAttribution;
  sweepState: string | null;
  /** The overnight reading for the symbol failed. */
  sweepError: boolean;
  prefilter: string;
  focus: FocusStanding;
  /** Distinct system detections for the symbol that session. */
  detections: (SystemDetection & { repeats: number })[];
  /** Distinct member deliveries for the symbol on the mover's side. */
  deliveries: number;
  /** Distinct member deliveries against the move. */
  deliveriesAgainst?: number;
  /** A standing Execute plan at the prior close on the mover's side. */
  executePlan: boolean;
  /** A standing Execute plan at the prior close against the move. */
  executeAgainst?: boolean;
  /** A standing Watch plan at the prior close. */
  watchPlan: boolean;
  /** The sweep row or the pre-filter row exists. */
  examined: boolean;
  /**
   * The move left in the detection's direction from the first bar that
   * opened after its data could be seen, to the close (`remainingAfter`);
   * null when unknown or nothing was left.
   */
  remainingAfterFirst?: number | null;
  /** The evaluation ledger's row for the stock that session, when one was kept. */
  ledger?: LedgerStanding | null;
}

/** What the evaluation ledger recorded for one stock in one session. */
export interface LedgerStanding {
  firstQueuedAt: string | null;
  queueTier: string | null;
  deferredScans: number;
  firstDiscoveryAt: string | null;
  discoveryKinds: string[] | null;
}

const etTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

/** The ledger's record in plain words, or null when there is none. */
export function describeLedger(l: LedgerStanding | null | undefined): string | null {
  if (!l) return null;
  const parts: string[] = [];
  if (l.firstDiscoveryAt) parts.push(`discovered active at ${etTime(l.firstDiscoveryAt)} ET${l.discoveryKinds?.length ? ` (${l.discoveryKinds.length} condition${l.discoveryKinds.length === 1 ? "" : "s"})` : ""}`);
  if (l.firstQueuedAt) parts.push(`first given an intraday slot at ${etTime(l.firstQueuedAt)} ET${l.queueTier ? ` (${l.queueTier})` : ""}`);
  else if (l.deferredScans > 0) parts.push("never given an intraday slot");
  if (l.deferredScans > 0) parts.push(`deferred for capacity on ${l.deferredScans} scan${l.deferredScans === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : null;
}

/**
 * The last stage a mover reached, in order: offered to a member on the
 * move's side (a delivered signal or a standing Execute plan), offered only
 * against the move, detected but not delivered, withheld (a
 * candidate that did not qualify: Watch, resting), examined with no candidate,
 * unavailable (the reading failed), or not examined at all.
 */
export function moverOutcome(c: MoverContext): MoverOutcome {
  if (c.deliveries > 0 || c.executePlan) return "offered";
  if ((c.deliveriesAgainst ?? 0) > 0 || c.executeAgainst) return "offered_against";
  if (c.detections.length > 0) return "detected_not_delivered";
  if (c.watchPlan || (c.sweep.directional && (c.sweepState === "Watch" || c.sweepState === "Execute"))) return "withheld";
  if (c.sweepError) return "unavailable";
  if (c.examined) return "examined_no_candidate";
  return "not_examined";
}

/** The mover's stages in one line, the outcome first. */
export function moverAttributionLine(c: MoverContext): { outcome: MoverOutcome; line: string } {
  const outcome = moverOutcome(c);
  const parts = [OUTCOME_LABELS[outcome], c.sweep.line, c.prefilter, describeFocusStanding(c.focus)];
  const ledger = describeLedger(c.ledger);
  if (ledger) parts.push(ledger);
  if (c.detections.length > 0) {
    const withMove = c.detections.filter((d) => d.side === c.side).length;
    // The first detection on the move's side (the one the move left is read from), else the first.
    const first = c.detections.find((d) => d.side === c.side) ?? c.detections[0];
    const which = first.side === c.side ? "first with the move" : "first (against the move)";
    const at = new Date(first.evaluatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
    const usable = first.usableAt
      ? `, its data usable from ${new Date(first.usableAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`
      : ", its data time not recorded";
    const left = c.remainingAfterFirst == null ? "" : `, ${c.remainingAfterFirst >= 0 ? "+" : ""}${c.remainingAfterFirst.toFixed(2)} a share left its way after that`;
    parts.push(`${c.detections.length} system detection${c.detections.length === 1 ? "" : "s"} (${withMove} with the move), ${which} evaluated ${at} ET${usable}${left}`);
  } else {
    parts.push("no system detection");
  }
  parts.push(c.deliveries > 0 ? `${c.deliveries} delivered to members with the move` : "nothing delivered to a member with the move");
  if ((c.deliveriesAgainst ?? 0) > 0) parts.push(`${c.deliveriesAgainst} delivered against the move`);
  if (c.executeAgainst) parts.push("an Execute plan stood against the move");
  return { outcome, line: parts.join("; ") };
}
