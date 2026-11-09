"use client";

/**
 * Company tab: the company profile, analyst rating and price target, shown
 * only from a live vendor (Finnhub, when FINNHUB_API_KEY is set).
 *
 * Until 2026-11-09 this tab also showed short interest, margin terms,
 * institutional ownership, capital flow and volatility, plus a banner that
 * blended GSPS's score with consensus and institutional flow. No vendor
 * exists for those sections: `lib/data/company.ts` generates them from a
 * seeded random source anchored on the price, and the banner's weights
 * (45/30/25) were never measured. The numbers audit
 * (/mnt/project-files/owner/app-numbers-audit.md, call 2) found a lean drawn
 * partly from invented data sitting beside the real score, so the modelled
 * sections and the banner are not rendered. They come back only with a real
 * vendor and, for the banner, a measured reason for its weights. The
 * labelled version is in git history (PR #631).
 */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PanelError, Skeleton } from "@/components/chart/market-tabs";
import { formatUsd, cn } from "@/lib/utils";
import type { PublicScanResult } from "@/lib/types";
import type { CompanySnapshot } from "@/lib/data/company";
import { isEtfSymbol } from "@/lib/sectors";

export function CompanyPanel({
  symbol,
}: {
  symbol: string;
  // Still passed by the chart; the blended banner that read them is not rendered.
  result?: PublicScanResult | null;
  exactScoreDisplayEnabled?: boolean;
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

  const profileLive = snapshot.sources.profile === "finnhub";
  const ratingLive = snapshot.sources.analystRating === "finnhub";
  const targetLive = snapshot.sources.priceTarget === "finnhub";

  if (!profileLive && !ratingLive && !targetLive) {
    return (
      <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted">
        <div className="mb-1 font-semibold text-foreground">No company data source is connected</div>
        {isEtfSymbol(symbol)
          ? `${symbol.toUpperCase()} is a fund, so there is no company profile or analyst coverage to show.`
          : "GSPS shows company figures only from a live data source, and none is connected yet, so nothing is listed here."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {profileLive && <ProfileHeader profile={snapshot.profile} />}

      {(ratingLive || targetLive) && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <SectionHeader noMargin>
              {ratingLive && targetLive ? "Analyst rating · Price target" : ratingLive ? "Analyst rating" : "Price target"}
            </SectionHeader>
            <LiveBadge />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {ratingLive && (
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
            )}
            {targetLive && (
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
            )}
          </div>
        </section>
      )}

      <p className="text-xs text-muted/80">
        Figures here come from Finnhub. Short interest, institutional ownership, capital flow and
        volatility are not shown because no data source for them is connected.
      </p>
    </div>
  );
}

function ProfileHeader({ profile }: { profile: CompanySnapshot["profile"] }) {
  return (
    <section className="rounded-xl border border-border bg-background p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{profile.name}</span>
        <Badge variant="muted" className="text-[10px]">
          {profile.sector}
        </Badge>
        <LiveBadge />
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          Industry: <span className="text-foreground">{profile.industry}</span>
        </span>
        <span>
          Market cap: <span className="font-mono text-foreground">{formatMarketCap(profile.marketCapM)}</span>
        </span>
        {profile.exchange && <span>Exchange: <span className="text-foreground">{profile.exchange}</span></span>}
      </div>
      <p className="text-xs text-muted">{profile.description}</p>
    </section>
  );
}

function formatMarketCap(marketCapM: number): string {
  if (!marketCapM || marketCapM <= 0) return "—";
  const usd = marketCapM * 1e6;
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(2)}T`;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  return `$${usd.toFixed(0)}`;
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

/** Marks a section as live vendor data; nothing modelled is rendered here. */
function LiveBadge() {
  return (
    <Badge variant="bull" className="text-[10px]">
      Live · Finnhub
    </Badge>
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
