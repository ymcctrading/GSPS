/**
 * Gann's "decade digit" bull/bear cycle — `docs/GANN_HISTORICAL_SOURCES.md`
 * A2.1 Ch. 7, "BULL AND BEAR CALENDAR YEARS": each year of a calendar decade
 * (the digit 1-10, reading "0" as "10" per Gann's own numbering) is assigned
 * a market character, backed with named historical years for each.
 *
 * Previously this catalog only had this specific claim from B9, an
 * anonymous, no-citation secondary source explicitly flagged as
 * unverifiable. The 2026-09-16 extraction pass confirmed it directly in
 * Gann's own private-course voice — B9's claim about this one technique was
 * correct, even though B9 remains an unreliable general source otherwise.
 *
 * **Class A** (raised 2026-10-16, C-TIME-24 / M-T17): the finished reading
 * of the Master Course confirms the ten characters in Gann's own November
 * 1935 lesson (Ch. 7 PDF 223-224), including "8 = bull (the 90th month)" and
 * the 9th year culminating September to November. The 90th month is read
 * from January of the '1' year as month 1 (Gann numbers the decade 1-10), so
 * it falls in June of the '8' year; that counting start is our reading of
 * his numbering, labelled as such. Read on the card and, through
 * `readDisclosedRules`, on the live scan and the replay alike, as context factors.
 *
 * Per AGENTS.md's "Hermetic principles & cycle theory" standing principle:
 * this is built as real, running, clearly-labeled-hypothesis code,
 * confluence/context only (wired into `GannConfluenceResult`, never into
 * the scored criteria in `lib/scoring/weights.ts`) — the same treatment
 * `lib/gann/digitalRoot.ts` already gets. Not to be trusted beyond a
 * hypothesis until it clears Dewey's own cycle-validation checklist
 * (dominance, regularity, repetition count, constancy of period,
 * phase-resumption, cross-series synchrony — see
 * `docs/GANN_HISTORICAL_SOURCES.md` C6), which nothing has attempted yet.
 */

export type DecadeBias = "bullish" | "bearish" | "mixed";

export interface DecadeCycleReading {
  /** The calendar year's position in its decade, 1-10 ("0" read as "10", per Gann's own numbering). */
  yearDigit: number;
  bias: DecadeBias;
  /**
   * The character at `asOf`'s month (2026-10-21): the year's `bias`, except in
   * the months Gann names a turn inside the year (`IN_YEAR_TURNS`). The pillar
   * and the context factor read this; `bias` stays the whole year's label (the
   * card's heading and the pre-registered CYC-52 test, which reads 1 July).
   */
  currentBias: DecadeBias;
  label: string;
  note: string;
  /** In an '8' year only: the decade's 90th month (YYYY-MM) and whether `asOf` is in it. */
  ninetiethMonth?: { month: string; active: boolean };
}

interface DecadeCharacter {
  bias: DecadeBias;
  label: string;
  note: string;
}

const DECADE_CHARACTER: Record<number, DecadeCharacter> = {
  1: {
    bias: "bullish",
    label: "Bull cycle begins",
    note: "A bear market ends and a bull market begins (e.g. 1901, 1911, 1921).",
  },
  2: {
    bias: "bullish",
    label: "Minor bull / bear-market rally",
    note: "A minor bull market, or a rally within a bear market, starts at some point in the year (e.g. 1902, 1912, 1922, 1932).",
  },
  3: {
    bias: "bearish",
    label: "Bear year",
    note: "Starts a bear year, though a rally from the 2nd year may run into March/April before culminating (e.g. 1903, 1913, 1923).",
  },
  4: {
    bias: "bearish",
    label: "Bear year, cycle low",
    note: "A bear year, but ends the bear cycle and lays the foundation for a bull market (e.g. 1904, 1914).",
  },
  5: {
    bias: "bullish",
    label: "Year of Ascension",
    note: "A very strong year for a bull market (e.g. 1905, 1915, 1925, 1935).",
  },
  6: {
    bias: "bullish",
    label: "Bull year, fall reversal",
    note: "A bull campaign from the 4th year typically ends in the fall, followed by a fast decline (e.g. 1869, 1906, 1916, 1926).",
  },
  7: {
    bias: "bearish",
    label: "Bear year",
    note: "A bear number and typically a bear year, unless it coincides with the end of a 60-year cycle (e.g. 1897, 1907, 1917; 1927 was an exception).",
  },
  8: {
    bias: "bullish",
    label: "Bull year, strong advance",
    note: "Prices advance from the 7th year and a big advance usually takes place (e.g. 1898, 1908, 1918, 1928).",
  },
  9: {
    bias: "mixed",
    label: "Strongest bull peak, then reversal",
    note: "The strongest year of all for bull markets — final bull campaigns culminate here, and bear markets usually start September to November (e.g. 1869, 1879, ..., 1929).",
  },
  10: {
    bias: "bearish",
    label: "Bear year",
    note: "A rally often runs to March/April, then a severe decline to November/December, when a new decade cycle begins (e.g. 1910, 1920, 1930).",
  },
};

