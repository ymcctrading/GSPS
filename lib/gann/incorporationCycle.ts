/**
 * Parity roadmap Stage D3 (gap G10): time counted from the company's own
 * birth date, in addition to the market-wide calendar and the stock's price
 * pivots. Context only: nothing here feeds a scored criterion, a gate, a
 * plan, an entry, a stop or a target. It is shown in the explanation trace and
 * recorded on every replayed trade (`contextFactors.ts`), so it is measured
 * before anything may gate (AGENTS.md "Gann-derived AND measured").
 *
 * Gann's rules (Tier A):
 * - The most important monthly count origins are the extreme life low and
 *   "the date of incorporation / first trading". U.S. Steel, incorporated
 *   Feb 25 1901: Feb 1931 = 360 months, the 30-year cycle, and "a change in
 *   trend of Steel nearly always comes in the month of February" (Master
 *   Stock Market Course, Ch. 7).
 * - "Dates of incorporation and first trading shift a stock's seasonal
 *   dates." From Feb 25 he lists U.S. Steel's own seasonal points: 45°, 60°,
 *   90°, 120°, 135°, 150°, 180°, 225°, 240°, 270°, 300°, 315°, 330° and 360°
 *   of the year (Master Course Ch. 14). The degree list here is his.
 * - A company's anniversary used as a timing trigger (*Tunnel Thru the Air*,
 *   1927, the Major Motors campaign; Tier A as fiction, corroborating).
 * - Cycle lengths are `MAJOR_CYCLE_YEARS`, his Ch. 7 hierarchy.
 *
 * Engineering choices, labelled as such:
 * - The date is Wikidata's "inception" (P571), matched by SEC CIK. For most
 *   companies that is the founding date, which may differ from the
 *   incorporation date Gann names. It is the only per-symbol birth date with
 *   a free, bulk source.
 * - Degrees are of the calendar year (365.25 days). Gann's printed U.S. Steel
 *   dates run 1-4 days after the exact degree, so the window is ±4 days,
 *   which keeps every one of his dates inside it (see the test). His Jun 12
 *   entry, printed as 135° out of order, is not used as a fixture.
 * - A date known only to the month gives the anniversary month and cycle
 *   years; one known only to the year gives cycle years only.
 * - Cycle years leave out 1, 2 and 3: those cover every year, every second
 *   and every third, so naming them says nothing.
 *
 * Three-question basis:
 * 1. Gann: as cited above, Tier A.
 * 2. Cycles: an annual recurrence claim anchored on a per-stock date. By
 *    construction regularity of timing and constancy of period hold (the
 *    calendar year). Dominance, repetition count against a base rate,
 *    phase-resumption, wave-shape identity and cross-series clustering are
 *    untested, which is why this stays context only until the replay's
 *    factor table measures it (master report M4).
 * 3. Hermetic: Correspondence. Each stock keeps its own calendar, the same
 *    law as the market's solar calendar with its own phase ("each stock has
 *    its own time period", A05). Rhythm also fits: the count restarts at 360
 *    months, "the second cycle or circle". Mentalism and Gender were
 *    considered and do not bear on a date count.
 */

import { MAJOR_CYCLE_YEARS } from "@/lib/gann/timeCycles";

export type InceptionPrecision = "day" | "month" | "year";

export interface Inception {
  /** ISO date (YYYY-MM-DD). Month and day are meaningless below their precision. */
  date: string;
  precision: InceptionPrecision;
}

/** Gann's U.S. Steel seasonal points (Master Course Ch. 14), ranked like the year fractions from a pivot. */
export const INCORPORATION_DEGREES: readonly { degrees: number; rank: number }[] = [
  { degrees: 45, rank: 5 },
  { degrees: 60, rank: 6 },
  { degrees: 90, rank: 3 },
  { degrees: 120, rank: 4 },
  { degrees: 135, rank: 5 },
  { degrees: 150, rank: 6 },
  { degrees: 180, rank: 2 },
  { degrees: 225, rank: 5 },
  { degrees: 240, rank: 4 },
  { degrees: 270, rank: 3 },
  { degrees: 300, rank: 6 },
  { degrees: 315, rank: 5 },
  { degrees: 330, rank: 6 },
  { degrees: 360, rank: 1 },
];

