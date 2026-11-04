/**
 * The public "WD Gann Master Time Factor Calculator" (codingace.net,
 * owner's link of 2026-10-30), reverse engineered and scored. Research only:
 * nothing on the verdict path imports this module, and nothing here reaches
 * a member.
 *
 * What the page computes. The page carries no calculation script: its form
 * posts to the server, which answers with a six-row table. Twelve probes on
 * 2026-10-30 (varying every input, every option and both checkboxes) fit one
 * rule exactly, row for row:
 * - date_k  = base date + round(k * cycle * factor) calendar days, k = 1..6
 *   (weekends are not skipped; half days round up);
 * - angle_k = 90 * k mod 360, a label that never feeds the date or price;
 * - price_k = price * factor^(k / 4).
 * The market type, the "Square of 9 / 144 / 360" choice, the planet choice
 * and the "harmonic octave" and "auto-square" boxes change nothing. The
 * defaults are cycle 30 and factor 1.618 (the golden ratio). It is therefore
 * a fixed-interval count from one pivot, stretched by a multiplier; none of
 * the author's own time rules is in it, and his master time factor was never
 * published (`docs/agents/11-every-gann-method-acts.md`, undisclosed methods).
 *
 * Fixed before any outcome was scored (2026-10-30):
 * - Two settings: the page's defaults (`siteDefault`, 30 days x 1.618) and the
 *   plain count the page reduces to with a factor of 1 (`plainCycle`, 30 days).
 *   No search over cycle or factor.
 * - Anchors are the same swings as the outcome set, and a pivot projects only
 *   once it is known: for the published calls, swings dated before the issue
 *   date whose following swing had also printed by then; for the turn sets,
 *   from the date of the next swing (a swing is confirmed before the
 *   following one prints, so this is never early); for SPY, from the close
 *   that confirmed the reversal. Each projected date
 *   counts with ±2 days (`SEASONAL_TOLERANCE_DAYS`, the rebuild test's).
 * - Five outcome sets per setting, so 10 tests, 20 with the `lastPivot`
 *   anchor mode added after the first run (Bonferroni 0.05 / 20 = 0.0025):
 *   the 52 published calls in their forecast years; the Dow's 9-point and
 *   3-day turns 1913-1948 (`aspectTiming.ts`'s years); SPY's 2% and 5%
 *   close-only swings, 2017-2026 (`pivotDayCounts.ts#closeOnlyPivots`).
 * - Null: each year's marked days shifted round the year by every offset,
 *   pooled by one random shift per year (`forecastRebuild.ts#scoreYearDays`).
 *
 * Three-question basis:
 * 1. Source: none. The page cites no book; the fixed count from a pivot is
 *    the general idea of the author's day counts, and the 1.618 multiplier is
 *    Fibonacci's, not his. Tested as a claim, never carried as his rule.
 * 2. Cycles: a periodicity claim (every 30 or 48.5 days). Dewey's first test
 *    is the base rate, which the circular shift supplies; it clears nothing
 *    until it beats that.
 * 3. Hermetic: Rhythm, held as the claim under test, never as evidence.
 */
import { SEASONAL_TOLERANCE_DAYS } from "@/lib/gann/seasonalCounts";
import { NINE_POINT_YEARS, THREE_DAY_YEARS } from "@/lib/research/aspectTiming";
import { DOW_SWINGS, type Turn, type TurnSet } from "@/lib/research/forecastTrackRecord";
import { scoreYearDays, yearTargets, type PooledDayScore } from "@/lib/research/forecastRebuild";
import { closeOnlyPivots } from "@/lib/research/pivotDayCounts";
import { PUBLISHED_FORECASTS } from "@/lib/research/publishedForecasts";

export const CALCULATOR_STEPS = 6;
export const CALCULATOR_TOLERANCE = SEASONAL_TOLERANCE_DAYS;
export const CALCULATOR_CONFIGS = [
  { id: "siteDefault", cycle: 30, factor: 1.618 },
  { id: "plainCycle", cycle: 30, factor: 1 },
] as const;
export type CalculatorConfig = (typeof CALCULATOR_CONFIGS)[number];
export const SPY_SWINGS = [0.02, 0.05] as const;
export const SPY_YEARS = Array.from({ length: 10 }, (_, i) => 2017 + i);


const DAY = 86_400_000;
const dayOf = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);
const iso = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const dayUTC = (y: number, m0: number, d: number) => Math.floor(Date.UTC(y, m0, d) / DAY);

export interface CalculatorRow {
  step: number;
  date: string;
  angle: number;
  price: number;
}

/** The page's table, row for row. */
export function calculatorRows(baseDate: string, cycle: number, factor: number, price: number): CalculatorRow[] {
  const base = dayOf(baseDate);
  return Array.from({ length: CALCULATOR_STEPS }, (_, i) => {
    const k = i + 1;
    return {
      step: k * cycle,
      date: iso(base + Math.round(k * cycle * factor)),
      angle: (90 * k) % 360,
      price: Math.round(price * factor ** (k / 4) * 100) / 100,
    };
  });
}

/** A pivot and the first day its projections may be used. */
export interface Anchor {
  day: number;
  knownFrom: number;
}

/**
 * How the anchors are used. `everyPivot` projects from every known swing
 * (fixed first). `lastPivot` uses the page as a person would, from the latest
 * known swing only, rebasing when the next one is confirmed: added after the
 * first run showed `everyPivot` marking half to nearly all of each year on
 * the turn sets, too much for any count to separate from chance.
 */
