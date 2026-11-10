/**
 * Price-time square engine ("edge engine"): configuration.
 *
 * RESEARCH ONLY. Nothing in `lib/research/edgeEngine/` is imported by the
 * scan, the score, a plan, an order or any client component; it is the
 * reproducible form of an owner-requested study (thread "Build and test the
 * Gann Edge Engine", 2026-11-10). Rule ids are neutral; the source ledger
 * that maps each id to its book, page or video lives in the owner-private
 * research folder, never in this public repository. Gann's own books are
 * cited in `sources.ts` the way the rest of `lib/gann/` cites them.
 *
 * Every number below is a default the study froze before reading data
 * (see `sources.ts` for which ones are Gann's own figures and which are
 * engineering choices). The walk-forward search may change only the fields
 * listed in `SEARCHED_FIELDS`, and only on the first half of the data.
 */

export type TimeFamily =
  | "T1.major" // 90/144/180/360 circle counts
  | "T1.minor" // the other circle counts
  // T1.days: Gann's own day counts from a high or low (A09 Ch. II, Rule 8)
  | "T1.days"
  | "T2.expand" // 50% time expansion of a prior swing
  | "T2.squared" // squared bar counts
  | "T2.run" // average run length projection
  | "T3.sqrt" // square root of range, low, high as days
  | "T3.asTime" // range, low, high read as days/weeks/months
  | "T3.planet" // a planet travels the range in degrees
  | "T4.season" // Sun at 0 of the cardinal signs
  | "T4.mid" // Sun at 15 of the fixed signs
  // T4.calendar: Gann's dated seasonal change windows (A09)
  | "T4.calendar"
  | "T4.solarDeg" // Sun travel since a pivot = circle counts
  | "T4.anniv" // anniversary of a pivot, +-2 days
  | "T5.lunar" // alternating 50/40 degree Moon steps
  | "T6.return" // planet returns to its pivot longitude
  | "T6.natal" // Sun to natal Mars, Sun square/opposite natal Sun
  | "T6.ingress" // sign ingress of Sun, Mercury, Mars
  | "T6.station" // planetary stations
  | "T7.hurst" // nominal 20/40/80-bar troughs
  | "T7.cycle"; // dominant-cycle (Goertzel) composite trough/peak

export type PriceFamily =
  | "P1.dynamic" // (sqrt P +- n/4)^2 from a pivot
  | "P1.static" // odd squares, even squares, even squares + 1
  | "P1.ring" // quarter-step squares around price
  | "P2.half" // 50% of a range
  | "P2.eighths" // other 1/8ths and 1/3rds
  | "P2.ext" // 1.25-2.0 extensions
  | "P2.pct" // 6.25% multiples of the high / low
  | "P3.angle" // 1x1, 2x1 ... angles from major pivots
  | "P4.planet" // planetary longitude price lines
  | "P5.box144" // square-of-144 box from a major low
  | "P6.abcd" // AB=CD, 0.618/0.786, 1.27/1.618
  | "P6.fork" // median line and parallels
  | "S.double" // double/triple bottom or top level
  | "S.flip" // old top becomes bottom / old bottom becomes top
  | "S.run"; // average-run price projection

export const TIME_FAMILIES: readonly TimeFamily[] = [
  "T1.major", "T1.minor", "T1.days", "T2.expand", "T2.squared", "T2.run", "T3.sqrt", "T3.asTime", "T3.planet",
  "T4.season", "T4.mid", "T4.calendar", "T4.solarDeg", "T4.anniv", "T5.lunar", "T6.return", "T6.natal",
  "T6.ingress", "T6.station", "T7.hurst", "T7.cycle",
];

export const PRICE_FAMILIES: readonly PriceFamily[] = [
  "P1.dynamic", "P1.static", "P1.ring", "P2.half", "P2.eighths", "P2.ext", "P2.pct", "P3.angle",
  "P4.planet", "P5.box144", "P6.abcd", "P6.fork", "S.double", "S.flip", "S.run",
];

export type TriggerId = "E1" | "E2" | "E3" | "E6";

