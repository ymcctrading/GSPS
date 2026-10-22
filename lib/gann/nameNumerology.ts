/**
 * Gann's name charts (A-OTHER-08, built 2026-10-21; owner: "Build these: ...
 * name numerology [is] written out in the Master Course").
 *
 * Source, Tier A, Gann's own text (Master Course Ch. 15A, PDF 401-402;
 * `docs/memory-bank/sources/A2_1_master_stock_market_course.md`, "Name charts"):
 * - "The name, United States Steel, contains 17 letters", so its chart is "a
 *   Square of 289", and the multiples of 17 (34, 51, 68 ... 272) "strike
 *   important vibrations on the name".
 * - "America" has 7 letters, so the United States is read on a Square of 7
 *   (49, "a very important and fatal number"), counted from October 12, 1492;
 *   "United States of America" has 21 letters, a Square of 21 (441), half at
 *   220½.
 * - "numbers do determine everything in the future."
 *
 * How it acts, where Gann says it acts (AGENTS.md, "Every Gann method acts",
 * 2026-10-01):
 * - Price: the name's numbers are prices, as Steel's 34, 51 ... 272 were. They
 *   are read in Gann points (`pointScale.ts#gannPoint`, the unit every other
 *   lattice in the S/R list uses), and the nearest above and below price join
 *   the S/R list through `masterLevels.ts`, on the live scan and the replay
 *   alike: one name, one pair of levels.
 * - Time: the same chapter's NYSE Permanent Chart (PDF 400) counts one year a
 *   cell from its starting date, and the America chart starts on a founding
 *   date. So the name's numbers are read as years from the company's
 *   inception, and the month a count completes is a dated window in the
 *   time-window hold (`timeWindow.ts#inceptionWindows`).
 *
 * Engineering choices, labelled as such:
 * - The name is the stored company name (`instrument.name`, the SEC title).
 *   Gann counted "United States Steel", not "United States Steel
 *   Corporation", so legal-form words (Inc, Corp, Co, Ltd, plc, LP ...) and
 *   the SEC's state tags (/DE/, /NEW/) are dropped; every other word counts.
 *   Only the letters A-Z count; digits, spaces and punctuation do not.
 * - The key numbers are every multiple of the letter count and the half of
 *   each square (Gann gives 220½ for the Square of 21). Past the first square
 *   the multiples simply continue, as a second square would; Gann shows only
 *   the first.
 * - A name of fewer than 3 letters gives no chart: its multiples would put a
 *   level or a window on nearly every point and year.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A, his own course (not a later reconstruction).
 * 2. Cycles: the time half claims recurrence at multiples of the letter
 *   count. Dewey's checklist is not cleared: no repetition count, base rate
 *   or out-of-sample test exists for it, and Gann gives none. The replay's
 *   window hold measures it with the rest of the dated windows.
 * 3. Hermetic: Vibration ("strike important vibrations on the name") and
 *   Correspondence (one number read as price and as time). Mentalism also
 *   fits Gann's own reading that a name carries its number.
 */

/** Words that name a company's legal form, not the company (engineering choice, see above). */
const LEGAL_FORM_WORDS = new Set([
  "INC",
  "INCORPORATED",
  "CORP",
  "CORPORATION",
  "CO",
  "COMPANY",
  "LTD",
  "LIMITED",
  "PLC",
  "LP",
  "LLC",
  "LLP",
  "NV",
  "SA",
  "AG",
  "SE",
  "SPA",
  "AB",
  "ASA",
  "OYJ",
]);

export const MIN_NAME_LETTERS = 3;

export interface NameSquare {
  /** The name as counted, upper case, legal-form words dropped. */
  counted: string;
  /** Letters A-Z in it. */
  letters: number;
  /** letters × letters, Gann's "Square of 289" for 17 letters. */
  square: number;
}

/** The words of a company name that count, upper case. */
export function countedName(raw: string): string {
  const words = raw
    .toUpperCase()
    .replace(/\/[A-Z]{2,3}\//g, " ") // SEC state tags: /DE/, /MD/, /NEW/
    .replace(/&/g, " ")
    .split(/[\s,]+/)
    .map((w) => w.replace(/[^A-Z0-9]/g, ""))
    .filter((w) => w.length > 0);
  const kept = words.filter((w) => !LEGAL_FORM_WORDS.has(w));
  // A name made only of such words keeps them.
  return (kept.length > 0 ? kept : words).join(" ");
}

/** Gann's square for a company name, or null when it has fewer than `MIN_NAME_LETTERS` letters. */
export function nameSquare(raw: string | null | undefined): NameSquare | null {
  if (!raw) return null;
  const counted = countedName(raw);
  const letters = (counted.match(/[A-Z]/g) ?? []).length;
  if (letters < MIN_NAME_LETTERS) return null;
  return { counted, letters, square: letters * letters };
}

/** Whether `n` (a count of points or years) is one of the name's key numbers. */
export function isNameNumber(sq: NameSquare, n: number): boolean {
  if (!(n > 0)) return false;
  if (Number.isInteger(n) && n % sq.letters === 0) return true;
  // The half of each square: 144½ for 17 letters, 220½ for 21.
  const half = sq.square / 2;
  const fromHalf = (n - half) / sq.square;
  return Math.abs(fromHalf - Math.round(fromHalf)) < 1e-9 && fromHalf >= -1e-9;
}

export interface NameLevel {
  price: number;
  label: string;
}

/**
 * The name's nearest key number below and above `price`, as prices: each key
 * number is that many Gann points (`unit` dollars a point). At most two levels.
 */
export function nameNumberLevels(sq: NameSquare | null, price: number, unit: number): NameLevel[] {
  if (!sq || !(price > 0) || !(unit > 0)) return [];
  const points = price / unit;
  const keys = new Set<number>();
  // Multiples of the letter count around price, and the halves of the squares.
  const k = Math.floor(points / sq.letters);
  for (const m of [k - 1, k, k + 1, k + 2]) if (m >= 1) keys.add(m * sq.letters);
  const s = Math.floor(points / sq.square);
  for (const m of [s - 1, s, s + 1]) if (m >= 0) keys.add(m * sq.square + sq.square / 2);
  const sorted = [...keys].sort((a, b) => a - b);
  const below = [...sorted].reverse().find((n) => n * unit < price);
  const above = sorted.find((n) => n * unit > price);
  const out: NameLevel[] = [];
  const label = (n: number) => `${n} on the name's ${sq.letters}-letter square`;
  if (below !== undefined) out.push({ price: below * unit, label: label(below) });
  if (above !== undefined) out.push({ price: above * unit, label: label(above) });
  return out;
}
