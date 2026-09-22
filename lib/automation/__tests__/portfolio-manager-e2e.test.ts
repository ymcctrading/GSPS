/**
 * End-to-end mechanism check for the 2026-09-09 EXECUTION_TIMEFRAME override
 * (AGENTS.md -> "Temporary overrides", lib/timeframe.ts): does the real
 * plan-created -> armed -> picked-up-by-the-Portfolio-Manager -> order-placed
 * pipeline actually fire, wired through the same code every layer uses in
 * production (lib/lifecycle/store.ts's real reducer-backed transitions,
 * lib/automation/portfolio-manager.ts's real query/activation loop,
 * lib/automation/service.ts's real activateAutomationProfile/
 * authorizeAutomatedOrder, lib/trade/place-order.ts's real paper fill path) —
 * against an in-memory fake of the handful of Supabase tables involved,
 * since there is no live deployment or open market in this environment to
 * check against directly.
 *
 * Only lib/brokers/simulator.ts (real fills would need the
 * `execute_position_fill` Postgres RPC, which no fake client here
 * reimplements) and lib/entitlements/policy.ts (a Wall Street tier, so the
 * two other real gates in the path aren't blocked by tier logic unrelated to
 * what this test is checking) are stubbed. Every other function on the path
 * — lifecycle transitions, the Portfolio Manager's candidate query and dial
 * matching, automation activation, order/bracket validation, the ledger
 * insert — is the real, unmocked production code.
 *
 * This proves the *plumbing* fires end to end on paper money at the 1Hour
 * override. It is not, and does not claim to be, evidence that 1Hour is a
 * good execution timeframe — see lib/timeframe.ts's own comment and
 * docs/BACKTESTING.md.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/learning/record", () => ({
  recordTradePlanRegime: vi.fn(),
  recordOrderExecution: vi.fn(),
}));

vi.mock("@/lib/entitlements/policy", () => ({
  getUserEntitlementPolicy: vi.fn().mockResolvedValue({
    automationEnabled: true,
    proIntradayModuleEnabled: false,
  }),
}));

vi.mock("@/lib/brokers/simulator", () => ({
  assetClassOf: () => "us_equity",
  getOrCreateAccount: vi.fn().mockResolvedValue({ cash: 100_000 }),
  getOpenPosition: vi.fn().mockResolvedValue(null),
  listOpenPositions: vi.fn().mockResolvedValue([]),
  quotePrice: vi.fn().mockResolvedValue(100.5),
  quoteOptionPrice: vi.fn(),
  executeFill: vi.fn().mockResolvedValue({ price: 100.5, qty: 10, positionId: "pos-1", closed: null }),
  logPlainClose: vi.fn(),
  isTriggered: vi.fn(),
}));

import { createTradePlan, applyEventAndPersist, type NewTradePlan } from "@/lib/lifecycle/store";
import { freshEntryConfirmation } from "@/lib/lifecycle/entryConfirmation";
import { runAutonomousPortfolioManager } from "@/lib/automation/portfolio-manager";
import { EXECUTION_TIMEFRAME } from "@/lib/timeframe";

/**
 * In-memory fake covering every table the real code touches on this path:
 * trade_plans/trade_plan_audit (lib/lifecycle/store.ts, same shape
 * lib/automation/__tests__/stop-out.test.ts already exercises),
 * user_automation_profiles (the Portfolio Manager's own enabled-profile
 * query), automation_profiles/automation_events (lib/automation/service.ts),
 * and orders/protocol_exits (lib/trade/place-order.ts's paper ledger write).
 */
