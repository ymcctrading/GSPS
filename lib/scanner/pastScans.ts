/**
 * Past scans compared across dates (Q2 item 5, "Performance replay UI").
 * -----------------------------------------------------------------------------
 * The daily lists (`daily_scans`) keep every session's published Buy and Sell
 * rows, and the forward test (`shadow_signals`) walks every Execute the
 * scheduled scan recorded the way production trades it. Nothing showed the
 * two together, or one day's list beside another's. This module is the pure
 * half: it lines up two sessions' lists, says what changed between them,
 * whether a Watch became an Execute on a later session ("caught later"), and
 * what the forward test recorded for each Execute.
 *
 * Design basis (AGENTS.md's mandate):
 * 1. Gann. He kept a record of every trade and read it back: the series of
 *    losses and the profit peak are rules that read the record (AGENTS.md,
 *    S-07 retention), and his annual forecasts were checked against what the
 *    market did. So the comparison is a record read back, never a re-scan:
 *    each date shows what was published that day, and an outcome is shown
 *    only where the forward test measured one.
 * 2. Cycles. No periodicity claim is made, so Dewey's checklist does not
 *    apply. Two dates are compared, not a recurrence.
 * 3. Hermetic. Cause and Effect: the list is the cause as it stood that day,
 *    the forward test's walk is the effect, and the two stay side by side
 *    rather than blended into a score. Rhythm is why "caught later" exists:
 *    a Watch is a setup waiting its turn, and the record shows when it came.
 * Law of Creation: the published list ⊗ the forward walk. Shown apart they
 * are a mixture; joined per row they create the record of what each call
 * became, which re-enters as the reader's own review.
 */

export type PastScanState = "Execute" | "Watch" | "Reject";
export type PastScanDirection = "bullish" | "bearish";

/** One published row of `daily_scans`, as the API reads it. */
export interface PastScanRow {
  symbol: string;
  direction: PastScanDirection;
  rank: number;
  state: PastScanState;
  score: number;
  entry: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  masterProfit: number | null;
  strategyVersion: string | null;
}

/** One `shadow_signals` row, reduced to what a comparison shows. */
export interface ForwardTestRow {
  symbol: string;
  direction: PastScanDirection;
  /** The New York session the signal was recorded in, YYYY-MM-DD. */
  sessionDate: string;
  scannedAt: string;
  /** The plan's entry as recorded, used to match the list's row. */
  entry: number | null;
  outcome: ForwardOutcome | null;
  rMultiple: number | null;
  barsHeld: number | null;
  /**
   * The fill price the walk recorded. The evaluator that enters on the
   * reaction and exits on Gann's rules (R-032, 2026-10-21) writes it on every
   * filled trade; a filled row without one was walked by the evaluator before
   * it, which filled at the plan's entry on the spot, so it measured another
   * rule (see `walkedOnEarlierRules`).
   */
  fillPrice: number | null;
  strategyVersion: string;
}

const FILLED: readonly (ForwardOutcome | null)[] = ["win", "loss", "timeout"];

/** A filled trade the pre-R-032 evaluator walked: it fills at the entry at once, and measured another rule. */
export function walkedOnEarlierRules(row: ForwardTestRow): boolean {
  return FILLED.includes(row.outcome) && row.fillPrice === null;
}

/**
 * `win`/`loss`/`timeout` are filled trades; `expired` never reacted into the
 * zone in its session and `retired` closed through its stop first
 * (lib/shadow/evaluate.ts). Null is a signal still being walked.
 */
export type ForwardOutcome = "win" | "loss" | "timeout" | "expired" | "retired";

export type PastScanChange =
  | "same"
  | "new"
  | "gone"
  | "to_execute"
  | "to_watch"
  | "to_reject";

