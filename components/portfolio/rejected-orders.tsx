"use client";

import Link from "next/link";
import { formatOpenedAt } from "@/lib/portfolio/opened-at";
import { formatUsd, tickerHref } from "@/lib/utils";
import type { OrderRow } from "./types";

/**
 * Rejected orders — the one ending that needs the user to do something.
 * -----------------------------------------------------------------------------
 * A rejection used to be invisible twice over. The API threw before it wrote
 * the row, so nothing was recorded at all; and had a row existed, it would have
 * landed in a collapsed section next to routine cancellations. Someone whose
 * order was refused had no way to find out what happened beyond a toast that
 * had already gone.
 *
 * Each row now carries three things: the broker's own words, when it happened,
 * and a route back to a corrected order on the same symbol.
 */
export function RejectedOrders({ orders }: { orders: OrderRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => (
        <RejectedOrderCard key={order.id} order={order} />
      ))}
    </div>
  );
}

function RejectedOrderCard({ order }: { order: OrderRow }) {
  const isOption = order.asset_type === "OPTION";
  // An option order's ticket lives on its underlying's page, not on the OCC
  // contract symbol — that has no ticker page of its own.
  const ticker = isOption ? underlyingOf(order.symbol) : order.symbol;

  return (
    <div className="rounded-lg border border-bear/40 bg-bear-soft/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {order.side === "buy" ? "Buy" : "Sell"} {order.qty} {isOption ? "×" : ""} {order.symbol}
            {order.limit_price != null && (
              <span className="ml-1 font-normal text-muted">
                at {formatUsd(order.limit_price)} limit
              </span>
            )}
          </p>
          <p className="text-xs text-muted">
            {formatOpenedAt(order.broker_submitted_at ?? order.created_at)}
          </p>
        </div>
        <Link
          href={tickerHref(ticker)}
          className="min-h-9 shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:border-accent"
        >
          Fix order →
        </Link>
      </div>

      <p className="mt-2 text-sm text-bear">
        {order.reject_reason ?? "The broker refused this order and gave no reason."}
      </p>

      <PriceCorrectionHint order={order} />
    </div>
  );
}

/**
 * When the request and the submitted price differ, say so. A user who typed
 * 49.755 and sees an order at 49.75 should be told that happened here, not left
 * to notice the discrepancy on their own.
 */
function PriceCorrectionHint({ order }: { order: OrderRow }) {
  const requested = order.requested_limit_price;
  const submitted = order.limit_price;
  if (requested == null || submitted == null || requested === submitted) return null;

  return (
    <p className="mt-1 text-xs text-muted">
      You entered {formatUsd(requested, 4)}; this instrument only accepts prices in whole
      increments, so the order was placed at {formatUsd(submitted)}.
    </p>
  );
}

/** Root of an OCC contract symbol, e.g. `NVDA260918C00150000` → `NVDA`. */
function underlyingOf(symbol: string): string {
  const match = /^([A-Z]{1,6})\d{6}[CP]\d{8}$/.exec(symbol.toUpperCase().trim());
  return match ? match[1] : symbol;
}
