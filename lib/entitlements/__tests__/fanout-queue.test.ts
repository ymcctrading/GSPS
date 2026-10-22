import { beforeEach, describe, expect, it, vi } from "vitest";

const { fanOutToProfilesMock } = vi.hoisted(() => ({ fanOutToProfilesMock: vi.fn() }));
vi.mock("@/lib/entitlements/fanout-all", () => ({ fanOutToProfiles: fanOutToProfilesMock }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_MAX_AGE_MS, fanOutEnabledFor, runFanOutQueue, toFanOutPayload } from "@/lib/entitlements/fanout-queue";
import type { ScanResult } from "@/lib/types";
import type { EntitlementPolicy } from "@/lib/entitlements/policy";

interface Job {
  id: string;
  scan_execution_id: string;
  source: string;
  created_at: string;
  payload: unknown;
  claimed_until: string | null;
  completed_at: string | null;
  outcome: string | null;
}

/**
 * In-memory stand-in for the two queue tables, covering the query shapes
 * `runFanOutQueue` uses. Filters are applied when the chain is awaited.
 */
function fakeQueue(jobs: Job[], done: { job_id: string; profile_id: string }[] = []) {
  function chain(table: string) {
    let op: "select" | "update" | "upsert" = "select";
    let patch: Record<string, unknown> = {};
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    let returning = false;
    const q = {
      select() {
        if (op !== "select") returning = true;
        return q;
      },
      update(p: Record<string, unknown>) {
        op = "update";
        patch = p;
        return q;
      },
      upsert(row: { job_id: string; profile_id: string }) {
        if (!done.some((d) => d.job_id === row.job_id && d.profile_id === row.profile_id)) done.push(row);
        return Promise.resolve({ error: null });
      },
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v);
        return q;
      },
      in(col: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[col]));
        return q;
      },
      is(col: string, v: null) {
        filters.push((r) => r[col] === v);
        return q;
      },
      or(expr: string) {
        const at = /claimed_until\.lt\."(.+)"/.exec(expr)![1];
        filters.push((r) => r.claimed_until === null || String(r.claimed_until) < at);
        return q;
      },
      order() {
        return q;
      },
      limit() {
        return q;
      },
      then(resolve: (v: unknown) => void) {
        const rows = (table === "scan_fanout_jobs" ? jobs : done) as unknown as Record<string, unknown>[];
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === "update") {
          for (const r of hit) Object.assign(r, patch);
          resolve({ data: returning ? hit.map((r) => ({ payload: r.payload })) : null, error: null });
        } else {
          const sorted = table === "scan_fanout_jobs" ? [...hit].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) : hit;
          resolve({ data: sorted, error: null });
        }
      },
    };
    return q;
  }
  return { from: (table: string) => chain(table) } as unknown as SupabaseClient;
}

const NOW = new Date("2026-10-22T21:46:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const job = (id: string, source: string, createdAt: string, payload: unknown = { qualifying: [], rejectedSymbols: ["TSLA"], retired: [] }): Job => ({
  id,
  scan_execution_id: `se-${id}`,
  source,
  created_at: createdAt,
  payload,
  claimed_until: null,
  completed_at: null,
  outcome: null,
});

