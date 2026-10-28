import type { PillarFacts } from "@/lib/scoring/pillars";

/** Facts on which every pillar that reads them passes for `side`. */
export function passingPillarFacts(side: "bullish" | "bearish" = "bullish"): PillarFacts {
  const long = side === "bullish";
  return {
    marketTrend: side,
    yearCycle: { bullishHits: 0, bearishHits: 0 },
    massPressure: side,
    marketCounts: { bullishHits: 0, bearishHits: 0 },
    weeklyLine: long ? "green" : "red",
    decadeBias: side,
    yearTrend: long ? "up" : "down",
    leadership: {
      bottomedFirst: long,
      toppedFirst: !long,
      crossedTopsFirst: long,
      brokeBottomsFirst: !long,
      firstYearHighCrossed: long,
    },
    universeRank: { percentile: long ? 0.9 : 0.1, peers: 700, strongest: long, weakest: !long, group: null },
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
    rangeLevels: {
      bullish: long ? { price: 99, label: "1/2 of the extreme range (48.00-150.00)", basis: "extremeRange", importance: 1, role: "support", distancePct: 1 } : null,
      bearish: long ? null : { price: 101, label: "1/2 of the extreme range (52.00-150.00)", basis: "extremeRange", importance: 1, role: "resistance", distancePct: 1 },
    },
    heldLevels: {
      bullish: long ? { price: 98, timeframe: "1Week", extreme: 97.5, sessionsAgo: 3 } : null,
      bearish: long ? null : { price: 102, timeframe: "1Week", extreme: 102.5, sessionsAgo: 3 },
    },
  };
}
