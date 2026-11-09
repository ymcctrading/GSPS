/**
 * Gann's time counts that were read as context only, as dated windows for the
 * shared time-window mechanism (`timeWindow.ts`), which reads them since
 * 2026-10-27 (`timeWindowsAt`). The 2026-10-22 recheck of
 * the 342 rules found each of these read on the card and in the replay's
 * context factors but never reaching the time-window hold, against the
 * owner's 2026-10-01 decision that every Gann method acts where Gann says it
 * acts ("no more watching, or background, or serving as confluence"). A time
 * count acts as a window for a turn: it counts only when the market turns on
 * it, and the price signal is still the plan's own entry.
 *
 * Each reading is the module that already computes it, called on the bars
 * through the turn, so the card, the replay's factor and the hold read one
 * rule. Sources are in those modules; in brief:
 * - M-T8: the seasonal sixteenths, every 22.5° of the year from March 21
 *   (Gann's Square of Nine plate; `seasonalCounts.ts`). The quarters, eighths
 *   and thirds already act through `FIXED_CALENDAR_WINDOWS` and the Sun's 15°
 *   points, so only the sixteenths are read here.
 * - C-TIME-05: the Winter-quarter dates counted from December 22 (Master
 *   Course Ch.5 PDF 161; `seasonalCounts.ts`).
 * - C-TIME-06: the Ch.5 wheel counts 30, 60, 150, 210, 300 and 330 days
 *   (Ch.5 PDF 162; `timeCounts.ts`).
 * - C-TIME-08, M-T11: the week counts 20, 42-45, 45½ and 78-80 weeks
 *   (*Commodities* p.311, Ch.14 PDF 385, Ch.2 PDF 58; `timeCounts.ts`).
 * - M-T16, C-TIME-13: the Square of 52's disclosed week counts over its
 *   104-week span (Ch.14 PDF 385; `squareOf52.ts`).
 * - M-T11: time balance, top to top and bottom to bottom (*Commodities*
 *   pp.311-312; `timeCounts.ts`), and the open leg lasting as long as the
 *   matching prior leg (`campaignLedger.ts#timeBalanceDates`).
 * - C-TIME-07: market days at multiples of 11¼ from the extreme high and low
 *   (Ch.16 PDF 428-430; `priceAsTime.ts`).
 * - C-TIME-14: the square of 90 in months and weeks, from the stored
 *   inception and the extreme low (Ch.4 PDF 125, 144; `priceAsTime.ts`).
 * - C-TIME-22: the low, the high and the range read as days, weeks and
 *   months (Ch.4 PDF 145-150; `priceAsTime.ts`).
 * - C-TIME-20: ¼ or ¾ of a year from the low meeting ⅓ or ⅔ from the high
 *   (Ch.18 TP-2 PDF 440; `priceAsTime.ts`), and the 1955 and 1931 lessons'
 *   cycles the 1935 list lacks (`timeCycles.ts#lessonCycleHits`).
 * - C-TIME-16: days, weeks and months from the year's extreme landing on a
 *   multiple of 12 together, the Square of 144 in time (Ch.13;
 *   `timeConvergence.ts`).
 * - C-TIME-18: the 7th, 14th and 21st day from the last 3-Day Chart swing,
 *   labelled high and low alternately (A2.2 forecasts, Ch.14;
 *   `timeConvergence.ts`).
 * - CYC-04: a cycle with fewer repetitions in the US record than Dewey's
 *   minimum (`timeCycles.ts#FEW_REPETITION_CYCLE_YEARS`) says so in its label.
 *
 * Each window carries the pivot it is counted from (`from`) or the turn its
 * source names (`turn`), so `timeWindow.ts` applies its own polarity rule to
 * all of them alike; this module decides none.
 *
 * Engineering choices, labelled: each reading keeps its own module's anchors,
 * orb and tolerance unchanged; the Square of 144 counts only when two or three
 * of its units land together (its own convergence rule, since a day count on
 * a multiple of 12 alone is open about one day in four); the time-balance
 * date of the campaign ledger is open within 2 days, as `timeCycles()`.
 *
 * Three-question basis:
 * 1. Gann: as cited, class A, through each source module.
 * 2. Cycles: recurrence claims; none has cleared Dewey's checklist
 *    (repetition against a base rate, persistence out of sample). More
 *    windows make the hold easier to meet: on 20 random walks × 20 dates
 *    (2026-10-22 review probe) at least one of these was open on 395 of 400
 *    dates, the saturation P7's dated window showed on 2026-10-20. Measured
 *    again before wiring (2026-10-27, `timeWindow.ts`'s header): open on 98%
 *    of random-walk turns, and the hold already open on all of them, so the
 *    real-data base rate (`lib/research/timeWindowBaseRate.ts`, which needs
 *    the vendor's bars) cannot make the hold any looser; the replay's window
 *    hold measures it. CYC-04's label is on `timeWindow.ts`'s yearly counts
 *    too (the 30-, 50- and 60-year counts).
 * 3. Hermetic: Correspondence (one division of time read in days, weeks,
 *    months and years, from the market's own tops and bottoms) and Rhythm
 *    (the count returns). Polarity is left to the hold, which owns it.
 */
