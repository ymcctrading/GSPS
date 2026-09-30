"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/scan/score-badge";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { SetupCardPanel, SetupNameButton, useCardStage } from "@/components/setups/setup-card";
import { useLiveQuote } from "@/lib/hooks/useLiveQuote";
import { isInvalidatedByStop } from "@/lib/trade/invalidate-pending";
import { buildDailyCardModel } from "@/lib/setups/card";
import { formatScore, SCORE_MAX } from "@/lib/scoring/display";
import { cn, formatUsd } from "@/lib/utils";
import type { TrackedExecuteRow } from "@/lib/dashboard/trackedExecute";

/**
 * The Dashboard's "Your tracked Execute setups" list, laid out like
 * `SavedSetupsList` (project owner, 2026-09-28) so the two read the same way:
 * symbol, live price and side on the first line, the score when the setup
 * entered Execute against the score now underneath, then the plan — entry,
 * exit, TP1 and MTP. Clicking the symbol opens its setup card
 * (`components/setups/setup-card.tsx`), the same card the daily lists use.
 *
 * A setup whose stop the live quote has already broken is moved out of the
 * main list into a "Setups that broke their stop" dropdown, closed by default (project
 * owner, 2026-09-30: invalidated setups were being shown among the live ones).
 * Only the live ones are counted in the header and read as candidates.
 *
 * A row can be dismissed (POST /api/monitors/dismiss); removal is optimistic
 * and reverted if the request fails, same as `SavedSetupsList`'s delete.
 */
export function TrackedExecuteList({
  initialRows,
  exactScoreDisplayEnabled = false,
}: {
  initialRows: TrackedExecuteRow[];
  exactScoreDisplayEnabled?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  // Whether price has broken a row's stop is only known once its own live quote
  // has loaded, so each row reports it up and the list regroups.
  const [invalidated, setInvalidated] = useState<Record<string, boolean>>({});
  // One-way, like each row's own flag: a row that remounts inside the closed
  // "Setups that broke their stop" group starts from a fresh, unsure state and must not
  // report itself live again.
  const handleInvalidatedChange = useCallback((symbol: string, value: boolean) => {
    if (!value) return;
    setInvalidated((prev) => (prev[symbol] ? prev : { ...prev, [symbol]: true }));
  }, []);

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

  const live = rows.filter((row) => !invalidated[row.symbol]);
  const dead = rows.filter((row) => invalidated[row.symbol]);

  const renderRow = (row: TrackedExecuteRow) => (
    <TrackedRow
      key={row.symbol}
      row={row}
      onRemove={remove}
      alreadyInvalidated={Boolean(invalidated[row.symbol])}
      onInvalidatedChange={handleInvalidatedChange}
      exactScoreDisplayEnabled={exactScoreDisplayEnabled}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {live.length > 0 ? (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {live.map(renderRow)}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-muted">
          None of your tracked setups is still live — each has broken its stop.
        </p>
      )}
      {dead.length > 0 && (
        <CollapsibleSection title="Setups that broke their stop" count={dead.length} quiet>
          <p className="mb-2 text-xs text-muted">
            Price has already traded through each stop below, so the entry it was staked on is a dead level.
            Look for a fresh setup instead of waiting for price to come back.
          </p>
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {dead.map(renderRow)}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

function TrackedRow({
  row,
  onRemove,
  alreadyInvalidated,
  onInvalidatedChange,
  exactScoreDisplayEnabled,
}: {
  row: TrackedExecuteRow;
  onRemove: (symbol: string) => void;
  /** Seeds the ratchet when the row is remounted into another group after it has already tripped. */
  alreadyInvalidated: boolean;
  onInvalidatedChange: (symbol: string, value: boolean) => void;
  exactScoreDisplayEnabled: boolean;
}) {
  const quote = useLiveQuote(row.symbol, { intervalMs: 30_000 });
  const bullish = row.direction === "bullish";

  // A one-way ratchet, as in ResultsTable: "price broke the stop" is a fact
  // about what already happened, so a quote gap or a tick back over the line
  // must not un-invalidate the row.
  const [invalidated, setInvalidated] = useState(alreadyInvalidated);
  const freshlyInvalidated =
    row.stopLoss != null &&
    quote != null &&
    isInvalidatedByStop({ side: bullish ? "buy" : "sell", stop_price: row.stopLoss }, quote.price);
  if (freshlyInvalidated && !invalidated) setInvalidated(true);

  useEffect(() => {
    onInvalidatedChange(row.symbol, invalidated);
  }, [invalidated, onInvalidatedChange, row.symbol]);

  const { stage, setStage, toggleName } = useCardStage();
  const cardId = `tracked-card-${row.symbol.replace(/[^a-zA-Z0-9-]/g, "_")}`;
  const model = buildDailyCardModel(
    {
      symbol: row.symbol,
      score: row.score,
      outputState: row.outputState,
      direction: row.direction,
      entry: row.entry,
      stopLoss: row.stopLoss,
      takeProfit1: row.takeProfit1,
      masterProfit: row.masterProfit,
      patternName: row.patternName,
    },
    { scoreText: formatScore(row.score, exactScoreDisplayEnabled), scoreMax: SCORE_MAX, livePrice: quote?.price ?? null },
  );

  return (
    <div className={cn("flex flex-col gap-1.5 px-3 py-2.5", invalidated && "bg-bear-soft/40")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SetupNameButton symbol={row.symbol} stage={stage} controls={cardId} onToggle={toggleName} />
        {quote && <span className="font-mono text-sm tabular-nums">{formatUsd(quote.price)}</span>}
        <span className={bullish ? "text-xs text-bull" : "text-xs text-bear"}>{bullish ? "Buy" : "Sell"}</span>
        {row.patternName && <span className="text-xs text-muted">{row.patternName}</span>}
        {invalidated && <Badge variant="bear">Invalidated</Badge>}
      </div>

      <span className="flex items-center gap-1.5 text-xs">
        {row.executeScore != null && (
          <>
            <span title="Score when this setup entered Execute">
              <ScoreBadge
                score={row.executeScore}
                state={row.executeOutputState ?? "Execute"}
                exactScoreDisplayEnabled={exactScoreDisplayEnabled}
              />
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted" />
          </>
        )}
        <span title="Score now">
          <ScoreBadge score={row.score} state={row.outputState} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />
        </span>
      </span>

      <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted">
        <span>Entry {formatUsd(row.entry)}</span>
        {row.stopLoss != null && <span className="text-bear">Exit {formatUsd(row.stopLoss)}</span>}
        {row.takeProfit1 != null && <span className="text-bull">TP1 {formatUsd(row.takeProfit1)}</span>}
        {row.masterProfit != null && <span className="text-bull">MTP {formatUsd(row.masterProfit)}</span>}
        <button
          onClick={() => onRemove(row.symbol)}
          title="Stop tracking this setup"
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
            <span title="Score now">
              <ScoreBadge score={row.score} state={row.outputState} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />
            </span>
          }
          extra={
            invalidated ? (
              <p className="text-xs text-bear">
                Price has {bullish ? "fallen" : "risen"} through the stop this setup was staked on, so its entry is a
                dead level. Look for a fresh setup instead.
              </p>
            ) : null
          }
        />
      )}
    </div>
  );
}
