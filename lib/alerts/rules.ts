/**
 * GSPS — the alert editor's rules: which market field an alert watches, how it
 * compares, and the Gann levels a threshold can be taken from.
 *
 * Owner request, 2026-10-22: alerts patterned on a broker's alert editor (a
 * field such as Last, Bid, Ask or Mark, a trigger of <=, >=, < or >, and a
 * threshold), built our own way rather than copied. The chart's one draggable
 * line (migration 0077) stays: it is a Last alert whose side is read from
 * where the line sits, and it lives beside the editor's alerts, not in place
 * of them (`origin` "chart" against "editor", migration 0103).
 *
 * What Gann gives, and where it acts:
 * - Gann watched prices against levels he had worked out the night before and
 *   rested his orders there: stops "3 points under" a bottom, buying "at old
 *   tops" (*New Stock Trend Detector* p. 20; W006 Rule 3, pp. 46-47). So a
 *   threshold can be taken from the chart's own levels: the plan's Entry, SL,
 *   TP1 and MTP and the Gann angle and Square of Nine levels the chart draws
 *   (`levelSources`, from the chart's markers, the same numbers the plan uses).
 * - Even figures: orders go ¼ to ½ point inside an even figure, because markets
 *   turn just short of them (*Wall Street Stock Selector* Ch. V;
 *   `evenFigures.ts#shortOfFigure`, ⅜ of a Gann point). An alert set on a round
 *   number is therefore set ⅜ point short of it, or price can stop just before
 *   the figure and never trip it.
 * - The definite indication: a level counts once a close is 3 points beyond it
 *   (W006 p. 20, Rules 3(b)-(c) pp. 46-47; `pointScale.ts#beyondByThreePoints`).
 *   "Close 3 points beyond" turns a level into that alert: the field becomes the
 *   last completed session's close and the threshold the level ± 3 Gann points.
 * - The stepper moves the threshold an eighth of a Gann point at a time: Gann
 *   quoted and placed orders in eighths, scaled here by `pricePoint` as every
 *   other point in GSPS is (engineering choice, labelled).
 * Gann's time windows are not an alert source: a dated window shown to a member
 * needs its source and measured record linked first ("Forward-looking claims",
 * AGENTS.md), and the dated windows are backend only today.
 *
 * Fields: Vol Index, Sizzle and the volatility fields are options-feed figures
 * GSPS does not have on the free feed, so they are left out. Every field here
 * is read from one free snapshot (Alpaca, IEX feed for equities).
 *
 * Mandate. Gann: as cited, Tier A. Cycles: no periodicity claim, Dewey N/A.
 * Hermetic: Cause and Effect: an alert is the effect the member names in
 * advance for a cause (price at a level) they have already worked out, as Gann
 * worked out his levels before the session. Law of Creation: level ⊗ close;
 * neither alone is the definite indication, together they are.
 */

import { z } from "zod";
import { beyondByThreePoints, pricePoint } from "@/lib/gann/pointScale";
import { figuresAround, shortOfFigure } from "@/lib/gann/evenFigures";
import { priceText, priceUsd, roundPrice } from "@/lib/strat/priceText";

export const ALERT_FIELDS = [
  "last",
  "bid",
  "ask",
  "mark",
  "close",
  "net_change",
  "pct_change",
  "day_high",
  "day_low",
  "volume",
] as const;
export type AlertField = (typeof ALERT_FIELDS)[number];

export const ALERT_COMPARATORS = [">=", "<=", ">", "<"] as const;
export type AlertComparator = (typeof ALERT_COMPARATORS)[number];

export const FIELD_LABELS: Record<AlertField, string> = {
  last: "Last",
  bid: "Bid",
  ask: "Ask",
  mark: "Mark",
  close: "Close",
  net_change: "Net change",
  pct_change: "% change",
  day_high: "Day high",
  day_low: "Day low",
  volume: "Volume",
};

export const FIELD_HELP: Record<AlertField, string> = {
  last: "The last trade.",
  bid: "The best bid on the free IEX feed.",
  ask: "The best ask on the free IEX feed.",
  mark: "Halfway between the bid and the ask (the last trade when either is missing).",
  close: "The last completed session's close (IEX feed): a level counts once a session closes beyond it.",
  net_change: "Last trade against the prior session's close, in dollars.",
  pct_change: "Last trade against the prior session's close, in percent.",
  day_high: "Today's high so far on the free IEX feed: catches a touch between checks.",
  day_low: "Today's low so far on the free IEX feed: catches a touch between checks.",
  volume: "Shares traded today on the free IEX feed, a small part of all trading: set it from this figure, not a broker's.",
};

