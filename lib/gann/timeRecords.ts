/**
 * The measured record behind each time line the confluence card shows
 * (CYC-30, CYC-47). Display only: nothing here feeds a score, gate, plan or
 * order.
 *
 * Sources:
 * - CYC-30 (Halberg et al. 2003, W041 pp. 29-30): a rhythm has to be shown by
 *   inferential statistics ("time-microscopy"), not by eye alone, and both are
 *   needed.
 * - CYC-47 (Tomes, W043 pp. 1-2; collection synthesis §3.8): a dated forward
 *   claim from a cycle needs its method and a measured record; Tomes' own oil
 *   peak landed about six months early. AGENTS.md "Forward-looking claims":
 *   allowed only when verified by documentation linked where it is shown.
 *
 * So a time line is shown with its record, or not at all. A record is a
 * committed base-rate run under `docs/replay-runs/`; its test checks the run
 * exists and still says what the record says. A line with no record (`null`)
 * is hidden from the card; its reading is still computed, described in the
 * explanation trace and measured as a replay factor, so it can earn a record.
 *
 * Three-question basis:
 * 1. Source: the windows are the method's own (see each module); the rule to
 *    show their record is Halberg's and Tomes', class CYCLE.
 * 2. Cycles: Dewey's recurrent-event statistic (a hit rate against a base
 *    rate, CYC-24) is the record; the 2026-10-16 run cleared none of the
 *    families, and the card says so rather than letting the eye judge.
 * 3. Hermetic: Mentalism and Cause and Effect: what the trader is shown shapes
 *    what they believe, so a rhythm is shown with the evidence that it causes
 *    anything, or not shown.
 */
import type { MacroCycleResult, MacroCycleWindow } from "@/lib/gann/macroCycle";

export interface MeasuredRecord {
  /** The committed run, from the repo root. */
  run: string;
  /** The run's families (`timeWindowBaseRate.ts`) this line's windows belong to. */
  families: string[];
  beatsRandom: boolean;
  /** Plain-language result, shown on the card. */
  summary: string;
}

export type TimeLine =
  | "timeCycle"
  | "dayCountBands"
  | "macroCycle"
  | "squareOf52"
  | "angleMonthCounts"
  | "yearFraction"
  | "turnTiming"
  | "seasonalCount"
  | "timeSquare"
  | "dayCircle"
  | "swingProjection"
  | "yearCycles";

const BASE_RATES_2026_10_16 = "docs/replay-runs/2026-10-16-time-window-base-rates-736sym.json";

export const TIME_LINE_RECORDS: Record<TimeLine, MeasuredRecord | null> = {
  timeCycle: {
    run: BASE_RATES_2026_10_16,
    families: ["anniversary1", "anniversary2", "anniversary3", "wheel", "dayBands"],
    beatsRandom: false,
    summary: "Measured: no better than chance (736 symbols, 2017-2026)",
  },
  dayCountBands: {
    run: BASE_RATES_2026_10_16,
    families: ["dayBands"],
    beatsRandom: false,
    summary: "Measured: no better than chance (736 symbols, 2017-2026)",
  },
  // No committed base-rate run yet; `timeWindowBaseRate.ts` scores the macro family (CYC-24).
  macroCycle: null,
  squareOf52: null,
  angleMonthCounts: null,
  yearFraction: null,
  turnTiming: null,
  seasonalCount: null,
  timeSquare: null,
  dayCircle: null,
  swingProjection: null,
  // The yearly-cycle convergence badge (`timeCycles.ts#yearCycleConvergence`).
  // `timeWindowBaseRate.ts` now scores a `yearCycles` family, but the
  // 2026-10-16 run predates it, so the badge stays hidden until a run holds it.
  yearCycles: null,
};

/** The macro cycle's upcoming windows, only when the macro cycle has a measured record. */
export function displayableUpcomingMajor(r: MacroCycleResult): MacroCycleWindow[] {
  return TIME_LINE_RECORDS.macroCycle ? r.upcomingMajor : [];
}

/** The macro-cycle reading as it may leave the server: its upcoming windows only with a measured record (CYC-47). */
export function displayableMacroCycle(r: MacroCycleResult): MacroCycleResult {
  return { ...r, upcomingMajor: displayableUpcomingMajor(r) };
}
