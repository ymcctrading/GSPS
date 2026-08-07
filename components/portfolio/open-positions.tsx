"use client";

import { useState } from "react";
import Link from "next/link";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { AssetTypeBadge } from "@/components/trade/asset-type-badge";
import { GreeksToggle } from "./order-rows";
import { formatOpenedAt } from "@/lib/portfolio/opened-at";
import type { BlendedPosition, EquityLeg, OptionLeg } from "@/lib/portfolio/blend";
import { formatUsd, formatPct, cn } from "@/lib/utils";

/**
 * Open positions, grouped by underlying, with each asset type rendered in its
 * own shape.
 * -----------------------------------------------------------------------------
 * The previous layout put shares and option contracts in one twelve-column
 * grid, which meant a block of AAPL shares rendered four Greek columns filled
 * with em dashes. That reads as "these numbers failed to load". They didn't —
 * shares have no Delta. So the two leg types no longer share a table: equity
 * legs get equity columns, option legs get contract columns, and the Greeks sit
 * behind a toggle that starts closed.
 *
 * Every leg carries the moment it was first opened, derived from the broker's
 * execution history (see lib/portfolio/opened-at.ts). When that history is too
 * short to answer, the cell says so rather than showing a date the data can't
 * support.
 */

/** A position row that a close action can target — either leg shape qualifies. */
export interface Closable {
  symbol: string;
  qty: number;
  side: string;
  entryLabel: string;
  currentLabel: string;
  marketValue: number;
  pl: number;
  plPct: number;
}

export function BlendedPositionGroup({
  group,
  onClose,
}: {
  group: BlendedPosition;
  onClose: (c: Closable) => void;
}) {
  const [showGreeks, setShowGreeks] = useState(false);
  const legCount = (group.equity ? 1 : 0) + group.options.length;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-background px-3 py-2">
        <div className="flex items-center gap-2">
          <Link
            href={`/ticker/${group.underlying}`}
            className="font-semibold text-accent hover:underline"
          >
            {group.underlying}
          </Link>
          <span className="text-xs text-muted">
            {legCount} leg{legCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-mono text-muted">{formatUsd(group.totalMarketValue)}</span>
          <span
            className={cn("font-mono font-medium", group.totalPl >= 0 ? "text-bull" : "text-bear")}
          >
            {formatUsd(group.totalPl)}
          </span>
        </div>
      </div>

      {group.equity && <EquityLegs legs={[group.equity]} onClose={onClose} />}

      {group.options.length > 0 && (
        <OptionLegs
          legs={group.options}
          onClose={onClose}
          showGreeks={showGreeks}
          onToggleGreeks={() => setShowGreeks((v) => !v)}
        />
      )}
    </div>
  );
}

function SubHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{children}</p>
      {action}
    </div>
  );
}

