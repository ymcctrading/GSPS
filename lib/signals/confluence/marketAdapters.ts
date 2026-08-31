/**
 * Market-specific adapter registry for the Gann/Sara confluence layers, per
 * the "GSPS Gann & Sara Cross-Market Integration Addendum" (2026-08-28).
 *
 * The addendum requires every confluence module to route a signal through
 * the correct market adapter before a plan may qualify, across all seven
 * supported markets. GSPS's data layer (`lib/types.ts`'s `AssetClass`) only
 * onboards two of them today (`us_equity`, `crypto`) — options, futures,
 * forex and commodities have no adapter-specific data/mechanics implemented
 * anywhere in the platform yet. Rather than fabricate that logic here, this
 * registry names the required considerations for every market (matching the
 * addendum's table) and reports `unsupported` for the four not yet wired to
 * a data path — a confluence module must treat that as "route the signal,
 * get nothing back" rather than silently degrading to equities behavior.
 */

import type { AssetClass } from "@/lib/types";

export type SupportedMarket =
  | "equities"
  | "options"
  | "futures"
  | "forex"
  | "crypto"
  | "commodities";

export type MarketAdapterStatus = "supported" | "unsupported";

export interface MarketAdapterEntry {
  market: SupportedMarket;
  label: string;
  status: MarketAdapterStatus;
  /** What Gann/Sara are applied to for this market, per the addendum's table. */
  applyTo: string;
  /** Adapter-side considerations neither framework may substitute for. */
  considerations: string[];
  note: string;
}

export const MARKET_ADAPTER_REGISTRY: Record<SupportedMarket, MarketAdapterEntry> = {
  equities: {
    market: "equities",
    label: "Equities/ETFs",
    status: "supported",
    applyTo: "Instrument chart and multi-timeframe structure",
    considerations: [
      "earnings",
      "corporate actions",
      "liquidity",
      "spreads",
      "sessions",
      "fractional shares",
      "cash/margin constraints",
    ],
    note: "Routed through the existing us_equity market-data path.",
  },
  crypto: {
    market: "crypto",
    label: "Crypto",
    status: "supported",
    applyTo: "Venue-specific price structure",
    considerations: [
      "24/7 clock",
      "exchange fragmentation",
      "funding",
      "leverage/liquidation",
      "custody/counterparty risk",
    ],
    note: "Routed through the existing crypto market-data path.",
  },
  options: {
    market: "options",
    label: "Options",
    status: "unsupported",
    applyTo: "Underlying chart first; then map thesis to option expression",
    considerations: [
      "strike/expiry",
      "IV",
      "Greeks",
      "OI",
      "volume",
      "bid/ask",
      "theta",
      "assignment/exercise",
      "defined-risk rules",
    ],
    note: "No options-specific data/mechanics adapter exists in GSPS yet — routing returns unsupported rather than reusing the equities underlying's read.",
  },
  futures: {
    market: "futures",
    label: "Futures",
    status: "unsupported",
    applyTo: "Contract chart and relevant continuous/active contract context",
    considerations: [
      "tick/point value",
      "contract roll",
      "margin",
      "overnight sessions",
      "expiry",
      "event reports",
    ],
    note: "No futures data path exists in GSPS yet.",
  },
  forex: {
    market: "forex",
    label: "Forex",
    status: "unsupported",
    applyTo: "Pair chart and session-aware structure",
    considerations: [
      "pips",
      "lot size",
      "account-currency conversion",
      "rollover",
      "liquidity sessions",
      "central-bank events",
    ],
    note: "No forex data path exists in GSPS yet.",
  },
  commodities: {
    market: "commodities",
    label: "Commodities",
    status: "unsupported",
    applyTo: "Active contract price structure",
    considerations: [
      "contract specs",
      "delivery/roll",
      "limits",
      "inventory/crop/energy reports",
      "seasonality",
    ],
    note: "No commodities data path exists in GSPS yet.",
  },
};

export interface RoutedMarketAdapter {
  market: SupportedMarket;
  status: MarketAdapterStatus;
  note: string;
}

/** Map GSPS's current AssetClass onto the addendum's market taxonomy and route it. */
export function routeMarketAdapter(assetClass: AssetClass): RoutedMarketAdapter {
  const market: SupportedMarket = assetClass === "crypto" ? "crypto" : "equities";
  const entry = MARKET_ADAPTER_REGISTRY[market];
  return { market: entry.market, status: entry.status, note: entry.note };
}
