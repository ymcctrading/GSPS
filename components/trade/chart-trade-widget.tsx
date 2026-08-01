"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingUp, TrendingDown, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd, formatPct, cn } from "@/lib/utils";

type Side = "buy" | "sell";
type OrderKind = "market" | "limit";

/**
 * Quick Buy/Sell overlay pinned to the chart canvas, plus the live P/L drawer
 * it opens on fill.
 *
 * The drawer tracks the position the user just took on *this* symbol: it polls
 * the portfolio, finds the matching position and prints its live P/L. It stays
 * tethered to the chart (absolutely positioned inside the chart's relative
 * container) rather than floating over the whole page, so it reads as belonging
 * to the asset on screen.
 */
export function ChartTradeWidget({
  symbol,
  livePrice,
}: {
  symbol: string;
  livePrice?: number | null;
}) {
  const [ticket, setTicket] = useState<Side | null>(null);
  // Set once an order is placed from here — turns the drawer on for this symbol.
  const [tracking, setTracking] = useState(false);

  return (
    <>
      <div className="pointer-events-auto absolute left-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-border bg-surface/90 p-1 shadow-sm backdrop-blur">
        <button
          onClick={() => setTicket("buy")}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-bull transition-colors hover:bg-bull/10 cursor-pointer"
          title={`Buy ${symbol}`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          Buy
        </button>
        <span className="h-4 w-px bg-border" />
        <button
          onClick={() => setTicket("sell")}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-bear transition-colors hover:bg-bear/10 cursor-pointer"
          title={`Sell ${symbol}`}
        >
          <TrendingDown className="h-3.5 w-3.5" />
          Sell
        </button>
      </div>

      {tracking && <LivePlDrawer symbol={symbol} onDismiss={() => setTracking(false)} />}

      <QuickTicket
        symbol={symbol}
        side={ticket}
        livePrice={livePrice ?? null}
        onClose={() => setTicket(null)}
        onFilled={() => setTracking(true)}
      />
    </>
  );
}

function QuickTicket({
  symbol,
  side,
  livePrice,
  onClose,
  onFilled,
}: {
  symbol: string;
  side: Side | null;
  livePrice: number | null;
  onClose: () => void;
  onFilled: () => void;
}) {
  const [qty, setQty] = useState("1");
  const [kind, setKind] = useState<OrderKind>("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Reset the ticket when a fresh Buy/Sell is opened — keyed on `side` alone
  // (not `livePrice`) so a price tick while the ticket is open doesn't wipe
  // whatever the user has already typed. A render-phase adjustment, not an
  // effect, so it can't cascade into a second commit.
  const [seenSide, setSeenSide] = useState(side);
  if (side !== seenSide) {
    setSeenSide(side);
    if (side) {
      setQty("1");
      setKind("market");
      setLimitPrice(livePrice ? String(livePrice) : "");
      setFeedback(null);
    }
  }

  const quantity = Number(qty);
  const limit = Number(limitPrice);
  const estimate =
    kind === "limit"
      ? Number.isFinite(limit) && limit > 0
        ? limit * quantity
        : null
      : livePrice != null
        ? livePrice * quantity
        : null;

  const invalid =
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    (kind === "limit" && (!Number.isFinite(limit) || limit <= 0));

  async function submit() {
    if (!side) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          assetClass: "equity",
          side,
          qty: quantity,
          entryMode: kind === "limit" ? "advised" : "now",
          limitPrice: kind === "limit" ? limit : undefined,
          mode: "paper",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, text: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setFeedback({ ok: true, text: `Paper order placed — ${data.order?.status ?? "accepted"}.` });
      onFilled();
      // Let the confirmation land before the modal closes.
      setTimeout(onClose, 900);
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={Boolean(side)}
      onClose={onClose}
      title={`${side === "buy" ? "Buy" : "Sell"} ${symbol}`}
      description={livePrice != null ? `Last ${formatUsd(livePrice)}` : "Market price unavailable"}
      footer={
        <div className="flex flex-col gap-2">
          <Button
            variant={side === "buy" ? "bull" : "bear"}
            onClick={submit}
            disabled={invalid || submitting}
          >
            {submitting
              ? "Placing…"
              : `${side === "buy" ? "Buy" : "Sell"} ${quantity || 0} ${symbol}${
                  estimate != null ? ` · ${formatUsd(estimate)}` : ""
                }`}
          </Button>
          {feedback && (
            <p className={cn("text-sm", feedback.ok ? "text-bull" : "text-bear")}>{feedback.text}</p>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <KindButton active={kind === "market"} onClick={() => setKind("market")} title="Buy now (market)" subtitle={livePrice != null ? formatUsd(livePrice) : "market"} />
          <KindButton active={kind === "limit"} onClick={() => setKind("limit")} title="Limit order" subtitle="your price" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Quantity (shares)</span>
            <Input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          {kind === "limit" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">Limit price</span>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
              />
            </label>
          )}
        </div>

        <div className="rounded-lg border border-border bg-background p-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted">Estimated {side === "buy" ? "outlay" : "proceeds"}</span>
            <span className="font-mono text-base font-semibold tabular-nums">
              {estimate != null ? formatUsd(estimate) : "—"}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">
            Routes to your paper account. A live P/L panel opens on the chart once this fills.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function KindButton({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
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

interface TrackedPosition {
  symbol: string;
  qty: number;
  avgEntry: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  todayPlPct: number;
}

/**
 * Floating P/L panel tethered to the chart. Polls the portfolio on the same
 * 10-second cadence the portfolio page uses and shows the position for this
 * symbol; while the broker hasn't reported a fill yet it says so rather than
 * rendering zeroes.
 */
function LivePlDrawer({ symbol, onDismiss }: { symbol: string; onDismiss: () => void }) {
  const [position, setPosition] = useState<TrackedPosition | null>(null);
  const [pending, setPending] = useState(true);

  const load = useCallback(() => {
    fetch("/api/portfolio")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { positions?: TrackedPosition[] } | null) => {
        if (!data?.positions) return;
        const match = data.positions.find(
          (p) => p.symbol.toUpperCase() === symbol.toUpperCase(),
        );
        setPosition(match ?? null);
        setPending(false);
      })
      .catch(() => {});
  }, [symbol]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const up = (position?.unrealizedPl ?? 0) >= 0;

  return (
    <div className="pointer-events-auto absolute right-2 top-2 z-10 w-52 rounded-lg border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          {symbol} position
        </span>
        <button
          onClick={onDismiss}
          aria-label="Hide P/L panel"
          className="rounded p-0.5 text-muted transition-colors hover:text-foreground cursor-pointer"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {position ? (
        <div className="flex flex-col gap-1.5">
          <div className={cn("font-mono text-lg font-semibold tabular-nums", up ? "text-bull" : "text-bear")}>
            {formatUsd(position.unrealizedPl)}
          </div>
          <div className={cn("font-mono text-xs tabular-nums", up ? "text-bull" : "text-bear")}>
            {formatPct(position.unrealizedPlPct)} unrealized
          </div>
          <div className="mt-1 flex flex-col gap-0.5 border-t border-border pt-1.5 text-[11px] text-muted">
            <Row label="Qty" value={String(position.qty)} />
            <Row label="Avg entry" value={formatUsd(position.avgEntry)} />
            <Row label="Last" value={formatUsd(position.currentPrice)} />
            <Row label="Today" value={formatPct(position.todayPlPct)} />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">
          {pending ? "Loading position…" : "Waiting for the fill to report…"}
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className="font-mono tabular-nums text-foreground/80">{value}</span>
    </div>
  );
}
