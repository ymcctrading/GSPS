/**
 * The two timing records a browser shows, and nothing else.
 *
 * `lib/gann/timeRecords.ts` keeps the measured record behind every time line
 * the server reads, keyed by the line's internal name (several of which name
 * the rule behind them), with the run file and its family names. Importing it
 * from a client component shipped all of those keys and family names in the
 * browser bundle (audit 2026-11-09). A client component imports this module
 * instead: the swing-timing badge and the long-term timing badge, each shown
 * with its summary or not at all (CYC-30). `timeRecords.ts` builds its two
 * matching entries from these, and a test holds them equal.
 */
export interface ShownTimeRecord {
  /** Plain-language result, shown beside the badge. */
  summary: string;
}

export const SHOWN_TIME_RECORDS: {
  /** The swing-timing badge (`TIME_LINE_RECORDS.timeCycle`). */
  timing: ShownTimeRecord | null;
  /** The long-term timing badge (`TIME_LINE_RECORDS.yearCycles`); hidden until a run holds it. */
  longTermTiming: ShownTimeRecord | null;
} = {
  timing: { summary: "Measured: no better than chance (736 symbols, 2017-2026)" },
  longTermTiming: null,
};
