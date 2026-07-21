/**
 * Post-market scan scheduling.
 *
 * The mean-reversion scan is meant to run automatically after the close — the
 * user should never trigger it by hand (review log §3.3). Doc 4 wires this with
 * node-cron at "15 16 * * 1-5" (16:15 ET, weekdays).
 *
 * In a serverless deployment (Vercel), an in-process cron does not persist, so
 * the RECOMMENDED trigger is an external scheduler hitting POST /api/scanner/run
 * on that schedule (Vercel Cron / GitHub Actions). This module exposes the
 * schedule metadata and the callable run so either path uses identical logic.
 *
 * The optional in-process scheduler is opt-in via GSPS_ENABLE_IN_PROCESS_CRON
 * and intentionally has no hard dependency on node-cron (kept out of Phase 0
 * deps); it degrades to a no-op with a clear log line if the schedule can't run.
 */
import { runScanAndCache } from "./runScan";

/** Cron expression: 16:15 America/New_York, Monday–Friday. */
export const POST_CLOSE_CRON = "15 16 * * 1-5";
export const POST_CLOSE_TZ = "America/New_York";

/**
 * Invoke the scan. Call this from an external scheduler (preferred) or the
 * in-process scheduler below.
 */
export async function runScheduledScan() {
  return runScanAndCache();
}

/**
 * Best-effort in-process scheduler for local/long-running deployments only.
 * Returns true if a scheduler was started. No-ops (returns false) unless
 * GSPS_ENABLE_IN_PROCESS_CRON is truthy.
 */
export function maybeStartInProcessCron(): boolean {
  if (process.env.GSPS_ENABLE_IN_PROCESS_CRON !== "true") return false;
  // Deferred/optional: only load node-cron if the operator opted in AND it's
  // installed. Avoids a hard dependency in the Phase 0 scaffold.
  console.info(
    `[GSPS] In-process cron requested (${POST_CLOSE_CRON} ${POST_CLOSE_TZ}). ` +
      `Install node-cron and wire it here, or prefer an external scheduler ` +
      `hitting POST /api/scanner/run.`
  );
  return false;
}
