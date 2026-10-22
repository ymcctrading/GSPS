/**
 * The shared time-window mechanism (Q19, owner 2026-10-16: "Window"). Every
 * dated reading GSPS makes (Gann's pivot windows, his time counts, Jensen's
 * dates and the planetary time readings) meets price here, at one rule: a
 * window acts only when the market turns on it.
 *
 * - A-TIME-15 (W036 p.22, class A): "trade the dates, not the price": when the
 *   market turns close to a forecast date, buy or sell. Gann's only act-verb
 *   on dates.
 * - C-STOP-03: time alone is not enough; the turn is confirmed by price.
 * - HTMPC p.56: "not until sufficient time has expired does any big move
 *   start", so a change of trend comes at time.
 *
 * How it acts: the turn is the 3-Day Chart's latest completed extreme against
 * the trade (a bottom for a long, a top for a short), the extreme the plan's
 * stop sits behind. It counts when any dated window was open on that extreme's
 * own date. The price signal is the plan's own entry, the crossing of the old
 * top after that bottom (`entryTrigger.ts`), so a date never trades alone
 * (option "Trade" was not chosen). `applyTimeWindowHold` (`score.ts`) holds a
 * counter-trend (reversion) Execute to Watch without such a turn; a
 * with-the-trend setup acts on price, as Gann's buying points do.
 *
 * Engineering choices, labelled: the orb is each source's own (`timeCycles`'
 * two days, the astro readings' and the eclipse crossings' one day, Jensen's dates within two days, the
 * yearly counts' exact month); the windows are read on the bars through the
 * turn only, and the monthly chart on months closed before the turn's month,
 * so nothing after it decides.
 *
 * The yearly counts (`MAJOR_CYCLE_YEARS`, A-TIME-11's 20 years among them)
 * open a window from the monthly chart's major pivots (`yearCycleHits`), added
 * 2026-10-16 on the owner's decision that the 20-year count acts here: the
 * scans' year of daily bars holds no anchor old enough for them.
 *
 * The company's own counts (added 2026-10-21, `inceptionWindows`): the end
 * of a great time cycle (A-TIME-24, `timeCycles.ts#GREAT_CYCLES`) and the
 * name's numbers in years (A-OTHER-08, `nameNumerology.ts`), both counted
 * from the stored inception date, open a window in the month they complete.
 * The great cycles also count from the monthly chart's major pivots
 * (`greatCycleHits`). An inception known only to the year opens none: a
 * year-long window would say nothing. Neither has a polarity in Gann's text
 * (Steel's February turns went both ways), so they open for a bottom and a
 * top alike.
 *
 * Three-question basis:
 * 1. Gann: as cited, class A. Jensen's and the planetary readings are the
 *    owner's 2026-10-16 decisions to let them act through this mechanism.
 * 2. Cycles: these are recurrent-event claims. The F4 calendar test found no
 *    window set beating random placement on 2019-2025, and the base-rate
 *    harness (`lib/research/timeWindowBaseRate.ts`) scores the families; on
 *    its run 47 the wheel family hit at its base rate, and that harness's own
 *    reading rule says no hold may rest on a family that does not beat it.
 *    The owner's Q19 answer, on Gann's A-TIME-15, overrides that rule here;
 *    the replay measures the hold before any claim is made of it. Dewey's
 *    items (repetition against a base rate, persistence out of sample) are
 *    not cleared.
 * 3. Hermetic: Rhythm and Cause and Effect: time is the cause that ripens a
 *    change of trend, and price is its effect showing; neither is read alone.
 *    Polarity: a bottom for a long, a top for a short.
 */
