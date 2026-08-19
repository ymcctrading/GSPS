import { describe, expect, it } from "vitest";
import { buildJournalWorkbook, closedTrades, type JournalTrade } from "@/lib/journal/build-workbook";
import ExcelJS from "exceljs";

function trade(overrides: Partial<JournalTrade>): JournalTrade {
  return {
    symbol: "AAPL",
    direction: "buy",
    quantity: 10,
    entry_timestamp: "2026-08-10T14:00:00Z",
    entry_price: 100,
    exit_timestamp: "2026-08-10T18:00:00Z",
    exit_price: 105,
    outcome: "profit",
    profit_loss_dollars: 50,
    profit_loss_percent: 0.05,
    exit_condition: "tp1",
    signal_called: "Protocol levels — stop $95.00, TP1 $105.00",
    signal_adherence: "yes",
    ...overrides,
  };
}

describe("closedTrades", () => {
  it("keeps trades with an exit and drops still-pending ones", () => {
    const trades = [trade({}), trade({ exit_timestamp: null, outcome: "pending" })];
    expect(closedTrades(trades)).toHaveLength(1);
  });
});

describe("buildJournalWorkbook", () => {
  it("puts a trade on Today/Week/Month/All Time when it closed today, and only All Time when it closed long ago", async () => {
    const now = new Date("2026-08-19T22:00:00Z");
    const todayTrade = trade({ symbol: "TODAY", exit_timestamp: "2026-08-19T20:00:00Z" });
    const oldTrade = trade({ symbol: "OLD", exit_timestamp: "2026-01-05T20:00:00Z" });

    const buffer = await buildJournalWorkbook([todayTrade, oldTrade], now);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const symbolsOn = (sheetName: string) => {
      const sheet = workbook.getWorksheet(sheetName)!;
      const symbols: string[] = [];
      sheet.eachRow((row, i) => {
        if (i === 1) return; // header
        const v = row.getCell(2).value;
        if (typeof v === "string" && (v === "TODAY" || v === "OLD")) symbols.push(v);
      });
      return symbols;
    };

    expect(symbolsOn("Today")).toEqual(["TODAY"]);
    expect(symbolsOn("This Week")).toEqual(["TODAY"]);
    expect(symbolsOn("This Month")).toEqual(["TODAY"]);
    expect(symbolsOn("All Time").sort()).toEqual(["OLD", "TODAY"]);
  });

  it("produces empty sheets, not an error, when there are no closed trades", async () => {
    const buffer = await buildJournalWorkbook([], new Date());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.getWorksheet("All Time")).toBeDefined();
  });
});
