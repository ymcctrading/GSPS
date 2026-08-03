/**
 * Alpaca Trading API client — identical code path for paper and live; only the
 * base URL and keys differ. Env keys are the app-level default (paper);
 * per-user live keys come from broker_connections.
 */

export type TradeMode = "paper" | "live";

export interface AlpacaCreds {
  key: string;
  secret: string;
  mode: TradeMode;
}

export function envCreds(mode: TradeMode): AlpacaCreds | null {
  if (mode === "live") {
    const key = process.env.ALPACA_LIVE_API_KEY;
    const secret = process.env.ALPACA_LIVE_API_SECRET;
    return key && secret ? { key, secret, mode } : null;
  }
  const key =
    process.env.ALPACA_API_KEY ??
    process.env.ALPACAP_API ??
    process.env.ALPACA_KEY_ID ??
    process.env.APCA_API_KEY_ID;
  const secret =
    process.env.ALPACA_API_SECRET ??
    process.env.ALPACA_API_SECRET_KEY ??
    process.env.ALPACA_SECRET_KEY ??
    process.env.APCA_API_SECRET_KEY;
  return key && secret ? { key, secret, mode } : null;
}

function baseUrl(mode: TradeMode): string {
  return mode === "live" ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
}

// Untyped boundary, same as the market-data client: one helper serves every
// trading endpoint. The accessors below it (getAccount, getPositions) declare
// the shapes this app actually reads, which is where the typing belongs.
async function alpacaFetch(
  creds: AlpacaCreds,
  path: string,
  init?: RequestInit,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const res = await fetch(`${baseUrl(creds.mode)}${path}`, {
    ...init,
    headers: {
      "APCA-API-KEY-ID": creds.key,
      "APCA-API-SECRET-KEY": creds.secret,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alpaca trading ${path} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

/**
 * The tradability facts the order ticket needs before it lets someone press a
 * button. Alpaca returns far more; these are the fields that change what the UI
 * should offer.
 */
export interface AlpacaAsset {
  symbol: string;
  name?: string;
  tradable: boolean;
  shortable: boolean;
  easy_to_borrow: boolean;
  fractionable?: boolean;
  status?: string;
  exchange?: string;
}

/**
 * Look up one asset. Used as a pre-flight so a non-shortable name (GPUS and
 * most small caps) disables the short side in the ticket instead of failing
 * with a 422 after the user has already committed to the order.
 */
export async function getAsset(creds: AlpacaCreds, symbol: string): Promise<AlpacaAsset> {
  const raw = await alpacaFetch(creds, `/v2/assets/${encodeURIComponent(symbol.toUpperCase())}`);
  return {
    symbol: String(raw.symbol ?? symbol).toUpperCase(),
    name: raw.name,
    tradable: Boolean(raw.tradable),
    shortable: Boolean(raw.shortable),
    easy_to_borrow: Boolean(raw.easy_to_borrow),
    fractionable: raw.fractionable,
    status: raw.status,
    exchange: raw.exchange,
  };
}

export interface PlaceOrderInput {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  type: "market" | "limit";
  limitPrice?: number;
  /** Attach protocol stop/target as a bracket. */
  bracket?: { stopLoss: number; takeProfit: number };
}

export async function placeOrder(creds: AlpacaCreds, input: PlaceOrderInput) {
  const body: Record<string, unknown> = {
    symbol: input.symbol,
    qty: String(input.qty),
    side: input.side,
    type: input.type,
    time_in_force: "day",
  };
  if (input.type === "limit") body.limit_price = String(input.limitPrice);
  if (input.bracket) {
    body.order_class = "bracket";
    body.stop_loss = { stop_price: String(input.bracket.stopLoss) };
    body.take_profit = { limit_price: String(input.bracket.takeProfit) };
  }
  return alpacaFetch(creds, "/v2/orders", { method: "POST", body: JSON.stringify(body) });
}

export interface OptionContract {
  symbol: string; // OCC symbol, e.g. TSM250815C00120000
  name: string;
  type: "call" | "put";
  strike_price: string;
  expiration_date: string; // YYYY-MM-DD
  open_interest?: string;
  close_price?: string | null;
}

export interface OptionContractQuery {
  underlying: string;
  /** Restrict strikes to a window around this price (± pct). */
  price?: number;
  pct?: number;
  limit?: number;
  /** Latest expiration to return, `YYYY-MM-DD`. Bounds the chain's horizon. */
  expirationBefore?: string;
}

/**
 * List tradable option contracts for an underlying. Uses the trading API
 * (works on paper too). Returns near-the-money, not-yet-expired contracts.
 */
export async function listOptionContracts(
  creds: AlpacaCreds,
  q: OptionContractQuery,
): Promise<OptionContract[]> {
  const params = new URLSearchParams({
    underlying_symbols: q.underlying.toUpperCase(),
    status: "active",
    limit: String(q.limit ?? 10000),
    expiration_date_gte: new Date().toISOString().slice(0, 10),
  });
  if (q.price && q.pct) {
    params.set("strike_price_gte", (q.price * (1 - q.pct)).toFixed(2));
    params.set("strike_price_lte", (q.price * (1 + q.pct)).toFixed(2));
  }
  if (q.expirationBefore) params.set("expiration_date_lte", q.expirationBefore);
  const data = await alpacaFetch(creds, `/v2/options/contracts?${params.toString()}`);
  return (data.option_contracts ?? []) as OptionContract[];
}

/**
 * The subset of Alpaca's account and position payloads this app reads. Alpaca
 * sends every numeric field as a string; the callers do their own Number()
 * conversion, so these keep the wire types rather than pretending otherwise.
 */
export interface AlpacaAccount {
  equity: string;
  last_equity: string;
  buying_power: string;
  cash: string;
  currency: string;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  side: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: string;
  asset_class?: string;
}

export async function getAccount(creds: AlpacaCreds): Promise<AlpacaAccount> {
  return alpacaFetch(creds, "/v2/account");
}

export async function getPositions(creds: AlpacaCreds): Promise<AlpacaPosition[]> {
  return alpacaFetch(creds, "/v2/positions");
}

export async function getOrders(creds: AlpacaCreds, status: "open" | "closed" | "all" = "all") {
  return alpacaFetch(creds, `/v2/orders?status=${status}&limit=100`);
}

export async function cancelOrder(creds: AlpacaCreds, orderId: string) {
  return alpacaFetch(creds, `/v2/orders/${orderId}`, { method: "DELETE" });
}

/**
 * Liquidate an open position at market. Omitting `qty` closes the whole
 * position; passing one closes that many units and leaves the rest open.
 * Alpaca cancels any resting orders on the symbol as part of this.
 */
export async function closePosition(creds: AlpacaCreds, symbol: string, qty?: number) {
  const path = `/v2/positions/${encodeURIComponent(symbol)}${qty ? `?qty=${qty}` : ""}`;
  return alpacaFetch(creds, path, { method: "DELETE" });
}
