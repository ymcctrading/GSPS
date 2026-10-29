/**
 * The robustness report script's pure half: it reads the trade rows the
 * universe runner prints (`tradesCsv`), so the two are pinned together here.
 */

import { describe, expect, it } from "vitest";
import { summarizeCells, summaryMarkdown, tradesCsv } from "../../scripts/backtest-universe.mjs";
import { marketFromCsv, parseArgs, splitCsvLine, tradesFromCsv } from "../../scripts/robustness-report.mjs";
import { buildRobustness } from "@/lib/backtest/robustness";

const trade = (over: Record<string, unknown>) => ({
  symbol: "AAA",
  openedAt: "2026-09-01T14:00:00Z",
  closedAt: "2026-09-04T20:00:00Z",
  entry: 10,
  stop: 9,
  target: 12,
  direction: "bullish",
  barsHeld: 3,
  outcome: "win",
  rMultiple: 1.5,
  score: 8,
  outputState: "Execute",
  exitReason: "trend_change",
  ...over,
});

describe("tradesFromCsv", () => {
  const csv = tradesCsv([
    {
      cell: { label: "prod" },
      trades: [
        trade({}),
        trade({ outputState: "Watch", rMultiple: -1, direction: "bearish" }),
        trade({ derived: "reversal", score: undefined, outputState: undefined }),
        trade({ exitReason: "open_at_end" }),
      ],
    },
  ]);

  it("reads every field the robustness module needs", () => {
    const rows = tradesFromCsv(csv);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      openedAt: "2026-09-01T14:00:00Z",
      closedAt: "2026-09-04T20:00:00Z",
      rMultiple: 1.5,
      direction: "bullish",
      score: 8,
      outputState: "Execute",
      exitReason: "trend_change",
    });
    expect(rows[1].direction).toBe("bearish");
    expect(rows[2]).toMatchObject({ derived: "reversal", score: undefined, outputState: undefined });
    expect(rows[3].exitReason).toBe("open_at_end");
  });

  it("reads the Execute verdict as the runner writes it", () => {
    expect(tradesFromCsv(csv, { scope: "execute" })).toHaveLength(2);
  });

  it("refuses to pool several cells, and names an unknown one", () => {
    const two = tradesCsv([
      { cell: { label: "a" }, trades: [trade({})] },
      { cell: { label: "b" }, trades: [trade({})] },
    ]);
    expect(() => tradesFromCsv(two)).toThrow(/a, b/);
    expect(tradesFromCsv(two, { cell: "b" })).toHaveLength(1);
    expect(() => tradesFromCsv(two, { cell: "c" })).toThrow(/No cell/);
  });
});

describe("marketFromCsv", () => {
  it("reads SPY's rows oldest first, stamped after the close", () => {
    const bars = marketFromCsv("symbol,date,o,h,l,c,v\nSPY,2024-01-03,2,3,1,2,9\nQQQ,2024-01-02,1,1,1,1,1\nSPY,2024-01-02,1,2,1,2,9\n");
    expect(bars.map((b) => b.t)).toEqual(["2024-01-02T20:00:00Z", "2024-01-03T20:00:00Z"]);
  });

  it("refuses a date with a time in it, and a file with no SPY", () => {
    expect(() => marketFromCsv("symbol,date,o,h,l,c,v\nSPY,2024-01-02T00:00:00Z,1,1,1,1,1\n")).toThrow(/YYYY-MM-DD/);
    expect(() => marketFromCsv("symbol,date,o,h,l,c,v\nQQQ,2024-01-02,1,1,1,1,1\n")).toThrow(/no SPY/);
  });

  it("refuses a blank or non-positive price and a date given twice", () => {
    expect(() => marketFromCsv("symbol,date,o,h,l,c,v\nSPY,2024-01-02,1,1,1,,1\n")).toThrow(/c "" is not a positive price/);
    expect(() => marketFromCsv("symbol,date,o,h,l,c,v\nSPY,2024-01-02,1,1,0,1,1\n")).toThrow(/l "0"/);
    expect(() =>
      marketFromCsv("symbol,date,o,h,l,c,v\nSPY,2024-01-02,1,1,1,1,1\nSPY,2024-01-02,1,1,1,1,1\n"),
    ).toThrow(/2024-01-02 twice/);
  });
});

describe("parsing", () => {
  it("splits quoted fields", () => {
    expect(splitCsvLine('a,"b,c","d ""e"""')).toEqual(["a", "b,c", 'd "e"']);
  });

  it("requires the trades file and a known scope", () => {
    expect(() => parseArgs([])).toThrow(/--trades/);
    expect(() => parseArgs(["--trades", "x.csv", "--scope", "closed"])).toThrow(/scope/);
    expect(parseArgs(["--trades", "x.csv", "--cell", "prod"])).toMatchObject({ trades: "x.csv", cell: "prod", scope: "all" });
  });
});

describe("the universe summary's robustness key", () => {
  const cellResults = [{ cell: { label: "prod" }, trades: [trade({}), trade({ exitReason: "held_to_limit", rMultiple: 0.3 })] }];

  it("is left out unless a builder is passed", () => {
    expect(summarizeCells(cellResults).cells[0]).not.toHaveProperty("robustness");
  });

  it("carries each cell's report and prints its sections", () => {
    const summary = summarizeCells(cellResults, { robustness: (trades: never[]) => buildRobustness(trades) });
    const rep = summary.cells[0].robustness;
    expect(rep.n).toBe(2);
    expect(rep.heldToLimit).toBe(1);
    const md = summaryMarkdown({ skipped: [], window: {} }, summary);
    expect(md).toContain("## Robustness");
    expect(md).toContain("#### Walk-forward");
    expect(md).toContain("valued at that bar's close");
  });
});
