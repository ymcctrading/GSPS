/**
 * Brokerage abstraction (Objection O-1 / Suggestion S-2).
 *
 * ALL order flow goes through this interface. Phase 0 ships ONLY a PaperBroker
 * (simulated fills, no real capital). A live broker adapter must not be wired
 * until a licensed execution partner + compliance sign-off exist; when it is,
 * it implements this same interface so nothing upstream changes.
 */
export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";
export type OrderStatus = "ACCEPTED" | "FILLED" | "REJECTED" | "CANCELLED";

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  /** Free-form tag for audit/event log (Suggestion S-10). */
  clientTag?: string;
}

export interface OrderResult {
  orderId: string;
  status: OrderStatus;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  /** Simulated or real average fill price. */
  avgFillPrice: number | null;
  /** True whenever this went through the paper broker (never real money). */
  paper: boolean;
  submittedAt: string;
  message: string;
}

export interface BrokerageProvider {
  readonly mode: "paper" | "live";
  submitOrder(order: OrderRequest): Promise<OrderResult>;
}
