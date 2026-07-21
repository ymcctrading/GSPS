"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd, cn } from "@/lib/utils";
import type { ScanResult } from "@/lib/types";

type EntryMode = "advised" | "now";

export function OrderTicket({ result }: { result: ScanResult }) {
  const { levels, pattern, currentPrice, symbol } = result;
  const [qty, setQty] = useState("1");
  const [entryMode, setEntryMode] = useState<EntryMode>("advised");
  const [attachLevels, setAttachLevels] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  if (!levels || !pattern) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Order ticket</CardTitle>
          <CardDescription>
            No armed setup — the protocol only authorizes entries off a live trigger line.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const side = pattern.direction === "bullish" ? "buy" : "sell";
  const advised = levels.entry;

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
          limitPrice: entryMode === "advised" ? advised : undefined,
          attachLevels: attachLevels
            ? { stopLoss: levels!.stopLoss, takeProfit: levels!.takeProfit1, masterProfit: levels!.masterProfit }
            : undefined,
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
          {side === "buy" ? "Long" : "Short"} {symbol} per the armed {pattern.name} setup.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={attachLevels}
            onChange={(e) => setAttachLevels(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Attach protocol stop ({formatUsd(levels.stopLoss)}) and TP1 ({formatUsd(levels.takeProfit1)})
        </label>

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
