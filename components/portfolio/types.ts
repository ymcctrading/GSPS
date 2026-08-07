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

export interface Portfolio {
  mode: string;
  account: { equity: number; cash: number; buyingPower: number; dayPlPct: number };
  blendedPositions: BlendedPosition[];
  sync?: SyncState;
}