export interface PastScanCompared {
  symbol: string;
  direction: PastScanDirection;
  /** The earlier session's row, null when the symbol was not on that list. */
  earlier: PastScanRow | null;
  /** The later session's row, null when the symbol was not on that list. */
  later: PastScanRow | null;
  change: PastScanChange;
  /**
   * For a Watch on the earlier session: the first session after it, up to
   * the latest one read, where the same symbol and direction was published
   * as Execute. Null when it never was, or the earlier row was not a Watch.
   */
  executeOn: string | null;
  /** The forward test's walk of the earlier session's Execute, if recorded. */
  earlierForward: ForwardTestRow | null;
  /** The forward test's walk of the later session's Execute, if recorded. */
  laterForward: ForwardTestRow | null;
}

const STATE_ORDER: Record<PastScanState, number> = { Execute: 0, Watch: 1, Reject: 2 };

function key(symbol: string, direction: PastScanDirection): string {
  return `${symbol}|${direction}`;
}

/** What changed from the earlier row to the later one. */
export function changeBetween(earlier: PastScanRow | null, later: PastScanRow | null): PastScanChange {
  if (!earlier && later) return "new";
  if (earlier && !later) return "gone";
  if (!earlier || !later || earlier.state === later.state) return "same";
  if (later.state === "Execute") return "to_execute";
  if (later.state === "Watch") return "to_watch";
  return "to_reject";
}

/**
 * The forward-test walk for one published Execute: the same symbol and
 * direction recorded in the same New York session. A session can record the
 * same symbol more than once (two scheduled runs), and each run rewrites the
 * day's list (`daily_scans` is upserted on scan_date, direction and rank), so
 * the list shows the session's last run. The recording whose entry is the
 * list's entry is the one shown; with none, the latest.
 */
export function forwardFor(
  row: PastScanRow | null,
  sessionDate: string,
  forward: ForwardTestRow[],
): ForwardTestRow | null {
  if (!row || row.state !== "Execute") return null;
  const matches = forward
    .filter((f) => f.symbol === row.symbol && f.direction === row.direction && f.sessionDate === sessionDate)
    .sort((a, b) => Date.parse(b.scannedAt) - Date.parse(a.scannedAt));
  const sameEntry = matches.find(
    (f) => f.entry != null && row.entry != null && Math.abs(f.entry - row.entry) < 1e-6,
  );
  return sameEntry ?? matches[0] ?? null;
}

/**
 * Lines up two sessions' published lists. `between` holds the published
 * Execute rows of the sessions strictly between the two, keyed by date, and
 * is read only for "caught later": an Execute on the later session itself
 * already shows as "Now Execute". Ordered by direction, then
 * the later session's verdict and rank, then the earlier's.
 */
export function comparePastScans(args: {
  earlierDate: string;
  laterDate: string;
  earlier: PastScanRow[];
  later: PastScanRow[];
  between: { date: string; rows: PastScanRow[] }[];
  forward: ForwardTestRow[];
}): PastScanCompared[] {
  const { earlierDate, laterDate, earlier, later, between, forward } = args;
  const earlierBy = new Map(earlier.map((r) => [key(r.symbol, r.direction), r]));
  const laterBy = new Map(later.map((r) => [key(r.symbol, r.direction), r]));
  const keys = new Set([...earlierBy.keys(), ...laterBy.keys()]);

  const firstExecute = new Map<string, string>();
  for (const { date, rows } of [...between].sort((a, b) => a.date.localeCompare(b.date))) {
    if (date <= earlierDate || date >= laterDate) continue;
    for (const r of rows) {
      const k = key(r.symbol, r.direction);
      if (r.state === "Execute" && !firstExecute.has(k)) firstExecute.set(k, date);
    }
  }

  const compared: PastScanCompared[] = [];
  for (const k of keys) {
    const e = earlierBy.get(k) ?? null;
    const l = laterBy.get(k) ?? null;
    const base = (l ?? e)!;
    compared.push({
      symbol: base.symbol,
      direction: base.direction,
      earlier: e,
      later: l,
      change: changeBetween(e, l),
      executeOn: e?.state === "Watch" ? (firstExecute.get(k) ?? null) : null,
      earlierForward: forwardFor(e, earlierDate, forward),
      laterForward: forwardFor(l, laterDate, forward),
    });
  }

  return compared.sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === "bullish" ? -1 : 1;
    const as = a.later ? STATE_ORDER[a.later.state] : 3;
    const bs = b.later ? STATE_ORDER[b.later.state] : 3;
    if (as !== bs) return as - bs;
    const ar = a.later?.rank ?? a.earlier?.rank ?? Infinity;
    const br = b.later?.rank ?? b.earlier?.rank ?? Infinity;
    if (ar !== br) return ar - br;
    return a.symbol.localeCompare(b.symbol);
  });
}