/** Fields measured in price, which can be drawn on the chart. */
export const PRICE_FIELDS: ReadonlySet<AlertField> = new Set(["last", "bid", "ask", "mark", "close", "day_high", "day_low"]);

/** One snapshot of the figures an alert can watch. Null when the feed has none. */
export interface AlertQuote {
  last: number | null;
  bid: number | null;
  ask: number | null;
  /** Today's daily bar so far; null before today's first trade. */
  dayHigh: number | null;
  dayLow: number | null;
  dayVolume: number | null;
  /** The last completed session's close. */
  completedClose: number | null;
  /** The close today's change is measured from (the prior session's). */
  changeFrom: number | null;
}

const positive = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;

/** The value a field reads from a snapshot, or null when it can't be read. */
export function readAlertField(field: AlertField, q: AlertQuote): number | null {
  switch (field) {
    case "last":
      return positive(q.last) ? q.last : null;
    case "bid":
      return positive(q.bid) ? q.bid : null;
    case "ask":
      return positive(q.ask) ? q.ask : null;
    case "mark":
      if (positive(q.bid) && positive(q.ask) && q.ask >= q.bid) return (q.bid + q.ask) / 2;
      return positive(q.last) ? q.last : null;
    case "close":
      return positive(q.completedClose) ? q.completedClose : null;
    case "net_change":
      return positive(q.last) && positive(q.changeFrom) ? q.last - q.changeFrom : null;
    case "pct_change":
      return positive(q.last) && positive(q.changeFrom) ? ((q.last - q.changeFrom) / q.changeFrom) * 100 : null;
    case "day_high":
      return positive(q.dayHigh) ? q.dayHigh : null;
    case "day_low":
      return positive(q.dayLow) ? q.dayLow : null;
    case "volume":
      return typeof q.dayVolume === "number" && Number.isFinite(q.dayVolume) && q.dayVolume >= 0 ? q.dayVolume : null;
  }
}

export function compareAlert(comparator: AlertComparator, value: number, threshold: number): boolean {
  switch (comparator) {
    case ">=":
      return value >= threshold;
    case "<=":
      return value <= threshold;
    case ">":
      return value > threshold;
    case "<":
      return value < threshold;
  }
}

/** True when the rule holds on this snapshot; false when it doesn't or can't be read. */
export function isAlertRuleFired(
  rule: { field: AlertField; comparator: AlertComparator; threshold: number },
  quote: AlertQuote,
): boolean {
  const value = readAlertField(rule.field, quote);
  if (value == null || !Number.isFinite(rule.threshold)) return false;
  return compareAlert(rule.comparator, value, rule.threshold);
}

/** The old row shape's side: rising to a threshold or falling to it. */
export function directionOf(comparator: AlertComparator): "above" | "below" {
  return comparator === ">=" || comparator === ">" ? "above" : "below";
}

/** A stored row's comparison; rows from before migration 0103 carry only a side. */
export function comparatorOf(row: { comparator?: AlertComparator | null; direction: "above" | "below" }): AlertComparator {
  return row.comparator ?? (row.direction === "above" ? ">=" : "<=");
}

/** Fields whose threshold may be zero or negative. */
const SIGNED_FIELDS: ReadonlySet<AlertField> = new Set(["net_change", "pct_change"]);

/** Why a threshold can't be used for a field, or null when it can. */
export function thresholdProblem(field: AlertField, threshold: number): string | null {
  if (!Number.isFinite(threshold)) return "Enter a number.";
  if (SIGNED_FIELDS.has(field)) return null;
  if (field === "volume") return threshold >= 0 ? null : "Volume can't be negative.";
  return threshold > 0 ? null : "A price has to be above zero.";
}

/**
 * How far one press of − or + moves the threshold: an eighth of a Gann point
 * at this price for price fields, at least a cent; a tenth of a percent for
 * % change; a thousand shares for volume.
 */
export function thresholdStep(field: AlertField, price: number): number {
  if (field === "pct_change") return 0.1;
  if (field === "volume") return 1000;
  // Net change steps by the stock's price, like every other price figure.
  const ref = Number.isFinite(price) && Math.abs(price) > 0 ? Math.abs(price) : 1;
  const step = pricePoint(ref) / 8;
  return Math.max(0.01, Math.round(step * 100) / 100);
}

/** A threshold rounded to what the field is quoted in. */
export function roundThreshold(field: AlertField, value: number): number {
  if (field === "volume") return Math.round(value);
  if (field === "pct_change") return Math.round(value * 100) / 100;
  return roundPrice(value);
}

/** "SPY Bid >= 47.73" */
export function describeAlertRule(rule: {
  symbol: string;
  field: AlertField;
  comparator: AlertComparator;
  threshold: number;
}): string {
  return `${rule.symbol} ${FIELD_LABELS[rule.field]} ${rule.comparator} ${formatThreshold(rule.field, rule.threshold)}`;
}

