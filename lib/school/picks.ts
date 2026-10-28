/**
 * The learner's own charts (owner, 2026-10-28): when a member first starts the
 * School, at any tier, they pick at least three markets, at least one of them a
 * US stock, and every lesson that needs an example draws it live from those
 * markets (`./examples.ts`). They can change their picks, but keeping them is
 * encouraged, so each lesson builds on the charts they already know.
 *
 * Stored under `settings.prefs.schoolPicks`, beside the member's other
 * preferences, so no table or migration is needed. `prefs` is shared, so a
 * write merges into the prefs it read (see `/api/school/picks`).
 *
 * Futures and forex can be picked, but the data GSPS holds has quotes only for
 * them, no chart bars, so they supply no examples until bars exist; the picker
 * says so. Options are not a market to follow and are refused.
 *
 * Three-question basis: 1. Method: keeping up the charts of a few chosen
 * markets and studying their own past moves is the house method's habit; the
 * learner sees only plain advice ("watching the same charts lets each lesson
 * build on the last"). 2. Cycles: no periodicity claim. 3. Hermetic:
 * Correspondence, each lesson's idea found again on the learner's own chart.
 * Law of Creation: learner ⊗ their chart, a lesson drawn from a market they
 * chose, which neither the curriculum nor the chart held alone.
 */

import { z } from "zod";
import { instrumentKindOf, type InstrumentKind } from "@/lib/instruments/spec";

export const SCHOOL_PICKS_MIN = 3;
export const SCHOOL_PICKS_MAX = 9;

export type PickKind = Exclude<InstrumentKind, "option">;

export interface SchoolPick {
  symbol: string;
  kind: PickKind;
}

export interface SchoolPicks {
  symbols: SchoolPick[];
  /** When the current set was saved (ISO). */
  savedAt: string;
  /** When the first set was saved (ISO); kept across changes. */
  firstSavedAt: string;
  /** How many times the set has been changed after the first save. */
  changes: number;
}

const StoredSchema = z.object({
  symbols: z.array(z.object({ symbol: z.string(), kind: z.enum(["us_equity", "crypto", "future", "forex"]) })),
  savedAt: z.string(),
  firstSavedAt: z.string(),
  changes: z.number().int().min(0),
});

/** The member's saved picks, or null when there are none (or the stored value is unreadable). */
export function readSchoolPicks(prefs: Record<string, unknown> | null | undefined): SchoolPicks | null {
  const parsed = StoredSchema.safeParse(prefs?.schoolPicks);
  if (!parsed.success) return null;
  const v = parsed.data;
  if (v.symbols.length < SCHOOL_PICKS_MIN || !v.symbols.some((s) => s.kind === "us_equity")) return null;
  return v;
}

const EQUITY_FORMAT = /^[A-Z]{1,5}([.-][A-Z]{1,2})?$/;
const CRYPTO_FORMAT = /^[A-Z0-9]{2,10}\/(USD|USDT|USDC)$/;

/** Which kind a typed symbol names, or null when it isn't one the School can follow. */
export function pickKindOf(raw: string): PickKind | null {
  const symbol = raw.trim().toUpperCase();
  if (!symbol) return null;
  const kind = instrumentKindOf(symbol);
  if (kind === "option") return null;
  if (kind === "future" || kind === "forex") return kind;
  if (kind === "crypto") return CRYPTO_FORMAT.test(symbol) ? "crypto" : null;
  return EQUITY_FORMAT.test(symbol) ? "us_equity" : null;
}

export type NormalizedPicks = { ok: true; symbols: SchoolPick[] } | { ok: false; error: string };

/** Clean a submitted list: upper-cased, de-duplicated in order, 3 to 9 markets, at least one US stock. */
export function normalizeSchoolPicks(input: unknown): NormalizedPicks {
  if (!Array.isArray(input)) return { ok: false, error: "Send a list of symbols." };
  const seen = new Set<string>();
  const symbols: SchoolPick[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") return { ok: false, error: "Every symbol has to be text." };
    const symbol = raw.trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    const kind = pickKindOf(symbol);
    if (!kind) {
      return {
        ok: false,
        error: `"${symbol}" isn't a market the School can follow. Use a stock like AAPL, a crypto pair like BTC/USD, a currency pair like EUR/USD or a future like /ES.`,
      };
    }
    seen.add(symbol);
    symbols.push({ symbol, kind });
  }
  if (symbols.length < SCHOOL_PICKS_MIN) return { ok: false, error: `Pick at least ${SCHOOL_PICKS_MIN} markets.` };
  if (symbols.length > SCHOOL_PICKS_MAX) return { ok: false, error: `Pick ${SCHOOL_PICKS_MAX} markets or fewer.` };
  if (!symbols.some((s) => s.kind === "us_equity")) return { ok: false, error: "Include at least one US stock." };
  return { ok: true, symbols };
}

/** The prefs to store after saving `symbols`; every other key is kept. */
export function applySchoolPicks(
  prefs: Record<string, unknown>,
  symbols: SchoolPick[],
  now: Date = new Date(),
): { prefs: Record<string, unknown>; picks: SchoolPicks } {
  const before = readSchoolPicks(prefs);
  const same =
    before !== null &&
    before.symbols.length === symbols.length &&
    before.symbols.every((s, i) => s.symbol === symbols[i].symbol);
  const iso = now.toISOString();
  const picks: SchoolPicks = {
    symbols,
    savedAt: same ? before.savedAt : iso,
    firstSavedAt: before?.firstSavedAt ?? iso,
    changes: before === null ? 0 : before.changes + (same ? 0 : 1),
  };
  return { prefs: { ...prefs, schoolPicks: picks }, picks };
}

/** Markets the School can draw examples from today (those with chart bars). */
export function chartablePicks(picks: SchoolPicks): SchoolPick[] {
  return picks.symbols.filter((s) => s.kind === "us_equity" || s.kind === "crypto");
}

export const KEEP_PICKS_NOTE =
  "You can change these any time. Keeping the same charts from the first lesson to the last lets each lesson build on what you've already seen.";
