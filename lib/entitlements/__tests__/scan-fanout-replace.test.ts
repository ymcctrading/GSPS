import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/lifecycle/store", () => ({
  listTradePlans: vi.fn().mockResolvedValue([]),
  applyEventAndPersist: vi.fn(),
  createOrGetIdempotentTradePlan: vi.fn(),
}));

const { evaluateMonitorMock } = vi.hoisted(() => ({ evaluateMonitorMock: vi.fn() }));
vi.mock("@/lib/entitlements/monitor-store", () => ({ evaluateMonitor: evaluateMonitorMock }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { fanOutForProfile } from "@/lib/entitlements/scan-fanout";

function fakeService(deleteError: { message: string } | null = null) {
  const ops: string[] = [];
  const client = {
    from(table: string) {
      return {
        delete() {
          return {
            eq: (c1: string, v1: string) => ({
              eq: (c2: string, v2: string) => {
                ops.push(`delete ${table} ${c1}=${v1} ${c2}=${v2}`);
                return Promise.resolve({ error: deleteError });
              },
            }),
          };
        },
        insert(rows: unknown[]) {
          ops.push(`insert ${table} ${rows.length}`);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, ops };
}

const base = {
  profileId: "u1",
  scanExecutionId: "se-1",
  source: "scheduled_full_universe_scan",
  qualifying: [],
  rejectedSymbols: new Set<string>(),
  maxDashboardSetupsPerScan: 30,
  maxActiveWatchMonitors: 10,
};

describe("fanOutForProfile's replaceVisible", () => {
  it("clears the profile's rows for the execution first when set", async () => {
    const { client, ops } = fakeService();
    await fanOutForProfile(client, { ...base, replaceVisible: true });
    expect(ops).toEqual(["delete visible_scan_results scan_execution_id=se-1 profile_id=u1"]);
  });

  it("writes no rows when the clearing failed, so a retried profile is never listed twice", async () => {
    const { client, ops } = fakeService({ message: "down" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const value = { symbol: "AAPL", direction: "bullish", decision: { score: 7, outputState: "Watch" } };
    evaluateMonitorMock.mockResolvedValue({ outcome: "skipped", reason: "stale_evaluation" });
    await fanOutForProfile(client, { ...base, qualifying: [{ side: "buy", rank: 7, value }] as never, replaceVisible: true });
    expect(ops).toEqual(["delete visible_scan_results scan_execution_id=se-1 profile_id=u1"]);
    // AAPL was visible (its monitor was read), only its row was withheld.
    expect(evaluateMonitorMock).toHaveBeenCalledWith(client, expect.objectContaining({ symbol: "AAPL" }));
  });

  it("stamps every monitor evaluation with the scan's time", async () => {
    const { client } = fakeService();
    evaluateMonitorMock.mockReset().mockResolvedValue({ outcome: "skipped", reason: "stale_evaluation" });
    const at = new Date("2026-10-22T13:15:45Z");
    await fanOutForProfile(client, { ...base, rejectedSymbols: new Set(["TSLA"]), evaluatedAt: at });
    expect(evaluateMonitorMock).toHaveBeenCalledWith(client, expect.objectContaining({ symbol: "TSLA", now: at }));
  });

  it("clears nothing when not set", async () => {
    const { client, ops } = fakeService();
    await fanOutForProfile(client, base);
    expect(ops).toEqual([]);
  });
});
