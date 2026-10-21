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

// Entry confirmation on closed bars (owner decision 4, and automation under
// the same rules as every other path) reads live bars. This file tests the
// plumbing after it, so it reports a confirmed entry unless a test says not.
const confirmNow = vi.hoisted(() => ({ ready: true, calls: [] as unknown[] }));
vi.mock("@/lib/lifecycle/confirmNow", () => ({
  readEntryConfirmationNow: vi.fn(async (args: unknown) => {
    confirmNow.calls.push(args);
    return confirmNow.ready
      ? { ready: true, stage: "confirmed", note: "confirmed" }
      : { ready: false, stage: "touched", note: "Price reached the entry level but hasn't closed through it yet." };
  }),
}));
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
  STARTING_CASH: 100_000,
  assetClassOf: () => "us_equity",
  getOrCreateAccount: vi.fn().mockResolvedValue({ cash: 100_000 }),
  getOpenPosition: vi.fn().mockResolvedValue(null),
  listOpenPositions: vi.fn().mockResolvedValue([]),
  listWorkingPaperEntries: vi.fn().mockResolvedValue([]),
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
import { isTriggered } from "@/lib/brokers/simulator";

/**
 * In-memory fake covering every table the real code touches on this path:
 * trade_plans/trade_plan_audit (lib/lifecycle/store.ts, same shape
 * lib/automation/__tests__/stop-out.test.ts already exercises),
 * user_automation_profiles (the Portfolio Manager's own enabled-profile
 * query), automation_profiles/automation_events (lib/automation/service.ts),
 * and orders/protocol_exits (lib/trade/place-order.ts's paper ledger write).
 */
