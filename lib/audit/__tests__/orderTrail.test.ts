import { describe, expect, it } from "vitest";
import { buildOrderTrail, csvCell, trailCsv, TRAIL_COLUMNS, type TrailOrder } from "@/lib/audit/orderTrail";

function order(over: Partial<TrailOrder> = {}): TrailOrder {
  return {
    id: "o1",
    created_at: "2026-11-02T15:00:00Z",
    mode: "paper",
    symbol: "AAPL",
    side: "buy",
    order_type: "limit",
    qty: 10,
    limit_price: "180.5",
    stop_price: 175,
    take_profit: 190,
    master_profit: 200,
    level_source: "swing",
    strategy_version: "2026-11-01",
    status: "filled",
    broker_submitted_at: "2026-11-02T15:00:01Z",
    reject_reason: null,
    filled_qty: 10,
    filled_avg_price: 180.4,
    source_plan_id: "p1",
    ...over,
  };
}

const plan = {
  plan_id: "p1",
  generated_at: "2026-11-02T13:00:00Z",
  entry_trigger: 180.5,
  invalidation: 175,
  take_profit_1: 190,
  master_profit: 200,
  state: "filled",
};

describe("buildOrderTrail", () => {
  it("joins an order to its plan and its close", () => {
    const [row] = buildOrderTrail([order()], [plan], [
      { order_id: "o1", exit_timestamp: "2026-11-05T19:00:00Z", exit_price: 190, outcome: "profit", profit_loss_dollars: 96, exit_condition: "tp1" },
    ]);
    expect(row).toMatchObject({
      account: "Paper",
      limit_price: "180.5",
      levels_from: "Swing plan",
      plan_made_at: "2026-11-02T13:00:00Z",
      plan_entry: "180.5",
      closed_at: "2026-11-05T19:00:00Z",
      outcome: "Gain",
      pl_dollars: "96",
      exit_reason: "TP1",
    });
  });

  it("sums partial closes and keeps the latest one's exit", () => {
    const [row] = buildOrderTrail([order()], [plan], [
      { order_id: "o1", exit_timestamp: "2026-11-06T19:00:00Z", exit_price: 172, outcome: "loss", profit_loss_dollars: -42.1, exit_condition: "stop_loss" },
      { order_id: "o1", exit_timestamp: "2026-11-05T19:00:00Z", exit_price: 190, outcome: "profit", profit_loss_dollars: 48.05, exit_condition: "tp1" },
    ]);
    expect(row.pl_dollars).toBe("5.95");
    expect(row.exit_reason).toBe("Stop");
    expect(row.outcome).toBe("Loss");
  });

  it("leaves blanks where nothing is known and ignores open logs", () => {
    const [row] = buildOrderTrail(
      [order({ mode: "live", source_plan_id: null, level_source: "made-up", stop_price: null, filled_avg_price: "NaN", status: "rejected", reject_reason: "insufficient buying power" })],
      [plan],
      [{ order_id: "o1", exit_timestamp: null, exit_price: null, outcome: "pending", profit_loss_dollars: null, exit_condition: null }],
    );
    expect(row).toMatchObject({ account: "Live", plan_id: "", plan_entry: "", levels_from: "", stop: "", fill_price: "", closed_at: "", pl_dollars: "", refused_because: "insufficient buying power" });
  });

  it("keeps a plan id the member's rows no longer hold", () => {
    const [row] = buildOrderTrail([order({ source_plan_id: "gone" })], [], []);
    expect(row.plan_id).toBe("gone");
    expect(row.plan_made_at).toBe("");
  });

  it("never carries the plan's evidence", () => {
    const keys = TRAIL_COLUMNS.map(([k]) => k).join(" ");
    expect(keys).not.toMatch(/breakdown|alignment|regime|signal/);
  });
});

describe("csvCell", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "no"')).toBe('"say ""no"""');
    expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
  });
  it("keeps a spreadsheet from running a cell as a formula", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-2+3")).toBe("'-2+3");
  });
  it("leaves plain negative numbers as numbers", () => {
    expect(csvCell("-42.1")).toBe("-42.1");
    expect(csvCell("-7")).toBe("-7");
  });
});

describe("trailCsv", () => {
  it("writes a header and one CRLF line per order", () => {
    const csv = trailCsv(buildOrderTrail([order(), order({ id: "o2" })], [plan], []));
    const lines = csv.split("\r\n");
    expect(lines[0].split(",")).toHaveLength(TRAIL_COLUMNS.length);
    expect(lines[0]).toMatch(/^Order,Placed \(UTC\)/);
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe("");
  });
});
