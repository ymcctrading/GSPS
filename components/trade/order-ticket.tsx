"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd, cn } from "@/lib/utils";
import type { ScanResult } from "@/lib/types";

type EntryMode = "advised" | "now";

export function OrderTicket({ result }: { result: ScanResult }) {
  const { levels, pattern, currentPrice, symbol, direction } = result;
  const [qty, setQty] = useState("1");
  const [entryMode, setEntryMode] = useState<EntryMode>("advised");
  const [attachLevels, setAttachLevels] = useState(true);
  const [manualMode, setManualMode] = useState(false);
  const [manualStopLoss, setManualStopLoss] = useState("");
  const [manualTakeProfit, setManualTakeProfit] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const isArmed = !!(levels && pattern);
  const hasManualLevels = manualMode && manualStopLoss && manualTakeProfit;
  const canExecute = isArmed || hasManualLevels;

  if (!canExecute) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Order ticket</CardTitle>
          <CardDescription>
            No armed setup detected. Set manual stop loss and take profit to enable execution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted">
            The protocol prefers entries from live trigger lines. You can override this with manual levels.
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={manualMode}
              onChange={(e) => setManualMode(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">Enter manual stop loss and take profit</span>
          </label>
          {manualMode && (
            <div className="mt-3 space-y-2">
              <input
                type="number"
                step="0.01"
                value={manualStopLoss}
                onChange={(e) => setManualStopLoss(e.target.value)}
                placeholder="Stop loss price"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="number"
                step="0.01"
                value={manualTakeProfit}
                onChange={(e) => setManualTakeProfit(e.target.value)}
                placeholder="Take profit price"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const side = isArmed ? pattern!.direction === "bullish" ? "buy" : "sell" : direction === "bullish" ? "buy" : "sell";
  const advised = isArmed ? levels!.entry : currentPrice;

  async function submit() {
    setSubmitting(true);
    setFeedback(null);
    try {
      const attachedLevels = isArmed && attachLevels
        ? { stopLoss: levels!.stopLoss, takeProfit: levels!.takeProfit1, masterProfit: levels!.masterProfit }
        : manualMode
          ? { stopLoss: Number(manualStopLoss), takeProfit: Number(manualTakeProfit) }
          : undefined;

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          qty: Number(qty),
          entryMode: manualMode ? "now" : entryMode,
          limitPrice: !manualMode && entryMode === "advised" ? advised : undefined,
          attachLevels: attachedLevels,
          mode: "paper",
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
        <CardTitle>Order ticket · paper</CardTitle>
        <CardDescription>
          {side === "buy" ? "Long" : "Short"} {symbol}
          {isArmed && ` per the armed ${pattern!.name} setup`}
          {manualMode && " with manual risk levels"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isArmed && (
          <div className="grid grid-cols-2 gap-2">
            <ModeButton
              active={entryMode === "advised"}
              onClick={() => setEntryMode("advised")}
              title="At advised price"
              subtitle={formatUsd(advised)}
            />
            <ModeButton
              active={entryMode === "now"}
              onClick={() => setEntryMode("now")}
              title="Buy now (market)"
              subtitle={currentPrice ? formatUsd(currentPrice) : "market"}
            />
          </div>
        )}

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

        {isArmed && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={attachLevels}
              onChange={(e) => setAttachLevels(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Attach protocol stop ({formatUsd(levels!.stopLoss)}) and TP1 ({formatUsd(levels!.takeProfit1)})
          </label>
        )}

        {manualMode && (
          <div className="space-y-2 rounded bg-background/50 p-3">
            <div>
              <label className="block text-xs text-muted mb-1">Stop Loss</label>
              <input
                type="number"
                step="0.01"
                value={manualStopLoss}
                onChange={(e) => setManualStopLoss(e.target.value)}
                placeholder="Stop loss price"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Take Profit</label>
              <input
                type="number"
                step="0.01"
                value={manualTakeProfit}
                onChange={(e) => setManualTakeProfit(e.target.value)}
                placeholder="Take profit price"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
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
  active, onClick, title, subtitle,
}: { active: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer",
        active ? "border-accent bg-accent-soft" : "border-border hover:border-muted",
      )}
    >
      <p className={cn("text-sm font-medium", active && "text-accent")}>{title}</p>
      <p className="font-mono text-xs text-muted">{subtitle}</p>
    </button>
  );
}
