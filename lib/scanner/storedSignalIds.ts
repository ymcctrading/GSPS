/**
 * Reading an intraday signal id back from the database.
 *
 * Two signal ids were renamed on 2026-11-09 because they named the rule
 * behind them and reached the browser (the API's `type` field, the alert
 * list): the day's record pullback and the daily swing turn. Migration
 * `0145_neutral_intraday_signal_ids.sql` rewrites the stored rows, but merging
 * a migration is not applying it, so a row written before it runs can still
 * carry an old id. Every read of `signal_id` goes through `storedSignalType`,
 * so an old row is answered with the new id and never leaves the server as it
 * was stored.
 *
 * Server only: the old ids live here and in the migration, nowhere a client
 * component imports.
 */
import type { SignalType } from "@/lib/scanner/intraday";

const RENAMED: Readonly<Record<string, SignalType>> = {
  space_overbalance: "pullback_record",
  overnight_turn: "daily_swing_turn",
};

/** The current id for a stored `signal_id`, old or new. */
export function storedSignalType(raw: string): SignalType {
  return (RENAMED[raw] ?? raw) as SignalType;
}

/** The ids a signal may still be stored under: its own, plus its old id when it was renamed. */
export function storedIdsFor(type: SignalType): string[] {
  return [type, ...Object.keys(RENAMED).filter((old) => RENAMED[old] === type)];
}
