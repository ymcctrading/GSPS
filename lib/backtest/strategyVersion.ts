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
// continuation pass (Gann's with-the-daily-trend rule, isGannContinuation);
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
export const STRATEGY_VERSION = "2026-10-15-gann-held-bottoms";