import type { Bar } from "@/lib/types";
import type { WindowAnchors } from "@/lib/gann/timeWindow";
import { readSeasonalCount, readWinterQuarterCount } from "@/lib/gann/seasonalCounts";
import { readTimeBalanceSpans, readWeekCounts, readWheelCountsCh5 } from "@/lib/gann/timeCounts";
import { squareOf52Hits } from "@/lib/gann/squareOf52";
import { buildCampaignLedger } from "@/lib/gann/campaignLedger";
import { marketDayElevenths, priceAsTimeHits, squareOf90Counts, twoPivotFraction } from "@/lib/gann/priceAsTime";
import { US_EQUITY_RECORD_YEARS, lessonCycleHits } from "@/lib/gann/timeCycles";
import { MIN_REPETITIONS } from "@/lib/gann/spectralCycle";
import { readTiming } from "@/lib/gann/timeConvergence";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";
import { pointForBars } from "@/lib/gann/pointScale";

export interface CountWindow {
  /** The recheck rule the reading carries. */
  rule: string;
  /** Plain words, for the trace. */
  label: string;
  /** The pivot the count runs from, when it has one. */
  from: "low" | "high" | null;
  /** The turn the source itself names, when it names one. */
  turn: "top" | "bottom" | null;
}

const DAY_MS = 86_400_000;
const LEDGER_WINDOW_DAYS = 2;

/**
 * CYC-04: the label a cycle too long to repeat often in the record carries,
 * by the same rule as `timeCycles.ts#FEW_REPETITION_CYCLE_YEARS`, applied to
 * any lesson's cycle (that list covers the 1935 lesson's only).
 */
export function fewRepetitionNote(years: number): string {
  return US_EQUITY_RECORD_YEARS / years < MIN_REPETITIONS ? " (too few repetitions in the record to confirm)" : "";
}

/**
 * Every context time count open on `date`, read on `bars` that end at the
 * turn and on the monthly chart closed before the turn's month.
 */