/**
 * The months inside a year where Gann's own character for the digit turns
 * (Master Course Ch. 7, PDF 223-224; `docs/memory-bank/sources/A2_1_master_stock_market_course.md`,
 * "Bull and bear calendar years"). Months are 1-12, inclusive.
 *
 * - 3: "a 2nd-year rally may run to Mar/Apr, or a decline bottoms Feb/Mar",
 *   so January to April is mixed and the bear year reads from May.
 * - 6: "campaign begun in year 4 ends in the Fall, fast decline": the bull
 *   year runs to August, September to November is the culmination (mixed),
 *   and December follows it down.
 * - 9: "strongest bull; final campaigns culminate; bear markets start
 *   Sep-Nov": bullish to August, mixed September to November, bearish after.
 * - 10: "rally to Mar/Apr, severe decline to Nov/Dec": mixed January to April,
 *   bearish from May.
 *
 * Until 2026-10-21 the pillar read only the year's label, so the fall of a '6'
 * year (the whole 2026-08-24 to 2026-10-20 replay window) read bullish: every
 * long took P1's year point free and no short could, the opposite of the
 * decline Gann expects there. The culmination months read "mixed", as the '9'
 * year as a whole always has: Gann names the turn's window, not its day, so
 * neither side takes the point inside it.
 */
const IN_YEAR_TURNS: Partial<Record<number, { from: number; to: number; bias: DecadeBias }[]>> = {
  3: [{ from: 1, to: 4, bias: "mixed" }, { from: 5, to: 12, bias: "bearish" }],
  6: [{ from: 1, to: 8, bias: "bullish" }, { from: 9, to: 11, bias: "mixed" }, { from: 12, to: 12, bias: "bearish" }],
  9: [{ from: 1, to: 8, bias: "bullish" }, { from: 9, to: 11, bias: "mixed" }, { from: 12, to: 12, bias: "bearish" }],
  10: [{ from: 1, to: 4, bias: "mixed" }, { from: 5, to: 12, bias: "bearish" }],
};

/** The digit's character in `month` (1-12), from `IN_YEAR_TURNS` or the year's label. */
function biasInMonth(yearDigit: number, month: number): DecadeBias {
  const turn = IN_YEAR_TURNS[yearDigit]?.find((t) => month >= t.from && month <= t.to);
  return turn?.bias ?? DECADE_CHARACTER[yearDigit].bias;
}

export function computeDecadeCycle(asOf: Date = new Date()): DecadeCycleReading {
  const yearMod = asOf.getUTCFullYear() % 10;
  const yearDigit = yearMod === 0 ? 10 : yearMod;
  const character = { ...DECADE_CHARACTER[yearDigit], currentBias: biasInMonth(yearDigit, asOf.getUTCMonth() + 1) };
  if (yearDigit !== 8) return { yearDigit, ...character };
  // Month 90 from January of the '1' year (month 1): 7 years and 5 months on, June of the '8' year.
  const start = asOf.getUTCFullYear() - 7;
  const m = start * 12 + 89;
  const month = `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
  return { yearDigit, ...character, ninetiethMonth: { month, active: asOf.toISOString().slice(0, 7) === month } };
}
