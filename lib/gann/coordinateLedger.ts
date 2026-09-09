/**
 * Gann coordinate ledger — prior Day/Week/Month high-low plus their
 * range-fraction (eighths) subdivisions, as a single unified structure.
 *
 * Blueprint §8's candidate-coordinates list names "prior D/W/M high-low" and
 * "range fractions" separately; GSPS already had Square-of-9 (`squareOf9.ts`),
 * fan lines (`fans.ts`), and time cycles (`timeCycles.ts`) but nothing
 * computed the prior-period range coordinates at all. This module builds
 * them from daily bars only (no separate weekly/monthly bar feed exists in
 * this codebase) by grouping daily bars into calendar day/week/month buckets
 * and reading the high/low of the most recently *completed* bucket — never
 * the bucket the latest bar still belongs to, which is still in progress and
 * not yet a fixed coordinate.
 *
 * "Range fractions" here means the classic Gann eighths division of a range
 * (1/8, 1/4, 3/8, 1/2, 5/8, 3/4, 7/8) — a distinct, coarser convention from
 * Fibonacci retracement ratios, which this module does not compute.
 *
 * Context/confluence only, same as every other file in `lib/gann/`: this
 * never gates a trade or overrides a direction, only offers coordinates a
 * caller can check price proximity against.
 */

import { levelRole, type LevelRole } from "@/lib/analysis/levelRole";
import type { Bar } from "@/lib/types";

export type CoordinatePeriod = "day" | "week" | "month";

export interface PriorPeriodRange {
  period: CoordinatePeriod;
  high: number;
  low: number;
  /** ISO timestamp of the first bar composing this completed period. */
  startTimestamp: string;
  /** ISO timestamp of the last bar composing this completed period. */
  endTimestamp: string;
}

export interface RangeFractionLevel {
  /** 0 = low, 1 = high, in eighths between. */
  fraction: number;
  price: number;
  distancePct: number;
  role: LevelRole;
}

export interface CoordinateLedgerEntry {
  range: PriorPeriodRange;
  fractions: RangeFractionLevel[];
}

export interface CoordinateLedger {
  day: CoordinateLedgerEntry | null;
  week: CoordinateLedgerEntry | null;
  month: CoordinateLedgerEntry | null;
}

/** Classic Gann eighths, interior points only — 0 and 1 duplicate the range's own high/low. */
const RANGE_FRACTIONS = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** ISO week key (year + ISO week number), so week boundaries match the Monday-start convention Gann literature and most charting platforms use. */
function weekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function groupByKey(bars: Bar[], keyFn: (date: Date) => string): { key: string; bars: Bar[] }[] {
  const order: string[] = [];
  const groups = new Map<string, Bar[]>();
  for (const bar of bars) {
    const key = keyFn(new Date(bar.t));
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
      order.push(key);
    }
    group.push(bar);
  }
  return order.map((key) => ({ key, bars: groups.get(key)! }));
}

/**
 * The most recently *completed* period's high/low — the group immediately
 * before the one the latest bar belongs to. Null when fewer than two
 * distinct periods exist yet (nothing prior to compare against).
 */
export function priorPeriodRange(dailyBars: Bar[], period: CoordinatePeriod): PriorPeriodRange | null {
  if (dailyBars.length < 2) return null;
  const keyFn = period === "day" ? dayKey : period === "week" ? weekKey : monthKey;
  const groups = groupByKey(dailyBars, keyFn);
  if (groups.length < 2) return null;

  const prior = groups[groups.length - 2].bars;
  return {
    period,
    high: Math.max(...prior.map((b) => b.h)),
    low: Math.min(...prior.map((b) => b.l)),
    startTimestamp: prior[0].t,
    endTimestamp: prior[prior.length - 1].t,
  };
}

/** Eighths of `[low, high]`, with role/distance read against `currentPrice`. */
export function rangeFractionLevels(range: PriorPeriodRange, currentPrice: number): RangeFractionLevel[] {
  const span = range.high - range.low;
  if (span <= 0 || currentPrice <= 0) return [];
  return RANGE_FRACTIONS.map((fraction) => {
    const price = range.low + fraction * span;
    return {
      fraction,
      price,
      distancePct: (Math.abs(currentPrice - price) / currentPrice) * 100,
      role: levelRole(currentPrice, price),
    };
  });
}

/** Builds the full prior D/W/M ledger from daily bars. A period is `null` when there isn't yet a completed prior bucket for it (e.g. under a week of history). */
export function buildCoordinateLedger(dailyBars: Bar[], currentPrice: number): CoordinateLedger {
  const entryFor = (period: CoordinatePeriod): CoordinateLedgerEntry | null => {
    const range = priorPeriodRange(dailyBars, period);
    if (!range) return null;
    return { range, fractions: rangeFractionLevels(range, currentPrice) };
  };

  return {
    day: entryFor("day"),
    week: entryFor("week"),
    month: entryFor("month"),
  };
}

export interface NearestLedgerLevel {
  period: CoordinatePeriod;
  /** `null` for the range's own high/low endpoints, set for an interior eighths fraction. */
  fraction: number | null;
  price: number;
  distancePct: number;
  role: LevelRole;
}

/** Nearest coordinate across every period's high/low and fraction levels, within `proximityPct` of `currentPrice`. */
export function nearestLedgerLevel(
  ledger: CoordinateLedger,
  currentPrice: number,
  proximityPct = 1.0,
): NearestLedgerLevel | null {
  if (currentPrice <= 0) return null;
  const distancePct = (price: number) => (Math.abs(currentPrice - price) / currentPrice) * 100;
  const candidates: NearestLedgerLevel[] = [];

  for (const period of ["day", "week", "month"] as const) {
    const entry = ledger[period];
    if (!entry) continue;
    const { range, fractions } = entry;
    candidates.push({
      period,
      fraction: null,
      price: range.high,
      distancePct: distancePct(range.high),
      role: levelRole(currentPrice, range.high),
    });
    candidates.push({
      period,
      fraction: null,
      price: range.low,
      distancePct: distancePct(range.low),
      role: levelRole(currentPrice, range.low),
    });
    for (const level of fractions) {
      candidates.push({ period, fraction: level.fraction, price: level.price, distancePct: level.distancePct, role: level.role });
    }
  }

  candidates.sort((a, b) => a.distancePct - b.distancePct);
  const nearest = candidates[0];
  return nearest && nearest.distancePct <= proximityPct ? nearest : null;
}