function fakeSupabase(automationProfileRow: Record<string, unknown> | null, prefs: unknown = null) {
  const plans: Record<string, unknown>[] = [];
  const audit: Record<string, unknown>[] = [];
  const automationProfiles: Record<string, unknown>[] = [];
  const automationEvents: Record<string, unknown>[] = [];
  const orders: Record<string, unknown>[] = [];
  const protocolExits: Record<string, unknown>[] = [];

  // `project` returns only the columns a select names, the way Postgres
  // does, so a query that leaves a column out cannot read it here either.
  function listTable(rows: Record<string, unknown>[], project = false) {
    return {
      select(columns?: string) {
        const filters: ((row: Record<string, unknown>) => boolean)[] = [];
        const names = project && columns && columns !== "*" ? columns.split(",").map((c) => c.trim()) : null;
        const shape = (r: Record<string, unknown>) => (names ? Object.fromEntries(names.map((n) => [n, r[n]])) : r);
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
            return Promise.resolve({ data: matched[0] ? shape(matched[0]) : null, error: null });
          },
          single() {
            const matched = rows.filter((r) => filters.every((f) => f(r)));
            return Promise.resolve(
              matched[0] ? { data: shape(matched[0]), error: null } : { data: null, error: { message: "not found" } },
            );
          },
          then(resolve: (v: { data: Record<string, unknown>[]; error: null }) => void) {
            resolve({ data: rows.filter((r) => filters.every((f) => f(r))).map(shape), error: null });
          },
        };
        return chain;
      },
    };
  }

  function planTable() {
    return {
      ...listTable(plans, true),
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
          // The lifecycle store's compare-and-set reads back what it wrote (R-015).
          select() {
            const hit = plans.filter((r) => filters.every((f) => f(r)));
            for (const r of hit) Object.assign(r, patch);
            return Promise.resolve({ data: hit.map((r) => ({ plan_id: r.plan_id })), error: null });
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
      ...listTable(automationEvents),
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
      if (name === "settings") {
        // No stored preferences unless a test passes some: rule defaults apply.
        const q = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: prefs ? { prefs } : null, error: null }) };
        return q;
      }
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
      // PASSIVE (0.5% of equity) sizes to ~16.6% of paper equity, under
      // Novice's 25% single-position ceiling (checkPositionLimits) for
      // whichever tier this fixture resolves to.
      risk_profile: "PASSIVE",
      directional_bias: "BOTH",
      volatility_trigger_type: "DOLLAR_AMOUNT",
      volatility_trigger_value: 1, // this plan's $3 entry-to-stop distance clears it
      execution_mode: "paper",
    });

    const planId = await createArmedPlan(client, "user-1");
    // The reaction has come (a closed bar traded into the buying zone, which
    // the mocked confirmation reports), so the buy goes at the market.
    vi.mocked(isTriggered).mockReturnValue(true);

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
    // Automation is held to the same confirmation rule as every other entry,
    // judged on its plan's own trigger over the bars since the plan was made.
    expect(confirmNow.calls.at(-1)).toMatchObject({ symbol: "AAPL", direction: "bullish" });
    // Gann's reaction rule: judged on the plan's entry and its stop, and since
    // never-failing rule 9 the order goes at the market, with the plan's entry
    // kept on the row to measure the fill against.
    expect(confirmNow.calls.at(-1)).toMatchObject({ entryTrigger: 100, stopPrice: 97 });
    expect(orders[0].limit_price).toBeNull();
    expect(orders[0].requested_limit_price).toBe(100);
    expect((confirmNow.calls.at(-1) as { since?: string }).since).toBeTruthy();
  });

  it("reads an old-level plan as resting at its level, not as a crossing (PLAN.md item 5, step 2)", async () => {
    // A double bottom at 99.50, just under the round number 100. The level is
    // the entry itself, close enough to 100 that the round-number check lets
    // it through. Read as a crossing, the level would come back as 98.26 and
    // the order would be held.
    const { client, orders } = fakeSupabase({
      user_id: "user-1",
      is_automation_enabled: true,
      risk_profile: "PASSIVE",
      directional_bias: "BOTH",
      volatility_trigger_type: "DOLLAR_AMOUNT",
      volatility_trigger_value: 1,
      execution_mode: "paper",
    });
    const base = armedCandidatePlan().coordinates;
    await createArmedPlan(client, "user-1", { coordinates: { ...base, entryTrigger: 99.5, invalidation: 94.55, entryKind: "oldLevel" } });
    vi.mocked(isTriggered).mockReturnValue(false);
    const result = await runAutonomousPortfolioManager(client);
    expect(result.errors).toEqual([]);
    expect(orders).toHaveLength(1);
    expect(orders[0].requested_limit_price).toBe(99.5);
    expect(orders[0].limit_price).toBeNull();
    expect(confirmNow.calls.at(-1)).toMatchObject({ entryKind: "oldLevel", stopPrice: 94.55 });
  });

  it("reads a held-bottom plan as resting at its entry, not as a crossing (PLAN.md item 5, step 4)", async () => {
    // As for the old level: the entry 99.50 is close enough to 100 to pass the
    // round-number check. Read as a crossing it would come back as 98.26.
    const { client, orders } = fakeSupabase({
      user_id: "user-1",
      is_automation_enabled: true,
      risk_profile: "PASSIVE",
      directional_bias: "BOTH",
      volatility_trigger_type: "DOLLAR_AMOUNT",
      volatility_trigger_value: 1,
      execution_mode: "paper",
    });
    const base = armedCandidatePlan().coordinates;
    await createArmedPlan(client, "user-1", { coordinates: { ...base, entryTrigger: 99.5, invalidation: 94.55, entryKind: "hold" } });
    vi.mocked(isTriggered).mockReturnValue(false);
    const result = await runAutonomousPortfolioManager(client);
    expect(result.errors).toEqual([]);
    expect(orders).toHaveLength(1);
    expect(orders[0].requested_limit_price).toBe(99.5);
    expect(orders[0].limit_price).toBeNull();
    expect(confirmNow.calls.at(-1)).toMatchObject({ entryKind: "hold", stopPrice: 94.55 });
  });

  it("rests no limit: a confirmed entry fills at the market (never-failing rule 9)", async () => {
    const { client, orders } = fakeSupabase({
      user_id: "user-1",
      is_automation_enabled: true,
      risk_profile: "PASSIVE",
      directional_bias: "BOTH",
      volatility_trigger_type: "DOLLAR_AMOUNT",
      volatility_trigger_value: 1,
      execution_mode: "paper",
    });
    await createArmedPlan(client, "user-1");
    vi.mocked(isTriggered).mockReset().mockReturnValue(false);
    await runAutonomousPortfolioManager(client);
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("filled");
    expect(orders[0].limit_price).toBeNull();
    expect(vi.mocked(isTriggered)).not.toHaveBeenCalled();
  });

  it("places nothing for an armed plan whose entry hasn't confirmed on the bars", async () => {
    const { client, orders } = fakeSupabase({
      user_id: "user-1",
      is_automation_enabled: true,
      risk_profile: "PASSIVE",
      directional_bias: "BOTH",
      volatility_trigger_type: "DOLLAR_AMOUNT",
      volatility_trigger_value: 1,
      execution_mode: "paper",
    });
    await createArmedPlan(client, "user-1");
    confirmNow.ready = false;
    try {
      await runAutonomousPortfolioManager(client);
      expect(orders).toHaveLength(0);
    } finally {
      confirmNow.ready = true;
    }
  });

  it("places a resting entry on the later pass that finds it confirmed, and only once", async () => {
    const { client, orders, automationProfiles, automationEvents } = fakeSupabase({
      user_id: "user-1",
      is_automation_enabled: true,
      risk_profile: "PASSIVE",
      directional_bias: "BOTH",
      volatility_trigger_type: "DOLLAR_AMOUNT",
      volatility_trigger_value: 1,
      execution_mode: "paper",
    });
    await createArmedPlan(client, "user-1");
    vi.mocked(isTriggered).mockReturnValue(true);
    confirmNow.ready = false;
    try {
      const first = await runAutonomousPortfolioManager(client);
      expect(first.plansActivated).toBe(1);
      expect(orders).toHaveLength(0);
      expect(automationProfiles[0].status).toBe("active");
      const refusals = () => automationEvents.filter((e) => e.kind === "broker_order_rejected").length;
      expect(refusals()).toBe(1);

      // Still waiting: nothing placed, and the same refusal isn't logged again.
      const second = await runAutonomousPortfolioManager(client);
      expect(second.plansActivated).toBe(0);
      expect(second.restingOrdersPlaced).toBe(0);
      expect(orders).toHaveLength(0);
      expect(refusals()).toBe(1);

      // The reaction came: the same activation's order goes in.
      confirmNow.ready = true;
      const third = await runAutonomousPortfolioManager(client);
      expect(third.restingOrdersPlaced).toBe(1);
      expect(orders).toHaveLength(1);
      expect(automationEvents.some((e) => e.kind === "broker_order_submitted")).toBe(true);

      // Never a second order from the same activation.
      const fourth = await runAutonomousPortfolioManager(client);
      expect(fourth.restingOrdersPlaced).toBe(0);
      expect(orders).toHaveLength(1);
    } finally {
      confirmNow.ready = true;
    }
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

  it("opens nothing new while the trader's away window is open (A-EXIT-05)", async () => {
    const soon = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const { client, orders } = fakeSupabase(
      {
        user_id: "user-1",
        is_automation_enabled: true,
        risk_profile: "MODERATE",
        directional_bias: "BOTH",
        volatility_trigger_type: "DOLLAR_AMOUNT",
        volatility_trigger_value: 1,
        execution_mode: "paper",
      },
      { gannRules: { awayFrom: soon } },
    );

    await createArmedPlan(client, "user-1");

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

  it("activates every armed candidate, best Signal Engine tier first", async () => {
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
    // tier rather than trust query/insertion order. There is no daily count
    // (Q8; removed 2026-10-21), so all four go ahead.
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

    expect(result.plansActivated).toBe(4);
    expect(result.plansSkipped).toBe(0);

    const activatedPlanIds = automationProfiles.map((p) => p.plan_id);
    expect(activatedPlanIds).toEqual([aPlusPlan, aTierPlan, qualifiedPlan, watchlistPlan]);
  });

  it("keeps no daily count: a fourth activation the same day still goes ahead", async () => {
    const { client, automationProfiles } = fakeSupabase({
      user_id: "user-1",
      is_automation_enabled: true,
      risk_profile: "PASSIVE",
      directional_bias: "BOTH",
      volatility_trigger_type: "DOLLAR_AMOUNT",
      volatility_trigger_value: 1,
      execution_mode: "paper",
    });

    // Three prior activations today, from an earlier run. The manager used to
    // stop at three a day; Gann's capital rules now decide how many open.
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

    expect(result.plansActivated).toBe(1);
    expect(result.plansSkipped).toBe(0);
    expect(automationProfiles).toHaveLength(4);
  });
});
