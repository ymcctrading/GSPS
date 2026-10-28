import { afterEach, describe, expect, it, vi } from "vitest";
import {
  afterResponse,
  detectionFromAlert,
  DISCOVERY_CURRENT_MS,
  readSessionDiscoveries,
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
        { symbol: "nvda", sessionDate: "2026-10-27", kind: "b", side: "bullish", evaluatedAt: "2026-10-27T15:00:00Z", barOpen: null, usableAt: null },
        { symbol: "NVDA", sessionDate: "2026-10-27", kind: "a", side: "bearish", evaluatedAt: "2026-10-27T14:20:00Z", barOpen: "2026-10-27T14:00:00Z", usableAt: "2026-10-27T14:20:00Z" },
        // A holiday's reading of the prior session's bar is filed under that session.
        { symbol: "NVDA", sessionDate: "2026-10-26", kind: "c", side: "bullish", evaluatedAt: "2026-10-27T15:30:00Z", barOpen: "2026-10-26T19:45:00Z", usableAt: null },
      ],
    );
    expect(rows.find((r) => r.session_date === "2026-10-26")?.first_detect_kind).toBe("c");
    expect(rows.filter((r) => r.session_date === "2026-10-27")).toEqual([
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

  it("sorts merged rows by session and symbol, so concurrent writers lock in one order", () => {
    const merged = mergeLedgerRows([
      { session_date: "2026-10-27", symbol: "ZM" },
      { session_date: "2026-10-26", symbol: "ZM" },
      { session_date: "2026-10-27", symbol: "AA" },
    ]);
    expect(merged.map((r) => `${r.session_date}|${r.symbol}`)).toEqual(["2026-10-26|ZM", "2026-10-27|AA", "2026-10-27|ZM"]);
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
    await writeDeferred(c, "2026-10-27", ["A"], new Date("2026-10-27T14:00:00Z"));
    expect(calls).toHaveLength(0);
  });

  it("deferrals go in one call per scan, keyed by the rotation tick", async () => {
    const { c, calls } = client();
    await writeDeferred(c, "2026-10-27", ["A", "B"], new Date("2026-10-27T14:00:00Z"));
    expect(calls).toEqual([{ fn: "ledger_deferred", args: { p_session: "2026-10-27", p_symbols: ["A", "B"], p_tick: "2026-10-27T14:00:00.000Z" } }]);
  });
});

describe("evaluation ledger reads and deferred writes", () => {
  it("reads only discoveries reported within the last two market scans, latest first", async () => {
    const calls: [string, unknown[]][] = [];
    const builder: Record<string, unknown> = {};
    for (const m of ["from", "select", "eq", "gte", "order", "limit"]) builder[m] = (...args: unknown[]) => (calls.push([m, args]), builder);
    builder.then = (ok: (v: unknown) => unknown) => ok({ data: [{ symbol: "ba" }], error: null });
    const now = new Date("2026-10-27T15:00:00Z");
    const out = await readSessionDiscoveries(builder as never, "2026-10-27", 40, now);
    expect(out).toEqual(["BA"]);
    expect(calls).toContainEqual(["gte", ["last_discovery_at", new Date(now.getTime() - DISCOVERY_CURRENT_MS).toISOString()]]);
    expect(calls).toContainEqual(["order", ["last_discovery_at", { ascending: false }]]);
  });

  it("runs a deferred write outside a request without throwing, and logs its time", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    let ran = false;
    afterResponse("t", async () => {
      ran = true;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(ran).toBe(true);
    expect(info.mock.calls.some((c) => String(c[0]).includes("[evaluation-ledger] t"))).toBe(true);
    info.mockRestore();
  });
});

describe("detection from a scanned alert", () => {
  it("reads the bar open from the structure's last close, not the alert's data time", () => {
    // A 5-minute bar 10:00-10:05 ET (14:00-14:05Z); the scan's quote is that close.
    const d = detectionFromAlert({
      symbol: "aapl",
      type: "breakout",
      direction: "down",
      triggerTime: "2026-10-27T14:26:00.000Z",
      dataTimestamp: "2026-10-27T14:05:00.000Z",
      timeliness: { barMinutes: 5, structureAsOf: "2026-10-27T14:05:00.000Z", usableAt: "2026-10-27T14:20:00.000Z" },
    });
    expect(d).toEqual({
      symbol: "aapl",
      sessionDate: "2026-10-27",
      kind: "breakout",
      side: "bearish",
      evaluatedAt: "2026-10-27T14:26:00.000Z",
      barOpen: "2026-10-27T14:00:00.000Z",
      usableAt: "2026-10-27T14:20:00.000Z",
    });
  });

  it("records no bar open or usable time when the alert carries no timeliness", () => {
    const d = detectionFromAlert({ symbol: "X", type: "t", direction: "up", triggerTime: "2026-10-27T14:26:00.000Z", dataTimestamp: "2026-10-27T14:05:00.000Z" });
    expect(d.barOpen).toBeNull();
    expect(d.usableAt).toBeNull();
    expect(d.side).toBe("bullish");
  });

  it("queue rows keep only the slots the scan read", () => {
    const plan = planQueue({ core: ["SPY", "QQQ"], plans: [], discovery: [], focus: [], watched: [], tick: 0 });
    expect(queueRows(plan, "2026-10-27", AT, new Set(["SPY"])).map((r) => r.symbol)).toEqual(["SPY"]);
  });
});
