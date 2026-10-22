import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const {
  runMarketScanMock,
  isTradingDayMock,
  fanOutForProfileMock,
  createServiceClientMock,
  etMinutes,
  shadowCalls,
} = vi.hoisted(() => ({
  shadowCalls: [] as string[],
  etMinutes: { value: 10 * 60 },
  runMarketScanMock: vi.fn(),
  isTradingDayMock: vi.fn(),
  fanOutForProfileMock: vi.fn(),
  createServiceClientMock: vi.fn(),
}));

vi.mock("@/lib/marketScan", () => ({ runMarketScan: runMarketScanMock, FULL_UNIVERSE_TOP: 700 }));
vi.mock("@/lib/market/calendar", () => ({ isTradingDay: isTradingDayMock }));
vi.mock("@/lib/market/session", () => ({
  etDateKey: () => "2026-08-26",
  etParts: () => ({ minutes: etMinutes.value, weekday: 3 }),
}));
vi.mock("@/lib/entitlements/scan-fanout", () => ({ fanOutForProfile: fanOutForProfileMock }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: createServiceClientMock }));
vi.mock("@/lib/shadow/evaluate", () => ({
  evaluatePendingShadowSignals: () => {
    shadowCalls.push("evaluate");
    return Promise.resolve({ evaluated: 0, stillPending: 0, failed: 0 });
  },
}));
vi.mock("@/lib/shadow/record", () => ({
  recordShadowSignals: () => {
    shadowCalls.push("record");
    return Promise.resolve({ recorded: 0 });
  },
}));

import { etWindowFrom, runScheduledScan } from "@/lib/entitlements/scheduled-scan";

const CRON_SECRET = "test-secret";
const AUTH = `Bearer ${CRON_SECRET}`;

