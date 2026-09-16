/**
 * Gann's Square of 144 / "Master Twelve" (PRIVATE-GANN — Chapter 13, "The
 * Master Mathematical Price, Time and Trend Calculator,"
 * `docs/GANN_HISTORICAL_SOURCES.md` A2.1). Internal/research use only — see
 * `angleMonthCounts.ts`'s header for the same never-wire-into-the-public-scan
 * rule; it applies identically here.
 *
 * `lib/gann/squareOf9.ts` generalizes the square-root spiral to base 9; this
 * module is the base-12 analog Chapter 13 itself describes as *literally
 * nested* inside the Square of Nine, not an independent system: its "Great
 * Cycle" of 20,736 (144²) halves down through 10,368 / 5,184 / 2,592 / 1,296
 * / 648 / 324 / 162 / 81 — and 81 is exactly 9², the Square of Nine's own
 * total cell count (`__tests__/masterTwelve.test.ts` asserts this chain and
 * the 81/9² identity directly).
 */

import { levelRole, type LevelRole } from "@/lib/analysis/levelRole";

/** 20,736 = 144², halved seven times down to 81 = 9² — the Square of Nine's own grid, nested. */
export const GREAT_CYCLE = 20736;
export const HALVING_CHAIN: number[] = [];
(() => {
  let n = GREAT_CYCLE;
  while (n >= 81) {
    HALVING_CHAIN.push(n);
    n = n / 2;
  }
})();

/** The Square of Nine's own 9x9 grid — the value the halving chain's last term must equal. */
export const SQUARE_OF_9_TOTAL_CELLS = 9 * 9;

export interface MasterNumber {
  n: number;
  /** Gann's own stated reasoning for this number, as documented data — not behavior. */
  reasoning: string;
}

/** "The Master Numbers are 3, 5, 7, 9 and 12" — Chapter 13, verbatim, with Gann's own stated reasoning for each. */
export const MASTER_NUMBERS: MasterNumber[] = [
  { n: 3, reasoning: "The first odd number that forms a square greater than itself." },
  { n: 5, reasoning: "The balancing number between 1 and 9." },
  {
    n: 7,
    reasoning:
      'The number mentioned more times in the Bible than any other; its square, 49, "a very important time period."',
  },
  { n: 9, reasoning: "9 digits added together equal 45; the base of the base-9 grid itself." },
  { n: 12, reasoning: "Biblical/zodiacal significance, and the base of the Square of 144 itself." },
];

/**
 * The Chapter 13 wheat worked example, exactly as disclosed: wheat's
 * all-time low (28 cents, March 1852) squared against the May option's own
 * high/low (325 / 44 cents), concluding "you would watch for a change in
 * trend between 281 and 288" months.
 *
 * `281` is exact, reproducible arithmetic from the two option prices Gann
 * himself states (325 - 44 = 281 — the same "1 cent/point == 1 time unit"
 * price-to-time-count convention already catalogued from Gann's own private
 * correspondence, `docs/GANN_HISTORICAL_SOURCES.md` A2.3's disclosed
 * price-to-degree scales). `288` is carried here as Gann's own stated upper
 * bound of the window; the retrieved text extraction does not spell out its
 * derivation in full (a plausible reading is 281 plus the Master Number 7,
 * matching the chapter's repeated use of 7/49 as a tolerance band, but that
 * is this module's inference, not a literal quote — documented as such
 * rather than asserted as fact).
 */
export const WHEAT_SQUARE_EXAMPLE = {
  allTimeLowCents: 28,
  allTimeLowDate: "1852-03",
  mayOptionHighCents: 325,
  mayOptionLowCents: 44,
  changeWindowMonths: [281, 288] as [number, number],
};

/** Gann's disclosed price-to-month-count arithmetic: high minus low, in cents, read directly as elapsed months. */
export function squareMonthsFromPriceRange(lowCents: number, highCents: number): number {
  return highCents - lowCents;
}

export interface MasterTwelveLevel {
  degree: number;
  price: number;
  distancePct: number;
  rotation: number;
  role: LevelRole;
}

const DEGREES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]; // 12-fold division, base-12 analog of squareOf9's 8-fold

/**
 * Base-12 analog of `lib/gann/squareOf9.ts`'s spiral coordinate system: one
 * full 360° rotation multiplies sqrt(price) by 12/6 = 2, same as base 9 (the
 * rotation constant is fixed by the square-root relationship, not the base);
 * what changes is the angular resolution, 12-fold here instead of 8-fold.
 */
export function masterTwelveLevels(
  anchorPrice: number,
  currentPrice: number,
  rotations = 8,
): MasterTwelveLevel[] {
  if (anchorPrice <= 0 || currentPrice <= 0) return [];
  const root = Math.sqrt(anchorPrice);
  const levels: MasterTwelveLevel[] = [];

  for (let rot = 0; rot <= rotations; rot++) {
    for (const degree of DEGREES) {
      const totalDeg = rot * 360 + degree;
      for (const sign of [1, -1]) {
        const r = root + (sign * totalDeg) / 180;
        if (r <= 0) continue;
        const price = r * r;
        levels.push({
          degree,
          price,
          distancePct: (Math.abs(currentPrice - price) / currentPrice) * 100,
          rotation: sign * rot,
          role: levelRole(currentPrice, price),
        });
      }
    }
  }

  const seen = new Set<string>();
  return levels
    .filter((l) => {
      const key = l.price.toFixed(4);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.distancePct - b.distancePct);
}

/** Nearest Master Twelve level within `proximityPct` of current price, if any. */
export function nearestMasterTwelveLevel(
  levels: MasterTwelveLevel[],
  proximityPct = 1.0,
): MasterTwelveLevel | null {
  const nearest = levels[0];
  return nearest && nearest.distancePct <= proximityPct ? nearest : null;
}
