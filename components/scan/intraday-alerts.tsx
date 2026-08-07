"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatOpenedAt } from "@/lib/portfolio/opened-at";
import {
  ASSET_KIND_LABELS,
  MOVE_BASIS_LABELS,
  SIGNAL_DESCRIPTIONS,
  SIGNAL_LABELS,
  formatAge,
  formatRvol,
  formatVolume,
  type Alert,
  type ScanOutput,
  type SymbolAudit,
} from "@/lib/scanner/intraday";
import { formatUsd, cn } from "@/lib/utils";

/**
 * Intraday momentum panel.
 * -----------------------------------------------------------------------------
 * Two things are on screen at all times, and the second one is the point.
 *
 * The alerts say what moved and why it qualified. The audit trail underneath
 * says what happened to every *other* symbol — evaluated and quiet, filtered on
 * volume, suppressed by a cooldown, or never scanned because its data was too
 * old. "The scanner missed it" was previously unanswerable; with the audit
 * open, the answer is a line of text with a timestamp on it.
 *
 * The panel refreshes on a timer while it is open rather than from a scheduled
 * job, because this project's plan allows two cron runs a day and both are
 * already spent. That is stated in the footer rather than hidden: a user who
 * closes the tab is not being scanned for, and they should know that.
 */

const REFRESH_MS = 3 * 60 * 1000;

