import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateLiveCircuitBreaker } from "@/lib/risk/service";

interface Snapshot {
  equity: number;
  verified: boolean;
  recorded_at: string;
}

interface Prior {
  state: string;
  triggered_at: string;
}

function makeSupabase(opts: { snapshots: Snapshot[]; priorState: Prior | null }) {
  const inserted: Record<string, unknown>[] = [];
  const auditInserts: Record<string, unknown>[] = [];
  const stateUpserts: Record<string, unknown>[] = [];
  const stateUpdates: Record<string, unknown>[] = [];

  const snapshotsTable = {
    select: () => {
      const builder = {
        eq: () => builder,
        gte: () => builder,
        // The throttle check ends in .limit(1); always answer "nothing recent".
        limit: () => Promise.resolve({ data: [], error: null }),
        // The history read ends in .order(...); answer the fixture's samples.
        order: () => Promise.resolve({ data: opts.snapshots, error: null }),
      };
      return builder;
    },
    insert: (obj: Record<string, unknown>) => {
      inserted.push(obj);
      return Promise.resolve({ error: null });
    },
  };

  const circuitStateTable = {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: opts.priorState }),
      }),
    }),
    upsert: (obj: Record<string, unknown>) => {
      stateUpserts.push(obj);
      return Promise.resolve({ error: null });
    },
    update: (obj: Record<string, unknown>) => ({
      eq: () => {
        stateUpdates.push(obj);
        return Promise.resolve({ error: null });
      },
    }),
  };

  const auditTable = {
    insert: (obj: Record<string, unknown>) => {
      auditInserts.push(obj);
      return Promise.resolve({ error: null });
    },
  };

  const policyValuesTable = {
    // No override rows configured — getRiskPolicy falls back to code defaults.
    select: () => ({
      eq: () => ({
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  };

  const tables: Record<string, unknown> = {
    risk_live_equity_snapshots: snapshotsTable,
    risk_circuit_state: circuitStateTable,
    risk_circuit_audit_log: auditTable,
    policy_values: policyValuesTable,
  };

  return {
    client: { from: (t: string) => tables[t] } as unknown as SupabaseClient,
    inserted,
    auditInserts,
    stateUpserts,
    stateUpdates,
  };
}

describe("evaluateLiveCircuitBreaker", () => {
  it("resolves normal and writes the first-ever state + audit row for a brand-new account", async () => {
    const s = makeSupabase({ snapshots: [], priorState: null });
    const result = await evaluateLiveCircuitBreaker(
      s.client,
      "u1",
      450,
      true,
      0,
      new Date("2026-08-28T14:00:00Z"),
    );
    expect(result.decision.state).toBe("normal");
    expect(s.stateUpserts).toHaveLength(1);
    expect(s.stateUpserts[0]).toMatchObject({ profile_id: "u1", state: "normal" });
    expect(s.auditInserts).toHaveLength(1);
    expect(s.auditInserts[0]).toMatchObject({ profile_id: "u1", prior_state: null, new_state: "normal" });
  });

  it("computes a 48h loss from snapshot history and transitions into warning", async () => {
    const now = new Date("2026-08-22T14:00:00Z");
    const s = makeSupabase({
      snapshots: [
        { equity: 450, verified: true, recorded_at: "2026-08-20T14:00:00Z" },
      ],
      priorState: { state: "normal", triggered_at: "2026-08-15T14:00:00Z" },
    });
    // 450 -> 436.5 is a 3% loss over the trailing 48h — soft_cooldown territory.
    const result = await evaluateLiveCircuitBreaker(s.client, "u1", 436.5, true, 0, now);
    expect(result.loss48hPct).toBeCloseTo(3, 6);
    expect(result.decision.state).toBe("soft_cooldown");
    expect(s.stateUpserts[0]).toMatchObject({ state: "soft_cooldown" });
    expect(s.auditInserts[0]).toMatchObject({ prior_state: "normal", new_state: "soft_cooldown" });
  });

  it("does not write a new audit row when the state hasn't changed", async () => {
    const now = new Date("2026-08-22T14:00:00Z");
    const s = makeSupabase({
      snapshots: [{ equity: 450, verified: true, recorded_at: "2026-08-21T14:00:00Z" }],
      priorState: { state: "normal", triggered_at: "2026-08-15T14:00:00Z" },
    });
    const result = await evaluateLiveCircuitBreaker(s.client, "u1", 455, true, 0, now);
    expect(result.decision.state).toBe("normal");
    expect(s.stateUpserts).toHaveLength(0);
    expect(s.auditInserts).toHaveLength(0);
    expect(s.stateUpdates).toHaveLength(1); // reason refreshed in place
  });

  it("marks source-data confidence as estimate when the equity read wasn't verified", async () => {
    const s = makeSupabase({ snapshots: [], priorState: null });
    const result = await evaluateLiveCircuitBreaker(s.client, "u1", 450, false, 0, new Date("2026-08-28T14:00:00Z"));
    expect(result.sourceDataConfidence).toBe("estimate");
  });
});
