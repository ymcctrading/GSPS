import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/learning/record", () => ({
  recordTradePlanRegime: vi.fn(),
}));

import { runLifecycleReaper } from "@/lib/lifecycle/reaper";
import { createTradePlan } from "@/lib/lifecycle/store";
import { freshEntryConfirmation } from "@/lib/lifecycle/entryConfirmation";
import type { NewTradePlan } from "@/lib/lifecycle/store";

/**
 * Minimal in-memory fake covering the query shapes both
 * lib/lifecycle/store.ts's `listExpirablePlans` (select/in/lte/limit) and
 * `applyEventAndPersist` (select/eq/eq/maybeSingle, update/eq/eq, insert)
 * issue against trade_plans and trade_plan_audit — same style as
 * store.test.ts's fake, extended with `.lte()` for the reaper's own query.
 */
function fakeSupabase() {
  const plans: Record<string, unknown>[] = [];
  const audit: Record<string, unknown>[] = [];

  function table(rows: Record<string, unknown>[], idCol: string) {
    return {
      select() {
        const filters: ((row: Record<string, unknown>) => boolean)[] = [];
        const chain = {
          eq(col: string, val: unknown) {
            filters.push((r) => r[col] === val);
            return chain;
          },
          in(col: string, vals: unknown[]) {
            filters.push((r) => vals.includes(r[col]));
            return chain;
          },
          lte(col: string, val: string) {
            filters.push((r) => new Date(r[col] as string).getTime() <= new Date(val).getTime());
            return chain;
          },
          order() {
            return chain;
          },
          limit() {
            return chain;
          },
          maybeSingle() {
            const matched = rows.filter((r) => filters.every((f) => f(r)));
            return Promise.resolve({ data: matched[0] ?? null, error: null });
          },
          then(resolve: (v: { data: Record<string, unknown>[]; error: null }) => void) {
            resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null });
          },
        };
        return chain;
      },
      insert(row: Record<string, unknown>) {
        const withId = { [idCol]: row[idCol] ?? randomUUID(), created_at: new Date().toISOString(), ...row };
        return {
          select() {
            return {
              single() {
                rows.push(withId);
                return Promise.resolve({ data: withId, error: null });
              },
            };
          },
          then(resolve: (v: { error: null }) => void) {
            rows.push(withId);
            resolve({ error: null });
          },
        };
      },
      update(patch: Record<string, unknown>) {
        const filters: ((row: Record<string, unknown>) => boolean)[] = [];
        const chain = {
          eq(col: string, val: unknown) {
            filters.push((r) => r[col] === val);
            return chain;
          },
          then(resolve: (v: { error: null }) => void) {
            for (const r of rows) if (filters.every((f) => f(r))) Object.assign(r, patch);
            resolve({ error: null });
          },
        };
        return chain;
      },
    };
  }

  const client = {
    from(name: string) {
      if (name === "trade_plans") return table(plans, "plan_id");
      if (name === "trade_plan_audit") return table(audit, "id");
      throw new Error(`unexpected table ${name}`);
    },
  } as unknown as SupabaseClient;

  return { client, plans, audit };
}

function newPlan(overrides: Partial<NewTradePlan> = {}): NewTradePlan {
  return {
    strategyVersion: "1.0.0",
    signalId: "sig-1",
    instrument: "AAPL",
    market: "us_equity",
    timeframe: "15Min",
    generatedAt: "2026-09-08T13:15:00.000Z",
    expiresAt: "2026-09-08T18:15:00.000Z",
    direction: "bullish",
    signalFingerprint: "sig-1",
    entryConfirmation: freshEntryConfirmation(),
    coordinates: {
      entryTrigger: 100,
      entryLimitTolerance: 0.5,
      invalidation: 97,
      stopType: "stop_market",
      takeProfit1: 105,
      takeProfit2: 108,
      masterProfit: 110,
      runnerRule: { enabled: true, description: "Trail without lowering the Master Profit floor." },
    },
    risk: {
      approvedQuantity: 10,
      fractionalCapability: false,
      plannedDollarRisk: 30,
      allocationPct: 2,
      totalOpenRiskSnapshot: 500,
    },
    evidence: {
      regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
      alignment: { score: 82, tier: "aTier", blueprintScoreBand: "ACTIONABLE", breakdown: [] },
      dataTimestamps: {},
      eventLiquidityStatus: "clear",
    },
    ...overrides,
  };
}

describe("runLifecycleReaper", () => {
  it("expires a pre-entry plan once its window has closed — the previously-unwired case", async () => {
    const { client } = fakeSupabase();
    await createTradePlan(client, "user-1", newPlan({ expiresAt: "2026-09-08T13:00:00.000Z" }));

    const result = await runLifecycleReaper(client, new Date("2026-09-08T14:00:00.000Z"));

    expect(result).toEqual({ candidates: 1, expired: 1, errors: [] });
  });

  it("leaves a plan alone before its window closes", async () => {
    const { client, plans } = fakeSupabase();
    await createTradePlan(client, "user-1", newPlan({ expiresAt: "2026-09-08T20:00:00.000Z" }));

    const result = await runLifecycleReaper(client, new Date("2026-09-08T14:00:00.000Z"));

    expect(result).toEqual({ candidates: 0, expired: 0, errors: [] });
    expect(plans[0].state).toBe("watchlist");
  });

  it("sweeps across every user, not just one", async () => {
    const { client } = fakeSupabase();
    await createTradePlan(client, "user-1", newPlan({ expiresAt: "2026-09-08T13:00:00.000Z" }));
    await createTradePlan(client, "user-2", newPlan({ signalFingerprint: "sig-2", expiresAt: "2026-09-08T13:00:00.000Z" }));

    const result = await runLifecycleReaper(client, new Date("2026-09-08T14:00:00.000Z"));

    expect(result.candidates).toBe(2);
    expect(result.expired).toBe(2);
  });

  it("never touches a post-entry (ACTIVE_STATES) plan — that path stays reactive, see the module header", async () => {
    const { client, plans } = fakeSupabase();
    const plan = await createTradePlan(client, "user-1", newPlan({ expiresAt: "2026-09-08T13:00:00.000Z" }));
    // Simulate the plan already having entered — the reaper's query filters
    // on PRE_ENTRY_STATES, so an entered plan must never be a candidate no
    // matter how stale its (now-irrelevant) expiresAt is.
    plans.find((r) => r.plan_id === plan.planId)!.state = "entered";

    const result = await runLifecycleReaper(client, new Date("2026-09-08T14:00:00.000Z"));

    expect(result).toEqual({ candidates: 0, expired: 0, errors: [] });
  });
});
