/**
 * GSPS — measures each scheduled call's Vercel function use (2026-11-04).
 *
 * Vercel blocked the account on Nov 3 2026 when a Hobby function limit ran
 * out, and Hobby has no usage API. So every call the scheduled jobs' secret
 * opens (`isCronAuthorized`, the one check all 21 scheduled routes share)
 * records, after its response is sent, the Node process's CPU time and the
 * wall-clock time it took, added to its route's row for the UTC day
 * (`usage_function_add`, migration 0142). The meter (`usageLimits.ts`,
 * `vercel_cpu` and `vercel_invocations`) sums those rows.
 *
 * The CPU figure is the Node process's CPU time (`process.cpuUsage()`) from
 * the call's start, or from the last call this instance recorded if that is
 * later, to the call's end. Calls that overlap on one instance (Fluid
 * compute) so share the process's CPU instead of each counting it in full,
 * and the sum never exceeds the process's own CPU while scheduled work ran.
 * A member's request overlapping a scheduled call is counted in with it, so
 * the figure stays an upper bound on the scheduled share. Work a route
 * itself defers with `after()` may finish after this record is taken and be
 * missed. Members' own requests are not measured: a
 * write per page view would cost more than it tells.
 *
 * Never throws and never delays the response: outside a request (a test, a
 * script) `after()` is unavailable and nothing is recorded.
 *
 * Three-question basis: 1. Gann: none, operations. 2. Cycles: no periodicity
 * claim; the period is Vercel's month. 3. Hermetic: Cause and Effect, each
 * scheduled call is a cause whose cost is now recorded where it is made.
 */

import { after } from "next/server";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";

/** The UTC day a call is counted in. */
export function functionDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Total CPU microseconds of a `process.cpuUsage()` reading. */
export function cpuMicros(u: NodeJS.CpuUsage): number {
  return u.user + u.system;
}

// The process CPU (microseconds) already given to a recorded call on this
// instance; a later call starts counting no earlier than this.
let accountedMicros = 0;

/**
 * The CPU minutes to record for a call that started at `startMicros` and ends
 * at `endMicros`, given what the instance already recorded; returns the new
 * cursor too. Overlapping calls never count the same CPU twice.
 */
export function shareCpu(startMicros: number, endMicros: number, accounted: number): { minutes: number; accounted: number } {
  const from = Math.max(startMicros, accounted);
  const micros = endMicros - from;
  return {
    minutes: Number.isFinite(micros) && micros > 0 ? micros / 60_000_000 : 0,
    accounted: Math.max(accounted, endMicros),
  };
}

/** The route path from the request's own headers, without its query. */
export function routeFromHeaders(get: (name: string) => string | null): string {
  const matched = get("x-matched-path") || get("x-invoke-path") || get("next-url") || "";
  const path = matched.split("?")[0].trim();
  return path.startsWith("/") ? path.slice(0, 120) : "unknown";
}

/**
 * Starts the measure for one scheduled call and records it once the response
 * is finished. Safe to call anywhere.
 */
export function meterScheduledCall(): void {
  if (process.env.GSPS_DISABLE_FUNCTION_METER === "true") return;
  const startedAt = Date.now();
  const cpuStart = process.cpuUsage();
  try {
    after(async () => {
      try {
        const shared = shareCpu(cpuMicros(cpuStart), cpuMicros(process.cpuUsage()), accountedMicros);
        accountedMicros = shared.accounted;
        const cpu = shared.minutes;
        const wallSeconds = Math.max(0, (Date.now() - startedAt) / 1000);
        let path = "unknown";
        try {
          const h = await headers();
          path = routeFromHeaders((n) => h.get(n));
        } catch {
          // no request headers here
        }
        const { error } = await createServiceClient().rpc("usage_function_add", {
          p_day: functionDay(new Date(startedAt)),
          p_path: path,
          p_cpu_minutes: Number(cpu.toFixed(6)),
          p_wall_seconds: Number(wallSeconds.toFixed(3)),
        });
        if (error) console.error("[usage] function call not recorded:", error.message);
      } catch (err) {
        console.error("[usage] function call not recorded:", err instanceof Error ? err.message : String(err));
      }
    });
  } catch {
    // Outside a request scope: nothing to measure.
  }
}