/** Minimal fake covering scan_executions (idempotency read + insert) and profiles (fan-out list). */
function fakeService(args: {
  existingRun?: { id: string } | null;
  insertedId?: string;
  insertError?: { code?: string; message: string } | null;
  profiles?: { id: string; tier: string | null }[];
}) {
  const inserted: unknown[] = [];
  const queued: { scan_execution_id: string; source: string; payload: { rejectedSymbols: string[]; qualifying: unknown[] } }[] = [];
  const client = {
    from(table: string) {
      if (table === "scan_fanout_jobs") {
        return {
          insert(row: (typeof queued)[number]) {
            queued.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "scan_executions") {
        return {
          select() {
            return {
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    maybeSingle: () => Promise.resolve({ data: args.existingRun ?? null, error: null }),
                  }),
                }),
              }),
            };
          },
          insert(row: unknown) {
            inserted.push(row);
            return {
              select: () => ({
                single: () =>
                  Promise.resolve(
                    args.insertError
                      ? { data: null, error: args.insertError }
                      : { data: { id: args.insertedId ?? "se1" }, error: null },
                  ),
              }),
            };
          },
        };
      }
      if (table === "profiles") {
        return { select: () => Promise.resolve({ data: args.profiles ?? [], error: null }) };
      }
      if (table === "policy_values") {
        // No override rows configured — getUniversePolicy falls back to code defaults.
        return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) };
      }
      if (table === "shadow_signals") {
        // No shadow-mode signals to record, evaluate, or compare in these fixtures.
        return {
          upsert: () => Promise.resolve({ error: null }),
          select: () => ({
            is: () => ({
              lte: () => Promise.resolve({ data: [], error: null }),
            }),
            not: () => ({
              gte: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === "shadow_drift_alerts") {
        // No drift below the minimum sample size in these fixtures, so this never gets read/written.
        return {
          select: () => ({ gte: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
          insert: () => Promise.resolve({ error: null }),
        };
      }
      throw new Error(`fakeService: unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
  return { client, inserted, queued };
}

beforeEach(() => {
  runMarketScanMock.mockReset();
  isTradingDayMock.mockReset().mockReturnValue(true);
  fanOutForProfileMock.mockReset().mockResolvedValue({ visibleCount: 0, notifiedCount: 0 });
  createServiceClientMock.mockReset();
  etMinutes.value = 10 * 60;
  shadowCalls.length = 0;
  process.env.CRON_SECRET = CRON_SECRET;
  delete process.env.VERCEL_ENV;
});

describe("runScheduledScan", () => {
  it("rejects a missing/invalid authorization header without touching the database", async () => {
    const res = await runScheduledScan(null, "scheduled_morning_scan");
    expect(res.status).toBe(401);
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("skips as a no-op in preview without running the scan or touching the database", async () => {
    process.env.VERCEL_ENV = "preview";
    const res = await runScheduledScan(AUTH, "scheduled_morning_scan");
    const body = await res.json();
    expect(body).toMatchObject({ skipped: "preview_environment" });
    expect(runMarketScanMock).not.toHaveBeenCalled();
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("skips on a non-trading day without running the scan", async () => {
    isTradingDayMock.mockReturnValue(false);
    const res = await runScheduledScan(AUTH, "scheduled_morning_scan");
    const body = await res.json();
    expect(body).toMatchObject({ skipped: "non_trading_day" });
    expect(runMarketScanMock).not.toHaveBeenCalled();
  });

  it("skips a firing before its ET window (the winter EDT-hour firing)", async () => {
    etMinutes.value = 8 * 60 + 18;
    const res = await runScheduledScan(AUTH, "scheduled_morning_confirmation_scan", etWindowFrom(9, 15));
    expect(await res.json()).toMatchObject({ skipped: "outside_scheduled_window" });
    expect(runMarketScanMock).not.toHaveBeenCalled();
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("skips a firing past its ET window, so a failed run is not retried an hour late", async () => {
    etMinutes.value = 10 * 60 + 18;
    const res = await runScheduledScan(AUTH, "scheduled_morning_confirmation_scan", etWindowFrom(9, 15));
    expect(await res.json()).toMatchObject({ skipped: "outside_scheduled_window" });
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("runs at the window's first minute", async () => {
    etMinutes.value = 9 * 60 + 15;
    const { client } = fakeService({ existingRun: { id: "se-existing" } });
    createServiceClientMock.mockReturnValue(client);
    const res = await runScheduledScan(AUTH, "scheduled_morning_confirmation_scan", etWindowFrom(9, 15));
    expect((await res.json()).skipped).not.toBe("outside_scheduled_window");
    expect(createServiceClientMock).toHaveBeenCalled();
  });

  it("is idempotent: skips a market date that already has a scan_executions row, without re-running the scan", async () => {
    const { client } = fakeService({ existingRun: { id: "se-existing" } });
    createServiceClientMock.mockReturnValue(client);

    const res = await runScheduledScan(AUTH, "scheduled_morning_scan");
    const body = await res.json();

    expect(body).toMatchObject({ skipped: "already_run", scanExecutionId: "se-existing" });
    expect(runMarketScanMock).not.toHaveBeenCalled();
  });

  it("fails closed (503) when the upstream market scan throws, without persisting anything", async () => {
    const { client, inserted } = fakeService({ existingRun: null });
    createServiceClientMock.mockReturnValue(client);
    runMarketScanMock.mockRejectedValueOnce(new Error("provider timeout"));

    const res = await runScheduledScan(AUTH, "scheduled_morning_scan");
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("Upstream market data unavailable");
    expect(inserted).toHaveLength(0);
  });

  it("fails closed (503) when the stock bars were not read, without recording the run or fanning out", async () => {
    const { client, inserted } = fakeService({ existingRun: null, profiles: [{ id: "p1", tier: "PRACTICE" }] });
    createServiceClientMock.mockReturnValue(client);
    runMarketScanMock.mockResolvedValueOnce({
      scanDate: "2026-08-26",
      bullish: [{ symbol: "BTC/USD", decision: { score: 8, outputState: "Execute" }, direction: "bullish" }],
      bearish: [],
      universeSize: 20,
      shortlisted: 5,
      scanErrors: 0,
      equitiesRead: false,
      fullScanResults: [],
    });

    const res = await runScheduledScan(AUTH, "scheduled_morning_scan");
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("Upstream market data unavailable");
    expect(inserted).toHaveLength(0);
    expect(fanOutForProfileMock).not.toHaveBeenCalled();
  });

  it("treats a racing duplicate insert (23505) the same as an already-run skip", async () => {
    const { client } = fakeService({ existingRun: null, insertError: { code: "23505", message: "duplicate" } });
    createServiceClientMock.mockReturnValue(client);
    runMarketScanMock.mockResolvedValueOnce({
      scanDate: "2026-08-26",
      bullish: [],
      bearish: [],
      universeSize: 20,
      shortlisted: 5,
      scanErrors: 0,
      equitiesRead: true,
      fullScanResults: [],
    });

    const res = await runScheduledScan(AUTH, "scheduled_morning_scan");
    const body = await res.json();

    expect(body).toMatchObject({ skipped: "already_run" });
    expect(fanOutForProfileMock).not.toHaveBeenCalled();
  });

  it("builds rejectedSymbols from fullScanResults and queues the fan-out for the worker", async () => {
    const { client, inserted, queued } = fakeService({
      existingRun: null,
      insertedId: "se-new",
      profiles: [
        { id: "p1", tier: "PRACTICE" },
        { id: "p2", tier: null },
      ],
    });
    createServiceClientMock.mockReturnValue(client);
    runMarketScanMock.mockResolvedValueOnce({
      scanDate: "2026-08-26",
      bullish: [{ symbol: "AAPL", decision: { score: 8, outputState: "Execute" }, direction: "bullish" }],
      bearish: [],
      universeSize: 20,
      shortlisted: 5,
      scanErrors: 0,
      equitiesRead: true,
      fullScanResults: [
        { symbol: "AAPL", decision: { score: 8, outputState: "Execute" }, direction: "bullish", error: undefined },
        { symbol: "TSLA", decision: { score: 2, outputState: "Reject" }, direction: "none", error: undefined },
        { symbol: "MSFT", decision: { score: 1, outputState: "Reject" }, direction: "bullish", error: "provider hiccup" },
      ],
    });

    const res = await runScheduledScan(AUTH, "scheduled_morning_scan");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scanExecutionId).toBe("se-new");
    expect(inserted[0]).toMatchObject({ source: "scheduled_morning_scan", market_date_et: "2026-08-26" });

    // The forward test reads the ended sessions before it records, so a plan
    // that expired unfilled is a new call when found for the next session.
    expect(shadowCalls).toEqual(["evaluate", "record"]);

    // TSLA: no error, Reject/no-direction -> invalidation-eligible.
    // MSFT: has `.error` set -> a provider failure, not a clean reject; excluded.
    // AAPL: qualifying, not rejected.
    // Queued, not run in this request (lib/entitlements/fanout-queue.ts).
    expect(fanOutForProfileMock).not.toHaveBeenCalled();
    expect(body.fanOutQueued).toBe(true);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ scan_execution_id: "se-new", source: "scheduled_morning_scan" });
    expect(queued[0].payload.rejectedSymbols).toEqual(["TSLA"]);
    expect(queued[0].payload.qualifying).toHaveLength(1);
  });

  it("runs and queues its fan-out under the new scheduled_first_90min_scan source, distinct from the 9:15 job", async () => {
    const { client, inserted, queued } = fakeService({
      existingRun: null,
      insertedId: "se-945",
      profiles: [{ id: "p1", tier: "PRACTICE" }],
    });
    createServiceClientMock.mockReturnValue(client);
    runMarketScanMock.mockResolvedValueOnce({
      scanDate: "2026-08-26",
      bullish: [],
      bearish: [],
      universeSize: 20,
      shortlisted: 0,
      scanErrors: 0,
      equitiesRead: true,
      fullScanResults: [],
    });

    const res = await runScheduledScan(AUTH, "scheduled_first_90min_scan");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scanExecutionId).toBe("se-945");
    // Its own source string, not the 9:15 job's -- the idempotency index
    // (migration 0040/0068) keys on this, so the two must never collide.
    expect(inserted[0]).toMatchObject({ source: "scheduled_first_90min_scan", market_date_et: "2026-08-26" });
    expect(queued).toEqual([expect.objectContaining({ scan_execution_id: "se-945", source: "scheduled_first_90min_scan" })]);
  });
});
