/**
 * The order a Guided recommendation places, from the Guided card's execute
 * route and from the demo account alike. One builder, so neither path can
 * drop a field the other keeps. Most of all the kind of buying point: an
 * entry at an old bottom (PLAN.md item 5, step 2) that reached confirmation
 * without it would be read as a crossing, against a line 3 points past a
 * level the plan never crosses.
 *
 * Three-question basis: 1. Gann's buying points, carried as priced (W006
 * pp.20, 46). 2. No periodicity claim. 3. Correspondence: the order is the
 * plan's own levels, whichever surface sends it.
 */
import type { OrderInput } from "@/lib/trade/place-order";

export interface GuidedOrderLevels {
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  masterProfit: number;
  /** Which of Gann's buying points the entry is; absent is the crossing. */
  entryKind?: "crossing" | "oldLevel";
}

export function guidedOrder(input: {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  referencePrice: number;
  levels: GuidedOrderLevels;
}): OrderInput {
  const { levels } = input;
  return {
    symbol: input.symbol,
    assetClass: "equity",
    side: input.side,
    qty: input.qty,
    // At the protocol's entry price, exactly as the "Protocol Recommended" path
    // does from the ticket, never a market order at whatever is on the screen.
    entryMode: "advised",
    limitPrice: levels.entry,
    // The protocol's own pair: the confirmation reads its line from these.
    entryStop: levels.stopLoss,
    ...(levels.entryKind ? { entryKind: levels.entryKind } : {}),
    referencePrice: input.referencePrice,
    // Guided Decision Mode, never the intraday alerts panel: this is not
    // subject to the intraday-promotion gates.
    intradaySourced: false,
    attachLevels: {
      stopLoss: levels.stopLoss,
      takeProfit: levels.takeProfit1,
      masterProfit: levels.masterProfit,
    },
    mode: "paper",
  };
}