export const ANCHOR_MODES = ["everyPivot", "lastPivot"] as const;
export type AnchorMode = (typeof ANCHOR_MODES)[number];
/** Two settings x two anchor modes x five outcome sets. */
export const CALCULATOR_TESTS = CALCULATOR_CONFIGS.length * ANCHOR_MODES.length * 5;

/** Days of `year` (offsets from 1 January) the calculator marks from the anchors, each projection usable only after its anchor is known. */
export function calculatorDays(config: CalculatorConfig, anchors: readonly Anchor[], year: number, mode: AnchorMode = "everyPivot"): number[] {
  const start = dayUTC(year, 0, 1);
  const len = dayUTC(year + 1, 0, 1) - start;
  const out = new Set<number>();
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    // Under lastPivot a projection lapses once the next swing is confirmed.
    const until = mode === "lastPivot" && i + 1 < anchors.length ? anchors[i + 1].knownFrom : Infinity;
    for (let k = 1; k <= CALCULATOR_STEPS; k++) {
      const p = a.day + Math.round(k * config.cycle * config.factor);
      if (p <= a.knownFrom || p > until) continue;
      for (let d = p - CALCULATOR_TOLERANCE; d <= p + CALCULATOR_TOLERANCE; d++) if (d >= start && d < start + len) out.add(d - start);
    }
  }
  return [...out].sort((x, y) => x - y);
}

/** Each swing, usable from the date of the swing after it (by then the swing had been confirmed). */
export function swingAnchors(turns: readonly Turn[]): Anchor[] {
  return turns.slice(0, -1).map((t, i) => ({ day: dayOf(t.date), knownFrom: dayOf(turns[i + 1].date) }));
}

export interface DailyClose {
  date: string;
  close: number;
}

/** Close-only swings of `minSwing`, each with the close that confirmed it. */
export function closeSwings(bars: readonly DailyClose[], minSwing: number): { turns: Turn[]; anchors: Anchor[] } {
  const closes = bars.map((b) => b.close);
  const turns: Turn[] = [];
  const anchors: Anchor[] = [];
  for (const i of closeOnlyPivots(closes, minSwing)) {
    const c = closes[i];
    const kind: Turn["kind"] = closes.slice(i + 1).find((x) => x !== c)! > c ? "low" : "high";
    let j = i + 1;
    while (j < closes.length && (kind === "high" ? closes[j] > c * (1 - minSwing) : closes[j] < c * (1 + minSwing))) j++;
    if (j >= closes.length) continue;
    turns.push({ date: bars[i].date, price: c, kind });
    anchors.push({ day: dayOf(bars[i].date), knownFrom: dayOf(bars[j].date) });
  }
  return { turns, anchors };
}

export interface CalculatorResult {
  config: CalculatorConfig["id"];
  mode: AnchorMode;
  coverage: Record<string, number>;
  calls: PooledDayScore["calls"];
  nine: PooledDayScore["turns"];
  three: PooledDayScore["turns"];
  spy?: Record<string, PooledDayScore["turns"]>;
}

const meanCoverage = (s: PooledDayScore) => s.years.reduce((a, y) => a + y.coverage, 0) / s.years.length;

function turnScore(config: CalculatorConfig, mode: AnchorMode, turns: readonly Turn[], anchors: readonly Anchor[], years: readonly number[], seed: number): PooledDayScore {
  return scoreYearDays(
    years.map((y) => ({ id: String(y), days: calculatorDays(config, anchors, y, mode), targets: yearTargets(y, [], [...turns]) })),
    seed,
  );
}

export function scoreCalculator(config: CalculatorConfig, mode: AnchorMode, spyBars?: readonly DailyClose[], seed = 20261030): CalculatorResult {
  const calls = scoreYearDays(
    PUBLISHED_FORECASTS.map((f) => {
      const year = Number(f.id);
      const issued = dayOf(f.issued);
      // A swing is known on the issue date only if the swing after it had printed by then; lastPivot keeps the latest one.
      const known = swingAnchors(DOW_SWINGS.nine)
        .filter((a) => a.knownFrom <= issued)
        .map((a) => ({ day: a.day, knownFrom: issued }));
      const anchors = mode === "lastPivot" ? known.slice(-1) : known;
      return { id: f.id, days: calculatorDays(config, anchors, year), targets: yearTargets(year, f.windows, DOW_SWINGS.nine) };
    }),
    seed,
  );
  const dow = (set: TurnSet, years: readonly number[]) => turnScore(config, mode, DOW_SWINGS[set], swingAnchors(DOW_SWINGS[set]), years, seed);
  const nine = dow("nine", NINE_POINT_YEARS);
  const three = dow("three", THREE_DAY_YEARS);
  const coverage: Record<string, number> = { calls: meanCoverage(calls), nine: meanCoverage(nine), three: meanCoverage(three) };
  const result: CalculatorResult = { config: config.id, mode, coverage, calls: calls.calls, nine: nine.turns, three: three.turns };
  if (spyBars?.length) {
    result.spy = {};
    for (const m of SPY_SWINGS) {
      const { turns, anchors } = closeSwings(spyBars, m);
      const s = turnScore(config, mode, turns, anchors, SPY_YEARS, seed);
      coverage[`spy${m * 100}`] = meanCoverage(s);
      result.spy[`${m * 100}%`] = s.turns;
    }
  }
  return result;
}

export function scoreCalculatorAll(spyBars?: readonly DailyClose[]): CalculatorResult[] {
  return ANCHOR_MODES.flatMap((m) => CALCULATOR_CONFIGS.map((c) => scoreCalculator(c, m, spyBars)));
}
