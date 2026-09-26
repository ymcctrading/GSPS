/**
 * Fan one scan's results out to every profile — concurrently, inside a
 * deadline, starting from a rotating profile.
 *
 * The one shared loop behind both system fan-out paths: `/api/market-scan`'s
 * cron path and the five scheduled_* jobs (lib/entitlements/scheduled-scan.ts),
 * which each had their own sequential copy. Walking profiles one at a time,
 * each doing a chain of awaited database writes, is what pushed every named
 * scheduled scan past its 60s budget from 2026-09-24 on: the scan itself
 * finished around 34-38s (production logs, 2026-09-25) and 19 sequential
 * profiles did not fit in what was left.
 *
 * The results are the same for every profile, but the work per profile is
 * not: each has its own tier cap, monitors, trade plans and channels
 * (`fanOutForProfile`). Profiles don't share rows, so they run side by side,
 * `FAN_OUT_CONCURRENCY` at a time.
 *
 * `deadlineAt` stops new profiles from starting once the run's time budget
 * is spent (profiles already started finish). Skipped profiles are
 * reported, not failed: their monitors are re-evaluated on the next run.
 * So nobody is skipped every time, the start point rotates each run.
 *
 * Three-question mandate (AGENTS.md):
 * 1. Gann source: none. This is delivery plumbing, not a market technique.
 * 2. Cycle theory: the rotation is time-anchored (minutes since epoch), not a
 *    stored counter, so a missed or late run still lands on the right offset.
 *    That is Dewey's "phase-resumption after distortion", borrowed as an
 *    engineering property of the mechanism, the same way
 *    `lib/scan/universe-rotation.ts` borrows it. It says nothing about markets.
 * 3. Hermetic principle: Rhythm. A run that can't reach everyone doesn't drop
 *    the rest; the wheel turns and the next run starts where this one stopped.
 *    The numbers below (concurrency, deadlines) are engineering choices, not
 *    sourced.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fanOutForProfile } from "@/lib/entitlements/scan-fanout";
import { getEntitlementPolicy, type EntitlementPolicy } from "@/lib/entitlements/policy";
import type { RankedSetup } from "@/lib/entitlements/result-selection";
import type { PlatformTier } from "@/lib/tiers";
import type { ScanResult } from "@/lib/types";

/** Profiles processed at once. Supabase handles this comfortably; engineering choice. */
export const FAN_OUT_CONCURRENCY = 6;

/**
 * Callers pass `deadlineAt` as their request's start plus this: past it, no
 * new profile starts. Leaves headroom inside the 60s budget (AGENTS.md,
 * "Speed is a product requirement") for profiles already running to finish
 * and the response to go out. Engineering choice, not sourced.
 */
export const FAN_OUT_DEADLINE_MS = 45_000;

export interface FanOutAllOutcome {
  profilesFannedOut: number;
  profilesFailed: number;
  /** Eligible profiles not started because `deadlineAt` had passed. */
  profilesDeferred: number;
  totalNotified: number;
  elapsedMs: number;
}

/** Stable order, rotated by a time-anchored offset so the start point moves every run. */
export function rotateProfiles<T extends { id: string }>(profiles: T[], rotationKey: number): T[] {
  if (profiles.length === 0) return profiles;
  const sorted = [...profiles].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const offset = ((rotationKey % sorted.length) + sorted.length) % sorted.length;
  return [...sorted.slice(offset), ...sorted.slice(0, offset)];
}

export async function fanOutToProfiles(
  service: SupabaseClient,
  args: {
    scanExecutionId: string;
    source: string;
    qualifying: RankedSetup<ScanResult>[];
    rejectedSymbols: Set<string>;
    /** Which profiles this job serves, by their tier's policy. */
    isEnabled: (policy: EntitlementPolicy) => boolean;
    /** Epoch ms after which no new profile starts. Omit for no deadline. */
    deadlineAt?: number;
    /** Defaults to minutes since epoch. */
    rotationKey?: number;
  },
): Promise<FanOutAllOutcome> {
  const startedAt = Date.now();
  const outcome: FanOutAllOutcome = {
    profilesFannedOut: 0,
    profilesFailed: 0,
    profilesDeferred: 0,
    totalNotified: 0,
    elapsedMs: 0,
  };

  const { data: profiles, error } = await service.from("profiles").select("id, tier");
  if (error || !profiles) {
    console.error(`${args.source}: could not list profiles for fan-out — ${error?.message}`);
    return { ...outcome, elapsedMs: Date.now() - startedAt };
  }

  const eligible = rotateProfiles(
    (profiles as { id: string; tier: PlatformTier | null }[])
      .map((p) => ({ id: p.id, policy: getEntitlementPolicy(p.tier ?? "PRACTICE") }))
      .filter((p) => args.isEnabled(p.policy)),
    args.rotationKey ?? Math.floor(startedAt / 60_000),
  );

  let next = 0;
  async function worker(): Promise<void> {
    while (next < eligible.length) {
      if (args.deadlineAt !== undefined && Date.now() >= args.deadlineAt) {
        outcome.profilesDeferred += eligible.length - next;
        next = eligible.length;
        return;
      }
      const profile = eligible[next++];
      try {
        const result = await fanOutForProfile(service, {
          profileId: profile.id,
          scanExecutionId: args.scanExecutionId,
          source: args.source,
          qualifying: args.qualifying,
          rejectedSymbols: args.rejectedSymbols,
          maxDashboardSetupsPerScan: profile.policy.maxDashboardSetupsPerScan,
          maxActiveWatchMonitors: profile.policy.maxActiveWatchMonitors,
        });
        outcome.profilesFannedOut += 1;
        outcome.totalNotified += result.notifiedCount;
      } catch (err) {
        outcome.profilesFailed += 1;
        console.error(`${args.source}: fan-out failed for profile ${profile.id} — ${String(err)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(FAN_OUT_CONCURRENCY, eligible.length) }, worker));

  outcome.elapsedMs = Date.now() - startedAt;
  console.log(
    `[fan-out] ${args.source}: ${eligible.length} eligible, ${outcome.profilesFannedOut} done, ` +
      `${outcome.profilesFailed} failed, ${outcome.profilesDeferred} deferred in ${outcome.elapsedMs}ms`,
  );
  return outcome;
}
