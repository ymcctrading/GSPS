/**
 * Which futures contract month to trade, by season, as Gann named it
 * (A-SELECTION-08).
 *
 * Gann's own words, Tier A:
 * - Wheat, 1922 grain forecast (*Annual Forecasts 1919-1922*, W036 p.22):
 *   trade the May option "until May 10, then July, then September and
 *   December".
 * - Cotton, 1922 cotton forecast (W036 pp.19-20): "October and July in spring
 *   and summer; December and January after September; March in
 *   November-December".
 * - Soybeans (*Commodities*, 1951 ed., p.326): "As a general rule, it pays to
 *   buy for long account the May and July options because from the Spring to
 *   Summer, the supply of old Beans is getting less." A rule for longs only.
 *
 * Gann named no month for any other market GSPS defines (the index, energy,
 * metal, currency and rate contracts, corn and coffee), so those read null:
 * no month is invented for them.
 *
 * Engineering choices, labelled: Gann's "until May 10" is the only roll date
 * he gives, and it is carried to every delivery month he names (a month is
 * left on the 10th of its own month), by Correspondence, except where his own
 * season moves first: cotton's October gives way to December when September
 * ends ("December and January after September"). Cotton's January to
 * early March, which his forecast (dated April 25) does not reach, carries his
 * November-December choice, March, until it rolls. A month the exchange no
 * longer lists (January cotton) is left out. When two months are named, the
 * nearer is the front. Dates are read in New York time.
 *
 * Built ahead of the market, like `lib/instruments/spec.ts`: futures have
 * quotes only, no bars or broker, so no surface reads this yet. Wire it in
 * where futures arrive.
 *
 * Three-question basis: 1. Gann, as cited (Tier A). 2. A seasonal rule, not a
 * cycle claim: it names which contract carries the season's trade, not when a
 * turn comes, so Dewey's checklist does not apply. 3. Rhythm: the crop year
 * flows in and out, and the contract follows the season. Law of Creation:
 * season ⊗ contract, the time of year meeting the listed months gives the one
 * contract to trade, which neither names alone.
 */
import { etDateKey } from "../market/session";

export type MonthCode = "F" | "G" | "H" | "J" | "K" | "M" | "N" | "Q" | "U" | "V" | "X" | "Z";

const MONTH_NUMBER: Record<MonthCode, number> = {
  F: 1, G: 2, H: 3, J: 4, K: 5, M: 6, N: 7, Q: 8, U: 9, V: 10, X: 11, Z: 12,
};

/** The delivery months each exchange lists today (CBOT, ICE), engineering data. */
const LISTED: Record<string, readonly MonthCode[]> = {
  ZW: ["H", "K", "N", "U", "Z"],
  ZS: ["F", "H", "K", "N", "Q", "U", "X"],
  CT: ["H", "K", "N", "V", "Z"],
};

/** A window of the year, from (month, day) through (month, day) inclusive, and
 * the months named for it with the year offset each is in. */
interface Window {
  from: [number, number];
  through: [number, number];
  months: readonly [MonthCode, 0 | 1][];
}

interface Rule {
  source: string;
  side: "both" | "long";
  windows: readonly Window[];
}

const RULES: Record<string, Rule> = {
  ZW: {
    source: "W036 p.22: May until May 10, then July, then September and December",
    side: "both",
    windows: [
      { from: [1, 1], through: [5, 10], months: [["K", 0]] },
      { from: [5, 11], through: [7, 10], months: [["N", 0]] },
      { from: [7, 11], through: [9, 10], months: [["U", 0]] },
      { from: [9, 11], through: [12, 10], months: [["Z", 0]] },
      { from: [12, 11], through: [12, 31], months: [["K", 1]] },
    ],
  },
  CT: {
    source: "W036 pp.19-20: October and July in spring and summer; December and January after September; March in November-December",
    side: "both",
    windows: [
      { from: [1, 1], through: [3, 10], months: [["H", 0]] },
      { from: [3, 11], through: [7, 10], months: [["N", 0], ["V", 0]] },
      { from: [7, 11], through: [9, 30], months: [["V", 0]] },
      { from: [10, 1], through: [10, 31], months: [["Z", 0], ["F", 1]] },
      { from: [11, 1], through: [12, 31], months: [["H", 1]] },
    ],
  },
  ZS: {
    source: "Commodities p.326: buy for long account the May and July options",
    side: "long",
    windows: [
      { from: [1, 1], through: [5, 10], months: [["K", 0], ["N", 0]] },
      { from: [5, 11], through: [7, 10], months: [["N", 0]] },
      { from: [7, 11], through: [12, 31], months: [["K", 1], ["N", 1]] },
    ],
  },
};

export interface ContractMonth {
  code: MonthCode;
  year: number;
  /** Root, month code and two-digit year, as `futuresContractOf` reads it ("ZWK27"). */
  symbol: string;
}

export interface ContractMonthChoice {
  root: string;
  /** Gann's named months for the date, nearest first. */
  months: ContractMonth[];
  front: ContractMonth;
  source: string;
}

const key = (m: number, d: number) => m * 100 + d;

/**
 * Gann's contract month for `root` on `asOf`, or null where he named none
 * (another market, or a short in soybeans).
 */
export function gannContractMonth(root: string, asOf: Date, side: "long" | "short"): ContractMonthChoice | null {
  const r = root.toUpperCase().replace(/^\//, "");
  const rule = RULES[r];
  if (!rule || (rule.side === "long" && side !== "long")) return null;
  if (Number.isNaN(asOf.getTime())) return null;
  const [year, month, day] = etDateKey(asOf).split("-").map(Number);
  const today = key(month, day);
  const window = rule.windows.find((w) => today >= key(...w.from) && today <= key(...w.through));
  if (!window) return null;
  const listed = LISTED[r];
  const months = window.months
    .filter(([code]) => listed.includes(code))
    .map(([code, offset]) => {
      const y = year + offset;
      return { code, year: y, symbol: `${r}${code}${String(y % 100).padStart(2, "0")}` };
    })
    .sort((a, b) => a.year * 100 + MONTH_NUMBER[a.code] - (b.year * 100 + MONTH_NUMBER[b.code]));
  if (months.length === 0) return null;
  return { root: r, months, front: months[0], source: rule.source };
}
