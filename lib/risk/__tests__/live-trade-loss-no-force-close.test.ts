import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Q11 (owner, 2026-10-16, "Switch all nine"): no 50% force-close. The stop
// every position carries (A-STOP-01) is the backstop, as in Gann's rules.
const closePosition = vi.fn();
vi.mock("@/lib/brokers/alpaca", () => ({ closePosition: (...a: unknown[]) => closePosition(...a) }));
vi.mock("@/lib/notifications/live-risk-email", () => ({ sendLiveLossThresholdEmail: async () => undefined }));

import { evaluateLiveTradeLoss } from "@/lib/risk/live-trade-loss";

function fakeSupabase() {
  const writes: string[] = [];
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: { notified_thresholds: [6, 9, 15, 30], paused_at: null } });
    q.insert = async () => { writes.push(`insert:${table}`); return {}; };
    q.upsert = async () => { writes.push(`upsert:${table}`); return {}; };
    q.update = () => { writes.push(`update:${table}`); return q; };
    return q;
  };
  const sb = { from: chain, auth: { admin: { getUserById: async () => ({ data: { user: { email: "a@b.c" } } }) } } };
  return { sb: sb as unknown as SupabaseClient, writes };
}

describe("a deep live loss is left to the position's stop", () => {
  it("neither flattens the position nor restricts the account at 60%", async () => {
    const { sb, writes } = fakeSupabase();
    const out = await evaluateLiveTradeLoss(sb, {} as never, "u1", { id: "p1", symbol: "AAPL" }, { unrealized_plpc: "-0.6" } as never);
    expect(closePosition).not.toHaveBeenCalled();
    expect(writes).not.toContain("upsert:live_trading_restrictions");
    expect(writes).not.toContain("update:automation_profiles");
    expect(out?.lossPct).toBeCloseTo(60, 9);
  });
});
