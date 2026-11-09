/**
 * Dewey's cycle-validation checklist, operationalized.
 * -----------------------------------------------------------------------------
 * AGENTS.md's "Hermetic principles & cycle theory" standing principle, and the
 * headers of `lib/gann/decadeCycle.ts` and `lib/gann/digitalRoot.ts`, both cite
 * "Dewey's own cycle-validation checklist (dominance, regularity, repetition
 * count, constancy of period, phase-resumption, cross-series synchrony)" as the
 * bar a cycle hypothesis must clear before it can be trusted as more than a
 * confluence-only hypothesis. Source: Edward R. Dewey, "The Case for Cycles"
 * (Cycles, July 1967) — see `docs/GANN_HISTORICAL_SOURCES.md` C6 for the full
 * 18-point original (10 single-series criteria, 8 comparative). Before this
 * file, that citation had no code behind it anywhere in this codebase —
 * nothing could actually run the check it named. This module is a direct,
 * honest engineering approximation of Dewey's five single-series criteria
 * (dominance, regularity of timing, number of repetitions, constancy of
 * period, reestablishment of phase) plus his cross-series synchrony criterion,
 * computed as plain arithmetic over a list of event dates (typically same-kind
 * swing-pivot dates from `lib/analysis/pivots.ts`, or any other date series a
 * candidate cycle claims to explain).
 *
 * **What this deliberately is not**: Dewey's own criteria are descriptive —
 * "is a majority of crests within three or four months of perfect timing?" —
 * not a single universally-agreed formula. The functions below make one
 * specific, documented choice per criterion (see each function's own comment)
 * rather than claiming to reproduce his 1960s hand-charted judgment exactly,
 * and they are not a substitute for a real statistical significance test
 * (Dewey's own "Mathematical Tests" criterion, e.g. the Bartels test he cites,
 * is a separate, harder problem this module does not attempt). Treat a
 * "wellSupported" verdict here as "worth spending real backtest attribution
 * on" (`docs/PROPOSAL_NEW_GANN_CRITERIA.md`'s pipeline), never as promotion to
 * a scored, gating criterion by itself.
 *
 * Confluence/context only, same as every cycle-hypothesis module this
 * validates: this file only assesses whether a *claimed* cycle looks
 * non-chance. It never itself produces a trade signal.
 *
 * **Three-question mandate** (AGENTS.md), answered in place:
 * 1. Gann grounding — this module doesn't implement a Gann technique itself;
 *    it validates the cycle *hypotheses* that support Gann's own cycle work
 *    (`lib/gann/decadeCycle.ts`, `lib/gann/timeCycles.ts`) before they're
 *    trusted. Its role is downstream of Gann's methodology, not a port of it.
 * 2. Dewey/Tomes — this file *is* the checklist: all five of Dewey's
 *    single-series criteria (dominance, regularity, repetition count,
 *    constancy of period, phase-resumption) plus his cross-series synchrony
 *    criterion are implemented, not merely referenced. Wave-shape identity
 *    (Dewey's 9th criterion) is the one item from the full 18-point original
 *    (`docs/GANN_HISTORICAL_SOURCES.md` C6) deliberately not attempted here —
 *    it requires averaging waveforms across many cycle repetitions, a
 *    materially harder problem than the arithmetic-over-dates approach this
 *    module takes, and is left as a named gap rather than faked.
 * 3. Hermetic principle — Rhythm and Vibration: this module exists
 *    specifically to test whether a claimed periodic rhythm is real
 *    (non-chance) rather than assumed. That framing is why it stays strictly
 *    diagnostic (an assessment function) rather than becoming a generator of
 *    new cycle claims — Rhythm as a design lens means testing the pulse
 *    that's already claimed, not inventing new ones.
 */

export type CriterionVerdict = "pass" | "fail" | "notApplicable";

export interface CycleRigorCriterion {
  verdict: CriterionVerdict;
  /** The underlying metric this criterion's pass/fail was computed from. */
  metric: number;
  detail: string;
}

