/**
 * The planetary batch on today's market: do the aspect rules
 * (`aspectTiming.ts`) and the event kinds (`celestialEvents.ts`) time SPY's
 * and DIA's turns from 2016 to 2025? Research only: nothing on the verdict
 * path imports this module, and nothing here reaches a member.
 *
 * The owner asked (2026-10-30) that the rules be checked on recent markets,
 * not only on 1913-1948. Fixed before scoring:
 * - Data: Alpaca daily bars, split-adjusted, SIP, from 2016-01-04 (the
 *   feed's start) (`modernTurns.json`, from `scripts/build-modern-turns.mjs`).
 * - Turns: the 3-Day Chart's tops and bottoms, and major turns (the extreme
 *   of 21 sessions each side). See the build script's header.
 * - Years: 2016-2025, the whole years held. 2026 is left out: a part year
 *   would let shifted days fall in months with no turns yet, which flatters
 *   the observed count.
 * - Rules, tolerances and null exactly as in the two modules. 15 rules on 4
 *   outcome sets (SPY and DIA, 3-day and major): 60 tests, so a result needs
 *   p below 0.05 / 60 ≈ 0.00083.
 *
 * Three-question basis: as in `aspectTiming.ts` and `celestialEvents.ts`; the
 * modern years are the out-of-sample persistence check Dewey's list asks for.
 */
import { ASPECT_RULES, aspectDays, type AspectRule } from "@/lib/research/aspectTiming";
import { CELESTIAL_RULES, celestialDays, type CelestialRule } from "@/lib/research/celestialEvents";
import { scoreYearDays, yearTargets, type PooledDayScore } from "@/lib/research/forecastRebuild";
import type { Turn } from "@/lib/research/forecastTrackRecord";
import turnsJson from "@/lib/research/modernTurns.json";

export const MODERN_YEARS = Array.from({ length: 10 }, (_, i) => 2016 + i);
export const MODERN_SYMBOLS = ["SPY", "DIA"] as const;
export const MODERN_SETS = ["three", "major"] as const;
export type ModernRule = AspectRule | CelestialRule;
export const MODERN_RULES: readonly ModernRule[] = [...ASPECT_RULES, ...CELESTIAL_RULES];
export const MODERN_TESTS = MODERN_RULES.length * MODERN_SYMBOLS.length * MODERN_SETS.length;

type Symbol = (typeof MODERN_SYMBOLS)[number];
type TurnSetName = (typeof MODERN_SETS)[number];

const TURNS = (turnsJson as unknown as { symbols: Record<Symbol, Record<TurnSetName, Turn[]>> }).symbols;

const isAspect = (r: ModernRule): r is AspectRule => (ASPECT_RULES as readonly string[]).includes(r);
const daysFor = (r: ModernRule, year: number) => (isAspect(r) ? aspectDays(r, year) : celestialDays(r as CelestialRule, year));

export interface ModernResult {
  rule: ModernRule;
  symbol: Symbol;
  set: TurnSetName;
  score: PooledDayScore["turns"];
}

export function modernScore(rule: ModernRule, symbol: Symbol, set: TurnSetName, seed = 20261030): ModernResult {
  const s = scoreYearDays(
    MODERN_YEARS.map((y) => ({ id: String(y), days: daysFor(rule, y), targets: yearTargets(y, [], TURNS[symbol][set]) })),
    seed,
  );
  return { rule, symbol, set, score: s.turns };
}

export function modernAll(): ModernResult[] {
  const out: ModernResult[] = [];
  for (const rule of MODERN_RULES) for (const symbol of MODERN_SYMBOLS) for (const set of MODERN_SETS) out.push(modernScore(rule, symbol, set));
  return out;
}
