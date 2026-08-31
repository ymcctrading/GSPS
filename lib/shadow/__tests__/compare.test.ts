import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { sendOperatorDriftAlertEmailMock } = vi.hoisted(() => ({
  sendOperatorDriftAlertEmailMock: vi.fn(),
}));
vi.mock("@/lib/notifications/resend-handler", () => ({
  sendOperatorDriftAlertEmail: sendOperatorDriftAlertEmailMock,
}));

import {
  compareToBacktest,
  evaluateShadowDrift,
  summarizeShadowRows,
  MIN_SHADOW_SAMPLES,
  DRIFT_ALERT_COOLDOWN_HOURS,
  type BacktestBaseline,
} from "@/lib/shadow/compare";

const BASELINE: BacktestBaseline = { trades: 31, winRate: 0.387, expectancyR: 0.151 };

describe("summarizeShadowRows", () => {
  it("aggregates win rate and expectancy from evaluated rows", () => {
    const rows = [
      { outcome: "win" as const, r_multiple: 3 },
      { outcome: "loss" as const, r_multiple: -1 },
      { outcome: "loss" as const, r_multiple: -1 },
    ];
    const summary = summarizeShadowRows(rows);
    expect(summary.trades).toBe(3);
    expect(summary.winRate).toBeCloseTo(1 / 3, 6);
    expect(summary.expectancyR).toBeCloseTo((3 - 1 - 1) / 3, 6);
  });

  it("returns a zeroed summary for an empty set", () => {
    expect(summarizeShadowRows([])).toEqual({ trades: 0, winRate: 0, expectancyR: 0 });
  });
});

describe("compareToBacktest", () => {
  it("withholds a verdict below the minimum sample size", () => {
    const shadow = { trades: MIN_SHADOW_SAMPLES - 1, winRate: 0, expectancyR: -1 };
    expect(compareToBacktest(shadow, BASELINE)).toBeNull();
  });

  it("returns null when shadow performance tracks the baseline", () => {
    const shadow = { trades: 20, winRate: 0.4, expectancyR: 0.16 };
    expect(compareToBacktest(shadow, BASELINE)).toBeNull();
  });

  it("flags an expectancy drift with enough samples", () => {
    const shadow = { trades: 20, winRate: 0.35, expectancyR: -0.05 }; // 0.201R below baseline
    const alert = compareToBacktest(shadow, BASELINE);
    expect(alert).not.toBeNull();
    expect(alert!.reason).toMatch(/expectancy/);
  });

  it("flags a win-rate drift even with expectancy close to baseline", () => {
    const shadow = { trades: 20, winRate: 0.15, expectancyR: 0.15 }; // 23.7 points below baseline
    const alert = compareToBacktest(shadow, BASELINE);
    expect(alert).not.toBeNull();
    expect(alert!.reason).toMatch(/win rate/);
  });
});

describe("evaluateShadowDrift", () => {
  /** `recentAlerts` seeds the cooldown-check read; `inserted` collects any new `shadow_drift_alerts` row. */
  function makeSupabase(rows: { outcome: string; r_multiple: number }[], recentAlerts: unknown[] = []) {
    const inserted: unknown[] = [];
    const client = {
      from(table: string) {
        if (table === "shadow_signals") {
          return {
            select: () => ({
              not: () => ({
                gte: () => Promise.resolve({ data: rows, error: null }),
              }),
            }),
          };
        }
        if (table === "shadow_drift_alerts") {
          return {
            select: () => ({
              gte: () => ({
                limit: () => Promise.resolve({ data: recentAlerts, error: null }),
              }),
            }),
            insert: (row: unknown) => {
              inserted.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;
    return { client, inserted };
  }

  beforeEach(() => {
    sendOperatorDriftAlertEmailMock.mockReset();
  });

  it("reads evaluated shadow rows and compares against the baseline", async () => {
    const rows = Array.from({ length: MIN_SHADOW_SAMPLES }, () => ({ outcome: "loss" as const, r_multiple: -1 }));
    const { client } = makeSupabase(rows);

    const alert = await evaluateShadowDrift(client, BASELINE, 60, new Date("2026-09-01T00:00:00Z"));
    expect(alert).not.toBeNull();
    expect(alert!.shadow.trades).toBe(MIN_SHADOW_SAMPLES);
  });

  it("returns null on a read error", async () => {
    const client = {
      from: () => ({
        select: () => ({
          not: () => ({
            gte: () => Promise.resolve({ data: null, error: { message: "boom" } }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    expect(await evaluateShadowDrift(client, BASELINE)).toBeNull();
  });

  it("sends one operator alert email and records it when a drift is confirmed and no recent alert exists", async () => {
    const rows = Array.from({ length: MIN_SHADOW_SAMPLES }, () => ({ outcome: "loss" as const, r_multiple: -1 }));
    const { client, inserted } = makeSupabase(rows, []);

    await evaluateShadowDrift(client, BASELINE, 60, new Date("2026-09-01T00:00:00Z"));
    expect(sendOperatorDriftAlertEmailMock).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(1);
  });

  it("skips the email (but still returns the alert) when one was already sent inside the cooldown window", async () => {
    const rows = Array.from({ length: MIN_SHADOW_SAMPLES }, () => ({ outcome: "loss" as const, r_multiple: -1 }));
    const { client, inserted } = makeSupabase(rows, [{ id: "existing" }]);

    const alert = await evaluateShadowDrift(client, BASELINE, 60, new Date("2026-09-01T00:00:00Z"));
    expect(alert).not.toBeNull();
    expect(sendOperatorDriftAlertEmailMock).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it("never emails or records when there is no drift", async () => {
    const rows = Array.from({ length: MIN_SHADOW_SAMPLES }, () => ({ outcome: "win" as const, r_multiple: 1 }));
    const { client, inserted } = makeSupabase(rows, []);

    const alert = await evaluateShadowDrift(client, BASELINE, 60, new Date("2026-09-01T00:00:00Z"));
    expect(alert).toBeNull();
    expect(sendOperatorDriftAlertEmailMock).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it("has a cooldown measured in hours, positive and less than a week", () => {
    expect(DRIFT_ALERT_COOLDOWN_HOURS).toBeGreaterThan(0);
    expect(DRIFT_ALERT_COOLDOWN_HOURS).toBeLessThan(24 * 7);
  });
});
