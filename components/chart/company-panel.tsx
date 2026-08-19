"use client";

/**
 * Company tab — the fundamentals/flow read (analyst coverage, price target,
 * short interest, institutional ownership, capital flow, margin terms) that
 * GSPS's own Research tab never carried, alongside a synthesis banner that
 * reads it together with GSPS's own structural score.
 *
 * That banner is the point of this file, not the sections under it: GSPS
 * scores *structure* (Gann levels, multi-timeframe trend, pattern triggers)
 * and has no opinion on consensus or flow; a sell-side panel and institutional
 * buying scores *positioning* and has no opinion on structure. Neither alone
 * says whether a setup is crowded into agreement or fighting the tape — that
 * read only exists once both are on the same screen, so it's computed here
 * rather than shipped by either side.
 */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PanelError, Skeleton } from "@/components/chart/market-tabs";
import { formatUsd, cn } from "@/lib/utils";
import type { ScanResult } from "@/lib/types";
import type { CompanySnapshot } from "@/lib/data/company";

export function CompanyPanel({
  symbol,
  result,
}: {
  symbol: string;
  result?: ScanResult | null;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<{
    key: string;
    snapshot: (CompanySnapshot & { source?: string }) | null;
    error: string | null;
  }>({ key: "", snapshot: null, error: null });

  const key = `${symbol}:${reloadKey}`;
  const current = state.key === key ? state : null;
  const snapshot = current?.snapshot ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/company?symbol=${encodeURIComponent(symbol)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => !cancelled && setState({ key, snapshot: d, error: null }))
      .catch(
        (e) =>
          !cancelled &&
          setState({ key, snapshot: null, error: e instanceof Error ? e.message : String(e) }),
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, reloadKey]);

  if (error) return <PanelError message={error} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!snapshot) return <Skeleton label="Loading company snapshot…" />;

  const conviction = blendConviction(result ?? null, snapshot);

  return (
    <div className="flex flex-col gap-5">
      <ConvictionBanner conviction={conviction} />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionHeader noMargin>Analyst rating · Price target</SectionHeader>
          <DataSourceBadge
            live={snapshot.sources.analystRating === "finnhub" && snapshot.sources.priceTarget === "finnhub"}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <Badge variant={consensusVariant(snapshot.analystRating.consensus)}>
                {snapshot.analystRating.consensus}
              </Badge>
              <span className="text-xs text-muted">
                {snapshot.analystRating.totalAnalysts} analysts
              </span>
            </div>
            <RatingBar rating={snapshot.analystRating} />
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <div className="text-xs text-muted">Average target</div>
            <div className="font-mono text-lg font-semibold text-foreground">
              {formatUsd(snapshot.priceTarget.avg)}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted">
              <span>Low {formatUsd(snapshot.priceTarget.low)}</span>
              <span
                className={cn(
                  "font-medium",
                  snapshot.priceTarget.upsidePct >= 0 ? "text-bull" : "text-bear",
                )}
              >
                {snapshot.priceTarget.upsidePct >= 0 ? "+" : ""}
                {snapshot.priceTarget.upsidePct.toFixed(1)}% vs last
              </span>
              <span>High {formatUsd(snapshot.priceTarget.high)}</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader>Short interest · Margin</SectionHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border px-3 py-2">
            <div className="text-xs text-muted">Short interest (last settlement)</div>
            <div className="font-mono text-lg font-semibold text-foreground">
              {formatShares(latestShort(snapshot).shortInterestShares)}
            </div>
            <div className="text-xs text-muted">
              {latestShort(snapshot).daysToCover.toFixed(2)} days to cover ·{" "}
              {latestShort(snapshot).date}
            </div>
            <ShortInterestSparkline points={snapshot.shortInterest} />
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <div className="flex items-center justify-between rounded-md bg-bull-soft px-2 py-1.5 text-sm">
              <span className="text-muted">Marginable, up to {snapshot.margin.maxLongLeverage}x</span>
              <span className="font-mono font-semibold text-bull">
                {snapshot.margin.marginRatePct.toFixed(2)}%
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between rounded-md bg-bear-soft px-2 py-1.5 text-sm">
              <span className="text-muted">
                Shortable, up to {snapshot.margin.maxShortLeverage.toFixed(2)}x
              </span>
              <span className="font-mono font-semibold text-bear">
                {snapshot.margin.shortLoanRatePct.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader>Institutional ownership</SectionHeader>
        <div className="rounded-lg border border-border px-3 py-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Institutions" value={snapshot.institutionalOwnership.institutions.toLocaleString()} />
            <Stat label="Shares owned" value={formatShares(snapshot.institutionalOwnership.sharesOwned)} />
            <Stat label="Held %" value={`${snapshot.institutionalOwnership.heldPercent.toFixed(1)}%`} />
          </div>
          <BuySellBar
            buyPct={snapshot.institutionalOwnership.buyPercent}
            sellPct={snapshot.institutionalOwnership.sellPercent}
          />
        </div>
      </section>

      <section>
        <SectionHeader>Capital flow</SectionHeader>
        <div className="rounded-lg border border-border px-3 py-2">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-bull">
              Inflow <span className="font-mono font-semibold">${snapshot.capitalFlow.inflowM.toFixed(1)}M</span>
            </span>
            <span className="text-bear">
              Outflow <span className="font-mono font-semibold">${snapshot.capitalFlow.outflowM.toFixed(1)}M</span>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <FlowRow
              label="Large"
              inM={snapshot.capitalFlow.large.inM}
              outM={snapshot.capitalFlow.large.outM}
            />
            <FlowRow
              label="Medium"
              inM={snapshot.capitalFlow.medium.inM}
              outM={snapshot.capitalFlow.medium.outM}
            />
            <FlowRow
              label="Small"
              inM={snapshot.capitalFlow.small.inM}
              outM={snapshot.capitalFlow.small.outM}
            />
          </div>
        </div>
      </section>

      <section>
        <SectionHeader>Volatility</SectionHeader>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border px-3 py-2">
            <div className="text-xs text-muted">Implied volatility</div>
            <div className="font-mono text-sm font-medium text-foreground">
              {snapshot.impliedVolatilityPct.toFixed(1)}%
            </div>
            <div className="text-xs text-muted">{ordinal(snapshot.ivPercentile)} percentile (52w)</div>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <div className="text-xs text-muted">Historical volatility</div>
            <div className="font-mono text-sm font-medium text-foreground">
              {snapshot.historicalVolatilityPct.toFixed(1)}%
            </div>
            <div className="text-xs text-muted">{ordinal(snapshot.hvPercentile)} percentile (52w)</div>
          </div>
        </div>
      </section>

      <p className="text-xs text-muted/80">
        {snapshot.sources.analystRating === "finnhub" || snapshot.sources.priceTarget === "finnhub"
          ? "Analyst rating and price target are live (Finnhub). Short interest, institutional flow and margin terms are still modelled — no vendor for those is wired up yet."
          : "Simulated fundamentals — analyst coverage, short interest, institutional flow and margin terms are all modelled, not vendor data. Set FINNHUB_API_KEY to bring analyst rating and price target live."}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- synthesis */

type ConvictionLabel =
  | "Bullish confluence"
  | "Leans bullish"
  | "Mixed signal"
  | "Leans bearish"
  | "Bearish confluence"
  | "No structural read";

interface Conviction {
  label: ConvictionLabel;
  blended: number; // 0–1, 0.5 = neutral
  structuralNote: string;
  fundamentalNote: string;
  flowNote: string;
}

/**
 * Blends three independent reads into one number: GSPS's structural score
 * (direction + confidence from the protocol scan), the analyst panel's
 * bullishness, and institutional buy/sell flow. Weighted toward structure
 * (GSPS's own edge) with fundamentals and flow as corroboration — a
 * high-score structural setup that consensus and money flow both confirm
 * reads very differently from the same setup fighting both.
 */
function blendConviction(result: ScanResult | null, snapshot: CompanySnapshot): Conviction {
  const fundamentalBull = snapshot.analystRating.bullishness;
  const flowBull = snapshot.institutionalOwnership.buyPercent / 100;

  if (!result || result.direction === "none") {
    const blended = fundamentalBull * 0.6 + flowBull * 0.4;
    return {
      label: "No structural read",
      blended,
      structuralNote: result
        ? "No directional setup armed"
        : "Structural scan not yet in",
      fundamentalNote: `${snapshot.analystRating.consensus} (${snapshot.analystRating.totalAnalysts} analysts)`,
      flowNote: `${snapshot.institutionalOwnership.buyPercent.toFixed(0)}% institutions buying`,
    };
  }

  const structuralConfidence = result.decision.score / 9; // 0–1
  const bullish = result.direction === "bullish";
  const structuralLean = bullish
    ? 0.5 + structuralConfidence * 0.5
    : 0.5 - structuralConfidence * 0.5;

  const blended = structuralLean * 0.45 + fundamentalBull * 0.3 + flowBull * 0.25;

  const fundamentalAgrees = bullish ? fundamentalBull >= 0.5 : fundamentalBull < 0.5;
  const flowAgrees = bullish ? flowBull >= 0.5 : flowBull < 0.5;
  const agreeCount = Number(fundamentalAgrees) + Number(flowAgrees);

  let label: ConvictionLabel;
  if (agreeCount === 2) label = bullish ? "Bullish confluence" : "Bearish confluence";
  else if (agreeCount === 1) label = bullish ? "Leans bullish" : "Leans bearish";
  else label = "Mixed signal";

  return {
    label,
    blended,
    structuralNote: `${result.decision.outputState} · ${result.decision.score}/9 ${bullish ? "bullish" : "bearish"}`,
    fundamentalNote: `${snapshot.analystRating.consensus} (${snapshot.analystRating.totalAnalysts} analysts) — ${fundamentalAgrees ? "agrees" : "disagrees"}`,
    flowNote: `${snapshot.institutionalOwnership.buyPercent.toFixed(0)}% institutions buying — ${flowAgrees ? "agrees" : "disagrees"}`,
  };
}

function ConvictionBanner({ conviction }: { conviction: Conviction }) {
  const variant =
    conviction.label === "Bullish confluence"
      ? "bull"
      : conviction.label === "Bearish confluence"
        ? "bear"
        : conviction.label === "Leans bullish"
          ? "bull"
          : conviction.label === "Leans bearish"
            ? "bear"
            : conviction.label === "Mixed signal"
              ? "warn"
              : "muted";

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant={variant}>{conviction.label}</Badge>
        <span className="text-xs text-muted">
          Structure × consensus × institutional flow, blended
        </span>
      </div>
      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className={cn("h-full rounded-full", conviction.blended >= 0.5 ? "bg-bull" : "bg-bear")}
          style={{ width: `${Math.round(conviction.blended * 100)}%` }}
        />
      </div>
      <dl className="grid gap-1 text-xs text-muted sm:grid-cols-3">
        <div>
          <dt className="font-semibold uppercase tracking-wide text-muted/70">Structure</dt>
          <dd>{conviction.structuralNote}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-muted/70">Consensus</dt>
          <dd>{conviction.fundamentalNote}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-muted/70">Flow</dt>
          <dd>{conviction.flowNote}</dd>
        </div>
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

function SectionHeader({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return (
    <h4
      className={cn(
        "text-xs font-semibold uppercase tracking-wide text-muted",
        !noMargin && "mb-2",
      )}
    >
      {children}
    </h4>
  );
}

/** Small pill marking a section's data as live-vendor vs. modelled. */
function DataSourceBadge({ live }: { live: boolean }) {
  return (
    <Badge variant={live ? "bull" : "muted"} className="text-[10px]">
      {live ? "Live · Finnhub" : "Simulated"}
    </Badge>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-sm font-semibold text-foreground">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function consensusVariant(consensus: CompanySnapshot["analystRating"]["consensus"]) {
  if (consensus === "Strong Buy" || consensus === "Buy") return "bull" as const;
  if (consensus === "Underperform" || consensus === "Sell") return "bear" as const;
  return "warn" as const;
}

function RatingBar({ rating }: { rating: CompanySnapshot["analystRating"] }) {
  const segments = [
    { pct: rating.strongBuyPct, cls: "bg-bull" },
    { pct: rating.buyPct, cls: "bg-bull/50" },
    { pct: rating.holdPct, cls: "bg-warn" },
    { pct: rating.underperformPct, cls: "bg-bear/50" },
    { pct: rating.sellPct, cls: "bg-bear" },
  ];
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-border">
      {segments.map((s, i) => (
        <div key={i} className={s.cls} style={{ width: `${s.pct}%` }} />
      ))}
    </div>
  );
}

function BuySellBar({ buyPct, sellPct }: { buyPct: number; sellPct: number }) {
  return (
    <div className="mt-2">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-border">
        <div className="bg-bull" style={{ width: `${buyPct}%` }} />
        <div className="bg-bear" style={{ width: `${sellPct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-xs">
        <span className="text-bull">Buy {buyPct.toFixed(0)}%</span>
        <span className="text-bear">Sell {sellPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function FlowRow({ label, inM, outM }: { label: string; inM: number; outM: number }) {
  const total = inM + outM || 1;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 shrink-0 text-muted">{label}</span>
      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-border">
        <div className="bg-bull" style={{ width: `${(inM / total) * 100}%` }} />
        <div className="bg-bear" style={{ width: `${(outM / total) * 100}%` }} />
      </div>
      <span className="w-28 shrink-0 text-right font-mono text-muted">
        <span className="text-bull">${inM.toFixed(1)}M</span> / <span className="text-bear">${outM.toFixed(1)}M</span>
      </span>
    </div>
  );
}

function latestShort(snapshot: CompanySnapshot) {
  return snapshot.shortInterest[snapshot.shortInterest.length - 1];
}

function formatShares(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Tiny inline bar-sparkline — no charting lib needed for 24 points. */
function ShortInterestSparkline({ points }: { points: CompanySnapshot["shortInterest"] }) {
  const max = Math.max(...points.map((p) => p.shortInterestShares), 1);
  return (
    <div className="mt-2 flex h-8 items-end gap-0.5">
      {points.map((p, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm bg-accent/60"
          style={{ height: `${Math.max(4, (p.shortInterestShares / max) * 100)}%` }}
          title={`${p.date}: ${formatShares(p.shortInterestShares)}`}
        />
      ))}
    </div>
  );
}