import type { Bar, SetupKind } from "@/lib/types";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import { GREAT_CYCLES, greatCycleEndMonth, greatCycleHits, timeCycles, yearCycleHits } from "@/lib/gann/timeCycles";
import type { Inception } from "@/lib/gann/incorporationCycle";
import { isNameNumber, nameSquare } from "@/lib/gann/nameNumerology";
import { jensenWindows } from "@/lib/gann/jensen";
import { readAstroRules } from "@/lib/gann/astroRules";
import { eclipseBreakOn } from "@/lib/gann/eclipseLongitude";
import { firstTradeWindows } from "@/lib/gann/firstTradeChart";
import { readSquareOfNineTime } from "@/lib/gann/squareOfNineTime";
import { readHexagonTime } from "@/lib/gann/hexagonTime";
import { readMasterChartTime } from "@/lib/gann/masterChartTime";
import { gannPointForBars } from "@/lib/gann/pointScale";

export interface WindowTurn {
  kind: "bottom" | "top";
  /** YYYY-MM-DD of the turn's extreme. */
  date: string;
  price: number;
  /** The windows open on that date, in plain words. */
  windows: string[];
}

/**
 * The windows open on `date` for a turn of `kind`, read on `bars` (which end at
 * the turn) and on the monthly chart closed before the turn's month, when held.
 */
export type WindowsAt = (
  bars: Bar[],
  date: string,
  kind: "bottom" | "top",
  monthly?: Bar[] | null,
  anchors?: WindowAnchors | null,
) => string[];

/** The company's own count origins, from the stored reference (`lib/data/instrumentReference.ts`). */
export interface WindowAnchors {
  inception: Inception | null;
  /** The stored company name, for its name chart. */
  name: string | null;
  /** The stock's confirmed first-trade date (`firstTradeDates.ts`), for C-ASTRO-09. */
  firstTrade?: string | null;
}

/**
 * The windows the company's inception opens in `asOf`'s month: the end of a
 * great time cycle (A-TIME-24) and the name's numbers counted in years
 * (A-OTHER-08). Day or month precision only.
 */
export function inceptionWindows(anchors: WindowAnchors | null | undefined, asOf: Date): string[] {
  const inception = anchors?.inception;
  if (!inception || inception.precision === "year") return [];
  const birthMonth = inception.date.slice(0, 7);
  const month = asOf.toISOString().slice(0, 7);
  if (!(birthMonth < month)) return [];
  const out: string[] = [];
  const anchor = inception.precision === "day" ? inception.date.slice(0, 10) : birthMonth;
  for (const cycle of GREAT_CYCLES) {
    if (greatCycleEndMonth(anchor, cycle) === month) {
      out.push(`the end of a ${cycle.label} great cycle from the company's ${birthMonth} inception`);
    }
  }
  const sq = nameSquare(anchors?.name);
  if (sq) {
    const ageMonths =
      asOf.getUTCFullYear() * 12 + asOf.getUTCMonth() - (Number(birthMonth.slice(0, 4)) * 12 + Number(birthMonth.slice(5, 7)) - 1);
    if (isNameNumber(sq, ageMonths / 12)) {
      out.push(`${ageMonths / 12} years from the company's ${birthMonth} inception, a number of its ${sq.letters}-letter name`);
    }
  }
  return out;
}

const DAY_MS = 86_400_000;

