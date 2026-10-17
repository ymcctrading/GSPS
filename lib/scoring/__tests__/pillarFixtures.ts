import type { PillarFacts } from "@/lib/scoring/pillars";

/** Facts on which every pillar that reads them passes for `side`. */
export function passingPillarFacts(side: "bullish" | "bearish" = "bullish"): PillarFacts {
  const long = side === "bullish";
  return {
    marketTrend: side,
    yearCycle: { bullishHits: 0, bearishHits: 0 },
    decadeBias: side,
    yearTrend: long ? "up" : "down",
    leadership: {
      bottomedFirst: long,
      toppedFirst: !long,
      crossedTopsFirst: long,
      brokeBottomsFirst: !long,
      firstYearHighCrossed: long,
    },
    weak: !long,
    queer: false,
    volumeActivity: 1.2,
    annualRangePoints: 40,
    zoneActivity: 1.2,
    angles: { holds45: { bullish: long, bearish: !long }, squeezed: false },
    base: { long: true, breakout: long ? "up" : "down" },
    capitalWarning: false,
    counterMove: { trend: side, inCounterMove: false, phase: null },
    reactionAbnormal: false,
    campaign: { trend: side, spaceOverbalanced: false, timeOverbalanced: false },
  };
}
