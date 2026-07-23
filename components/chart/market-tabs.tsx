"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatUsd } from "@/lib/utils";
import type { ScanResult } from "@/lib/types";
import type { OptionChain, Level2Book } from "@/lib/data/provider";

type Tab = "research" | "options" | "levelii";

const TABS: { id: Tab; label: string }[] = [
  { id: "research", label: "Research" },
  { id: "options", label: "Options" },
  { id: "levelii", label: "Level II" },
];

export function MarketTabs({ symbol, result }: { symbol: string; result?: ScanResult | null }) {
  const [tab, setTab] = useState<Tab>("research");

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-1 border-b border-border px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "relative px-3 py-2.5 text-sm font-medium cursor-pointer transition-colors " +
              (tab === t.id
                ? "text-accent after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent"
                : "text-muted hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "research" && <ResearchPanel symbol={symbol} result={result} />}
        {tab === "options" && <OptionsPanel symbol={symbol} />}
        {tab === "levelii" && <Level2Panel symbol={symbol} />}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Research */

function ResearchPanel({ symbol, result }: { symbol: string; result?: ScanResult | null }) {
  const [fetched, setFetched] = useState<ScanResult | null>(result ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (result) {
      setFetched(result);
      return;
    }
    let cancelled = false;
    setFetched(null);
    setError(null);
    fetch(`/api/scan?ticker=${encodeURIComponent(symbol)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ScanResult) => !cancelled && (d.error ? setError(d.error) : setFetched(d)))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [symbol, result]);

  if (error) return <p className="text-sm text-bear">{error}</p>;
  if (!fetched) return <Skeleton label="Running the protocol scan…" />;

  const dirVariant =
    fetched.decision.outputState === "Execute"
      ? "bull"
      : fetched.decision.outputState === "Reject"
        ? "bear"
        : "warn";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={dirVariant}>{fetched.decision.outputState}</Badge>
        <span className="text-sm text-muted">
          Score <span className="font-semibold text-foreground">{fetched.decision.score}</span>/9
        </span>
        {fetched.direction !== "none" && (
          <Badge variant={fetched.direction === "bullish" ? "bull" : "bear"}>
            {fetched.direction}
          </Badge>
        )}
        {fetched.gann.timeCycleActive && <Badge variant="warn">⏱ Gann time-cycle</Badge>}
      </div>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Multi-timeframe trend
        </h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {fetched.trends.map((t) => (
            <div key={t.timeframe} className="rounded-lg border border-border px-3 py-2">
              <div className="text-xs text-muted">{t.timeframe}</div>
              <div
                className={
                  "text-sm font-medium " +
                  (t.direction === "bullish"
                    ? "text-bull"
                    : t.direction === "bearish"
                      ? "text-bear"
                      : "text-muted")
                }
              >
                {t.direction}
              </div>
            </div>
          ))}
        </div>
      </section>

      {fetched.gann.fanLines.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Gann levels near price
          </h4>
          <div className="flex flex-wrap gap-2 text-xs">
            {fetched.gann.fanLines.slice(0, 4).map((f, i) => (
              <span key={`f${i}`} className="rounded-md bg-background px-2 py-1 text-muted">
                Fan {f.angle}: <span className="font-mono text-foreground">{formatUsd(f.price)}</span>
              </span>
            ))}
            {fetched.gann.squareOf9.slice(0, 4).map((s, i) => (
              <span key={`s${i}`} className="rounded-md bg-background px-2 py-1 text-muted">
                S9 {s.degree}°: <span className="font-mono text-foreground">{formatUsd(s.price)}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {fetched.decision.breakdown.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Confluence checklist
          </h4>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {fetched.decision.breakdown.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className={b.passed ? "text-bull" : "text-muted"}>{b.passed ? "✓" : "—"}</span>
                <span className="text-muted">
                  <span className="text-foreground">{b.criterion}.</span> {b.note}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Options */

function OptionsPanel({ symbol }: { symbol: string }) {
  const [chain, setChain] = useState<(OptionChain & { source?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setChain(null);
    setError(null);
    fetch(`/api/options?symbol=${encodeURIComponent(symbol)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => !cancelled && setChain(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (error) return <p className="text-sm text-bear">{error}</p>;
  if (!chain) return <Skeleton label="Loading options chain…" />;

  const strikes = Array.from(new Set(chain.contracts.map((c) => c.strike))).sort((a, b) => a - b);
  const byKey = new Map(chain.contracts.map((c) => [`${c.type}:${c.strike}`, c]));
  const atm = strikes.reduce((best, s) =>
    Math.abs(s - chain.underlyingPrice) < Math.abs(best - chain.underlyingPrice) ? s : best,
  strikes[0]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>
          Underlying <span className="font-mono text-foreground">{formatUsd(chain.underlyingPrice)}</span>
        </span>
        <span>· Exp {chain.expiration}</span>
        {chain.simulated && <Badge variant="muted">Simulated</Badge>}
      </div>
      <Table>
        <THead>
          <TR>
            <TH className="text-bull">Call bid</TH>
            <TH className="text-bull">Call ask</TH>
            <TH className="text-center">Δ</TH>
            <TH className="text-center font-semibold text-foreground">Strike</TH>
            <TH className="text-center">Δ</TH>
            <TH className="text-bear">Put bid</TH>
            <TH className="text-bear">Put ask</TH>
          </TR>
        </THead>
        <TBody>
          {strikes.map((strike) => {
            const call = byKey.get(`call:${strike}`);
            const put = byKey.get(`put:${strike}`);
            const isAtm = strike === atm;
            return (
              <TR key={strike} className={isAtm ? "bg-accent-soft/60" : undefined}>
                <TD className={"font-mono " + (call?.inTheMoney ? "text-bull" : "text-muted")}>
                  {call ? formatUsd(call.bid) : "—"}
                </TD>
                <TD className={"font-mono " + (call?.inTheMoney ? "text-bull" : "text-muted")}>
                  {call ? formatUsd(call.ask) : "—"}
                </TD>
                <TD className="text-center font-mono text-xs text-muted">{call?.delta ?? "—"}</TD>
                <TD className="text-center font-mono font-semibold">{formatUsd(strike)}</TD>
                <TD className="text-center font-mono text-xs text-muted">{put?.delta ?? "—"}</TD>
                <TD className={"font-mono " + (put?.inTheMoney ? "text-bear" : "text-muted")}>
                  {put ? formatUsd(put.bid) : "—"}
                </TD>
                <TD className={"font-mono " + (put?.inTheMoney ? "text-bear" : "text-muted")}>
                  {put ? formatUsd(put.ask) : "—"}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      {chain.simulated && (
        <p className="text-xs text-muted/80">
          Simulated chain anchored on the live underlying price — greeks and open interest are
          modelled, not exchange data. Wire a real options feed behind the provider seam to replace it.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Level II */

function Level2Panel({ symbol }: { symbol: string }) {
  const [book, setBook] = useState<(Level2Book & { source?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/level2?symbol=${encodeURIComponent(symbol)}`)
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
          return r.json();
        })
        .then((d) => !cancelled && setBook(d))
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));

    setBook(null);
    setError(null);
    load();
    timer.current = setInterval(load, 4000); // book refreshes for a live feel
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [symbol]);

  if (error) return <p className="text-sm text-bear">{error}</p>;
  if (!book) return <Skeleton label="Loading market depth…" />;

  const maxSize = Math.max(...book.bids.map((b) => b.size), ...book.asks.map((a) => a.size), 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>
          Last <span className="font-mono text-foreground">{formatUsd(book.price)}</span>
        </span>
        <span>· Spread <span className="font-mono text-foreground">{formatUsd(book.spread)}</span></span>
        {book.simulated && <Badge variant="muted">Simulated</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <DepthColumn title="Bids" side="bid" levels={book.bids} maxSize={maxSize} />
        <DepthColumn title="Asks" side="ask" levels={book.asks} maxSize={maxSize} />
      </div>
      {book.simulated && (
        <p className="text-xs text-muted/80">
          Simulated depth anchored on the live last price — sizes are modelled, not exchange data.
          A real Level II feed drops in behind the provider seam.
        </p>
      )}
    </div>
  );
}

function DepthColumn({
  title,
  side,
  levels,
  maxSize,
}: {
  title: string;
  side: "bid" | "ask";
  levels: { price: number; size: number }[];
  maxSize: number;
}) {
  const bar = side === "bid" ? "bg-bull/15" : "bg-bear/15";
  const text = side === "bid" ? "text-bull" : "text-bear";
  return (
    <div>
      <div className={"mb-1 text-xs font-semibold uppercase tracking-wide " + text}>{title}</div>
      <div className="flex flex-col gap-0.5">
        {levels.map((l, i) => (
          <div key={i} className="relative overflow-hidden rounded">
            <div
              className={"absolute inset-y-0 " + (side === "bid" ? "right-0 " : "left-0 ") + bar}
              style={{ width: `${(l.size / maxSize) * 100}%` }}
            />
            <div className="relative flex justify-between px-2 py-1 text-xs">
              <span className={"font-mono " + text}>{formatUsd(l.price)}</span>
              <span className="font-mono text-muted">{l.size.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shared */

function Skeleton({ label }: { label: string }) {
  return <div className="py-8 text-center text-sm text-muted">{label}</div>;
}
