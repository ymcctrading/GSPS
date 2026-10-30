## Gann & cycles research memory

`docs/GANN_HISTORICAL_SOURCES.md` is a running index of every Gann primary
book, Gann-adjacent secondary/interpretive work, and general cycle-theory
source reviewed to date, cross-referenced against what this codebase
actually implements (`lib/gann/`, `lib/scoring/`). **Read it before
proposing a new Gann-derived criterion, auditing an existing one, or
researching additional Gann/cycle-theory source material** — it exists so
a future session works from prior findings instead of re-reading source
PDFs from scratch, and it records which techniques are historically
disclosed-by-Gann-himself versus later reconstruction versus unrelated.
`docs/GANN_METHOD_COMPLETENESS_AUDIT.md` is the implementation audit built
from it.

**Every book in the collection has been read (owner, 2026-10-16).** Never
hold a rule as unverifiable on an unread book. The readings are in
`/mnt/project-files/literature-reading-output/` (the long books' per-work notes
under `external/checkpoint_v7/`, which numbers works its own way: its W023 is
the *Master Stock Market Course*, W005 *Truth of the Stock Tape* and the *Stock
Selector*, W001/W004 *Commodities*, W009 *45 Years*). Read-only. A rule found
in Gann's own text there is his rule and is carried; one found in no book stays
context only.