export interface ForwardTestByVersion {
  strategyVersion: string;
  /** Filled trades walked to an exit (win, loss and timeout) on the current evaluator. */
  trades: number;
  wins: number;
  /** Mean R over the filled trades, null with none. */
  meanR: number | null;
  /** Recorded Execute signals that never filled (expired or retired). */
  notFilled: number;
  /** Signals still being walked. */
  pending: number;
  /** Filled trades the earlier evaluator walked, left out of the figures above. */
  earlierRules: number;
  firstSession: string;
  lastSession: string;
}

/**
 * The forward test grouped by strategy version, newest first. A sample that
 * mixes versions measures no rule production runs (R-032), so each version
 * stands alone, beside the replay measured on the same version where one is
 * committed. Each call counts once, and a trade the earlier evaluator walked
 * is counted apart, never in the figures.
 */
export function forwardTestByVersion(rows: ForwardTestRow[]): ForwardTestByVersion[] {
  // One call per symbol, direction and session: a session scanned twice
  // records the same plan twice, and counting both would count one call twice.
  // The latest stands, as `forwardFor` reads it when no entry matches.
  const calls = new Map<string, ForwardTestRow>();
  for (const r of [...rows].sort((a, b) => Date.parse(b.scannedAt) - Date.parse(a.scannedAt))) {
    const k = `${r.strategyVersion}|${r.symbol}|${r.direction}|${r.sessionDate}`;
    if (!calls.has(k)) calls.set(k, r);
  }
  const groups = new Map<string, ForwardTestRow[]>();
  for (const r of calls.values()) {
    const list = groups.get(r.strategyVersion) ?? [];
    list.push(r);
    groups.set(r.strategyVersion, list);
  }
  const out: ForwardTestByVersion[] = [];
  for (const [strategyVersion, list] of groups) {
    const filled = list.filter((r) => FILLED.includes(r.outcome) && !walkedOnEarlierRules(r));
    const rs = filled.map((r) => r.rMultiple).filter((v): v is number => v != null && Number.isFinite(v));
    const sessions = list.map((r) => r.sessionDate).sort();
    out.push({
      strategyVersion,
      trades: filled.length,
      wins: filled.filter((r) => r.outcome === "win").length,
      meanR: rs.length > 0 ? rs.reduce((s, v) => s + v, 0) / rs.length : null,
      notFilled: list.filter((r) => r.outcome === "expired" || r.outcome === "retired").length,
      pending: list.filter((r) => r.outcome === null).length,
      earlierRules: list.filter(walkedOnEarlierRules).length,
      firstSession: sessions[0],
      lastSession: sessions[sessions.length - 1],
    });
  }
  return out.sort((a, b) => b.lastSession.localeCompare(a.lastSession) || b.strategyVersion.localeCompare(a.strategyVersion));
}

/**
 * The earliest session a member may read back: `scanHistoryRetentionDays`
 * (lib/entitlements/policy.ts) counted from `today`, or no limit.
 */
export function earliestReadableDate(today: string, retentionDays: number | "unlimited"): string | null {
  if (retentionDays === "unlimited") return null;
  const t = Date.parse(`${today}T12:00:00Z`) - retentionDays * 24 * 3600_000;
  return new Date(t).toISOString().slice(0, 10);
}
