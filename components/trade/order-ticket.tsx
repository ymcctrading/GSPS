"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd, cn } from "@/lib/utils";
import type { ScanResult } from "@/lib/types";

type EntryMode = "advised" | "now";
type Side = "buy" | "sell";

export function OrderTicket({
  result,
  livePrice,
}: {
  result: ScanResult;
  livePrice?: number | null;
}) {
  const { levels, pattern, symbol } = result;
  const marketPrice = livePrice ?? (result.currentPrice > 0 ? result.currentPrice : null);

  const armedSide: Side | null = pattern
    ? pattern.direction === "bullish"
      ? "buy"
      : "sell"
    : null;

  const [side, setSide] = useState<Side>(armedSide ?? "buy");
  const [qty, setQty] = useState("1");
  const [entryMode, setEntryMode] = useState<EntryMode>(armedSide ? "advised" : "now");
  const [attachLevels, setAttachLevels] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // The protocol's advised entry and bracket only apply when trading the same
  // direction as the armed setup. Otherwise it's a plain market order.
  const matchesArmed = pattern != null && levels != null && side === armedSide;
  const effectiveMode: EntryMode = matchesArmed ? entryMode : "now";
  const advised = levels?.entry ?? null;
  const canAttach = matchesArmed && attachLevels;

  const summary = useMemo(() => {
    if (!pattern) return "Manual order — no Strat setup is currently armed.";
    if (matchesArmed) {
      return `${side === "buy" ? "Long" : "Short"} ${symbol} per the armed ${pattern.name} ${pattern.direction} setup.`;
    }
    return `Manual ${side === "buy" ? "long" : "short"} ${symbol} — against the armed ${pattern.name} ${pattern.direction} setup, so protocol levels don't apply.`;
  }, [pattern, matchesArmed, side, symbol]);

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
          entryMode: effectiveMode,
          limitPrice: effectiveMode === "advised" ? advised ?? undefined : undefined,
          attachLevels: canAttach
            ? {
                stopLoss: levels!.stopLoss,
                takeProfit: levels!.takeProfit1,
                masterProfit: levels!.masterProfit,
              }
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
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Buy / Sell */}
        <div className="grid grid-cols-2 gap-2">
          <SideButton active={side === "buy"} side="buy" onClick={() => setSide("buy")} />
          <SideButton active={side === "sell"} side="sell" onClick={() => setSide("sell")} />
        </div>

        {/* Entry mode — advised only offered when trading the armed direction. */}
        <div className="grid grid-cols-2 gap-2">
          {matchesArmed && advised != null ? (
            <ModeButton
              active={effectiveMode === "advised"}
              onClick={() => setEntryMode("advised")}
              title="At advised price"
              subtitle={formatUsd(advised)}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-left">
              <p className="text-sm font-medium text-muted/70">Advised price</p>
              <p className="font-mono text-xs text-muted/60">
                {pattern ? "armed other side" : "no setup"}
              </p>
            </div>
          )}
          <ModeButton
            active={effectiveMode === "now"}
            onClick={() => setEntryMode("now")}
            title={`${side === "buy" ? "Buy" : "Sell"} now (market)`}
            subtitle={marketPrice != null ? formatUsd(marketPrice) : "market"}
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

        {matchesArmed && levels && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={attachLevels}
              onChange={(e) => setAttachLevels(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Attach protocol stop ({formatUsd(levels.stopLoss)}) and TP1 ({formatUsd(levels.takeProfit1)})
          </label>
        )}

        <Button
          variant={side === "buy" ? "bull" : "bear"}
          onClick={submit}
          disabled={submitting || Number(qty) < 1}
        >
          {submitting
            ? "Placing…"
            : `${side === "buy" ? "Buy" : "Sell"} ${Number(qty) || ""} ${symbol}`.trim()}
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

function SideButton({ active, side, onClick }: { active: boolean; side: Side; onClick: () => void }) {
  const buy = side === "buy";
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-center text-sm font-semibold uppercase tracking-wide transition-colors cursor-pointer",
        active
          ? buy
            ? "border-bull bg-bull/10 text-bull"
            : "border-bear bg-bear/10 text-bear"
          : "border-border text-muted hover:border-muted",
      )}
    >
      {buy ? "Buy / Long" : "Sell / Short"}
    </button>
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
