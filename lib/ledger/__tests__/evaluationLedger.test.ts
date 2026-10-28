import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectionRows,
  discoveryRows,
  ledgerEnabled,
  mergeLedgerRows,
  prefilterRows,
  queueRows,
  writeDeferred,
  writeLedger,
  type LedgerClient,
} from "../evaluationLedger";
import { planQueue } from "@/lib/scanner/queue";
import type { CoarseTelemetryRow } from "@/lib/scan/telemetry";
import type { DiscoveryReading } from "@/lib/scanner/discovery";

const AT = new Date("2026-10-27T14:30:00Z");
const tele = (over: Partial<CoarseTelemetryRow>) =>
  ({ scan_date: "2026-10-27", symbol: "AAA", cleared_reversion: false, cleared_continuation: false, shortlisted: false, full_scan_score: null, full_scan_output_state: null, ...over }) as CoarseTelemetryRow;

afterEach(() => {
  delete process.env.GSPS_EVALUATION_LEDGER;
});

describe("evaluation ledger rows", () => {
  it("records only stocks that reached the pre-filter or shortlist, with the scan's time", () => {
    const rows = prefilterRows(
      [tele({ symbol: "NONE" }), tele({ symbol: "SOFI", cleared_reversion: true }), tele({ symbol: "NBIS", cleared_continuation: true, shortlisted: true, full_scan_score: 3, full_scan_output_state: "Reject" })],
      AT,
    );
    expect(rows.map((r) => r.symbol)).toEqual(["SOFI", "NBIS"]);
    expect(rows[0]).toMatchObject({ first_prefilter_at: AT.toISOString() });
    expect(rows[0].first_shortlist_at).toBeUndefined();
    expect(rows[1]).toMatchObject({ first_shortlist_at: AT.toISOString(), first_full_score: 3, first_full_state: "Reject" });
  });

  it("keeps discovery rank, kinds and both times", () => {
    const d = {
      examineOnly: true,
      symbol: "BA",
      conditions: [{ kind: "new_13_week_extreme" }, { kind: "new_13_week_extreme" }, { kind: "at_old_level" }],
      evaluatedAt: "2026-10-27T15:00:00.000Z",
      dataAsOf: "2026-10-27T14:44:00.000Z",
    } as unknown as DiscoveryReading;
    expect(discoveryRows([d], "2026-10-27")[0]).toMatchObject({
      discovery_rank: 1,
      discovery_kinds: ["new_13_week_extreme", "at_old_level"],
      first_discovery_at: "2026-10-27T15:00:00.000Z",
      discovery_data_as_of: "2026-10-27T14:44:00.000Z",
    });
  });

  it("labels a rotating slot by the tier the name came from", () => {
    const plan = planQueue({ capacity: 3, shares: { core: 1, plans: 0, discovery: 0, focus: 1, watched: 0, rotating: 1 }, core: ["SPY"], plans: [], discovery: [], focus: ["F1", "F2"], watched: [], tick: 0 });
    const rows = queueRows(plan, "2026-10-27", AT);
    expect(rows.map((r) => r.queue_tier)).toEqual(["core", "focus", "rotating:focus"]);
  });

  it("keeps the earliest detection per stock with its three times apart", () => {
    const rows = detectionRows(
      [
        { symbol: "nvda", kind: "b", side: "bullish", evaluatedAt: "2026-10-27T15:00:00Z", barOpen: null, usableAt: null },
        { symbol: "NVDA", kind: "a", side: "bearish", evaluatedAt: "2026-10-27T14:20:00Z", barOpen: "2026-10-27T14:00:00Z", usableAt: "2026-10-27T14:20:00Z" },
      ],
      "2026-10-27",
    );
    expect(rows).toEqual([
      {
        session_date: "2026-10-27",
        symbol: "NVDA",
        first_detect_kind: "a",
        first_detect_side: "bearish",
        first_detect_eval_at: "2026-10-27T14:20:00Z",
        first_detect_bar_open: "2026-10-27T14:00:00Z",
        first_detect_usable_at: "2026-10-27T14:20:00Z",
      },
    ]);
  });

  it("merges one stock's stages into one row, first value kept, so no batch touches a row twice", () => {
    const merged = mergeLedgerRows([
      { session_date: "2026-10-27", symbol: "ba", first_prefilter_at: "x" },
      { session_date: "2026-10-27", symbol: "BA", first_prefilter_at: "y", first_discovery_at: "z" },
      { session_date: "2026-10-27", symbol: " " },
    ]);
    expect(merged).toEqual([{ session_date: "2026-10-27", symbol: "BA", first_prefilter_at: "x", first_discovery_at: "z" }]);
  });
});

describe("evaluation ledger writes", () => {
  const client = (fail = false) => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const c: LedgerClient = { rpc: (fn, args) => (calls.push({ fn, args }), Promise.resolve({ error: fail ? { message: "nope" } : null })) };
    return { c, calls };
  };

  it("batches and never throws on a failed write", async () => {
    const { c, calls } = client(true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rows = Array.from({ length: 650 }, (_, i) => ({ session_date: "2026-10-27", symbol: `S${i}` }));
    expect(await writeLedger(c, rows, "t")).toBe(3);
    expect(calls).toHaveLength(3);
    warn.mockRestore();
  });

  it("the kill switch turns every write off", async () => {
    process.env.GSPS_EVALUATION_LEDGER = "0";
    expect(ledgerEnabled()).toBe(false);
    const { c, calls } = client();
    await writeLedger(c, [{ session_date: "2026-10-27", symbol: "A" }], "t");
    await writeDeferred(c, "2026-10-27", ["A"]);
    expect(calls).toHaveLength(0);
  });

  it("deferrals go in one call per scan", async () => {
    const { c, calls } = client();
    await writeDeferred(c, "2026-10-27", ["A", "B"]);
    expect(calls).toEqual([{ fn: "ledger_deferred", args: { p_session: "2026-10-27", p_symbols: ["A", "B"] } }]);
  });
});
