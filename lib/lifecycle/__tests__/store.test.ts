import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const recordTradePlanRegime = vi.fn();
vi.mock("@/lib/learning/record", () => ({
  recordTradePlanRegime: (...args: unknown[]) => recordTradePlanRegime(...args),
}));

import {
  applyEventAndPersist,
  createOrGetIdempotentTradePlan,
  createTradePlan,
  getTradePlan,
  listTradePlans,
  type NewTradePlan,
} from "@/lib/lifecycle/store";
import { freshEntryConfirmation } from "@/lib/lifecycle/entryConfirmation";

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * Minimal in-memory fake covering exactly the query shapes
 * lib/lifecycle/store.ts issues against trade_plans and trade_plan_audit.
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
          // The lifecycle store's compare-and-set reads back what it wrote (R-015).
          select() {
            const hit = rows.filter((r) => filters.every((f) => f(r)));
            for (const r of hit) Object.assign(r, patch);
            return Promise.resolve({ data: hit.map((r) => ({ plan_id: r.plan_id })), error: null });
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
    timeframe: "1Day",
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
      alignment: { score: 82, tier: "aTier", blueprintScoreBand: "ACTIONABLE", breakdown: [] },
      dataTimestamps: {},
      eventLiquidityStatus: "clear",
    },
    ...overrides,
  };
}

describe("createTradePlan / getTradePlan", () => {
  it("round-trips a new plan at watchlist with no audit rows", async () => {
    const { client } = fakeSupabase();
    const created = await createTradePlan(client, "user-1", newPlan());
    expect(created.state).toBe("watchlist");
    expect(created.version).toBe(0);
    expect(created.audit).toEqual([]);

    const fetched = await getTradePlan(client, "user-1", created.planId);
    expect(fetched).not.toBeNull();
    expect(fetched?.instrument).toBe("AAPL");
    expect(fetched?.coordinates.masterProfit).toBe(110);
  });

  it("stores an old-level plan's kind, and writes no kind column for a crossing", async () => {
    const { client, plans } = fakeSupabase();
    const base = newPlan().coordinates;
    const old = await createTradePlan(client, "user-1", newPlan({ coordinates: { ...base, entryKind: "oldLevel" } }));
    expect((await getTradePlan(client, "user-1", old.planId))?.coordinates.entryKind).toBe("oldLevel");
    const crossing = await createTradePlan(client, "user-1", newPlan({ signalFingerprint: "sig-2" }));
    expect((await getTradePlan(client, "user-1", crossing.planId))?.coordinates.entryKind).toBeUndefined();
    expect(plans.find((r) => r.plan_id === crossing.planId)).not.toHaveProperty("entry_kind");
    expect(plans.find((r) => r.plan_id === old.planId)?.entry_kind).toBe("oldLevel");
  });

  it("stores a held-bottom plan's kind (PLAN.md item 5, step 4)", async () => {
    const { client, plans } = fakeSupabase();
    const base = newPlan().coordinates;
    const held = await createTradePlan(client, "user-1", newPlan({ coordinates: { ...base, entryKind: "hold" } }));
    expect((await getTradePlan(client, "user-1", held.planId))?.coordinates.entryKind).toBe("hold");
    expect(plans.find((r) => r.plan_id === held.planId)?.entry_kind).toBe("hold");
  });

  it("gives the new plan's regime a second home in trend_state", async () => {
    const { client } = fakeSupabase();
    const created = await createTradePlan(client, "user-1", newPlan());

    expect(recordTradePlanRegime).toHaveBeenCalledTimes(1);
    expect(recordTradePlanRegime).toHaveBeenCalledWith("user-1", expect.objectContaining({ planId: created.planId }));
  });

  it("returns null for a plan belonging to another user", async () => {
    const { client } = fakeSupabase();
    const created = await createTradePlan(client, "user-1", newPlan());
    const fetched = await getTradePlan(client, "user-2", created.planId);
    expect(fetched).toBeNull();
  });
});

