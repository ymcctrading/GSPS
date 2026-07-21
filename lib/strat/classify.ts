import type { Bar, StratState } from "@/lib/types";

/**
 * Sara Sniper Strat bar states:
 *  1  — inside bar (fully consumed by previous range)
 *  2U — directional up (breaks previous high only)
 *  2D — directional down (breaks previous low only)
 *  3  — outside bar (breaks both)
 */
export function classifyBar(prev: Bar, current: Bar): StratState {
  const brokeHigh = current.h > prev.h;
  const brokeLow = current.l < prev.l;
  if (brokeHigh && brokeLow) return "3";
  if (brokeHigh) return "2U";
  if (brokeLow) return "2D";
  return "1";
}

/** Classify a whole series; index i corresponds to bars[i] vs bars[i-1] (bars[0] is unclassifiable). */
export function classifySeries(bars: Bar[]): StratState[] {
  const states: StratState[] = [];
  for (let i = 1; i < bars.length; i++) {
    states.push(classifyBar(bars[i - 1], bars[i]));
  }
  return states;
}
