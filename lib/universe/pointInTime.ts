/**
 * GSPS — the point-in-time universe the backtest replays.
 *
 * The universe runner replayed today's large caps (`LARGE_CAP_UNIVERSE`) over
 * six years. That list holds only the companies that are large now, so the
 * replay never met a large company that later failed, was bought out or shrank
 * below the floor, and it met today's winners in years they were still small.
 * Both flatter the longs (the 2026-10-29 rebuild handoff names it). Here each
 * year has its own members: the candidates whose own market capitalisation
 * cleared the $10B floor (`MARKET_CAP_FLOOR_USD`, no ceiling, the scan's one
 * cap rule) on the year's first day, read only from what was known then.
 *
 * Candidates: today's list, plus every ticker in the S&P 500 at any time in the
 * replay's span (`sp500History.json`, built by `scripts/fetch-sp500-history.mjs`),
 * which names the large companies of each past year, the departed included. The
 * index decides nothing itself; a candidate is a member only on its own cap.
 *
 * The cap: the latest share count filed before the year's first day
 * (`splitAdjustedSharesAsOf`, restated to the bars' split basis) times the last
 * monthly close before it. Both are split-adjusted, so the product is the cap
 * as it stood. A count filed more than 18 months before is stale (the rule
 * `scripts/fetch-instrument-reference.mjs` applies to the current count). An
 * unknown cap fails closed, as `marketCapPass` does: no shares filed, stale
 * shares, or no close. That leaves out the foreign listings (their 20-F counts
 * are ordinary shares, not the ADRs traded) by where they are listed, not by how
 * they did, so it costs the sample, not its honesty.
 *
 * Engineering choices, labelled: the yearly reading on the first of January
 * (a stock that crosses the floor in March waits for the next year; one with no
 * bar before then, as on the vendor's free feed, which starts in mid-2020, is
 * read the month after its first bar and counts from that day), the 18
 * months, and the S&P 500 as the candidate list (a past large company that was
 * never in it nor is large today, such as a 2021 listing that has since fallen
 * under $10B, is still missed).
 *
 * Duplicates: a past ticker is read as of its last day in the index, so its
 * bars follow the company through a rename (FB is META's history). A candidate
 * whose monthly bars match an earlier one's (same month, close and volume on at
 * least `DUPLICATE_MATCH_MONTHS` months) is that company again and is dropped.
 *
 * Gann chose his stocks from the ones trading at the time, by their record up
 * to then (*Wall Street Stock Selector* Ch. VII; *Truth of the Stock Tape*
 * Ch. XVI-XIX compare the groups as they stood in the year written), so a test
 * of his method reads each year's market as it stood.
 *
 * Mandate: (1) Gann: above. (2) Cycles: no periodicity claim; the yearly
 * reading is a schedule, not a cycle. (3) Cause and Effect: a trade's outcome
 * may not decide whether the stock was there to be traded; today's list let the
 * effect choose the cause. Law of Creation: the pair is the candidate list and
 * each year's cap; the list alone is a mixture, the cap read on it yields the
 * year's universe, which re-enters as the replay's symbols and the strength
 * rank's peers.
 */

import type { Bar } from "@/lib/types";
import { splitAdjustedSharesAsOf, type SharesPoint } from "@/lib/data/instrumentReference";
import { MARKET_CAP_FLOOR_USD } from "./config";
import sp500History from "./sp500History.json";

/** A share count filed longer ago than this before the reading is stale. */
export const SHARES_STALE_DAYS = 548;
/** Months of identical bars that make two candidates one company. */
export const DUPLICATE_MATCH_MONTHS = 3;

export type CapReason = "ok" | "no_shares" | "stale_shares" | "no_close";

export interface CapReading {
  capUsd: number | null;
  reason: CapReason;
  /** The day the cap was read; membership counts from it. */
  on: string;
}

export interface Sp500History {
  tickers: Record<string, [string, string | null][]>;
}

export interface Candidate {
  symbol: string;
  /** The date to read a departed ticker's bars as of; null for a current ticker. */
  asOf: string | null;
  /** From today's list, or only from the index's history. */
  source: "today" | "history";
}

export interface PointInTimeUniverse {
  years: number[];
  floorUsd: number;
  candidates: Candidate[];
  /** Symbol → the years it was a member. */
  members: Map<string, Set<number>>;
  /** Symbol → year → its cap reading. */
  readings: Map<string, Map<number, CapReading>>;
  /** A dropped candidate → the candidate it duplicates. */
  duplicates: Map<string, string>;
}