describe("createOrGetIdempotentTradePlan", () => {
  it("returns a plan stored under the rules version's name before migration 0128, not a second one", async () => {
    const { client, plans } = fakeSupabase();
    const raw = "2026-10-28-plan-at-close-on-plan-expiry";
    // Written before the change: the name, not the label.
    plans.push({
      plan_id: "old-plan", user_id: "user-1", instrument: "AAPL", timeframe: "1Day",
      strategy_version: raw, signal_fingerprint: "sig-1", state: "watchlist", version: 0,
      created_at: "2026-10-27T13:00:00.000Z", coordinates: newPlan().coordinates,
      risk: newPlan().risk, evidence: newPlan().evidence, entry_confirmation: freshEntryConfirmation(),
    });
    const out = await createOrGetIdempotentTradePlan(client, "user-1", newPlan({ strategyVersion: raw }));
    expect(out.created).toBe(false);
    expect(out.plan.planId).toBe("old-plan");
    expect(plans).toHaveLength(1);
  });

  it("inserts under the label when no named twin exists", async () => {
    const { client, plans } = fakeSupabase();
    const out = await createOrGetIdempotentTradePlan(
      client, "user-1", newPlan({ strategyVersion: "2026-10-28-plan-at-close-on-plan-expiry" }),
    );
    expect(out.created).toBe(true);
    expect(plans[0].strategy_version).toBe("2026-10-28 · oly33");
  });
});

describe("listTradePlans", () => {
  it("filters by state", async () => {
    const { client } = fakeSupabase();
    await createTradePlan(client, "user-1", newPlan({ signalId: "a" }));
    await createTradePlan(client, "user-1", newPlan({ signalId: "b" }));

    const all = await listTradePlans(client, "user-1");
    expect(all).toHaveLength(2);

    const none = await listTradePlans(client, "user-1", { state: "runner" });
    expect(none).toHaveLength(0);
  });
});

describe("applyEventAndPersist", () => {
  it("advances the plan and writes exactly one audit row", async () => {
    const { client, audit } = fakeSupabase();
    const created = await createTradePlan(client, "user-1", newPlan());

    const result = await applyEventAndPersist(client, "user-1", created.planId, {
      type: "qualify",
      at: "2026-08-29T14:00:00.000Z",
      reason: "gates passed",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.plan.state).toBe("qualified");
    expect(audit).toHaveLength(1);

    const persisted = await getTradePlan(client, "user-1", created.planId);
    expect(persisted?.state).toBe("qualified");
    expect(persisted?.audit).toHaveLength(1);
    expect(persisted?.audit[0].toState).toBe("qualified");
  });

  it("does not write an audit row for mark_price", async () => {
    const { client, audit } = fakeSupabase();
    const created = await createTradePlan(client, "user-1", newPlan());

    const result = await applyEventAndPersist(client, "user-1", created.planId, {
      type: "mark_price",
      at: "2026-08-29T14:00:00.000Z",
      price: 101,
    });
    expect(result.ok).toBe(true);
    expect(audit).toHaveLength(0);

    const persisted = await getTradePlan(client, "user-1", created.planId);
    expect(persisted?.highWater).toBe(101);
  });

  // R-015: two passes acting on one plan at once. The second write finds the
  // version it read has moved, re-reads, and applies its event on top.
  it("re-reads and re-applies when another pass wrote the plan first", async () => {
    const { client, plans } = fakeSupabase();
    const created = await createTradePlan(client, "user-1", newPlan());
    let raced = false;
    const racing = {
      from(name: string) {
        const table = (client as unknown as { from: (n: string) => Record<string, unknown> }).from(name);
        if (name !== "trade_plans" || raced) return table;
        return {
          ...table,
          update(patch: Record<string, unknown>) {
            // Another pass wrote first: the row moved on a version.
            raced = true;
            const row = plans.find((r) => r.plan_id === created.planId)!;
            row.version = Number(row.version) + 1;
            return (table.update as (p: Record<string, unknown>) => unknown)(patch);
          },
        };
      },
    } as unknown as SupabaseClient;

    const result = await applyEventAndPersist(racing, "user-1", created.planId, {
      type: "qualify",
      at: "2026-08-29T14:00:00.000Z",
      reason: "gates passed",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.plan.version).toBe(2);
    const persisted = await getTradePlan(client, "user-1", created.planId);
    expect(persisted?.state).toBe("qualified");
    expect(persisted?.version).toBe(2);
  });

  it("returns not_found for a nonexistent plan", async () => {
    const { client } = fakeSupabase();
    const result = await applyEventAndPersist(client, "user-1", randomUUID(), {
      type: "qualify",
      at: "t",
      reason: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not_found");
  });

  it("rejects an invalid transition without writing anything", async () => {
    const { client, audit } = fakeSupabase();
    const created = await createTradePlan(client, "user-1", newPlan());

    const result = await applyEventAndPersist(client, "user-1", created.planId, {
      type: "enter",
      at: "t",
      fillPrice: 100,
      cooldownBlocksNewEntry: false,
    });
    expect(result.ok).toBe(false);
    expect(audit).toHaveLength(0);

    const persisted = await getTradePlan(client, "user-1", created.planId);
    expect(persisted?.state).toBe("watchlist");
  });
});