export function IntradayAlerts({ symbols }: { symbols?: string[] }) {
  const [output, setOutput] = useState<ScanOutput & {
    dataSource?: string;
    dataIsLive?: boolean;
    session?: string;
    unreachable?: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  const query = symbols?.length ? `?symbols=${encodeURIComponent(symbols.join(","))}` : "";

  const run = useCallback(
    () => {
      setLoading(true);
      return fetch(`/api/intraday-scan${query}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          setOutput(data);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    },
    [query],
  );

  useEffect(() => {
    // The first scan is scheduled rather than called inline: `run` flips the
    // loading flag synchronously, and doing that inside the effect body would
    // set state during the same commit that mounted the panel.
    const kickoff = setTimeout(run, 0);
    const timer = setInterval(run, REFRESH_MS);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [run]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>Intraday movement</CardTitle>
            <CardDescription>
              Confirmation of moves that have already happened, with the evidence attached — not a
              forecast. Every alert names what it measured the move against and the price that would
              say it is wrong.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={run} disabled={loading} className="shrink-0">
            {loading ? "Scanning…" : "Rescan"}
          </Button>
        </div>
        {output && <FreshnessLine output={output} />}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-bear">{error}</p>}

        {!output && !error && (
          <p className="py-4 text-center text-sm text-muted">
            {loading ? "Running the first scan…" : "No scan has run yet."}
          </p>
        )}

        {output && output.alerts.length === 0 && (
          <p className="py-4 text-center text-sm text-muted">
            Nothing crossed a detection threshold on this pass. Open the audit below to see what each
            symbol was checked against — an empty list here is a result, not a failure.
          </p>
        )}

        {output?.alerts.map((alert) => (
          <AlertCard key={`${alert.symbol}-${alert.type}`} alert={alert} />
        ))}

        {output && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowAudit((v) => !v)}
              aria-expanded={showAudit}
              className="flex cursor-pointer items-center gap-1.5 text-left text-sm font-medium text-muted hover:text-foreground"
            >
              {showAudit ? (
                <ChevronDown className="size-4 shrink-0" aria-hidden />
              ) : (
                <ChevronRight className="size-4 shrink-0" aria-hidden />
              )}
              Why each symbol did or didn&apos;t alert ({output.audit.length} checked)
            </button>
            {showAudit && <AuditTrail audit={output.audit} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FreshnessLine({
  output,
}: {
  output: ScanOutput & { dataSource?: string; dataIsLive?: boolean; session?: string; unreachable?: string[] };
}) {
  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
        <span>Scanned {formatOpenedAt(output.scannedAt)}</span>
        <span>·</span>
        <span>{output.session}</span>
        <span>·</span>
        <span>
          Source: {output.dataSource}
          {output.dataIsLive === false && " (demo data — not live prices)"}
        </span>
      </div>
      {output.staleSymbols.length > 0 && (
        <p className="text-warn">
          Stale feed for {output.staleSymbols.join(", ")} — nothing was called on those.
        </p>
      )}
      {output.unreachable && output.unreachable.length > 0 && (
        <p className="text-warn">
          No market data returned for {output.unreachable.join(", ")} — they were not scanned.
        </p>
      )}
    </div>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  const [showDetail, setShowDetail] = useState(false);
  const up = alert.direction === "up";
  const isRisk = alert.type === "reversal_risk";

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/ticker/${alert.symbol}`}
              className="font-semibold text-accent hover:underline"
            >
              {alert.symbol}
            </Link>
            <Badge variant="muted">{ASSET_KIND_LABELS[alert.kind]}</Badge>
            <Badge variant={isRisk ? "warn" : up ? "bull" : "bear"}>
              {SIGNAL_LABELS[alert.type]} {up ? "↑" : "↓"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted">{SIGNAL_DESCRIPTIONS[alert.type]}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className={cn("font-mono text-sm font-medium", up ? "text-bull" : "text-bear")}>
            {alert.move.absolute >= 0 ? "+" : ""}
            {formatUsd(alert.move.absolute)} ({alert.move.percent.toFixed(2)}%)
          </p>
          <p className="text-xs text-muted">from {MOVE_BASIS_LABELS[alert.move.basis]}</p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <Field label="Reference" value={formatUsd(alert.move.reference)} />
        <Field label="Current" value={formatUsd(alert.move.current)} />
        <Field label="VWAP" value={formatUsd(alert.vwap)} />
        <Field label="Rel. volume" value={formatRvol(alert.relativeVolume)} />
        <Field label="Session volume" value={formatVolume(alert.sessionVolume)} />
        <Field
          label="Invalidation"
          value={alert.invalidation != null ? formatUsd(alert.invalidation) : "—"}
        />
        <Field label="Data age" value={formatAge(alert.dataAgeSeconds)} />
        <Field label="Confidence" value={`${alert.confidence}/100`} />
      </dl>

      <p className="mt-3 text-sm">{alert.whyThisAppeared}</p>

      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        aria-expanded={showDetail}
        className="mt-2 min-h-9 cursor-pointer text-xs font-medium text-accent underline underline-offset-2"
      >
        {showDetail ? "Hide the plan and the score breakdown" : "Show the plan and the score breakdown"}
      </button>

      {showDetail && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          <ScoreBreakdown alert={alert} />

          <Plan
            title="If it continues"
            plan={alert.continuationPlan}
            note="Entry confirmation, the level that says you're wrong, and the first place to take something off."
          />
          <Plan
            title="If it turns"
            plan={alert.pivotPlan}
            note="What would invalidate the continuation, and what a trade in the other direction would need before it's worth considering."
          />

          {alert.whyNotEarlier && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Why this wasn&apos;t flagged earlier
              </p>
              <p className="mt-1 text-sm text-muted">{alert.whyNotEarlier}</p>
            </div>
          )}

          <p className="text-xs text-muted">
            Trigger time {formatOpenedAt(alert.triggerTime)} · data timestamp{" "}
            {formatOpenedAt(alert.dataTimestamp)}. Educational information, not a recommendation —
            the right answer is often no trade.
          </p>
        </div>
      )}
    </div>
  );
}

function ScoreBreakdown({ alert }: { alert: Alert }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        How the {alert.confidence}/100 was reached
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {alert.confidenceFactors.map((factor) => (
          <li key={factor.label} className="flex items-start gap-2 text-sm">
            <span
              className={cn("mt-0.5 shrink-0 font-mono text-xs", factor.passed ? "text-bull" : "text-muted")}
              aria-hidden
            >
              {factor.passed ? "✓" : "✗"}
            </span>
            <span>
              <span className={cn(!factor.passed && "text-muted")}>{factor.label}</span>{" "}
              <span className="text-xs text-muted">({factor.weight} pts) — {factor.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Plan({
  title,
  plan,
  note,
}: {
  title: string;
  plan: Alert["continuationPlan"];
  note: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
      <p className="text-xs text-muted">{note}</p>
      <dl className="mt-1 flex flex-col gap-1 text-sm">
        <PlanLine label="Confirmation" value={plan.confirmation} />
        <PlanLine
          label="Invalidation"
          value={plan.invalidation != null ? formatUsd(plan.invalidation) : "Not defined"}
        />
        <PlanLine
          label="First target"
          value={plan.firstTarget != null ? formatUsd(plan.firstTarget) : "Not defined"}
        />
        <PlanLine label="Cancel if" value={plan.cancelIf} />
      </dl>
    </div>
  );
}

function PlanLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-muted sm:w-28">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}

const OUTCOME_TONE: Record<SymbolAudit["outcome"], "bull" | "warn" | "muted"> = {
  alerted: "bull",
  stale_data: "warn",
  suppressed: "warn",
  insufficient_data: "warn",
  filtered: "muted",
  no_signal: "muted",
};

const OUTCOME_LABELS: Record<SymbolAudit["outcome"], string> = {
  alerted: "Alerted",
  no_signal: "Checked — quiet",
  suppressed: "Suppressed",
  stale_data: "Stale data",
  insufficient_data: "No data",
  filtered: "Filtered out",
};

function AuditTrail({ audit }: { audit: SymbolAudit[] }) {
  return (
    <div className="flex flex-col gap-2">
      {audit.map((row) => (
        <div key={row.symbol} className="rounded-lg border border-border p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.symbol}</span>
            <Badge variant="muted">{ASSET_KIND_LABELS[row.kind]}</Badge>
            <Badge variant={OUTCOME_TONE[row.outcome]}>{OUTCOME_LABELS[row.outcome]}</Badge>
            {row.dataAgeSeconds != null && (
              <span className="text-xs text-muted">data {formatAge(row.dataAgeSeconds)} old</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">{row.reason}</p>
          {row.checks.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {row.checks.map((check, i) => (
                <li key={`${check.name}-${i}`} className="flex items-start gap-2 text-xs">
                  <span
                    className={cn("shrink-0 font-mono", check.passed ? "text-bull" : "text-muted")}
                    aria-hidden
                  >
                    {check.passed ? "✓" : "✗"}
                  </span>
                  <span className="text-muted">
                    <span className="font-medium">{check.name}:</span> {check.detail}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:gap-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
