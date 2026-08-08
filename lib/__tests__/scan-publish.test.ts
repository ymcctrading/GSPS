import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildScanRows,
  describeDbError,
  persistDailyScans,
  type DailyScanRow,
} from "@/lib/scan/publish";
import type { ScanResult, TradeLevels } from "@/lib/types";

function levels(entry: number): TradeLevels {
  return {
    entry,
    stopLoss: entry - 2,
    takeProfit1: entry + 3,
    takeProfit2: entry + 6,
    masterProfit: entry + 6,
    riskPerShare: 2,
    rewardToRiskTp1: 1.5,
    rewardToRiskTp2: 3,
    rewardToRiskMaster: 3,
    masterFromStructure: false,
    stopPctOfPrice: 2,
    stopBandWarning: null,
  };
}

function result(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    symbol: "AAPL",
    assetClass: "us_equity",
    scannedAt: "2026-08-05T13:00:00.000Z",
    currentPrice: 200,
    direction: "bullish",
    setupKind: "reversion",
    momentumElevated: false,
    trends: [],
    gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
    pattern: {
      name: "2-1-2",
      direction: "bullish",
      triggerPrice: 200,
      stopPrice: 198,
      description: "",
    },
    armedPatterns: [],
    levels: levels(200),
    decision: { score: 8, outputState: "Execute", breakdown: [] },
    ...overrides,
  };
}

describe("buildScanRows", () => {
  it("drops results with no trade plan and renumbers the survivors", () => {
    const rows = buildScanRows("2026-08-05", "bullish", [
      result({ symbol: "AAPL" }),
      result({ symbol: "HYG", pattern: null, levels: null }),
      result({ symbol: "NVDA", levels: levels(300) }),
    ]);

    expect(rows.map((r) => [r.symbol, r.rank])).toEqual([
      ["AAPL", 1],
      ["NVDA", 2],
    ]);
  });

  it("drops a result whose plan priced out non-finite", () => {
    const broken = { ...levels(100), masterProfit: Number.NaN };
    expect(buildScanRows("2026-08-05", "bullish", [result({ levels: broken })])).toEqual([]);
  });

  it("never emits a null price — the columns are NOT NULL", () => {
    const [row] = buildScanRows("2026-08-05", "bearish", [result()]);
    expect(row.entry).toBe(200);
    expect(row.stop_loss).toBe(198);
    expect(row.take_profit_1).toBe(203);
    expect(row.master_profit).toBe(206);
    expect(row.direction).toBe("bearish");
    expect(row.scan_date).toBe("2026-08-05");
  });
});

describe("describeDbError", () => {
  it("reads a PostgrestError, which is a plain object rather than an Error", () => {
    const text = describeDbError({
      message: 'null value in column "entry" violates not-null constraint',
      details: "Failing row contains (…, null, null).",
      hint: null,
      code: "23502",
    });

    expect(text).toContain("not-null constraint");
    expect(text).toContain("Failing row");
    expect(text).toContain("23502");
    expect(text).not.toContain("[object Object]");
  });

  it("falls back to JSON rather than [object Object] for a shapeless object", () => {
    expect(describeDbError({ status: 500 })).toBe('{"status":500}');
  });

  it("keeps an Error's message", () => {
    expect(describeDbError(new Error("fetch failed"))).toBe("fetch failed");
  });
});

/** Records the calls a persist makes, so the order of operations is testable. */
function fakeClient(opts: { upsertError?: unknown; pruneError?: unknown } = {}) {
  const calls: string[] = [];
  const client = {
    from() {
      return {
        upsert(rows: DailyScanRow[]) {
          calls.push(`upsert:${rows.length}`);
          return Promise.resolve({ error: opts.upsertError ?? null });
        },
        delete() {
          const chain = {
            eq(_column: string, value: string) {
              calls.push(`delete.eq:${value}`);
              return chain;
            },
            gt(_column: string, value: number) {
              calls.push(`delete.gt:${value}`);
              return Promise.resolve({ error: opts.pruneError ?? null });
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

const row = (direction: "bullish" | "bearish", rank: number): DailyScanRow => ({
  scan_date: "2026-08-05",
  direction,
  rank,
  symbol: `S${rank}`,
  score: 8,
  output_state: "Execute",
  entry: 100,
  stop_loss: 98,
  take_profit_1: 103,
  master_profit: 106,
  detail: {},
});

describe("persistDailyScans", () => {
  it("writes the new rows before pruning, so a failed write can't empty the day", async () => {
    const { client, calls } = fakeClient();

    const outcome = await persistDailyScans(client, "2026-08-05", [
      row("bullish", 1),
      row("bullish", 2),
      row("bearish", 1),
    ]);

    expect(outcome).toEqual({ persisted: true, count: 3, error: null });
    expect(calls[0]).toBe("upsert:3");
    expect(calls).toContain("delete.gt:2"); // bullish tail above rank 2
    expect(calls).toContain("delete.gt:1"); // bearish tail above rank 1
  });

  it("deletes nothing when the write is rejected, and reports why", async () => {
    const { client, calls } = fakeClient({
      upsertError: { message: "violates not-null constraint", code: "23502" },
    });

    const outcome = await persistDailyScans(client, "2026-08-05", [row("bullish", 1)]);

    expect(outcome.persisted).toBe(false);
    expect(outcome.error).toContain("23502");
    expect(calls).toEqual(["upsert:1"]);
  });

  it("leaves the previous day's lists alone when the scan found nothing", async () => {
    const { client, calls } = fakeClient();

    const outcome = await persistDailyScans(client, "2026-08-05", []);

    expect(outcome.persisted).toBe(false);
    expect(outcome.error).toMatch(/no setup/i);
    expect(calls).toEqual([]);
  });

  it("still reports success when only the stale-tail prune fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fakeClient({ pruneError: { message: "timeout", code: "57014" } });

    const outcome = await persistDailyScans(client, "2026-08-05", [row("bullish", 1)]);

    expect(outcome.persisted).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
