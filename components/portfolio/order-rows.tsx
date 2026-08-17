"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { TargetStatusCells } from "@/components/trade/target-status";
import { formatOpenedAt } from "@/lib/portfolio/opened-at";
import {
  fillProgress,
  normalizeOrderStatus,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  type NormalizedStatus,
} from "@/lib/portfolio/order-status";
import { formatUsd, formatPct, cn } from "@/lib/utils";
import type { OrderRow } from "./types";

/**
 * The order ledger, rendered per asset type.
 * -----------------------------------------------------------------------------
 * One table used to serve both shares and option contracts, which meant every
 * equity row carried four Greek columns filled with em dashes — a Delta on a
 * block of shares is not a missing value, it is a category error, and printing
 * a placeholder for it taught novice users that shares have Greeks that
 * happened to be unavailable.
 *
 * So the ledger splits by `asset_type`, which comes from the canonical
 * `asset_class` on the row (a generated column — see migration 0004), not from
 * guessing at the shape of the ticker. Shares get share columns. Contracts get
 * contract columns, with the Greeks behind a toggle that is off by default:
 * they are expert detail, and a first-time user should not have to read past
 * Θ and V to find their P/L.
 *
 * Both layouts render as a table on a wide screen and as cards on a phone, so
 * a narrow viewport reads top-to-bottom instead of scrolling a 15-column grid
 * sideways.
 */

