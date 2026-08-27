import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateMonitor, FAIR_USE_MAX_ACTIVE_MONITORS } from "@/lib/entitlements/monitor-store";

/**
 * Minimal in-memory fake covering exactly the query shapes
 * lib/entitlements/monitor-store.ts issues against active_monitors and
 * monitor_transitions -- enough to exercise its real branching (existing
 * vs. new monitor, cooldown lookback, capacity count, idempotent transition
 * insert) without a live database.
 */
function fakeStore() {
  const monitors: Record<string, unknown>[] = [];
  const transitions: Record<string, unknown>[] = [];

  function activeMonitorsTable() {
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
            const rows = monitors.filter((r) => filters.every((f) => f(r)));
            return Promise.resolve({ data: rows[0] ?? null, error: null });
          },
          // count query: `.select("id", { count: "exact", head: true })`
          then(resolve: (v: { count: number; error: null }) => void) {
            const rows = monitors.filter((r) => filters.every((f) => f(r)));
            resolve({ count: rows.length, error: null });
          },
        };
        return chain;
      },
      insert(row: Record<string, unknown>) {
        // Partial unique index: profile_id+symbol among open states.
        const conflict = monitors.some(
          (m) =>
            m.profile_id === row.profile_id &&
            m.symbol === row.symbol &&
            (m.state === "WATCH" || m.state === "EXECUTE"),
        );
        return {
          select() {
            return {
              single() {
                if (conflict) {
                  return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } });
                }
                const inserted = { id: randomUUID(), created_at: new Date().toISOString(), ...row };
                monitors.push(inserted);
                return Promise.resolve({ data: { id: inserted.id }, error: null });
              },
            };
          },
        };
      },
      update(patch: Record<string, unknown>) {
        return {
          eq(_col: string, id: string) {
            const row = monitors.find((m) => m.id === id);
            if (row) Object.assign(row, patch);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    };
  }

  function monitorTransitionsTable() {
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
            const rows = transitions
              .filter((r) => filters.every((f) => f(r)))
              .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
            return Promise.resolve({ data: rows[0] ?? null, error: null });
          },
        };
        return chain;
      },
      insert(row: Record<string, unknown>) {
        return {
          select() {
            return {
              single() {
                if (transitions.some((t) => t.transition_key === row.transition_key)) {
                  return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } });
                }
                const inserted = { occurred_at: new Date().toISOString(), ...row, id: randomUUID() };
                transitions.push(inserted);
                return Promise.resolve({ data: { id: inserted.id }, error: null });
              },
            };
          },
        };
      },
    };
  }

  const client = {
    from(table: string) {
      if (table === "active_monitors") return activeMonitorsTable();
      if (table === "monitor_transitions") return monitorTransitionsTable();
      throw new Error(`fakeStore: unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, monitors, transitions };
}

describe("evaluateMonitor", () => {
  it("creates a new monitor for a first-time symbol without a transition or notification", async () => {
    const { client, monitors, transitions } = fakeStore();
    const result = await evaluateMonitor(client, {
      profileId: "p1",
      symbol: "aapl",
      source: "manual_dashboard",
      candidateState: "WATCH",
      evaluationId: "exec-1",
      maxActiveWatchMonitors: 15,
    });

    expect(result).toMatchObject({ outcome: "applied", transitionId: null, notify: false });
    expect(monitors).toHaveLength(1);
    expect(monitors[0]).toMatchObject({ symbol: "AAPL", state: "WATCH" });
    expect(transitions).toHaveLength(0);
  });

  it("transitions an existing WATCH monitor to EXECUTE and reports notify:true", async () => {
    const { client, transitions } = fakeStore();
    await evaluateMonitor(client, {
      profileId: "p1",
      symbol: "AAPL",
      source: "manual_dashboard",
      candidateState: "WATCH",
      evaluationId: "exec-1",
      maxActiveWatchMonitors: 15,
      now: new Date("2026-08-26T14:00:00Z"),
    });

    const result = await evaluateMonitor(client, {
      profileId: "p1",
      symbol: "AAPL",
      source: "manual_dashboard",
      candidateState: "EXECUTE",
      evaluationId: "exec-2",
      maxActiveWatchMonitors: 15,
      now: new Date("2026-08-26T14:05:00Z"),
    });

    expect(result.outcome).toBe("applied");
    expect(result).toMatchObject({ notify: true });
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ prior_state: "WATCH", new_state: "EXECUTE" });
  });

  it("is idempotent: replaying the same evaluationId does not double-insert a transition", async () => {
    const { client, transitions } = fakeStore();
    await evaluateMonitor(client, {
      profileId: "p1",
      symbol: "AAPL",
      source: "manual_dashboard",
      candidateState: "WATCH",
      evaluationId: "exec-1",
      maxActiveWatchMonitors: 15,
      now: new Date("2026-08-26T14:00:00Z"),
    });

    const first = await evaluateMonitor(client, {
      profileId: "p1",
      symbol: "AAPL",
      source: "manual_dashboard",
      candidateState: "EXECUTE",
      evaluationId: "exec-2",
      maxActiveWatchMonitors: 15,
      now: new Date("2026-08-26T14:05:00Z"),
    });

    // A retry with the same evaluationId + candidateState -- the monitor is
    // already at EXECUTE, so this hits the "no state change" path (not a
    // transition-key replay), which is itself idempotent by construction.
    const retry = await evaluateMonitor(client, {
      profileId: "p1",
      symbol: "AAPL",
      source: "manual_dashboard",
      candidateState: "EXECUTE",
      evaluationId: "exec-2",
      maxActiveWatchMonitors: 15,
      now: new Date("2026-08-26T14:06:00Z"),
    });

    expect(first).toMatchObject({ outcome: "applied", notify: true });
    expect(retry).toMatchObject({ outcome: "applied", transitionId: null, notify: false });
    expect(transitions).toHaveLength(1);
  });

  it("suppresses a WATCH -> EXECUTE flap inside the cooldown window", async () => {
    const { client } = fakeStore();
    const t0 = new Date("2026-08-26T14:00:00Z");
    await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "WATCH", evaluationId: "e0", maxActiveWatchMonitors: 15, now: t0,
    });
    await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "EXECUTE", evaluationId: "e1", maxActiveWatchMonitors: 15,
      now: new Date(t0.getTime() + 60_000), cooldownMs: 15 * 60_000,
    });
    await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "WATCH", evaluationId: "e2", maxActiveWatchMonitors: 15,
      now: new Date(t0.getTime() + 120_000), cooldownMs: 15 * 60_000,
    });

    const flap = await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "EXECUTE", evaluationId: "e3", maxActiveWatchMonitors: 15,
      now: new Date(t0.getTime() + 180_000), // 2 minutes after leaving EXECUTE
      cooldownMs: 15 * 60_000,
    });

    expect(flap).toEqual({ outcome: "skipped", reason: "cooldown" });
  });

  it("reports capacity_exceeded rather than creating a monitor past the plan's limit", async () => {
    const { client, monitors } = fakeStore();
    await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "WATCH", evaluationId: "e0", maxActiveWatchMonitors: 1,
    });

    const result = await evaluateMonitor(client, {
      profileId: "p1", symbol: "TSLA", source: "manual_dashboard",
      candidateState: "WATCH", evaluationId: "e1", maxActiveWatchMonitors: 1,
    });

    expect(result).toEqual({ outcome: "capacity_exceeded" });
    expect(monitors).toHaveLength(1);
  });

  it("does not enforce capacity for a plan with unlimited monitors", async () => {
    const { client } = fakeStore();
    await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "WATCH", evaluationId: "e0", maxActiveWatchMonitors: "unlimited",
    });
    const result = await evaluateMonitor(client, {
      profileId: "p1", symbol: "TSLA", source: "manual_dashboard",
      candidateState: "WATCH", evaluationId: "e1", maxActiveWatchMonitors: "unlimited",
    });
    expect(result.outcome).toBe("applied");
  });

  it("persists the suppression reason on the monitor row for a cooldown-suppressed flap", async () => {
    const { client, monitors } = fakeStore();
    const t0 = new Date("2026-08-26T14:00:00Z");
    await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "WATCH", evaluationId: "e0", maxActiveWatchMonitors: 15, now: t0,
    });
    await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "EXECUTE", evaluationId: "e1", maxActiveWatchMonitors: 15,
      now: new Date(t0.getTime() + 60_000), cooldownMs: 15 * 60_000,
    });
    await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "WATCH", evaluationId: "e2", maxActiveWatchMonitors: 15,
      now: new Date(t0.getTime() + 120_000), cooldownMs: 15 * 60_000,
    });

    const flap = await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "EXECUTE", evaluationId: "e3", maxActiveWatchMonitors: 15,
      now: new Date(t0.getTime() + 180_000), cooldownMs: 15 * 60_000,
    });

    expect(flap).toEqual({ outcome: "skipped", reason: "cooldown" });
    expect(monitors[0]).toMatchObject({ last_suppressed_reason: "cooldown" });
    expect(monitors[0].last_suppressed_at).toBeTruthy();
  });

  it("clears a prior suppression once a later evaluation actually applies", async () => {
    const { client, monitors } = fakeStore();
    const t0 = new Date("2026-08-26T14:00:00Z");
    await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "WATCH", evaluationId: "e0", maxActiveWatchMonitors: 15, now: t0,
    });
    await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "EXECUTE", evaluationId: "e1", maxActiveWatchMonitors: 15,
      now: new Date(t0.getTime() + 60_000), cooldownMs: 15 * 60_000,
    });
    await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "WATCH", evaluationId: "e2", maxActiveWatchMonitors: 15,
      now: new Date(t0.getTime() + 120_000), cooldownMs: 15 * 60_000,
    });
    // Suppressed by cooldown -- sets last_suppressed_reason.
    await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "EXECUTE", evaluationId: "e3", maxActiveWatchMonitors: 15,
      now: new Date(t0.getTime() + 180_000), cooldownMs: 15 * 60_000,
    });
    expect(monitors[0].last_suppressed_reason).toBe("cooldown");

    // Past the cooldown window -- applies, and should clear the suppression.
    await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "EXECUTE", evaluationId: "e4", maxActiveWatchMonitors: 15,
      now: new Date(t0.getTime() + 20 * 60_000), cooldownMs: 15 * 60_000,
    });

    expect(monitors[0].last_suppressed_reason).toBeNull();
    expect(monitors[0].last_suppressed_at).toBeNull();
  });

  it("still enforces a fair-use ceiling for a tier with an 'unlimited' monitor limit", async () => {
    const { client, monitors } = fakeStore();
    for (let i = 0; i < FAIR_USE_MAX_ACTIVE_MONITORS; i++) {
      monitors.push({
        id: randomUUID(),
        profile_id: "p1",
        symbol: `SYM${i}`,
        state: "WATCH",
        created_at: new Date().toISOString(),
      });
    }

    const result = await evaluateMonitor(client, {
      profileId: "p1", symbol: "NEWSYM", source: "manual_dashboard",
      candidateState: "WATCH", evaluationId: "e0", maxActiveWatchMonitors: "unlimited",
    });

    expect(result).toEqual({ outcome: "capacity_exceeded" });
  });

  it("invalidates an existing open monitor", async () => {
    const { client, monitors } = fakeStore();
    await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "WATCH", evaluationId: "e0", maxActiveWatchMonitors: 15,
    });
    const result = await evaluateMonitor(client, {
      profileId: "p1", symbol: "AAPL", source: "manual_dashboard",
      candidateState: "INVALIDATED", evaluationId: "e1", maxActiveWatchMonitors: 15,
      now: new Date(Date.now() + 60_000),
    });
    expect(result.outcome).toBe("applied");
    expect(monitors[0].state).toBe("INVALIDATED");
  });
});
