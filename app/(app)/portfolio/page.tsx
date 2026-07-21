"use client";

import { useEffect, useState } from "react";
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
  }[];
}

interface OrderRow {
  id: string;
  symbol: string;
  side: string;
  order_type: string;
  qty: number;
  limit_price: number | null;
  status: string;
  created_at: string;
}

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portfolio")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setPortfolio(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    fetch("/api/orders")
      .then(async (res) => (res.ok ? (await res.json()).orders ?? [] : []))
      .then(setOrders)
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Portfolio</h1>
        <Badge variant="muted">Paper account</Badge>
      </div>

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
          <CardDescription>Live P/L per position, ThinkOrSwim-style.</CardDescription>
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
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order history</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No orders yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Placed</TH>
                  <TH>Symbol</TH>
                  <TH>Side</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Limit</TH>
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
                    <TD className="text-right font-mono">{o.limit_price ? formatUsd(o.limit_price) : "—"}</TD>
                    <TD>
                      <Badge variant={o.status === "filled" ? "bull" : "muted"}>{o.status}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
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
