/**
 * The daily trade-journal spreadsheet.
 * -----------------------------------------------------------------------------
 * `trade_logs` already carries everything a personal trading journal needs —
 * see `lib/portfolio/trade-log-record.ts`: entry/exit price and time, realized
 * P/L, which exit rule closed it, and `signal_called`, the reasoning the trade
 * was placed under (protocol levels, or the Guided Decision Mode signal that
 * called it). This module doesn't invent a second record of trades; it reads
 * that one and lays it out as a workbook.
 *
 * Four sheets, not one — Today / This Week / This Month / All Time — because
 * "how did I do" is a different question at each horizon, and a single flat
 * sheet makes the reader re-filter it by hand every time they open the file.
 * The same closed trade appears on every sheet whose window it falls inside;
 * that's deliberate repetition, not a dedup bug — Today's trades are also
 * part of the week and the month.
 */

import ExcelJS from "exceljs";

export interface JournalTrade {
  symbol: string;
  direction: "buy" | "sell";
  quantity: number;
  entry_timestamp: string;
  entry_price: number;
  exit_timestamp: string | null;
  exit_price: number | null;
  outcome: "profit" | "loss" | "pending" | null;
  profit_loss_dollars: number | null;
  profit_loss_percent: number | null;
  exit_condition: string | null;
  signal_called: string;
  signal_adherence: string | null;
}

const COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: "Closed", key: "exit_timestamp", width: 20 },
  { header: "Symbol", key: "symbol", width: 10 },
  { header: "Side", key: "direction", width: 8 },
  { header: "Qty", key: "quantity", width: 8 },
  { header: "Entry", key: "entry_price", width: 12 },
  { header: "Entry time", key: "entry_timestamp", width: 20 },
  { header: "Exit", key: "exit_price", width: 12 },
  { header: "Outcome", key: "outcome", width: 10 },
  { header: "P/L ($)", key: "profit_loss_dollars", width: 12 },
  { header: "P/L (%)", key: "profit_loss_percent", width: 10 },
  { header: "Exit reason", key: "exit_condition", width: 14 },
  { header: "Signal adherence", key: "signal_adherence", width: 16 },
  { header: "Reasoning", key: "signal_called", width: 60 },
];

/** Only fully-closed trades belong in the journal — an open position has no reasoning to review yet. */
export function closedTrades(trades: JournalTrade[]): JournalTrade[] {
  return trades.filter((t) => t.exit_timestamp != null && t.outcome !== "pending");
}

function addSheet(workbook: ExcelJS.Workbook, name: string, trades: JournalTrade[]): void {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = COLUMNS;
  sheet.getRow(1).font = { bold: true };
  for (const t of trades) {
    const row = sheet.addRow({
      ...t,
      entry_timestamp: new Date(t.entry_timestamp),
      exit_timestamp: t.exit_timestamp ? new Date(t.exit_timestamp) : null,
    });
    const pl = t.profit_loss_dollars ?? 0;
    if (pl > 0) row.getCell("profit_loss_dollars").font = { color: { argb: "FF16803D" } };
    else if (pl < 0) row.getCell("profit_loss_dollars").font = { color: { argb: "FFDC2626" } };
  }
  sheet.getColumn("entry_timestamp").numFmt = "yyyy-mm-dd hh:mm";
  sheet.getColumn("exit_timestamp").numFmt = "yyyy-mm-dd hh:mm";
  sheet.getColumn("entry_price").numFmt = "$#,##0.00";
  sheet.getColumn("exit_price").numFmt = "$#,##0.00";
  sheet.getColumn("profit_loss_dollars").numFmt = "$#,##0.00";
  sheet.getColumn("profit_loss_percent").numFmt = "0.00%";

  if (trades.length > 0) {
    const totalRow = sheet.addRow({
      symbol: `${trades.length} trade${trades.length === 1 ? "" : "s"}`,
      profit_loss_dollars: trades.reduce((sum, t) => sum + (t.profit_loss_dollars ?? 0), 0),
    });
    totalRow.font = { bold: true };
  }
}

/**
 * Builds the four-sheet workbook for one user, windows computed against
 * `now` (defaults to the moment of the call). Returns the raw `.xlsx` bytes,
 * ready to attach to an email or write to disk.
 */
export async function buildJournalWorkbook(
  trades: JournalTrade[],
  now: Date = new Date(),
): Promise<Buffer> {
  const closed = closedTrades(trades);
  const exitedAt = (t: JournalTrade) => new Date(t.exit_timestamp as string).getTime();

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GSPS";
  workbook.created = now;

  addSheet(workbook, "Today", closed.filter((t) => exitedAt(t) >= startOfDay.getTime()));
  addSheet(workbook, "This Week", closed.filter((t) => exitedAt(t) >= startOfWeek.getTime()));
  addSheet(workbook, "This Month", closed.filter((t) => exitedAt(t) >= startOfMonth.getTime()));
  addSheet(workbook, "All Time", closed);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
