/**
 * Whether a stock follows the rules (Q24, owner 2026-10-16: "Both").
 *
 * A-SELECTION-01 (W006 pp.20, 34-35, class A): "trade active stocks that
 * follow the rules and trend; leave queer-acting and dead, inactive stocks
 * alone." The liquidity and universe floors keep the dead and inactive out
 * (`lib/universe/`); this reads the other half, measured on the stock's own
 * buying and selling points rather than named by feel.
 *
 * A buying point is a close past a completed 3-Day Chart top by Gann's 3-point
 * allowance (`entryTrigger.ts`), with its stop under the swing bottom made
 * since that top. It followed the rules when price then went on by as much as
 * it risked before breaking the stop by the allowance; it failed when the stop
 * broke first. Selling points mirror it. A stock is queer-acting when at
 * least `MIN_RESOLVED` points resolved and under a third of them followed.
 *
 * Engineering choices, labelled: the target is one risk unit, the "full
 * interval of profit" scaling the pyramid uses (`pyramid.ts`); `MIN_RESOLVED`
 * and the one-third line are ours, since Gann names no count. Read on the
 * 52-week entry chart both surfaces read.
 *
 * Three-question basis:
 * 1. Gann: as cited, class A.
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply. It is a
 *    base-rate question (how often a stock's signals work), measured in the
 *    replay as `followsRules`.
 * 3. Hermetic: Cause and Effect: a stock whose causes (its buying points) keep
 *    failing to produce their effect is not one to trade on them. Polarity:
 *    both sides are read.
 */
import type { Bar } from "@/lib/types";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import { gannThreePoints } from "@/lib/gann/pointScale";

export const MIN_RESOLVED = 4;

export interface RuleFollowingReading {
  resolved: number;
  followed: number;
  failed: number;
  queer: boolean;
}

export function readRuleFollowing(daily: Bar[]): RuleFollowingReading | null {
  if (daily.length < 10) return null;
  const pivots = walkSwingChart(daily, THREE_DAY_CHART).pivots;
  let followed = 0;
  let failed = 0;
  for (const [kind, sign] of [["top", 1], ["bottom", -1]] as const) {
    const opposite = kind === "top" ? "bottom" : "top";
    for (let p = 0; p < pivots.length; p++) {
      const level = pivots[p];
      if (level.kind !== kind) continue;
      const line = level.price + sign * gannThreePoints(level.price);
      // The first close past the line after the level formed.
      let j = level.index + 1;
      while (j < daily.length && sign * (daily[j].c - line) <= 0) j++;
      if (j >= daily.length) continue;
      // The stop: the latest opposite extreme between the level and the crossing.
      const behind = pivots.filter((q) => q.kind === opposite && q.index > level.index && q.index < j).at(-1);
      if (!behind) continue;
      const entry = daily[j].c;
      const risk = sign * (entry - behind.price);
      if (!(risk > 0)) continue;
      const target = entry + sign * risk;
      const breakAt = behind.price - sign * gannThreePoints(behind.price);
      for (let k = j + 1; k < daily.length; k++) {
        const b = daily[k];
        if (sign * ((sign > 0 ? b.l : b.h) - breakAt) < 0) {
          failed++;
          break;
        }
        if (sign * ((sign > 0 ? b.h : b.l) - target) >= 0) {
          followed++;
          break;
        }
      }
    }
  }
  const resolved = followed + failed;
  return { resolved, followed, failed, queer: resolved >= MIN_RESOLVED && followed / resolved < 1 / 3 };
}
