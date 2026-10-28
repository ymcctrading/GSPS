/**
 * Turning a person's picks (industries, the curated lists saved searches still
 * name, and typed symbols) into the symbols a scan or a test runs on. Pure and
 * free of the classification data, so client pages can read it: the tree comes
 * from `/api/industries` (`lib/universe/industries.ts#industryTree`).
 */

import { instrumentSpec } from "@/lib/instruments/spec";

/**
 * Futures and forex have quotes but no bars on the free feed
 * (`lib/instruments/spec.ts`, availability "quotes_only"), so nothing can scan
 * or test them yet: the pickers leave them out and the routes refuse them.
 */
export function isQuotesOnly(symbol: string): boolean {
  return instrumentSpec(symbol).availability === "quotes_only";
}

/** The refusal both routes give, naming the symbols. */
export function quotesOnlyRefusal(symbols: string[]): string | null {
  const bad = symbols.filter(isQuotesOnly);
  if (bad.length === 0) return null;
  return `${bad.join(", ")} can't be scanned or tested yet: futures and forex have live quotes but no price history on the current data feed.`;
}

/** `/api/batch-scan` scans at most this many symbols a request. */
export const SCAN_CHUNK_SIZE = 25;
/**
 * A manual scan runs at most this many requests (250 symbols, the market
 * scan's own `FULL_UNIVERSE_TOP`); the daily lists already read the whole
 * universe. An engineering bound on the data feed, not a rule.
 */
export const MAX_SCAN_REQUESTS = 10;
/**
 * `/api/backtest` replays at most this many symbols a run: a run holds the
 * request open the whole time, and past this it outlives the function timeout.
 */
export const MAX_TEST_SYMBOLS = 12;

export interface PickerIndustry {
  key: string;
  label: string;
  symbols: string[];
}

export interface PickerSector {
  key: string;
  label: string;
  industries: PickerIndustry[];
}

/** A quick pick that is not an industry (the Magnificent 7, and saved searches' older lists). */
export interface PickerList {
  key: string;
  label: string;
  symbols: string[];
}

/** "spy, aapl  btc/usd" -> ["SPY", "AAPL", "BTC/USD"], deduplicated in order. */
export function parseSymbols(text: string): string[] {
  return [...new Set(text.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))];
}

function lookup(tree: PickerSector[], lists: PickerList[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const l of lists) out.set(l.key, l.symbols);
  for (const s of tree) for (const i of s.industries) out.set(i.key, i.symbols);
  return out;
}

/** Each picked key's symbols, in pick order; unknown keys are skipped. */
export function pickedGroups(keys: string[], tree: PickerSector[], lists: PickerList[] = []): string[][] {
  const map = lookup(tree, lists);
  return keys.map((k) => map.get(k)).filter((g): g is string[] => !!g);
}

/** Every symbol a scan runs on: typed symbols first, then each pick's, deduplicated. */
export function resolveSelection(
  keys: string[],
  custom: string,
  tree: PickerSector[],
  lists: PickerList[] = [],
): string[] {
  const out = new Set(parseSymbols(custom));
  for (const g of pickedGroups(keys, tree, lists)) for (const s of g) out.add(s);
  return [...out];
}

/**
 * At most `max` symbols for a test: typed symbols first, then the picked
 * groups taken in turn, largest company first in each, so every picked
 * industry is represented before any gives a second name. Returns the chosen
 * symbols and how many were left out.
 */
export function capSelection(
  keys: string[],
  custom: string,
  tree: PickerSector[],
  max: number,
  lists: PickerList[] = [],
): { symbols: string[]; total: number } {
  const all = resolveSelection(keys, custom, tree, lists);
  const chosen = new Set<string>();
  for (const s of parseSymbols(custom)) if (chosen.size < max) chosen.add(s);
  const groups = pickedGroups(keys, tree, lists);
  for (let depth = 0; chosen.size < max; depth++) {
    let any = false;
    for (const g of groups) {
      if (depth >= g.length) continue;
      any = true;
      if (chosen.size < max) chosen.add(g[depth]);
    }
    if (!any) break;
  }
  return { symbols: [...chosen], total: all.length };
}

/** Split a list into requests of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