export function OrderLedger({ orders }: { orders: OrderRow[] }) {
  const shares = orders.filter((o) => o.asset_type !== "OPTION");
  const contracts = orders.filter((o) => o.asset_type === "OPTION");

  return (
    <div className="flex flex-col gap-5">
      {shares.length > 0 && <EquityOrders orders={shares} labeled={contracts.length > 0} />}
      {contracts.length > 0 && <OptionOrders orders={contracts} labeled={shares.length > 0} />}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wide text-muted">{children}</p>;
}

function EquityOrders({ orders, labeled }: { orders: OrderRow[]; labeled: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {labeled && <GroupLabel>Shares ({orders.length})</GroupLabel>}

      <div className="hidden sm:block">
        <Table>
          <THead>
            <TR>
              <TH>Placed</TH>
              <TH>Symbol</TH>
              <TH>Side</TH>
              <TH>Order</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Limit</TH>
              <TH className="text-right">Avg fill</TH>
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
                <PlacedCell order={o} />
                <TD className="font-medium">{o.symbol}</TD>
                <SideCell order={o} />
                <TD className="text-muted">{o.order_type}</TD>
                <TD className="text-right font-mono">{o.qty}</TD>
                <Num value={o.limit_price} />
                <Num value={o.filled_avg_price ?? o.purchase_price} />
                <DayPlCell order={o} />
                <DayPlPctCell order={o} />
                <Num value={o.take_profit} />
                <Num value={o.master_profit} />
                <Num value={o.stop_price} />
                <TD>
                  <TargetStatusCells status={o.targets} />
                </TD>
                <TD>
                  <StatusBadge order={o} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 sm:hidden">
        {orders.map((o) => (
          <OrderCard key={o.id} order={o} title={o.symbol} subtitle="Shares" />
        ))}
      </div>
    </div>
  );
}

function OptionOrders({ orders, labeled }: { orders: OrderRow[]; labeled: boolean }) {
  const [showGreeks, setShowGreeks] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {labeled ? <GroupLabel>Option contracts ({orders.length})</GroupLabel> : <span />}
        <GreeksToggle open={showGreeks} onToggle={() => setShowGreeks((v) => !v)} />
      </div>

      <div className="hidden sm:block">
        <Table>
          <THead>
            <TR>
              <TH>Placed</TH>
              <TH>Contract</TH>
              <TH>Side</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Premium</TH>
              <TH className="text-right">Contract cost</TH>
              {showGreeks && (
                <>
                  <TH className="text-right" title="Delta">Δ</TH>
                  <TH className="text-right" title="Gamma">Γ</TH>
                  <TH className="text-right" title="Theta">Θ</TH>
                  <TH className="text-right" title="Vega">V</TH>
                </>
              )}
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
                <PlacedCell order={o} />
                <TD className="font-medium">
                  {o.symbol}
                  <span className="ml-1 text-xs font-normal text-muted">
                    {contractDescription(o)}
                  </span>
                </TD>
                <SideCell order={o} />
                <TD className="text-right font-mono">{o.qty}</TD>
                <Num value={o.purchase_price} />
                <Num value={o.contract_cost} />
                {showGreeks && (
                  <>
                    <Num value={o.delta} plain digits={2} />
                    <Num value={o.gamma} plain digits={4} />
                    <Num value={o.theta} plain digits={2} />
                    <Num value={o.vega} plain digits={2} />
                  </>
                )}
                <DayPlCell order={o} />
                <DayPlPctCell order={o} />
                <Num value={o.take_profit} />
                <Num value={o.master_profit} />
                <Num value={o.stop_price} />
                <TD>
                  <TargetStatusCells status={o.targets} />
                </TD>
                <TD>
                  <StatusBadge order={o} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 sm:hidden">
        {orders.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            title={o.symbol}
            subtitle={contractDescription(o) || "Option contract"}
            greeks={showGreeks}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Greeks are opt-in, not opt-out. A novice reading their first options position
 * needs quantity, cost and P/L; Delta and Vega are the second conversation.
 */
export function GreeksToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="min-h-9 cursor-pointer rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
    >
      {open ? "Hide Greeks" : "Show Greeks"}
    </button>
  );
}

function contractDescription(o: OrderRow): string {
  if (!o.option_type) return "";
  const strike = o.strike ? formatUsd(o.strike) : "";
  const expiry = o.expiration ? ` · exp ${o.expiration}` : "";
  return `${strike} ${o.option_type.toUpperCase()}${expiry}`.trim();
}

function PlacedCell({ order }: { order: OrderRow }) {
  return (
    <TD className="whitespace-nowrap text-muted" title={placedTitle(order)}>
      {formatOpenedAt(order.broker_submitted_at ?? order.created_at)}
    </TD>
  );
}

function placedTitle(order: OrderRow): string {
  return order.broker_submitted_at
    ? "When the broker accepted this order"
    : "When this order was placed — the broker hasn't confirmed an acceptance time";
}

function SideCell({ order }: { order: OrderRow }) {
  return (
    <TD className={order.side === "buy" ? "text-bull" : "text-bear"}>
      <span className="inline-flex items-center gap-1.5">
        {order.side}
        {isUnprotectedShort(order) && (
          <Badge
            variant="warn"
            title="Short entries route as a plain sell order — Alpaca can't bracket short legs. Manage the stop and TP1 manually."
          >
            No stop
          </Badge>
        )}
      </span>
    </TD>
  );
}

/**
 * Alpaca can't attach a bracket to a short leg, so a filled/working short sits
 * with no broker-side stop unless the user babysits it manually — unlike a
 * long, which always has one attached at entry. Surfaced here (not just in the
 * order-ticket copy at submit time) because that copy is easy to miss and the
 * risk persists for as long as the position is open.
 */
function isUnprotectedShort(order: OrderRow): boolean {
  const state = normalizeOrderStatus(order.status);
  const isLive = state === "pending" || state === "partially_filled" || state === "filled";
  return order.asset_type !== "OPTION" && order.side === "sell" && order.stop_price == null && isLive;
}

function DayPlCell({ order }: { order: OrderRow }) {
  return (
    <TD
      className={cn(
        "text-right font-mono",
        order.dayPl == null ? "text-muted" : order.dayPl >= 0 ? "text-bull" : "text-bear",
      )}
    >
      {order.dayPl == null ? "—" : formatUsd(order.dayPl)}
    </TD>
  );
}

function DayPlPctCell({ order }: { order: OrderRow }) {
  return (
    <TD
      className={cn(
        "text-right font-mono",
        order.dayPlPct == null ? "text-muted" : order.dayPlPct >= 0 ? "text-bull" : "text-bear",
      )}
    >
      {order.dayPlPct == null ? "—" : formatPct(order.dayPlPct)}
    </TD>
  );
}

/**
 * The normalized status, not the broker's raw vocabulary. `accepted_for_bidding`
 * means nothing to a first-time user; "Pending" does, and the tooltip carries
 * the sentence that explains what happens next.
 */
export function StatusBadge({ order }: { order: OrderRow }) {
  const state = normalizeOrderStatus(order.status);
  return (
    <Badge variant={statusTone(state)} title={STATUS_DESCRIPTIONS[state]}>
      {STATUS_LABELS[state]}
    </Badge>
  );
}

function statusTone(state: NormalizedStatus): "bull" | "bear" | "warn" | "muted" {
  if (state === "filled") return "bull";
  if (state === "rejected") return "bear";
  if (state === "unknown") return "warn";
  return "muted";
}

/** Fill progress line for a partially-filled order. */
export function FillProgressLine({ order }: { order: OrderRow }) {
  if (normalizeOrderStatus(order.status) !== "partially_filled") return null;
  const progress = fillProgress(order.filled_qty, order.qty);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border" aria-hidden>
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, progress.pct)}%` }} />
      </div>
      <span className="text-xs text-muted">{progress.label}</span>
    </div>
  );
}

/** Numeric cell that renders an em dash rather than a misleading zero. */
function Num({ value, digits = 2, plain }: { value: number | null; digits?: number; plain?: boolean }) {
  return (
    <TD className="text-right font-mono text-muted">
      {value == null ? "—" : plain ? value.toFixed(digits) : formatUsd(value, digits)}
    </TD>
  );
}

/**
 * The phone layout. Same data, stacked — a 15-column grid on a 390px screen is
 * a horizontal scroller nobody scrolls, so the fields that matter are read
 * top-to-bottom instead.
 */
function OrderCard({
  order,
  title,
  subtitle,
  greeks,
}: {
  order: OrderRow;
  title: string;
  subtitle: string;
  greeks?: boolean;
}) {
  const isOption = order.asset_type === "OPTION";
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          <p className="truncate text-xs text-muted">{subtitle}</p>
        </div>
        <StatusBadge order={order} />
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <Field label="Placed" value={formatOpenedAt(order.broker_submitted_at ?? order.created_at)} />
        <Field label={isOption ? "Contracts" : "Quantity"} value={String(order.qty)} />
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted">Side</dt>
          <dd className="flex items-center gap-1.5">
            <span className={cn("font-mono tabular-nums", order.side === "buy" ? "text-bull" : "text-bear")}>
              {order.side}
            </span>
            {isUnprotectedShort(order) && (
              <Badge
                variant="warn"
                title="Short entries route as a plain sell order — Alpaca can't bracket short legs. Manage the stop and TP1 manually."
              >
                No stop
              </Badge>
            )}
          </dd>
        </div>
        <Field
          label={isOption ? "Premium" : "Limit"}
          value={money(isOption ? order.purchase_price : order.limit_price)}
        />
        <Field
          label="P/L today"
          value={order.dayPl == null ? "—" : formatUsd(order.dayPl)}
          tone={order.dayPl == null ? undefined : order.dayPl >= 0 ? "bull" : "bear"}
        />
        <Field label="P/L %" value={order.dayPlPct == null ? "—" : formatPct(order.dayPlPct)} />
        {isOption && greeks && (
          <>
            <Field label="Delta" value={plain(order.delta, 2)} />
            <Field label="Gamma" value={plain(order.gamma, 4)} />
            <Field label="Theta" value={plain(order.theta, 2)} />
            <Field label="Vega" value={plain(order.vega, 2)} />
          </>
        )}
      </dl>

      <div className="mt-2">
        <FillProgressLine order={order} />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bull" | "bear";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd
        className={cn(
          "truncate font-mono tabular-nums",
          tone === "bull" && "text-bull",
          tone === "bear" && "text-bear",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function money(v: number | null): string {
  return v == null ? "—" : formatUsd(v);
}

function plain(v: number | null, digits: number): string {
  return v == null ? "—" : v.toFixed(digits);
}
