/**
 * Scanner result cache + status (Suggestion S-4 in the review log).
 *
 * The dashboard reads this to render a deterministic, consumer-friendly loading
 * state instead of the developer-facing "...after the first cron run" string.
 *
 * Phase 0 uses an in-memory singleton. Production should back this with the
 * `daily_scan_runs` table (see db/schema.sql) / a cache like Redis so results
 * survive restarts and are shared across instances.
 */
import type { ReversionPayload } from "./meanReversion";

export type ScanStatus = "PENDING" | "RUNNING" | "FRESH" | "STALE" | "ERROR";

interface ScanState {
  status: ScanStatus;
  payload: ReversionPayload | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

/** Consumer-friendly copy per status (replaces the dev-facing cron string). */
export const STATUS_MESSAGE: Record<ScanStatus, string> = {
  PENDING: "Analyzing market close data… new setups will go live shortly.",
  RUNNING: "Scanning the market for today's best reversion setups…",
  FRESH: "Live setups from the latest market close.",
  STALE: "Showing the last completed scan. A fresh scan is due.",
  ERROR: "We hit a snag running the latest scan. Retrying shortly.",
};

const state: ScanState = {
  status: "PENDING",
  payload: null,
  startedAt: null,
  completedAt: null,
  error: null,
};

export function getScanState(): Readonly<ScanState> & { message: string } {
  return { ...state, message: STATUS_MESSAGE[state.status] };
}

export function markRunning(): void {
  state.status = "RUNNING";
  state.startedAt = new Date().toISOString();
  state.error = null;
}

export function markComplete(payload: ReversionPayload): void {
  state.status = "FRESH";
  state.payload = payload;
  state.completedAt = new Date().toISOString();
}

export function markStale(): void {
  if (state.payload) state.status = "STALE";
}

export function markError(err: unknown): void {
  state.status = "ERROR";
  state.error = err instanceof Error ? err.message : String(err);
}