function EquityLegs({ legs, onClose }: { legs: EquityLeg[]; onClose: (c: Closable) => void }) {
  return (
    <>
      <SubHeading>Shares</SubHeading>

      <div className="hidden sm:block">
        <Table>
          <THead>
            <TR>
              <TH className="w-16">Leg</TH>
              <TH className="text-right">Shares</TH>
              <TH className="text-right">Avg fill</TH>
              <TH className="text-right">Current</TH>
              <TH className="text-right">Market value</TH>
              <TH className="text-right">Unrealized P/L</TH>
              <TH className="text-right">Today</TH>
              <TH>Opened</TH>
              <TH className="text-center">Action</TH>
            </TR>
          </THead>
          <TBody>
            {legs.map((leg) => (
              <TR key={leg.symbol}>
                <TD>
                  <AssetTypeBadge assetType="EQUITY" />
                </TD>
                <TD className="text-right font-mono">{leg.totalShares}</TD>
                <TD className="text-right font-mono">{formatUsd(leg.avgFillPrice)}</TD>
                <TD className="text-right font-mono">{formatUsd(leg.currentPrice)}</TD>
                <TD className="text-right font-mono">{formatUsd(leg.marketValue)}</TD>
                <TD
                  className={cn(
                    "text-right font-mono",
                    leg.equityPl >= 0 ? "text-bull" : "text-bear",
                  )}
                >
                  {formatUsd(leg.equityPl)} ({formatPct(leg.equityPlPct)})
                </TD>
                <TD
                  className={cn(
                    "text-right font-mono",
                    leg.todayPlPct >= 0 ? "text-bull" : "text-bear",
                  )}
                >
                  {formatPct(leg.todayPlPct)}
                </TD>
                <OpenedCell opened={leg.opened} />
                <TD className="text-center">
                  <CloseButton onClick={() => onClose(closableEquity(leg))} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 p-3 sm:hidden">
        {legs.map((leg) => (
          <div key={leg.symbol} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <AssetTypeBadge assetType="EQUITY" />
              <span
                className={cn("font-mono text-sm", leg.equityPl >= 0 ? "text-bull" : "text-bear")}
              >
                {formatUsd(leg.equityPl)} ({formatPct(leg.equityPlPct)})
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <Field label="Shares" value={String(leg.totalShares)} />
              <Field label="Avg fill" value={formatUsd(leg.avgFillPrice)} />
              <Field label="Current" value={formatUsd(leg.currentPrice)} />
              <Field label="Market value" value={formatUsd(leg.marketValue)} />
              <Field label="Today" value={formatPct(leg.todayPlPct)} />
            </dl>
            <OpenedLine opened={leg.opened} />
            <div className="mt-2">
              <CloseButton onClick={() => onClose(closableEquity(leg))} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function OptionLegs({
  legs,
  onClose,
  showGreeks,
  onToggleGreeks,
}: {
  legs: OptionLeg[];
  onClose: (c: Closable) => void;
  showGreeks: boolean;
  onToggleGreeks: () => void;
}) {
  return (
    <>
      <SubHeading action={<GreeksToggle open={showGreeks} onToggle={onToggleGreeks} />}>
        Option contracts
      </SubHeading>

      <div className="hidden sm:block">
        <Table>
          <THead>
            <TR>
              <TH className="w-16">Leg</TH>
              <TH>Contract</TH>
              <TH>Expiry</TH>
              <TH className="text-right">Strike</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Avg fill</TH>
              <TH className="text-right">Mark</TH>
              {showGreeks && (
                <>
                  <TH className="text-right" title="Delta">Δ</TH>
                  <TH className="text-right" title="Gamma">Γ</TH>
                  <TH className="text-right" title="Theta">Θ</TH>
                  <TH className="text-right" title="Vega">V</TH>
                </>
              )}
              <TH className="text-right">P/L</TH>
              <TH className="text-right">Today</TH>
              <TH>Opened</TH>
              <TH className="text-center">Action</TH>
            </TR>
          </THead>
          <TBody>
            {legs.map((leg) => (
              <TR key={leg.symbol}>
                <TD>
                  <AssetTypeBadge assetType="OPTION" />
                </TD>
                <TD className="text-muted">{leg.type.toUpperCase()}</TD>
                <TD className="text-muted">{leg.expiration}</TD>
                <TD className="text-right font-mono">{formatUsd(leg.strike)}</TD>
                <TD className="text-right font-mono">{leg.qty}</TD>
                <TD className="text-right font-mono">{formatUsd(leg.premium)}</TD>
                <TD className="text-right font-mono">{formatUsd(leg.currentPremium)}</TD>
                {showGreeks && <GreekCells leg={leg} />}
                <TD
                  className={cn(
                    "text-right font-mono",
                    leg.optionPl >= 0 ? "text-bull" : "text-bear",
                  )}
                >
                  {formatUsd(leg.optionPl)} ({formatPct(leg.optionPlPct)})
                </TD>
                <TD
                  className={cn(
                    "text-right font-mono",
                    leg.todayPlPct >= 0 ? "text-bull" : "text-bear",
                  )}
                >
                  {formatPct(leg.todayPlPct)}
                </TD>
                <OpenedCell opened={leg.opened} />
                <TD className="text-center">
                  <CloseButton onClick={() => onClose(closableOption(leg))} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 p-3 sm:hidden">
        {legs.map((leg) => (
          <div key={leg.symbol} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AssetTypeBadge assetType="OPTION" />
                <span className="text-xs text-muted">
                  {formatUsd(leg.strike)} {leg.type.toUpperCase()}
                </span>
              </div>
              <span
                className={cn("font-mono text-sm", leg.optionPl >= 0 ? "text-bull" : "text-bear")}
              >
                {formatUsd(leg.optionPl)} ({formatPct(leg.optionPlPct)})
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <Field label="Expiry" value={leg.expiration} />
              <Field label="Contracts" value={String(leg.qty)} />
              <Field label="Avg fill" value={formatUsd(leg.premium)} />
              <Field label="Mark" value={formatUsd(leg.currentPremium)} />
              <Field label="Today" value={formatPct(leg.todayPlPct)} />
              {showGreeks && (
                <>
                  <Field label="Delta" value={greek(leg, "delta", 2)} />
                  <Field label="Gamma" value={greek(leg, "gamma", 4)} />
                  <Field label="Theta" value={greek(leg, "theta", 2)} />
                  <Field label="Vega" value={greek(leg, "vega", 2)} />
                </>
              )}
            </dl>
            <OpenedLine opened={leg.opened} />
            <div className="mt-2">
              <CloseButton onClick={() => onClose(closableOption(leg))} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Greeks are modeled from the position's own premium, not quoted by the
 * broker — the title says so on every cell. When no underlying spot was
 * available there is no model output at all, and the cells say that rather
 * than printing the zero-filled placeholder as if it were an answer.
 */
function GreekCells({ leg }: { leg: OptionLeg }) {
  const title = leg.greeksAvailable
    ? "Modeled from this position's own premium — not a broker-quoted value"
    : "Unavailable — no underlying price to model against";
  return (
    <>
      <TD className="text-right font-mono text-muted" title={title}>
        {greek(leg, "delta", 2)}
      </TD>
      <TD className="text-right font-mono text-muted" title={title}>
        {greek(leg, "gamma", 4)}
      </TD>
      <TD className="text-right font-mono text-muted" title={title}>
        {greek(leg, "theta", 2)}
      </TD>
      <TD className="text-right font-mono text-muted" title={title}>
        {greek(leg, "vega", 2)}
      </TD>
    </>
  );
}

function greek(leg: OptionLeg, key: "delta" | "gamma" | "theta" | "vega", digits: number): string {
  return leg.greeksAvailable ? leg.greeks[key].toFixed(digits) : "—";
}

function OpenedCell({ opened }: { opened: { openedAt: string | null } }) {
  return (
    <TD className={cn("whitespace-nowrap", opened.openedAt ? "text-muted" : "text-muted/70")}>
      {formatOpenedAt(opened.openedAt)}
    </TD>
  );
}

/**
 * The mobile counterpart. Rendered as its own line rather than a grid cell so
 * the full "Aug 7, 2026 · 10:14 AM ET" fits without truncation — the timestamp
 * is a required field on both layouts, so it must not be the thing that gets
 * cut off on a narrow screen.
 */
function OpenedLine({ opened }: { opened: { openedAt: string | null } }) {
  return (
    <p className="mt-2 text-xs text-muted">
      <span className="uppercase tracking-wide">Opened</span>{" "}
      <span className="font-mono">{formatOpenedAt(opened.openedAt)}</span>
    </p>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate font-mono tabular-nums">{value}</dd>
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="min-h-9 cursor-pointer rounded-md border border-border px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-bear hover:text-bear"
    >
      Close
    </button>
  );
}

function closableEquity(leg: EquityLeg): Closable {
  return {
    symbol: leg.symbol,
    qty: leg.totalShares,
    side: "long",
    entryLabel: formatUsd(leg.avgFillPrice),
    currentLabel: formatUsd(leg.currentPrice),
    marketValue: leg.marketValue,
    pl: leg.equityPl,
    plPct: leg.equityPlPct,
  };
}

function closableOption(leg: OptionLeg): Closable {
  return {
    symbol: leg.symbol,
    qty: leg.qty,
    side: leg.side,
    entryLabel: `${formatUsd(leg.premium)} premium`,
    currentLabel: `${formatUsd(leg.currentPremium)} premium`,
    marketValue: leg.marketValue,
    pl: leg.optionPl,
    plPct: leg.optionPlPct,
  };
}