export interface CycleRigorResult {
  /** Fraction of intervals landing within tolerance of the candidate period — Dewey's "does the cycle prevail over randoms?" */
  dominance: CycleRigorCriterion;
  /** Mean fractional deviation from the candidate period, across all intervals. */
  regularity: CycleRigorCriterion;
  /** How many full candidate-period lengths the data actually spans. */
  repetitionCount: CycleRigorCriterion;
  /** Relative difference between the average interval in the first vs second half of the data. */
  constancyOfPeriod: CycleRigorCriterion;
  /** Whether timing recovers to the expected phase after the largest observed distortion. */
  phaseResumption: CycleRigorCriterion;
  /** Count of the five criteria above that returned "pass". */
  passedCount: number;
  /** Count of the five criteria above that were computable at all ("pass" or "fail", not "notApplicable"). */
  totalApplicable: number;
  overall: "insufficientData" | "unlikelyNonChance" | "hypothesis" | "wellSupported";
}

export interface CycleRigorInput {
  /** Dates the candidate cycle claims to explain (e.g. same-kind swing-pivot dates). Order doesn't matter — sorted internally. */
  eventDates: Date[];
  /** The candidate cycle length, in days. */
  periodDays: number;
  /**
   * How far off the candidate period still counts as "on schedule", as a
   * fraction of the period. Default 0.15 — close to Dewey's own worked
   * examples (e.g. "a majority of crests fall within three or four months
   * one way or the other" against a 41-month/~3.4yr cycle is ~8-10%; 0.15
   * is deliberately a bit looser to avoid over-fitting a single hand-picked
   * example as the universal threshold).
   */
  toleranceFraction?: number;
}

const DEFAULT_TOLERANCE_FRACTION = 0.15;
/** Dewey's own weakest still-convincing case ("even 5... repetitions"); his strongest ran to 48. */
const MIN_REPETITIONS_FOR_SIGNIFICANCE = 5;
/** Need at least this many events to split into two halves for constancy-of-period. */
const MIN_EVENTS_FOR_CONSTANCY_CHECK = 5;
const MS_PER_DAY = 24 * 3600 * 1000;

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_PER_DAY;
}

function sortedUnique(dates: Date[]): Date[] {
  return Array.from(new Set(dates.map((d) => d.getTime())))
    .sort((a, b) => a - b)
    .map((t) => new Date(t));
}

/** Interval mapped to its deviation from the nearest whole multiple of the candidate period, as a fraction of the period. */
function fractionalDeviation(intervalDays: number, periodDays: number): number {
  const multiple = Math.max(1, Math.round(intervalDays / periodDays));
  return Math.abs(intervalDays - multiple * periodDays) / periodDays;
}

/**
 * Mean phase (in days, within [0, periodDays)) of a set of dates relative to `anchor`,
 * folded to the candidate period. Uses a circular mean (via sin/cos of the phase angle)
 * rather than a plain arithmetic mean, because phase wraps: two events at 1 day and
 * (periodDays - 1) days past anchor are one day apart in phase, not almost a full period
 * apart, and a plain mean would get that wrong right at the wrap boundary.
 */
function circularMeanPhaseDays(dates: Date[], anchor: Date, periodDays: number): number {
  let sumSin = 0;
  let sumCos = 0;
  for (const d of dates) {
    const raw = daysBetween(anchor, d) % periodDays;
    const angle = (2 * Math.PI * ((raw + periodDays) % periodDays)) / periodDays;
    sumSin += Math.sin(angle);
    sumCos += Math.cos(angle);
  }
  const meanAngle = Math.atan2(sumSin, sumCos);
  const meanPhase = (meanAngle / (2 * Math.PI)) * periodDays;
  return (meanPhase + periodDays) % periodDays;
}

/** Shortest distance (in days) between two phases on a `periodDays`-long circle. */
function foldedPhaseDistance(phaseA: number, phaseB: number, periodDays: number): number {
  const diff = Math.abs(phaseA - phaseB) % periodDays;
  return Math.min(diff, periodDays - diff);
}

function notApplicable(detail: string): CycleRigorCriterion {
  return { verdict: "notApplicable", metric: 0, detail };
}

function insufficientDataResult(detail: string): CycleRigorResult {
  const na = notApplicable(detail);
  return {
    dominance: na,
    regularity: na,
    repetitionCount: na,
    constancyOfPeriod: na,
    phaseResumption: na,
    passedCount: 0,
    totalApplicable: 0,
    overall: "insufficientData",
  };
}

