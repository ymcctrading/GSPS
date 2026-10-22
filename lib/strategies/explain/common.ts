/**
 * Shared pieces of the explain-the-math readings (see ./types.ts). Two
 * readings cover every technique: a line indicator compares a plan level with
 * the line's current value, and an oscillator appends one hypothetical bar
 * closing at the level and reports the value it would read there.
 */

import type { Bar } from "@/lib/types";
import { atr } from "../math";
import type {
  PlanInput,
  PlanLevelKey,
  PlanLevelReading,
  PlanReading,
} from "./types";
import type { StrategyDirection } from "../types";

export const PLAN_LEVEL_KEYS: readonly PlanLevelKey[] = [
  "entry",
  "stopLoss",
  "takeProfit1",
  "masterTarget",
];

export const PLAN_LEVEL_NAMES: Record<PlanLevelKey, string> = {
  entry: "Entry",
  stopLoss: "Stop",
  takeProfit1: "TP1",
  masterTarget: "MTP",
};

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function money(n: number): string {
  return `$${roundCents(n).toFixed(2)}`;
}

export function fixed(n: number, digits = 1): string {
  return n.toFixed(digits);
}

/** Bars plus one more that closes at `price`, opening at the last close. */
export function withHypotheticalClose(bars: Bar[], price: number): Bar[] {
  const last = bars[bars.length - 1];
  return [
    ...bars,
    {
      t: last.t,
      o: last.c,
      h: Math.max(last.c, price),
      l: Math.min(last.c, price),
      c: price,
      v: 0,
    },
  ];
}

export function latestAtr(bars: Bar[]): number | null {
  const series = atr(bars, 14);
  const v = series[series.length - 1];
  return v != null && v > 0 ? v : null;
}

/** "2.4% (1.3 ATR) above" — the distance of `price` from `ref`. */
export function distanceWords(
  price: number,
  ref: number,
  atrValue: number | null,
): string {
  if (roundCents(price) === roundCents(ref)) return "at";
  const pct = (Math.abs(price - ref) / ref) * 100;
  const side = price > ref ? "above" : "below";
  const atrPart = atrValue
    ? ` (${fixed(Math.abs(price - ref) / atrValue)} ATR)`
    : "";
  return `${fixed(pct)}%${atrPart} ${side}`;
}

/** `lean` is the direction the technique currently points, or null when neutral. */
export function agreement(
  lean: StrategyDirection | null,
  plan: PlanInput,
): boolean | null {
  return lean == null ? null : lean === plan.direction;
}

export function summaryLine(
  label: string,
  state: string,
  agrees: boolean | null,
  lean: StrategyDirection | null,
): string {
  if (agrees === true)
    return `${state} ${label} leans ${lean}, the same way as GSPS's plan.`;
  if (agrees === false)
    return `${state} ${label} leans ${lean}, against GSPS's plan.`;
  return `${state} ${label} has no clear lean right now.`;
}

export function readEachLevel(
  plan: PlanInput,
  describe: (price: number, key: PlanLevelKey) => string,
): PlanLevelReading[] {
  return PLAN_LEVEL_KEYS.flatMap((key) => {
    const price = plan[key];
    if (price == null) return [];
    return [
      {
        level: key,
        price: roundCents(price),
        text: `${PLAN_LEVEL_NAMES[key]} ${money(price)}: ${describe(price, key)}`,
      },
    ];
  });
}

export function reading(
  source: string,
  label: string,
  state: string,
  lean: StrategyDirection | null,
  plan: PlanInput,
  levels: PlanLevelReading[],
): PlanReading {
  const agrees = agreement(lean, plan);
  return {
    source,
    label,
    agrees,
    summary: summaryLine(label, state, agrees, lean),
    levels,
  };
}
