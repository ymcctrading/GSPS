"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TargetStatusCells } from "@/components/trade/target-status";
import { AssetTypeBadge } from "@/components/trade/asset-type-badge";
import type { TargetStatus } from "@/lib/trade/targets";
import type { BlendedPosition, EquityLeg, OptionLeg } from "@/lib/portfolio/blend";
import { countOpenLegs, sectionOrders } from "@/lib/portfolio/sections";
import { formatUsd, formatPct, cn } from "@/lib/utils";

/** A position row that a close action can target — either leg shape qualifies. */
interface Closable {
  symbol: string;
  qty: number;
  side: string;
  entryLabel: string;
  currentLabel: string;
  marketValue: number;
  pl: number;
  plPct: number;
}

interface Portfolio {
  mode: string;
  account: { equity: number; cash: number; buyingPower: number; dayPlPct: number };
  blendedPositions: BlendedPosition[];
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
  asset_type: "EQUITY" | "OPTION";
  // Contract economics + greeks snapshot (null on equity orders).
  purchase_price: number | null;
  contract_cost: number | null;
  option_type: "call" | "put" | null;
  strike: number | null;
  expiration: string | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  // Protocol levels.
  take_profit: number | null;
  master_profit: number | null;
  stop_price: number | null;
  // Live enrichment from /api/orders.
  currentPrice: number | null;
  dayPl: number | null;
  dayPlPct: number | null;
  targets: TargetStatus;
}

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<Closable | null>(null);

  const loadPortfolio = useCallback(() => {
    fetch("/api/portfolio")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setPortfolio(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const loadOrders = useCallback(() => {
    fetch("/api/orders")
      .then(async (res) => (res.ok ? ((await res.json()).orders ?? []) : []))
      .then(setOrders)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPortfolio();
    loadOrders();

    // Real-time updates: refresh portfolio every 10 seconds for live P/L tracking
    const portfolioInterval = setInterval(loadPortfolio, 10000);
    const ordersInterval = setInterval(loadOrders, 30000);

    return () => {
      clearInterval(portfolioInterval);
      clearInterval(ordersInterval);
    };
  }, [loadPortfolio, loadOrders]);

  const refresh = () => {
    loadPortfolio();
    loadOrders();
  };

  const blendedPositions = useMemo(() => portfolio?.blendedPositions ?? [], [portfolio]);
  // Open / Pending / Closed. Order status settles pending vs. terminal; a
  // `filled` order needs the live position list to know whether the position
  // it opened is still held. See lib/portfolio/sections.ts.
  const sections = useMemo(
    () => sectionOrders(orders, blendedPositions),
    [orders, blendedPositions],
  );
  const openLegCount = countOpenLegs(blendedPositions);
  const loading = portfolio === null && error === null;

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">Portfolio</h1>
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

      <PositionSection
        id="open-positions"
        title="Open Positions"
        count={openLegCount}
        description="Live legs at the broker, grouped by ticker — shares and every option contract on the same underlying track separately, updated every 10 seconds."
      >
        {blendedPositions.length === 0 ? (
          <EmptyState>
            {loading ? (
              "Loading positions…"
            ) : (
              <>
                No open positions. Find a setup in the{" "}
                <Link href="/scanner" className="text-accent hover:underline">
                  scanner
                </Link>{" "}
                and place a paper order.
              </>
            )}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {blendedPositions.map((group) => (
              <BlendedPositionGroup key={group.underlying} group={group} onClose={setClosing} />
            ))}
          </div>
        )}

        {sections.open.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide text-muted">
              Entry orders ({sections.open.length})
            </p>
            <OrdersTable orders={sections.open} />
          </div>
        )}
      </PositionSection>

      <PositionSection
        id="pending-positions"
        title="Pending Positions"
        count={sections.pending.length}
        description="Submitted or queued at the broker — not yet filled or confirmed."
      >
        {sections.pending.length === 0 ? (
          <EmptyState>No pending positions.</EmptyState>
        ) : (
          <OrdersTable orders={sections.pending} />
        )}
      </PositionSection>

      <PositionSection
        id="closed-positions"
        title="Closed Positions"
        count={sections.closed.length}
        description="Exited and settled positions, plus orders that ended without a fill — canceled, expired, or rejected."
        collapsible
      >
        {sections.closed.length === 0 ? (
          <EmptyState>No closed positions.</EmptyState>
        ) : (
          <OrdersTable orders={sections.closed} />
        )}
      </PositionSection>

      <ClosePositionModal position={closing} onClose={() => setClosing(null)} onClosed={refresh} />
    </div>
  );
}

