/**
 * Do the timing rules work in combination when none works alone? Research
 * only: nothing on the verdict path imports this module, and nothing here
 * reaches a member.
 *
 * The owner (2026-10-30): "the planetary rules may not hold up individually
 * ... determine if there is a combination of rules that must align, coupled
 * with a time of year or square of 9 ... there is a chance combining criteria
 * would lead to the results Gann obtained."
 *
 * With 17 features there are hundreds of pairs and triples, and on one record
 * some will look strong by chance alone. So the combinations are chosen on
 * one span and scored only on others, fixed before any span was scored:
 * - Features (day sets per calendar year, each with its own tolerance): the
 *   aspect rules (`aspectTiming.ts`: innerPairs, outerPairs, slowPairs), the
 *   event kinds (`celestialEvents.ts`: lunations, lunarApsides,
 *   moonDeclination, ingresses, stations, declination, latitude), the time of
 *   year (`seasonalCounts.ts#SEASONAL_POINTS` ±2 days), and two counts from
 *   the market's own turns: the Square of Nine in days (cardinal and fixed
 *   lines, `squareOfNineTime.ts`, ±1 day) and the wheel day counts
 *   (`timeCycles.ts#WHEEL_COUNTS`, ±2 days), each from the last 12 turns
 *   dated at least 10 days earlier (a swing is known only once price has
 *   moved away from it; the 10 days are an engineering choice); and the four
 *   rules from Walker's *Super Timing* (`superTiming.ts`: figure,
 *   figureMoon, jupiterIngress, jupiterReturn), added before this test was
 *   first reported, since the book's own formula is a combination.
 * - Combinations: every pair and triple of features, a day marked when all
 *   members mark it; and "at least k of the 17" for k = 2 to 6.
 * - Choose: on the Dow's 9-point turns 1913-1930 (leaving out 1914 and
 *   1921-1922, as in `aspectTiming.ts`), the three combinations with the
 *   lowest p, among those marking at least 3% of days (a rule that marks a
 *   handful of days can't be scored).
 * - Score: the three chosen, unchanged, on the Dow 1931-1948 (9-point and
 *   3-day turns) and on SPY and DIA 2016-2025 (3-Day Chart and major turns):
 *   6 outcome sets × 3 = 18 tests, cut-off 0.05 / 18 ≈ 0.0028. The 52
 *   published calls (1919-1932) overlap the choosing span, so they are
 *   reported but not counted.
 * - Null: as everywhere in the batch (`forecastRebuild.ts#scoreYearDays`).
 *   For the two turn-count features the circular shift moves the days away
 *   from the turns they count from, which favours finding something, so a
 *   pass there would be checked again before being believed.
 *
 * Three-question basis:
 * 1. Source: the author combines time and price ("when time and price
 *    balance") and his time factors; the planetary features are the claims
 *    tested in this batch.
 * 2. Cycles: Dewey's out-of-sample persistence, the item every single rule
 *    here failed, is the test itself.
 * 3. Hermetic: Correspondence, several measures meeting at one date, held as
 *    the claim under test.
 */
import { aspectDays } from "@/lib/research/aspectTiming";
import { celestialDays, type CelestialRule } from "@/lib/research/celestialEvents";
import { scoreYearDays, yearTargets, type PooledDayScore } from "@/lib/research/forecastRebuild";
import { DOW_SWINGS, type Turn } from "@/lib/research/forecastTrackRecord";
import { PUBLISHED_FORECASTS } from "@/lib/research/publishedForecasts";
import { SEASONAL_POINTS, SEASONAL_TOLERANCE_DAYS } from "@/lib/gann/seasonalCounts";
import { CARDINAL_CROSS, FIXED_CROSS, numbersOnLine } from "@/lib/gann/squareOfNineTime";
import { WHEEL_COUNTS } from "@/lib/gann/timeCycles";
import { SUPER_TIMING_RULES, superTimingDays, type SuperTimingRule } from "@/lib/research/superTiming";
import turnsJson from "@/lib/research/modernTurns.json";

