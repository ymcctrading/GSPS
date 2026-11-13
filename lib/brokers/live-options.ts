/**
 * The contract the owner's live account buys (owner, 2026-11-13: "You are to
 * buy options ... I ok'd trades up to 33% of what is currently in the
 * account (up until we've amassed enough money to use [the method])").
 * Read by the momentum pass (`lib/brokers/live-momentum.ts`).
 *
 * The method's option rules (ref: SRC-001 Ch. 19A, `lib/options/gannOptionPlan.ts`)
 * keep their premise: the premium is the whole risk, a call for a rise and a
 * put for a fall. Until the account can afford the method's own contract
 * (30 days, several points out), the owner's budget decides it: at most a
 * third of the account, so the contract is the one closest to the money that
 * fits, with the method's 30 days as the tie-break between expirations. The
 * day windows are engineering choices.
 *
 * Pure: the chain is read by the caller.
 */

import { parseOccSymbol } from "@/lib/portfolio/occ";

/** Owner, 2026-11-13: a trade may cost up to 33% of what is in the account. */
export const LIVE_OPTION_BUDGET_FRACTION = 1 / 3;
/** Engineering choice: no contract that expires inside a week (time decay eats a week's hold). */
export const LIVE_OPTION_MIN_DAYS = 7;
/** Engineering choice: the search reaches a little past the method's 30 days. */
export const LIVE_OPTION_MAX_DAYS = 45;
/** The method's holding term (ref: SRC-001 Ch. 19A, PDF 447): the tie-break between expirations. */
const PREFERRED_DAYS = 30;

const DAY_MS = 86_400_000;

/** What one trade may spend: a third of equity, within the cash on hand. */
export function liveOptionBudget(equity: number, cash: number): number {
  if (!(equity > 0) || !Number.isFinite(cash)) return 0;
  return Math.min(0.95 * Math.max(cash, 0), LIVE_OPTION_BUDGET_FRACTION * equity);
}

/** A snapshot as the data feed returns it (only what is read here). */
export interface ChainSnapshot {
  latestQuote?: { ap?: number; bp?: number } | null;
  greeks?: { delta?: number } | null;
}

export interface LiveContractPick {
  symbol: string;
  expiration: string;
  strike: number;
  ask: number;
  qty: number;
  /** The most a contract may cost (per share) and keep the trade within the budget. */
  limitPrice: number;
}

const daysBetween = (fromDay: string, toDay: string) => Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS);

/**
 * The coarse option tick, valid on every class: a nickel under $3, a dime
 * above (penny-pilot classes also take cents, which this never needs).
 */
const coarseTick = (price: number) => (price >= 3 ? 0.1 : 0.05);
const roundDown = (price: number, tick: number) => Number((Math.floor(price / tick + 1e-7) * tick).toFixed(2));

/**
 * The most to bid without passing `price`: on the coarse tick when that still
 * covers the ask, else in cents (only a penny-pilot class quotes off the
 * nickel, so cents are valid there).
 */
export function floorTick(price: number, ask = 0): number {
  const coarse = roundDown(price, coarseTick(price));
  return coarse >= ask && coarse > 0 ? coarse : roundDown(price, 0.01);
}

/** `price` rounded up to the coarse tick (valid on every class). */
export function ceilTick(price: number): number {
  const tick = coarseTick(price);
  return Number((Math.ceil(price / tick - 1e-7) * tick).toFixed(2));
}

/**
 * The contract to buy, or the reason none fits: the right type, inside the
 * day window (7 to 45 by default), quoted both ways, costing no more than the budget; of those, the one
 * closest to the money (largest delta where the feed gives it, else the
 * strike nearest the stock), then the expiration nearest 30 days.
 */