function fakeSupabase(automationProfileRow: Record<string, unknown> | null) {
  const plans: Record<string, unknown>[] = [];
  const audit: Record<string, unknown>[] = [];
  const automationProfiles: Record<string, unknown>[] = [];
  const automationEvents: Record<string, unknown>[] = [];
  const orders: Record<string, unknown>[] = [];
  const protocolExits: Record<string, unknown>[] = [];

  function listTable(rows: Record<string, unknown>[]) {
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
          gte(col: string, val: unknown) {
            filters.push((r) => (r[col] as string) >= (val as string));
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
          single() {
            const matched = rows.filter((r) => filters.every((f) => f(r)));
            return Promise.resolve(
              matched[0] ? { data: matched[0], error: null } : { data: null, error: { message: "not found" } },
            );
          },
          then(resolve: (v: { data: Record<string, unknown>[]; error: null }) => void) {
            resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null });
          },
        };
        return chain;
      },
    };
  }

  function planTable() {
    return {
      ...listTable(plans),
      insert(row: Record<string, unknown>) {
        const withId: Record<string, unknown> = {
          plan_id: row.plan_id ?? randomUUID(),
          created_at: new Date().toISOString(),
          ...row,
        };
        return {
          select() {
            return {
              single() {
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
      ...listTable(audit),
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

  function userAutomationProfilesTable() {
    const rows = automationProfileRow ? [automationProfileRow] : [];
    return listTable(rows);
  }

  function automationProfilesTable() {
    return {
      ...listTable(automationProfiles),
      insert(row: Record<string, unknown>) {
        const withId = {
          profile_id: randomUUID(),
          created_at: new Date().toISOString(),
          activated_at: new Date().toISOString(),
          status: "active",
          ...row,
        };
        return {
          select() {
            return {
              single() {
                automationProfiles.push(withId);
                return Promise.resolve({ data: withId, error: null });
              },
            };
          },
        };
      },
    };
  }

  function automationEventsTable() {
    return {
      insert(row: Record<string, unknown>) {
        return {
          then(resolve: (v: { error: null }) => void) {
            automationEvents.push({ id: randomUUID(), created_at: new Date().toISOString(), ...row });
            resolve({ error: null });
          },
        };
      },
    };
  }

  function ordersTable() {
    return {
      insert(row: Record<string, unknown>) {
        const withId = { id: randomUUID(), created_at: new Date().toISOString(), ...row };
        return {
          select() {
            return {
              single() {
                orders.push(withId);
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
            for (const r of orders) if (filters.every((f) => f(r))) Object.assign(r, patch);
            resolve({ error: null });
          },
        };
        return chain;
      },
    };
  }

  function protocolExitsTable() {
    return {
      insert(row: Record<string, unknown>) {
        const withId = { id: randomUUID(), ...row };
        return {
          select() {
            return {
              maybeSingle() {
                protocolExits.push(withId);
                return Promise.resolve({ data: withId, error: null });
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
      if (name === "user_automation_profiles") return userAutomationProfilesTable();
      if (name === "automation_profiles") return automationProfilesTable();
      if (name === "automation_events") return automationEventsTable();
      if (name === "orders") return ordersTable();
      if (name === "protocol_exits") return protocolExitsTable();
      throw new Error(`unexpected table ${name}`);
    },
  } as unknown as SupabaseClient;

  return { client, plans, audit, automationProfiles, automationEvents, orders, protocolExits };
}

/**
 * Anchored to the real clock, not fixed calendar dates. The reducer checks
 * `expiresAt` against `Date.now()`, so a hardcoded expiry is a time bomb: the
 * original `2026-09-16T13:00:00.000Z` silently turned this suite red on every
 * branch the moment that timestamp passed. Ordering is preserved — the plan is
 * generated an hour ago, walked through its events half an hour ago, and
 * expires a week out — so the test asserts the same pipeline it always did.
 */
const PLAN_GENERATED_AT = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const PLAN_EVENT_AT = new Date(Date.now() - 30 * 60 * 1000).toISOString();
const PLAN_EXPIRES_AT = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

function armedCandidatePlan(overrides: Partial<NewTradePlan> = {}): NewTradePlan {
  return {
    strategyVersion: "1.0.0",
    signalId: "sig-1",
    instrument: "AAPL",
    market: "us_equity",
    // Priced on whatever EXECUTION_TIMEFRAME actually is right now — proving
    // this test tracks the live override rather than assuming "15Min".
    timeframe: EXECUTION_TIMEFRAME,
    generatedAt: PLAN_GENERATED_AT,
    expiresAt: PLAN_EXPIRES_AT,
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

/** Walks a freshly created plan through the real reducer to `armed` — the state the Portfolio Manager queries for. */
async function createArmedPlan(client: SupabaseClient, userId: string, overrides: Partial<NewTradePlan> = {}) {
  const created = await createTradePlan(client, userId, armedCandidatePlan(overrides));
  const at = PLAN_EVENT_AT;
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

describe("Automated Portfolio Manager — real end-to-end pipeline (paper)", () => {
  it("takes an armed plan from a fresh scan all the way to a filled, plan-linked order", async () => {
    const { client, plans, automationProfiles, orders } = fakeSupabase({
      user_id: "user-1",
      is_automation_enabled: true,
      // PASSIVE (0.5% of equity), not MODERATE (1%): at this fixture's $100
      // entry / $3 stop, MODERATE's 1% sizing would put ~33% of paper equity
      // into a single position — over lib/risk/config.ts's
      // MAX_SINGLE_POSITION_ALLOCATION_PCT (25%), which lib/trade/place-
      // order.ts now enforces (checkPositionLimits, wired 2026-09-17
      // orphan-module audit). PASSIVE sizes to ~16.6%, comfortably under the
      // ceiling, without changing what this test is actually checking (the
      // pipeline reaches a filled order), so no other fixture value moves.
      risk_profile: "PASSIVE",
      directional_bias: "BOTH",
      volatility_trigger_type: "DOLLAR_AMOUNT",
      volatility_trigger_value: 1, // this plan's $3 entry-to-stop distance clears it
      execution_mode: "paper",
    });

    const planId = await createArmedPlan(client, "user-1");

    // Confirms the first half of the ask directly: the plan really did reach
    // `armed` through the real lifecycle reducer, priced on EXECUTION_TIMEFRAME.
    const armedRow = plans.find((p) => p.plan_id === planId);
    expect(armedRow?.state).toBe("armed");
    expect(armedRow?.timeframe).toBe(EXECUTION_TIMEFRAME);

    const result = await runAutonomousPortfolioManager(client);

    expect(result.errors).toEqual([]);
    expect(result.profilesEnabled).toBe(1);
    expect(result.plansActivated).toBe(1);
    expect(result.plansSkipped).toBe(0);

    // Confirms the second half: activation created a real automation_profiles
    // row linking this exact plan...
    expect(automationProfiles).toHaveLength(1);
    expect(automationProfiles[0].plan_id).toBe(planId);
    expect(automationProfiles[0].execution_mode).toBe("paper");

    // ...and a real `orders` row was written, filled, and stamped with a
    // non-null source_plan_id pointing back at it — the exact fact the
    // automation-sourced-trade gap (source_plan_id null on every historical
    // order) was about. Not a mock's opinion: place-order.ts's real ledger
    // insert path ran.
    expect(orders).toHaveLength(1);
    expect(orders[0].source_plan_id).toBe(planId);
    expect(orders[0].source_plan_id).not.toBeNull();
    expect(orders[0].status).toBe("filled");
    expect(orders[0].symbol).toBe("AAPL");
    expect(orders[0].side).toBe("buy");
    expect(orders[0].mode).toBe("paper");
  });

  it("skips a candidate whose direction doesn't match the profile's bias, and places no order", async () => {
    const { client, orders } = fakeSupabase({
      user_id: "user-1",
      is_automation_enabled: true,
      risk_profile: "MODERATE",
      directional_bias: "BEARISH_ONLY",
      volatility_trigger_type: "DOLLAR_AMOUNT",
      volatility_trigger_value: 1,
      execution_mode: "paper",
    });

    await createArmedPlan(client, "user-1"); // bullish, per armedCandidatePlan's default

    const result = await runAutonomousPortfolioManager(client);

    expect(result.plansActivated).toBe(0);
    expect(result.plansSkipped).toBe(1);
    expect(orders).toHaveLength(0);
  });

  it("does nothing when no profile has the Portfolio Manager switched on", async () => {
    const { client, orders } = fakeSupabase(null);
    await createArmedPlan(client, "user-1");

    const result = await runAutonomousPortfolioManager(client);

    expect(result.profilesEnabled).toBe(0);
    expect(result.plansActivated).toBe(0);
    expect(orders).toHaveLength(0);
  });

  it("activates the top three armed candidates by Signal Engine tier, best first, and skips the rest", async () => {
    const { client, automationProfiles } = fakeSupabase({
      user_id: "user-1",
      is_automation_enabled: true,
      risk_profile: "PASSIVE",
      directional_bias: "BOTH",
      volatility_trigger_type: "DOLLAR_AMOUNT",
      volatility_trigger_value: 1,
      execution_mode: "paper",
    });

    // Inserted worst-tier-first, on purpose -- the manager must re-rank by
    // tier rather than trust query/insertion order. Four candidates against
    // MAX_NEW_POSITIONS_PER_DAY (3) means exactly one -- the worst one --
    // must be left behind.
    const watchlistPlan = await createArmedPlan(client, "user-1", {
      instrument: "AAA",
      signalId: "sig-watchlist",
      signalFingerprint: "sig-watchlist",
      evidence: {
        regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
        alignment: { score: 40, tier: "watchlistOnly", blueprintScoreBand: "WATCH", breakdown: [] },
        dataTimestamps: {},
        eventLiquidityStatus: "clear",
      },
    });
    const qualifiedPlan = await createArmedPlan(client, "user-1", {
      instrument: "BBB",
      signalId: "sig-qualified",
      signalFingerprint: "sig-qualified",
      evidence: {
        regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
        alignment: { score: 60, tier: "qualified", blueprintScoreBand: "ACTIONABLE", breakdown: [] },
        dataTimestamps: {},
        eventLiquidityStatus: "clear",
      },
    });
    const aTierPlan = await createArmedPlan(client, "user-1", {
      instrument: "CCC",
      signalId: "sig-atier",
      signalFingerprint: "sig-atier",
      // armedCandidatePlan's default evidence.alignment.tier is already "aTier".
    });
    const aPlusPlan = await createArmedPlan(client, "user-1", {
      instrument: "DDD",
      signalId: "sig-aplus",
      signalFingerprint: "sig-aplus",
      evidence: {
        regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
        alignment: { score: 95, tier: "aPlusTier", blueprintScoreBand: "ACTIONABLE", breakdown: [] },
        dataTimestamps: {},
        eventLiquidityStatus: "clear",
      },
    });

    const result = await runAutonomousPortfolioManager(client);

    expect(result.plansActivated).toBe(3);
    expect(result.plansSkipped).toBe(1);

    const activatedPlanIds = automationProfiles.map((p) => p.plan_id);
    expect(activatedPlanIds).toContain(aPlusPlan);
    expect(activatedPlanIds).toContain(aTierPlan);
    expect(activatedPlanIds).toContain(qualifiedPlan);
    expect(activatedPlanIds).not.toContain(watchlistPlan);
  });

  it("stops activating once MAX_NEW_POSITIONS_PER_DAY new positions were already activated today", async () => {
    const { client, automationProfiles } = fakeSupabase({
      user_id: "user-1",
      is_automation_enabled: true,
      risk_profile: "PASSIVE",
      directional_bias: "BOTH",
      volatility_trigger_type: "DOLLAR_AMOUNT",
      volatility_trigger_value: 1,
      execution_mode: "paper",
    });

    // Three prior activations today, from an earlier run -- not this run's
    // own candidate. plan_id doesn't need to match a real trade_plans row for
    // this count; countActivatedToday only reads automation_profiles.
    for (let i = 0; i < 3; i++) {
      automationProfiles.push({
        profile_id: `existing-${i}`,
        user_id: "user-1",
        plan_id: `existing-plan-${i}`,
        automation_mode: "system_plan",
        execution_mode: "paper",
        status: "active",
        created_at: new Date().toISOString(),
        activated_at: new Date().toISOString(),
      });
    }

    await createArmedPlan(client, "user-1");

    const result = await runAutonomousPortfolioManager(client);

    expect(result.plansActivated).toBe(0);
    expect(result.plansSkipped).toBe(1);
    expect(result.errors[0]?.reason).toMatch(/already activated 3 new position\(s\) today/);
    // Only the three pre-seeded rows -- nothing new got activated.
    expect(automationProfiles).toHaveLength(3);
  });
});