export const FEATURES = [
  "innerPairs",
  "outerPairs",
  "slowPairs",
  "lunations",
  "lunarApsides",
  "moonDeclination",
  "ingresses",
  "stations",
  "declination",
  "latitude",
  "timeOfYear",
  "squareOfNine",
  "wheel",
  "figure",
  "figureMoon",
  "jupiterIngress",
  "jupiterReturn",
] as const;
export type Feature = (typeof FEATURES)[number];

/** A record: whose turns are scored, and whose turns the count features count from. */
export type RecordName = "dowNine" | "dowThree" | "spyThree" | "spyMajor" | "diaThree" | "diaMajor";

const MODERN = (turnsJson as unknown as { symbols: Record<"SPY" | "DIA", Record<"three" | "major", Turn[]>> }).symbols;
const RECORDS: Record<RecordName, { turns: Turn[]; anchors: Turn[] }> = {
  dowNine: { turns: DOW_SWINGS.nine, anchors: DOW_SWINGS.nine },
  dowThree: { turns: DOW_SWINGS.three, anchors: DOW_SWINGS.nine },
  spyThree: { turns: MODERN.SPY.three, anchors: MODERN.SPY.three },
  spyMajor: { turns: MODERN.SPY.major, anchors: MODERN.SPY.three },
  diaThree: { turns: MODERN.DIA.three, anchors: MODERN.DIA.three },
  diaMajor: { turns: MODERN.DIA.major, anchors: MODERN.DIA.three },
};

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const CHOOSE_YEARS = [1913, ...range(1915, 1920), ...range(1923, 1930)];
export const DOW_TEST_YEARS = [...range(1931, 1941), ...range(1944, 1948)];
export const DOW_TEST_YEARS_THREE = range(1931, 1948);
export const MODERN_YEARS = range(2016, 2025);
export const ANCHOR_LAG_DAYS = 10;
const RECENT_ANCHORS = 12;
export const MIN_COVERAGE = 0.03;
export const PICKS = 3;

const DAY = 86_400_000;
const dayNo = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);

const SQ9 = [...new Set([...CARDINAL_CROSS, ...FIXED_CROSS].flatMap((a) => numbersOnLine(a, 800)).filter((n) => n >= 10))];

const featureCache = new Map<string, Set<number>>();
/** The days (offsets from 1 January) a feature marks in `year`, for the record whose turns the counts start from. */
export function featureDays(f: Feature, year: number, record: RecordName): Set<number> {
  const counted = f === "squareOfNine" || f === "wheel" || f === "jupiterReturn";
  const key = `${f}:${year}:${counted ? record : ""}`;
  const hit = featureCache.get(key);
  if (hit) return hit;
  const start = Math.floor(Date.UTC(year, 0, 1) / DAY);
  const len = Math.floor(Date.UTC(year + 1, 0, 1) / DAY) - start;
  const out = new Set<number>();
  const mark = (d: number, tol: number) => {
    for (let x = d - tol; x <= d + tol; x++) if (x >= start && x < start + len) out.add(x - start);
  };
  if (f === "innerPairs" || f === "outerPairs" || f === "slowPairs") aspectDays(f, year).forEach((d) => out.add(d));
  else if ((SUPER_TIMING_RULES as readonly string[]).includes(f))
    superTimingDays(f as SuperTimingRule, year, RECORDS[record].anchors).forEach((d) => out.add(d));
  else if (f === "timeOfYear") for (const p of SEASONAL_POINTS) mark(Math.floor(Date.UTC(year, p.month - 1, p.day) / DAY), SEASONAL_TOLERANCE_DAYS);
  else if (counted) {
    // For each day, count from the last 12 turns dated at least ANCHOR_LAG_DAYS before it.
    const anchors = RECORDS[record].anchors.map((a) => dayNo(a.date));
    const counts = f === "squareOfNine" ? SQ9 : WHEEL_COUNTS;
    const tol = f === "squareOfNine" ? 1 : 2;
    for (let d = start; d < start + len; d++) {
      const known = anchors.filter((a) => a <= d - ANCHOR_LAG_DAYS).slice(-RECENT_ANCHORS);
      if (known.some((a) => counts.some((n) => Math.abs(d - a - n) <= tol))) out.add(d - start);
    }
  } else celestialDays(f as CelestialRule, year).forEach((d) => out.add(d));
  featureCache.set(key, out);
  return out;
}

export type Combination = { kind: "all"; features: Feature[] } | { kind: "atLeast"; k: number };

