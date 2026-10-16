/**
 * "Freeze a strategy version before shadow/live-paper tracking" — the
 * Validation, Backtesting, Audit & Compliance spec pack's requirement that a
 * performance claim be tied to the exact rule set that produced it, not to
 * "whatever the code does today".
 *
 * This is a manually bumped identifier, not a hash of the scoring modules:
 * a hash would change on any refactor that touches those files even when no
 * rule changed, which is noise this is meant to avoid. Bump it deliberately
 * whenever a change lands that could move backtest results — the same set
 * `docs/BACKTESTING.md`'s "So what does move the numbers" section lists
 * (`lib/scoring/score.ts`, `lib/scoring/proximity.ts`, `lib/scoring/weights.ts`,
 * `lib/strat/patterns.ts`, `lib/strat/levels.ts`, the Signal and Regime Engine
 * states) — and note the bump in `CHANGELOG.md`.
 */
// 2026-09-27: Gann's own swing charts (3-Day Chart and 7-day weekly chart on
// highs and lows, trend turns on breaking the last swing extreme) replace the
// close-count 3/9 charts under swingChartTrend, the regime engine, readTrend
// and the entry trigger's pivots. Conflict X3, owner decision.
// Same day, second bump: Gann's change-of-trend rules in the trend read
// (over-balance of space/time, monthly-low break), his fractions of the year
// and day-count bands in the time windows, his major percentage-of-price
// levels in the S/R list, and the Rule of Three scored on weekly and monthly
// closes as well as daily.
// Third bump (owner decision 5): Gann's breakaway rule. A range-bound setup
// whose entry stays inside its 13-week range is held from Execute to Watch.
// Fourth bump (parity C4 and D1): equity TP1/master taken from Gann and S/R
// levels, and the volume criterion reads Gann's full rule (drying-up bottoms,
// lower-volume retests, the climax as the panic exception).
// 2026-09-28 (owner): Gann's even figures move equity stops beyond, and add
// targets just short of, round numbers (lib/gann/evenFigures.ts via
// computeEquityTradeLevels); live and paper exits switch to Gann's rules with
// 60% at TP1 (replay exitRule "gann-runner"). The ⅓ and ⅔ seasonal dates join
// the fixed calendar. New context readings are measured, not scored.
// Same day, second bump: Gann's "3 points" in the exit rules is price-scaled
// from his own bands (lib/gann/pointScale.ts) instead of the entry's 0.3%
// lost-motion margin; the STRAT shape no longer gates publication or the
// continuation pass (Gann's with-the-daily-trend rule, since replaced by
// isWithGannTrend in item 6 step 11);
// the replay's pyramid adds now fire; macro/decade cycles read as of the bar.
// Third bump: Gann's three-adverse-closes exit reads the first three sessions
// from the fill, as the source counts them, not any three closes in the trade.
// 2026-09-30 (owner): a breached stop retires the plan until Gann's own test
// confirms it or a new plan replaces it (lib/gann/stopBreach.ts). The live scan
// holds a broken plan to Reject; it stands again only if a closed bar closes back
// through the broken level by his 3-point allowance (a failed break); the replay
// does not enter a plan whose stop an earlier candle of the session traded
// through, and reinstates it on the same closing test.
// 2026-10-15 (owner: "Use Gann's full 3 points now"): the entry side uses the
// same price-scaled 3 points as the exits (lib/gann/pointScale.ts) instead of
// 0.3%: the trigger crosses the old top or bottom by 3 points and the confirm
// break stage adds nothing more; the trigger's stop, structural equity stops,
// even-figure stops, the 2-3 day halt stop, multiple-top crossings, the
// accumulation breakout and the pyramid add all sit 3 points beyond.
// Same day, second bump (PLAN.md item 4): every plan is Gann's reaction buy.
// A close 3 points past the old level arms it; the entry is a limit at the
// level plus 1 point and the stop the level less 3 points (W006 pp.20, 46-47),
// replacing the retest-and-hold confirmation and the S/R-band and ATR stops.
// The paper simulator fills limits as limits. Replay rule: entryRule "reaction".
// Gann's exits also trail the stop 3 points under each completed week's bottom
// (over its top when short) once the trade is into a new week (W006 p.46).
// PLAN.md item 5, step 1: the crossed level stays the buying point through a
// reaction until a close breaks it by 3 points, instead of moving to the new
// top the reaction completes; plan confirmations read back past the plan's
// generation; the replay defaults to the reaction rule. Review fixes the same
// day: the held level is the one crossed most recently, it ends once a later
// bar trades to the buy (bought) as well as when broken, its stop is the
// level less 3 points, and the breakaway range is read up to the crossing.
// Once bought, the level is not offered again until a newer top forms. A
// trigger on a range's own extreme now counts as the breakaway on every setup
// (it came down to floating-point noise before). The replay treats a held
// level as already crossed, as the live scan does.
// No run was committed on "2026-10-15-gann-crossed-level-held".
// PLAN.md item 5, step 2: Gann's double and triple bottoms (tops) are a
// buying point too, a resting order at the last completed bottom with the
// stop 3 points under it (W006 pp.11, 20, 46; shorts pp.22, 47). Of that and
// the crossing, the plan is priced from the one nearer the price. Plans store
// the kind (migration 0086). An old-level entry is not held by the breakaway
// rule inside a range (put to the owner, built on the recommended option).
// The buying point is read from the same window on every surface: the 52
// weeks of completed sessions before the day (`entryChartBars`). The replay
// had read all six years it holds, and the live scan included the session
// still forming. No run was committed before this was added. Review fixes
// the same day, also before any run: only the second and third test of a
// bottom are bought (a fourth is neither a double nor a triple bottom), and
// bottoms count only since a low last went more than 3 points under the
// level; a plan whose stop closes through before it arms never arms; and an
// old-level position has no crossed level to hold, live or in the replay.
// PLAN.md item 5, step 3: the previous year's top and bottom, and the record
// top and bottom before those 52 weeks, are crossed and bought like any old
// level (W006 pp.20, 22, 24, 47), read from the monthly chart on every
// surface. Two crossings as near as each other go to the older level.
// No run was committed on "2026-10-15-gann-older-levels".
// PLAN.md item 5, step 4: a bottom that held is a buying point too, bought at
// the last close with the stop 3 points under the low (W006 pp.20, 24,
// 46-47): a low that has stood into its second week, a low that has held two
// days after a reaction of two to three weeks in a bull market, or a record
// low that has held for weeks without a 3-point break. Shorts mirror the
// first. It is offered only where its risk stays inside the 5-point limit,
// and it rests like a double bottom, with no crossing to confirm first.
// No run was committed on "2026-10-15-gann-held-bottoms".
// Step 3 review, 2026-10-16: every previous year's top and bottom in the ten
// calendar years before the day is a level, not only last year's, and each
// stays a level after the next New Year (W006 pp.20, 22, 24, 47: "a previous
// year"). Every surface reads the same ten years, and the replay fetches them
// before its first session. A level is crossed only by a close the chart
// shows going through it; a broken level crossed again is dated by the later
// crossing. Once a level is bought, a top the rally already crossed is not
// offered; an uncrossed one still is. Two readings of one level within a cent
// or 0.1% are one level, and the replay buys it once.
// Run 36 measured "2026-10-16-gann-every-year" (run 35 failed at checkout).
// Step 4 review, 2026-10-16: a held bottom is bought once; after a session
// trades to the buy it offered, the next needs a new low. The record low has
// to hold four weeks within 3 points of it, counted from the day price came
// back there. The days form reads its reaction at the low, so it still holds
// on the third day up. A level the price already stood over when the count
// starts is crossed again only after a break. The replay buys a level crossed
// again after a break, as the live scan does.
// Step 4b, 2026-10-16: the bear-market rally sell (W006 p.47, Rule 4). In a
// bear market, a rally that has run two to three weeks is sold at the close
// of the week's last session, with the stop 3 points over that week's high.
// Step 4b review, 2026-10-16: a counter-move is timed from its extreme since
// the weekly chart last turned, so a 3-day pullback inside a rally (or a bounce
// inside a bull-market reaction) no longer restarts its clock; one rally is
// sold once; a rally is over once the weekly chart turns down from its top.
// Item 6 step 3, 2026-10-16: a month's low (high) is the month so far, so a
// break early in the month still stands later in it (A-TREND-11/-12). The
// break warns instead of ending the trend: the trend holds while the reaction
// stays above the previous section's top (A-TREND-06), and only an
// over-balance of space or time ends its confirmation. While the month stands
// broken against the trade, Execute is held to Watch, live and in the replay.
// Item 6 step 4, 2026-10-16: the regime reads rising or falling tops and
// bottoms from the 3-Day Chart swings readGannTrend uses, not a second
// fractal-pivot test, so a trend those swings confirm is a clean trend for the
// pullback and breakout states (regime labels and plan expiry can move).
// Item 6 step 6, 2026-10-16: never too high to buy while the trend is up
// (W006 pp.22, 38-39). The coarse reversion score no longer counts distance
// from the 50% point (live only; the replay has no coarse pass), and the
// confirmed-reversal state's meaningful location is an old level only.
// Item 6 step 7, 2026-10-16: the coarse pass reads the weekly trend rolled from
// its daily bars, and the daily only when the weekly shows none (W006 p.19).
// Live only: the replay has no coarse pass.
// Item 6 step 8, 2026-10-16: a regained old bottom is a buying point (A-TREND-10,
// W006 p.30): an old bottom closed 3 points under, then 3 points back over, is
// crossed like a top and bought on the reaction 1 point over it, stop 3 points
// under. An old top lost after a 3-point break over it is the mirror sell.
// Item 6 step 11, 2026-10-16: never too high to buy while the trend is up
// (A-TREND-09, W006 pp.22, 38-39). The buying point with Gann's weighted trend
// arms on the trend alone, live and in the replay (armSessionEntries,
// isWithGannTrend): no 4-hour spike, range expansion, 120-session floor,
// two-of-three breadth, Execute bar or two-slot quota, and it competes with
// the reversions for the list's slots by score. With no trend on any chart the
// nearer side's buying point arms (fork F4 a), where the scan used to sell.
// Item 6 follow-up, 2026-10-16: a bear-market rally is sold only while Gann's
// weighted trend is down (A-ENTRY-18, the bear market is the main trend;
// gannEntryOf), not on the weekly chart alone. Runs 39-40 measured the rally
// sale at -0.15R on 145 trades, armed almost all against the weighted trend.
// Item 6 review, 2026-10-16: a monthly break whose reaction has gone under the
// previous section's top ends the trend (W006 p.14, A-TREND-06; the owner's
// option, which the code had not yet applied), live and in the replay. Live
// only: the coarse pass reads the monthly chart first when its bars are in,
// keeps trendless symbols for the reversion pass, and the sell list is cut
// after the shortable check.
// Item 7 step 3, 2026-10-16: a counter-move still making new extremes in its
// third month (after day 60) changes the trend (A-TIME-01/-02, W006 p.38),
// alongside the over-balances of space and time, live and in the replay.
// Item 6 second review, 2026-10-16: a section's top is the weekly chart's
// turning point, not every 3-Day swing (W006 p.14), for the section-top rule
// and the third-month clock; a reaction that broke a month and went under the
// previous section's top keeps the trend changed until a new section top.
// The graduation exam and the live exit manager price entries through
// gannEntryOf, as the scan does.
// Item 7 review, 2026-10-16: only a record weekly top (bottom in a bear
// campaign) starts a section, so a lower weekly top inside a reaction no longer
// moves the section rule or the third-month clock; Gann's exit for a change of
// trend now also fires on those two calls when they arise after the fill; the
// live exit check and the exam no longer read the rest of the entry's month.
// Item 7 step 4, 2026-10-16: time to hold (A-TIME-12, W006 p.23). A pyramid
// add waits until the trade has shown a profit at its first close and again
// three days on; a first close against the trade is shown as a warning. In the
// replay's pyramid and the live add suggestion alike.
// Item 7 second review, 2026-10-16: Gann's change-of-trend exit compares the
// reaction itself, so a new section's own third-month or section call after
// the fill exits even when the last section's call stood at entry (L-c). The
// class C time readings were corrected (angle timing, weekday day counts, the
// 90-day half-and-half record, the seasonal steps' dates, and 13 years of
// monthly bars for the 144-month count); those are context only.
// Same day (PLAN.md item 8 step 3): Gann's volume rules in the scored
// volumeClimax criterion. Retests compare the turns' weeks (FV3); lower
// secondary tops, higher secondary lows out of a bear, a panic's quiet
// secondary low, the heaviest week before a top and the smallest month in
// five years also confirm (FV1, FV4, FV5); completed sessions only.
// Same day (item 8 step 4, FV6 b): a reaction buy out of a range waits until a
// completed session closed past the crossing line on more than the range's
// mean volume (A-VOLUME-10), at confirmation live (readEntryConfirmationNow)
// and in the replay's reaction rule; buys resting at a level are exempt.
// Item 8 review, same day: the smallest month in five years confirms only a
// bottom (the lowest of the half year before it) printed in or up to two months
// before that month, or in the month since (H1); the heaviest week before a top
// must come after the low's week, not in it (M2).
// Item 8 step 5 (fork FV7 b): after a lower top, a narrow spell broken down on
// volume holds a new long to Watch and exits an open one while it stands
// (A-VOLUME-03), on the live scan, the live exit manager and the replay.
// Item 8 second review, same day: the breakdown needs Gann's "dull, narrow"
// spell (no wider than twice the 3 points, quieter than the sessions before;
// M1); a long is neither placed nor entered in the replay while one stands, and
// an open long exits whenever it was bought (M2); a retest of a top or bottom
// must not cross it by the 3 points, which moves the volume criterion (M3).
// Item 10 review, same day: a top crossed (bottom broken) by more than the 3
// points is no longer read as a lower secondary rally (higher secondary low),
// H1; "the same level" for a retest is Gann's 3 points on the near side too,
// not 1% (M3). Both move the volume criterion.
// Item 9 step 4 (level parity), same day: the trends' support and resistance,
// the target angles, the retracements, Gann's percentage levels and the
// disclosed rules read one set of charts on both surfaces (lib/scan/
// levelCharts.ts): 52 weeks of completed sessions, 5 years of Monday weeks, 10
// calendar years of months, each bar in progress from completed sessions. The
// replay had read up to six years of daily bars and rolled-up weeks and months.
// Item 9 step 5 (fork FL1 a), same day: an old top a later close clears by
// Gann's 3 points is support and an old bottom broken by them is resistance
// (A-LEVELS-01, -05), in the trends' level lists (stops, targets, the coarse
// filter, historicalSR) and the level-test reading, live and in the replay.
// Item 9 step 6 (fork FL5 a), same day: the retracement point scores on Gann's
// retracement zone alone; the digital-root reading no longer gates it and
// stays on the card as context (C-NUMEROLOGY-04, class C never gates).
// Item 9 step 7 (fork FL3 a), same day: a failed double or triple top holds a
// new long from Execute to Watch, refuses its placement and is not entered in
// the replay, and exits an open long when it fails after the fill (shorts
// mirror at bottoms; A-LEVELS-04), all on the 52-week entry chart.
// Item 9 step 8 (fork FL6 a), same day: plan targets come from the Square of
// Nine only (the ATR-spaced fan prices left the TP1 and master pool), and the
// unbroken old campaign bottoms under the price join the support and
// resistance pool on both surfaces (A-LEVELS-03).
//
// 2026-10-16-gann-failed-tops-path: review 11 H1/M1. The failed-top hold and
// the placement wait apply only when the failed top (or bottom) lies between
// the entry and TP1, so the double-bottom buy at a range's foot is no longer
// held; the failed-top exit reads the 52 weeks before each session, and fires
// when the top fails after the fill.
//
// 2026-10-16-gann-failed-tops-third: review 12. A TP1 at a failed top or
// within its 3 points sells at the top and is not held; an open long exits
// when a later test of an excused failed top fails after the fill; placement
// reads the protocol's TP1 and holds under any failed test when it is unknown.
// No run was made on the version before it.
//
// 2026-10-16-gann-failed-tops-passed: owner card, recommended option. A failed
// double or triple top stays failed until a close passes it by the 3 points or
// a new swing replaces it, not only while price is 3 points under it.
//
// 2026-10-16-gann-failed-tops-latest: review 13. A failed top is judged on
// the latest top's own cluster, so an older level nearer to price no longer
// hides it; a trade is in its path while the entry is short of passing it;
// Guided Mode and the demo send the protocol's TP1.
//
// 2026-10-16-gann-failed-tops-crossing: review 14. A crossing entry is exempt
// from a failed top only when the level it crosses is at or past that top;
// a crossing of a lower level is held. Confirmation and placement read the
// crossed level from the protocol's own stop, never an attached one.
//
// 2026-10-16-gann-failed-tops-cent: review 15. The crossing exemption allows
// a cent, so placement, which rebuilds the crossed level from cent prices,
// agrees with the scan and the replay at an equal-tops double top.
//
// 2026-10-16-gann-failed-tops-exact: review 16. The cent's tolerance came off
// the scan and the replay, which pass the exact level (on a 16-cent coin it
// excused a lower second top). Only placement, which rebuilds the level from
// cent prices, reads it half a cent in the trade's direction. Verdicts match
// failed-tops-crossing.
//
// 2026-10-16-gann-failed-tops-epsilon: review 17. The crossed-level
// comparison allows a relative 1e-9, so a crossing of three equal tests whose
// running mean drifted a float step past the price is no longer held.
//
// 2026-10-16-gann-failed-tops-daily-close: owner ("If Gann says it's a rule,
// then it's a rule"). A failed top is passed only by a daily close 3 points
// beyond it (W006 Rule 3; Master Course rules 4-5, "wait for a close beyond
// it"). The crossing exemption is removed: a 15-minute crossing no longer
// lets a buy through a failed top, on the scan, the replay, confirmation or
// placement.
//
// --- from main (PR #310) ---
// 2026-09-30 (owner: "zero gaps", COE and MOF "embedded throughout"): the S/R
// list gains Gann's Square of 144 square ends and centres and the nearest
// resistance points of his planetary averages (the six, the MOF and the COE,
// heliocentric and geocentric), via lib/gann/masterLevels.ts on the live scan
// and the replay. The Master Calculator's time readings, the circle of 360°
// and the GA-32 time angle are new measured context, not scored.
// 2026-10-16: both 2026-09-30 changes together once PR #306 was merged with
// main (the stop-breach retirement and the calculator/planetary levels).
// 2026-10-16 (owner, 2026-10-01: "every Gann method acts"): the S/R list also
// gains the nearest active angle above and below price for Jupiter, Saturn and
// Uranus (a planet's longitude, square, trine or opposition, 1954 letter), via
// lib/gann/astroRules.ts#activeAngleLevels and masterLevels.ts; and the nearest
// point of Jensen's square of 90 above and below price (jensenLevels), on the
// placement recommended to the owner, who places Jensen item by item.
// Same day (owner: "Determine the best way to use Jensen work", delegating the
// placement): Jensen's square of 90 is laid at the high as well as the low,
// repeats past 90 points, and includes the 7½ and 15 trine points
// (lib/gann/jensen.ts), so the Jensen levels move again.
//
// 2026-10-16-gann-parity-jensen: PR #309 merged with main after PR #310. The
// failed-top daily-close rule and level parity now sit together with the
// Square of 144, planetary-average, active-angle and Jensen levels. The
// master levels are read from the same level charts on the scan and the
// replay (lib/scan/levelCharts.ts).
//
// 2026-10-16-gann-batch-review-fixes: the batch reviews of the built rules.
// The days-form reaction buy needs the main trend up, not the weekly chart
// alone (A-ENTRY-08, read as the rally sale's bear market is), and the
// breakaway's volume condition applies to narrow ranges only (A-VOLUME-10,
// NARROW_RANGE_ALLOWANCES in lib/gann/breakaway.ts).
//
// 2026-10-16-gann-narrow-week-sale: a narrow week followed by a sharp drop on
// large volume is a sale (A-ENTRY-19, W006 p.27), resting 1 point under the
// narrow week's low with the stop 3 points over it (narrowWeekSell in
// lib/gann/entryTrigger.ts), with no bear market needed.
// 2026-10-16-gann-distribution-short: a short on a swing bottom needs a
// distribution spell first (A-ENTRY-15, W006 p.22): ten narrow sessions near
// the top in the 13 weeks before, held above the bottom. A previous year's or
// the all-time bottom needs none. Fewer swing shorts arm, so the verdicts move.
// 2026-10-16-gann-no-pattern-hold: the bare 2-2 hold is gone (N#1). It was
// the last bar-sequence pattern that could hold an Execute verdict to Watch,
// and no such pattern may gate a verdict. Some Watch verdicts become Execute.
// 2026-10-16-gann-rule-of-three-3: the Rule of Three's bullish signal is the
// third higher close, not the second (M-R3, WSSS pp.67-74: a declining stock
// "will never close more than 2 days with gains"). The scored ruleOfThree
// criterion passes less often on buys, so verdicts move.
// 2026-10-16-gann-review21-fixes: the distribution gate on swing shorts now
// spares an old top lost by 3 points and the intraday profile, and its spell
// is narrow at 2 allowances, as the distribution rule reads one (review 21).
// 2026-10-16-gann-level-three-points: "at a level" (historicalSR, the
// retracement zone, and the coarse pass's fan and S/R gates) is within Gann's
// price-scaled 3-point allowance, not half a day's average true range (N#27).
// The bands widen on most names, so more setups score those points.
// 2026-10-16-gann-failed-top-highest-test: a failed double or triple top
// passes only on a close 3 points over its highest test (a bottom, under its
// lowest), not over the tests' mean (owner, Q22). Fewer failed tops lift.
// Same day (owner, 2026-10-01, "every Gann method acts"; gaps G26-G28): the S/R
// list gains the nearest line above and below price of Gann's full angle set
// (16x1 to 1x16, on the Gann point) from the major pivots, with each angle
// copied to the preceding opposite pivot for the 45°, 2x1 and 4x1 only, as Gann
// parallels them in GA-12 to GA-16 (lib/gann/patternAngles.ts), so plan
// stops and targets can move. The Hexagon Chart's time counts and the Master
// Chart of 360°'s 48ths and sevenths are new measured context.
// 2026-10-16-gann-parity-angles: PR #309 merged with main after PR #311. The
// failed-top highest-test rule and the rest of #309 now sit with the pattern
// angles and their parallels.
// 2026-10-16-gann-angle-points: the fans, the scored angle slope, the square
// of price and time and the 50% fan read Gann points a daily bar on his full
// angle set (16x1 to 1x16), the unit and set the S/R angles use, not one ATR a
// bar on five angles (owner, Q27, "default to Gann's method"). The fan gate,
// gannAngleSlope and timePriceSquare move, so verdicts move.
export const STRATEGY_VERSION = "2026-10-16-gann-angle-points";
