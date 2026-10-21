/**
 * GSPS — the disclosed-rules reading with nothing read, on its own so client
 * code (`lib/signals/publicSummary.ts`, which every setup card imports) can
 * build a redacted reading without bundling `disclosedRules.ts`, its readers
 * and the planetary ephemeris (review finding R-033, 2026-10-21). Type-only
 * import: this module must stay a leaf.
 */

import type { DisclosedRulesContext } from "@/lib/gann/disclosedRules";

export const EMPTY_DISCLOSED_RULES: DisclosedRulesContext = {
  barMidpoint: null,
  pricePercentages: null,
  dayCountBands: [],
  yearFraction: null,
  counterMove: null,
  levelTests: { support: null, resistance: null },
  ruleOfThree: { weekly: null, monthly: null },
  campaign: null,
  extremes: {
    reverseSignal: { signal: null, rule: null, runDays: null },
    gaps: { exhaustGap: null, gapsInNewTerritory: null, filledGapReversal: null },
  },
  timing: { alternation: null, square144: null, projection: null, changeDates: null },
  capitalStock: null,
  incorporation: null,
  evenFigures: { overhead: null, underneath: null },
  zone: null,
  seasonal: null,
  accumulation: null,
  sharesPerPoint: null,
  leadership: null,
  timeRules: null,
  multipleTops: null,
  ruleFollowing: null,
  overnight: null,
  closeClusters: { daily: null, weekly: null, monthly: null },
  masterCalculator: null,
  circle: null,
  timeAngle: null,
  planetary: null,
  squareOfNineTime: [],
  hexagonTime: [],
  masterChartTime: [],
  patternAngles: null,
  dayCircle: null,
  astro: null,
  asOf: "",
};
