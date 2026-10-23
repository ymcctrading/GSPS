/**
 * The scan's member fan-out as a queued job with a budget of its own.
 *
 * Production bug, 2026-10-22: the scheduled scans fanned out to every member
 * inside the scan's own 60s request (`fanOutToProfiles`, started before +45s).
 * The market scan finishes its own work at about +42s to +48s, so that day's
 * 19 runs reached no member on 10 and at most 6 of 24 on the rest, and the
 * 21:45 UTC run timed out with six members in flight. Monitors, Watch-to-Execute
 * alerts and the trade plans they create were mostly not happening.
 *
 * Now a scan stores what the fan-out needs (`enqueueFanOut`, table
 * `scan_fanout_jobs`, migration 0116) and returns. `/api/scan-fanout`, called
 * every minute from the database, works through the newest job of each source
 * (`runFanOutQueue`) and records each member served, so a call that runs out
 * of time leaves the rest to the next. Only the newest job is served, of
 * whatever source: an older one is superseded, since the newer scan read the
 * market later and serving the older after it would put its verdicts back on
 * top (the market scan at 13:15 UTC and the confirmation scan at 13:18 both
 * queue). Each evaluation is also stamped with its job's time, so a stale one
 * that slips through is refused (`decideTransition`'s stale-evaluation rule).
 *
 * Three-question mandate (AGENTS.md):
 * 1. Gann source: none. Delivery plumbing, not a market technique.
 * 2. Cycle theory: a returning wheel, not a drain. Every call re-reads what
 *    is left from the database, so a late, missed or timed-out call is made up
 *    by the next one (Dewey's phase-resumption, as an engineering property of
 *    the mechanism, the way `lib/scan/universe-rotation.ts` borrows it).
 * 3. Hermetic principle: Cause and Effect. The scan is the cause and each
 *    member's monitors the effect; separating the two in time lets each finish
 *    whole instead of the effect being cut off whenever the cause runs long.
 *    The numbers (deadline, lease, age) are engineering choices, not sourced.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntitlementPolicy } from "@/lib/entitlements/policy";
import type { RankedSetup } from "@/lib/entitlements/result-selection";
import type { RetiredPlanSignal } from "@/lib/lifecycle/retire";
import type { ScanResult } from "@/lib/types";
import { fanOutToProfiles } from "@/lib/entitlements/fanout-all";

/** What a queued fan-out needs, stored as the job's payload. */
export interface FanOutPayload {
  qualifying: RankedSetup<ScanResult>[];
  rejectedSymbols: string[];
  retired: RetiredPlanSignal[];
}

/**
 * The worker starts no new member after this many ms of its own request,
 * leaving the rest of the 60s for members in flight (the slowest seen inside
 * the scan's request took more than 15s). Engineering choice.
 */
export const WORKER_START_DEADLINE_MS = 35_000;

/** A job older than this is stale, not served. Engineering choice: four scan cycles. */
export const JOB_MAX_AGE_MS = 60 * 60_000;

/** How long a claimed job is held from another worker; just past one request. */
export const JOB_LEASE_MS = 70_000;

/**
 * Which members a source's fan-out serves. The pre-open preparation scan
 * serves the members whose tier has it; every other scheduled scan, the full
 * market scan included, serves the confirmation scan's members, as each did
 * inline (`scheduled-scan.ts`, `/api/market-scan`). The 9:45 AM, ~11:00 AM
 * and ~2:00 PM jobs share `morningConfirmationScanEnabled` with the 9:15 AM
 * one rather than each getting a policy field: every flag is `true` for every
 * tier today (policy.ts), so more fields would change nothing. That is also
 * why the newest job supersedes an older one of any source (`runFanOutQueue`):
 * if the flags ever split, an older job's members the newer one doesn't serve
 * would be dropped, so supersede only between jobs serving the same members.
 */
export function fanOutEnabledFor(source: string): (policy: EntitlementPolicy) => boolean {
  return source === "scheduled_morning_scan"
    ? (policy) => policy.morningPreparationScanEnabled
    : (policy) => policy.morningConfirmationScanEnabled;
}

/** The payload as stored: the daily bars are left out (the fan-out never reads them, and they are most of a result's size). */
export function toFanOutPayload(args: {
  qualifying: RankedSetup<ScanResult>[];
  rejectedSymbols: Iterable<string>;
  retired: readonly RetiredPlanSignal[];
}): FanOutPayload {
  return {
    qualifying: args.qualifying.map((q) => {
      const value: ScanResult = { ...q.value };
      delete value.dailyBars;
      return { ...q, value };
    }),
    rejectedSymbols: [...args.rejectedSymbols],
    retired: [...args.retired],
  };
}

/** Stores a scan's fan-out for the worker. False when the write failed (logged). */
export async function enqueueFanOut(
  service: SupabaseClient,
  args: { scanExecutionId: string; source: string; payload: FanOutPayload },
): Promise<boolean> {
  const { error } = await service.from("scan_fanout_jobs").insert({
    scan_execution_id: args.scanExecutionId,
    source: args.source,
    payload: args.payload,
  });
  if (error) {
    console.error(`${args.source}: fan-out not queued — ${error.message}`);
    return false;
  }
  return true;
}

