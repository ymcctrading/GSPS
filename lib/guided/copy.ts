/**
 * Guided Decision Mode — the words.
 *
 * A guided card replaces a score, a nine-row breakdown and four price levels
 * with two sentences, so those sentences carry the whole explanation. Two rules
 * shape everything here:
 *
 *   1. Say what happened, in the vocabulary of someone who has never read the
 *      protocol. No pattern codes, no R-multiples, no "confluence".
 *   2. Build it only from fields that already cross the API boundary — pattern,
 *      direction, trends, momentum, structural levels. The scoring criteria stay
 *      server-side (lib/scoring/public-summary.ts), and a friendlier wrapper
 *      around them would leak the model just as thoroughly as printing it.
 */

import type { ScanResult, TrendReading } from "@/lib/types";
import { formatUsd } from "@/lib/utils";

/**
 * One line saying why this symbol is on the list, in plain English.
 *
 * Composed rather than templated per pattern: the shape of the trigger, the
 * structure it is happening at, and whether the tape is busier than usual are
 * three independent facts, and a novice needs all three to judge whether the
 * card matches what they can see on the chart.
 */
export function reasonLine(result: ScanResult): string {
  const { pattern, levels, setupKind, momentumElevated } = result;
  if (!pattern || !levels) return "A setup is armed, but its trade plan hasn't priced yet.";

  const trigger = formatUsd(levels.entry);
  const move =
    setupKind === "continuation"
      ? `${result.symbol} is trending up and pushing through ${trigger}`
      : `${result.symbol} has sold off into a price area that has stopped declines before, and is turning back up through ${trigger}`;

  const structure = nearestStructure(result);
  const volume = momentumElevated
    ? "It's moving in a wider daily range than usual, so there's real participation behind it"
    : "The daily range is ordinary, so this is a structural entry rather than a momentum one";

  return `${capitalise(move)}${structure}. ${volume}.`;
}

/**
 * The risk/reward sentence, in dollars, for the size actually being placed.
 * Loss first: it is the half the user is committing to, and the half a
 * one-tap flow makes easiest to skip past.
 */
export function riskRewardSentence(riskUsd: number, rewardUsd: number): string {
  return `You could lose about ${formatUsd(Math.abs(riskUsd), 0)} if this doesn't work, or make about ${formatUsd(Math.abs(rewardUsd), 0)} if it reaches the target.`;
}

/** The staged exit, said once, without tranche vocabulary. */
export function exitSentence(scaleOutQty: number, qty: number): string {
  const rest = qty - scaleOutQty;
  return `If it works, ${scaleOutQty} of the ${qty} shares are sold at the first target and the other ${rest} run on to the second, with the stop moved up behind them. If it doesn't, the whole position is sold at the stop.`;
}

/** How the higher timeframes read, for the expandable "why" panel. */
export function trendSummary(trends: TrendReading[]): string {
  const named = trends
    .filter((t) => t.timeframe !== "1Hour")
    .map((t) => `${timeframeWord(t.timeframe)} ${t.direction === "sideways" ? "flat" : t.direction === "bullish" ? "rising" : "falling"}`);
  return named.length > 0 ? named.join(", ") : "No trend readings available.";
}

function nearestStructure(result: ScanResult): string {
  const fan = result.gann.fanLines[0];
  const harmonic = result.gann.squareOf9[0];
  const nearest =
    fan && harmonic ? (fan.distancePct <= harmonic.distancePct ? fan : harmonic) : fan ?? harmonic;
  if (!nearest) return "";
  return ` right at ${formatUsd(nearest.price)}, a level this symbol has repeatedly turned at`;
}

function timeframeWord(tf: string): string {
  switch (tf) {
    case "1Month":
      return "monthly";
    case "1Week":
      return "weekly";
    case "1Day":
      return "daily";
    case "1Hour":
      return "hourly";
    default:
      return tf.toLowerCase();
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
