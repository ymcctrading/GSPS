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

async function alpacaFetch(
  creds: AlpacaCreds,
  path: string,
  init?: RequestInit,
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

export async function getAccount(creds: AlpacaCreds) {
  return alpacaFetch(creds, "/v2/account");
}

export async function getPositions(creds: AlpacaCreds) {
  return alpacaFetch(creds, "/v2/positions");
}

export async function getOrders(creds: AlpacaCreds, status: "open" | "closed" | "all" = "all") {
  return alpacaFetch(creds, `/v2/orders?status=${status}&limit=100`);
}

export async function cancelOrder(creds: AlpacaCreds, orderId: string) {
  return alpacaFetch(creds, `/v2/orders/${orderId}`, { method: "DELETE" });
}
