/**
 * Gann Square of 9.
 *
 * Prices map onto a square-root spiral: one full 360° rotation multiplies
 * sqrt(price) by 2. From an anchor price (major low or high), levels at the
 * cardinal (0/90/180/270°) and ordinal (45/135/225/315°) angles are:
 *
 *   level(deg) = (sqrt(anchor) + deg/180)²
 *
 * These are the classic "natural support/resistance" coordinates where the
 * protocol expects liquidity to rest.
 */

export interface S9Level {
  degree: number;
  price: number;
  distancePct: number;
  rotation: number;
}

const DEGREES = [0, 45, 90, 135, 180, 225, 270, 315];

export function squareOf9Levels(
  anchorPrice: number,
  currentPrice: number,
  rotations = 8,
): S9Level[] {
  if (anchorPrice <= 0 || currentPrice <= 0) return [];
  const root = Math.sqrt(anchorPrice);
  const levels: S9Level[] = [];

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
        });
      }
    }
  }

  // Dedupe (degree 0 rotation 0 appears twice) and sort by proximity
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

/** Nearest Square-of-9 level within `proximityPct` of current price, if any. */
export function nearestS9Level(levels: S9Level[], proximityPct = 1.0): S9Level | null {
  const nearest = levels[0];
  return nearest && nearest.distancePct <= proximityPct ? nearest : null;
}
