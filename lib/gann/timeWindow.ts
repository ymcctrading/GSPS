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
 * Gann's time counts that were read as context only (`countWindows.ts`: the
 * seasonal sixteenths, the winter-quarter dates, the Ch.5 wheel, the week
 * counts, the Square of 52, time balance, the 11¼ market days, price read as
 * time, the square of 90, the year fractions from the low and the high, the
 * other lessons' cycles, the Square of 144 in time and the 7th/14th/21st
 * day) open windows here too since 2026-10-27, on the owner's 2026-10-01
 * decision that every Gann method acts. A count from a pivot opens for a
 * bottom and a top alike; a turn the source names is held to it. Measured
 * before wiring (2026-10-27, 942 3-Day Chart turns on 80 random walks at
 * $20 and $150, no monthly bars or anchors): the hold was already open on
 * every turn (the yearly and day counts 90%, the Square of Nine's and the
 * Hexagon's time counts 99% each), and these counts alone on 98%, so on
 * those walks adding them moves no verdict. The hold selects nothing a
 * random turn would not meet; held for the owner with P7's saturation
 * (2026-10-20). The counts cost about 0.7 ms on a 400-session walk, read
 * only when a counter-trend Execute needs a window.
 *
 * Price at the turn (2026-10-28, alignment audit H2): the turn counts only
 * when its extreme also stood at the half or three quarters of a major range
 * (`turnAtDivision`). Gann reads time and price together: "when Time and
 * Space balance, the stock makes top or bottom" (Master Course PDF 202), and
 * the time counts mark a change "especially if the price is at 1/2 or 3/4
 * resistance" (Ch. 18, TP-2, PDF 440); TP-3 (PDF 441) lists the price
 * resistance levels among the indications beside the time counts. With the
 * windows open on nearly every turn (above), time alone selected nothing.
 * TP-2's "especially" is an emphasis, not a stated requirement; requiring the
 * division is GSPS's reading of it (labelled), since time alone selected
 * nothing. The time counts here (Jensen's, Mars's half return) still count
 * from the daily year's extremes: a count in days needs the low's day, which a
 * monthly bar does not hold (a stated exception to the levels' major lows).
 * Engineering choices, labelled: the ranges are `rangeDivisions.ts`'s (the
 * extreme range, the highest price, the latest campaign), read on the record
 * before the turn only; 3/4 is read up from the low and down from the high
 * (so 1/4 of the range too), as he measures "up from lows" and "down from
 * highs"; "at" is his 3-point allowance at the division. Random walks (80
 * walks, about 2,100 turns a price, 2026-10-28): the turn stood at one on 82%
 * of turns at $20, 68% at $50, 54% at $150 and 35% at $500, looser at low
 * prices with the allowance itself.
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
import { countWindowsAt, fewRepetitionNote } from "@/lib/gann/countWindows";
import { majorRangeDivisions } from "@/lib/gann/rangeDivisions";
import { levelBandPct } from "@/lib/scoring/proximity";

export interface WindowTurn {
  kind: "bottom" | "top";
  /** YYYY-MM-DD of the turn's extreme. */
  date: string;
  price: number;
  /** The windows open on that date, in plain words. */
  windows: string[];
  /** The range division the turn's extreme stood at (`turnAtDivision`). */
  priceLevel: string;
}

/** The divisions a turn counts at: 1/2, and 3/4 read up from the low and down from the high. */
const TURN_DIVISIONS = new Set(["1/4", "1/2", "3/4"]);

/**
 * Reads whether the turn's extreme `price` stood at the half or three quarters
 * of a major range, read on the record before the turn only (`through`, the
 * daily bars through the turn; `monthlyThrough`, the months closed before its
 * month). Returns the division's label, or null.
 */
export type PriceAtTurn = (through: Bar[], monthlyThrough: Bar[] | null, price: number) => string | null;

export const turnAtDivision: PriceAtTurn = (through, monthlyThrough, price) => {
  if (!(price > 0)) return null;
  const monthly = monthlyThrough ?? [];
  let best: { label: string; d: number } | null = null;
  for (const l of majorRangeDivisions([...monthly, ...through], monthly)) {
    if (!TURN_DIVISIONS.has(l.label.split(" ")[0])) continue;
    const d = (Math.abs(price - l.price) / price) * 100;
    if (d <= levelBandPct(l.price) && (!best || d < best.d)) best = { label: l.label, d };
  }
  return best?.label ?? null;
};

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

/** Every dated reading open on the turn's date, polarity respected where the source has one (Jensen's expected direction, the eclipse's top). */
export const timeWindowsAt: WindowsAt = (bars, date, kind, monthly, anchors) => {
  const asOf = new Date(`${date}T12:00:00Z`);
  const low = kind === "bottom";
  const out: string[] = [];
  const cycles = timeCycles(bars, asOf);
  // Gann watches for a change in trend 1, 2 and 3 years, and his day counts,
  // "from any important top or bottom" (W006 pp. 14, 44; 45 Years Rule 8), so
  // a count from a high opens the window for a bottom as well as a top, and
  // the reverse (recheck 2026-10-22, A-TIME-04/11/24/37). Until then only a
  // count from a pivot of the turn's own kind opened it, a polarity his text
  // does not give.
  if (cycles.active) out.push("a time window from a major top or bottom");
  // The yearly counts (A-TIME-11's 20 years among them) from the monthly
  // chart's major pivots: the daily year cannot reach them.
  for (const h of yearCycleHits(monthly ?? [], asOf)) {
    out.push(`${h.years} year${h.years === 1 ? "" : "s"} from the ${h.pivotMonth} major ${h.kind}${fewRepetitionNote(h.years)}`);
  }
  // The great cycles the yearly list lacks (A-TIME-24), from the same pivots.
  for (const h of greatCycleHits(monthly ?? [], asOf)) {
    out.push(`the end of a ${h.cycle.label} great cycle from the ${h.pivotMonth} major ${h.kind}`);
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
  // The counts that were context only (`countWindows.ts`, recheck 2026-10-22).
  // A count from a pivot opens for a bottom and a top alike, as above; only a
  // turn the source itself names (the time balance's, the 7th/14th/21st day's)
  // is held to it.
  for (const w of countWindowsAt(bars, date, monthly, anchors)) {
    if (w.turn && w.turn !== kind) continue;
    out.push(w.label);
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
  /** Price at the turn; both surfaces take the default (`turnAtDivision`). */
  priceAt: PriceAtTurn = turnAtDivision,
): WindowTurn | null {
  const kind = direction === "bullish" ? "bottom" : "top";
  const pivot = [...walkSwingChart(daily, THREE_DAY_CHART).pivots].reverse().find((p) => p.kind === kind);
  if (!pivot) return null;
  const through = daily.slice(0, pivot.index + 1);
  const date = daily[pivot.index].t.slice(0, 10);
  const monthlyThrough = monthly ? monthly.filter((b) => b.t.slice(0, 7) < date.slice(0, 7)) : null;
  const windows = windowsAt(through, date, kind, monthlyThrough, anchors);
  if (windows.length === 0) return null;
  const priceLevel = priceAt(through, monthlyThrough, pivot.price);
  return priceLevel ? { kind, date, price: pivot.price, windows, priceLevel } : null;
}

/** Whether a setup of this kind needs a window turn to act (A-TIME-15 with HTMPC p.56): counter-trend only. */
export function needsWindowTurn(setupKind: SetupKind): boolean {
  return setupKind === "reversion";
}
