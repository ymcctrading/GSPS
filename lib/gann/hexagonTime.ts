/**
 * Gann's Hexagon Chart read in time (gap G26, built 2026-10-16 under the
 * owner's "every Gann method acts").
 *
 * Sources:
 * - Tier A: Master Course Ch. 15A/15B, "The Hexagon Chart" (January 1931).
 *   The ring completions 7, 19, 37, 61, 91, 127, 169, 217, 271, 331, 397 and
 *   the second series 2, 9, 22, 41, 66, 97, 134, 177, 226, 281, 342 are named
 *   as points of time measurement for days, weeks, months and years. Named
 *   counts: campaigns that top in the 60th month and make a second top or
 *   bottom in the 66th; 127 months (10 years 7 months, "why some campaigns
 *   run 10 years and seven months"); 169 months (14 years 1 month).
 * - Tier A: Gann's hand-drawn plate, printed p. 422 of the owner's Master
 *   Course PDF, viewed 2026-10-01 (reading log A2.1). 1 at the centre, 2 to
 *   its right, the spiral counterclockwise, six cells more per ring. Corners
 *   at 0°/360°, 60°, 120°, 180°, 240° and 300°; mid-sides at 30°, 90° … 330°.
 *
 * The plate's numbering gives every line in closed form. On ring k the number
 * on the line at angle a (0° read as 360°) is 3k² + (a/60 − 3)k + 1: the
 * 0°/360° corner carries the completions (3k² + 3k + 1), the 60° corner the
 * second series (3k² − 2k + 1), the 180° corner 4, 13, 28, 49 … (3k² + 1).
 * Mid-side lines fall on whole cells only on even rings. The tests check the
 * lines against the plate.
 *
 * One conflict, recorded rather than resolved: Gann's text puts 66 on the
 * 180° angle; his plate puts it on the 60° line. The code follows the plate
 * for the angle and the text for the named count (66 months acts either way).
 *
 * Time: a count of days, weeks or months from the extreme high or low that
 * equals a number on a line is a time point, read like the Square of Nine in
 * time (`squareOfNineTime.ts`).
 *
 * Engineering choices, labelled as such:
 * - Tolerance: 1 day, ½ week, ½ month.
 * - Numbers below 7 (inside the first ring's completion) are skipped.
 * - Counts are calendar time from the extreme high and low of the bars read.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A (text and plate).
 * 2. Cycles: a recurrence claim (turns at the hexagon's numbers counted from a
 *    pivot). No Dewey item is cleared: the replay's factor table is the first
 *    base-rate test, and the rule was fixed before it (plate numbers, the
 *    three units, the tolerances above; no search over lines or tolerances).
 * 3. Hermetic: Rhythm, the rings complete and begin again at a growing
 *    interval; Correspondence, the one chart read in time as Gann read it in
 *    price ("everything seeks the center of gravity").
 */

export type HexLineKind = "completion" | "corner" | "midside";

export const HEX_CORNERS = [60, 120, 180, 240, 300, 360];
export const HEX_MIDSIDES = [30, 90, 150, 210, 270, 330];

/** The number on the line at `angle` (a multiple of 30°) in ring k, or null when it falls between cells. */
export function hexNumberOnLine(angle: number, ring: number): number | null {
  if (!(ring >= 1) || !Number.isInteger(ring)) return null;
  let a = ((angle % 360) + 360) % 360;
  if (a === 0) a = 360;
  const n = 3 * ring * ring + (a / 60 - 3) * ring + 1;
  return Number.isInteger(n) ? n : null;
}

/** Every number on the line at `angle`, ring 1 up to `max`. */
export function hexNumbersOnLine(angle: number, max: number): number[] {
  const out: number[] = [];
  for (let k = 1; 3 * k * k - 3 * k + 2 <= max; k++) {
    const n = hexNumberOnLine(angle, k);
    if (n !== null && n <= max) out.push(n);
  }
  return out;
}

export function hexLineKind(angle: number): HexLineKind {
  const a = ((angle % 360) + 360) % 360;
  if (a === 0) return "completion";
  return HEX_CORNERS.includes(a) ? "corner" : "midside";
}

/** Gann's named counts, in months. */
export const HEX_NAMED_MONTHS = [60, 66, 127, 169] as const;

export type HexTimeUnit = "days" | "weeks" | "months";
const TOLERANCE: Record<HexTimeUnit, number> = { days: 1, weeks: 0.5, months: 0.5 };
const MIN_NUMBER = 7;

export interface HexLineHit {
  number: number;
  angle: number;
  kind: HexLineKind;
}

/** The hexagon numbers within `tolerance` of `count`: completions first, then corners, then mid-sides. */
export function hexLinesAt(count: number, tolerance: number): HexLineHit[] {
  if (!(count >= MIN_NUMBER - tolerance)) return [];
  const hits: HexLineHit[] = [];
  const k = Math.max(1, Math.round(Math.sqrt(Math.max(count, 1) / 3)));
  for (const angle of [360, 60, 120, 180, 240, 300, ...HEX_MIDSIDES]) {
    for (const ring of [k - 1, k, k + 1]) {
      const n = hexNumberOnLine(angle, ring);
      if (n !== null && n >= MIN_NUMBER && Math.abs(count - n) <= tolerance) {
        hits.push({ number: n, angle: angle === 360 ? 0 : angle, kind: hexLineKind(angle) });
      }
    }
  }
  return hits;
}

export interface HexagonTimeHit {
  pivot: "high" | "low";
  pivotDate: string;
  unit: HexTimeUnit;
  count: number;
  line: HexLineHit | null;
  /** Set when the count is one of Gann's named month counts (60, 66, 127, 169). */
  named: number | null;
}

const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 365.25 / 12;

/** Days, weeks and months from the extreme high and low of `bars` to the last bar, on the hexagon's lines. */
export function readHexagonTime(bars: { t: string; h: number; l: number }[]): HexagonTimeHit[] {
  if (bars.length < 2) return [];
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].h > bars[hi].h) hi = i;
    if (bars[i].l < bars[lo].l) lo = i;
  }
  const last = Date.parse(bars[bars.length - 1].t);
  const out: HexagonTimeHit[] = [];
  for (const [pivot, i] of [["high", hi], ["low", lo]] as const) {
    const days = (last - Date.parse(bars[i].t)) / DAY_MS;
    const counts: [HexTimeUnit, number][] = [
      ["days", days],
      ["weeks", days / 7],
      ["months", days / DAYS_PER_MONTH],
    ];
    for (const [unit, count] of counts) {
      const line = hexLinesAt(count, TOLERANCE[unit])[0] ?? null;
      const named =
        unit === "months" ? (HEX_NAMED_MONTHS.find((m) => Math.abs(count - m) <= TOLERANCE.months) ?? null) : null;
      if (line || named) out.push({ pivot, pivotDate: bars[i].t.slice(0, 10), unit, count, line, named });
    }
  }
  return out;
}

/** Plain-language lines for the explanation trace. */
export function describeHexagonTime(hits: HexagonTimeHit[]): string[] {
  return hits.map((h) => {
    const where = h.line
      ? `on ${h.line.number}, the ${h.line.angle === 0 ? "0°/360°" : `${h.line.angle}°`} line of the Hexagon Chart (${h.line.kind === "completion" ? "a ring completion" : h.line.kind === "corner" ? "a corner" : "a mid-side"})`
      : "on the Hexagon Chart's count";
    const named = h.named !== null ? `; the ${h.named}th month is a named count` : "";
    return `${Math.round(h.count)} ${h.unit} from the ${h.pivot} of ${h.pivotDate}: ${where}${named}, a time point.`;
  });
}
