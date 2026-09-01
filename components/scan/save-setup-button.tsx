"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScanRow } from "@/components/scan/results-table";

export function SaveSetupButton({ row }: { row: ScanRow }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    if (state === "saving" || state === "saved") return;
    setState("saving");
    try {
      const res = await fetch("/api/saved-setups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: row.symbol,
          direction: row.direction,
          score: row.score,
          outputState: row.outputState,
          entry: row.entry,
          stopLoss: row.stopLoss,
          takeProfit1: row.takeProfit1,
          masterProfit: row.masterProfit,
          patternName: row.patternName ?? null,
          setupKind: row.setupKind ?? null,
        }),
      });
      if (!res.ok) throw new Error();
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <button
      onClick={save}
      disabled={state === "saving" || state === "saved"}
      title={state === "saved" ? "Saved to your folder" : "Save this setup for later reference"}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-background hover:text-accent disabled:cursor-default",
        state === "saved" && "text-accent",
        state === "error" && "text-bear",
      )}
    >
      {state === "saved" ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
    </button>
  );
}
