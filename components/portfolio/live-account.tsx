"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatPct, formatUsd } from "@/lib/utils";
import type { LiveAccountSnapshot } from "@/lib/portfolio/live-account";

type State = { kind: "loading" } | { kind: "not_connected" } | { kind: "error"; message: string } | { kind: "ok"; data: LiveAccountSnapshot };

const usd = (v: number | null) => (v == null ? "—" : formatUsd(v));
const pct = (v: number | null) => (v == null ? "—" : formatPct(v * 100));
const tone = (v: number | null) => (v == null ? undefined : v >= 0 ? "text-bull" : "text-bear");

/**
 * The Portfolio page's Live view: the member's own Alpaca live account, read
 * from the broker. It shows; it never acts. There is no Close or Edit here,
 * so no button on this view can move real money; positions are managed by
 * the automation's own resting stops, or at the broker.
 */
export function LiveAccountView() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(
    () =>
      fetch("/api/portfolio/live")
        .then(async (res) => {
          const text = await res.text();
          let body: Record<string, unknown> = {};
          try {
            body = text ? JSON.parse(text) : {};
          } catch {
            body = {};
          }
          if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `The live account couldn't be read (${res.status}).`);
          if (body.connected === false) setState({ kind: "not_connected" });
          else setState({ kind: "ok", data: body as unknown as LiveAccountSnapshot });
        })
        .catch((err) => setState({ kind: "error", message: err instanceof Error ? err.message : String(err) })),
    [],
  );

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (state.kind === "loading") return <p className="text-sm text-muted">Reading your live account…</p>;
  if (state.kind === "not_connected") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 py-6 text-sm">
          <p>No live account is connected, or it is paused.</p>
          <div>
            <Link href="/settings">
              <Button variant="outline" size="sm">Connect it in Settings</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (state.kind === "error") {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-bear">{state.message}</CardContent>
      </Card>
    );
  }

  const { account, positions, orders } = state.data;
  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div role="note" className="rounded-lg border border-bear/40 bg-bear-soft/30 px-4 py-3 text-sm">
        <span className="font-semibold">Live account: real money.</span> These figures come straight from your broker. This view
        only shows the account; nothing on it places, changes or closes an order.
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <LiveStat label="Equity" value={usd(account.equity)} />
        <LiveStat
          label="Today"
          value={account.dayPl == null ? "—" : `${usd(account.dayPl)} (${pct(account.dayPlPct)})`}
          className={tone(account.dayPl)}
        />
        <LiveStat label="Cash" value={usd(account.cash)} />
        <LiveStat
          label="Day trades (5 sessions)"
          value={
            account.dayTradeCount == null
              ? "—"
              : account.equity != null && account.equity >= 25_000
                ? String(account.dayTradeCount)
                : `${account.dayTradeCount} of 3`
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live positions ({positions.length})</CardTitle>
          <CardDescription>What the account holds now, at the broker&apos;s prices.</CardDescription>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <p className="text-sm text-muted">No open positions.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Symbol</th>
                    <th className="py-2 pr-3 font-medium">Shares</th>
                    <th className="py-2 pr-3 font-medium">Entry</th>
                    <th className="py-2 pr-3 font-medium">Price</th>
                    <th className="py-2 pr-3 font-medium">Stop</th>
                    <th className="py-2 pr-3 font-medium">P/L</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {positions.map((p) => (
                    <tr key={p.symbol} className="border-t border-border">
                      <td className="py-2 pr-3 font-sans font-semibold">
                        {p.symbol} {p.side === "short" && <Badge variant="muted">short</Badge>}
                      </td>
                      <td className="py-2 pr-3">{p.qty ?? "—"}</td>
                      <td className="py-2 pr-3">{usd(p.avgEntryPrice)}</td>
                      <td className="py-2 pr-3">{usd(p.currentPrice)}</td>
                      <td className="py-2 pr-3">{p.stopPrice == null ? (
                          <span className="font-sans text-bear">none resting</span>
                        ) : (
                          <>
                            {usd(p.stopPrice)} {p.stopPartial && <span className="font-sans text-bear">(part of the shares)</span>}
                          </>
                        )}</td>
                      <td className={cn("py-2 pr-3", tone(p.unrealizedPl))}>
                        {usd(p.unrealizedPl)} {p.unrealizedPlPct != null && `(${pct(p.unrealizedPlPct)})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Working orders ({orders.length})</CardTitle>
          <CardDescription>Orders resting at the broker, protective stops included.</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted">No working orders.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <span className="font-semibold">{o.symbol}</span>
                  <Badge variant="muted">
                    {o.side} {o.type}
                  </Badge>
                  <span className="font-mono">{o.qty ?? "—"} sh</span>
                  {o.stopPrice != null && <span className="font-mono">stop {usd(o.stopPrice)}</span>}
                  {o.limitPrice != null && <span className="font-mono">limit {usd(o.limitPrice)}</span>}
                  <span className="text-muted">{o.status}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LiveStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted">{label}</p>
        <p className={cn("mt-1 font-mono text-lg font-semibold", className)}>{value}</p>
      </CardContent>
    </Card>
  );
}
