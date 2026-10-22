import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/lifecycle/store", () => ({
  listTradePlans: vi.fn().mockResolvedValue([]),
  applyEventAndPersist: vi.fn(),
  createOrGetIdempotentTradePlan: vi.fn(),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { fanOutForProfile } from "@/lib/entitlements/scan-fanout";

function fakeService() {
  const ops: string[] = [];
  const client = {
    from(table: string) {
      return {
        delete() {
          return {
            eq: (c1: string, v1: string) => ({
              eq: (c2: string, v2: string) => {
                ops.push(`delete ${table} ${c1}=${v1} ${c2}=${v2}`);
                return Promise.resolve({ error: null });
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

  it("clears nothing when not set", async () => {
    const { client, ops } = fakeService();
    await fanOutForProfile(client, base);
    expect(ops).toEqual([]);
  });
});