export function chooseLiveContract(
  snaps: Record<string, ChainSnapshot>,
  q: {
    underlying: string;
    type: "call" | "put";
    underlyingPrice: number;
    budget: number;
    today: string;
    minDays?: number;
    maxDays?: number;
    /** The widest bid-ask spread taken, as a fraction of the ask (none when unset). */
    maxSpreadFrac?: number;
    /** Open interest by contract; with `minOpenInterest`, a contract missing from it is not taken. */
    openInterest?: Map<string, number>;
    minOpenInterest?: number;
    /**
     * The strike to aim for (the setup's TP1, owner 2026-11-13: buy the call
     * whose strike sits near where the move is expected to reach, cheaper for
     * being out of the money, and sell early on a profit). When it lies on
     * the trade's side of the price, the affordable contract whose strike is
     * nearest it is taken instead of the one closest to the money.
     */
    strikeTarget?: number | null;
  },
): LiveContractPick | { reason: string } {
  const budget = q.budget;
  const minDays = q.minDays ?? LIVE_OPTION_MIN_DAYS;
  const maxDays = q.maxDays ?? LIVE_OPTION_MAX_DAYS;
  if (!(budget > 0)) return { reason: "No cash for a contract." };
  type Cand = LiveContractPick & { delta: number | null; days: number };
  const cands: Cand[] = [];
  for (const [symbol, s] of Object.entries(snaps)) {
    const p = parseOccSymbol(symbol);
    if (!p || p.type !== q.type || p.underlying !== q.underlying.toUpperCase()) continue;
    const days = daysBetween(q.today, p.expiration);
    if (days < minDays || days > maxDays) continue;
    const ask = s.latestQuote?.ap;
    const bid = s.latestQuote?.bp;
    if (typeof ask !== "number" || !(ask > 0) || typeof bid !== "number" || !(bid > 0) || !Number.isFinite(ask)) continue;
    if (q.maxSpreadFrac != null && !((ask - bid) / ask <= q.maxSpreadFrac + 1e-9)) continue;
    if (q.minOpenInterest != null && !((q.openInterest?.get(symbol.toUpperCase()) ?? NaN) >= q.minOpenInterest)) continue;
    const cost = ask * 100;
    if (cost > budget) continue;
    const qty = Math.floor(budget / cost + 1e-9);
    if (qty < 1) continue;
    const limitPrice = floorTick(budget / (100 * qty), ask);
    if (!(limitPrice >= ask)) continue;
    const d = s.greeks?.delta;
    cands.push({ symbol: symbol.toUpperCase(), expiration: p.expiration, strike: p.strike, ask, qty, limitPrice, delta: typeof d === "number" && Number.isFinite(d) ? Math.abs(d) : null, days });
  }
  if (cands.length === 0) {
    const filters = [q.maxSpreadFrac != null ? `a spread within ${Math.round(q.maxSpreadFrac * 100)}% of the ask` : "", q.minOpenInterest != null ? `open interest of ${q.minOpenInterest} or more` : ""].filter(Boolean);
    return { reason: `No ${q.type} on ${q.underlying} ${minDays} to ${maxDays} days out${filters.length ? ` with ${filters.join(" and ")}` : ""} costs $${budget.toFixed(2)} or less (a third of the account).` };
  }
  // Distance out of the money, in the stock's price: negative is in the money.
  const out = (c: Cand) => (q.type === "call" ? c.strike - q.underlyingPrice : q.underlyingPrice - c.strike);
  // Closest to the money: delta nearest a half, else the strike nearest the stock.
  const allDeltas = cands.every((c) => c.delta != null);
  const t = q.strikeTarget;
  const aimed = t != null && Number.isFinite(t) && (q.type === "call" ? t > q.underlyingPrice : t < q.underlyingPrice);
  cands.sort((a, b) => {
    const near = aimed ? Math.abs(a.strike - (t as number)) - Math.abs(b.strike - (t as number)) : allDeltas ? Math.abs((a.delta as number) - 0.5) - Math.abs((b.delta as number) - 0.5) : Math.abs(out(a)) - Math.abs(out(b));
    if (Math.abs(near) > 1e-9) return near;
    return Math.abs(a.days - PREFERRED_DAYS) - Math.abs(b.days - PREFERRED_DAYS);
  });
  const { symbol, expiration, strike, ask, qty, limitPrice } = cands[0];
  return { symbol, expiration, strike, ask, qty, limitPrice };
}