export function assessCycleRigor(input: CycleRigorInput): CycleRigorResult {
  const { periodDays } = input;
  const tolerance = input.toleranceFraction ?? DEFAULT_TOLERANCE_FRACTION;
  if (!Number.isFinite(periodDays) || periodDays <= 0) {
    return insufficientDataResult("periodDays must be a positive number");
  }

  const dates = sortedUnique(input.eventDates);
  if (dates.length < 3) {
    return insufficientDataResult(`only ${dates.length} distinct event date(s) — need at least 3`);
  }

  const spanDays = daysBetween(dates[0], dates[dates.length - 1]);
  if (spanDays < periodDays * 2) {
    return insufficientDataResult(
      `data spans ${spanDays.toFixed(0)}d, less than 2 candidate periods (${(periodDays * 2).toFixed(0)}d) — too short to judge repetition`,
    );
  }

  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) intervals.push(daysBetween(dates[i - 1], dates[i]));

  // Repetition count (Dewey criterion #3): how many full candidate periods the data spans.
  const repetitions = spanDays / periodDays;
  const repetitionCount: CycleRigorCriterion = {
    verdict: repetitions >= MIN_REPETITIONS_FOR_SIGNIFICANCE ? "pass" : "fail",
    metric: repetitions,
    detail: `data spans ${repetitions.toFixed(1)} candidate-period lengths (need >= ${MIN_REPETITIONS_FOR_SIGNIFICANCE})`,
  };

  const deviations = intervals.map((iv) => fractionalDeviation(iv, periodDays));

  // Dominance (Dewey criterion #1): fraction of intervals landing within tolerance.
  const onScheduleFraction = deviations.filter((d) => d <= tolerance).length / deviations.length;
  const dominance: CycleRigorCriterion = {
    verdict: onScheduleFraction >= 0.6 ? "pass" : "fail",
    metric: onScheduleFraction,
    detail: `${(onScheduleFraction * 100).toFixed(0)}% of intervals fall within ${(tolerance * 100).toFixed(0)}% of the candidate period (need >= 60%)`,
  };

  // Regularity of timing (Dewey criterion #2): average deviation size, not just hit-rate.
  const meanDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
  const regularity: CycleRigorCriterion = {
    verdict: meanDeviation <= tolerance ? "pass" : "fail",
    metric: meanDeviation,
    detail: `mean interval deviation is ${(meanDeviation * 100).toFixed(1)}% of the candidate period (need <= ${(tolerance * 100).toFixed(0)}%)`,
  };

  // Constancy of period (Dewey criterion #4): compare the average interval in the first vs second half of the data.
  let constancyOfPeriod: CycleRigorCriterion;
  if (intervals.length < MIN_EVENTS_FOR_CONSTANCY_CHECK - 1) {
    constancyOfPeriod = notApplicable(`only ${intervals.length} interval(s) — need at least ${MIN_EVENTS_FOR_CONSTANCY_CHECK - 1} to split into two halves`);
  } else {
    const mid = Math.floor(intervals.length / 2);
    const firstHalf = intervals.slice(0, mid);
    const secondHalf = intervals.slice(mid);
    const meanFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const meanSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const relativeDrift = Math.abs(meanFirst - meanSecond) / periodDays;
    const constancyTolerance = tolerance * 2; // looser: each half's mean is itself a noisier estimate than the full-series one.
    constancyOfPeriod = {
      verdict: relativeDrift <= constancyTolerance ? "pass" : "fail",
      metric: relativeDrift,
      detail: `average interval drifted ${(relativeDrift * 100).toFixed(1)}% of the candidate period between the first and second half of the data (need <= ${(constancyTolerance * 100).toFixed(0)}%)`,
    };
  }

  // Phase resumption (Dewey criterion #5): after the largest distortion (a skipped or
  // badly-off cycle), does timing return to the *same absolute phase* it had before —
  // not merely resume a regular cadence at some new, permanently-shifted phase. Phase is
  // computed circularly (via sin/cos, not a plain mean) because it's modular: a phase of
  // 1 day and a phase of (periodDays - 1) days are one day apart, not almost a full period.
  let phaseResumption: CycleRigorCriterion;
  const distortionTolerance = tolerance * 2;
  let worstIndex = -1;
  let worstDeviation = distortionTolerance;
  for (let i = 0; i < deviations.length - 1; i++) {
    if (deviations[i] > worstDeviation) {
      worstDeviation = deviations[i];
      worstIndex = i;
    }
  }
  if (worstIndex === -1) {
    phaseResumption = notApplicable("no distortion (interval deviating past tolerance) observed to test recovery from");
  } else {
    const preEvents = dates.slice(0, worstIndex + 1);
    const postEvents = dates.slice(worstIndex + 1);
    if (postEvents.length === 0) {
      phaseResumption = notApplicable("the distortion is the final interval — no events afterward to check recovery against");
    } else {
      const anchor = dates[0];
      const prePhase = circularMeanPhaseDays(preEvents, anchor, periodDays);
      const postPhase = circularMeanPhaseDays(postEvents, anchor, periodDays);
      const phaseDrift = foldedPhaseDistance(prePhase, postPhase, periodDays) / periodDays;
      phaseResumption = {
        verdict: phaseDrift <= tolerance ? "pass" : "fail",
        metric: phaseDrift,
        detail: `after the largest distortion (interval ${worstIndex + 1}, ${(worstDeviation * 100).toFixed(0)}% off), phase drifted ${(phaseDrift * 100).toFixed(1)}% of the period from its pre-distortion phase (need <= ${(tolerance * 100).toFixed(0)}% to count as resumed)`,
      };
    }
  }

  const criteria = [dominance, regularity, repetitionCount, constancyOfPeriod, phaseResumption];
  const applicable = criteria.filter((c) => c.verdict !== "notApplicable");
  const passedCount = applicable.filter((c) => c.verdict === "pass").length;
  const totalApplicable = applicable.length;
  const ratio = totalApplicable === 0 ? 0 : passedCount / totalApplicable;

  const overall: CycleRigorResult["overall"] =
    totalApplicable === 0 ? "insufficientData" : ratio >= 0.8 ? "wellSupported" : ratio >= 0.5 ? "hypothesis" : "unlikelyNonChance";

  return { dominance, regularity, repetitionCount, constancyOfPeriod, phaseResumption, passedCount, totalApplicable, overall };
}