export function formatThreshold(field: AlertField, value: number): string {
  if (field === "volume") return Math.round(value).toLocaleString("en-US");
  if (field === "pct_change") return `${value.toFixed(2)}%`;
  if (field === "net_change") return `${value < 0 ? "-" : value > 0 ? "+" : ""}${priceUsd(Math.abs(value))}`;
  return priceUsd(value);
}

/** A level on the chart the editor can take a threshold from. */
export interface ChartLevel {
  price: number;
  label: string;
}

export interface LevelSource {
  /** Stable id for the picker. */
  id: string;
  label: string;
  /** The level itself. */
  level: number;
  /** Where the alert goes for it on a trade-by-trade price field. */
  threshold: number;
  /** The side price reaches it from. */
  comparator: AlertComparator;
  /** Why the threshold is not the level itself, when it isn't. */
  note?: string;
}

/**
 * The levels a threshold can come from: the chart's own (plan and Gann lines),
 * then the nearest even figures above and below, each set ⅜ point short of the
 * figure (Gann's order inside an even figure). The side is read from where the
 * level sits against the price now: above it, the alert waits for price to
 * rise to it; below, to fall to it.
 */
export function levelSources(price: number, chartLevels: ChartLevel[]): LevelSource[] {
  if (!positive(price)) return [];
  const out: LevelSource[] = [];
  const seen = new Set<string>();
  for (const m of chartLevels) {
    if (!positive(m.price)) continue;
    const id = `chart:${m.label}:${m.price}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const comparator: AlertComparator = m.price >= price ? ">=" : "<=";
    out.push({ id, label: m.label, level: m.price, threshold: m.price, comparator });
  }
  const { above, below } = figuresAround(price);
  if (above) {
    out.push({
      id: `figure:above:${above.price}`,
      label: `Round number ${priceText(above.price)} above`,
      level: above.price,
      threshold: roundThreshold("last", shortOfFigure(above.price, "below")),
      comparator: ">=",
      note: "Set ⅜ point under the round number: markets turn just short of them.",
    });
  }
  if (below) {
    out.push({
      id: `figure:below:${below.price}`,
      label: `Round number ${priceText(below.price)} below`,
      level: below.price,
      threshold: roundThreshold("last", shortOfFigure(below.price, "above")),
      comparator: "<=",
      note: "Set ⅜ point over the round number: markets turn just short of them.",
    });
  }
  return out;
}

/**
 * Gann's definite indication for a level: a close 3 points beyond it, on the
 * side the alert waits for (W006 p. 20, Rules 3(b)-(c)).
 */
export function closeBeyondThreshold(level: number, comparator: AlertComparator): number {
  return roundThreshold("close", beyondByThreePoints(level, directionOf(comparator) === "above" ? 1 : -1));
}

export const ALERT_NOTE_MAX = 140;
/** A ticker or a crypto pair: letters, digits, ".", "/" and "-", up to 20. */
export const ALERT_SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9./-]{0,19}$/;

/**
 * When a "day" alert lapses: the next 4 PM ET close, or for a Close alert two
 * hours after it, so the checks after the bell read that day's close before
 * the alert goes (a Close alert set for the day is about today's close).
 */
export function dayExpiry(field: AlertField, close: Date): Date {
  return field === "close" ? new Date(close.getTime() + 2 * 3600_000) : close;
}
export const ALERT_EXPIRIES = ["gtc", "day"] as const;
export type AlertExpiry = (typeof ALERT_EXPIRIES)[number];

/** The body the editor posts. */
export const EditorAlertSchema = z.object({
  symbol: z.string().trim().toUpperCase().regex(ALERT_SYMBOL_PATTERN),
  field: z.enum(ALERT_FIELDS),
  comparator: z.enum(ALERT_COMPARATORS),
  threshold: z.number(),
  levelSource: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(ALERT_NOTE_MAX).nullable().optional(),
  expiry: z.enum(ALERT_EXPIRIES).default("gtc"),
});
export type EditorAlertInput = z.infer<typeof EditorAlertSchema>;

/** A stored alert, as the API returns it. */
export interface StoredAlert {
  id: string;
  symbol: string;
  field: AlertField;
  /** Null on a chart row written before migration 0103: read it with `comparatorOf`. */
  comparator: AlertComparator | null;
  target_price: number;
  direction: "above" | "below";
  origin: "chart" | "editor";
  level_source: string | null;
  note: string | null;
  expires_at: string | null;
  triggered: boolean;
  triggered_at: string | null;
  triggered_value: number | null;
  created_at: string;
}
