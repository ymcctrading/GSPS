"use client";

import { useState } from "react";
import { ResultsTable, type ScanRow } from "@/components/scan/results-table";

/**
 * Client wrapper around `ResultsTable` for the Dashboard's "Your tracked
 * Execute setups" card, so a row can be manually dismissed
 * (POST /api/monitors/dismiss) without leaving the server-rendered Dashboard
 * page itself a client component. Optimistic removal, reverted if the
 * request fails — same pattern as `SavedSetupsList`'s delete.
 */
export function TrackedExecuteList({ initialRows }: { initialRows: ScanRow[] }) {
  const [rows, setRows] = useState(initialRows);

  async function remove(symbol: string) {
    setRows((r) => r.filter((row) => row.symbol !== symbol));
    try {
      const res = await fetch("/api/monitors/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRows(initialRows);
    }
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Nothing tracked right now.</p>;
  }

  return <ResultsTable rows={rows} emptyText="" onRemove={remove} />;
}
