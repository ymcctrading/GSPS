/**
 * PaperBroker — simulated execution against mock quotes. No real capital ever.
 */
import { getMarketDataProvider } from "@/lib/marketData";
import type {
  BrokerageProvider,
  OrderRequest,
  OrderResult,
} from "./types";

function id(): string {
  return "paper_" + Math.random().toString(36).slice(2, 10);
}

export class PaperBroker implements BrokerageProvider {
  readonly mode = "paper" as const;

  async submitOrder(order: OrderRequest): Promise<OrderResult> {
    const quote = await getMarketDataProvider().getQuote(order.symbol);
    // Market orders fill at last; limit orders fill only if marketable.
    let avgFillPrice: number | null = quote.last;
    let status: OrderResult["status"] = "FILLED";
    let message = "Simulated fill at last price.";

    if (order.type === "LIMIT" && order.limitPrice != null) {
      const marketable =
        order.side === "BUY"
          ? quote.last <= order.limitPrice
          : quote.last >= order.limitPrice;
      if (!marketable) {
        avgFillPrice = null;
        status = "ACCEPTED";
        message = "Limit order resting (not marketable at current price).";
      } else {
        avgFillPrice = order.limitPrice;
      }
    }

    return {
      orderId: id(),
      status,
      symbol: order.symbol.toUpperCase(),
      side: order.side,
      type: order.type,
      quantity: order.quantity,
      avgFillPrice,
      paper: true,
      submittedAt: new Date().toISOString(),
      message,
    };
  }
}