export function countWindowsAt(
  bars: Bar[],
  date: string,
  monthly?: Bar[] | null,
  anchors?: WindowAnchors | null,
): CountWindow[] {
  const out: CountWindow[] = [];
  if (bars.length === 0) return out;
  const asOf = new Date(`${date}T12:00:00Z`);
  const push = (rule: string, label: string, from: CountWindow["from"] = null, turn: CountWindow["turn"] = null) =>
    out.push({ rule, label, from, turn });

  const seasonal = readSeasonalCount(asOf);
  if (seasonal?.point.rank === 5) push("M-T8", `the ${seasonal.point.label} point of the seasonal year`);
  const winter = readWinterQuarterCount(asOf);
  if (winter) push("C-TIME-05", `${winter.point.label} on the winter-quarter count from December 22`);

  for (const h of readWheelCountsCh5(bars, asOf)) push("C-TIME-06", `${h.label} from the ${h.pivotDate} ${h.pivotKind}, a count of the circle`, h.pivotKind);
  for (const h of readWeekCounts(bars, asOf)) push("C-TIME-08", `${h.label} from the ${h.pivotDate} ${h.pivotKind}`, h.pivotKind);
  for (const h of squareOf52Hits(bars, asOf)) push("M-T16", `${h.weeks} weeks from the ${h.pivotDate} ${h.pivotKind} on the Square of 52`, h.pivotKind);

  for (const b of readTimeBalanceSpans(bars)) {
    push("M-T11", `${round(b.openWeeks)} weeks since the last ${b.kind}, balancing ${round(b.priorWeeks)} weeks from ${b.kind} to ${b.kind}`, null, b.kind);
  }
  const ledger = buildCampaignLedger(bars);
  for (const d of ledger?.timeBalanceDates ?? []) {
    if (Math.abs(Date.parse(`${d}T12:00:00Z`) - asOf.getTime()) <= LEDGER_WINDOW_DAYS * DAY_MS) {
      push("M-T11", `the move lasting as long as the matching leg before it (${d})`, null, ledger?.timeBalanceTurn ?? null);
    }
  }

  for (const h of marketDayElevenths(bars)) push("C-TIME-07", `${h.marketDays} market days from the ${h.pivotDate} ${h.pivot}, ${h.multiple} × 11¼`, h.pivot);

  // The extreme high and low of the bars read, as `priceAsTime.ts` takes them.
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].h > bars[hi].h) hi = i;
    if (bars[i].l < bars[lo].l) lo = i;
  }
  const low = { date: bars[lo].t.slice(0, 10), price: bars[lo].l };
  const high = { date: bars[hi].t.slice(0, 10), price: bars[hi].h };
  const unit = pointForBars(bars);
  if (unit > 0) {
    for (const h of priceAsTimeHits(low, high, date, unit)) {
      const from = h.source === "range" ? (lo >= hi ? "low" : "high") : h.source;
      const what = h.source === "range" ? "the range" : `the ${h.source}`;
      push("C-TIME-22", `${what} (${round(h.points)} points) coming out in ${h.unit}${h.multiple > 1 ? `, ${h.multiple} times` : ""}, from ${h.pivotDate}`, from);
    }
  }
  if (anchors?.inception) {
    for (const h of squareOf90Counts(anchors.inception, "inception", asOf)) {
      push("C-TIME-14", `${h.step} ${h.unit} from the company's ${h.originDate} inception on the square of 90`);
    }
  }
  if (lo < bars.length - 1) {
    // Read at midnight on the turn's date, as `readPriceAsTime` reads it for the card.
    const lastAt = new Date(`${date}T00:00:00Z`);
    for (const h of squareOf90Counts({ date: low.date, precision: "day" }, "low", lastAt)) {
      push("C-TIME-14", `${h.step} ${h.unit} from the ${h.originDate} low on the square of 90`, "low");
    }
  }

  const majors = majorPivots(findPivots(bars, 5));
  const lastLow = [...majors].reverse().find((p) => p.kind === "low");
  const lastHigh = [...majors].reverse().find((p) => p.kind === "high");
  const close = bars[bars.length - 1].c;
  if (lastLow && lastHigh && unit > 0) {
    const f = twoPivotFraction({ date: lastLow.bar.t, price: lastLow.price }, { date: lastHigh.bar.t, price: lastHigh.price }, date, close, unit);
    if (f) push("C-TIME-20", `${f.fromLow} of a year from the ${f.lowDate} low meeting ${f.fromHigh} from the ${f.highDate} high`);
  }
  for (const h of lessonCycleHits(monthly ?? [], asOf)) {
    push("C-TIME-20", `${h.years} years from the ${h.pivotMonth} major ${h.kind}, a cycle in the ${h.lesson} lesson${fewRepetitionNote(h.years)}`, h.kind);
  }

  const timing = readTiming(bars);
  const sq = timing.square144;
  if (sq && sq.units.length >= 2) {
    const kind = hi >= lo ? "high" : "low";
    push("C-TIME-16", `${sq.units.join(" and ")} from the year's ${sq.pivotDate} extreme on multiples of 12, the Square of 144 in time`, extremeKind(bars, sq.pivotDate) ?? kind);
  }
  const mark = timing.changeDates?.dates.find((c) => Math.abs(Date.parse(`${c.date}T12:00:00Z`) - asOf.getTime()) <= DAY_MS);
  if (mark) push("C-TIME-18", `day ${mark.days} from the last swing, a date for a ${mark.expect}`, null, mark.expect === "high" ? "top" : "bottom");

  return out;
}

/** Whether the bar dated `iso` holds the year's high or low (the Square of 144's extreme). */
function extremeKind(bars: Bar[], iso: string): "low" | "high" | null {
  const b = bars.find((x) => x.t.slice(0, 10) === iso);
  if (!b) return null;
  const cutoff = Date.parse(bars[bars.length - 1].t) - 365 * DAY_MS;
  const year = bars.filter((x) => Date.parse(x.t) >= cutoff);
  if (year.every((x) => x.h <= b.h)) return "high";
  if (year.every((x) => x.l >= b.l)) return "low";
  return null;
}

const round = (x: number) => Math.round(x * 10) / 10;
