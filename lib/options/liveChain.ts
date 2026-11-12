/**
 * The real options chain: listed contracts with their real quotes.
 * -----------------------------------------------------------------------------
 * Before this module the Alpaca data provider had no options chain, so the
 * chart's Options tab always fell back to `simulateOptionChain`: strikes a
 * fixed step apart around the price, and a made-up bid, ask, last, volume,
 * open interest, IV and greeks for each (owner, 2026-11-12: "All needs to be
 * real data").
 *
 * Every figure here comes from the market or is solved from it:
 * - Strikes and expirations are the listed contracts (OCC symbols).
 * - Bid, ask and last are the feed's latest quote and trade; volume is the
 *   contract's own daily bar in the chain's latest session (0 when it did not
 *   trade that session); open interest is the exchange figure the broker's
 *   contract list carries (null when it is not reachable).
 * - IV and greeks are the feed's own when it sends them. Alpaca's free
 *   "indicative" feed does not, so they are solved from the contract's real
 *   premium (the mid of its bid and ask, else its last trade) with the
 *   platform's Black-Scholes model (`modelGreeksFromPremium`), the same
 *   function Open Positions reads. A premium no volatility reprices shows no
 *   greeks rather than invented ones.
 *
 * The free feed is delayed, so the chain says which feed it read and each
 * contract carries its quote time.
 *
 * Three-question basis: 1. Method: the option chain opens on Gann's 30-day
 * term (`gannOptionExpiration`, ref: SRC-001 Ch. 19A; ref: SRC-010), and the
 * premium is the risk, so the premium shown must be the market's. 2. Cycles:
 * no periodicity claim; expirations are the exchange's calendar. 3. Hermetic:
 * Correspondence (the chain on the screen corresponds to the market's own) and
 * Cause and Effect (the greeks are effects of the observed premium, never
 * inputs to it). Law of Creation: the quote (price) paired with the model
 * (structure) creates the greeks, which neither carries alone.
 */

import type { AssetClass } from "@/lib/types";
import type { OptionChain, OptionContract } from "@/lib/data/provider";
import { fetchLatestPrice, fetchOptionSnapshots, optionsFeed } from "@/lib/data/alpaca";
import { envCreds, listOptionContracts, type OptionContract as BrokerContract } from "@/lib/brokers/alpaca";
import { parseOccSymbol } from "@/lib/portfolio/occ";
import { modelGreeksFromPremium, type Greeks } from "@/lib/options/greeks";
import { expirationHorizonEnd, toDateInput } from "@/lib/options/contracts";
import { gannOptionExpiration } from "@/lib/options/gannOptionPlan";
import { etDateKey } from "@/lib/market/session";

/** Strikes the chain reads around the underlying: ±20%, as the order ticket's chain. */
export const CHAIN_STRIKE_BAND = 0.2;
/** The band read to learn which expirations are listed: ±3% of the underlying. */
export const EXPIRATION_PROBE_BAND = 0.03;

/** The fields of an Alpaca option snapshot this module reads. */
export interface RawOptionSnapshot {
  latestQuote?: { bp?: number; ap?: number; t?: string } | null;
  latestTrade?: { p?: number; t?: string } | null;
  dailyBar?: { v?: number; t?: string } | null;
  greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number } | null;
  impliedVolatility?: number | null;
}

