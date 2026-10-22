/**
 * A-RISK-16: the twenty-four never-failing rules (*Wall Street Stock
 * Selector*, 1930, Ch. II pp. 18-28; repeated in *45 Years in Wall Street*
 * pp. 15-16; confirmed in the W005 and W009 reading notes, 2026-10-16).
 *
 * A check reading, not an order block: each rule records where GSPS already
 * carries it, or why it can't. Nothing here is imported by a placement path,
 * and `lib/risk/position-limits.ts` and `lib/risk/config.ts` are untouched.
 * The test beside it checks that every file named here exists, so a rule
 * can't quietly lose its home.
 *
 * Status:
 * - "enforced": a placement, sizing, exit or verdict path applies it.
 * - "differs": GSPS applies a related rule that isn't the same as this one.
 *   It's recorded for the owner and nothing is changed.
 * - "person": a rule about the trader's own conduct that no code can check.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Cause and Effect (each rule names the cause of a loss it
 *    prevents) and Mentalism (half the list is the trader's own mind).
 */

export interface NeverFailingRule {
  n: number;
  rule: string;
  status: "enforced" | "differs" | "person";
  /** Repo-relative file that carries it, when enforced or differing. */
  where?: string;
  note?: string;
}

export const NEVER_FAILING_RULES: NeverFailingRule[] = [
  { n: 1, rule: "Divide capital into 10 parts; never risk more than one part on a trade.", status: "enforced", where: "lib/risk/gannCapital.ts", note: "A trade risks at most a tenth of the trading unit (riskTenthRefusal), on top of 30 points of capital a share (NSTD p.46, Rule 1; Commodities pp.29-30). Checked at placement, paper and live, and in Guided and portfolio-manager sizing; never on a protective order. The replay measures R per unit and sizes no position." },
  { n: 2, rule: "Use stop-loss orders 3 to 5 points away.", status: "enforced", where: "lib/gann/pointScale.ts", note: "The price-scaled 3 points behind every stop." },
  { n: 3, rule: "Never overtrade.", status: "enforced", where: "lib/risk/position-limits.ts", note: "Exposure ceilings, with the capital rule's market limit." },
  { n: 4, rule: "Once 3 points ahead, move the stop to break-even.", status: "enforced", where: "lib/gann/exitRules.ts", note: "M-E6, the price-scaled 3 points." },
  { n: 5, rule: "Never buck the trend.", status: "enforced", where: "lib/scan/entrySelection.ts", note: "When both of a session's buying points arm, the with-trend one is the trade (chooseSessionEntry, D-04), and with no trend on any chart and no buying point the scan stands aside instead of defaulting to a short (applyStandAsideHold in lib/scoring/score.ts, D-05). Live and replay alike." },
  { n: 6, rule: "When in doubt, get out, and don't get in when in doubt.", status: "person" },
  { n: 7, rule: "Trade only in active stocks.", status: "enforced", where: "lib/scan/liquidity.ts", note: "The platform-wide liquidity floor every scan applies." },
  { n: 8, rule: "Spread risk over 4 or 5 stocks.", status: "enforced", where: "lib/risk/gannCapital.ts", note: "At most 5 stocks open at once (owner, 2026-10-16); crypto keeps Tunnel Thru the Air pp.203-204's two or three markets." },
  { n: 9, rule: "Never limit orders; buy and sell at the market.", status: "enforced", where: "lib/gann/entryTrigger.ts", note: "The reaction entry keeps its zone (W006 pp.20, 46-47) and drops the fixed price: once a closed bar trades into the zone the entry is a market order (gannBuyZone; Commodities rule 9 pp.43-45 and p.19). Placement, confirmation and the replay (next bar's open) read it. A limit a person prices themselves stays theirs." },
  { n: 10, rule: "Don't close a trade without a good reason; follow with a stop.", status: "enforced", where: "lib/gann/exitRules.ts", note: "Positions exit on stops and exit signals, not a fixed target." },
  { n: 11, rule: "Accumulate a surplus.", status: "person" },
  { n: 12, rule: "Never buy just to get a dividend.", status: "person" },
  { n: 13, rule: "Never average a loss.", status: "enforced", where: "lib/gann/pyramid.ts", note: "Adds only to a position in profit." },
  { n: 14, rule: "Never get out of the market because you have lost patience, or in because you are anxious from waiting.", status: "person" },
  { n: 15, rule: "Avoid taking small profits and big losses.", status: "enforced", where: "lib/gann/exitRules.ts", note: "No fixed target; the stop trails on structure." },
  { n: 16, rule: "Never cancel a stop after placing it.", status: "enforced", where: "lib/trade/place-order.ts", note: "Protective orders are never blocked by any gate." },
  { n: 17, rule: "Avoid getting in and out too often.", status: "enforced", where: "lib/risk/lossSeries.ts", note: "Three losses in a row pause new entries." },
  { n: 18, rule: "Be just as willing to sell short as to buy.", status: "enforced", where: "lib/gann/entryTrigger.ts", note: "Every entry rule has its short mirror." },
  { n: 19, rule: "Never buy because a price is low or sell short because it is high.", status: "enforced", where: "lib/gann/entryTrigger.ts", note: "Entries need a crossing of an old level, not a price level alone." },
  { n: 20, rule: "Pyramid only after resistance levels are crossed.", status: "enforced", where: "lib/gann/pyramid.ts" },
  { n: 21, rule: "Pyramid longs in stocks with small capital and shorts in stocks with large capital.", status: "enforced", where: "lib/gann/pyramid.ts", note: "Adds read the stored share count: longs under 500 million shares, shorts at or above it (an engineering cutoff; the text gives none). Live suggestion and replay alike." },
  { n: 22, rule: "Never hedge.", status: "person", note: "GSPS never opens a hedge; a person can." },
  { n: 23, rule: "Never change position without a good reason.", status: "person" },
  { n: 24, rule: "Avoid increasing trading after a long run of success.", status: "enforced", where: "lib/risk/dynamic-risk.ts", note: "The trading unit is never raised on the gains of a long run of wins (gannRiskCapital, readWinningRun: three closed wins in a row, an engineering count), at placement and in the portfolio manager. The replay sizes no position." },
];