`docs/memory-bank/` holds the page-by-page reads (2026-09-27) of the Gann,
Observation of Cycles and Hermetic (Hauck) source folders, synthesised in our
own words with no book text stored. **Start with
`docs/memory-bank/GANN_CYCLES_HERMETIC_MASTER_REPORT.md`** when a question
about Gann's methodology, cycle validation or the Hermetic lens comes up.
Its Part V lists the open gaps, conflicts and corrections, all held for the
project owner. Per-source notes are in `docs/memory-bank/sources/`.
**`docs/memory-bank/GANN_PARITY_ROADMAP.md`** is the build plan toward a
faithful copy of Gann's disclosed method: a rule-by-rule parity matrix with
status, owner decisions and a staged build order. Update its rows when a
rule is built. **Owner decision 2026-09-27 on its decisions 1-3 (swing-chart
construction X3, "never fix a target price" X4, volume at bottoms X1):
"Gann's method supersedes my own. Implement Gann's method."** Decisions 4-7,
same day: (4) entry confirmation on every path, since it agrees with the
2026-09-26 766-symbol run; (5) always Gann's rules, so range setups are
Watch context and Execute needs the breakaway; (6) break-even and trailing
stops on Gann's structure; (7) astrology stays research-only, maintained
separately from the build. Scores may change so long as they follow Gann's
method. The owner wants the intraday use verified by measurement.
**Built the same day (B1):** `lib/gann/swingChart.ts` now implements Gann's
own 3-Day Chart and 7-day weekly chart (highs and lows; trend turns on
breaking the last swing extreme). Every "9-day chart" mention elsewhere in
this file describes the construction it replaced. `STRATEGY_VERSION` is
`2026-09-27-gann-swing-charts`, and the 6/3.5 cutoffs need re-deriving on it.
**Built the same day (decision 5):** `lib/gann/breakaway.ts` and
`applyBreakawayHold` hold a range-bound Execute to Watch unless the entry
crosses the 13-week range's extreme, on the live scan and the replay.
`rangeReversion.ts` is never tradeable. `STRATEGY_VERSION` is now
`2026-09-27-gann-breakaway`.
**Stage C/D, same day:** Gann's exit rules (`lib/gann/exitRules.ts`) are
measured in the replay (`exitRule: "gann"`); the live exit manager switches
once the replay agrees. Entry confirmation holds on every path, automation
included (owner: "automation should adhere to the same rules as everything
else"), checked once in `lib/trade/place-order.ts`. Equity targets come from
Gann/S-R levels (C4), and the volume criterion reads Gann's full rule (D1).
`STRATEGY_VERSION` is `2026-09-27-gann-targets-volume`.
**D2/D3, 2026-09-28:** shares outstanding (SEC EDGAR) and inception dates
(Wikidata, by CIK) are fetched once by `scripts/fetch-instrument-reference.mjs`
and stored (migration 0083); nothing at runtime calls either service. D2's
distribution week is a Gann exit for longs (`exitRules.ts`), D3 is context.
Both are read the same way on the live scan and the replay. Verdicts and
trades on the default bracket are unchanged, so `STRATEGY_VERSION` stays.
**Bars are split-adjusted, share counts are not:** read historical counts
through `splitAdjustedSharesAsOf`, never raw.
**Measured the same day** (`docs/replay-runs/2026-09-27-766sym-NOTES.md`,
766 symbols): since B1, Execute beats Watch in every bracket cell (confirmed
+0.350R, stop +0.220R on the breakaway version); the confirmed entry stays
+0.190R overall. The 6/3.5 cutoffs hold. Gann's exits raise the population
figure but lower Execute, and the gain rests on trades still open at the
10-session limit, so **the live exit manager stays on the bracket** until a
longer-horizon run settles it. **Superseded 2026-09-28 by the owner ("switch
on Gann's exits"):** live and paper positions now exit on Gann's rules with
60% still taken at TP1 (`LIVE_EXIT_RULE`, `lib/trade/protocol-exit.ts`;
measured as `exitRule: "gann-runner"`, not yet run). `STRATEGY_VERSION` is
`2026-09-28-gann-exits-figures` (even figures move plan stops and targets).
**Superseded 2026-10-16 (owner, "Switch all nine", Q14):** no fixed target at
all. `LIVE_EXIT_RULE` is "gann": nothing sells at TP1 and the whole position
runs on Gann's stop and exit signals, as the replay's `exitRule: "gann"`
measures; the 60% rule is kept as "gann-runner". Gann's capital rules
(`lib/risk/gannCapital.ts`: 30 points of capital a share, at most 3 markets)
size and refuse every order and replace Guided's own caps (Q4, Q6, Q12).
`STRATEGY_VERSION` was `2026-10-16-gann-no-fixed-target`. **Q15, same day:** a trade caught on a stop or a change of trend reverses at Gann's geometry (`lib/gann/reverse.ts`: entry at the broken level, stop 3 points beyond the old extreme); automation seeds the plan with no setting to turn it off, a manual trade gets the offer in the exit notes, and the replay walks it (`reverseWhenCaught`). It still confirms before entry. `STRATEGY_VERSION` was `2026-10-16-gann-reverse-when-caught`. Then, from the read books: break-even once 3 points ahead (M-E6), orders ⅜ point inside an even figure (M-P10), no Execute whose first target is no farther than its risk (M-K5). `STRATEGY_VERSION` was `2026-10-16-gann-book-rules`.
**Rule 21, same day:** pyramid adds go to longs only in stocks with a small capital stock and to shorts only in large ones (`lib/gann/pyramid.ts`, 500 million shares, an engineering cutoff), on the live suggestion and the replay alike. `STRATEGY_VERSION` was `2026-10-16-gann-pyramid-capital`.
**Never-failing rules 1 and 9, same day:** a trade risks at most a tenth of the trading unit (`riskTenthRefusal`, on top of 30 points a share; placement, Guided and the portfolio manager, never a protective order), and the reaction entry keeps its zone but goes at the market once a closed bar trades into it (`gannBuyZone`; the replay fills at the next bar's open). `STRATEGY_VERSION` was `2026-10-16-gann-never-failing-1-9`. Rule 8 holds stocks to 5 open and crypto to 3 (owner). The live daily Rule of Three reads completed sessions only, as the replay does: `STRATEGY_VERSION` is `2026-10-16-gann-rule-of-three-closed`.
**A-RISK-07, same day:** once a paper account's profits equal its starting capital, a trade risks at most a tenth of those profits, and a loss lowers that at once (`profitRiskCeiling`, *Tunnel Thru the Air* pp.198-199). Once reached it holds while any profit is left, so after a loss the next trade risks a tenth of what remains (`lib/risk/profitPeak.ts` reads the peak). It applies at placement, paper and live, in Guided and in the portfolio manager. A live account's starting capital is its first verified equity read (`risk_live_equity_snapshots`) until net deposits are read from the broker. The replay sizes no position. Verdicts and trades are unchanged, so `STRATEGY_VERSION` stays.
**A-EXIT-05, same day:** a trader can set the day they will be away from the market; from three days before it, the Dashboard reminds them to close out their trades (`awayReminderDue`, *Tunnel Thru the Air* p.113). A reminder only, like the rest reminder: nothing is closed for them. A new entry placed in that window comes back with the reminder (`lib/trade/away-notice.ts`), Guided shows it on the confirm step, and the portfolio manager opens nothing new in it. The replay models no trader absence.
**Stops and pyramid steps, same day (W006 Rules 2, 4, 5; *Tunnel* p.198):** shorts trail 1 point over the prior week's high (A-STOP-05); in the final stage the stop trails 5 points under the last day's high (A-STOP-04); pyramid adds come every 5 Gann points of profit (A-PYRAMID-01/06) and lift the whole line's stop to the tighter of break-even and 5 points under the add (A-STOP-06; `wholeLineStop`). Live exits, the pyramid suggestion and the replay read the same code. `STRATEGY_VERSION` was `2026-10-16-gann-stops-and-steps`. **Lot sizes, 2026-10-22 (owner: "Just follow Gann's method"):** each add is the next of Gann's 100, 50, 30, 20 and 10 shares, as fractions of the first lot, and lots after the fifth stay at its size (`PYRAMID_LOTS`; *Truth of the Stock Tape* Ch. IX, the Master Course's "safest pyramiding rule" 100/50/30/20, *Tunnel* p.198's decreasing lots, and W006 p.47, which adds on at a cut unit after the 4th or 5th lot). It replaces Q9's "half the last lot", which no book states past the second. The Portfolio suggestion reads every working lot of the symbol, as the replay does; verdicts are unchanged.
**Re-buy after a stop, 2026-10-17 (owner's pick on the card, A-PYRAMID-07, *Tunnel* p.198):** a trade left on a trailing stop while the swing chart still runs its way, and that ran past its entry by the reaction, rests a re-entry 12 Gann points back from its best price with the stop half the reaction beyond (`lib/gann/rebuy.ts`); a reversal opened at the stop is covered there. The replay walks it (`rebuyAfterStop`). Live and paper exits offer it in a note for a person's trade. `STRATEGY_VERSION` was `2026-10-17-gann-rebuy-after-stop`. **Automation's trades, 2026-10-22:** the stop-out handling seeds a re-buy plan (`lib/lifecycle/fromRebuy.ts`, signal `rebuy:<stopped plan>`, an `oldLevel` entry, 10 sessions) beside the reversal; placement reads only the bars since the stop and calls it off on a new extreme first, as the replay's `walkRebuy` does (`confirmationFromBars`' `cancelBeyond`), and holds it while an opposite working exit is open on the symbol, so it never nets against the reversal; the exit managers cover the automated reversal at the re-buy's level (`lib/automation/rebuy-cover.ts`, cause "covered": no reversal, no re-buy). Live, only the original trade re-buys and an initial stop never does, as the replay reads it. The replay's `walkRebuy` now reads the re-buy as placement does (rule 9): confirmed on the closed candle that trades back into the zone, filled at the next candle's open, called off by a close through its stop as well as a new extreme; it had filled inside the touching candle. A covered reversal is logged as `stop_loss` (the column has no other fitting value). Re-buy replay trades move, verdicts don't: `STRATEGY_VERSION` is `2026-10-22-gann-rebuy-rule-nine`.
**Close-out button and the unit after losses, same day:** the rest and away reminders on the Dashboard carry an opt-in "Close all positions" button (M-K4; owner's Q16, "Button"): after a confirm it closes every open paper position at market (`/api/positions/close-all`, `lib/trade/close-position.ts`); nothing closes on its own. A-RISK-03's cut unit after a series of losses is met by the unit itself, never above the equity left, so a trade risks a tenth of what remains (pinned in `gannRiskCapital.test.ts`); the pause is `lossSeries.ts`. A-PYRAMID-08's adds on the decline are the short mirror of the add (pinned), and its re-short on the rally is the re-entry after a stop; its partial covers come from a trade record with no stated rule, so none is built, and Q14 fixes no target.
**Review B fixes, 2026-10-17:** Jensen's trine points stay context and only his square points join the S/R list (C-LEVELS-21; 45 and 90 flagged doubly strong), and resistance points within 1% are averaged into one before TP1 and the master are read, as the stop already was (M-P4), on the live scan and the replay alike. Context only: Gann's weekly green/red trend line (`lib/gann/weeklyOneBar.ts`, M-R8, beside the 7-day chart, not replacing it), the Master 12 grid (`masterTwelveCell`, M-T16; the spiral is labelled a GSPS construction), and a spectral cycle needs Schuster's p under 0.05 × min(1, period/20) (CYC-27). `STRATEGY_VERSION` is `2026-10-17-gann-review-b-fixes`.
**Six-year one-hour run, 2026-09-28** (same notes file, runs 12 and 13): every
cell loses over 2020-2026, interval wholly below zero, both halves; Execute
is worse than Watch (−0.090 stop, −0.123 confirmed, −0.164 Gann exits). The
positive 15-minute results cover only two months. Treat the verdict's edge as
unproven across regimes, presume a translation defect first, and start from
that run's factor tables (`historicalSR`, and `ruleOfThree`/`swingChartTrend`
under confirmation, invert). Held for the owner.
**Diagnosed 2026-09-28 (run 16, same notes file):** two translation defects.
The replay traded a stop and target unlike production's plan (fixed:
`usePlanLevels`), and Gann's "3 points" in the exit rules had been ported as
the entry's 0.3% lost-motion margin, a tenth of his own price-scaled figure,
so the hold test ended most trades on noise (fixed: `lib/gann/pointScale.ts`,
live and replay). `STRATEGY_VERSION` is `2026-09-28-gann-points-continuation`.
The F4 calendar test ran on 2019–2025 (the feed's reach): no window set beats
random placement, so the windows stay context only.
**Merged 2026-09-28 (#299) on the 15-minute result**, by owner decision, before the
six-year run finished. That run (run 22, same notes file) is negative on every
cell, interval below zero: the live `gann-runner` rule is −0.058R over all
trades and −0.053R on Execute (run 12: −0.074/−0.164), and Execute no longer
beats Watch. The 15-minute gains cover one two-month phase. Held for the owner;
the next checks are listed in the notes.
**Stage E, 2026-09-28:** Gann's series-of-losses rule runs on every placement
path (`lib/risk/lossSeries.ts`: three losses in a row pause new entries for
that day and the next; protective orders never blocked). School gained a
course on the method's rules, now including the Seven Zones and the trader's
five qualifications. **Restructured 2026-09-28 (owner):** that course moved to
Academy 6 (Expert and Wall Street) with a pyramiding lesson added; Novice
(Academy 2, required) and Pro (Academy 4) got plain-English courses with
Mr. Bull and Mrs. Bear, the learner's named guides (allowed in lesson text
since that date; see `docs/GSPS_BRAND_GUIDE.md`). No source name or banned
term appears in lesson text.
**Stage F, same day:** F1 (reverse signal day, 7-10 Day Rule, gaps, 7/14-day
turns, Square-of-144 convergence, projection dispersion) is built as card
context and measured `contextFactors` (`lib/gann/extremeRules.ts`,
`lib/gann/timeConvergence.ts`); none gates. F3: Schuster p in
`spectralCycle.ts`, early/late `halves` in the backtest report, long cycles
labelled. The rest of M1/M2 followed: log detrending, cosinor amplitude CI and
zero-amplitude test, artifact guards and a 70/30 hold-out in `spectralCycle.ts`
(run only for an active candidate). F2 stays research-only. Stages A–E are now
built (D2/D3 landed via #300). F4, the deferred cycles research, was done
2026-09-28 (`docs/memory-bank/F4_CYCLES_CALENDAR_RESEARCH.md`): its
pre-registered calendar test is designed, not run, pending the owner.
**Astrology and Jensen, built 2026-10-16 (owner: "infuse the astrology
connected to Gann, Jensen, and anything from the cycles of observation folder
that aligns"):** `lib/gann/astroRules.ts` on top of PR #306's planetary
averages. Under the 2026-10-01 decision ("Every Gann method acts" below), the
active angles act: each of Jupiter, Saturn and Uranus puts its nearest
longitude, square, trine or opposition above and below price into the S/R
list (`activeAngleLevels`, via `masterLevels.ts`), so plan levels move
(`STRATEGY_VERSION` `2026-10-16-jensen-square-high-and-low`). The time readings (the
Mars half-return, the Sun's travel and seasonal points, the natural angle,
new moon and lunar return, the wheel) are trace lines and measured factors
until a shared time-window mechanism exists for them to act through.
**Jensen's placement, decided 2026-10-16** (owner: "Determine the best way to
use Jensen work. If we are going to be forecasting then we ought to [take] his
information into account", delegating the item-by-item call), built in
`lib/gann/jensen.ts`: his square of 90 acts as price levels, laid at the
major low and inverted at the major high, repeating past 90 points; its time
counts, his slow-planet aspects (geocentric Jupiter, Saturn and Uranus in his
square, trine and quintile families with his orbs, timed by Mars or Mercury)
and his 60°/45° exhaustion projection are dated windows with an expected
direction (`jensenWindows`), which act through the shared time-window
mechanism once it exists and are traced and measured until then. Those dates
are backend only: no measured record exists, so none is shown to a person
("Forward-looking claims"). His one-point penetration is the orb for his own
points only; a stop still breaks on Gann's 3-point rule. Not built: the Node
against 9° Gemini, base charts and progressions, the Uranus and sunspot
cycles, the tables and the lunar grain keys (no testable rule, or too few
repetitions). About 0.7 ms per symbol (65 ms on the first call).
**Yearly counts in the time-window hold, 2026-10-16 (A-TIME-11; owner: the
20-year count acts through the hold):** `readWindowTurn` takes the monthly
chart (`monthlyLong ?? charts.monthly` live, `instrument?.monthlyLong ??
charts.monthly` in the replay, months before the turn's only) and
`timeWindowsAt` adds a labelled window for each `MAJOR_CYCLE_YEARS` hit from a
major monthly pivot on the turn's side (`yearCycleHits`). No new fetch; about
0.05 ms, read only when a counter-trend Execute needs it. The 13-year series
held reaches the 1-10-year counts, not yet the 20-year one. Verdicts move:
`STRATEGY_VERSION` is `2026-10-16-gann-yearly-count-windows`. Same day, guard
(C-ASTRO-15): an astro or Jensen window counts only on a 3-Day Chart turn,
never alone (`timeWindow.test.ts`).

**Master Course methods with no plan, built 2026-10-16 (owner: "Build the 5
Gann plans identified to be missing"):** the Overnight Chart and its
stop-and-reverse method (`lib/gann/overnightChart.ts`), Rule 8's three closes
around one price (`closeCluster.ts`), both context and measured factors on the
live scan and the replay (the Square of 144's fractions and convergence are
PR #306's `masterCalculator.ts`); the hourly chart as a factor on the intraday alerts
(`lib/scanner/intraday.ts#hourlyChart`). The reversal is measured
(`lib/backtest/replayOvernight.ts`, `/api/backtest?engine=overnight`), never
placed: whether a caught stop opens the opposite plan is the owner's call.
**Owner direction, same day: "the point of the parity is to align, infuse
and implement within and throughout the entire GSPS platform."** A rule is
not parity-complete while it only shows on a card: it has to act where Gann
says it acts (trend, time, levels, entries, exits, education) on the live
scan and the replay alike. Stage A/B2 were wired in accordingly;
`STRATEGY_VERSION` is `2026-09-27-gann-trend-time-levels`.
**Master Calculator and planetary averages, 2026-09-30 (owner: "zero gaps";
"Execute").** From the full Square of 144 lesson (Sept 29, 1953), the circle
of 360°, GA-32 and the March 20, 1954 letter (source note
`docs/memory-bank/sources/A12_master_calculator_1953_and_1954_letter.md`):
`lib/gann/masterCalculator.ts`, `circleOf360.ts`, `planetaryAverages.ts` (the
COE and MOF, see "Astrology" below) and `masterLevels.ts`, which puts the
square ends and centres and the planetary averages' nearest points in the S/R
list on the live scan and the replay. The rest are measured context.
`masterTwelve.ts`'s spiral is GSPS's own, not Gann's calculator.
`STRATEGY_VERSION` is `2026-09-30-gann-calculator-planetary`. Prices are read
in the Gann point (`pointScale.ts#pricePoint`, exactly $1 at $42.50).
**Same day, from Gann's Square of Nine plate** (Vol. 3 p. 34 and the Cycles
Research Institute workbook, source note B12, filed with the Gann sources):
the sixteenths of the seasonal year (`seasonalCounts.ts`), the square read in
time (`squareOfNineTime.ts`) and the day as a circle (`dayCircle.ts`). Owner on
the clock: "I always defer to Gann's method", so it is used as drawn: 0° = 6:00
AM New York time, 15° an hour. All three are measured context; verdicts and
trades are unchanged, so `STRATEGY_VERSION` stays.
**The Master Time Factor, 2026-10-01** (owner: "save it with the rest of
Gann's method"). The Gann Study Group's 2014 compilation of every statement
Gann made about it is filed as source A13. It confirms the method was never
disclosed: each statement says what it does, and none says how. Nothing in
it can be built. Gann's November 1935 "Forecasting" lesson (A2.1 Ch. 7)
never uses the term, so don't call its cycles the Master Time Factor.

**A-TIME-11 reach, 2026-10-17:** the time-window hold's yearly counts read
`YEAR_COUNT_MONTHLY_YEARS` (61) of monthly bars, live and replay, from the same
request; the 20-year count acts only where the vendor's history reaches that far.
`STRATEGY_VERSION` was `2026-10-17-gann-yearly-count-reach`.

**The nine pillars, 2026-10-17 (owner: the score stays out of 9, several of
Gann's checks may count for one point; "Stop required" on the card):**
`CRITERION_KEYS` are nine pillars built in `lib/scoring/pillars.ts` from what
Gann checked before choosing a stock and a trade (market and cycle, trend on
every timeframe, relative strength, activity, price levels, angles, time,
volume, and the definite indication with the stop placed). The nine former
criteria stay in the breakdown as checks (`checkOf`), measured but scoring
nothing alone, and are retired in the registry. The live scan and the replay
build the facts the same way (`readPillarFacts`, about 0.4 ms a symbol; the
live scan now reads the disclosed rules once and shares them with the
confluence card). The 6/3.5 cutoffs are held until a replay on this version
re-derives them. `STRATEGY_VERSION` is `2026-10-17-gann-nine-pillars`.
**List and page disagreement, 2026-10-20 (owner's report: SHEL 8 of 9 Buy on
the list, 2 of 9 Sell on its page, same minute and price).** A scan with no
direction asked of it read only the reversion against the trend, while the
list's with-trend rows came from the continuation pass with a direction. Now
`chooseSessionEntry` (`lib/scan/entrySelection.ts`) shows whichever of the
session's two buying points armed, the nearer when both did, on every surface
without a preference; the replay already armed both. A plan whose entry the
price has already run past is the method's reaction buy (the crossed level,
bought on the reaction back to it): the setup card now says so instead of
reading as a plan to take at the market. `STRATEGY_VERSION` is
`2026-10-20-gann-session-entry`; the 6/3.5 cutoffs still await a replay.

**Score pillar P3(c), 2026-10-20 (stand-in, labelled).** S6 ranks a stock
among its group or universe by monthly highs and lows. GSPS scores one symbol
at a time (market scan, symbol page, replay), so P3(c) compares the stock with
the market (SPY) instead: higher in its year of monthly highs and lows for a
long, lower for a short (`lib/gann/leadership.ts#readMonthlyStrength`), read
identically on both surfaces and guarded by
`lib/scan/__tests__/pillarParity.test.ts`. It replaced a weak-stock reading
that was never S6. About 0.03 ms a symbol, no request. A true cross-sectional
rank and a group map stay open (the rank was built 2026-10-21, below). `STRATEGY_VERSION` was
`2026-10-20-gann-p3-monthly-strength`. The research-only planetary matcher
(C-ASTRO-03) now tests whole multiples of each period, with the chance rate
widened to match.

**Pillar diagnosis, 2026-10-20 (first nine-pillar replay, Execute worst in both
cells).** One translation defect, fixed: the campaign ledger's over-balance of
time measured the reaction in progress to today, but completed reactions top
to bottom, so a reaction that had made its low and was holding read
over-balanced and failed P9's greatest-reaction rule (about one flag in ten on
synthetic walks). It now reads to the extreme (`CounterMoveSize.extremeDays`),
everywhere the ledger is read. P9's other failures, and P2's and
`swingChartTrend`'s inversions, are a handful of counter-weekly Execute trades
(4 and 5 of 73 and 164), not a code fault. P7's saturation is structural, held
for the owner: the dated-window part is open on every turn of a random walk
(the Square of Nine and Hexagon time counts alone hit about 60%), and the
reversion hold already requires it. `STRATEGY_VERSION` is
`2026-10-20-gann-time-overbalance-extreme`.

**Closed sessions on the live scan, 2026-10-20.** `lib/scanTicker.ts` scored
some daily reads (swing chart, time-price square, angle slopes, climax, ATR,
liquidity and more) on raw bars that end in today's unclosed session; the replay
reads completed sessions only. Every scored or verdict-affecting daily read now
takes `sessions`, the completed ones, and `pillarParity.test.ts` holds it with an
unclosed bar present. `STRATEGY_VERSION` is `2026-10-20-gann-closed-sessions`.

**Weekly parity, same day.** The replay rolled its weekly chart up from daily
bars while the live scan read the provider's weeks, so the two read different
weekly trends and levels. Both now read the provider's closed weeks (the
backtest fetches them, `WEEKLY_CHART_YEARS` before the first session), with the
week in progress built from completed sessions (`levelCharts`). The yearly
cycles count the same closed months on both (`yearCycleMonths`). The monthly
chart already matched. `pillarParity.test.ts` compares all three trends.
`STRATEGY_VERSION` is `2026-10-20-gann-weekly-parity`.
**P7 without the dated window, 2026-10-20, pending the owner's choice.** The
time pillar (`timePillar`, `lib/scoring/pillars.ts`) now needs price and time
squared AND the reaction inside its time limit (`TIME_PILLAR_COMBINE`); the
dated window is not one of its checks. On 400 random walks the window was open
on 100% of turns, 99.2% with the Square of Nine's 22.5° lines and the Hexagon
excluded, 93% when two different families had to converge, and 71% for three,
so none made it selective (branch `p7cardinal` holds those builds, unshipped).
"And" is the spec's "2 of 3" with one check gone; it passes on 11.6% of
random-walk readings ("or" 59.5%, mostly the reaction clock alone).
`applyTimeWindowHold` is unchanged: a counter-trend Execute still needs its turn
on a window. `STRATEGY_VERSION` was `2026-10-20-gann-time-pillar-no-window`.

**Even-money diagnosis, 2026-10-21 (2026-10-20 score-band run: `tradePlanPriced`
held 526 of the 701 trades scoring 6+, and they beat Execute).** Every one was
M-K5's even-money test: the replay never scores a trade without levels or an
armed trigger. The defect: the equity TP1 was the nearest level past a fixed 3%
floor, while Gann's reaction stop is 4 price-scaled points (about 12% at $30,
2% at $700), so the hold fired on nearly every cheap stock and almost no dear
one, with Gann levels beyond the risk (synthetic census: 71% held, and 92% of
those had a level beyond the risk inside the band). TP1 is now the first level
that pays more than the risk ("profits must exceed losses", WSSS Ch. II); with
none in the band the nearest stays and M-K5 holds, unchanged. A farther TP1
also widens A-LEVELS-04's failed-top-in-path refusal, which reads it. Held for
the owner, not changed: an over-balancing reaction drops out of the campaign
ledger as soon as the 3-Day Chart turns back (it joins the greatest it is
compared with), and swings in percent of their start make equal-point rallies
in a bear campaign over-balance (`levelRole.test.ts`'s 1931 shape: 32% against
27%, 29 points against 30). Both answered from Gann the same day ("Over-balance
answered from Gann" below). `STRATEGY_VERSION` was `2026-10-21-gann-first-target`.

**Breakaway diagnosis, 2026-10-21 (first-target run: `breakaway` held 261 of the
727 trades scoring 6+ at +0.086R, Execute +0.005R).** One translation defect,
fixed: decision 5's "range-bound" was any market whose trend was unconfirmed
(`isGannRangeBound` alone), but Gann's sideways market is a narrow range held
for weeks (Commodities pp. 51-52; Master Course "2-6 or 10-13 weeks in a narrow
range"; *Truth of the Stock Tape*'s 3 points beyond the old top or bottom of a
sideways move). Unconfirmed alone held 28% of armed triggers on trendless random
walks and 18% on walks rising 0.2% a day, most of them in wide markets (39% and
13% of the held were narrow). `readBreakaway` now also needs the 13-week range's
sessions narrow (`isNarrowRange`, at least `MIN_RANGE_SESSIONS`), the narrow the
breakaway's volume rule already read: 12% and 3% held. Decision 5 itself is
unchanged: inside a narrow range Execute still needs the breakaway. The width
(`NARROW_RANGE_ALLOWANCES`, 3 allowances over 13 weeks) is an engineering figure,
and a 2-6 week narrow range after a wide 13 weeks is not read yet (built the same
day, "Breakaway's 2-6 week range" below); both held for
the owner. `STRATEGY_VERSION` was `2026-10-21-gann-narrow-range-breakaway`;
Execute and the 6/3.5 cutoffs need a fresh run on it.
**Replay accounting, 2026-10-21.** Three replay defects, fixed. (1) A fired entry
with no tradeable plan behind it (no plan, no risk, TP1 not beyond the entry, the
round-number hold) was dropped uncounted: 392 of 1,475 fires on the 2026-10-20
run. Now `droppedPlans` and `droppedPlanReasons` beside `refusedFills`, in the
report and the universe summary's fill table. (2) Reversals started from the
blended exit price under a scale-out (60% out at 103, the rest stopped at 99 read
101.4). `walkGannExit` now returns `finalExit`, the price the last shares left
at, for every reversal in the chain; P&L keeps the blend. The paper simulator had
the same fault after a TP1 fill and now reverses at the stop leg's fill; the
broker exit manager already used the stop. The re-buy reads only the best price,
so it was unaffected. (3) Reversals and re-buys inherited the parent's score,
verdict and criteria. They now carry `derived` and none of those: they count in
the totals and in `derivedSplit` (and the summary's "derived" scope), never in a
bucket, score band or factor table. **The owner's runs used `entryRule:
"confirmed"`, which is not production's entry:** it arms on the crossing alone
and measures R from the crossing price, 2 points past the reaction entry the plan
and TP1 are priced from. Production's rule is `"reaction"`, the default. A
production-faithful cell is `{"usePlanLevels":true,"entryRule":"reaction","exitRule":"structure"}`
(`LIVE_EXIT_RULE` is "structure", formerly "gann", since Q14; `useProductionStop` does nothing under
"reaction"). `STRATEGY_VERSION` was `2026-10-21-replay-accounting`; Execute and
the 6/3.5 cutoffs need a fresh run on it.

**Over-balance answered from Gann, 2026-10-21 (owner: "Determine how WD Gann
would answer these questions, and those are your answers"; the two questions
the even-money entry held).** Q1, how long an over-balance stands and against
what: the reaction is measured against the greatest of the campaign's
reactions before it, and when it exceeds that the main trend "has changed or
will soon" (Master Course Ch. 8, PDF 249; Ch. 11A's campaign reviews; *Commodities*
pp. 51, 312); the sale is the secondary rally after it (Sell 3, PDF 244-245;
the time rule, "shorts on the secondary rally"). So it stands after the
reaction ends, until price goes back past the top it fell from (bottom in a
bear campaign): `buildCampaignLedger` now keeps each completed reaction's
over-balance against the reactions before it (`overbalance`, with `standing`
and the top that clears it), so the 3-Day Chart turning back no longer erases
it. Gann is silent on a reaction that over-balanced and was then followed by
a new high: it stays one of the campaign's reactions and the yardstick for the
next, as before; a turn of the weekly chart starts a new campaign, as before.
Q2, points or percent: points. "A decline in points exceeds the greatest
decline of a previous reaction by one or more points" (PDF 249), *45 Years*
Rule 8's prior decline's points, Ch. 11A's reviews in points, the Stock
Selector's 17-point Vanadium yardstick. His percentages (*Commodities* p. 32,
the percentages of highs, lows and ranges) are resistance levels, not swing
sizes. Over-balance of space now compares `points`; `pct` stays for display
and the class C readings (contracting, nearly equal corrections), whose
sources give no unit. On his own 1931 figures (NSTD pp. 13-14) the November
rally to 119 was 33½ points (39%) against June's 37½ (31%), and he reads it as
the bear still on (p. 24): points agree, percent did not. Tests corrected,
each saying so: `monthlyWarning.test.ts`'s second reactions (to 75 and to 105)
over-balanced in points and are now to 80 and 109.5, and
`regimeStructure.test.ts`'s spike reaction over-balanced the 6-point
reactions before it in space and time; `levelRole.test.ts`'s 1931 shape now
asserts the points reading. The intraday space alert reads the reaction in
progress only (a standing one was alerted the day it happened), in points. The
exit rule's trend change reads the over-balancing reaction's own start.
`STRATEGY_VERSION` was `2026-10-21-gann-overbalance-points-standing`; Execute
and the 6/3.5 cutoffs need a fresh run on it.
**Trend pillar's weekly leg, 2026-10-21 (diagnosis of P2's inversion).** One
translation defect, fixed. P2's design (`score-pillars-research.md` §3) and
its source T1 ("on the weekly, buy when the line turns green", Master Course
Ch. 8, p. 239) name Gann's weekly green/red trend line, but `trendPillar` read
the 1951 Commodities 7-day chart's trend (`swingChart.ts`), a slower reading
that turns only when the last completed weekly swing top is crossed. Measured
as the context factor `withWeeklyTrend`, that reading did worse passing than
failing in 10 of 11 cells over the 2026-10-17, -20 and -21 runs (and
`swingChartTrend`, which includes it, inverted on runs 12, 22 and the 6-year
daily run), while `weeklyOneBarWithTrade`, the green/red line, came out ahead
in 7 of 11 (pooled on 2026-10-21: +0.058 against −0.024). P2 now reads the
line (`PillarFacts.weeklyLine`, from `readDisclosedRules`, so the live scan and
the replay read it the same way); the 3-day leg, the Rule of Three and the
monthly tier are unchanged. The `swingChartTrend` check, the exits, the
campaign ledger and the regime engine still read the 7-day chart, as recorded
in `weeklyOneBar.ts` (owner's call). `STRATEGY_VERSION` was
`2026-10-21-gann-weekly-line-trend`; P2 and the 6/3.5 cutoffs need a fresh run
on it.

**Relative strength rank, 2026-10-21 (S6 built, replacing the P3(c) stand-in).**
P3(c) now ranks the stock among the scan universe (`LARGE_CAP_UNIVERSE`, the
766-symbol list the market scan rotates through) by where its last monthly
close sits in its year of monthly highs and lows, and passes in the strongest
quarter for a long, the weakest for a short (*Commodities* p. 20, "compare the
monthly highs and lows" and choose the strongest or weakest, p. 47; *Stock
Selector* Ch. VII, "those selling at the highest levels are in the strongest
position"; `lib/gann/universeStrength.ts`). The stand-in's obstacle was that a
rank among the symbols in hand gives one symbol two scores; here the peers are a
fixed list and the rank reads completed months only, keyed by the month it is
read in, so the market scan, the symbol page and the replay read the same peers
on the same months (`pillarParity.test.ts`). The live scan reads the universe's
monthly bars once per ET day per instance (`lib/data/universeStrength.ts`, 8
batched requests, started beside the symbol's own fetches); both backtest
runners read the whole span once per run (`fetchReplayUniverseStrength`). The
rank also adds a step to `selectionStrength`, so the shortlist cut (when the
universe read has landed, never waited on) and the lists' order use it.
Measured: the rank read is about 0.005-0.009 ms a symbol, building the table
10 ms once a day live and 110 ms once per replay run; the fetch's wall time
is logged by the market scan's "universe strength read" breadcrumb and was
not measurable from this session. Engineering choices, labelled: the quarter,
`MIN_PEERS` 100, position in range as the comparison, and today's list carried
back in time (survivorship). US equities only. A failed universe read leaves P3(c) unread, which fails as
an unread check does. `STRATEGY_VERSION` was
`2026-10-21-gann-universe-strength-rank` (since moved on); Execute and the 6/3.5 cutoffs need a
fresh run on it.
**Gann's own sizing above Novice, 2026-10-21 (owner: "What would Gann do. And
implement that answer", then "Make this change, if it's your recommendation, and
aligns with the law of creation equation").** The 25% single-position, 65%
deployed and 2% open-risk ceilings (`checkPositionLimits`) now hold Novice only
(`EntitlementPolicy.percentRiskCeilings`), on paper and live; every tier above
it is sized and refused by Gann's capital rules alone (`gannCapital.ts`: 30
points a share, a tenth at risk, five stocks). Above Novice the ceilings had
refused the size Gann's rules give (a 1% risk with his stop about 3% away is a
third of the account). Law of Creation: novice ⊗ expert, two poles held apart
on purpose, the guard rails a learner needs and the method itself. Now
no surface keeps a daily count of new positions (Q8; R-019, 2026-10-21): not
the portfolio manager, not the live circuit breaker (`entry_pause` no longer
triggers), and not the Novice home, which now shows the room left under
Gann's five stocks and three other markets. On the symbol page and any surface
without a preference, `chooseSessionEntry` now shows the with-trend
(continuation) buying point first when both armed, the reversion only when it
alone armed ("never buck the trend", *Wall Street Stock Selector* pp. 18-19,
never-failing rule 5). `STRATEGY_VERSION` was `2026-10-21-gann-with-trend-first`.

**Pillar diagnosis P1 and P5, 2026-10-21 (766-symbol 15-minute run, 598 trades
scoring 6+: `marketCycle` passes 91.5% at −0.307R, `priceLevels` 92.6% at
−0.234R).** One translation defect, fixed: P1's year check read the decade
digit's label for the whole year, but Gann names turns inside four years
(Master Course Ch. 7, PDF 223-224): a '6' year's campaign "ends in the Fall,
fast decline", a '9' year's final campaigns culminate and bear markets start
September to November, and '3' and '10' years rally to March/April. 2026 is a
'6' year and the run's window (2026-08-24 to 10-20) is its fall, so every long
took the year point free and no short could from the digit: a long failed P1
only with the market and a yearly count both against it, while a short needed
two checks besides the digit, in the decline Gann expects there.
`DecadeCycleReading.currentBias` (`lib/gann/decadeCycle.ts`) reads the month:
the culmination months are "mixed" (neither side takes the point, as the '9'
year as a whole always was), the months after them bearish. P1 and
`decadeYearWithTrade` read it; `bias` stays the year's label for the card and
CYC-52's pre-registered 1 July test. Held for the owner, not changed: P1's
cycle check ("no yearly count due against it") passes whenever no count lands
on the month, about 94% of trades (`yearCycleSplit`), so P1 is close to "market
trend OR year's character". P5's retracement check divides the last daily swing
(4-bar pivots) into twelve fractions and accepts any within Gann's 3-point
allowance: on random walks it passes 71-79% for either side, because that swing
is narrower than twice the allowance on 99% of readings at $20 and 41% at $500,
so the divisions sit inside one allowance. Gann divides the major range ("on a
basis of 100", Ch. 6; "50% of the highest price, then of the range", 45 Years
Ch. IV); answered the same day from Gann (next entry). P5's failures are prices
clear of that swing, a market reading, not a mirror or bar fault.
`STRATEGY_VERSION` was `2026-10-21-gann-decade-in-year-turns`; P1 and the 6/3.5
cutoffs need a fresh run on it.

**P5's percentage levels, 2026-10-21 (diagnosis: P5(b) passed on 64-74% of
random walks whichever side was asked).** One translation defect, fixed: the
check divided only the last daily swing (4-bar pivots), a minor move usually
narrower than twice the 3-point allowance. Gann divides the major ranges, in
this order: the extreme range, the highest price, then each campaign of a year
or more, each by 8 and by 3 (Master Course Ch. 9, PDF 263-264; *Commodities*
pp. 34-35: "the most important point is the 50% of the extreme range"), with
50% first (45 Years Ch. IV; Master Course PDF 11: "50% of the highest price.
Next: 50% of the range") and Ch. 6's tiers among the rest. Now
`lib/gann/rangeDivisions.ts`, read once in `readPillarFacts`
(`PillarFacts.rangeLevels`) for both surfaces, in the right role, within the
3-point allowance. The last swing's divisions stay on the card. Engineering
choices, labelled: the life range is the record both hold (the monthly level
chart and the sessions), a campaign is two monthly swing extremes a year or more
apart and only the latest is divided, and the 1/16 points (kept for "great
ranges") are left out. Random walks, long/short: $20 82/76%, $50 70/71%, $150
58/53%, $500 40/38% (before 72/74, 70/72, 68/67, 64/63); the wide allowance at
low prices keeps it loose there, held for the owner (50% points alone: 20%,
14%, 9%, 5%). Same day: `historicalSR` now reads the nearest in-band level of
the wanted role (`nearestLevelMatchByRole`, `srMatchForSide`), as score.ts
said, not the nearest of either role then failed on its side; a level is
support below price and resistance above it (W006 pp.19-24). `STRATEGY_VERSION`
was `2026-10-21-gann-major-range-levels`; Execute and the 6/3.5 cutoffs need a
fresh run on it.

**Senior code review fixes, 2026-10-21 (owner: "Fill known gaps as Gann
would").** The live scan's dated reads take the session's noon UTC, as the
replay's do, not the wall clock (F-03, guarded in `pillarParity.test.ts`).
Non-equity plans round to the places a price needs and refuse levels that are
not four distinct positive prices; a short's master that the R projection puts
below zero goes to the largest eighth of the entry beyond TP1 (F-02).
Placement reads the limit or the server's quote before every risk ceiling,
never the ticket's price, and refuses when it has none (F-01); a bought option
risks its premium under rule 1 (F-04). `STRATEGY_VERSION` was
`2026-10-21-review-session-clock-sub-dollar`. The review itself is in
`/mnt/project-files/senior-code-review/`. Later the same day: the replays fill
a stop a candle opens through at that open, not the stop (`stopFill`, R-022),
as the paper exit manager fills at the market. `STRATEGY_VERSION` was
`2026-10-21-review-gap-stop-fill`; replay losses on gaps move, live verdicts
don't. Also from the review, not in the verdict: `daily_scans` stores only the
score rollup, never the breakdown, since production lets any role read it
(R-021). Migrations 0090, 0092 and 0093 (members update only their username
and display name, R-028) were applied to production the same day on the
owner's go-ahead. `STRATEGY_VERSION` was
`2026-10-21-review-fixes-on-major-range-levels`.
**Second round, same day, answered from Gann rather than held (owner: fixes
built in the review's own session):** the Square of Nine reads all 16 of its
lines (Gann's plate, Vol. 3 p. 34); with no trend on any chart and no buying point the
live scan stands aside instead of taking the short side by default
(`applyStandAsideHold`, never-failing rules 5 and 6, D-05); and the forward
test (`lib/shadow/evaluate.ts`) enters on the reaction and exits on Gann's
rules as production does, with the 2026-08-27 baseline labelled as other rules
and not compared (R-032). Migration 0094 (one-transaction paper fill, the
strategy version on scans, orders and trades, the forward test's outcomes) is
applied before the code that writes it merges (applied 2026-10-21 on the
owner's go-ahead). `STRATEGY_VERSION` was
`2026-10-21-gann-stand-aside-no-trend`. **The ledger is server-written (R-029):**
every write to positions, orders, paper accounts, trade logs, exits, plans,
plan audit, lesson progress, learning labs and the order lock goes through
`ledgerWriter` (`lib/supabase/ledger.ts`), which swaps a member's session
client for the service role, and names its user on every insert, update and
delete. A new write to those tables must do the same. Migration 0095 takes
member writes away and is applied only after that code is deployed (applied
2026-10-21 once #391 was live, on the owner's go-ahead, as were 0088 and 0091);
`user_automation_profiles` stays member-written (own settings, entitlement
checked where it acts). **Retention (S-07, owner 2026-10-21, "Keep
indefinitely"):** closed orders, positions and trade logs are never deleted by
the app; they are hidden from the tabs (`lib/portfolio/prune.ts`) and leave only
when the member's account is deleted (their foreign keys cascade from
`auth.users`). Gann kept a record of every trade and his rules read it back
(the series of losses, the profit peak), so nothing may prune them on a timer. Notices are not records: the bell (30 days), the deliveries, monitor transitions, push log and per-member intraday alerts (90 days each) are pruned daily by `gsps_ops.prune_notification_history()` (migration 0138, 08:20 UTC; figures and their readers in `lib/ops/retention.ts`, held by `retention.test.ts`). A new read of those tables further back than its window needs the window moved first. **The service key (S-06, owner: "You
figure it out"):** the server reads `serviceRoleKey()`
(`lib/supabase/service-key.ts`): the Sensitive `SUPABASE_SECRET_KEY` first, the
legacy `SUPABASE_SERVICE_ROLE_KEY` only as a fallback for an operator's shell.
The readable legacy `SUPABASE_SERVICE_ROLE_KEY` was removed from Vercel by
the owner on 2026-10-22 (gone from the project's env list at 01:35 UTC), so
production and every deployment read `SUPABASE_SECRET_KEY` alone. Read the key
through that helper, never from `process.env`.
**Breached passwords (S-11):** Supabase's leaked-password setting is a
dashboard switch no tool here reaches, so sign-up, reset and the Settings
password change refuse a password found in Have I Been Pwned
(`lib/auth/breached-password.ts`, k-anonymity through
`/api/auth/password-breach`; fails open). A new password form calls it too.

**Breakaway's 2-6 week range, 2026-10-21 (the narrow range held open above).**
Gann counts the weeks a market has been held narrow before it crosses the tops
or breaks the bottoms "of the previous weeks": "2-6 or 10-13 weeks in a narrow
range ... the longer in range, the bigger the move" (Master Course pp. 246-248,
Rails 1897's two 2-point ranges; *Commodities* p. 51, "Many Weeks in Narrow
Range"); 3 points beyond the old top or bottom of a sideways move (*Truth of
the Stock Tape*, Jewel Tea). So the range is the one the market is in now:
`narrowRangeSessions` (`lib/gann/breakaway.ts`) counts back from the latest
session while the span stays narrow, at least `MIN_RANGE_SESSIONS` and within
the 13 weeks. A whole narrow quarter reads as before; after a wide quarter the
last 2-6 narrow weeks are the range and their 3-Day Chart extremes are the
breakaway. The 7-9 weeks between his bands are read too (his own 8- and 9-week
examples, Rails 1911 and 1897). `readBreakaway`, the breakaway's volume
(`breakawayVolumeMet`, `readBreakawayVolume`) and `capitalStock.ts` read the
same run, live and replay alike (one function). Gann gives no width: his dated
ranges are 2, 2½ and 4 points, inside `NARROW_RANGE_ALLOWANCES` (3 allowances,
still an engineering figure, held for the owner). Random walks, armed entries
held (before → after): trendless 13.1% → 16.3%, rising 0.2% a day 8.3% → 11.0%
(at $20 26.1 → 26.6%, $500 0 → 1.4%). `STRATEGY_VERSION` was
`2026-10-21-gann-narrow-weeks-breakaway`; Execute and the 6/3.5 cutoffs need a
fresh run on it.

**Review fixes, 2026-10-21 (four defects found reviewing the day's merges).**
(1) The paper exit manager reversed a stop-caught trade at the market quote
that gapped through the stop; the replay and the broker exit manager reverse
at the stop, "the stop that was hit" (`reverse.ts`). `exit-manager-sim.ts` now
reverses at the stop, and a Gann exit signal still at the price the last
shares left at. (2) Gann's capital rules read open positions only, so a limit
entry resting as a `new` order was not in the book, and `evaluateRestingOrders`
filled it unchecked: two resting limits could each pass alone and together open
a sixth stock or breach 30 points of capital a share. Paper placement now counts
resting entries (`listWorkingPaperEntries`) in the five stocks, the capital a
share and the percent ceilings, and fails closed when they can't be read; a
resting entry is checked again on the book as it stands when it fills
(`lib/trade/resting-entry-guard.ts`: the five stocks, 30 points a share and a
tenth at risk) and cancelled on refusal. Protective orders are never refused.
Live working orders are counted too since 2026-10-22: live placement reads the broker's open orders, legs nested under their entry (`lib/trade/live-working-entries.ts`), into the five stocks, the capital a share and the deployed figure, and fails closed when they can't be read (their planned risk is already in the working live exit rows). (3) The decade digit and its in-year
turns read the year and month in UTC while the live scan passes the wall clock,
so from 8 PM ET on a month's last day live read the next month and the replay
the current one. `computeDecadeCycle` reads them in New York time.
`STRATEGY_VERSION` was `2026-10-21-gann-decade-month-et`. (4) Pro's intraday
module still refused a third intraday entry a day, a daily count R-019 removed
everywhere else; the count is gone (`canEnterNewIntradayPosition` keeps the
concurrent, consecutive-loss and daily-loss gates), with its spec line.

**Resting orders, 2026-10-21 (owner's pick on the card, "Resting list"):**
"Plans more than a day's range from their entry move to a separate 'Resting
orders' list, out of Execute, with the distance shown." The case: AMD at $547.91
read Execute with a buy entry of $480.46 (the reaction buy at a crossed old top)
and its stop, TP1 and MTP all below price. `lib/setups/resting.ts` holds the one
predicate: resting when |price − entry| is more than a day's range, read as the
scan's 14-period daily ATR on completed sessions (`ScanResult.dayRange`, kept in
`daily_scans.detail`), an engineering reading of the owner's words. The daily
Buy/Sell lists (Dashboard and its full pages, the Scanner) and the tracked
Execute list put such rows under "Resting orders" with the distance in dollars
and percent, split on the scan-time price; the shared card says it waits for the
reaction back and that a TP1 or MTP already behind price counts only once the
entry fills. Guided Mode and the demo account do not offer it
(`assessEligibility`), and the Novice home's Today's plan ranks it with Watch.
Presentation and selection only: the scored verdict, the replay, plan arming and
order placement are unchanged (automation's resting orders already wait for
price to trade into the buy zone), so `STRATEGY_VERSION` stays. The scan's
monitor reads a resting Execute as Watch (`isRestingScanResult` in
`evaluateMonitorsAndNotify`), so the Execute alert, and the plan it creates,
come once price is within a day's range of the entry. Gaps, labelled:
a tracked symbol the daily scan does not cover has no range read (the monitor
row stores none) and stays in its list; saved setups are not bucketed by verdict
and get the card's sentence only; the intraday alerts are not read (they are
priced from the session in progress).
**Ranked with Watch, 2026-10-23 (superseded 2026-10-28 by the Resting tier
below: it now ranks between Execute and Watch, still behind every near
Execute; owner, on SE's sell: "it should sit with the
resting orders, not as the top sell setup"):** the lists' order (`compareForList`,
through `lib/scan/listOrder.ts#listTier`) and a member's capped list
(`visibilityRank`, in the market, scheduled and batch scans) put a resting
Execute with Watch, behind every Execute price is near, as the Novice home's
Today's plan already did. On the capped list this also puts any Execute ahead of
a Watch with a higher score, as the lists already were. The verdict is unchanged.
**Resting is a tier, 2026-10-28 (owner's items 5 and 10: "determine if a
'resting' tier should be added along with watch, execute and reject"; "Separate
manual scans by buy/sell, as well as executable, resting, or watch").** Gann
answers it: the resting order at the crossed level is his own state (W006
pp. 20, 46-47), neither a setup short of a condition (Watch) nor today's order
(Execute). `setupTier` (`lib/setups/resting.ts`) reads Execute, Resting, Watch,
Reject. The scan flags it where the hold is decided (`ScanDecision.resting`,
set by `applyReadyNowHold` only on an Execute, or one the data-lag hold already
moved to Watch, whose indication is shown and whose sole hold is the entry's
distance), it crosses redaction and is stored in
`daily_scans.detail.resting`; a row stored before reads the old fallback (7+
and resting). A display tier, not a verdict: `outputState` stays Watch, the
monitor alerts on Execute only, the replay (hold read at the fill) never meets
one, and `STRATEGY_VERSION` stays. A 7+ Watch held by another rule that also
sits far from its entry is now Watch, not Resting. Surfaces: the daily lists'
and tracked list's "Resting orders", the setup card's badge and synopsis, the
ticker page's signal card, chart panel badge and company note, Guided's near
miss, Today's plan and the lists' order and capped lists (`listTier`: Execute,
then Resting, then Watch), and the Scanner's
manual results, now split Buy/Sell × Executable/Resting/Watch with rejects
collapsed (`components/scan/manual-scan-results.tsx`).

**Daily replay entry kinds, 2026-10-21 (six-year 1Day universe run: all 4,479
trades under "hold", crossing 0, oldLevel 0; the 15-minute run split 1,332,
840 and 1,427).** One replay defect, fixed. The reaction and confirmed rules
act on a closed bar and fill at the next bar's open, but the replay read that
closed bar against the live bar's session plan. On intraday bars that is the
closed bar's own session; on daily bars it is the next one, priced from the
closed bar itself. So a crossing or an old level the bar traded into was
already spent on that chart and offered no plan, and a held bottom's entry
(that bar's own close) was always traded into. On a 1Day replay
(`sessionBars`) the closed bar is now read against its own session's plan,
priced from the sessions before it, and the next session's open fills it,
as production's confirmation reads the bars after a plan is made. Random
walks, before → after: 0 → 10 crossings, 0 → 20 old levels, 0 → 66 holds
over six seeds (`dailyEntryKinds.test.ts`). Intraday replays, the live scan
and verdicts are unchanged. The run's `armed` (1,730,892) is not fills: it
counts each plan once per session it stood (about 1.4 a symbol-session over
828 symbols and some 1,500 sessions, of at most 2: the reversion and the
with-trend point),
before the breach, distribution and failed-top checks and the zone test.
`STRATEGY_VERSION` was `2026-10-21-replay-daily-closed-session`; the 1Day run
needs repeating on it.

**The review fixes merged onto the above, same day.** The paper exit manager
fills a crossed stop at the market quote (R-010) and reverses the trade at the
stop itself (review fix 1 above), so the fill and the reversal level differ
when the quote gapped through. `STRATEGY_VERSION` was
`2026-10-21-review-fixes-on-replay-daily-closed-session`; no new rule.

**Group rank, same day (owner: "Yes I want this next").** The rank is also
read within the stock's industry group, Gann's "buy the strongest stocks in the
group and sell short the ones in the weakest position" (S4, *Stock Selector*
Ch. VII; *Truth of the Stock Tape* Ch. XVI-XIX). Groups are SEC industry codes
(SIC), fetched once by `scripts/fetch-industry-groups.mjs` through the manual
workflow `fetch-industry-groups.yml` (this sandbox can't reach sec.gov) and
checked in as `lib/gann/industryGroups.json`, so every surface reads the same
map and nothing at runtime calls SEC. Re-run it when `LARGE_CAP_UNIVERSE`
changes, on a feature branch with `commit` set (it commits the file there).
SEC refused GitHub's runners until the repository secret `SEC_USER_AGENT`
(a real name and email) was set; the noreply fallback alone is refused. The
first map (2026-10-21) coded 830 of 831 symbols (ARCC has none) and put 778 in
65 groups (762 in 58 after the review below). Engineering choices, labelled in `lib/gann/industryGroups.ts`: the
three-digit SIC industry group when at least 5 universe stocks share it, else
the two-digit major group, else none; a group rank needs 4 peers. P3(c) passes
on the strongest quarter of the group or of the universe (the weakest, short),
as its design reads S6, and `selectionStrength` counts either. No new fetch;
the group read adds a filter of the month's positions once per group and month.
`STRATEGY_VERSION` was `2026-10-21-gann-group-strength-rank`.

**Groups by industry, 2026-10-28 (owner: "align the raw SEC codes with Gann's
groups").** The group rank above now reads the platform's industries
(`lib/universe/industries.ts`, built for the Scanner's and Test page's industry
picker): the SEC codes are the raw material and Gann's rule decides the group,
one industry as the market trades it, so the codes that misfile a business
(Alphabet as computer programming, ConocoPhillips as a refiner, Qualcomm as
broadcasting equipment, 3M as surgical instruments) are corrected first. A
sector's industries under 5 stocks are pooled as "<sector> (other)" when they
reach 5 together (`buildIndustryGroupMap`), as the SIC map's major-group
fallback did; `buildGroupMap` (raw SIC) stays for the rank's tests. 821 of 832
stocks in 71 groups (was 762 in 58). The industry names and overrides are
engineering choices, labelled. Owner's Law of Creation reading of the pair: SEC
code ⊗ group label is a mixture (both say "industry"); the creating pair is
industry ⊗ how the stock moves with its group, Gann reading a group by its
stocks' monthly position, and a check that a stock moves with its industry is
the planned second step, held until a replay. `STRATEGY_VERSION` was
`2026-10-28-gann-groups-by-industry`; Execute and the 7/4 cutoffs need a fresh
run on it.

**Price and time squared against the move, 2026-10-21 (diagnosis of run 73's P7
inversion: the check −0.188R, P7 −0.150R, negative in both halves).** One translation
defect, fixed: the square shared the angle's anchor, the low for a long, so it passed
when the advance from the low had balanced time and price, which by Gann marks a top
due. Gann measures the balance "up from lows" and "down from highs" (Master Course
Ch. 18, PDF p.440: low 50, price 102, up 52 = 1 year; high 182, now 130, down 52 = 1 year), and
for a long the buy is the decline from the high squaring out. `computeScore` now reads
the square from the last high for a long and the last low for a short
(`squareAnchorKind`, `lib/scoring/score.ts`); the angle, the climax and the boiling
point keep the trade's own anchor. Random walks (`timePillarRule.test.ts`, 38,400
readings): squared 21.1% either way, P7 "and" 11.6% → 9.5%. The same diagnosis found
the population figure carried by trades still open at the window's end, which the
replay reported as `timeout`; that is being split out separately. `STRATEGY_VERSION`
was `2026-10-21-gann-square-against-move`; P7 and the 6/3.5 cutoffs need a fresh run.
**After-merge review sweep, 2026-10-21 (owner's review mandate, applied to nine
PRs merged before it).** Two fixes move verdicts or replay trades. (1) The price
and time square counts only a move away from its pivot the way Gann measures it,
"up from lows" and "down from highs" (Master Course Ch. 18, PDF p.440; "when Time
and Space balance, the stock makes top or bottom", PDF p.202), so a long whose
price has run above the last high no longer takes P7's square from it
(`computeTimePriceSquare`, live and replay alike). (2) On daily bars a reaction
entry whose firing bar traded into the zone and also reached the stop, whether it
closed back or through it, is booked at the reaction entry (the open, if it opened
inside the zone; refused if it opened beyond the stop) and stopped on that bar, a
loss of the whole risk; retiring the plan first, or letting the day's close call
off an entry live had already filled, dropped every same-day stop-out from 1Day
runs. `STRATEGY_VERSION`
was `2026-10-21-review-sweep-square-sign-daily-firing-bar` (merged onto the 7/4
version below); P7 and the 7/4 cutoffs need a fresh run.
**Square of Nine in price, same day (C-LEVELS-15).** Gann lists the numbers on
the Square of Nine's diagonals (3, 13, 31, 57, 91 … and 7, 21, 43, 73, 111 …,
with 8, 23, 46, 77 … and 4, 15, 34, 61 …) as "great resistance points and
measuring out important time factors" (Master Course Ch. 2, PDF 68, per the
memory-bank read of A2.1; Ch. 15A, PDF 393-395, corrects the printed 75 to 73),
and ranks the cardinal and fixed crosses as the strongest angles (Ch. 2 PDF
57-58, Ch. 4 PDF 152-153). The time half was built 2026-09-30
(`squareOfNineTime.ts`); this is the price half. `lib/gann/squareOfNinePrice.ts`
reads the cross numbers (0/90/180/270 and 45/135/225/315, the 22.5° lines and
numbers below 10 left out) as prices in Gann points, and the nearest below and
above price join the S/R list as support and resistance through
`masterLevels.ts`, on the live scan and the replay alike. `squareOf9.ts` (the
anchor spiral) is unchanged. Density, held for the owner: on 400 random walks a
cross number lay inside the 3-point band on 95.8/94.0% (long/short) of
readings at $20, 89.8/89.3% at $50, 70.8/67.0% at $150 and 52.5/56.3% at $500,
because ring k spaces the cross numbers k points apart and the band is 3
points, so a stock reading under about 49 points (ring 3, most stocks under
~$100) nearly always has one in band (the unit is fixed from the bars' gravity
centre, the band from today's price, so not quite always). `historicalSR` itself was already near saturation on the same walks
(before → after, long/short: $20 99.8/100 → 100/100%, $50 99.8/99.8 →
100/99.8%, $150 99.5/99.3 → 99.5/99.5%, $500 97.8/98.5 → 98.8/99.3%); P5(b)
reads the range divisions, not the S/R list, and is unchanged. Stops and
targets read the list too, so plans move: `replay.test.ts`'s A-LEVELS-04
fixture moved from 300 to 295 sessions, because 300's first target became the
cross number short of the failed top. `STRATEGY_VERSION` was
`2026-10-21-gann-nine-square-price`; Execute and the 6/3.5 cutoffs need a
fresh run on it.
**The held old level, same day (diagnosis:
`replay-diagnosis/2026-10-21-historicalSR-saturation.md`).** One translation
defect, fixed. `historicalSR` (P5's old-level half) passed whenever a level of
the wanted role sat inside the 3-point band, and the S/R list holds the
lattices (Square of 144, planetary averages, active angles, Jensen's square of
90, pattern angles, now the Square of Nine), each adding its nearest point
below and above price, plus the daily pivots, so it passed on noise. Gann never
confirms a level by being near it; price has to act there: "wait until it holds
a level 2-3 weeks, buy with a stop 3 points under the lowest week (2-3 days and
the lowest day in active markets)" (W006 p.20, Rule 3(b) p.46); "a stock nearly
always gets support the first time it reacts back to old high levels" (*Truth
of the Stock Tape*); after crossing an old top "it should not react 3 points
below the old high" (Rule 3(c)); the Master Course's Ch. 9 reviews judge a
level by price reaching it and holding inside 3 points. Now, for a long, the
lowest low of the last 10 completed sessions printed from 3 Gann points under
an old support to 1 point over it, at least 2 sessions ago, with no close since
3 points through it (`lib/gann/heldLevel.ts`, price-scaled at the level); the
short mirrors it on the highest high and resistance. Old levels only: the
weekly and monthly pivots, the percentage levels, the campaign bottoms and the
secondary turn (`buildStructuralLevels(...).old`, `lib/scan/structuralLevels.ts`,
which both surfaces now call to build the whole list). Read once in
`readPillarFacts` (`PillarFacts.heldLevels`), so the live scan and the replay
read it the same way (`pillarParity.test.ts`). The S/R list itself, stops, TP1,
MTP and the card are unchanged; without the facts the check fails, as the
pillars do. Engineering choices, labelled: the 10-session reaction, the weekly
and monthly pivots as the stand-in for "old", and the 2-session hold; his
weekly form (2-3 weeks) is not read. Random walks (`heldLevel.test.ts`, 20 walks
a price, 440 readings a side), long/short before → after: $20 100/100 →
43.0/50.0%, $50 99.8/100 → 39.5/47.7%, $150 99.8/99.1 → 34.5/42.5%, $500
99.3/99.8 → 26.6/36.1%. `STRATEGY_VERSION` was `2026-10-21-gann-held-old-level`;
P5, Execute and the 6/3.5 cutoffs need a fresh run on it. The review's second
round merged onto it (no new rule): `STRATEGY_VERSION` was
`2026-10-21-review-second-round-on-held-old-level`.

**The held range division, same day (pillar census:
`replay-diagnosis/2026-10-21-pillar-saturation-census.md`).** P5's other half,
the percentage levels (`gannRetracementConfluence`), still passed on nearness:
a division about every 1/24 of each range, each with the 3-point allowance,
passed 56-92% of random-walk readings and carried P5 once `historicalSR` was
fixed. Gann's Ch. 9 reviews judge a division the way they judge an old top, by
price acting there ("held 2½ above 193", "not 3 points above 193"), so the
division now has to be the one the last reaction stopped at and held, read
with `historicalSR`'s rule (`heldRangeDivision`, `lib/gann/rangeDivisions.ts`),
live and replay alike through `readPillarFacts`. Random walks, long/short: $20
62.0/58.2%, $50 59.3/55.5%, $150 55.5/49.1%, $500 46.1/37.3%. Still denser at
low prices (the allowance), held for the owner with the rest of the price
scaling. `STRATEGY_VERSION` was `2026-10-21-gann-held-range-division`; P5,
Execute and the 6/3.5 cutoffs need a fresh run on it.

**P9's definite indication, same day (same census).** P9's trigger check
passed 98-100% of random-walk readings because a plan is priced on almost
every session, and 51-77% of those plans were crossings still waiting for the
close 3 points past the old top. Gann buys after the definite indication, the
crossing made (W006 p.20, Rules 3(b)-(c) pp.46-47), so P9 now reads
`indicationShown` (`lib/scoring/score.ts`): a crossing counts once it is
`held` (crossed by 3 points, not broken back, not yet bought), and the old
bottom (Rule 1) and the held bottom count as they stand. Measured share of
readings with the indication shown: $20 23%, $150 46%, $500 52%; P9 itself is
about half of that once the reaction check is read (estimated, not measured).
The `entryTriggerArmed` check, the plan and `tradePlanReady` are unchanged.
`STRATEGY_VERSION` was `2026-10-21-gann-definite-indication`; Execute and the
6/3.5 cutoffs need a fresh run on it.

**P6's monthly 45°, same day (`replay-diagnosis/2026-10-21-p6-angle-scale.md`).**
P6's "holds the 45°" read the daily 45° at one Gann point a session (15-65% a
month) and passed 1-13% of random-walk readings, with no difference between an
uptrend and none. Gann's trend test is the monthly and weekly angle: the
monthly chart decides the main trend (Master Course GA-2/3), "monthly/weekly
angles > daily" and "first weakness = breaking the first important angle up
from the last bottom of the final run" (GA-21-23), angles start after 3 months
(GA-7/9), and no stock holds more than a point a month for long (printed
p. 199). The daily 45° is his cinch buying point, which the S/R list already
carries. So P6(a) now reads the monthly 45° at 1 Gann point a month from the
last bottom of the 3-month swing chart (last top, short), held unless broken
by 1 point (`readMonthlyFortyFive`, `lib/scoring/pillars.ts`, closed months,
live and replay alike). Random walks, 20 a price: no drift $20 16.0/21.8%
(long/short), $150 46.6/55.4%, $500 56.8/64.4%; drifting up 0.05% a day $20
31.2/13.4%, $150 63.6/30.6%, $500 73.8/36.8%. Engineering choices, labelled:
the 3-bar chart as "3 months", its last swing as "the last bottom of the final
run". Trap for later work: `majorAnglePivots` on weekly or monthly bars uses
the 7-calendar-day chart, so every bar turns; give those timeframes the 3-bar
chart. The squeeze still reads the daily angles. `STRATEGY_VERSION` was
`2026-10-21-gann-monthly-forty-five`; P6, Execute and the 6/3.5 cutoffs need a
fresh run on it.

**Trade style and instrument, 2026-10-21 (owner: "how can we make it possible
that the trade plan aligns with the type of trade that the user is looking for.
Swing, intraday", with futures, crypto, options, forex and commodities).** Gann
answers it (design: `/mnt/project-files/trade-style/DESIGN.md`). He did not
day-trade ("the big money … is made on the long swings and not by day to day
trading", W036; *Commodities* pp. 4-7, 55), so the styles are his two speeds of
one method (`lib/trade/tradeStyle.ts`): **Swing**, the default, and **Fast**,
his fast-market method: the same plan, entry and stop as swing (Rule 3, W006
pp.46-47), and once filled the stop trails 3 points under each completed day's
low (over its high, short) from the fill's session, never lowered, never closed
at the session's end (`readGannExit`'s "day_low", `lib/gann/dayStop.ts`; W006
Rule 2 p.46; the 1940-41 soybean trade, W001 pp.134-137; *Truth of the Stock
Tape*, "stop three points" from the day bought). The style is a trader
preference (`settings.prefs.gannRules.tradeStyle`), chosen on the order ticket;
each trade is managed in the style that stood when it filled (the server keeps
`tradeStyleHistory`, read by `styleAt`), so switching never re-manages an open
trade; the paper and live exit managers read it for the trader's own trades,
counting from the fill (`lib/trade/exit-style.ts`), and the replay walks it under Gann's exits
(`tradeStyle`, `?tradeStyle=fast`). Trades automation places stay on swing
until the replay has measured Fast. The plan, verdict and every surface that
shows levels are the same in both styles, so nothing else reads it. **Corrected
the same day (review of #405):** the first build put the day stop on before the
fill (`fastLevels`), which moved the crossing line confirmation reads and sat
inside the reaction zone; it was Rule 2's trail read as an entry stop, and is
gone. The intraday alerts' "level held" stop calls the same `gannDayStop`
(intraday thread).
**Fast retired; the chart's timeframe picks the plan, 2026-10-28 (owner: Fast
"is not a necessary function/feature to keep"; "How can I make space for both
of them separately, without creating confusion, of having to create another
chart", then "Yes" to the answer).** Two styles remain, each set by the plan a
trade is taken from: Swing from the daily plan, Intraday from an intraday
alert's "Trade this". The picker is gone (`PICKABLE_TRADE_STYLES` is Swing
alone, the settings route takes "swing" only), and `styleAt` reads Swing for
any fill at or after `FAST_RETIRED_AT`, so a trade filled in Fast before it
keeps its day trail until it closes; the Fast trail and the replay's
`tradeStyle: "fast"` stay for those trades. On the symbol page one chart shows
both: a daily or longer timeframe draws the daily plan, an intraday timeframe
(`INTRADAY_TFS`) draws the intraday panel's current alert for the symbol, or
today's scheduled one before a scan is read (never the "Trade this" link's levels), labelled "Intraday", only when
that alert is offered as a trade, and no plan lines when none is
(`lib/chart/planForTimeframe.ts`, `intradayChartPlan`); the structural levels
show on both, and a line under the chart says which plan is drawn. Verdicts,
the replay and `STRATEGY_VERSION` are unchanged.
One plan for every market: crypto and commodity targets were 1.5R and 2.5-3R,
no Gann source; every named market now takes the level plan (`computeTradeLevels`).
`lib/instruments/spec.ts` defines each market's unit, session, contract size and
risk (futures from the exchanges' specs, forex's pip an engineering choice;
Gann wrote nothing on currencies). Futures and forex have quotes only, no bars or
broker, so they price nothing live yet. Options follow his course (Master Course
Ch. 19A/B, `lib/options/gannOptionPlan.ts`): the premium is the risk, the
ticket offers the first expiry 30 or more days out, strikes a few points out.
`STRATEGY_VERSION` was `2026-10-21-gann-one-plan-every-market`; every named
market's rounded plan is now checked as F-02 checks the R model's.

**Group rank reviewed, same day (owner's review mandate, run on #388 after its
merge).** Three fixes. (1) The major-group fallback counted every stock with the
two-digit prefix, those already in an industry group too, so leftovers formed
"groups" of one to four that never ranked; it now counts only the stocks left
over, and every group holds at least 5 (762 symbols in 58 groups, was 778 in 65).
(2) A group's strongest is a quarter of its members rounded down, at least one
(`groupTopCount`); the percentile cut passed the top 2 of 5. (3) Gann ranks the
groups before the stocks in them (*Truth of the Stock Tape* Ch. XVI, "Position of
groups"; Ch. XVII, buy the strong stocks and sell the weak), so the group rank
counts for a long only in a group whose median position is not in the universe's
weakest quarter, and for a short only in one not in its strongest
(`groupPercentile`, the members' median, the two middle readings averaged in an
even group; the median and the quarter gate are engineering choices, held for
the owner). The best stock of a weak group is no longer a strong stock.
Industry groups are labelled by their key and their members' commonest SEC
description, major groups by their key alone.
Dual share classes (GOOG and GOOGL) counted as each other's peers, in the
universe and the group; answered from Gann 2026-10-28 (he names each company
once, TST Ch. XVI-XIX): the rank counts one class per company
(`SHARE_CLASS_OF`, `rankedClass`). `STRATEGY_VERSION` was
`2026-10-21-gann-group-rank-review`; Execute and the 6/3.5 cutoffs need a fresh
run on it. The Fast trail (review of #405, above) merged onto it:
`STRATEGY_VERSION` was `2026-10-21-gann-fast-trail-after-fill`.

**One entry a session in the replay, 2026-10-21 (review of #395 and #393).** The
replay traded both of a session's buying points; it now trades the one the live
scan shows (`chooseSessionEntry`: the continuation when it armed, else the
reversion) and sets the other aside, "never buck the trend" (never-failing rule
5). The set-aside point (`ScanResult.setAsideEntry`) is recorded on every live
path, kept in `daily_scans.detail` with the decision state, and named on the
setup card on the daily lists and the scanner (not the tracked and saved
lists or the ticker page's plan card, whose rows store no set-aside point);
`redactDecision` keeps `decisionState`. The lists hide every row
Gann rejected, whatever the Signal and Regime Engine read. Live verdicts are
unchanged; replay buckets move.
**The cutoffs are 7/4 again (owner, same day: "we should be using 7/4 as the
cut offs").** `EXECUTE_SCORE_THRESHOLD` 7, `WATCH_SCORE_THRESHOLD` 4
(`lib/scoring/weights.ts`). Checked first that it was not already settled: 7/4
was the protocol's pair until the 2026-09-14 stopgap; 6/3.5 was "confirmed"
only on the 2026-09-23 run, which measured the pre-fix 15-minute trigger
(F3.1-F3.3) and none of the nine pillars, and no later commit moved them. Every
"6/3.5 cutoffs" above is history. Gann gives no cutoff on a count of his
conditions, so this is the owner's display decision. Live verdicts move.
`STRATEGY_VERSION` was `2026-10-21-cutoffs-seven-four-one-entry`; #412 (same-day
stop-outs, the square from highs) merged onto it as
`2026-10-21-review-sweep-square-sign-daily-firing-bar`, and the eclipse window
below merged onto that; the six-year daily rerun that measures 7/4 runs on the
current version.

**Eclipse crossings act, 2026-10-22 (Chuck: astrology is "no longer research
only ... replicate said methodology into GSPS 1 for 1").** M-S4 (Mikula, W012
PDF pp. 32-35, a labelled reconstruction): a planet (Mercury, Venus or Mars)
crossing, within a day, the longitude of an eclipse that fell within 10
sessions of a 3-Day Chart top is a dated window for a top in the time-window
hold (`lib/gann/eclipseLongitude.ts#eclipseBreakOn`, read by `timeWindowsAt`),
live and replay alike; no mirror for a bottom. It reproduces Mikula's 1907 and
1901 cases. About 6 ms, read only when a counter-trend short Execute needs a
window. Not acting, with the reason: Bucholtz's first-trade chart
(C-ASTRO-09, `lib/research/firstTradeChart.ts`) needs a true first-trade date
GSPS does not hold, and it is not Gann's; Jensen's aspects measured against
Gann's own 1919-1921 malefic stretches showed no lift (A-ASTRO-11,
`lib/research/maleficCycles.ts`), so they are not Gann's malefic cycle.
`STRATEGY_VERSION` was `2026-10-22-gann-eclipse-break-window`, merged onto
`2026-10-21-review-sweep-square-sign-daily-firing-bar`, whose fixes it keeps.
**First-trade dates and chart, same day (Chuck: "Search for, confirm and
ultimately use these dates").** `scripts/fetch-first-trade-dates.mjs` (run by
`fetch-first-trade-dates.yml`, since this sandbox can't reach the sources)
reads each universe stock's Wikidata listing on a New York exchange (P414/P580,
by CIK), its first IPO prospectus on SEC EDGAR (424B1/424B4) and Yahoo's first
daily bar, and keeps Yahoo's date only where it agrees within 3 days with one
of the other two (`lib/gann/firstTradeDates.json`; `confirmedFirstTrade` reads
only those). First run: 288 of 832 confirmed, 282 in conflict, 251 single, 11
none. Listings before EDGAR (mid-1990s) with no Wikidata date, such as AAPL, KO
and JPM, stay unconfirmed; Wikidata often dates a ticker change, not the first
trade; a SPAC's date is the shell's first trade. C-ASTRO-09 moved to
`lib/gann/firstTradeChart.ts` and acts: Bucholtz's transits (Mars to Uranus to
the natal Sun-Pluto), chosen on the 3-Day Chart swings before a turn and exact
within 3 days of it, are a window in the time-window hold, live and replay
alike (`readWindowTurn`'s `firstTrade`; `InstrumentFacts.firstTrade` in the
replay). Not Gann's (Tier C), included on the owner's word. About 116 ms the
first time a stock is read and under 0.1 ms after (transits cached by planet,
day and year), only when a counter-trend Execute needs a window.
`STRATEGY_VERSION` was `2026-10-22-first-trade-chart-window`.

**Mass pressure, 2026-10-22 (owner: "Build these: 10 can be filled from Gann's
own pages. Mass pressure ... written out in the Master Course (Ch. 7)").** Gann
forecast the year by laying the years back over it on his Master 20-Year
Forecasting Chart of the averages ("for the 1929 forecast, I compared 1919 …
1909 … 1899 … and 1869", Ch. 7 PDF 224-225; for 1936 every decade back to 1866,
expecting 1896 to repeat, PDF 227-228; *Commodities* pp. 11-12, his fifth
factor). `lib/gann/massPressure.ts` averages the month's move in every decade
back to 70 years (the 1936 lesson, the fuller one) and reads its sign; P1's
cycle check now needs it not against the trade, as well as no yearly count due
against it. The record is Shiller's monthly S&P composite from 1871, checked in
(`lib/gann/marketHistory.json`, `scripts/fetch-market-history.mjs`, ODC-PDDL),
an engineering stand-in for the Dow, read from the session's New York month for
a stock on both surfaces, so no request. Engineering choices, labelled: equal
weights, the sign as the direction, the month's move read centred (the figures
are monthly averages). On 1941-2026 its sign agreed with the month's move 57.0%
of the time against a 54.3% chance rate: weak, measured in the replay as
`massPressureWithTrade`. Same change, a parity fix: the replay handed crypto
SPY's bars, which the live scan never fetches, so crypto replays read a market
trend, leaders and campaign length live never did; now neither does. Context
only: Gann's 84-year count (Ch. 7 PDF 219) on the same record, a major market
turn 84 years back to the month, judged on the record before the month read
(`eightyFourYear.ts`; April 2026 is 84 years from the April 1942 low), and the
Dollar Trend (A-OTHER-06, his 1954 course: the market's value crossing old
highs or breaking old lows, `dollarTrend.ts`, SPY's months on the 3-bar chart
standing in for the NYSE's total value). Also context, a labelled
reconstruction: Gann's three curves (A-TIME-13, the 1922 forecast: "the
commodity curve, money curve and curve of stocks. Sometimes one of these curves
will cause a change of trend"), each read as the curve of stocks is, on the
long rate and the price index (`threeCurves.ts`, `curvesDisagree`). `STRATEGY_VERSION` was
`2026-10-22-gann-mass-pressure`, merged onto the eclipse window's version, whose
window it keeps. The first-trade chart window above merged onto it (no new
rule): `STRATEGY_VERSION` was `2026-10-22-first-trade-on-mass-pressure`.

**Change-date rank and swing eighths, 2026-10-22 (A-TIME-17, A-OTHER-12).**
W036 p.13's "dates marked X are the most important" is read through Master
Course Ch. 14's order (PDF 389-390: anniversaries, then ½, ¾, then ⅓ and ⅔;
Ch. 18 TP-1 sets ¼ beside ¾). `YEAR_FRACTIONS`, `INCORPORATION_DEGREES` and
`SEASONAL_POINTS` already followed it; it is now cited and pinned
(`changeDateRank.test.ts`). The 1909 account of orders at the top or bottom
eighth of a swing (W001 pp. 1-2) is a labelled reconstruction
(`lib/gann/swingEighths.ts`: the last completed 3-Day Chart swing divided by
8): a card line and the measured factor `entryInSwingEighth`, never a gate.
Cover shorts on bad news (A-EXIT-04, *Tunnel* p.223): bad is read from the
market, as Gann reads it ("bottoms on bearish news", *Commodities* p.8; W006
p.14), so an open short in profit whose last session closed down with a news
item on the symbol since the prior 4 PM close gets an offer to cover in the
paper and broker exit notes (`lib/gann/badNews.ts`, `readLiveBadNews`, Alpaca's
news API, `fetchNews`; one read per symbol a day, equities only). Nothing
closes on it, and the replay holds no news, so it is unmeasured.
Q9 and Q34 re-asked under "Gann answers it": the pyramid keeps decreasing lots
(A-PYRAMID-02; his course's Rule 5 and *Tunnel* p.198 against W006 p.47's
halving after the 4th or 5th lot), and "a day for a year" (A-TIME-31, *Tunnel*
pp.371, 373) stays research-only (`lib/research/dayForYear.ts`, no consumer):
no Gann method says where it acts.
Verdicts unchanged, so `STRATEGY_VERSION` stays.

**The portfolio manager ranks by Gann's score, same day (review sweep).** It
ranked armed plans by the Signal & Regime Engine's alignment tier, the
weighted grade the scorecard no longer uses. It now ranks them by Gann's score,
the nine pillars out of 9 (`rankPlansByScore`, `lib/automation/portfolio-manager.ts`),
read from the member's open monitor of the symbol (`active_monitors.score`, the
latest scan's reading; a terminal monitor's stale score is never read) and only
when the monitor still reads the plan's direction. That
way a capacity-limited run spends Gann's five stocks on the strongest ("the
stocks that show the most strength", *Stock Selector* Ch. VII). A plan with no
score goes last and ties keep the older plan first (engineering choices). A
failed read ranks nothing, is logged in the run's errors, and never stops the run. There is no migration. Verdicts and the replay are
unchanged, so `STRATEGY_VERSION` stays.

**Automated pyramid adds, same day (Q2 item 3, advanced orders).** The
portfolio manager's scheduled run places Gann's pyramid add
(`lib/gann/pyramid.ts`: 100/50/30/20/10 of the first lot at each crossed swing
top) on the paper lines it opened (`lib/automation/pyramid-adds.ts`): an entry
from an automated plan, the manager on, the line running whole on Gann's rules,
the only working exit on its symbol, not intraday, not in the away window. The
reading is taken on completed sessions, the add fills at the market once it
crosses the trigger, through `placeSimulatedOrder` like any entry. Its exit row
is merged into the line's (migration 0111: `lots`, `merged_into`,
`add_claimed_at`): one row, the whole quantity, `entry_price` the blended cost,
and the stop the tighter of break-even and 5 points under the add's own fill
(A-STOP-06, W022 p.198), as the replay walks one position. Gann's exit rules
read the first lot (`firstEntry`), as the replay does. The replay now measures
that stop from the fill too, not the trigger: `STRATEGY_VERSION` is
`2026-10-22-gann-pyramid-adds-placed` (pyramided replay trades move, verdicts
don't). Broker-side OCO needs nothing: under Q14 there is no target to pair
with the stop, and the bracket rule's tranches already rest as OCO. Live adds
wait for the end of the proving period.

**Paper trades on a ladder of sizes, 2026-10-28 (owner: "make trades of all
sizes ... do some 2, 3, 4 & 5 figure purchases/trades", so the book shows a
trade can start with any amount).** Gann runs one method on every size of
account ($300 for 10 shares, W006 Rule 1; $1,000 risking $100, *Truth of the
Stock Tape*; the $1,000 soybean campaign, *Commodities* pp.134-137; the unit
doubling with profits, A-RISK-04), so the portfolio manager's paper
activations are sized for one rung each: a position costing two, three or four
figures, or the account's own size, the rung the open book (resting
activations included) holds fewest of, the smaller first
(`lib/automation/sizeLadder.ts`). A rung only takes shares away, so Gann's
ceilings hold and placement checks them again. Live accounts are never
laddered. Verdicts and the replay are unchanged, so `STRATEGY_VERSION` stays.
**Per-trade dollar limit, 2026-10-29 (owner: "Build dollar cap", for the
tier tests: $50, $250, $1,000 a trade).** `user_automation_profiles.max_trade_dollars`
(migration 0140, null = none), set on the Automation page, holds every
automated trade to the whole shares it buys at the entry with the ladder's
95% headroom (`lib/automation/tradeDollarCap.ts`): the manager's activation,
placement (read at order time, so older activations obey it; fails closed)
and each pyramid add. It only takes shares away; a stock one share of which
costs more is skipped with a plain note. Verdicts and the replay are unchanged.

**Name charts and great cycles, 2026-10-22 (A-OTHER-08, A-TIME-24; owner:
"Build these: ... name numerology [is] written out in the Master Course").**
Gann's name chart (Master Course Ch. 15A, PDF 401-402): "United States Steel"
has 17 letters, so a Square of 289 whose multiples "strike important
vibrations on the name"; 220½ is the half of the Square of 21.
`lib/gann/nameNumerology.ts` counts the stored company name (`instrument.name`,
the SEC title; legal-form words and state tags dropped, an engineering choice),
and its nearest key number above and below price, in Gann points, joins the S/R
list through `masterLevels.ts`. The same numbers counted in years from the
stored inception (day or month precision; the NYSE Permanent Chart reads a year
a cell) open a dated window in the time-window hold
(`timeWindow.ts#inceptionWindows`). The great cycles (W001 pp. 7, 11, 13-14;
lengths per lesson: 20 years 1931, 60 years 1935, 20,736 days 1953, 90 years
1955; `timeCycles.ts#GREAT_CYCLES`) open a window in the month they end, from
inception and from the monthly chart's major pivots for the counts
`MAJOR_CYCLE_YEARS` lacks (`greatCycleHits`). Both surfaces read the same
reference (732 equities have a name and a profile row). Dewey's repetition count
fails for both; measured by the replay's window hold. `STRATEGY_VERSION` was
`2026-10-22-gann-name-chart-great-cycles` (merged onto the mass-pressure
version above). The first-trade chart window merged onto it, its date carried
in the same `WindowAnchors` (no new rule): `STRATEGY_VERSION` was
`2026-10-22-first-trade-on-name-chart`, and the re-buy's rule-9 replay merged
onto it as `2026-10-22-gann-rebuy-rule-nine`; Execute and the 7/4 cutoffs need a
fresh run on it.

**Extremes, boiling point and the Sun's travel act, 2026-10-22 (the recheck's
open items, `gann-feature-map/review/2026-10-22-recheck.md`).** Gann's own
readings that were context only now act where he says they act, live, paper and
replay alike, since every surface reads `readGannExit` and `buildStructuralLevels`.
M-E11 (approximated): a reverse signal day against the trade after the fill moves the stop 3
points beyond that day's extreme (`reverse_signal`; *Commodities* pp. 311,
317-318). M-E12: an exhaust gap against the trade takes it off, with no reversal
(`exhaust_gap`, `exhaustGapAt` in `extremeRules.ts`, pp. 318-325; a gap on a
session after the fill's, read after the trend-change calls so those still
reverse); the filled gap
and the gap count stay context. M-T10: once the weekly run in the
trade's direction has lasted 6 weeks the stop trails 10 points from the best price ("wait to sell
your stock until it boils", *Stock Selector* Ch. V; `boiling_point`,
`runBoilingPointFromPivots`). Both new stops reverse and re-buy as the other
trailing stops do. A-ASTRO-03: the Sun's travel since the major low added to that
low (W046 p.1) joins the S/R list (`sunTravelLevel`, via `masterLevels.ts`). M-P4:
the intraday first target averages the old levels within 1%, as the daily plan
does (`lib/gann/nearbyLevels.ts`, moved from `lib/strat/levels.ts`; round numbers
kept apart). Engineering choices, labelled: the 10-point trail is the Stock
Selector's figure on the Gann point (his Rumely trail is a raw 10 at $105;
superseded 2026-10-28, "Gann's figures read at his price" below;
A-STOP-04 reads his "10 at high levels" as 5), the 6 weeks are read on the 7-day chart's
run. Measured on 200 random walks: about 0.13 ms more a full exit read, 0.13 ms
for the Sun level in an S/R build. Plans and exits move: `STRATEGY_VERSION` was
`2026-10-22-gann-extremes-boiling-sun-act`; the rule recheck fixes merged onto
it as `2026-10-22-gann-rule-recheck-fixes`, and Execute and the 7/4 cutoffs need
a fresh run on that.

**Flanagan's yearly cycles checked against Gann, 2026-10-28 (source note B18).**
James Flanagan's *W. D. Gann's Master Time Factor Revealed* (secondary) adds 9-,
13-, 14-, 40-, 100-, 120- and 150-year cycles and a "dominant cycle" step. Gann's
own text carries 9, 14 and 40 (January 1955 list, Master Course Ch. 14, PDF 387),
84 (1935, Ch. 7 PDF 219), 90 (1955, "the Great Cycle") and 100 (*Commodities*
p. 224); 13, 120 and 150 are Flanagan's alone and are not built. P1's cycle check
now counts every lesson's yearly list (1935, 1955 and 1931) on the stock's
61-year monthly record, the one the time-window hold reads
(`pillarYearCycleConvergence`, `readPillarFacts`' `yearCountMonthly`, live and
replay alike), and the market's 84-, 90- and 100-year counts on the long record
(`marketCountHits`). Random walks, long readings with a count against: 14.5%
before, 43.2% now; the replay measures whether the stricter check helps,
through P1's own factor row (about 0.23 ms a read). Stated exception: the
shortlist re-rank, the scan's year-cycle badge and the replay's
`yearCycleSplit` keep the 1935 list on ten years, since the re-rank's bonus was
measured on that reading; `yearCycleSplit` no longer stands for P1's check.
The dominant cycle is Gann's step (the
1936 forecast's "I expect the 1896 cycle to repeat") with a choosing measure
Gann never gave; built as context and the factor `dominantCycleWithTrade`
(`dominantCycle.ts`), not acting: on the record it called the month right 54.3%
against the decades' average's 57.3% (about 0.4 ms a read). `STRATEGY_VERSION` was
`2026-10-28-gann-p1-long-counts`; Execute and the 7/4 cutoffs need a fresh run.
**Scan pre-filter and share classes, 2026-10-28 (Gann alignment audit, scan
share: `/mnt/project-files/gann-alignment-audit/scan-universe-selection.md`).**
The market scan's coarse pre-filter read two things Gann does not: a reversion
took its level point from price merely near a daily level, and a continuation
ranked on the 50% points of the last 20 and 50 bars and a 1.2 ATR travel.
Now the level point needs one of the full scan's old levels held (`readHeldLevel`
on `oldStructuralLevels`, as `historicalSR` reads it since 2026-10-21; W006
p.20; the weekly chart rolled from the sessions, the coarse pass's one gap), and a continuation ranks on holding a
point beyond the 50% of the extreme range and beyond half the highest price
(*Commodities* pp.35-37; Master Course PDF 11, 264-267), on the monthly record
when it has landed. This orders the daytime scan; no stock's verdict moves.
The rank counts one share class per company (above). `STRATEGY_VERSION` was
`2026-10-28-gann-one-class-per-company`, merged onto the industry groups and
double-bottom weeks as `2026-10-28-one-class-on-groups-by-industry`.

**P8's base is the one just left, 2026-10-28 (diagnosis of the six-year daily
run's volume inversion,
`/mnt/project-files/replay-diagnosis/2026-10-28-six-year-daily/p8-volume-diagnosis.md`).**
One translation defect, fixed. P8's base half passed whenever price sat in a
long range not yet broken against the side, so it passed for a long and a short
alike while price was still inside: 82% of random-walk readings at $20, 29% at
$500, both sides. Gann's rule is the time in the range, then the crossing: "2-6
or 10-13 weeks in a narrow range" then cross the tops or break the bottoms, "the
longer in range, the bigger the move" (Master Course; *Commodities* p. 62). Now
the base counts for a long only once price has crossed its top, and for a short
once it has broken its bottom, within the last `BASE_LEFT_SESSIONS` (20, an
engineering figure) and with no close since back 3 points inside the crossed
extreme (W006 Rule 3(c) p.47; `readBaseLeft`, `lib/gann/accumulation.ts`, read
once in `readPillarFacts` for both surfaces). Random walks after: 0% at $20 and
$150, 0.6/1.5% at $500 (long/short), so P8 now rests on the volume rule (63-70%
of readings, the diagnosis's figures). The search adds about 0.07 ms to a full
accumulation read (0.016 to 0.082 ms on 520 bars); the distribution reading
reads the range alone (`readAccumulationRange`), so its cost is unchanged. The volume rule itself (the two-thirds retest) is a separate fix.
`STRATEGY_VERSION` was `2026-10-28-base-left-volume-pillar`, merged onto the
industry groups and double-bottom weeks as
`2026-10-28-base-left-on-groups-by-industry`; P8, Execute and the 7/4 cutoffs
need a fresh run on it.

**Gann's figures read at his price, 2026-10-28 (alignment audit,
`/mnt/project-files/gann-alignment-audit/score-and-levels.md`).** Three figures
Gann gave at a stated price had been ported as that many Gann points, which
already grow with price (`pointScale.ts`), so each ran about two to three times
his own. The re-buy after a stop rests his 12 points under the best price read
at about 230 (*Tunnel* p.198: re-bought at 218, stop 212), `12 / pricePoint(230)`,
about 4.4 Gann points (`rebuy.ts`). The boiling point trails his 10 points read
at Advance Rumely's 105 ("a 10-point stop, out at 95", *Stock Selector* Ch. V), about 5.9 Gann
points (`exitRules.ts`). A narrow range is at most his widest dated one, 4
points (56-60 in 1898; 2 and 2½ on the Rails, Master Course pp. 246-248), 4/3
of the 3-point allowance (`NARROW_RANGE_ALLOWANCES`, was 3, held for the owner
until now and answered from Gann); the range a market is leaving stays read
during the leg out of it (`narrowRangeBeforeLeg`), since the walk from its top
to the crossing line is wider than narrow, so the breakaway's volume rule is
still asked. Random walks, armed long entries held by the breakaway: $20 43% →
23%, $150 23% → 0.6%, $500 5% → 0%. Rule for porting a figure: when Gann gives
a number at a price, divide it by `pricePoint` at that price; only his "3 points"
(the scale's own anchor) and figures he states across price bands are read as
Gann points directly. `STRATEGY_VERSION` was `2026-10-28-gann-figures-at-his-price`;
Execute and the 7/4 cutoffs need a fresh run on it.

**Levels from the major lows, 2026-10-28 (Gann alignment audit,
`/mnt/project-files/gann-alignment-audit/`).** Jensen's square of 90 is laid at
the long monthly record's major low and high (`jensenLevels`' `record`, the
monthly chart with the daily bars, as the Square of 144 reads), not a year of
daily bars: Jensen lays it "at every major low" after Gann's January 1931
Pattern Chart. The nearest multiples of the low below and above the close join
the S/R list (`lowMultipleLevels`; 45 Years Ch. IV p.30 ranks "100% of the low
and its multiples" second only to 50%), which had been held on the card for a
replay against "Every Gann method acts". They join `all` only, never the old
levels `historicalSR` reads: from a deep major low they sit closer together
than the 3-point band and were "held" on noise (queue review: long-side pass
39.8% → 60.5% at $20 with a low a thirtieth of the start). The card's percentage levels
read the same monthly anchors. The Sun's travel (`sunTravelLevel`, A-ASTRO-03)
counts from the major low too: the 1954 coffee letter counts it from the April
1931 low, years back, so it reads the closed weekly record (5 years, the weekly
level chart) when its lowest week is below the daily year's low, dated to that
week's Wednesday (engineering: a weekly bar holds no day), live and replay
alike (`InstrumentFacts.weekly`, `buildStructuralLevels`); only a week that
ended before the daily record counts, so a provider's week inside it never
moves the low's day. Stated exception: the time side (Jensen's time counts and
Mars's half return in `timeWindowsAt`) still counts from the daily year's
extremes, since a count in days needs the low's day and a monthly bar dates
none; held for the audit ledger. `STRATEGY_VERSION` was
`2026-10-28-gann-levels-major-lows`.

**Time and price at the turn, 2026-10-28 (alignment audit H2, the window
saturation held since 2026-10-20).** The time-window hold read a turn as due
when any dated window was open on it, and the windows were open on nearly every
turn (100% of random-walk turns, 2026-10-27), so it selected nothing. Gann
reads the two together: "when Time and Space balance, the stock makes top or
bottom" (Master Course PDF 202), and the time counts mark a change "especially
if the price is at 1/2 or 3/4 resistance" (Ch. 18, TP-2, PDF 440; TP-3 lists
the price resistance levels beside the counts). So `readWindowTurn` now also
needs the turn's extreme at the half or three quarters of a major range
(`turnAtDivision`, `lib/gann/timeWindow.ts`: `rangeDivisions.ts`'s extreme
range, highest price and latest campaign, read on the record before the turn,
3/4 up from the low and down from the high, within the 3-point allowance), on
the live scan and the replay alike (both take the default). TP-2's
"especially" is an emphasis, not a stated requirement: making the division
required is GSPS's reading of it, chosen because time alone selected nothing,
and labelled as such. Random walks: the
turn stood at one on 82% of turns at $20, 68% at $50, 54% at $150, 35% at $500.
`STRATEGY_VERSION` was `2026-10-28-gann-time-and-price-at-turn`.
**The distribution spell's width, same day (audit L-12).** The distribution
spell and `distributedBefore` read "narrow" as 4/3 of the 3-point allowance
(`NARROW_SPELL_ALLOWANCES`, `lib/gann/distribution.ts`), the widest range
Gann dates as narrow (Master Course pp. 246-248), as the breakaway's range
reads it since #513; it was 2 allowances. The three audit fixes merged onto the
delayed fill timing and the midday release: `STRATEGY_VERSION` was
`2026-10-28-gann-major-lows-time-price-spell`, merged onto the Rule of Three
trend and P6's angle origin as `2026-10-28-major-lows-on-angle-origin` (no new
rule), then onto the intraday audit (#515): `STRATEGY_VERSION` is
`2026-10-28-major-lows-on-intraday-audit` (no new rule); Execute and the 7/4 cutoffs need a fresh run on it.

**Early sections only, 2026-10-29 (edge diagnosis of the six-year daily run,
`/mnt/project-files/replay-diagnosis/2026-10-28-six-year-daily/EDGE-DIAGNOSIS.md`:
Execute lost to Watch in both halves and every year, and within Execute the
readings of a move already gone far lost when they agreed with the trade; the
exits were not the loss, since switching either early exit off sent its trades
to the initial stop).** Gann: "All markets move in three to four sections. The
third or fourth movement up or down marks the culmination" (Master Course pp.
244-245; GA-20/21, Chrysler 1935). A new trade with the campaign's trend that
would ride its 3rd or later section is held from Execute to Watch
(`applyCampaignSectionHold`, `lib/scoring/score.ts`), on the live scan and the
replay alike; a trade against the campaign is untouched. Sections are the
weekly chart's record turns that then held `SECTION_HALT_DAYS` (14, the
engineering reading of his "several weeks", labelled) before being exceeded
(`CampaignLedger.tradeSection`); the exit rules' final stage and this hold read
one figure, `CULMINATION_SECTION` (3). Stated exception, held for the Edge
owner: the final stage still counts `sections` on the 3-Day Chart's legs, so
the two counts differ. A top not exceeded yet has ended its section, however
young the reaction. Random walks (40 a drift, 2,080 readings): 3rd or later on
35.8% of readings with no drift, 42.5% at +0.05% a day, 46.7% at +0.1% a day
(the 3-Day count's `lateSection` read 46-54%); the whole ledger read stays
about 0.05-0.07 ms. The public note says only that the move has
run several legs. `STRATEGY_VERSION` was `2026-10-29-gann-early-sections`;
Execute and the 7/4 cutoffs need a fresh run on it.

**The backtest's point-in-time universe, 2026-10-29 (rebuild from the core;
the averages-trend rerun's handoff: "today's large caps carried back six years
flatter longs").** `--universe point-in-time` (`scripts/backtest-universe.mjs`,
`lib/universe/pointInTime.ts`, `lib/backtest/pointInTime.ts`) replays each
calendar year's own large caps: the candidates are today's list plus every
S&P 500 ticker in the span (`lib/universe/sp500History.json`, fja05680/sp500,
MIT, rebuilt by `scripts/fetch-sp500-history.mjs`), a departed ticker read as of
its last day in the index (Alpaca's `asof`, so FB reads META's company and
duplicates are dropped by identical monthly bars), and a candidate is a member
of a year only when its own cap on 1 January (SEC shares filed before it, 18
months at most, times the last monthly close) clears the $10B floor, no
ceiling. An unknown cap fails closed, as `marketCapPass` does, which leaves out
the 20-F listings by domicile, not outcome. A session outside the member years
arms nothing (`ReplayOptions.inUniverse`); an open trade runs to its exit. The
strength rank's peers are each month's members (`buildUniverseStrength`'s
`isPeer`). The departed companies' share counts come from
`fetch-point-in-time-shares.yml` into `lib/universe/pointInTimeShares.json`;
until that file holds them, departed names fail closed and only the
grew-into-the-list half of the bias is removed. Engineering choices, labelled:
yearly on 1 January, the 18 months, the S&P 500 as the candidate list (a past
large cap never in it and small today is still missed). Stated exceptions: the
intraday profile and `/api/backtest` (a person's named symbols, inside the
route's 60 s) read no point-in-time universe; the live scan reads today's list,
which is today's universe; a departed ticker has no stored name, inception,
first-trade date or industry group, so its name chart, inception and great-cycle
windows and group rank are unread where today's names read them (compare the two
by `source` before reading a difference into it). A run needs `--since` and logs
a member-list hash every job of a split run must share. Verdicts and
`STRATEGY_VERSION` are unchanged.


**The dated-forecast track record, 2026-10-30 (owner: "extract the written
track record").** `docs/GANN_FORECAST_TRACK_RECORD.md`. Gann's own Dow swing
tables from *45 Years* (W009 Ch. VII: 465 nine-point swings, 1,425 three-day
turns, `lib/research/dowSwingRecord.json`) are the outcome record for his 52
published, dated industrial calls (1919-1922 from W036, 1929 from W005, 1932
from W001; `lib/research/publishedForecasts.ts`). Scored with a same-year
sliding-window base rate (`lib/research/forecastTrackRecord.ts`): 12 of 52 on
the nine-point swings against 6.0 by chance (p 0.006, the reprinted years
only), 19 of 52 on the three-day turns against 18.0 (p 0.44); the 1929
"permanent cycle" change dates beat chance in no span. The macro cycle behind
the 2027-2029 window (and Aug 2106, the same arithmetic) scored 10 of 40 in
sample (to 1935, p 0.017) and 13 of 142 out of sample against 14.4 (p 0.69),
so `TIME_LINE_RECORDS.macroCycle` stays null and the dated windows stay off
member surfaces. Run: `docs/replay-runs/2026-10-30-forecast-track-record.json`.
Verdicts and `STRATEGY_VERSION` are unchanged.
Rebuild test the same day (`lib/research/forecastRebuild.ts`, run
`docs/replay-runs/2026-10-30-forecast-rebuild.json`): at each issue date, none
of the built time methods (wheel counts, Rule 8 bands, yearly cycles, the 52-week
divisions, month counts, seasonal points, the permanent dates, or agreement of
two or more) met the published calls beyond chance (best p 0.25). The edge
in the calls is the undisclosed time factor; no current forecast is built from it.

**Planetary aspects as the time factor, tested 2026-10-30 (owner shared nine
videos crediting the famous calls to aspects).** `lib/research/aspectTiming.ts`,
run `docs/replay-runs/2026-10-30-aspect-timing.json`, write-up
`docs/GANN_FORECAST_TRACK_RECORD.md` §7. Seven rules fixed from the videos'
descriptions (the videos can't be opened from the sandbox), 21 tests. The
published calls sit on slow-planet aspects (Jupiter to Neptune) more often than
chance (12 of 52 against 4.8, p 0.0007, clears the correction), but no rule
times the Dow's 9-point or 3-day turns 1913-1948, and the 12 aspect calls
caught 2 turns against 10 of the other 40. The grand cross with a grand trine
(the "symbol") is absent on 8 Aug 1908 and 30 Sep 1909 at an 8° orb, with or
without the Moon and Pluto. Research only; nothing acts. `forecastRebuild.ts`
now exports its scorer (`scoreYearDays`, `yearTargets`); its run is unchanged.
**The public event calendar, same day (owner found a paid indicator claiming
"Gann's Laws of Vibration and Bayer's Rules").** `lib/research/celestialEvents.ts`,
run `docs/replay-runs/2026-10-30-celestial-events.json`, write-up §8: lunations,
lunar apsides and declination, ingresses, stations, Mercury's speed, declination
extremes and latitude crossings, 24 tests (45 in the batch, cut-off 0.0011).
None beats chance on the calls or the turns. Bayer's rules are not built (no
Bayer book in the collection). Research only; nothing acts.
**Modern check, same day:** all 15 rules on SPY and DIA 2016-2025
(`lib/research/modernTiming.ts`, turns in `modernTurns.json` from Alpaca, write-up
§9): 60 tests, none clears 0.00083 (lowest: latitude crossings on DIA's 3-day
turns, p 0.002, not on SPY). The live hold's astro inputs are unchanged.
**Hora and Choghadiya, and `docs/PLANETARY_TIMING.md`, same day (owner: keep
the planetary material in "its own file surrounding planetary alignment").**
That file lists every planetary method tested with its rule and result; add
new ones there. `lib/research/horaTiming.ts` (15-minute high and low times,
`intradayTurnTimes.json`): with the weekday held, nothing (p 0.26-0.85). A
first null that randomised the weekday's lord gave p below 0.001, a weekday
effect it cannot separate from the planetary hour; both are in the run.


**The public "master time factor" calculator, decoded and tested 2026-10-30
(owner's codingace.net link).** `lib/research/masterTimeCalculator.ts`, run
`docs/replay-runs/2026-10-30-master-time-calculator.json`, write-up
`docs/GANN_FORECAST_TRACK_RECORD.md` §11. The page computes base date +
round(k × cycle × factor) days for k = 1-6 (defaults 30 × 1.618), a 90°·k
label and price × factor^(k/4); its square, planet, market and checkbox
options change nothing. Not the author's method. 20 tests (two settings, two
anchor modes, the 52 calls, Dow 9-point and 3-day turns 1913-1948, SPY 2% and
5% swings 2017-2026): none beats chance (best p 0.38). Not wired into
forecasting; research only. SPY daily closes for research live in
`lib/research/spyDailyCloses.json` (Alpaca, 2016-01-04 to 2026-10-29).

**Super Timing, combinations and disprovable procedures, same day.** Walker's
*Super Timing* read in full from the Drive scan; its four timing rules
(`lib/research/superTiming.ts`, 28 tests) beat chance nowhere. The combination
test (`combinationTest.ts`, 17 rules, 821 sets, chosen on the Dow 1913-1930,
scored on 1931-1948 and SPY/DIA 2016-2025) finds nothing that holds unseen.
Owner: "Do not defend a supposed secret. Define a procedure that new evidence
is allowed to disprove." `timeProcedures.ts` freezes the shared
reconstruction's Rules A to D with kill criteria written before scoring: A
and D refuted on SPY/DIA 2016-2025, B and C almost never fire as written (not
testable). Forward projections go to `timeProcedureLog.json` each month-end
(`scripts/time-procedures-issue.mjs`), append-only, reviewed Oct 2028. The
rules' own Dow 1913-1948 span needs daily Dow closes the repo lacks (asked of
the owner). Write-up `docs/GANN_FORECAST_TRACK_RECORD.md` §13. Research only.
