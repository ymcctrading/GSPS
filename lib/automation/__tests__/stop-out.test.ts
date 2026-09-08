import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTradePlan, getTradePlan, applyEventAndPersist, type NewTradePlan } from "@/lib/lifecycle/store";
import { freshEntryConfirmation } from "@/lib/lifecycle/entryConfirmation";
import { handleAutomatedStopOut } from "@/lib/automation/stop-out";

/**
 * Minimal in-memory fake covering trade_plans, trade_plan_audit (same
 * shapes lib/lifecycle/__tests__/store.test.ts exercises) plus
 * user_automation_profiles' single-row read, the only extra table
 * lib/automation/stop-out.ts touches.
 */
function fakeSupabase(automationProfile: { pivot_on_stop_out: boolean } | null) {
  const plans: Record<string, unknown>[] = [];
  const audit: Record<string, unknown>[] = [];

  function planTable() {
    return {
      select() {
        const filters: ((row: Record<string, unknown>) => boolean)[] = [];
        const chain = {
          eq(col: string, val: unknown) {
            filters.push((r) => r[col] === val);
            return chain;
          },
          order() {
            return chain;
          },
          limit() {
            return chain;
          },
          maybeSingle() {
            const matched = plans.filter((r) => filters.every((f) => f(r)));
            return Promise.resolve({ data: matched[0] ?? null, error: null });
          },
          single() {
            const matched = plans.filter((r) => filters.every((f) => f(r)));
            return Promise.resolve(
              matched[0] ? { data: matched[0], error: null } : { data: null, error: { message: "not found" } },
            );
          },
          then(resolve: (v: { data: Record<string, unknown>[]; error: null }) => void) {
            resolve({ data: plans.filter((r) => filters.every((f) => f(r))), error: null });
          },
        };
        return chain;
      },
      insert(row: Record<string, unknown>) {
        const withId: Record<string, unknown> = {
          plan_id: row.plan_id ?? randomUUID(),
          created_at: new Date().toISOString(),
          ...row,
        };
        const isDuplicate =
          row.signal_fingerprint != null &&
          plans.some(
            (p) =>
              p.user_id === withId.user_id &&
              p.instrument === withId.instrument &&
              p.timeframe === withId.timeframe &&
              p.strategy_version === withId.strategy_version &&
              p.signal_fingerprint === withId.signal_fingerprint,
          );
        return {
          select() {
            return {
              single() {
                if (isDuplicate) return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } });
                plans.push(withId);
                return Promise.resolve({ data: withId, error: null });
              },
            };
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
            for (const r of plans) if (filters.every((f) => f(r))) Object.assign(r, patch);
            resolve({ error: null });
          },
        };
        return chain;
      },
    };
  }

  function auditTable() {
    return {
      select() {
        const filters: ((row: Record<string, unknown>) => boolean)[] = [];
        const chain = {
          eq(col: string, val: unknown) {
            filters.push((r) => r[col] === val);
            return chain;
          },
          then(resolve: (v: { data: Record<string, unknown>[]; error: null }) => void) {
            resolve({ data: audit.filter((r) => filters.every((f) => f(r))), error: null });
          },
        };
        return chain;
      },
      insert(row: Record<string, unknown>) {
        return {
          then(resolve: (v: { error: null }) => void) {
            audit.push({ id: randomUUID(), ...row });
            resolve({ error: null });
          },
        };
      },
    };
  }

  function profileTable() {
    return {
      select() {
        return {
          eq() {
            return {
              maybeSingle() {
                return Promise.resolve({ data: automationProfile, error: null });
              },
            };
          },
        };
      },
    };
  }

  const client = {
    from(name: string) {
      if (name === "trade_plans") return planTable();
      if (name === "trade_plan_audit") return auditTable();
      if (name === "user_automation_profiles") return profileTable();
      throw new Error(`unexpected table ${name}`);
    },
  } as unknown as SupabaseClient;

  return { client, plans, audit };
}

function armedPlan(overrides: Partial<NewTradePlan> = {}): NewTradePlan {
  return {
    strategyVersion: "1.0.0",
    signalId: "sig-1",
    instrument: "AAPL",
    market: "us_equity",
    timeframe: "15Min",
    generatedAt: "2026-08-29T13:00:00.000Z",
    expiresAt: "2026-09-05T13:00:00.000Z",
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
      alignment: { score: 82, tier: "aTier", breakdown: [] },
      dataTimestamps: {},
      eventLiquidityStatus: "clear",
    },
    ...overrides,
  };
}

