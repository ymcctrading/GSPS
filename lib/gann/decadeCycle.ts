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
  label: string;
  note: string;
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

export function computeDecadeCycle(asOf: Date = new Date()): DecadeCycleReading {
  const yearMod = asOf.getUTCFullYear() % 10;
  const yearDigit = yearMod === 0 ? 10 : yearMod;
  const character = DECADE_CHARACTER[yearDigit];
  return { yearDigit, ...character };
}