/**
 * One of the three Portfolio panels. Every section renders its header and
 * count even when it holds nothing, so an empty bucket reads as "none right
 * now" rather than vanishing from the page.
 *
 * `collapsible` sections start collapsed — Closed grows without bound as the
 * account keeps trading, and it isn't what the page is for. An empty one has
 * nothing to hide, so it drops the toggle and shows its empty state outright.
 */
function PositionSection({
  id,
  title,
  count,
  description,
  collapsible = false,
  children,
}: {
  id: string;
  title: string;
  count: number;
  description: string;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = `${id}-body`;
  const togglable = collapsible && count > 0;
  const showBody = !togglable || expanded;

  const heading = (
    <>
      <div className="flex items-center gap-1.5">
        {togglable &&
          (expanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
          ))}
        <CardTitle>
          {title} ({count})
        </CardTitle>
      </div>
      <CardDescription>{description}</CardDescription>
    </>
  );

  return (
    <Card>
      <CardHeader>
        {togglable ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={bodyId}
            className="flex w-full cursor-pointer flex-col gap-1 text-left"
          >
            {heading}
          </button>
        ) : (
          heading
        )}
      </CardHeader>
      <div id={bodyId}>{showBody && <CardContent>{children}</CardContent>}</div>
    </Card>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

/**
 * The order ledger grid — contract economics, entry greeks, live day P/L, and
 * which protocol target was reached. One layout, rendered once per section
 * against that section's rows.
 */
function OrdersTable({ orders }: { orders: OrderRow[] }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Placed</TH>
          <TH>Asset</TH>
          <TH>Symbol</TH>
          <TH>Side</TH>
          <TH>Order</TH>
          <TH className="text-right">Qty</TH>
          <TH className="text-right">Purchase</TH>
          <TH className="text-right">Contract cost</TH>
          <TH className="text-right" title="Delta">Δ</TH>
          <TH className="text-right" title="Gamma">Γ</TH>
          <TH className="text-right" title="Theta">Θ</TH>
          <TH className="text-right" title="Vega">V</TH>
          <TH className="text-right">P/L today</TH>
          <TH className="text-right">P/L %</TH>
          <TH className="text-right">TP1</TH>
          <TH className="text-right">MP</TH>
          <TH className="text-right">SL</TH>
          <TH className="text-center">Target hit</TH>
          <TH>Status</TH>
        </TR>
      </THead>
      <TBody>
        {orders.map((o) => (
          <TR key={o.id}>
            <TD className="whitespace-nowrap text-muted">
              {new Date(o.created_at).toLocaleString()}
            </TD>
            <TD>
              <AssetTypeBadge assetType={o.asset_type} />
            </TD>
            <TD className="font-medium">
              {o.symbol}
              {o.option_type && (
                <span className="ml-1 text-xs text-muted">
                  {o.strike ? formatUsd(o.strike) : ""} {o.option_type.toUpperCase()}
                  {o.expiration ? ` ${o.expiration.slice(5)}` : ""}
                </span>
              )}
            </TD>
            <TD className={o.side === "buy" ? "text-bull" : "text-bear"}>{o.side}</TD>
            <TD className="text-muted">{o.order_type}</TD>
            <TD className="text-right font-mono">{o.qty}</TD>
            <Num value={o.purchase_price} />
            <Num value={o.contract_cost} />
            <Num value={o.delta} plain digits={2} />
            <Num value={o.gamma} plain digits={4} />
            <Num value={o.theta} plain digits={2} />
            <Num value={o.vega} plain digits={2} />
            <TD
              className={cn(
                "text-right font-mono",
                o.dayPl == null ? "text-muted" : o.dayPl >= 0 ? "text-bull" : "text-bear",
              )}
            >
              {o.dayPl == null ? "—" : formatUsd(o.dayPl)}
            </TD>
            <TD
              className={cn(
                "text-right font-mono",
                o.dayPlPct == null ? "text-muted" : o.dayPlPct >= 0 ? "text-bull" : "text-bear",
              )}
            >
              {o.dayPlPct == null ? "—" : formatPct(o.dayPlPct)}
            </TD>
            <Num value={o.take_profit} />
            <Num value={o.master_profit} />
            <Num value={o.stop_price} />
            <TD>
              <TargetStatusCells status={o.targets} />
            </TD>
            <TD>
              <Badge variant={o.status === "filled" ? "bull" : "muted"}>{o.status}</Badge>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

/**
 * One parent ticker container: an aggregate header (combined market value and
 * P/L across every leg), then a row per leg — the shares position if held, and
 * one row per option contract, each carrying its own required fields and its
 * own Close-position action.
 */
function BlendedPositionGroup({
  group,
  onClose,
}: {
  group: BlendedPosition;
  onClose: (c: Closable) => void;
}) {
  const legCount = (group.equity ? 1 : 0) + group.options.length;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-background px-3 py-2">
        <div className="flex items-center gap-2">
          <Link href={`/ticker/${group.underlying}`} className="font-semibold text-accent hover:underline">
            {group.underlying}
          </Link>
          <span className="text-xs text-muted">
            {legCount} leg{legCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-mono text-muted">{formatUsd(group.totalMarketValue)}</span>
          <span className={cn("font-mono font-medium", group.totalPl >= 0 ? "text-bull" : "text-bear")}>
            {formatUsd(group.totalPl)}
          </span>
        </div>
      </div>

      <Table>
        <THead>
          <TR>
            <TH className="w-16">Leg</TH>
            <TH>Detail</TH>
            <TH className="text-right">Qty</TH>
            <TH className="text-right">Avg fill</TH>
            <TH className="text-right">Current</TH>
            <TH className="text-right" title="Delta">Δ</TH>
            <TH className="text-right" title="Gamma">Γ</TH>
            <TH className="text-right" title="Theta">Θ</TH>
            <TH className="text-right" title="Vega">V</TH>
            <TH className="text-right">P/L</TH>
            <TH className="text-right">Today</TH>
            <TH className="text-center">Action</TH>
          </TR>
        </THead>
        <TBody>
          {group.equity && <EquityLegRow leg={group.equity} onClose={onClose} />}
          {group.options.map((leg) => (
            <OptionLegRow key={leg.symbol} leg={leg} onClose={onClose} />
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function EquityLegRow({ leg, onClose }: { leg: EquityLeg; onClose: (c: Closable) => void }) {
  return (
    <TR>
      <TD>
        <AssetTypeBadge assetType="EQUITY" />
      </TD>
      <TD className="text-muted">Shares</TD>
      <TD className="text-right font-mono">{leg.totalShares}</TD>
      <TD className="text-right font-mono">{formatUsd(leg.avgFillPrice)}</TD>
      <TD className="text-right font-mono">{formatUsd(leg.currentPrice)}</TD>
      <TD className="text-right text-muted">—</TD>
      <TD className="text-right text-muted">—</TD>
      <TD className="text-right text-muted">—</TD>
      <TD className="text-right text-muted">—</TD>
      <TD className={cn("text-right font-mono", leg.equityPl >= 0 ? "text-bull" : "text-bear")}>
        {formatUsd(leg.equityPl)} ({formatPct(leg.equityPlPct)})
      </TD>
      <TD className={cn("text-right font-mono", leg.todayPlPct >= 0 ? "text-bull" : "text-bear")}>
        {formatPct(leg.todayPlPct)}
      </TD>
      <TD className="text-center">
        <CloseButton
          onClick={() =>
            onClose({
              symbol: leg.symbol,
              qty: leg.totalShares,
              side: "long",
              entryLabel: formatUsd(leg.avgFillPrice),
              currentLabel: formatUsd(leg.currentPrice),
              marketValue: leg.marketValue,
              pl: leg.equityPl,
              plPct: leg.equityPlPct,
            })
          }
        />
      </TD>
    </TR>
  );
}

function OptionLegRow({ leg, onClose }: { leg: OptionLeg; onClose: (c: Closable) => void }) {
  return (
    <TR>
      <TD>
        <AssetTypeBadge assetType="OPTION" />
      </TD>
      <TD className="text-muted">
        {formatUsd(leg.strike)} {leg.type.toUpperCase()} · {leg.expiration}
      </TD>
      <TD className="text-right font-mono">{leg.qty}</TD>
      <TD className="text-right font-mono">{formatUsd(leg.premium)}</TD>
      <TD className="text-right font-mono">{formatUsd(leg.currentPremium)}</TD>
      <TD className="text-right font-mono text-muted" title="Modeled from this position's own premium">
        {leg.greeks.delta.toFixed(2)}
      </TD>
      <TD className="text-right font-mono text-muted">{leg.greeks.gamma.toFixed(4)}</TD>
      <TD className="text-right font-mono text-muted">{leg.greeks.theta.toFixed(2)}</TD>
      <TD className="text-right font-mono text-muted">{leg.greeks.vega.toFixed(2)}</TD>
      <TD className={cn("text-right font-mono", leg.optionPl >= 0 ? "text-bull" : "text-bear")}>
        {formatUsd(leg.optionPl)} ({formatPct(leg.optionPlPct)})
      </TD>
      <TD className={cn("text-right font-mono", leg.todayPlPct >= 0 ? "text-bull" : "text-bear")}>
        {formatPct(leg.todayPlPct)}
      </TD>
      <TD className="text-center">
        <CloseButton
          onClick={() =>
            onClose({
              symbol: leg.symbol,
              qty: leg.qty,
              side: leg.side,
              entryLabel: `${formatUsd(leg.premium)} premium`,
              currentLabel: `${formatUsd(leg.currentPremium)} premium`,
              marketValue: leg.marketValue,
              pl: leg.optionPl,
              plPct: leg.optionPlPct,
            })
          }
        />
      </TD>
    </TR>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-bear hover:text-bear cursor-pointer"
    >
      Close
    </button>
  );
}

/** Numeric cell that renders an em dash rather than a misleading zero. */
function Num({
  value,
  digits = 2,
  plain,
}: {
  value: number | null;
  digits?: number;
  plain?: boolean;
}) {
  return (
    <TD className="text-right font-mono text-muted">
      {value == null ? "—" : plain ? value.toFixed(digits) : formatUsd(value, digits)}
    </TD>
  );
}

function ClosePositionModal({
  position,
  onClose,
  onClosed,
}: {
  position: Closable | null;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Retain the last target (rather than clearing to null with `position`) so
  // the confirmation stays legible while the modal plays its exit transition,
  // and clear the error at the same render-phase point — no effect needed for
  // either.
  const [active, setActive] = useState<Closable | null>(position);
  const [activeSymbol, setActiveSymbol] = useState(position?.symbol ?? null);
  if ((position?.symbol ?? null) !== activeSymbol) {
    setActiveSymbol(position?.symbol ?? null);
    if (position) {
      setActive(position);
      setErr(null);
    }
  }

  async function confirm() {
    if (!active) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/positions/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: active.symbol }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onClosed();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={Boolean(position)}
      onClose={onClose}
      title={active ? `Close ${active.symbol}` : ""}
      description="Liquidates the whole position at market and cancels any resting orders on the symbol."
      footer={
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="bear" className="flex-1" onClick={confirm} disabled={submitting}>
              {submitting ? "Closing…" : "Close position"}
            </Button>
          </div>
          {err && <p className="text-sm text-bear">{err}</p>}
        </div>
      }
    >
      {active && (
        <dl className="flex flex-col gap-2 text-sm">
          <Line label="Quantity" value={`${active.qty} ${active.side}`} />
          <Line label="Entry" value={active.entryLabel} />
          <Line label="Current" value={active.currentLabel} />
          <Line label="Market value" value={formatUsd(active.marketValue)} />
          <Line
            label="Unrealized P/L"
            value={`${formatUsd(active.pl)} (${formatPct(active.plPct)})`}
            tone={active.pl >= 0 ? "bull" : "bear"}
          />
        </dl>
      )}
    </Modal>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd
        className={cn(
          "font-mono tabular-nums",
          tone === "bull" && "text-bull",
          tone === "bear" && "text-bear",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted">{label}</p>
        <p
          className={cn(
            "mt-1 font-mono text-lg font-semibold",
            tone === "bull" && "text-bull",
            tone === "bear" && "text-bear",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