/**
 * Dewey's cross-series synchrony criterion (`case_for_cycles.pdf` criteria
 * #11-13): does the same candidate period turn at about the same phase in a
 * second, independent series? For each event in `seriesA`, this finds the
 * nearest event in `seriesB` and measures how far off-phase they are (folded
 * to at most half a period, since being early or late by the same amount is
 * symmetric). Returns `notApplicable` when either series is too short to
 * measure meaningfully.
 */
export function cycleSynchrony(
  seriesA: Date[],
  seriesB: Date[],
  periodDays: number,
  toleranceFraction = DEFAULT_TOLERANCE_FRACTION,
): CycleRigorCriterion {
  const a = sortedUnique(seriesA);
  const b = sortedUnique(seriesB);
  if (a.length === 0 || b.length === 0) {
    return notApplicable("one or both series have no events");
  }
  if (!Number.isFinite(periodDays) || periodDays <= 0) {
    return notApplicable("periodDays must be a positive number");
  }

  const phaseMismatches = a.map((eventA) => {
    let nearest = b[0];
    let nearestGap = Math.abs(daysBetween(eventA, nearest));
    for (const eventB of b) {
      const gap = Math.abs(daysBetween(eventA, eventB));
      if (gap < nearestGap) {
        nearest = eventB;
        nearestGap = gap;
      }
    }
    const foldedGap = nearestGap % periodDays;
    return Math.min(foldedGap, periodDays - foldedGap) / periodDays;
  });

  const meanMismatch = phaseMismatches.reduce((sum, v) => sum + v, 0) / phaseMismatches.length;
  return {
    verdict: meanMismatch <= toleranceFraction ? "pass" : "fail",
    metric: meanMismatch,
    detail: `mean cross-series phase mismatch is ${(meanMismatch * 100).toFixed(1)}% of the candidate period (need <= ${(toleranceFraction * 100).toFixed(0)}%)`,
  };
}
