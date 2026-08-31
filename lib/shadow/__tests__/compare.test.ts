import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  compareToBacktest,
  evaluateShadowDrift,
  summarizeShadowRows,
  MIN_SHADOW_SAMPLES,
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
  it("reads evaluated shadow rows and compares against the baseline", async () => {
    const rows = Array.from({ length: MIN_SHADOW_SAMPLES }, () => ({ outcome: "loss" as const, r_multiple: -1 }));
    const client = {
      from: () => ({
        select: () => ({
          not: () => ({
            gte: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

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
});
