import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const {
  runMarketScanMock,
  isTradingDayMock,
  fanOutForProfileMock,
  createServiceClientMock,
} = vi.hoisted(() => ({
  runMarketScanMock: vi.fn(),
  isTradingDayMock: vi.fn(),
  fanOutForProfileMock: vi.fn(),
  createServiceClientMock: vi.fn(),
}));

vi.mock("@/lib/marketScan", () => ({ runMarketScan: runMarketScanMock }));
vi.mock("@/lib/market/calendar", () => ({ isTradingDay: isTradingDayMock }));
vi.mock("@/lib/market/session", () => ({ etDateKey: () => "2026-08-26" }));
vi.mock("@/lib/entitlements/scan-fanout", () => ({ fanOutForProfile: fanOutForProfileMock }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: createServiceClientMock }));

import { runScheduledScan } from "@/lib/entitlements/scheduled-scan";

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
  const client = {
    from(table: string) {
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
  return { client, inserted };
}

beforeEach(() => {
  runMarketScanMock.mockReset();
  isTradingDayMock.mockReset().mockReturnValue(true);
  fanOutForProfileMock.mockReset().mockResolvedValue({ visibleCount: 0, notifiedCount: 0 });
  createServiceClientMock.mockReset();
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
      fullScanResults: [],
    });

    const res = await runScheduledScan(AUTH, "scheduled_morning_scan");
    const body = await res.json();

    expect(body).toMatchObject({ skipped: "already_run" });
    expect(fanOutForProfileMock).not.toHaveBeenCalled();
  });

  it("builds rejectedSymbols from fullScanResults and fans out to every eligible profile", async () => {
    const { client, inserted } = fakeService({
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

    // TSLA: no error, Reject/no-direction -> invalidation-eligible.
    // MSFT: has `.error` set -> a provider failure, not a clean reject; excluded.
    // AAPL: qualifying, not rejected.
    expect(fanOutForProfileMock).toHaveBeenCalledTimes(2);
    for (const call of fanOutForProfileMock.mock.calls) {
      const args = call[1] as { rejectedSymbols: Set<string> };
      expect(args.rejectedSymbols).toEqual(new Set(["TSLA"]));
    }
  });
});