function positive(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

/** The feed's own greeks, when it sent a complete, finite set and an IV. */
function feedGreeks(snap: RawOptionSnapshot): { greeks: Greeks; iv: number } | null {
  const g = snap.greeks;
  const iv = positive(snap.impliedVolatility);
  if (!g || iv == null) return null;
  const vals = [g.delta, g.gamma, g.theta, g.vega];
  if (!vals.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  return {
    greeks: { delta: round4(g.delta!), gamma: round4(g.gamma!), theta: round4(g.theta!), vega: round4(g.vega!) },
    iv: Math.round(iv * 1000) / 1000,
  };
}

/**
 * The premium a contract's greeks are solved from: the mid of a two-sided
 * quote, else the last trade. Null when the contract has neither.
 */
export function observedPremium(bid: number | null, ask: number | null, last: number | null): number | null {
  if (bid != null && ask != null && ask >= bid) return Math.round(((bid + ask) / 2) * 10000) / 10000;
  return last;
}

/**
 * One contract from its snapshot. Null when the symbol is not an OCC option
 * symbol. `volume` is the daily bar's, before the chain-level session check.
 */
export function contractFromSnapshot(
  occ: string,
  snap: RawOptionSnapshot,
  spot: number,
  openInterest: number | null,
  now: Date = new Date(),
): OptionContract | null {
  const parsed = parseOccSymbol(occ);
  if (!parsed) return null;
  const bid = positive(snap.latestQuote?.bp);
  const ask = positive(snap.latestQuote?.ap);
  const last = positive(snap.latestTrade?.p);

  const fromFeed = feedGreeks(snap);
  const modelled = fromFeed
    ? null
    : modelGreeksFromPremium(parsed.type, spot, parsed.strike, parsed.expiration, observedPremium(bid, ask, last), now);
  const greeks = fromFeed?.greeks ?? modelled?.greeks ?? null;
  const v = snap.dailyBar?.v;

  return {
    strike: parsed.strike,
    type: parsed.type,
    expiration: parsed.expiration,
    bid,
    ask,
    last,
    delta: greeks?.delta ?? null,
    gamma: greeks?.gamma ?? null,
    theta: greeks?.theta ?? null,
    vega: greeks?.vega ?? null,
    iv: fromFeed?.iv ?? modelled?.iv ?? null,
    greeksSource: fromFeed ? "feed" : (modelled?.source ?? "none"),
    openInterest,
    volume: typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null,
    inTheMoney: parsed.type === "call" ? parsed.strike < spot : parsed.strike > spot,
    contractSymbol: occ.toUpperCase(),
    quoteTime: snap.latestQuote?.t ?? snap.latestTrade?.t ?? null,
  };
}

/**
 * Contracts from a chain's snapshots, sorted by strike then call before put.
 * Volume is the latest session's: a contract whose daily bar is from an
 * earlier session than the chain's latest did not trade in it, so it reads 0,
 * not the volume of the day it last traded.
 */
export function contractsFromSnapshots(
  snapshots: Record<string, RawOptionSnapshot>,
  spot: number,
  openInterest: Map<string, number>,
  now: Date = new Date(),
): OptionContract[] {
  const sessionOf = (s: RawOptionSnapshot) => (s.dailyBar?.t ? etDateKey(new Date(s.dailyBar.t)) : null);
  let latestSession: string | null = null;
  for (const s of Object.values(snapshots)) {
    const k = sessionOf(s);
    if (k && (!latestSession || k > latestSession)) latestSession = k;
  }
  const out: OptionContract[] = [];
  for (const [occ, snap] of Object.entries(snapshots)) {
    const c = contractFromSnapshot(occ, snap, spot, openInterest.get(occ.toUpperCase()) ?? null, now);
    if (!c) continue;
    if (c.volume != null && latestSession && sessionOf(snap) !== latestSession) c.volume = 0;
    out.push(c);
  }
  return out.sort((a, b) => a.strike - b.strike || (a.type === b.type ? 0 : a.type === "call" ? -1 : 1));
}

/** Distinct expirations, ascending, on or after `today` (ET date). */
export function expirationsFromSymbols(symbols: Iterable<string>, today: string): string[] {
  const set = new Set<string>();
  for (const s of symbols) {
    const p = parseOccSymbol(s);
    if (p && p.expiration >= today) set.add(p.expiration);
  }
  return [...set].sort();
}

/** Seams for tests; production reads Alpaca. */
export interface LiveChainDeps {
  now?: Date;
  fetchSpot?: (symbol: string) => Promise<number>;
  snapshots?: typeof fetchOptionSnapshots;
  /** Null when the broker's contract list is not reachable (no trading key). */
  listContracts?: ((q: Parameters<typeof listOptionContracts>[1]) => Promise<BrokerContract[]>) | null;
}

function defaultListContracts(): LiveChainDeps["listContracts"] {
  const creds = envCreds("paper");
  return creds ? (q) => listOptionContracts(creds, q) : null;
}

/**
 * The listed chain for one expiration of `symbol`, with every listed
 * expiration in its horizon. Opens on Gann's 30-day term when `expiration` is
 * not given or not listed.
 */
export async function fetchLiveOptionChain(
  symbol: string,
  assetClass: AssetClass,
  expiration?: string,
  deps: LiveChainDeps = {},
): Promise<OptionChain> {
  if (assetClass !== "us_equity") throw new Error("Options are listed on US stocks and funds only.");
  const sym = symbol.toUpperCase();
  const now = deps.now ?? new Date();
  const snapshots = deps.snapshots ?? fetchOptionSnapshots;
  const listContracts = deps.listContracts === undefined ? defaultListContracts() : deps.listContracts;

  const spot = await (deps.fetchSpot ?? ((s) => fetchLatestPrice(s, "us_equity")))(sym);
  if (!(spot > 0)) throw new Error(`No price for ${sym}`);
  const today = etDateKey(now);
  const horizonEnd = toDateInput(expirationHorizonEnd(sym, now));
  const band = (pct: number) => ({ gte: (spot * (1 - pct)).toFixed(2), lte: (spot * (1 + pct)).toFixed(2) });

  // 1. Which expirations are listed: the calls near the money across the horizon.
  let probe: string[] | null = null;
  if (listContracts) {
    probe = await listContracts({
      underlying: sym,
      price: spot,
      pct: EXPIRATION_PROBE_BAND,
      expirationBefore: horizonEnd,
      type: "call",
    })
      .then((cs) => cs.map((c) => c.symbol))
      .catch(() => null);
  }
  if (!probe) {
    const b = band(EXPIRATION_PROBE_BAND);
    probe = Object.keys(
      await snapshots({
        underlying: sym,
        filters: {
          type: "call",
          strike_price_gte: b.gte,
          strike_price_lte: b.lte,
          expiration_date_gte: today,
          expiration_date_lte: horizonEnd,
        },
      }),
    );
  }
  const expirations = expirationsFromSymbols(probe, today);
  if (expirations.length === 0) throw new Error(`No listed options for ${sym}.`);
  const chosen =
    expiration && expirations.includes(expiration) ? expiration : (gannOptionExpiration(expirations, now) ?? expirations[0]);

  // 2. That expiration's contracts with their quotes, and their open interest.
  const b = band(CHAIN_STRIKE_BAND);
  const [snaps, oi] = await Promise.all([
    snapshots({ underlying: sym, filters: { expiration_date: chosen, strike_price_gte: b.gte, strike_price_lte: b.lte } }),
    listContracts
      ? listContracts({ underlying: sym, price: spot, pct: CHAIN_STRIKE_BAND, expiration: chosen }).catch(() => [])
      : Promise.resolve([] as BrokerContract[]),
  ]);
  const openInterest = new Map<string, number>();
  for (const c of oi) {
    const n = Number(c.open_interest);
    if (c.open_interest != null && Number.isFinite(n) && n >= 0) openInterest.set(c.symbol.toUpperCase(), n);
  }

  return {
    symbol: sym,
    underlyingPrice: spot,
    expiration: chosen,
    expirations,
    simulated: false,
    feed: optionsFeed(),
    contracts: contractsFromSnapshots(snaps as Record<string, RawOptionSnapshot>, spot, openInterest, now),
  };
}

/**
 * Named contracts with their real quotes and greeks, keyed by OCC symbol: the
 * order ticket's picked contract. `spot` is the underlying's price.
 */
export async function fetchLiveOptionContracts(
  occSymbols: string[],
  spot: number,
  deps: Pick<LiveChainDeps, "now" | "snapshots"> = {},
): Promise<Map<string, OptionContract>> {
  const snaps = (await (deps.snapshots ?? fetchOptionSnapshots)({ symbols: occSymbols })) as Record<string, RawOptionSnapshot>;
  const out = new Map<string, OptionContract>();
  for (const [occ, snap] of Object.entries(snaps)) {
    const c = contractFromSnapshot(occ, snap, spot, null, deps.now ?? new Date());
    if (c) out.set(occ.toUpperCase(), c);
  }
  return out;
}
