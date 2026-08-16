import type { TargetStatus } from "@/lib/trade/targets";
import type { BlendedPosition } from "@/lib/portfolio/blend";

/** One row of the order ledger, as `/api/orders` serves it. */
export interface OrderRow {
  id: string;
  symbol: string;
  side: string;
  order_type: string;
  qty: number;
  limit_price: number | null;
  /** What the user typed, before it was snapped to the instrument's increment. */
  requested_limit_price: number | null;
  status: string;
  created_at: string;
  /** When the broker accepted it. Null until reconciliation records one. */
  broker_submitted_at: string | null;
  /** The broker's own words when it refused the order. */
  reject_reason: string | null;
  filled_qty: number | null;
  filled_avg_price: number | null;
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

/** Freshness metadata every broker-sourced panel carries. */
export interface SyncState {
  syncedAt: string | null;
  syncError: string | null;
  reconciled?: number;
  orphaned?: number;
  source?: string;
  fillHistoryAvailable?: boolean;
}

/**
 * What the staged-exit manager did on the last `/api/orders` poll — moving a
 * trailing stop, attaching a position's tranches, retiring a finished plan.
 * This is a change to the user's risk (a stop that moved) or something they
 * need to know about while they can still act (one that couldn't be moved),
 * so it isn't optional telemetry — see `lib/trade/exit-manager.ts`.
 */
export interface ExitsState {
  managed: number;
  attached: number;
  adjusted: number;
  closed: number;
  notes: string[];
  error: string | null;
}

export interface Portfolio {
  mode: string;
  /**
   * The caller's own book, not the brokerage account's.
   *
   * `equity` is the market value of the positions below. `cash` and
   * `buyingPower` are null because they belong to the shared paper account and
   * cannot be divided between its users — see `app/api/portfolio/route.ts`.
   * They become numbers again once each user connects their own account.
   */
  account: {
    equity: number;
    cash: number | null;
    buyingPower: number | null;
    dayPl?: number;
    dayPlPct: number;
    currency?: string;
  };
  /** What `account` and `blendedPositions` cover. See the route's header. */
  positionScope?: "owner";
  blendedPositions: BlendedPosition[];
  sync?: SyncState;
}
