import Link from "next/link";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ScoreBadge } from "@/components/scan/score-badge";
import { formatUsd } from "@/lib/utils";

export interface ScanRow {
  symbol: string;
  score: number;
  outputState: string;
  direction: string;
  entry: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  masterProfit: number | null;
  patternName?: string | null;
}

export function ResultsTable({ rows, emptyText }: { rows: ScanRow[]; emptyText?: string }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{emptyText ?? "No results yet."}</p>;
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Symbol</TH>
          <TH>Score</TH>
          <TH>Setup</TH>
          <TH className="text-right">Entry</TH>
          <TH className="text-right">Stop</TH>
          <TH className="text-right">TP1</TH>
          <TH className="text-right">Master</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={`${r.symbol}-${r.direction}`}>
            <TD>
              <Link
                href={`/ticker/${encodeURIComponent(r.symbol)}`}
                className="font-medium text-accent hover:underline"
              >
                {r.symbol}
              </Link>
            </TD>
            <TD>
              <ScoreBadge score={r.score} state={r.outputState} />
            </TD>
            <TD className="text-muted">
              {r.patternName ? `${r.patternName} ` : ""}
              <span className={r.direction === "bullish" ? "text-bull" : r.direction === "bearish" ? "text-bear" : ""}>
                {r.direction !== "none" ? r.direction : "—"}
              </span>
            </TD>
            <TD className="text-right font-mono">{r.entry != null ? formatUsd(r.entry) : "—"}</TD>
            <TD className="text-right font-mono text-bear">{r.stopLoss != null ? formatUsd(r.stopLoss) : "—"}</TD>
            <TD className="text-right font-mono text-bull">{r.takeProfit1 != null ? formatUsd(r.takeProfit1) : "—"}</TD>
            <TD className="text-right font-mono">{r.masterProfit != null ? formatUsd(r.masterProfit) : "—"}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
