"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatUsd, formatPct, cn } from "@/lib/utils";

interface Portfolio {
  mode: string;
  account: {
    equity: number;
    cash: number;
    buyingPower: number;
    dayPlPct: number;
  };
  positions: {
    symbol: string;
    qty: number;
    side: string;
    avgEntry: number;
    currentPrice: number;
    marketValue: number;
    unrealizedPl: number;
    unrealizedPlPct: number;
    todayPlPct: number;
    /** Most recently called stop-loss for this symbol, if one was captured
     * at order time (bracket orders only) — null if never recorded. */
    stopLoss: number | null;
  }[];
}

interface OrderRow {
  id: string;
  symbol: string;
  side: string;
  order_type: string;
  qty: number;
  limit_price: number | null;
  stop_price: number | null;
  take_profit: number | null;
  master_profit: number | null;
  filled_avg_price: number | null;
  filled_qty: number | null;
  status: string;
  created_at: string;
}

const FILLED_STATUSES = new Set(["filled", "partially_filled"]);

function isFilled(o: OrderRow): boolean {
  return FILLED_STATUSES.has(o.status);
}

interface SlAlert {
  key: string;
  symbol: string;
  message: string;
}

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [slAlerts, setSlAlerts] = useState<SlAlert[]>([]);
  const notifiedRef = useRef<Set<string>>(new Set());

  const checkStopLossHits = useCallback((positions: Portfolio["positions"]) => {
    for (const p of positions) {
      if (p.stopLoss == null) continue;
      const hit = p.side === "long" ? p.currentPrice <= p.stopLoss : p.currentPrice >= p.stopLoss;
      const key = `${p.symbol}:${p.stopLoss}`;
      if (!hit || notifiedRef.current.has(key)) continue;

      notifiedRef.current.add(key);
      const message = `${p.symbol} hit its stop-loss at ${formatUsd(p.stopLoss)} (current: ${formatUsd(p.currentPrice)}).`;
      setSlAlerts((prev) => [...prev, { key, symbol: p.symbol, message }]);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(`${p.symbol} stop-loss hit`, { body: message });
      }
    }
  }, []);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const loadPortfolio = () => {
      fetch("/api/portfolio")
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          setPortfolio(data);
          setError(null);
          checkStopLossHits(data.positions ?? []);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    };

    const loadOrders = () => {
      fetch("/api/orders")
        .then(async (res) => (res.ok ? (await res.json()).orders ?? [] : []))
        .then(setOrders)
        .catch(() => {});
    };

    // Initial load
    loadPortfolio();
    loadOrders();

    // Real-time updates: refresh portfolio every 10 seconds for live P/L tracking
    const portfolioInterval = setInterval(loadPortfolio, 10000);
    const ordersInterval = setInterval(loadOrders, 30000);

    return () => {
      clearInterval(portfolioInterval);
      clearInterval(ordersInterval);
    };
  }, [checkStopLossHits]);

  const dismissAlert = (key: string) => setSlAlerts((prev) => prev.filter((a) => a.key !== key));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Portfolio</h1>
        <Badge variant="muted">Paper account</Badge>
      </div>

      {slAlerts.map((a) => (
        <Card key={a.key} className="border-bear">
          <CardContent className="flex items-center justify-between py-3 text-sm text-bear">
            <span>{a.message}</span>
            <button onClick={() => dismissAlert(a.key)} className="text-xs text-muted hover:text-foreground">
              Dismiss
            </button>
          </CardContent>
        </Card>
      ))}

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-bear">{error}</CardContent>
        </Card>
      )}

      {portfolio && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Equity" value={formatUsd(portfolio.account.equity)} />
          <Stat
            label="Today"
            value={formatPct(portfolio.account.dayPlPct)}
            tone={portfolio.account.dayPlPct >= 0 ? "bull" : "bear"}
          />
          <Stat label="Cash" value={formatUsd(portfolio.account.cash)} />
          <Stat label="Buying power" value={formatUsd(portfolio.account.buyingPower)} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Open positions</CardTitle>
          <CardDescription>Live P/L per position, updated every 10 seconds.</CardDescription>
        </CardHeader>
        <CardContent>
          {portfolio && portfolio.positions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No open positions. Find a setup in the <Link href="/scanner" className="text-accent hover:underline">scanner</Link> and place a paper order.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Symbol</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Avg entry</TH>
                  <TH className="text-right">Price</TH>
                  <TH className="text-right">Value</TH>
                  <TH className="text-right">Unrealized P/L</TH>
                  <TH className="text-right">Today</TH>
                  <TH className="text-center">Action</TH>
                </TR>
              </THead>
              <TBody>
                {portfolio?.positions.map((p) => (
                  <TR key={p.symbol}>
                    <TD>
                      <Link href={`/ticker/${p.symbol}`} className="font-medium text-accent hover:underline">
                        {p.symbol}
                      </Link>
                    </TD>
                    <TD className="text-right font-mono">{p.qty}</TD>
                    <TD className="text-right font-mono">{formatUsd(p.avgEntry)}</TD>
                    <TD className="text-right font-mono">{formatUsd(p.currentPrice)}</TD>
                    <TD className="text-right font-mono">{formatUsd(p.marketValue)}</TD>
                    <TD className={cn("text-right font-mono", p.unrealizedPl >= 0 ? "text-bull" : "text-bear")}>
                      {formatUsd(p.unrealizedPl)} ({formatPct(p.unrealizedPlPct)})
                    </TD>
                    <TD className={cn("text-right font-mono", p.todayPlPct >= 0 ? "text-bull" : "text-bear")}>
                      {formatPct(p.todayPlPct)}
                    </TD>
                    <TD className="text-center">
                      <button className="text-xs text-muted hover:text-foreground">Close</button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filled orders</CardTitle>
          <CardDescription>Trade history: called levels at order time vs. actual fill.</CardDescription>
        </CardHeader>
        <CardContent>
          <OrdersTable orders={orders.filter(isFilled)} emptyLabel="No filled orders yet." showFill />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending orders</CardTitle>
          <CardDescription>Placed but not yet filled, canceled, or rejected.</CardDescription>
        </CardHeader>
        <CardContent>
          <OrdersTable orders={orders.filter((o) => !isFilled(o))} emptyLabel="No pending orders." showFill={false} />
        </CardContent>
      </Card>
    </div>
  );
}

function OrdersTable({
  orders,
  emptyLabel,
  showFill,
}: {
  orders: OrderRow[];
  emptyLabel: string;
  showFill: boolean;
}) {
  if (orders.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Placed</TH>
          <TH>Symbol</TH>
          <TH>Side</TH>
          <TH>Type</TH>
          <TH className="text-right">Qty</TH>
          <TH className="text-right">Called entry</TH>
          <TH className="text-right">Called SL</TH>
          <TH className="text-right">Called TP1</TH>
          <TH className="text-right">Called MTP</TH>
          {showFill && <TH className="text-right">Fill price</TH>}
          <TH>Status</TH>
        </TR>
      </THead>
      <TBody>
        {orders.map((o) => (
          <TR key={o.id}>
            <TD className="text-muted">{new Date(o.created_at).toLocaleString()}</TD>
            <TD className="font-medium">{o.symbol}</TD>
            <TD className={o.side === "buy" ? "text-bull" : "text-bear"}>{o.side}</TD>
            <TD className="text-muted">{o.order_type}</TD>
            <TD className="text-right font-mono">{o.qty}</TD>
            <TD className="text-right font-mono">{o.limit_price ? formatUsd(o.limit_price) : "Market"}</TD>
            <TD className="text-right font-mono">{o.stop_price ? formatUsd(o.stop_price) : "—"}</TD>
            <TD className="text-right font-mono">{o.take_profit ? formatUsd(o.take_profit) : "—"}</TD>
            <TD className="text-right font-mono">{o.master_profit ? formatUsd(o.master_profit) : "—"}</TD>
            {showFill && (
              <TD className="text-right font-mono">
                {o.filled_avg_price ? `${formatUsd(o.filled_avg_price)} × ${o.filled_qty ?? o.qty}` : "—"}
              </TD>
            )}
            <TD>
              <Badge variant={isFilled(o) ? "bull" : "muted"}>{o.status}</Badge>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted">{label}</p>
        <p className={cn("mt-1 font-mono text-lg font-semibold", tone === "bull" && "text-bull", tone === "bear" && "text-bear")}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
