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
 * two days, the astro readings' one day, Jensen's dates within two days); the
 * windows are read on the bars through the turn only, so nothing after it
 * decides.
 *
 * Three-question basis:
 * 1. Gann: as cited, class A. Jensen's and the planetary readings are the
 *    owner's 2026-10-16 decisions to let them act through this mechanism.
 * 2. Cycles: these are recurrent-event claims. The F4 calendar test found no
 *    window set beating random placement on 2019-2025, and the base-rate
 *    harness (`lib/research/timeWindowBaseRate.ts`) scores the families. This
 *    hold is measured on the replay before any claim is made of it; Dewey's
 *    items (repetition against a base rate, persistence out of sample) are not
 *    cleared.
 * 3. Hermetic: Rhythm and Cause and Effect: time is the cause that ripens a
 *    change of trend, and price is its effect showing; neither is read alone.
 *    Polarity: a bottom for a long, a top for a short.
 */
import type { Bar, SetupKind } from "@/lib/types";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import { timeCycles } from "@/lib/gann/timeCycles";
import { jensenWindows } from "@/lib/gann/jensen";
import { readAstroRules } from "@/lib/gann/astroRules";
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

/** The windows open on `date` for a turn of `kind`, read on `bars` (which end at the turn). */
export type WindowsAt = (bars: Bar[], date: string, kind: "bottom" | "top") => string[];

const DAY_MS = 86_400_000;

/** Every dated reading open on the turn's date, polarity respected where the source has one. */
export const timeWindowsAt: WindowsAt = (bars, date, kind) => {
  const asOf = new Date(`${date}T12:00:00Z`);
  const low = kind === "bottom";
  const out: string[] = [];
  const cycles = timeCycles(bars, asOf);
  if (low ? cycles.bullishActive : cycles.bearishActive) out.push(`a time window from a major ${low ? "low" : "high"}`);
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
  return out;
};

/**
 * The turn the trade's stop sits behind, when a dated window was open on it.
 * Null when there is no such extreme yet or no window was open on its date.
 */
export function readWindowTurn(
  daily: Bar[],
  direction: "bullish" | "bearish",
  windowsAt: WindowsAt = timeWindowsAt,
): WindowTurn | null {
  const kind = direction === "bullish" ? "bottom" : "top";
  const pivot = [...walkSwingChart(daily, THREE_DAY_CHART).pivots].reverse().find((p) => p.kind === kind);
  if (!pivot) return null;
  const through = daily.slice(0, pivot.index + 1);
  const date = daily[pivot.index].t.slice(0, 10);
  const windows = windowsAt(through, date, kind);
  return windows.length > 0 ? { kind, date, price: pivot.price, windows } : null;
}

/** Whether a setup of this kind needs a window turn to act (A-TIME-15 with HTMPC p.56): counter-trend only. */
export function needsWindowTurn(setupKind: SetupKind): boolean {
  return setupKind === "reversion";
}
