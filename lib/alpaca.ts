/**
 * Alpaca paper-trading account reader (server-only).
 *
 * Reads account, positions, and orders from Alpaca's paper API when
 * ALPACA_KEY_ID + ALPACA_SECRET_KEY are configured (Vercel env vars). Without
 * keys it returns the standard paper defaults so Portfolio still renders and the
 * app clearly shows a "not connected" state.
 *
 * Free paper keys: https://alpaca.markets → Paper Trading → API keys.
 */

const BASE =
  process.env.ALPACA_PAPER_BASE_URL ?? "https://paper-api.alpaca.markets";

export function alpacaConfigured(): boolean {
  return Boolean(process.env.ALPACA_KEY_ID && process.env.ALPACA_SECRET_KEY);
}

function headers() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "",
  };
}

export type Account = {
  equity: number;
  cash: number;
  buyingPower: number;
  todayPct: number;
};

export type Position = {
  symbol: string;
  qty: number;
  avgEntry: number;
  current: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlpc: number;
};

export type Order = {
  id: string;
  symbol: string;
  side: string;
  qty: number;
  type: string;
  status: string;
  submittedAt: string;
  filledAvgPrice: number | null;
};

const DEFAULT_ACCOUNT: Account = {
  equity: 100_000,
  cash: 100_000,
  buyingPower: 400_000,
  todayPct: 0,
};

async function get<T>(path: string): Promise<T | null> {
  if (!alpacaConfigured()) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getAccount(): Promise<Account> {
  const raw = await get<Record<string, string>>("/v2/account");
  if (!raw) return DEFAULT_ACCOUNT;
  const equity = Number(raw.equity ?? 0);
  const lastEquity = Number(raw.last_equity ?? equity);
  const todayPct =
    lastEquity > 0 ? ((equity - lastEquity) / lastEquity) * 100 : 0;
  return {
    equity,
    cash: Number(raw.cash ?? 0),
    buyingPower: Number(raw.buying_power ?? 0),
    todayPct,
  };
}

export async function getPositions(): Promise<Position[]> {
  const raw = await get<Record<string, string>[]>("/v2/positions");
  if (!raw) return [];
  return raw.map((p) => ({
    symbol: p.symbol,
    qty: Number(p.qty),
    avgEntry: Number(p.avg_entry_price),
    current: Number(p.current_price ?? p.avg_entry_price),
    marketValue: Number(p.market_value ?? 0),
    unrealizedPl: Number(p.unrealized_pl ?? 0),
    unrealizedPlpc: Number(p.unrealized_plpc ?? 0) * 100,
  }));
}

export async function getOrders(): Promise<Order[]> {
  const raw = await get<Record<string, string>[]>(
    "/v2/orders?status=all&limit=50&direction=desc",
  );
  if (!raw) return [];
  return raw.map((o) => ({
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    qty: Number(o.qty ?? 0),
    type: o.type ?? o.order_type ?? "market",
    status: o.status,
    submittedAt: o.submitted_at ?? o.created_at ?? "",
    filledAvgPrice: o.filled_avg_price ? Number(o.filled_avg_price) : null,
  }));
}
