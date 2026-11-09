/**
 * The label on a paper trade the exit manager settled in one pass after the
 * Oct 31 to Nov 30, 2026 pause, for the "accept and label" answer
 * (owner/after-the-pause-runbook.md).
 *
 * Why (2026-11-09): if the owner chooses to let the live manager settle the 15
 * paper positions left unmanaged by the pause, its first pass reads the month
 * at once (targets on the month's best price, the stop only at that moment's
 * price), so the result is not what bar-by-bar management would have booked.
 * The trade's record then says so, in the words a member reads: the reasoning
 * text (`trade_logs.signal_called`, shown in the journal, its export and the
 * daily email) gains this label. Performance Analytics groups P&L by that
 * text (migration 0023), so the labelled trades form their own group there.
 * It is neutral copy: it names what happened to the record, never the rules
 * behind it.
 *
 * Pure; `scripts/label-paused-paper-settlements.mjs` reads and writes the rows.
 *
 * Mandate questions (AGENTS.md): (1) Gann: none of his rules is involved; the
 * label records how a trade was settled, as his own records note a trade's
 * circumstances. (2) Cycles: none claimed. (3) Hermetic: Correspondence, in
 * that the record a member reads corresponds to what happened to the trade.
 * (4) Law of Creation: the stored reasoning and the label are joined side by
 * side; a mixture, nothing new made.
 */

export const PAUSE_SETTLEMENT_LABEL = "Settled after pause, month read in one pass";
const SEPARATOR = " · ";

/** True once the reasoning already carries the label. */
export function hasPauseLabel(signalCalled: string | null | undefined): boolean {
  return typeof signalCalled === "string" && signalCalled.includes(PAUSE_SETTLEMENT_LABEL);
}

/** The reasoning with the label added once (the column is `not null`). */
export function withPauseLabel(signalCalled: string | null | undefined): string {
  const base = typeof signalCalled === "string" ? signalCalled.trim() : "";
  if (hasPauseLabel(base)) return base;
  return base.length > 0 ? `${base}${SEPARATOR}${PAUSE_SETTLEMENT_LABEL}` : PAUSE_SETTLEMENT_LABEL;
}

/**
 * The update for one trade log: the reasoning text only. `trade_logs` has no
 * `updated_at` column (production's information_schema, read 2026-11-09
 * 12:31 UTC), so nothing else is written.
 */
export function labelUpdate(row: Pick<LabelCandidate, "signal_called">): { signal_called: string } {
  return { signal_called: withPauseLabel(row.signal_called) };
}

export interface LabelCandidate {
  id: string;
  exit_plan_id: string | null;
  mode: string | null;
  exit_timestamp: string | null;
  signal_called: string | null;
}

/**
 * Which trade logs to label: paper, closed, from one of the captured paused
 * exits, and closed at or after `since` (the lift), so a close from before the
 * pause is never relabelled. Already-labelled rows are left out.
 */
export function rowsToLabel(rows: readonly LabelCandidate[], pausedExitIds: ReadonlySet<string>, since: Date): LabelCandidate[] {
  const from = since.getTime();
  return rows.filter(
    (r) =>
      r.mode === "paper" &&
      r.exit_plan_id != null &&
      pausedExitIds.has(r.exit_plan_id) &&
      r.exit_timestamp != null &&
      Date.parse(r.exit_timestamp) >= from &&
      !hasPauseLabel(r.signal_called),
  );
}
