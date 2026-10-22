import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { peakRunningTotal, readProfitCeiling } from "@/lib/risk/profitPeak";

function chain(rows: unknown[]) {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "not", "order", "limit", "in"]) q[k] = () => q;
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok);
  return q;
}
const stub = (tables: Record<string, unknown[]>) =>
  ({ from: (t: string) => chain(tables[t] ?? []) }) as unknown as SupabaseClient;

describe("the profit peak behind a tenth of the profits (A-RISK-07)", () => {
  it("is the highest running total of closed results", () => {
    expect(peakRunningTotal([60_000, 40_000, -10_000])).toBe(100_000);
    expect(peakRunningTotal([-5_000, 2_000])).toBe(0);
  });
  it("reads a paper account's peak from its closes", async () => {
    const supabase = stub({ trade_logs: [{ profit_loss_dollars: 100_000 }, { profit_loss_dollars: -10_000 }] });
    expect(await readProfitCeiling(supabase, "u1", "paper", 190_000)).toBe(9_000);
  });
  it("reads only the paper account's own closes, never live or journal ones (R-002)", async () => {
    const rows = [
      { mode: "paper", profit_loss_dollars: 100_000 },
      { mode: "live", profit_loss_dollars: 200_000 },
      { mode: "journal", profit_loss_dollars: 50_000 },
      { mode: "paper", profit_loss_dollars: -10_000 },
    ];
    const filters: [string, unknown][] = [];
    const q: Record<string, unknown> = {};
    for (const k of ["select", "not", "order", "limit"]) q[k] = () => q;
    q.eq = (col: string, v: unknown) => (filters.push([col, v]), q);
    q.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve({
        data: rows.filter((r) => filters.every(([c, v]) => !(c in r) || (r as Record<string, unknown>)[c] === v)),
        error: null,
      }).then(ok);
    const supabase = { from: () => q } as unknown as SupabaseClient;
    // Peak 100,000 on 100,000 starting cash: 90,000 left, a tenth is 9,000.
    expect(await readProfitCeiling(supabase, "u1", "paper", 190_000)).toBe(9_000);
    expect(filters).toContainEqual(["mode", "paper"]);
  });
  it("reads a live account's starting capital and peak from verified equity reads", async () => {
    const supabase = stub({ risk_live_equity_snapshots: [{ equity: 50_000 }, { equity: 100_000 }, { equity: 95_000 }] });
    expect(await readProfitCeiling(supabase, "u1", "live", 95_000)).toBe(4_500);
  });
  it("gives no ceiling with no live equity on record", async () => {
    expect(await readProfitCeiling(stub({}), "u1", "live", 95_000)).toBeNull();
  });
});