export const comboLabel = (c: Combination) => (c.kind === "all" ? c.features.join(" + ") : `at least ${c.k} of ${FEATURES.length}`);

export function comboDays(c: Combination, year: number, record: RecordName): number[] {
  const len = Math.floor(Date.UTC(year + 1, 0, 1) / DAY) - Math.floor(Date.UTC(year, 0, 1) / DAY);
  const out: number[] = [];
  if (c.kind === "all") {
    const sets = c.features.map((f) => featureDays(f, year, record));
    for (let d = 0; d < len; d++) if (sets.every((s) => s.has(d))) out.push(d);
  } else {
    const sets = FEATURES.map((f) => featureDays(f, year, record));
    for (let d = 0; d < len; d++) if (sets.filter((s) => s.has(d)).length >= c.k) out.push(d);
  }
  return out;
}

export function allCombinations(): Combination[] {
  const out: Combination[] = [];
  const F = FEATURES;
  for (let i = 0; i < F.length; i++)
    for (let j = i + 1; j < F.length; j++) {
      out.push({ kind: "all", features: [F[i], F[j]] });
      for (let k = j + 1; k < F.length; k++) out.push({ kind: "all", features: [F[i], F[j], F[k]] });
    }
  for (let k = 2; k <= 6; k++) out.push({ kind: "atLeast", k });
  return out;
}

export function scoreCombo(c: Combination, record: RecordName, years: number[], seed = 20261030, draws?: number): PooledDayScore {
  return scoreYearDays(
    years.map((y) => ({ id: String(y), days: comboDays(c, y, record), targets: yearTargets(y, [], RECORDS[record].turns) })),
    seed,
    draws,
  );
}

export interface ChosenCombo {
  combination: Combination;
  label: string;
  choose: PooledDayScore["turns"] & { coverage: number };
}

/** Every combination scored on the choosing span, best first, those marking too few days left out. */
export function chooseCombos(draws = 2000): ChosenCombo[] {
  const rows: ChosenCombo[] = [];
  for (const c of allCombinations()) {
    const s = scoreCombo(c, "dowNine", CHOOSE_YEARS, 20261030, draws);
    const coverage = s.years.reduce((a, y) => a + y.coverage, 0) / s.years.length;
    if (coverage < MIN_COVERAGE) continue;
    rows.push({ combination: c, label: comboLabel(c), choose: { ...s.turns, coverage } });
  }
  return rows.sort((a, b) => a.choose.p - b.choose.p || b.choose.hits / b.choose.expected - a.choose.hits / a.choose.expected);
}

export const TEST_SETS: { record: RecordName; years: number[] }[] = [
  { record: "dowNine", years: DOW_TEST_YEARS },
  { record: "dowThree", years: DOW_TEST_YEARS_THREE },
  { record: "spyThree", years: MODERN_YEARS },
  { record: "spyMajor", years: MODERN_YEARS },
  { record: "diaThree", years: MODERN_YEARS },
  { record: "diaMajor", years: MODERN_YEARS },
];
export const COMBO_TESTS = PICKS * TEST_SETS.length;

export interface ComboTestResult extends ChosenCombo {
  tests: { record: RecordName; hits: number; total: number; expected: number; p: number }[];
  /** His 52 calls, reported only (they overlap the choosing span). */
  calls: PooledDayScore["calls"];
}

export function runCombinationTest(): { considered: number; kept: number; picks: ComboTestResult[] } {
  const ranked = chooseCombos();
  const picks = ranked.slice(0, PICKS).map((pick): ComboTestResult => {
    const tests = TEST_SETS.map(({ record, years }) => {
      const s = scoreCombo(pick.combination, record, years).turns;
      return { record, hits: s.hits, total: s.total, expected: s.expected, p: s.p };
    });
    const calls = scoreYearDays(
      PUBLISHED_FORECASTS.map((f) => ({
        id: f.id,
        days: comboDays(pick.combination, Number(f.id), "dowNine"),
        targets: yearTargets(Number(f.id), f.windows, DOW_SWINGS.nine),
      })),
    ).calls;
    return { ...pick, tests, calls };
  });
  return { considered: allCombinations().length, kept: ranked.length, picks };
}
