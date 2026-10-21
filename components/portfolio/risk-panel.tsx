"use client";

/**
 * The risk dashboard (lib/risk/dashboard.ts, /api/risk/dashboard): the
 * account's money rules on one card, read the way an order is checked. It
 * shows what the next trade may risk, how much of the account's capital the
 * open shares hold, how many markets are open, the risk to each stop, and any
 * pause or hold in force. Display only; placement enforces.
 */

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatUsd } from "@/lib/utils";

interface RiskRow {
  symbol: string;
  side: "long" | "short";
  qty: number;
  entry: number;
  stops: number[];
  stopPastEntry: boolean;
  unprotectedQty: number;
  riskUsd: number | null;
  riskPctOfUnit: number | null;
  resting: boolean;
  option: boolean;
}

interface RiskData {
  equity: number;
  unit: number;
  maxRiskPerTrade: number;
  maxRiskSetBy: "unit" | "profits" | "novice_open_risk";
  capitalHeld: number;
  capitalRoom: number;
  markets: { stocks: number; maxStocks: number; other: number; maxOther: number };
  openRiskUsd: number;
  openRiskPctOfUnit: number;
  unprotected: number;
  novice: {
    maxPositionUsd: number;
    deployedRoomUsd: number;
    openRiskRoomUsd: number;
    symbolsOpen: number;
    maxSymbols: number | "unlimited";
  } | null;
  positions: RiskRow[];
  lossSeries: { consecutiveLosses: number; paused: boolean; note: string | null } | null;
  drawdown30dPct: number | null;
}

function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "bear" | "warn" }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-background px-3 py-2">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <span className={cn("text-lg font-semibold tabular-nums", tone === "bear" && "text-bear", tone === "warn" && "text-warn")}>
        {value}
      </span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

export function RiskPanel() {
  const [data, setData] = useState<RiskData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/risk/dashboard")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (!cancelled) setData(body as RiskData);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const holds: string[] = [];
  if (data?.lossSeries?.paused && data.lossSeries.note) holds.push(data.lossSeries.note);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent" /> Risk
        </CardTitle>
        <CardDescription>
          The rules every new order is checked against, read from your paper account now. Closing or protecting a
          position is never held by them.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-bear">{error}</p>}
        {!data && !error && <p className="text-sm text-muted">Reading your risk…</p>}
        {data && (
          <>
            {holds.length > 0 && (
              <div className="flex flex-col gap-1 rounded-lg border border-warn bg-warn-soft px-3 py-2 text-sm">
                {holds.map((h) => (
                  <p key={h}>{h}</p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure
                label="Most one trade may risk"
                value={formatUsd(data.maxRiskPerTrade)}
                note={
                  data.maxRiskSetBy === "profits"
                    ? "A tenth of your profits, which is less than a tenth of your trading capital"
                    : data.maxRiskSetBy === "novice_open_risk"
                      ? "The room left under your 2% open-risk limit"
                      : `A tenth of your trading capital, ${formatUsd(data.unit, 0)}`
                }
              />
              <Figure
                label="Capital held by open shares"
                value={formatUsd(data.capitalHeld, 0)}
                note={`${formatUsd(data.capitalRoom, 0)} of ${formatUsd(Math.max(data.equity, 0), 0)} still free`}
                tone={data.capitalRoom <= 0 ? "warn" : undefined}
              />
              {data.novice && data.novice.maxSymbols !== "unlimited" ? (
                <Figure
                  label="Symbols open"
                  value={`${data.novice.symbolsOpen} of ${data.novice.maxSymbols}`}
                  note="Novice accounts hold one symbol at a time"
                  tone={data.novice.symbolsOpen >= data.novice.maxSymbols ? "warn" : undefined}
                />
              ) : (
                <Figure
                  label="Markets open"
                  value={`${data.markets.stocks} of ${data.markets.maxStocks} stocks`}
                  note={`${data.markets.other} of ${data.markets.maxOther} crypto pairs`}
                  tone={data.markets.stocks >= data.markets.maxStocks ? "warn" : undefined}
                />
              )}
              <Figure
                label="Lost if every stop fills"
                value={formatUsd(data.openRiskUsd)}
                note={
                  data.unprotected > 0
                    ? `${data.unprotected} with shares no stop covers, not counted`
                    : `${data.openRiskPctOfUnit.toFixed(1)}% of your trading capital`
                }
                tone={data.unprotected > 0 ? "bear" : undefined}
              />
            </div>

            {data.novice && (
              <p className="text-xs text-muted">
                Novice limits: one position up to {formatUsd(data.novice.maxPositionUsd, 0)},{" "}
                {formatUsd(data.novice.deployedRoomUsd, 0)} more can be invested, and{" "}
                {formatUsd(data.novice.openRiskRoomUsd, 0)} more can be put at risk (read from each position&apos;s
                opening stop).
              </p>
            )}

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant={data.lossSeries?.paused ? "warn" : "muted"}>
                {data.lossSeries == null
                  ? "Losing streak: unread"
                  : `Losses in a row: ${data.lossSeries.consecutiveLosses} (three pause new entries)`}
              </Badge>
              <Badge variant="muted">
                {data.drawdown30dPct == null
                  ? "30-day drawdown: no record yet"
                  : `30-day drawdown: ${data.drawdown30dPct.toFixed(1)}%`}
              </Badge>
            </div>

            {data.positions.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-1 pr-3 font-medium">Symbol</th>
                      <th className="py-1 pr-3 font-medium">Side</th>
                      <th className="py-1 pr-3 text-right font-medium">Entry</th>
                      <th className="py-1 pr-3 text-right font-medium">Stop</th>
                      <th className="py-1 pr-3 text-right font-medium">At risk</th>
                      <th className="py-1 text-right font-medium">Of capital</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {data.positions.map((p, i) => {
                      const overTenth = p.riskUsd != null && p.riskUsd > data.maxRiskPerTrade + 0.005;
                      return (
                        <tr key={`${p.symbol}-${p.side}-${p.resting ? "r" : "o"}-${i}`} className="border-t border-border">
                          <td className="py-1.5 pr-3 font-medium">
                            {p.symbol}
                            {p.resting && <span className="ml-1 text-xs text-muted">resting</span>}
                          </td>
                          <td className="py-1.5 pr-3">{p.side === "long" ? "Long" : "Short"} {p.qty}</td>
                          <td className="py-1.5 pr-3 text-right">{formatUsd(p.entry)}</td>
                          <td className="py-1.5 pr-3 text-right">
                            {p.option ? (
                              <span className="text-muted">{p.side === "long" ? "Premium" : "None"}</span>
                            ) : p.stops.length === 0 ? (
                              <span className="text-bear">None</span>
                            ) : (
                              p.stops.map((st) => formatUsd(st)).join(", ")
                            )}
                            {!p.option && p.stops.length > 0 && p.unprotectedQty > 0 && (
                              <span className="block text-xs text-bear">{p.unprotectedQty} not covered</span>
                            )}
                          </td>
                          <td className={cn("py-1.5 pr-3 text-right", overTenth && "text-bear")}>
                            {p.riskUsd == null ? "Not covered" : p.stopPastEntry ? "None, stop past entry" : formatUsd(p.riskUsd)}
                          </td>
                          <td className="py-1.5 text-right">
                            {p.riskPctOfUnit == null ? "–" : `${p.riskPctOfUnit.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