export interface EngineConfig {
  /** Swing chart whose pivots feed the time and price sources: a bar count, or "weekly" (7 calendar days). */
  majorSwing: number | "weekly";
  /** Swing chart whose turns are the E1 trigger and the trailing stop. */
  minorSwingBars: number;
  /**
   * How many most-recent major pivots keep their time windows open. A
   * pivot's windows close once this many newer major pivots are known, so
   * counts run from the last important tops and bottoms. Anniversaries
   * (1-3 years) are exempt. Set from coverage alone, before any return was read:
   * with every pivot open to the horizon, windows covered 99% of days.
   */
  timePivots: number;
  /** How many most-recent major pivots project levels. */
  levelPivots: number;
  /** Calendar-day horizon of a projected time window. */
  horizonDays: number;
  /** Window half-widths in trading bars. */
  windowBars: { short: number; major: number; long: number };
  /** Price band: max(bandPct of price, bandAtr x ATR(14)). */
  bandPct: number;
  bandAtr: number;
  /** Double/triple bottom tolerance, percent of price. */
  doubleTolPct: number;
  /** Rolling run statistics length (runs). */
  runLookback: number;
  /** PTS thresholds (searched). */
  kt: number;
  kp: number;
  /** Trigger (searched). */
  trigger: TriggerId;
  /** Bars after a PTS event inside which a trigger may confirm. */
  confirmBars: number;
  /** Family weights (the default set, or a fitted set). */
  timeWeights: Record<TimeFamily, number>;
  priceWeights: Record<PriceFamily, number>;
  /** Toggles: a family off contributes nothing. */
  timeOn: Record<TimeFamily, boolean>;
  priceOn: Record<PriceFamily, boolean>;
  /** Management. */
  capitalParts: number;
  maxOpen: number;
  sevenDayRule: number;
  timeStopBars: number;
  maxHoldBars: number;
  slippageBp: number;
}

/** The weights the handoff suggests (its section T8); 1 where it names none. */
export const DEFAULT_TIME_WEIGHTS: Record<TimeFamily, number> = {
  "T1.major": 2, "T1.minor": 1, "T1.days": 2, "T2.expand": 2, "T2.squared": 1, "T2.run": 1, "T3.sqrt": 3, "T3.asTime": 3,
  "T3.planet": 1, "T4.season": 2, "T4.mid": 1, "T4.calendar": 2, "T4.solarDeg": 1, "T4.anniv": 1, "T5.lunar": 1,
  "T6.return": 2, "T6.natal": 1, "T6.ingress": 1, "T6.station": 1, "T7.hurst": 2, "T7.cycle": 1,
};

/** The handoff names no price weights; every family counts 1, 50% counts 2 ("50% strongest"). */
export const DEFAULT_PRICE_WEIGHTS: Record<PriceFamily, number> = {
  "P1.dynamic": 1, "P1.static": 1, "P1.ring": 1, "P2.half": 2, "P2.eighths": 1, "P2.ext": 1, "P2.pct": 1,
  "P3.angle": 1, "P4.planet": 1, "P5.box144": 1, "P6.abcd": 1, "P6.fork": 1, "S.double": 2, "S.flip": 1, "S.run": 1,
};

function allOn<K extends string>(keys: readonly K[]): Record<K, boolean> {
  return Object.fromEntries(keys.map((k) => [k, true])) as Record<K, boolean>;
}

export const DEFAULT_CONFIG: EngineConfig = {
  // Gann's 7-day swing chart, "one of the most valuable trend indicators" (Commodities p.316-317):
  // the handoff projects time "from each major pivot", and this is Gann's chart of the major swings.
  majorSwing: "weekly",
  minorSwingBars: 2, // the handoff's 2-bar trend indicator line
  timePivots: 4,
  levelPivots: 6,
  // three years: Gann's 1-, 2-, 3-year anniversaries (A05 pp.14-15, 44)
  horizonDays: 1100,
  windowBars: { short: 1, major: 2, long: 5 },
  bandPct: 0.1,
  bandAtr: 0.2,
  doubleTolPct: 1.5,
  runLookback: 5,
  kt: 4,
  kp: 3,
  trigger: "E1",
  confirmBars: 5,
  timeWeights: { ...DEFAULT_TIME_WEIGHTS },
  priceWeights: { ...DEFAULT_PRICE_WEIGHTS },
  timeOn: allOn(TIME_FAMILIES),
  priceOn: allOn(PRICE_FAMILIES),
  capitalParts: 10, // "divide your capital into 10 equal parts" (Master Course p.238)
  maxOpen: 10,
  sevenDayRule: 7,
  timeStopBars: 10,
  maxHoldBars: 60,
  slippageBp: 5,
};

/** The only fields the walk-forward search may move, on the first half only. */
export const SEARCHED_FIELDS = ["kt", "kp", "trigger", "timeWeights", "priceWeights"] as const;
