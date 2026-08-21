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

export interface AlpacaAssetSummary {
  symbol: string;
  name: string;
  exchange?: string;
}

/**
 * The full tradable-equity list, module-scoped so a warm serverless instance
 * reuses it instead of paying Alpaca's full-catalog round trip on every
 * keystroke. Six hours because new listings and delistings are a daily-at-most
 * event, never something a novice's search needs to reflect within minutes.
 */
let assetsCache: { at: number; assets: AlpacaAssetSummary[] } | null = null;
const ASSETS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function loadTradableAssets(creds: AlpacaCreds): Promise<AlpacaAssetSummary[]> {
  if (assetsCache && Date.now() - assetsCache.at < ASSETS_CACHE_TTL_MS) {
    return assetsCache.assets;
  }
  const raw = await alpacaFetch(creds, `/v2/assets?status=active&asset_class=us_equity`);
  const assets: AlpacaAssetSummary[] = (Array.isArray(raw) ? raw : [])
    .filter((a) => a.tradable && a.symbol && a.name)
    .map((a) => ({
      symbol: String(a.symbol).toUpperCase(),
      name: String(a.name),
      exchange: a.exchange,
    }));
  assetsCache = { at: Date.now(), assets };
  return assets;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Search the tradable-equity list by ticker or company name, so a novice who
 * doesn't know "LLY" is Eli Lilly can type either. Ranked so an exact or
 * prefix ticker match always outranks a name hit, since a name substring can
 * appear inside dozens of unrelated companies (e.g. "American").
 */
export async function searchAssets(
  creds: AlpacaCreds,
  query: string,
  limit = 8,
): Promise<AlpacaAssetSummary[]> {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const assets = await loadTradableAssets(creds);

  const symbolPrefix: AlpacaAssetSummary[] = [];
  const symbolContains: AlpacaAssetSummary[] = [];
  const nameWordStart: AlpacaAssetSummary[] = [];
  const nameContains: AlpacaAssetSummary[] = [];
  const nameWordBoundary = new RegExp(`\\b${escapeRegExp(q)}`);

  for (const asset of assets) {
    if (asset.symbol.startsWith(q)) {
      symbolPrefix.push(asset);
      continue;
    }
    if (asset.symbol.includes(q)) {
      symbolContains.push(asset);
      continue;
    }
    const nameUpper = asset.name.toUpperCase();
    if (nameWordBoundary.test(nameUpper)) {
      nameWordStart.push(asset);
    } else if (nameUpper.includes(q)) {
      nameContains.push(asset);
    }
  }

  return [...symbolPrefix, ...symbolContains, ...nameWordStart, ...nameContains].slice(0, limit);
}

export interface PlaceOrderInput {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  type: "market" | "limit";
  limitPrice?: number;
  /**
   * Attach protocol levels as resting exit orders.
   *
   * Both legs is a `bracket`; a stop with no target is an `oto`, which is what
   * the protocol's runner tranche needs — it is protected but has no resting
   * profit level, because the rule that gets it out is a trailing one the
   * broker can't express as a static order.
   */
  bracket?: { stopLoss: number; takeProfit?: number | null };
  /** Rides through to the fill record; used to label a tranche. */
  clientOrderId?: string;
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
  if (input.clientOrderId) body.client_order_id = input.clientOrderId;
  if (input.bracket) {
    const { stopLoss, takeProfit } = input.bracket;
    body.stop_loss = { stop_price: String(stopLoss) };
    if (takeProfit != null) {
      body.order_class = "bracket";
      body.take_profit = { limit_price: String(takeProfit) };
    } else {
      body.order_class = "oto";
    }
  }
  return alpacaFetch(creds, "/v2/orders", { method: "POST", body: JSON.stringify(body) });
}

export interface ExitOrderInput {
  symbol: string;
  /** The side that *closes* the position: `sell` for a long. */
  side: "buy" | "sell";
  qty: number;
  /** Resting profit level. Omit for a protective stop with no target. */
  takeProfit?: number | null;
  stopLoss: number;
}

/**
 * Attach an exit to a position that already exists.
 *
 * This is the sell-side counterpart to a bracket, and it is what the staged
 * protocol exit is built from. A bracket can only be attached to an entry, and
 * an entry can only carry one — so a position that leaves in three tranches has
 * to place its exits separately, after the shares are held.
 *
 * With a target it is an OCO: the limit and the stop cancel each other, so a
 * tranche can only leave once. Without one it is a plain stop.
 *
 * `gtc`, not `day`: a protective stop that expires at the close leaves the
 * position naked overnight, which is the opposite of what it was placed for.
 */
export async function placeExitOrder(creds: AlpacaCreds, input: ExitOrderInput) {
  const body: Record<string, unknown> = {
    symbol: input.symbol,
    qty: String(input.qty),
    side: input.side,
    time_in_force: "gtc",
  };
  if (input.takeProfit != null) {
    body.order_class = "oco";
    body.type = "limit";
    body.take_profit = { limit_price: String(input.takeProfit) };
    body.stop_loss = { stop_price: String(input.stopLoss) };
  } else {
    body.type = "stop";
    body.stop_price = String(input.stopLoss);
  }
  return alpacaFetch(creds, "/v2/orders", { method: "POST", body: JSON.stringify(body) }) as Promise<AlpacaOrder>;
}

/**
 * One order, with its bracket legs attached.
 *
 * The exit manager needs the legs: it moves a resting stop by replacing the
 * *leg's* order, and a leg id is only reachable through its parent.
 */
export async function getOrder(
  creds: AlpacaCreds,
  orderId: string,
  opts: { nested?: boolean } = {},
): Promise<AlpacaOrder> {
  const query = opts.nested ? "?nested=true" : "";
  return alpacaFetch(creds, `/v2/orders/${encodeURIComponent(orderId)}${query}`);
}

/**
 * Move a resting order's price.
 *
 * Alpaca replaces rather than edits: the original is cancelled and a new order
 * takes its place, inheriting the bracket relationship. The response carries
 * the *new* id, which is why callers have to store what comes back rather than
 * assuming the id they patched still exists.
 */
export async function replaceOrder(
  creds: AlpacaCreds,
  orderId: string,
  changes: { stopPrice?: number; limitPrice?: number; qty?: number },
): Promise<AlpacaOrder> {
  const body: Record<string, unknown> = {};
  if (changes.stopPrice != null) body.stop_price = String(changes.stopPrice);
  if (changes.limitPrice != null) body.limit_price = String(changes.limitPrice);
  if (changes.qty != null) body.qty = String(changes.qty);
  return alpacaFetch(creds, `/v2/orders/${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
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

/** The order fields the reconciler reads. Alpaca returns considerably more. */
export interface AlpacaOrder {
  id: string;
  client_order_id?: string;
  symbol: string;
  status: string;
  side: "buy" | "sell";
  qty: string | null;
  filled_qty: string | null;
  filled_avg_price: string | null;
  type: string;
  order_class?: string;
  limit_price?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
  filled_at?: string | null;
  canceled_at?: string | null;
  expired_at?: string | null;
  failed_at?: string | null;
  legs?: AlpacaOrder[] | null;
}

/**
 * Every order the broker has on file since `since`, newest first, paged.
 *
 * Reconciliation depends on this being the *complete* set for the window: a
 * local order missing from it is treated as one the broker has no record of.
 * Alpaca caps a page at 500 and offers no cursor for orders, so pages walk
 * backwards through time using the oldest `submitted_at` seen so far as the
 * next `until`. `maxPages` bounds the walk — a ledger deeper than that is a
 * reporting problem, not a portfolio-load problem.
 *
 * `nested=false` keeps bracket legs as top-level rows, which is what the
 * ledger stores them as.
 */
export async function listOrders(
  creds: AlpacaCreds,
  opts: { since: Date; maxPages?: number } = { since: new Date(Date.now() - 90 * 24 * 3600 * 1000) },
): Promise<AlpacaOrder[]> {
  const pageSize = 500;
  const maxPages = opts.maxPages ?? 6;
  const collected: AlpacaOrder[] = [];
  const seen = new Set<string>();
  let until: Date | null = null;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      status: "all",
      limit: String(pageSize),
      direction: "desc",
      nested: "false",
      after: opts.since.toISOString(),
    });
    if (until) params.set("until", until.toISOString());

    const rows = (await alpacaFetch(creds, `/v2/orders?${params.toString()}`)) as AlpacaOrder[];
    if (!Array.isArray(rows) || rows.length === 0) break;

    let advanced = false;
    let oldest: number | null = null;
    for (const row of rows) {
      const id = String(row.id);
      if (!seen.has(id)) {
        seen.add(id);
        collected.push(row);
        advanced = true;
      }
      const t = Date.parse(row.submitted_at ?? row.created_at ?? "");
      if (!Number.isNaN(t) && (oldest === null || t < oldest)) oldest = t;
    }

    if (rows.length < pageSize || oldest === null || !advanced) break;
    // Step one millisecond past the oldest row so the next page can't return
    // the same boundary order forever.
    until = new Date(oldest - 1);
  }

  return collected;
}

/**
 * Fill activities — the execution-level record, one entry per (partial) fill.
 *
 * This is the source of truth for when a position opened. An order's
 * `filled_at` collapses a multi-execution fill to a single moment, and its
 * `submitted_at` is not a fill at all; the activities feed keeps each execution
 * with its own `transaction_time`, which is what `deriveOpenedAt` walks.
 */
export interface AlpacaFillActivity {
  id: string;
  activity_type: string;
  /** "fill" | "partial_fill" */
  type?: string;
  transaction_time: string;
  symbol: string;
  side: "buy" | "sell" | "sell_short";
  qty: string;
  price?: string;
  order_id?: string;
  cum_qty?: string;
  leaves_qty?: string;
}

export async function listFillActivities(
  creds: AlpacaCreds,
  opts: { since: Date; maxPages?: number },
): Promise<AlpacaFillActivity[]> {
  const pageSize = 100;
  const maxPages = opts.maxPages ?? 10;
  const collected: AlpacaFillActivity[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      activity_types: "FILL",
      page_size: String(pageSize),
      direction: "desc",
      after: opts.since.toISOString(),
    });
    if (pageToken) params.set("page_token", pageToken);

    const rows = (await alpacaFetch(
      creds,
      `/v2/account/activities?${params.toString()}`,
    )) as AlpacaFillActivity[];
    if (!Array.isArray(rows) || rows.length === 0) break;

    collected.push(...rows);
    if (rows.length < pageSize) break;
    pageToken = rows[rows.length - 1]?.id;
    if (!pageToken) break;
  }

  return collected;
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