beforeEach(() => {
  fanOutToProfilesMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("runFanOutQueue", () => {
  it("serves the newest job, supersedes older ones and expires stale ones", async () => {
    const jobs = [
      job("new", "scheduled_full_universe_scan", minutesAgo(1)),
      job("old", "scheduled_full_universe_scan", minutesAgo(16)),
      job("stale", "scheduled_midday_scan", new Date(NOW.getTime() - JOB_MAX_AGE_MS - 1).toISOString()),
    ];
    fanOutToProfilesMock.mockResolvedValue({ profilesFannedOut: 24, profilesDeferred: 0, profilesFailed: 0 });

    const out = await runFanOutQueue(fakeQueue(jobs), { deadlineAt: Date.now() + 30_000, now: NOW });

    expect(out).toMatchObject({ jobsServed: 1, jobsCompleted: 1, jobsSuperseded: 1, jobsExpired: 1, profilesFannedOut: 24 });
    expect(fanOutToProfilesMock).toHaveBeenCalledTimes(1);
    const args = fanOutToProfilesMock.mock.calls[0][1];
    expect(args).toMatchObject({ scanExecutionId: "se-new", source: "scheduled_full_universe_scan", replaceVisible: true });
    // Stamped with the job's own time, so a stale evaluation is refused.
    expect(args.evaluatedAt).toEqual(new Date(minutesAgo(1)));
    expect(args.rejectedSymbols).toEqual(new Set(["TSLA"]));
    expect(jobs.map((j) => [j.id, j.outcome])).toEqual([
      ["new", "completed"],
      ["old", "superseded"],
      ["stale", "expired"],
    ]);
    // Closed jobs keep no payload.
    expect(jobs.every((j) => JSON.stringify(j.payload) === "{}")).toBe(true);
  });

  it("supersedes an older job of another source too, so its verdicts never land on top of the newer scan's", async () => {
    // The market scan queues at 13:15 UTC and the confirmation scan at 13:18.
    const jobs = [job("confirm", "scheduled_morning_confirmation_scan", minutesAgo(1)), job("market", "scheduled_full_universe_scan", minutesAgo(4))];
    fanOutToProfilesMock.mockResolvedValue({ profilesFannedOut: 3, profilesDeferred: 0, profilesFailed: 0 });
    const out = await runFanOutQueue(fakeQueue(jobs), { deadlineAt: Date.now() + 30_000, now: NOW });
    expect(out).toMatchObject({ jobsCompleted: 1, jobsSuperseded: 1 });
    expect(fanOutToProfilesMock.mock.calls.map((c) => c[1].scanExecutionId)).toEqual(["se-confirm"]);
    expect(jobs[1].outcome).toBe("superseded");
  });

  it("leaves a job open when its members could not be listed", async () => {
    const jobs = [job("j", "scheduled_full_universe_scan", minutesAgo(1))];
    fanOutToProfilesMock.mockResolvedValue({ profilesFannedOut: 0, profilesDeferred: 0, profilesFailed: 0, listFailed: true });
    const out = await runFanOutQueue(fakeQueue(jobs), { deadlineAt: Date.now() + 30_000, now: NOW });
    expect(out.jobsCompleted).toBe(0);
    expect(jobs[0]).toMatchObject({ completed_at: null, claimed_until: null });
  });

  it("skips the members an earlier call served, records each one done, and leaves a cut-off job open for the next call", async () => {
    const jobs = [job("j", "scheduled_full_universe_scan", minutesAgo(1))];
    const done = [{ job_id: "j", profile_id: "p1" }];
    fanOutToProfilesMock.mockImplementation(async (_s, args) => {
      expect(args.skipProfileIds).toEqual(new Set(["p1"]));
      await args.onProfileDone("p2");
      return { profilesFannedOut: 1, profilesDeferred: 5, profilesFailed: 0 };
    });

    const out = await runFanOutQueue(fakeQueue(jobs, done), { deadlineAt: Date.now() + 30_000, now: NOW });

    expect(out).toMatchObject({ jobsServed: 1, jobsCompleted: 0, profilesDeferred: 5 });
    expect(done).toEqual([
      { job_id: "j", profile_id: "p1" },
      { job_id: "j", profile_id: "p2" },
    ]);
    expect(jobs[0]).toMatchObject({ completed_at: null, claimed_until: null });
  });

  it("leaves a job another call holds alone", async () => {
    const held = job("j", "scheduled_full_universe_scan", minutesAgo(1));
    held.claimed_until = new Date(Date.now() + 60_000).toISOString();
    const out = await runFanOutQueue(fakeQueue([held]), { deadlineAt: Date.now() + 30_000, now: NOW });
    expect(fanOutToProfilesMock).not.toHaveBeenCalled();
    expect(out.jobsServed).toBe(0);
  });

  it("starts no job once its deadline has passed", async () => {
    const jobs = [job("j", "scheduled_full_universe_scan", minutesAgo(1))];
    const out = await runFanOutQueue(fakeQueue(jobs), { deadlineAt: Date.now() - 1, now: NOW });
    expect(fanOutToProfilesMock).not.toHaveBeenCalled();
    expect(out.jobsServed).toBe(0);
    expect(jobs[0].completed_at).toBeNull();
  });
});

describe("toFanOutPayload", () => {
  it("drops the daily bars and survives a JSON round trip unchanged otherwise", () => {
    const value = { symbol: "AAPL", decision: { score: 7, outputState: "Execute" }, dailyBars: [{ t: "x", o: 1, h: 1, l: 1, c: 1, v: 1 }] } as unknown as ScanResult;
    const payload = toFanOutPayload({ qualifying: [{ side: "buy", rank: 7, value }], rejectedSymbols: new Set(["TSLA"]), retired: [] });
    expect(payload.qualifying[0].value).not.toHaveProperty("dailyBars");
    expect(value).toHaveProperty("dailyBars");
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
    expect(payload.rejectedSymbols).toEqual(["TSLA"]);
  });
});

describe("fanOutEnabledFor", () => {
  const policy = { morningPreparationScanEnabled: false, morningConfirmationScanEnabled: true } as EntitlementPolicy;
  it("serves the preparation scan's members for it and the confirmation scan's for every other source", () => {
    expect(fanOutEnabledFor("scheduled_morning_scan")(policy)).toBe(false);
    expect(fanOutEnabledFor("scheduled_full_universe_scan")(policy)).toBe(true);
    expect(fanOutEnabledFor("scheduled_midday_scan")(policy)).toBe(true);
  });
});
