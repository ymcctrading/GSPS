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
// 2026-10-16-gann-stop-old-level: the scored stop point is Gann's old level 3
// points in front of the stop (W006 pp.20-24, 46-47; owner, Q23), on every
// asset class, replacing stopRoom (a 1.5x ATR multiple, or "anchored to S/R"
// for stocks). Verdicts move.
// 2026-10-16-gann-session-plans: a stored plan lasts the session it trades in
// (until the session's close; a plan made after the close, through the next
// one) instead of a 3-20 bar clock, and a broken stop retires it sooner (owner,
// Q17). The replay already armed one trigger per session, so its output does
// not move; live plans now match it.
// 2026-10-16-gann-time-window-turn: the shared time-window mechanism (owner,
// Q19, "Window"; A-TIME-15). A counter-trend Execute holds to Watch unless its
// swing extreme came on a dated window: Gann's pivot windows, his time counts,
// Jensen's dates or the planetary time readings (lib/gann/timeWindow.ts).
// Verdicts move.
// 2026-10-16-gann-queer-acting: leave queer-acting stocks alone (owner, Q24,
// "Both"; A-SELECTION-01): an Execute holds to Watch when under a third of
// the stock's last four or more buying and selling points carried on
// (lib/gann/ruleFollowing.ts). The universe floors stay. Verdicts move.
// 2026-10-16-gann-no-fixed-target: live and paper positions fix no profit
// target (owner, "Switch all nine", Q14; parity X4): nothing sells at TP1, the
// whole position runs on Gann's stop and exit signals, as the replay's
// `exitRule: "gann"` measures. Gann's capital rules (30 points a share, three
// markets; Q4, Q6, Q12) size and refuse orders. Verdicts do not move; trades
// and fills do.
// 2026-10-16-gann-reverse-when-caught (Q15, A-EXIT-02): a trade caught on a
// stop or a change of trend is reversed at Gann's geometry (lib/gann/reverse.ts):
// automation seeds the opposite plan, a person is offered it, and the replay
// walks it (`reverseWhenCaught`, default on).
// 2026-10-16-gann-book-rules: three rules confirmed in the read books move
// verdicts, stops and levels: break-even once 3 points ahead (M-E6), orders ¼
// to ½ point inside an even figure (M-P10), and no Execute whose first target
// is no farther than its risk (M-K5).
// 2026-10-16-gann-pyramid-capital: never-failing rule 21 (WSSS Ch. II): a
// pyramid add goes to a long only in a stock with a small capital stock and
// to a short only in one with a large capital stock (lib/gann/pyramid.ts,
// 500 million shares, an engineering cutoff). The live add suggestion and the
// replay's `pyramid: true` read the same rule. Verdicts do not move; pyramided
// trades do.
// 2026-10-16-gann-never-failing-1-9: never-failing rules 1 and 9. Rule 9
// ("never limit your orders ... trade at the market", Commodities rule 9
// pp.43-45 and p.19): the reaction entry keeps its zone and goes at the market
// once a closed bar trades into it, so the replay fills at the next bar's open
// instead of a limit at the level plus 1 point, and a close through the stop
// before then calls the entry off. Fills move; R is still read on the plan's
// risk. Rule 1 (a tenth of the trading capital at most, NSTD p.46,
// Commodities pp.29-30) refuses or shrinks orders; the replay sizes no
// position, so it does not move the replay.
// 2026-10-16-gann-rule-of-three-closed: the live score's daily Rule of Three
// reads completed sessions only, as the replay already did (review 25, R3-3).
// Live verdicts move on days the forming session would have tipped the
// count; the replay does not move.
// 2026-10-16-gann-stops-and-steps: W006 Rules 2, 4 and 5 and Tunnel p.198.
// Shorts trail 1 point over the prior week's high (Rule 4; was 3). In the
// final stage the stop trails 5 points under the last day's high, mirrored
// for shorts (A-STOP-04). Pyramid adds come every 5 Gann points of profit
// instead of one risk unit (A-PYRAMID-01/06), and the whole line's stop goes
// to the tighter of break-even and 5 points under the add (A-STOP-06). Exits
// and pyramided trades move; verdicts do not.
// 2026-10-16-gann-yearly-count-windows: the time-window hold (Q19) also reads
// the yearly counts (`MAJOR_CYCLE_YEARS`, A-TIME-11's 20 years among them) on
// the monthly chart closed before the turn's month (`yearCycleHits`), on the
// live scan and the replay alike. A counter-trend Execute whose 3-Day Chart
// turn lands an exact number of those years from a major monthly pivot of the
// same side now acts where it was held to Watch. The longest monthly series
// held is 13 years, so in practice the 1-10-year counts reach it; the 20-year
// count needs a longer series. Same batch, no verdict change: generated report
// dates no longer set the regime's turn date (A-TIME-36), and the late-top /
// early-top bottom readings are context only (A-TIME-08).
// 2026-10-17-gann-rebuy-after-stop: A-PYRAMID-07 (W022 p.198; owner's pick,
// "Re-buy after stop"). Under Gann's exits, a trade left on a trailing stop
// while the swing chart still runs its way rests a re-entry 12 points back from
// its best price, stop half the reaction beyond (`lib/gann/rebuy.ts`), and any
// reversal opened at the stop is covered there (`rebuyAfterStop`, default on).
// New re-entry trades appear and some reversals leave earlier; verdicts do not move.
// 2026-10-16-gann-selection-levels (feature-map batch V3): the lists and the
// full-scan shortlist put Gann's early leaders first (bottomed or crossed last
// year's top first for buys, topped or broke last year's bottom first for
// shorts; A-SELECTION-02/-03), weak stocks last among buys and first among
// shorts, and a buy in a weak stock holds to Watch (A-SELECTION-04). The
// first and second times through a major round number hold to Watch
// (A-LEVELS-08). The campaign's secondary rally top joins the S/R pool
// (A-LEVELS-02), so stops, targets and the S/R match move. Range divisions are
// ranked by Master Course Ch. 6's tiers (M-P1). The calendar-day 1x1
// (C-LEVELS-20) is context only. Verdicts, levels and list order move.
// 2026-10-17-gann-review-b-fixes: review B of the built rules. Only Jensen's
// square points join the S/R list; his trine points mark consolidation and
// stay context (C-LEVELS-21). Resistance points within 1% are averaged into
// one before TP1 and the master are read, as the stop's were (M-P4). Plan
// levels and targets move; the new weekly trend line, Master 12 grid and
// spectral-cycle changes are context only.
// 2026-10-17-gann-yearly-count-reach: the time-window hold's yearly counts
// read a separate monthly span, `YEAR_COUNT_MONTHLY_YEARS` (61), fetched in the
// same monthly request and windowed point-in-time on the replay, so the
// 20-year count (A-TIME-11) and the 30/50/60-year ones can act where the data
// vendor's history reaches. The class C counts keep `LONG_MONTHLY_YEARS`.
// 2026-10-17-gann-nine-pillars: the score's nine points are the nine pillars
// (lib/scoring/pillars.ts), each a combination of the method's selection and
// pre-trade checks; the nine former criteria are checks inside them. P9 needs
// the trigger, the stop behind an old level and the greatest-reaction rule
// (owner's "Stop required"). Every score moves; the 6/3.5 cutoffs hold until
// a replay on this version re-derives them.
// 2026-10-20-gann-session-entry: a scan with no direction asked of it (the
// symbol page, a batch scan, Guided Mode's recheck, the market scan's first
// pass) shows whichever of the session's two buying points armed, the nearer
// when both did (`chooseSessionEntry`), where it read the reversion alone. The
// replay already armed both (`armSessionEntries`), so it is unchanged; the
// published lists can now carry a with-trend setup from the first pass, and
// a symbol's page agrees with the list that named it.
// 2026-10-20-gann-p3-monthly-strength: P3(c) reads S6, the stock's monthly
// highs and lows against the market's (higher in its year's range for a long,
// lower for a short; lib/gann/leadership.ts#readMonthlyStrength), on the live
// scan and the replay alike. It replaces A-SELECTION-04's weak-stock reading.
// A stand-in for Gann's rank among peers, labelled in pillars.ts and the
// registry. P3 and so some scores move.
// 2026-10-20-gann-time-overbalance-extreme: the campaign ledger's over-balance
// of time measures the reaction in progress to its extreme so far, as a
// completed reaction is measured (top to bottom) and as the third-month rule
// already reads it. A reaction that made its low and has held no longer reads
// over-balanced while it waits for the 3-Day Chart to turn. P9's greatest-
// reaction rule, the trend read (`readGannTrend`), the Gann exits' over-balance
// call and the intraday over-balance factor all move.
// 2026-10-20-gann-closed-sessions: the live scan's daily reads that score or
// hold a verdict (swing chart, campaign leg, time cycles, angle slopes, the
// time-price square, volume climax, boiling point, ATR and momentum, the S/R
// test count, liquidity and large-cap, the distribution standing, and the
// Signal & Regime Engine's daily bars) take completed sessions only, as the
// replay's `buildMacroContext` does. Before this a live scan during the session
// scored today's unclosed bar, which the replay never sees. The replay is
// unchanged; live scores taken while a session trades move.
// 2026-10-20-gann-weekly-parity: the replay's weekly chart reads the provider's
// closed weeks, as the live scan's does, with the week in progress built from
// completed sessions on both (`levelCharts`). It had rolled its weeks up from
// daily bars, which differ from the provider's and hold no weeks before the
// daily history starts, so its weekly trend, weekly levels and weekly Rule of
// Three were not production's. The yearly cycles count the same months on both
// (`yearCycleMonths`: closed months, ten years back, at the session's noon).
// Replay readings that touch the weekly chart move; the live verdict does not.
// 2026-10-20-gann-time-pillar-no-window: P7 (time) scores price and time
// squared AND the reaction inside its time limit; the dated window is no longer
// one of its checks (it was open on 100% of random-walk turns). The pillar is
// read in pillars.ts on the live scan and the replay alike;
// `applyTimeWindowHold` still needs a window for a counter-trend Execute.
// Pending the owner's choice. P7 and so some scores move.
// 2026-10-21-gann-first-target: the equity TP1 is the first Gann or S/R level
// that pays more than the risk, not the nearest past a fixed 3% floor
// (lib/strat/levels.ts). Against Gann's 4-point reaction stop that level sat
// inside the risk on most stocks under about $250, so M-K5's even-money hold
// read as a price filter (526 of 701 trades at 6+ on the 2026-10-20 run).
// M-K5 itself is unchanged. Verdicts, plan targets and A-LEVELS-04's
// failed-top-in-path refusal (it reads TP1) move, live and replay alike.
// 2026-10-21-gann-narrow-range-breakaway: the breakaway hold (owner decision 5)
// reads a sideways market as Gann describes one, a narrow range held for weeks
// (Commodities pp. 51-52; Master Course "2-6 or 10-13 weeks in a narrow
// range"): `readBreakaway` needs the trend unconfirmed AND the 13-week range's
// sessions narrow (`isNarrowRange`, at least `MIN_RANGE_SESSIONS`), the same
// narrow the breakaway's volume rule already read. Unconfirmed alone held 28%
// of triggers on trendless random walks and 18% on walks rising 0.2% a day;
// now 12% and 3%. Verdicts move, live and replay alike, as does the capital
// stock's range reading (`capitalStock.ts`, context).
// 2026-10-21-replay-accounting: a reversal enters at the price the last of the
// position left at, not the blended exit (replay and paper simulator), and
// reversals and re-buys carry no inherited verdict, so they leave the buckets,
// score bands and factor tables. Fired entries with no plan are counted
// (`droppedPlans`). Replay buckets and reversal trades move; live verdicts do not.
// 2026-10-21-gann-overbalance-points-standing: the campaign ledger's
// over-balance of space compares swings in points (price), not percent of
// their start (Master Course Ch. 8, PDF 249, "a decline in points"; 45 Years
// Rule 8; Ch. 11A's reviews), and an over-balance of space or time stands
// after the reaction ends, until price goes back past the top (bottom) it fell
// from (Master Course PDF 244-245, 249: the secondary rally after it is the
// sale). P9, `readGannTrend`'s confirmation, the Gann exit's trend change and
// the measured factors move, live and replay alike.
// 2026-10-21-gann-weekly-line-trend: the trend pillar (P2) reads Gann's weekly
// green/red trend line (Master Course Ch. 8, p. 239; `weeklyOneBar.ts`), the
// chart its design and T1 name, instead of the 1951 7-day chart's trend, which
// inverted on every nine-pillar replay. Scores and verdicts move, live and
// replay alike.
// 2026-10-21-gann-universe-strength-rank: P3(c) ranks the stock among the
// scan universe (LARGE_CAP_UNIVERSE) by where its last monthly close sits in
// its year of monthly highs and lows, and passes in the strongest quarter for
// a long, the weakest for a short (S6: Commodities pp. 20, 47; Stock Selector
// Ch. VII; lib/gann/universeStrength.ts). Completed months only, read the same
// on the live scan and the replay. It replaces the stand-in against SPY alone.
// The rank also adds a step to `selectionStrength`, so list order moves. P3
// and so some scores move, live and replay alike.
// 2026-10-21-gann-with-trend-first (on top of the universe rank): a scan with no direction asked of it (the
// symbol page, batch scans, Guided's recheck) shows the with-trend buying point
// whenever it armed, the reversion only when it alone armed ("never buck the
// trend", WSSS pp. 18-19 rule 5; owner: "What would Gann do"). Page verdicts
// move; the list's continuation pass and the replay arm as before. Same day,
// the percent-of-equity ceilings apply to Novice only and the portfolio
// manager has no daily count: placement and sizing, not verdicts.
// 2026-10-21-gann-decade-in-year-turns: P1's year check (and the measured
// `decadeYearWithTrade`) reads the decade digit's character at the session's
// month, not the year's label. Gann names turns inside four years (Master
// Course Ch. 7, PDF 223-224): a '6' year's bull "ends in the Fall" (September
// to November mixed, December bearish), a '9' year culminates September to
// November, and '3' and '10' years rally to March/April before the bear year.
// The fall of 2026 had read bullish, giving every long the point free. P1 and
// so some scores move, live and replay alike.
// 2026-10-21-gann-major-range-levels: P5's percentage check divides the major
// ranges by 8 and by 3, in Gann's order (the extreme range, the highest price,
// the latest campaign of a year or more: Master Course Ch. 9, PDF 263-264;
// Commodities pp. 34-35; 50% first, 45 Years Ch. IV), instead of the last
// daily swing (`lib/gann/rangeDivisions.ts`, read in `readPillarFacts`). The
// S/R check reads the nearest level of the wanted role (support below price
// for a long, resistance above it for a short; `srMatchForSide`) instead of
// the nearest of either role. Scores and verdicts move, live and replay alike.
// 2026-10-21-review-session-clock-sub-dollar: the live scan reads its dated
// reads (pillar facts, disclosed rules, volume, campaign bottoms, master
// levels, distribution) at the session's noon UTC, as the replay always has,
// instead of the wall clock, whose UTC date runs a day ahead after 8 PM New
// York time (review finding F-03). Non-equity plans round each price to the
// places its size needs (0.1612, not 0.16), refuse a plan whose rounded levels
// are not four distinct positive prices, and put a short's master on the
// largest eighth of the entry beyond TP1 when the R projection passes zero
// (F-02). The replay holds a crypto trade ten 24-hour sessions (960 candles),
// not 260 candles (F-06), and counts a win on the net, after-cost result its R
// is measured on (F-07). Evening live verdicts, sub-dollar crypto plans, the
// replay's crypto horizon and its win rates move; equity plans do not.
// 2026-10-21-review-gap-stop-fill: a stop a candle opens through fills at that
// open in the replays (the daily, the intraday profile and every reversal and
// re-buy walk), not at the stop, as the paper exit manager fills at the market
// (review finding R-022). Replay losses on gaps move; live verdicts do not.
// 2026-10-21-review-fixes-on-major-range-levels: the two lines above joined
// (the review fixes merged onto the major-range levels); no new rule.
// 2026-10-21-gann-narrow-weeks-breakaway: the breakaway's range is the narrow
// run of sessions counted back from the latest, 2 to 13 weeks
// (`narrowRangeSessions`), not the whole 13 weeks: Gann's "2-6 or 10-13 weeks
// in a narrow range, then crossing the tops or breaking the bottoms of the
// previous weeks" (Master Course pp. 246-248; Commodities p. 51). A narrow
// spell after a wide quarter is now a range, its own extremes the breakaway;
// the breakaway's volume reads the same run. Verdicts move, live and replay
// alike.
// 2026-10-21-gann-decade-month-et: the decade digit and its in-year turns
// (`computeDecadeCycle`, P1 and `decadeYearWithTrade`) read the year and month
// in New York time, not UTC. The live scan passes the wall clock, so from 8 PM
// ET on a month's last day it read the next month (on 31 December the next
// year's digit) while the replay of the same session read the current one;
// on 31 August 2026 that flipped P1 from bullish to mixed. Evening scans on a
// month's last day move; the replay, which reads the session's noon, does not.
// 2026-10-21-replay-daily-closed-session: on a 1Day replay the reaction and
// confirmed rules read each closed bar against the plan its own session armed
// (priced from the sessions before it) and fill at the next session's open.
// Before, the closed bar was read against the next session's plan, priced from
// that same bar, so a crossing or an old level it traded into was already
// spent and never filled, and a held bottom's entry, that bar's own close, was
// always traded into: the six-year 1Day run put all 4,479 trades under "hold".
// 1Day replay trades move; intraday replays, the live scan and verdicts do not.
// 2026-10-21-review-fixes-on-replay-daily-closed-session: the review fixes
// above merged onto main's narrow-weeks breakaway, decade month in ET and
// closed-session daily replay; no new rule.
// 2026-10-21-gann-group-strength-rank: the same rank is also read within the
// stock's industry group (S4, "buy the strongest stocks in the group", Stock
// Selector Ch. VII), groups from SEC industry codes checked in
// (lib/gann/industryGroups.json). P3(c) passes on the strongest quarter of its
// group or of the universe (the weakest, short), as its design reads S6, and
// `selectionStrength` counts either. Scores and list order move, live and
// replay alike.
// 2026-10-21-gann-square-against-move: the price and time square (P7's first
// check and the timePriceSquare check) reads the move against the trade, the
// decline from the last high for a long and the rally from the last low for a
// short, not the trade's own anchor. A balance marks a turn, measured "up from
// lows" and "down from highs" (Master Course Ch. 18, PDF p.440), so the advance from the
// low squaring out says a top is due, against a long. Verdicts move, live and
// replay alike.
// 2026-10-21-gann-nine-square-price: the Square of Nine's fixed numbers act
// as price levels (C-LEVELS-15; Master Course Ch. 2 PDF 68, "great resistance
// points", 73 as corrected in Ch. 15A). The nearest cardinal- or fixed-cross
// number below and above price, read in Gann points, joins the S/R list
// through gannMasterLevels (lib/gann/squareOfNinePrice.ts), live and replay
// alike; the 22.5° lines are left out. historicalSR, stops and targets read
// it, so verdicts and plans move.
// 2026-10-21-gann-held-old-level: the historicalSR check (P5's old-level
// half) passes when the last reaction stopped at an old level and held, not
// when a level sits near price (W006 p.20, Rule 3(b)-(c); *Truth of the Stock
// Tape*). For a long, the lowest low of the last 10 completed sessions printed
// from 3 Gann points under an old support to 1 over it, at least 2 sessions
// ago, with no close since 3 points through it; the short mirrors it. Old
// levels are the weekly and monthly pivots, the percentage levels, the
// campaign bottoms and the secondary turn (lib/gann/heldLevel.ts,
// lib/scan/structuralLevels.ts, one builder for both surfaces). The S/R list,
// stops, TP1 and MTP are unchanged. Random walks: 98-100% passing before,
// 27-50% after. Scores and verdicts move, live and replay alike.
// 2026-10-21-gann-square-of-nine-16-lines: the Square of Nine's price levels
// come from all 16 of its lines, one every 22.5° (Gann's plate, Vol. 3 p. 34;
// source note B12), not the 8 every 45°. The nearest six that join the target
// pool are denser, so plan targets move, live and replay alike.
// 2026-10-21-gann-stand-aside-no-trend: with no trend on any chart and no
// buying point armed, the live scan stood on the short side by default; it now
// stands aside (Reject; never-failing rules 5 and 6, D-05). The replay scores
// only armed triggers, so its trades do not move; live verdicts can.
// 2026-10-21-review-second-round-on-held-old-level: the two entries above
// merged onto main's group rank, square against the move, Square of Nine price
// numbers and held old level; no new rule.
// 2026-10-21-gann-held-range-division: P5's percentage half
// (gannRetracementConfluence) passes on a division of the major ranges that
// the last reaction stopped at and held (heldRangeDivision, historicalSR's
// rule), not on one inside the 3-point allowance (Master Course Ch. 9, PDF
// 266-277: "held 2½ above 193"). Random walks: 56-92% before, 37-62% after.
// Scores and verdicts move, live and replay alike.
// 2026-10-21-gann-definite-indication: P9 counts the definite indication
// only once it has shown: a crossing scores once the close is 3 points past
// the old top (GannEntryTrigger.held), not while the plan waits for it; the
// old-bottom and held-bottom buying points score as they stand (W006 p.20,
// Rules 1 and 3(b)-(c)). On random walks 51-77% of armed triggers were
// crossings not yet made. The plan and tradePlanReady are unchanged; scores
// and verdicts move, live and replay alike.
// 2026-10-21-gann-monthly-forty-five: P6's 45° test reads the monthly 45°
// at 1 Gann point a month from the last bottom of the 3-month swing chart (the
// last top for a short), not the daily 45° at 1 point a day (Master Course
// GA-2/3, GA-7/9, GA-21-23, printed p. 199). Random walks: 1-13% before,
// 16-64% with no drift after, and longs ahead of shorts in an uptrend. The
// squeeze still reads the daily angles. Scores and verdicts move, live and
// replay alike (readPillarFacts).
// 2026-10-21-gann-one-plan-every-market: crypto and commodity plans take
// the same level plan as stocks (TP1 the first level paying more than the
// risk, the master the next level beyond), not 1.5R and 2.5-3R capped at 5R,
// which had no Gann source (*Commodities* pp.43-45: one rule, each market's
// own unit). Stock plans, scores and verdicts are unchanged; crypto targets
// and M-K5 on crypto move, live and replay alike. Adds the fast-market plan
// (`fastLevels`, Gann's day stop) beside the swing plan, and the replay's
// `tradeStyle` option to walk it; the default replay is unchanged.
// 2026-10-21-gann-group-rank-review: review of #388. The major-group fallback
// counts only the stocks left without an industry group, so no group is under
// five (762 symbols in 58 groups, was 778 in 65 with groups of one); a group's
// strongest is a quarter of its members rounded down, at least one (a
// percentile cut passed the top 2 of 5); and the group rank counts only in a
// group not itself in the universe's weakest quarter (strongest, for a short),
// since Gann ranks the groups before the stocks in them (TST Ch. XVI-XVII).
// Scores and list order move, live and replay alike.
// 2026-10-21-gann-fast-trail-after-fill: review of #405. The Fast style
// opens on the swing plan's entry and stop (Rule 3, W006 pp.46-47) and trails
// 3 points under each completed day's low from the fill's session
// (`readGannExit`'s "day_low"; W006 Rule 2 p.46), live, paper and replay
// alike; `fastLevels` and its day stop before the fill are gone. Every named
// market's plan is now refused when its rounded levels are not a priced plan
// (F-02's check, which crypto lost on the previous version). Swing verdicts
// and trades are unchanged except plans that round onto themselves. Merged
// onto 2026-10-21-gann-group-rank-review, whose rank it keeps.
// 2026-10-21-cutoffs-seven-four-one-entry: the replay trades one buying point a
// session, the one the live scan shows (`chooseSessionEntry`: the with-trend
// continuation when it armed, else the reversion), and sets the other aside
// (never-failing rule 5, *Commodities* pp. 43-45; review of #395 finding 4).
// It had traded both. The live scan records the set-aside point on its
// preference path too, and its error path reads Reject/stand down. That part
// leaves live verdicts unchanged; replay trade counts and buckets move.
// The Execute and Watch cutoffs go back to the protocol's 7/4 (owner,
// 2026-10-21): the 6/3.5 confirmation was read on the pre-fix 2026-09-23
// trigger. Live verdicts move. Merged onto
// 2026-10-21-gann-fast-trail-after-fill, whose Fast trail it keeps.
// 2026-10-21-review-sweep-square-sign-daily-firing-bar: two fixes from the
// after-merge review of #386 and #389. The price and time square only counts a
// move away from its pivot the way Gann measures it, up from a low or down
// from a high (Master Course Ch. 18, PDF p.440), so a long no longer takes P7's
// square when price has run above the last high. And on daily bars a reaction
// entry whose firing bar traded into the zone and also reached the stop (closing
// back or through it) is booked and stopped on that bar, not retired first,
// which had dropped every same-day stop-out. Verdicts move (the square), live
// and replay alike; 1Day replay trades move. Merged onto
// 2026-10-21-cutoffs-seven-four-one-entry, whose one-entry replay and 7/4
// cutoffs it keeps.
// 2026-10-22-gann-eclipse-break-window: M-S4 acts (Chuck, 2026-10-22, astrology
// "no longer research only"). A fast planet crossing, within a day, the
// longitude of an eclipse that fell within 10 sessions of a 3-Day Chart top is
// a dated window for a top in the shared time-window hold (`eclipseBreakOn`,
// Mikula W012 pp. 32-35, labelled reconstruction), live and replay alike. A
// counter-trend short Execute held to Watch for want of a window can now act. Merged onto
// 2026-10-21-review-sweep-square-sign-daily-firing-bar, whose square and
// firing-bar fixes it keeps.
// 2026-10-22-gann-mass-pressure: P1's cycle check also needs the market's
// mass-pressure curve not against the trade (A-OTHER-05, Master Course Ch. 7,
// PDF 224-228; *Commodities* pp. 11-12): the average of the month's move in
// every decade back to 70 years, as the 1936 forecast laid them, on Shiller's
// monthly S&P composite from 1871 (`lib/gann/massPressure.ts`,
// `marketHistory.json`), read from the session's date for a stock on both
// surfaces. The replay no longer hands crypto the stock market's bars (the
// live scan never fetched them), so a crypto replay reads no market trend,
// leaders, campaign length or mass pressure, as live. Live stock verdicts move;
// replay buckets move. Context only: `massPressureWithTrade`, the 84-year count
// (`eightyFourYear.ts`) and the Dollar Trend (`dollarTrend.ts`). Merged onto
// 2026-10-22-gann-eclipse-break-window, whose eclipse window and the fixes
// before it it keeps.
// (was STRATEGY_VERSION "2026-10-22-gann-mass-pressure")
// 2026-10-22-first-trade-chart-window: C-ASTRO-09 acts (Chuck, 2026-10-22:
// "Search for, confirm and ultimately use these dates"). For the 288 stocks
// whose first trade is confirmed by two sources (`firstTradeDates.json`), a
// Bucholtz transit to the first-trade chart, chosen on the 3-Day Chart swings
// before a turn and exact within 3 days of it, is a dated window in the
// time-window hold (`firstTradeWindows`), live and replay alike. A
// counter-trend Execute held for want of a window can now act on those stocks.
// (was "2026-10-22-first-trade-chart-window" on its own branch)
// 2026-10-22-first-trade-on-mass-pressure: the first-trade chart window above,
// merged onto 2026-10-22-gann-mass-pressure, whose mass-pressure check and
// crypto parity fix it keeps. No new rule.
export const STRATEGY_VERSION = "2026-10-22-first-trade-on-mass-pressure";
