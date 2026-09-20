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
  // Four sentences rather than one with the direction words swapped: a short
  // reversion is not "a long, downwards". It is price failing at a ceiling it
  // has failed at before, and saying so is the whole job of this line.
  const short = result.direction === "bearish";
  const move =
    setupKind === "continuation"
      ? short
        ? `${result.symbol} is trending down and breaking through ${trigger}`
        : `${result.symbol} is trending up and pushing through ${trigger}`
      : short
        ? `${result.symbol} has run up into a price area that has capped rallies before, and is rolling back down through ${trigger}`
        : `${result.symbol} has sold off into a price area that has stopped declines before, and is turning back up through ${trigger}`;

  const structure = nearestStructure(result);
  const volume = momentumElevated
    ? "It's moving in a wider daily range than usual, so there's real participation behind it"
    : "The daily range is ordinary, so this is happening at a level rather than during a burst of activity";

  return `${capitalise(move)}${structure}. ${volume}.`;
}

/**
 * The risk/reward sentence, in dollars, for the size actually being placed.
 * Loss first: it is the half the user is committing to, and the half a
 * one-tap flow makes easiest to skip past. Side-agnostic — both figures arrive
 * already signed for the trade's own direction (see lib/guided/sizing.ts).
 */
export function riskRewardSentence(riskUsd: number, rewardUsd: number): string {
  return `You could lose about ${formatUsd(Math.abs(riskUsd), 0)} if this doesn't work, or make about ${formatUsd(Math.abs(rewardUsd), 0)} if it reaches the target.`;
}

/**
 * The staged exit, said once, without tranche vocabulary.
 *
 * A short exits by buying back, and its stop trails *down* — the words have to
 * follow the trade or the sentence describes the opposite one.
 */
export function exitSentence(scaleOutQty: number, qty: number, side: "buy" | "sell" = "buy"): string {
  const rest = qty - scaleOutQty;
  const close = side === "buy" ? "sold" : "bought back";
  const behind = side === "buy" ? "up" : "down";
  return `If it works, ${scaleOutQty} of the ${qty} shares are ${close} at the first target and the other ${rest} run on to the second, with the stop moved ${behind} behind them. If it doesn't, the whole position is ${close} at the stop.`;
}

/** How the higher timeframes read, for the expandable "why" panel. */
export function trendSummary(trends: TrendReading[]): string {
  const named = trends
    .filter((t) => t.timeframe !== "1Hour")
    .map((t) => `${timeframeWord(t.timeframe)} ${t.direction === "sideways" ? "flat" : t.direction === "bullish" ? "rising" : "falling"}`);
  return named.length > 0 ? named.join(", ") : "No trend readings available.";
}

/**
 * Gann's own books draw a hard line between two kinds of "structure," and this
 * function has to honor it rather than blur it: a swing-clustered support/
 * resistance level earns "repeatedly turned at" because that is literally what
 * his disclosed "Crossing Old Levels" rule measures — real prior turns. A Gann
 * fan line or Square-of-9 coordinate is a *computed* geometric point (real Gann
 * material, per `GANN_HISTORICAL_SOURCES.md` A2.1, but never justified by him
 * as a place price has actually turned before) — GSPS's own data agrees
 * (`harmonicProximity`, the Square-of-9 criterion, was retired from scoring
 * for measuring negligible), so it gets separate, honest wording instead of
 * borrowing the historical-repetition claim that only the swing level earns.
 * 2026-09-16: fixed after `docs/GANN_PLATFORM_AUDIT.md` flagged this as
 * presenting an unvalidated geometric coordinate as an empirically-observed
 * turning point to novice users — see that doc's Part 3a/5 for the finding.
 */
function nearestStructure(result: ScanResult): string {
  const price = result.currentPrice;
  const daily = result.trends.find((t) => t.timeframe === "1Day");
  const swingLevel = daily ? nearestPrice(price, [...daily.support, ...daily.resistance]) : null;

  const fan = result.gann.fanLines[0];
  const geometric = result.gann.squareOf9[0];
  const geometricNearest =
    fan && geometric ? (fan.distancePct <= geometric.distancePct ? fan : geometric) : fan ?? geometric;

  const swingDistancePct = swingLevel != null ? (Math.abs(price - swingLevel) / price) * 100 : null;

  const useSwing =
    swingDistancePct != null &&
    (geometricNearest == null || swingDistancePct <= geometricNearest.distancePct);

  if (useSwing && swingLevel != null) {
    return ` right at ${formatUsd(swingLevel)}, a level this symbol has repeatedly turned at`;
  }
  if (geometricNearest) {
    return ` right at ${formatUsd(geometricNearest.price)}, a structural price level from this symbol's own chart geometry`;
  }
  return "";
}

/** Nearest of a set of candidate prices to the current price, or null if empty. */
function nearestPrice(current: number, candidates: number[]): number | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, p) =>
    Math.abs(p - current) < Math.abs(best - current) ? p : best,
  );
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
