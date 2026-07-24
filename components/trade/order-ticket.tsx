"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd, cn } from "@/lib/utils";
import type { ScanResult } from "@/lib/types";
import type { Level2Book } from "@/lib/data/provider";

type EntryMode = "advised" | "bid" | "ask" | "now";
type ExecutionMode = "protocol" | "manual";

export function OrderTicket({ result }: { result: ScanResult }) {
  const { levels, pattern, currentPrice, symbol } = result;
  const [qty, setQty] = useState("1");
  const [entryMode, setEntryMode] = useState<EntryMode>("advised");
  const [attachLevels, setAttachLevels] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [level2, setLevel2] = useState<Level2Book | null>(null);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("protocol");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/level2?symbol=${encodeURIComponent(symbol)}`)
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((d) => !cancelled && d && setLevel2(d))
      .catch(() => {
        /* level2 not available */
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const hasProtocolSignal = levels && pattern;
  const side = pattern?.direction === "bullish" ? "buy" : "sell";
  const advised = levels?.entry ?? currentPrice;
  const bestBid = level2?.bids[0]?.price ?? currentPrice;
  const bestAsk = level2?.asks[0]?.price ?? currentPrice;

  let entryPrice: number;
  if (entryMode === "advised") entryPrice = advised;
  else if (entryMode === "bid") entryPrice = bestBid;
  else if (entryMode === "ask") entryPrice = bestAsk;
  else entryPrice = currentPrice;

  async function submit() {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          qty: Number(qty),
          entryMode,
          limitPrice: entryMode === "now" ? undefined : entryPrice,
          attachLevels:
            executionMode === "protocol" && attachLevels && levels
              ? { stopLoss: levels.stopLoss, takeProfit: levels.takeProfit1, masterProfit: levels.masterProfit }
              : undefined,
          mode: "paper",
          executionMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setFeedback({ ok: true, text: `Paper order placed — ${data.order?.status ?? "accepted"}.` });
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Order ticket · paper</CardTitle>
            {hasProtocolSignal && executionMode === "protocol" ? (
              <CardDescription>
                {side === "buy" ? "Long" : "Short"} {symbol} per the {pattern?.name} setup.
              </CardDescription>
            ) : (
              <CardDescription>
                Manual {side === "buy" ? "long" : "short"} execution for {symbol}.
              </CardDescription>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
          <span className="text-xs font-semibold text-muted">Mode:</span>
          <button
            onClick={() => setExecutionMode("protocol")}
            disabled={!hasProtocolSignal}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors",
              executionMode === "protocol" && hasProtocolSignal
                ? "bg-accent text-surface"
                : "border border-border text-muted",
              !hasProtocolSignal && "opacity-50 cursor-not-allowed",
            )}
          >
            Protocol Recommended
          </button>
          <button
            onClick={() => setExecutionMode("manual")}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors",
              executionMode === "manual"
                ? "bg-warn text-surface"
                : "border border-border text-muted hover:border-warn",
            )}
          >
            Manual Override
          </button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${level2 ? 4 : 2}, 1fr)` }}>
          {hasProtocolSignal && (
            <ModeButton
              active={entryMode === "advised"}
              onClick={() => setEntryMode("advised")}
              title="Protocol entry"
              subtitle={formatUsd(advised)}
            />
          )}
          {level2 && (
            <>
              <ModeButton
                active={entryMode === "bid"}
                onClick={() => setEntryMode("bid")}
                title="Best bid"
                subtitle={formatUsd(bestBid)}
                color="bull"
              />
              <ModeButton
                active={entryMode === "ask"}
                onClick={() => setEntryMode("ask")}
                title="Best ask"
                subtitle={formatUsd(bestAsk)}
                color="bear"
              />
            </>
          )}
          <ModeButton
            active={entryMode === "now"}
            onClick={() => setEntryMode("now")}
            title="Market"
            subtitle={currentPrice ? formatUsd(currentPrice) : "now"}
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-muted" htmlFor="qty">Quantity</label>
          <Input
            id="qty"
            type="number"
            min="1"
            step="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-28"
          />
        </div>

        {hasProtocolSignal && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={attachLevels}
              onChange={(e) => setAttachLevels(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
              disabled={executionMode === "manual"}
            />
            Attach protocol stop ({formatUsd(levels!.stopLoss)}) and TP1 ({formatUsd(levels!.takeProfit1)})
          </label>
        )}

        <Button
          variant={side === "buy" ? "bull" : "bear"}
          onClick={submit}
          disabled={submitting || Number(qty) < 1}
        >
          {submitting ? "Placing…" : `${side === "buy" ? "Buy" : "Sell short"} ${symbol}`}
        </Button>

        {feedback && (
          <p className={cn("text-sm", feedback.ok ? "text-bull" : "text-bear")}>{feedback.text}</p>
        )}
        <p className="text-xs text-muted">
          Orders route to your paper account. Connect a live brokerage in Settings to trade real funds.
        </p>
      </CardContent>
    </Card>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  subtitle,
  color,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  color?: "bull" | "bear";
}) {
  const activeColor = color === "bull" ? "border-bull bg-bull/10" : color === "bear" ? "border-bear bg-bear/10" : "border-accent bg-accent-soft";
  const activeText = color === "bull" ? "text-bull" : color === "bear" ? "text-bear" : "text-accent";
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer",
        active ? activeColor : "border-border hover:border-muted",
      )}
    >
      <p className={cn("text-sm font-medium", active && activeText)}>{title}</p>
      <p className="font-mono text-xs text-muted">{subtitle}</p>
    </button>
  );
}
