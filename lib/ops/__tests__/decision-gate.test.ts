import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDecisionGateReport, median } from "@/lib/ops/decision-gate";

const NOW = new Date("2026-10-21T20:00:00Z");
const OLD = "2026-08-01T00:00:00Z";
const RECENT = "2026-10-15T00:00:00Z";

function table(rows: unknown[], count?: number) {
  const result = Promise.resolve({ data: rows, error: null, count: count ?? rows.length });
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "gte", "eq", "not", "limit"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => result.then(resolve);
  return chain;
}

function fake(): SupabaseClient {
  const tables: Record<string, unknown[]> = {
    profiles: [
      { id: "a", created_at: OLD, is_demo: false, stripe_subscription_id: "sub_1" },
      { id: "b", created_at: OLD, is_demo: false, stripe_subscription_id: null },
      { id: "c", created_at: RECENT, is_demo: false, stripe_subscription_id: null },
      { id: "demo", created_at: OLD, is_demo: true, stripe_subscription_id: null },
    ],
    orders: [
      { user_id: "a", status: "filled" },
      { user_id: "demo", status: "filled" },
    ],
    shadow_signals: [{ r_multiple: 1.5 }, { r_multiple: -1 }, { r_multiple: "0.5" }],
    notification_deliveries: [{ created_at: RECENT, updated_at: "2026-10-15T00:00:02Z" }],
  };
  return {
    from: (name: string) => table(tables[name] ?? [], name === "notification_deliveries" ? 4 : undefined),
    auth: {
      admin: {
        listUsers: () =>
          Promise.resolve({
            data: { users: [{ id: "a", last_sign_in_at: OLD }, { id: "c", last_sign_in_at: RECENT }] },
            error: null,
          }),
      },
    },
  } as unknown as SupabaseClient;
}

describe("buildDecisionGateReport", () => {
  it("reads retention, adoption, paying users, signal and delivery from the product's own rows", async () => {
    const r = await buildDecisionGateReport(fake(), NOW);
    expect(r.members).toBe(3); // demo left out
    expect(r.active30).toBe(2); // a by order, c by sign-in
    expect(r.cohort).toBe(2);
    expect(r.cohortActive).toBe(1);
    expect(r.firstCohortRetentionPct).toBe(50);
    expect(r.activeTraders).toBe(1);
    expect(r.featureAdoptionPct).toBe(50);
    expect(r.payingUsers).toBe(1);
    expect(r.signal).toMatchObject({ evaluated: 3, winRatePct: 66.7, averageR: 0.333 });
    expect(r.delivery).toMatchObject({ recorded: 4, sent: 1, sentPct: 25, medianLatencySeconds: 2 });
  });
});

describe("median", () => {
  it("averages the middle pair of an even count", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
