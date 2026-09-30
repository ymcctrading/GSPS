"use client";

import { useState } from "react";
import { ArrowRight, TriangleAlert, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/scan/score-badge";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { SetupCardPanel, SetupNameButton, useCardStage } from "@/components/setups/setup-card";
import { buildDailyCardModel } from "@/lib/setups/card";
import { formatScore, SCORE_MAX } from "@/lib/scoring/display";
import { cn, formatUsd } from "@/lib/utils";

export interface SavedSetupRow {
  id: string;
  symbol: string;
  direction: string;
  score: number | null;
  output_state: string | null;
  entry: number | null;
  stop_loss: number | null;
  take_profit1: number | null;
  master_profit: number | null;
  pattern_name: string | null;
  setup_kind: string | null;
  saved_at: string;
  folderName: string;
  /** The same symbol/direction's score in today's scan, null if it dropped out or hasn't scanned since. */
  currentScore: number | null;
  currentOutputState: string | null;
  /**
   * The Watch -> Execute monitor's live read on this symbol (WATCH, EXECUTE,
   * INVALIDATED, NO_SETUP, EXPIRED), independent of when the last scan ran —
   * the monitor re-evaluates on every scheduled scan, so this can catch a
   * setup breaking well before this page happens to be reloaded. Null when
   * no monitor has ever tracked this symbol.
   */
  monitorState: string | null;
}

/** A monitor state that says the setup is over: the structure that qualified it broke, or it lapsed. */
function isRetired(row: SavedSetupRow): boolean {
  return row.monitorState === "INVALIDATED" || row.monitorState === "EXPIRED" || row.monitorState === "NO_SETUP";
}

/**
 * The user's saved setups, grouped by folder. Within a folder the setups still
 * standing come first; the ones the monitor has retired sit in a "No longer
 * valid" dropdown, closed by default (project owner, 2026-09-30, the same call
 * as the tracked list: broken setups were being shown among the live ones).
 * Clicking a symbol opens its setup card, the same one the daily lists use.
 */
export function SavedSetupsList({
  initialRows,
  exactScoreDisplayEnabled = false,
}: {
  initialRows: SavedSetupRow[];
  exactScoreDisplayEnabled?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);

  async function remove(id: string) {
    setRows((r) => r.filter((row) => row.id !== id));
    try {
      const res = await fetch(`/api/saved-setups/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      // put it back if the delete didn't actually happen
      setRows(initialRows);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Nothing saved yet — use the bookmark icon on a ranked setup from the dashboard.
      </p>
    );
  }

  const grouped = new Map<string, SavedSetupRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.folderName) ?? [];
    list.push(row);
    grouped.set(row.folderName, list);
  }

  return (
    <div className="flex flex-col gap-6">
      {[...grouped.entries()].map(([folderName, items]) => {
        const standing = items.filter((row) => !isRetired(row));
        const retired = items.filter(isRetired);
        const renderRow = (row: SavedSetupRow) => (
          <SavedRow key={row.id} row={row} onRemove={remove} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />
        );
        return (
          <div key={folderName} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted">{folderName}</h2>
            {standing.length > 0 ? (
              <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {standing.map(renderRow)}
              </div>
            ) : (
              <p className="text-sm text-muted">Every setup in this folder is no longer valid.</p>
            )}
            {retired.length > 0 && (
              <CollapsibleSection title="No longer valid setups" count={retired.length} quiet>
                <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {retired.map(renderRow)}
                </div>
              </CollapsibleSection>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SavedRow({
  row,
  onRemove,
  exactScoreDisplayEnabled,
}: {
  row: SavedSetupRow;
  onRemove: (id: string) => void;
  exactScoreDisplayEnabled: boolean;
}) {
  const { stage, setStage, toggleName } = useCardStage();
  const cardId = `saved-card-${row.id}`;
  const model = buildDailyCardModel(
    {
      symbol: row.symbol,
      score: row.score ?? 0,
      outputState: row.output_state ?? "Reject",
      direction: row.direction,
      entry: row.entry,
      stopLoss: row.stop_loss,
      takeProfit1: row.take_profit1,
      masterProfit: row.master_profit,
      patternName: row.pattern_name,
      setupKind: row.setup_kind === "continuation" ? "continuation" : "reversion",
    },
    {
      // A setup saved without a score has no count of checks to state.
      scoreText: row.score != null ? formatScore(row.score, exactScoreDisplayEnabled) : null,
      scoreMax: SCORE_MAX,
    },
  );

  return (
    <div className={cn("flex flex-col gap-1.5 px-3 py-2.5", row.monitorState === "INVALIDATED" && "bg-bear-soft/40")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <SetupNameButton symbol={row.symbol} stage={stage} controls={cardId} onToggle={toggleName} />
        <span className={row.direction === "bullish" ? "text-bull text-xs" : "text-bear text-xs"}>
          {row.direction === "bullish" ? "Buy" : "Sell"}
        </span>
        {row.pattern_name && <span className="text-xs text-muted">{row.pattern_name}</span>}
        {row.setup_kind === "continuation" && <Badge variant="muted">continuation</Badge>}
        <MonitorStatus state={row.monitorState} />
        <ScoreChange row={row} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted">
        {row.entry != null && <span>Entry {formatUsd(row.entry)}</span>}
        {row.stop_loss != null && <span className="text-bear">Exit {formatUsd(row.stop_loss)}</span>}
        {row.take_profit1 != null && <span className="text-bull">TP1 {formatUsd(row.take_profit1)}</span>}
        {row.master_profit != null && <span className="text-bull">MTP {formatUsd(row.master_profit)}</span>}
        <button
          onClick={() => onRemove(row.id)}
          title="Remove from saved setups"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-background hover:text-bear"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {stage !== "closed" && (
        <SetupCardPanel
          id={cardId}
          model={model}
          stage={stage}
          onStageChange={setStage}
          className="mt-1"
          headline={
            row.currentScore != null ? (
              <span title="Score in today's scan">
                <ScoreBadge
                  score={row.currentScore}
                  state={row.currentOutputState ?? "Reject"}
                  exactScoreDisplayEnabled={exactScoreDisplayEnabled}
                />
              </span>
            ) : row.score != null ? (
              <span title="Score when saved">
                <ScoreBadge
                  score={row.score}
                  state={row.output_state ?? "Reject"}
                  exactScoreDisplayEnabled={exactScoreDisplayEnabled}
                />
              </span>
            ) : (
              <span className="text-xs text-muted">Saved without a score</span>
            )
          }
        />
      )}
    </div>
  );
}

/**
 * The monitor's live state for this symbol — most importantly INVALIDATED,
 * which the monitor can catch mid-session, well before the next scan
 * refreshes this page's `score`/`currentScore` columns. WATCH/EXECUTE render
 * quietly (the score badges already say that); only a broken setup needs to
 * interrupt.
 */
function MonitorStatus({ state }: { state: string | null }) {
  if (state !== "INVALIDATED" && state !== "EXPIRED" && state !== "NO_SETUP") return null;

  const label = state === "INVALIDATED" ? "Invalidated" : state === "EXPIRED" ? "Expired" : "No longer set up";

  return (
    <span
      className="flex items-center gap-1 text-xs font-medium text-bear"
      title="The Watch → Execute monitor no longer considers this setup valid — price action broke the structure that qualified it."
    >
      <TriangleAlert className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

/**
 * Score at save time vs. today's scan for the same symbol + direction. A
 * saved setup is a snapshot — the next scan re-ranks everything, so the two
 * numbers commonly diverge, and the whole reason someone bookmarks a setup
 * is to be able to see how it moved.
 */
function ScoreChange({
  row,
  exactScoreDisplayEnabled,
}: {
  row: SavedSetupRow;
  exactScoreDisplayEnabled: boolean;
}) {
  if (row.score == null) return null;

  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span title="Score when saved">
        <ScoreBadge
          score={row.score}
          state={row.output_state ?? "Reject"}
          exactScoreDisplayEnabled={exactScoreDisplayEnabled}
        />
      </span>
      {row.currentScore != null ? (
        <>
          <ArrowRight className="h-3.5 w-3.5 text-muted" />
          <span title="Score in today's scan">
            <ScoreBadge
              score={row.currentScore}
              state={row.currentOutputState ?? "Reject"}
              exactScoreDisplayEnabled={exactScoreDisplayEnabled}
            />
          </span>
        </>
      ) : (
        <span className="text-muted">Not in today&apos;s scan</span>
      )}
    </span>
  );
}