interface PendingJob {
  id: string;
  scan_execution_id: string;
  source: string;
  created_at: string;
}

export interface FanOutQueueOutcome {
  jobsServed: number;
  jobsCompleted: number;
  jobsSuperseded: number;
  jobsExpired: number;
  profilesFannedOut: number;
  profilesDeferred: number;
}

async function closeJobs(service: SupabaseClient, ids: string[], outcome: "superseded" | "expired", now: Date): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await service
    .from("scan_fanout_jobs")
    .update({ completed_at: now.toISOString(), outcome, claimed_until: null, payload: {} })
    .in("id", ids)
    .is("completed_at", null);
  if (error) console.error(`scan-fanout: ${outcome} jobs not closed — ${error.message}`);
}

/**
 * Serves the pending jobs, newest first, until `deadlineAt`: no new member
 * starts after it. Each job is claimed with a lease so two overlapping calls
 * never serve the same job; a job is completed once no member is left.
 */
export async function runFanOutQueue(
  service: SupabaseClient,
  args: { deadlineAt: number; now?: Date },
): Promise<FanOutQueueOutcome> {
  const now = args.now ?? new Date();
  const outcome: FanOutQueueOutcome = {
    jobsServed: 0,
    jobsCompleted: 0,
    jobsSuperseded: 0,
    jobsExpired: 0,
    profilesFannedOut: 0,
    profilesDeferred: 0,
  };

  const { data, error } = await service
    .from("scan_fanout_jobs")
    .select("id, scan_execution_id, source, created_at")
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error(`scan-fanout: pending jobs not read — ${error.message}`);
    return outcome;
  }
  const pending = (data ?? []) as PendingJob[];

  const expired: string[] = [];
  const superseded: string[] = [];
  const live: PendingJob[] = [];
  for (const job of pending) {
    if (now.getTime() - new Date(job.created_at).getTime() > JOB_MAX_AGE_MS) {
      expired.push(job.id);
    } else if (live.length > 0) {
      superseded.push(job.id);
    } else {
      live.push(job);
    }
  }
  await closeJobs(service, expired, "expired", now);
  await closeJobs(service, superseded, "superseded", now);
  outcome.jobsExpired = expired.length;
  outcome.jobsSuperseded = superseded.length;

  for (const job of live) {
    if (Date.now() >= args.deadlineAt) break;

    const claimedAt = new Date();
    const { data: claimed, error: claimError } = await service
      .from("scan_fanout_jobs")
      .update({ claimed_until: new Date(claimedAt.getTime() + JOB_LEASE_MS).toISOString() })
      .eq("id", job.id)
      .is("completed_at", null)
      .or(`claimed_until.is.null,claimed_until.lt."${claimedAt.toISOString()}"`)
      .select("payload");
    if (claimError) {
      console.error(`scan-fanout: job ${job.id} not claimed — ${claimError.message}`);
      continue;
    }
    const row = (claimed ?? [])[0] as { payload: FanOutPayload } | undefined;
    if (!row) continue; // Another call holds it.

    const { data: doneRows, error: doneError } = await service
      .from("scan_fanout_job_profiles")
      .select("profile_id")
      .eq("job_id", job.id);
    if (doneError) {
      console.error(`scan-fanout: progress for job ${job.id} not read — ${doneError.message}`);
      await service.from("scan_fanout_jobs").update({ claimed_until: null }).eq("id", job.id);
      continue;
    }

    const payload = row.payload;
    const result = await fanOutToProfiles(service, {
      scanExecutionId: job.scan_execution_id,
      source: job.source,
      qualifying: payload.qualifying ?? [],
      rejectedSymbols: new Set(payload.rejectedSymbols ?? []),
      retired: payload.retired ?? [],
      isEnabled: fanOutEnabledFor(job.source),
      deadlineAt: args.deadlineAt,
      skipProfileIds: new Set(((doneRows ?? []) as { profile_id: string }[]).map((r) => r.profile_id)),
      onProfileDone: async (profileId) => {
        const { error: markError } = await service
          .from("scan_fanout_job_profiles")
          .upsert({ job_id: job.id, profile_id: profileId }, { onConflict: "job_id,profile_id", ignoreDuplicates: true });
        if (markError) throw new Error(markError.message);
      },
      replaceVisible: true,
      evaluatedAt: new Date(job.created_at),
    });

    outcome.jobsServed += 1;
    outcome.profilesFannedOut += result.profilesFannedOut;
    outcome.profilesDeferred += result.profilesDeferred;

    // A job whose members could not be listed stays open for the next call.
    // A closed job's payload is cleared: nothing reads it again.
    const finished = result.profilesDeferred === 0 && !result.listFailed;
    const { error: closeError } = await service
      .from("scan_fanout_jobs")
      .update(
        finished
          ? { completed_at: new Date().toISOString(), outcome: "completed", claimed_until: null, payload: {} }
          : { claimed_until: null },
      )
      .eq("id", job.id)
      .is("completed_at", null);
    if (closeError) console.error(`scan-fanout: job ${job.id} not updated — ${closeError.message}`);
    if (finished) outcome.jobsCompleted += 1;
  }

  return outcome;
}
