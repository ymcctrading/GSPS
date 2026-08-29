/**
 * Account model — net liquidation value, and whether it is verified or a
 * user-entered estimate.
 *
 * Every risk figure downstream (permitted risk, drawdown, the circuit
 * breaker) is computed from this number, so getting the label wrong is not
 * cosmetic: a user-entered figure presented as verified would make GSPS's own
 * risk math look like broker-grade fact it never confirmed. See
 * lib/trade/kill-switch.ts for the same fail-closed instinct applied to
 * order placement rather than a display label.
 */

import { ESTIMATE_LABEL } from "@/lib/risk/config";

export { ESTIMATE_LABEL };

export interface AccountValueInputs {
  cash: number;
  /** Sum of quantity × current mark for every open holding. */
  marketValueOfHoldings: number;
  /** Margin debit balances, unsettled liabilities, etc. Always non-negative. */
  debitBalancesAndLiabilities: number;
  /**
   * True when this figure was computed from a connected broker's live
   * account data (Alpaca, SnapTrade). False for anything typed in by the
   * user, or synthesized from stale/cached data.
   */
  verified: boolean;
}

export interface AccountValue {
  netLiquidationValue: number;
  verified: boolean;
  /** Non-null exactly when `verified` is false — the disclosure to render next to the number. */
  label: string | null;
}

/**
 * Net liquidation value = cash + marked market value of holdings − debit
 * balances/liabilities. Deposits, withdrawals, transfers, and corporate
 * actions are the caller's concern (see `segregateFlows` below) — this
 * function only ever sums a snapshot, never a delta.
 */
export function netLiquidationValue(input: AccountValueInputs): AccountValue {
  const value = input.cash + input.marketValueOfHoldings - input.debitBalancesAndLiabilities;
  return {
    netLiquidationValue: value,
    verified: input.verified,
    label: input.verified ? null : ESTIMATE_LABEL,
  };
}

export interface CashFlowEvent {
  /** Positive for money added to the account, negative for money removed. */
  amount: number;
  kind: "deposit" | "withdrawal" | "transfer_in" | "transfer_out" | "corporate_action";
}

/**
 * Net liquidation value moves for reasons other than trading P&L: a deposit
 * makes equity go up without a single trade being any good, and counting it
 * as a "win" would corrupt every drawdown and execution-score figure derived
 * from the equity curve. This nets the flows out of a raw equity delta so
 * callers can compute `investment P&L = equityDelta - netExternalFlow`.
 */
export function netExternalFlow(events: CashFlowEvent[]): number {
  return events.reduce((sum, e) => sum + e.amount, 0);
}

/**
 * True investment P&L over a window: the raw change in net liquidation
 * value, with deposits/withdrawals/transfers/corporate actions stripped out.
 * This is what drawdown, 48h loss, and the execution score must be computed
 * against — never the raw equity delta, which a mid-window deposit would
 * silently mask a real drawdown inside.
 */
export function investmentPnl(equityStart: number, equityEnd: number, flows: CashFlowEvent[]): number {
  return equityEnd - equityStart - netExternalFlow(flows);
}
