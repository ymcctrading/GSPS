import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTrackedExecuteSetups } from "@/lib/dashboard/trackedExecute";

/** Returns fixed rows per table; the reader's filters are applied by the query in production. */
function fakeClient(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => Promise.resolve({ data: rows, error: null }),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: rows, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const monitor = (over: Record<string, unknown>) => ({
  symbol: "X",
  score: null,
  output_state: null,
  execute_score: null,
  execute_output_state: null,
  direction: "bullish",
  entry: 10,
  stop_loss: 9,
  take_profit_1: 12,
  master_profit: 13,
  pattern_name: null,
  ...over,
});

describe("getTrackedExecuteSetups", () => {
  it("keeps only monitors whose scored verdict is Execute", async () => {
    const client = fakeClient({
      active_monitors: [
        // Put in EXECUTE by an intraday check; its scored verdict was Watch (2026-09-28 AMZN row).
        monitor({ symbol: "AMZN", direction: "bearish", output_state: "Watch", pattern_name: "2-2" }),
        monitor({ symbol: "HDB", score: 6, output_state: "Execute", execute_score: 7, execute_output_state: "Execute" }),
      ],
    });

    const rows = await getTrackedExecuteSetups(client, "p1");

    expect(rows.map((r) => r.symbol)).toEqual(["HDB"]);
    expect(rows[0]).toMatchObject({ score: 6, outputState: "Execute", executeScore: 7, executeOutputState: "Execute" });
  });

  it("falls back to the latest scan_results row for a monitor predating the trade-plan columns", async () => {
    const client = fakeClient({
      active_monitors: [monitor({ symbol: "V", score: 6, direction: null, entry: null })],
      scan_results: [
        { symbol: "V", direction: "bullish", score: 6, output_state: "Execute", entry: 300, stop_loss: 290, take_profit_1: 320, master_profit: 330, created_at: "2026-09-20T00:00:00Z" },
      ],
    });

    const rows = await getTrackedExecuteSetups(client, "p1");

    expect(rows).toEqual([expect.objectContaining({ symbol: "V", score: 6, entry: 300, executeScore: null })]);
  });
});