/** Every dated reading open on the turn's date, polarity respected where the source has one. */
export const timeWindowsAt: WindowsAt = (bars, date, kind, monthly, anchors) => {
  const asOf = new Date(`${date}T12:00:00Z`);
  const low = kind === "bottom";
  const out: string[] = [];
  const cycles = timeCycles(bars, asOf);
  if (low ? cycles.bullishActive : cycles.bearishActive) out.push(`a time window from a major ${low ? "low" : "high"}`);
  // The yearly counts (A-TIME-11's 20 years among them) from the monthly
  // chart's major pivots: the daily year cannot reach them.
  for (const h of yearCycleHits(monthly ?? [], asOf)) {
    if (h.kind === (low ? "low" : "high")) out.push(`${h.years} year${h.years === 1 ? "" : "s"} from the ${h.pivotMonth} major ${h.kind}`);
  }
  // The great cycles the yearly list lacks (A-TIME-24), from the same pivots.
  for (const h of greatCycleHits(monthly ?? [], asOf)) {
    if (h.kind === (low ? "low" : "high")) out.push(`the end of a ${h.cycle.label} great cycle from the ${h.pivotMonth} major ${h.kind}`);
  }
  // The company's own counts: great cycles and the name's numbers from its inception.
  out.push(...inceptionWindows(anchors, asOf));
  if (cycles.fixedCalendarActive) out.push("a fixed seasonal date");
  // Gann's time counts from the extreme high and low, landing on the turn.
  for (const h of readSquareOfNineTime(bars)) out.push(`${Math.round(h.count)} ${h.unit} from the ${h.pivotDate} ${h.pivot}, a squared time count`);
  for (const h of readHexagonTime(bars)) out.push(`${Math.round(h.count)} ${h.unit} from the ${h.pivotDate} ${h.pivot} on the Hexagon`);
  for (const h of readMasterChartTime(bars)) out.push(`${Math.round(h.count)} ${h.unit} from the ${h.pivotDate} ${h.pivot} on the Master Chart`);
  const unit = gannPointForBars(bars);
  for (const w of jensenWindows(bars, unit, new Date(asOf.getTime() - 2 * DAY_MS), new Date(asOf.getTime() + 2 * DAY_MS))) {
    if (w.source === "projection") continue; // a price, read as a level elsewhere
    if (w.expect === (low ? "decline" : "advance")) continue;
    out.push(w.label);
  }
  const astro = readAstroRules(bars, asOf, unit);
  if (astro) {
    if (astro.marsHalfReturn?.today) out.push("Mars opposite its place at the major low");
    if (astro.solarPoint) out.push(`the Sun at ${astro.solarPoint.degree}°`);
    if (astro.newMoon) out.push("a New Moon");
    if (astro.lunarReturn) out.push("the Moon back at its place at the last swing");
    if (astro.naturalAngle.near) out.push("the Sun at the price's degree");
  }
  // M-S4: a fast planet crossing a topping eclipse's longitude dates the break.
  if (!low) {
    for (const { eclipse, crossing } of eclipseBreakOn(bars, date)) {
      out.push(`${crossing.planet} crossing the ${eclipse.peak.slice(0, 10)} ${eclipse.kind} eclipse's longitude`);
    }
  }
  // C-ASTRO-09: a transit to the first-trade chart, chosen on the swings before the turn.
  for (const w of firstTradeWindows(bars, date, anchors?.firstTrade ?? null)) {
    out.push(`${w.combo.transit} at ${w.combo.angle}° to the first-trade ${w.combo.natal} on ${w.exact}`);
  }
  return out;
};

/**
 * The turn the trade's stop sits behind, when a dated window was open on it.
 * Null when there is no such extreme yet or no window was open on its date.
 */
export function readWindowTurn(
  daily: Bar[],
  direction: "bullish" | "bearish",
  /**
   * The monthly chart, for the yearly counts (A-TIME-11). The live scan and
   * the replay both pass their level charts' monthly bars; only months closed
   * before the turn's month are read.
   */
  monthly: Bar[] | null = null,
  windowsAt: WindowsAt = timeWindowsAt,
  /** The company's inception and name (A-TIME-24, A-OTHER-08) and its confirmed first trade (C-ASTRO-09); both surfaces pass the stored reference. */
  anchors: WindowAnchors | null = null,
): WindowTurn | null {
  const kind = direction === "bullish" ? "bottom" : "top";
  const pivot = [...walkSwingChart(daily, THREE_DAY_CHART).pivots].reverse().find((p) => p.kind === kind);
  if (!pivot) return null;
  const through = daily.slice(0, pivot.index + 1);
  const date = daily[pivot.index].t.slice(0, 10);
  const monthlyThrough = monthly ? monthly.filter((b) => b.t.slice(0, 7) < date.slice(0, 7)) : null;
  const windows = windowsAt(through, date, kind, monthlyThrough, anchors);
  return windows.length > 0 ? { kind, date, price: pivot.price, windows } : null;
}

/** Whether a setup of this kind needs a window turn to act (A-TIME-15 with HTMPC p.56): counter-trend only. */
export function needsWindowTurn(setupKind: SetupKind): boolean {
  return setupKind === "reversion";
}