export const INCORPORATION_WINDOW_DAYS = 4;
const YEAR_DAYS = 365.25;
const DAY_MS = 24 * 3600 * 1000;
const NAMED_CYCLES = MAJOR_CYCLE_YEARS.filter((y) => y >= 5);

export interface IncorporationCycleReading {
  inception: string;
  precision: InceptionPrecision;
  /** Whole years since inception (calendar years when only the year is known). */
  ageYears: number;
  /** Day precision: days since the latest anniversary (0-365). */
  daysSinceAnniversary: number | null;
  /** Day precision: the highest-ranked degree of the year within the window, 360 = the anniversary. */
  degree: { degrees: number; rank: number; daysOff: number } | null;
  /** Day or month precision: this is the anniversary month. */
  anniversaryMonth: boolean;
  /** Cycles of 5+ years from `MAJOR_CYCLE_YEARS` that complete in this calendar year. */
  completingCycles: number[];
}

export function readIncorporationCycle(
  inception: Inception | null | undefined,
  asOf: Date,
): IncorporationCycleReading | null {
  if (!inception) return null;
  const birth = new Date(`${inception.date}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || birth.getTime() > asOf.getTime()) return null;

  const yearsElapsed = asOf.getUTCFullYear() - birth.getUTCFullYear();
  const completingCycles = yearsElapsed > 0 ? NAMED_CYCLES.filter((y) => yearsElapsed % y === 0) : [];

  if (inception.precision === "year") {
    return {
      inception: inception.date.slice(0, 4),
      precision: "year",
      ageYears: yearsElapsed,
      daysSinceAnniversary: null,
      degree: null,
      anniversaryMonth: false,
      completingCycles,
    };
  }

  const anniversaryMonth = asOf.getUTCMonth() === birth.getUTCMonth();
  if (inception.precision === "month") {
    const passed = asOf.getUTCMonth() >= birth.getUTCMonth();
    return {
      inception: inception.date.slice(0, 7),
      precision: "month",
      ageYears: passed ? yearsElapsed : yearsElapsed - 1,
      daysSinceAnniversary: null,
      degree: null,
      anniversaryMonth,
      completingCycles,
    };
  }

  // Latest anniversary on or before asOf.
  const at = (year: number) => Date.UTC(year, birth.getUTCMonth(), birth.getUTCDate());
  let year = asOf.getUTCFullYear();
  if (at(year) > asOf.getTime()) year -= 1;
  const daysSince = Math.floor((asOf.getTime() - at(year)) / DAY_MS);

  let degree: IncorporationCycleReading["degree"] = null;
  for (const d of INCORPORATION_DEGREES) {
    const target = (d.degrees / 360) * YEAR_DAYS;
    // The anniversary is both 0° and 360°.
    const off = d.degrees === 360 ? Math.min(daysSince, YEAR_DAYS - daysSince) : Math.abs(daysSince - target);
    if (off > INCORPORATION_WINDOW_DAYS) continue;
    if (!degree || d.rank < degree.rank) degree = { degrees: d.degrees, rank: d.rank, daysOff: Math.round(off) };
  }

  return {
    inception: inception.date.slice(0, 10),
    precision: "day",
    ageYears: year - birth.getUTCFullYear(),
    daysSinceAnniversary: daysSince,
    degree,
    anniversaryMonth,
    completingCycles,
  };
}

export function describeIncorporationCycle(r: IncorporationCycleReading): string[] {
  const lines: string[] = [];
  if (r.degree) {
    lines.push(
      r.degree.degrees === 360
        ? `Company anniversary (inception ${r.inception}, ${r.ageYears} years): a stock keeps its own calendar from its birth date.`
        : `${r.degree.degrees}° of the company's year from its ${r.inception} inception (${r.daysSinceAnniversary} days past the anniversary).`,
    );
  } else if (r.anniversaryMonth) {
    lines.push(`Anniversary month of the company's inception (${r.inception}).`);
  }
  if (r.completingCycles.length > 0) {
    lines.push(
      `${r.completingCycles.join("-, ")}-year cycle${r.completingCycles.length > 1 ? "s" : ""} from the company's inception (${r.inception}) complete${r.completingCycles.length > 1 ? "" : "s"} this year.`,
    );
  }
  return lines;
}