/** Walks a freshly created plan straight to `armed`, the state automation activates against. */
async function createArmedPlan(client: SupabaseClient, userId: string, overrides: Partial<NewTradePlan> = {}) {
  const created = await createTradePlan(client, userId, armedPlan(overrides));
  const at = "2026-08-30T00:00:00.000Z";
  await applyEventAndPersist(client, userId, created.planId, { type: "mark_auto_created", at, reason: "r" });
  await applyEventAndPersist(client, userId, created.planId, { type: "qualify", at, reason: "r" });
  await applyEventAndPersist(client, userId, created.planId, { type: "await_confirmation", at, reason: "r" });
  await applyEventAndPersist(client, userId, created.planId, {
    type: "record_confirmation_evidence",
    at,
    evidence: {
      touchedAt: at,
      touchedPrice: 100,
      breakOrSweepAt: at,
      breakOrSweepPrice: 100.5,
      retestAt: at,
      retestPrice: 99.9,
      confirmationMoveAt: at,
      confirmationMovePrice: 100.6,
      entryConfirmedAt: at,
    },
  });
  await applyEventAndPersist(client, userId, created.planId, { type: "arm", at, reason: "r" });
  return created.planId;
}

describe("handleAutomatedStopOut", () => {
  it("is a no-op when the plan doesn't exist", async () => {
    const { client } = fakeSupabase({ pivot_on_stop_out: true });
    await expect(
      handleAutomatedStopOut(client, "user-1", {
        planId: "missing",
        entryFillPrice: 100,
        stoppedAt: "2026-08-31T00:00:00.000Z",
        exitPrice: 97,
      }),
    ).resolves.toBeUndefined();
  });

  it("enters then invalidates an armed plan, and does not seed a pivot plan when the dial is off", async () => {
    const { client, plans } = fakeSupabase({ pivot_on_stop_out: false });
    const planId = await createArmedPlan(client, "user-1");

    await handleAutomatedStopOut(client, "user-1", {
      planId,
      entryFillPrice: 100,
      stoppedAt: "2026-08-31T00:00:00.000Z",
      exitPrice: 97,
    });

    const closed = await getTradePlan(client, "user-1", planId);
    expect(closed?.state).toBe("invalidated");
    expect(closed?.actualEntryPrice).toBe(100);
    expect(closed?.closeReason).toContain("97");
    expect(plans).toHaveLength(1); // no pivot plan seeded
  });

  it("seeds an opposite-direction pivot plan when the dial is on and the market is us_equity", async () => {
    const { client, plans } = fakeSupabase({ pivot_on_stop_out: true });
    const planId = await createArmedPlan(client, "user-1");

    await handleAutomatedStopOut(client, "user-1", {
      planId,
      entryFillPrice: 100,
      stoppedAt: "2026-08-31T00:00:00.000Z",
      exitPrice: 97,
    });

    expect(plans).toHaveLength(2);
    const pivot = await getTradePlan(client, "user-1", plans[1].plan_id as string);
    expect(pivot?.direction).toBe("bearish");
    expect(pivot?.state).toBe("awaiting_entry_confirmation");
    expect(pivot?.coordinates.entryTrigger).toBe(97);
  });

  it("does not seed a pivot plan for a market automation doesn't support, even with the dial on", async () => {
    const { client, plans } = fakeSupabase({ pivot_on_stop_out: true });
    const planId = await createArmedPlan(client, "user-1", { market: "crypto" });

    await handleAutomatedStopOut(client, "user-1", {
      planId,
      entryFillPrice: 100,
      stoppedAt: "2026-08-31T00:00:00.000Z",
      exitPrice: 97,
    });

    expect(plans).toHaveLength(1);
  });

  it("does nothing when no automation profile row exists for the user", async () => {
    const { client, plans } = fakeSupabase(null);
    const planId = await createArmedPlan(client, "user-1");

    await handleAutomatedStopOut(client, "user-1", {
      planId,
      entryFillPrice: 100,
      stoppedAt: "2026-08-31T00:00:00.000Z",
      exitPrice: 97,
    });

    expect(plans).toHaveLength(1);
    const closed = await getTradePlan(client, "user-1", planId);
    expect(closed?.state).toBe("invalidated"); // the plan's own lifecycle still closes out
  });
});