const DAY_MS = 86_400_000;

function dayBefore(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/**
 * Today's list first, in its order, then every ticker in the index on or after
 * `from` that today's list doesn't hold, the most recently departed first (so
 * a company's latest ticker is the one kept when duplicates are dropped).
 */
export function pointInTimeCandidates(
  today: readonly string[],
  from: string,
  history: Sp500History = sp500History as unknown as Sp500History,
): Candidate[] {
  const seen = new Set(today.map((s) => s.toUpperCase()));
  const out: Candidate[] = today.map((s) => ({ symbol: s.toUpperCase(), asOf: null, source: "today" }));
  const past: Candidate[] = [];
  for (const [ticker, spans] of Object.entries(history.tickers)) {
    const symbol = ticker.toUpperCase();
    if (seen.has(symbol)) continue;
    const overlapping = spans.filter(([, end]) => end === null || end >= from);
    if (overlapping.length === 0) continue;
    const open = overlapping.some(([, end]) => end === null);
    const lastEnd = overlapping.reduce((m, [, end]) => (end !== null && end > m ? end : m), "");
    past.push({ symbol, asOf: open ? null : dayBefore(lastEnd), source: "history" });
    seen.add(symbol);
  }
  past.sort((a, b) => {
    if (a.asOf !== b.asOf) return a.asOf === null ? -1 : b.asOf === null ? 1 : b.asOf.localeCompare(a.asOf);
    return a.symbol.localeCompare(b.symbol);
  });
  return [...out, ...past];
}

/** The latest filing date before `date`, or null. */
function latestFiledBefore(shares: SharesPoint[], date: string): string | null {
  let latest: string | null = null;
  for (const p of shares) if (p.filed < date && (latest === null || p.filed > latest)) latest = p.filed;
  return latest;
}

/**
 * The market cap on `date` (YYYY-MM-DD) from what was known before it: the
 * share count filed before the date, times the close of the last month that
 * ended before the date's month began.
 */
export function marketCapAt(shares: SharesPoint[] | undefined, monthly: readonly Bar[], date: string): CapReading {
  if (!shares || shares.length === 0) return { capUsd: null, reason: "no_shares", on: date };
  const filed = latestFiledBefore(shares, date);
  if (filed === null) return { capUsd: null, reason: "no_shares", on: date };
  if (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${filed}T00:00:00Z`) > SHARES_STALE_DAYS * DAY_MS) {
    return { capUsd: null, reason: "stale_shares", on: date };
  }
  const count = splitAdjustedSharesAsOf(shares, date);
  const month = date.slice(0, 7);
  let close: number | null = null;
  let closeMonth = "";
  for (const b of monthly) {
    const m = b.t.slice(0, 7);
    if (m < month && m > closeMonth && Number.isFinite(b.c) && b.c > 0) {
      close = b.c;
      closeMonth = m;
    }
  }
  if (close === null || count === null || !(count > 0)) return { capUsd: null, reason: count === null ? "no_shares" : "no_close", on: date };
  return { capUsd: count * close, reason: "ok", on: date };
}

/** A month's fingerprint: its month, close and volume. */
function monthKeys(monthly: readonly Bar[]): string[] {
  return monthly.filter((b) => b.v > 0).map((b) => `${b.t.slice(0, 7)}|${b.c}|${b.v}`);
}

/**
 * Candidates whose monthly bars repeat an earlier candidate's (same company
 * under another ticker), mapped to the one kept. Earlier in `order` wins.
 */
export function findDuplicateCompanies(order: readonly string[], monthly: ReadonlyMap<string, readonly Bar[]>): Map<string, string> {
  const owner = new Map<string, string>();
  const duplicates = new Map<string, string>();
  for (const symbol of order) {
    const keys = monthKeys(monthly.get(symbol) ?? []);
    const hits = new Map<string, number>();
    for (const k of keys) {
      const o = owner.get(k);
      if (o !== undefined) hits.set(o, (hits.get(o) ?? 0) + 1);
    }
    let match: string | null = null;
    for (const [o, n] of hits) if (n >= DUPLICATE_MATCH_MONTHS && (match === null || n > (hits.get(match) ?? 0))) match = o;
    if (match !== null) {
      duplicates.set(symbol, match);
      continue;
    }
    for (const k of keys) if (!owner.has(k)) owner.set(k, symbol);
  }
  return duplicates;
}

/** Every calendar year from `from`'s year to `to`'s, inclusive. */
export function yearsBetween(from: string, to: string): number[] {
  const out: number[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) out.push(y);
  return out;
}

/**
 * The year's cap reading: on 1 January, or, when no bar closed before then
 * (the vendor's free feed starts in mid-2020, and a listing may start mid-year),
 * on the first of the month after the year's first bar. Nothing earlier in the
 * year is read for that symbol, and membership counts only from the day read
 * (`CapReading.on`), so no session before it is judged on a later close.
 */
function yearReading(shares: SharesPoint[] | undefined, bars: readonly Bar[], year: number): CapReading {
  const reading = marketCapAt(shares, bars, `${year}-01-01`);
  if (reading.reason !== "no_close") return reading;
  const first = bars.find((b) => b.t.slice(0, 4) === String(year) && Number.isFinite(b.c) && b.c > 0);
  if (!first) return reading;
  const y = Number(first.t.slice(0, 4));
  const m = Number(first.t.slice(5, 7));
  if (m === 12) return reading;
  return marketCapAt(shares, bars, `${y}-${String(m + 1).padStart(2, "0")}-01`);
}

/** Each year's members from the candidates' monthly bars and share counts. */
export function buildPointInTimeUniverse(input: {
  candidates: Candidate[];
  years: number[];
  monthly: ReadonlyMap<string, readonly Bar[]>;
  shares: ReadonlyMap<string, SharesPoint[]>;
  floorUsd?: number;
}): PointInTimeUniverse {
  const floorUsd = input.floorUsd ?? MARKET_CAP_FLOOR_USD;
  const duplicates = findDuplicateCompanies(
    input.candidates.map((c) => c.symbol),
    input.monthly,
  );
  const members = new Map<string, Set<number>>();
  const readings = new Map<string, Map<number, CapReading>>();
  for (const { symbol } of input.candidates) {
    if (duplicates.has(symbol)) continue;
    const bars = input.monthly.get(symbol) ?? [];
    const byYear = new Map<number, CapReading>();
    const years = new Set<number>();
    for (const year of input.years) {
      const reading = yearReading(input.shares.get(symbol), bars, year);
      byYear.set(year, reading);
      if (reading.capUsd !== null && reading.capUsd >= floorUsd) years.add(year);
    }
    readings.set(symbol, byYear);
    if (years.size > 0) members.set(symbol, years);
  }
  return { years: input.years, floorUsd, candidates: input.candidates, members, readings, duplicates };
}

/** Whether `symbol` was a member on `date` (YYYY-MM-DD or an ISO timestamp). */
export function isPointInTimeMember(universe: PointInTimeUniverse, symbol: string, date: string): boolean {
  const key = symbol.toUpperCase();
  const year = Number(date.slice(0, 4));
  if (!(universe.members.get(key)?.has(year) ?? false)) return false;
  const on = universe.readings.get(key)?.get(year)?.on;
  return on === undefined || date.slice(0, 10) >= on;
}

/** Members per year, and why the rest were left out, for a run's log. */
export function describePointInTimeUniverse(universe: PointInTimeUniverse): string[] {
  const lines: string[] = [];
  const fromHistory = new Set(universe.candidates.filter((c) => c.source === "history").map((c) => c.symbol));
  for (const year of universe.years) {
    const counts: Record<CapReason | "below_floor", number> = { ok: 0, no_shares: 0, stale_shares: 0, no_close: 0, below_floor: 0 };
    let members = 0;
    let departed = 0;
    for (const [symbol, byYear] of universe.readings) {
      const r = byYear.get(year);
      if (!r) continue;
      if (r.capUsd !== null && r.capUsd >= universe.floorUsd) {
        members++;
        if (fromHistory.has(symbol)) departed++;
      } else if (r.capUsd !== null) counts.below_floor++;
      else counts[r.reason]++;
    }
    lines.push(
      `${year}: ${members} members (${departed} not on today's list); left out: ${counts.below_floor} under the floor, ` +
        `${counts.no_shares} no share count, ${counts.stale_shares} stale share count, ${counts.no_close} no close`,
    );
  }
  lines.push(`${universe.duplicates.size} candidates dropped as another ticker of a company already read.`);
  return lines;
}
