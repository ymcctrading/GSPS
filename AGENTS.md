<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# GSPS Agent Instructions

## Product Roadmap

**`docs/SYNTHESIZED_ROADMAP.md` is the governing plan from 2026-10-21**
(owner: the roadmaps, parities, Gann files, Observation of Cycles, Hauck and
the creation equation "coagulate together" into one roadmap "that we shall
follow moving forward"). Read it first: its Part 5 is the current phase's
item-by-item status and its Part 7 says which thread owns what.
`ROADMAP.md` keeps each phase's detail and history. **Read it before
proposing new work, scoping a feature, or prioritizing between options** — it
decides what gets built and in what order, and it outranks `BACKLOG.md`, which
is an unscheduled idea pool rather than a set of commitments.

**Work out the current phase from today's date against this table** — don't
assume Q1:

| Phase | Window | Theme |
|---|---|---|
| Q1 | Aug–Oct 2026 | Monetization & retention foundation |
| Q2 | Nov 2026 – Jan 2027 | Differentiation & scale foundation |
| Q3 | Feb–Apr 2027 | Mobile & community |
| Q4 | May–Jul 2027 | Enterprise & scale |

Then open `ROADMAP.md` for that phase's goals, initiatives, and dependencies.
If today's date is past Jul 2027, the roadmap is expired — say so rather than
defaulting to the last phase.

- When suggesting work, name the phase it belongs to. If it fits no phase, say
  so plainly — it is either out of scope or a reason to amend the roadmap.
- Out-of-phase work is fine when there's a reason (production bug, security
  issue, blocked dependency, or a direct request). Note the deviation rather
  than presenting it as planned.
- When a change invalidates part of the roadmap, update `ROADMAP.md` in the
  same PR and move its "Last updated" date.

## Confidential sources — top-priority standing rule (2026-10-28, project owner)

In Chuck's words: "nothing and I mean absolutely nothing on the platform
disclose[s] his [Gann's] methods or formula, anything by LJ Jensen, anything
dealing with the observation of cycles or hermetic principles." Gann, Jensen,
Dewey/Thomas, the cycles literature and the hermetic principles (Hauck's book)
are the intellectual property the back end is built from, known only to
Claude and Chuck. GSPS presents itself as a stock trading and scanning
application.

- **User-facing means everything a person or a browser can read:** UI copy,
  labels, tooltips, the school, emails, notifications, API responses (strings
  and, over time, field names), user docs, marketing and page metadata, and
  any string in a `lib/` module a client component imports (it ships in the
  JS bundle; comments don't).
- **Internal code and project files may keep their citations**, in comments,
  server-only trace lines and docs that no user is shown.
- **The school teaches how to trade** with publicly available methods by
  others that build on or modify Gann's work (for example Elliott Wave),
  never Gann or these sources themselves. This supersedes, for education
  copy, the "Gann-grounded platform" rule's reach into education below; the
  back end stays Gann one for one.
  **Done 2026-10-28 (owner approved the outline):** Academy 2's, 4's and 6's
  method courses now teach Dow Theory, support and resistance, the 50%
  pullback, breakouts and pullbacks, Wyckoff ranges, trailing stops, Elliott
  Wave, Fibonacci, market stages, calendar lore and sizing, with Mr. Bull and
  Mrs. Bear kept and the lesson ids unchanged.
  `lib/school/__tests__/publicMethods.test.ts` fails a lesson that writes out
  one of the method's own rules. The graduation exam still grades GSPS's own
  plans, explained in plain words without the rules' timing.
- **Ids a browser or a member's row can read are neutral (2026-10-28, #510).**
  Exit rules are `structure` and `structure-runner` (the old `gann` and
  `gann-runner` are still accepted, so every "gann" exit rule in the history
  below is `structure` now), the strategy mode is `gsps`, the settings route is
  `/api/settings/trade-rules`, `pointScale.ts` exports `pricePoint`,
  `threePoints` and `pointForBars`, and scan results reach the client as
  `PublicScanResult`. Rows a member can read (`daily_scans`, `orders`,
  `trade_plans`, `trade_logs`) store `STORED_STRATEGY_VERSION`, a dated label,
  never the `STRATEGY_VERSION` name (`lib/backtest/publicVersion.ts`).
- `scripts/check-banned-terms.mjs`'s `CONFIDENTIAL_TERMS` gates the copy
  surfaces in CI, and `scripts/check-bundle-terms.mjs` gates the built bundle. Check the built bundle too (`grep -r` over `.next/static`)
  when a change touches what a client imports.

## Cross-platform consistency — standing principle

If a concept exists anywhere in this codebase — an indicator, an anchor
convention, a fixed constant, a computed field — and it applies to another
surface, it must exist there too. **Not existing everywhere it applies is
equal to not existing anywhere.** A concept built once and left stranded in
the module that introduced it is not "partially done" — treat it as not
done, and finish rolling it out before calling the work complete.

This is not hypothetical caution; it is the exact shape of two real defects
found in this codebase on 2026-09-10:

- **`harmonicProximity`'s stale Square-of-9 anchor.** The fix landed in the
  two callers feeding the scored criterion (`lib/scanTicker.ts`,
  `lib/backtest/replay.ts`), but `lib/marketScan.ts`'s coarse pre-filter and
  `lib/signals/confluence/gann.ts`'s confluence card kept the old, buggy
  anchor for another full day — quietly undermining every backtest run
  measured against the "fixed" criterion in between (see
  `lib/validation/criteria-registry.ts`'s `harmonicProximity` entry for the
  full history).
- **ADX/DMI**, built and validated for `lib/signals/regime.ts` (the Signal &
  Regime Engine) specifically to avoid leaning on PSAR/Supertrend as a sole
  signal, never reached the separate 9-point scanner score
  (`lib/scoring/score.ts`) at all — a second subsystem with the exact same
  "which indicator confirms a trend" problem, solved once and never
  propagated. (**Historical example, still valid as an illustration of this
  rule** — but as of 2026-09-16 ADX is no longer the scanner's answer to that
  problem: `adxTrendStrength` was discarded for failing the Gann-grounding
  gate. See "Audit outcomes" below. As of 2026-09-17 `lib/signals/regime.ts`
  no longer uses `adx()` either — see `lib/gann/trendStrength.ts` — and
  `adx()` was deleted on 2026-09-25.)

Before considering any indicator, anchor rule, fixed threshold, or computed
field "in place," check every surface it plausibly applies to — other
scoring paths, the live scan vs. the backtest replay, confluence/display
modules, coarse pre-filters — and either wire it in everywhere applicable or
say explicitly why a given surface is an intentional exception (e.g. a
module whose spec genuinely calls for different behavior, not just an
oversight). "When appropriate" is the only carve-out: a concept that
*shouldn't* apply somewhere (different timeframe, different asset class,
different governing spec) is a real exception, not a violation of this
rule — but the default assumption is that it applies, and silence is not
an exception.

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

## WD Gann precedence — standing principle

When GSPS's current implementation, a design choice, or a piece of copy
conflicts with something W.D. Gann actually taught (his own published books,
or his private paid-course material and letters per
`docs/GANN_HISTORICAL_SOURCES.md`'s tiers), **default to Gann's own
methodology**, not GSPS's existing approach. This is a direct, standing
instruction from the project owner (2026-09-16), not a case-by-case
judgment call: where a real choice exists between "what GSPS currently
does" and "what Gann's own sources say," the sources win.

**Gann answers the question; don't hold it for the owner (2026-10-21,
owner: "anything that can be answered by a Gann method, should use the Gann
method as an answer. going forward on the GSPS platform").** Before holding
any question, decision or open item for the owner, ask whether a Gann method
answers it, and look in his books (`/mnt/project-files/literature-reading-output/`),
`docs/GANN_HISTORICAL_SOURCES.md` and `docs/memory-bank/`. If one does, that is
the answer: build it, cite the source in the code and the change record, and
tell the owner what was decided and why, rather than asking. This covers
trading rules, thresholds Gann states, entries, exits, stops, sizing, time and
price readings, and how a rule reads on a surface. Only a question no Gann
method answers goes to the owner: security, access, billing, ops, legal,
product copy with no Gann content, or a figure Gann never gave (label that
engineering choice as such). It is the owner's earlier "Determine how WD Gann
would answer these questions, and those are your answers" (2026-10-21) made
standing.

**"This app is WD Gann re-manifested into a trading platform" (owner,
2026-10-21).** That is the approach for every design question in a session:
the first question is how Gann did it, and where he answers, his answer is
the design.

**This covers how the platform runs, not only trading rules (owner,
2026-10-21: "when I say that gann's methodology should be completely infused
into the platform, this is one of those instances").** What to scan, what to
watch, how often to refresh, and which names get the scarce requests are
questions Gann answers too: he chose his active stocks from the daily charts
the night before and timed them in the session. A data-feed or budget limit
is a reason to ask how Gann would choose, never the end of the answer. The
intraday scan's fixed list was reported as "the feed's limit" until the owner
asked; the evening focus list below is the answer the method already gave.

This does not mean bypassing engineering judgment about *how* to translate
a disclosed rule into working code, and it does not mean porting a raw
historical number (a 1930s dollar/cents figure, a commodity-specific unit)
across asset class and era without saying so — see `lib/strat/levels.ts`'s
`combineNearbyLevels` for a worked example of implementing the disclosed
*rule* while declining to port its literal magnitude, documented inline for
exactly this reason. It does mean: when a Gann-derived candidate is ready to
build, build it live rather than leaving it queued behind a validation
process that would otherwise gate it indefinitely, and document the change
in place (what changed, when, and why) so a future reader — human or
another session — can see the decision rather than archaeology it from a
diff. `docs/GANN_PLATFORM_AUDIT.md`'s Part 4 items, wired in live on
2026-09-16 (a new tenth scored criterion, `ruleOfThree`; the "3-point rule"
buffer in `lib/lifecycle/entryConfirmation.ts`; the "resistance points near
same levels" clustering in `lib/strat/levels.ts`; the fixed annual calendar
cycle in `lib/gann/timeCycles.ts`), are the standing worked example of this
principle in practice — each carries an inline comment pointing back here
and to that document's Part 4.

This principle does not override AGENTS.md's other explicit, user-directed
overrides above and below (the 1Hour execution timeframe, and the threshold
half of the Execute-collapse stopgap) — those have their own stated reasons
and revert triggers and are not "GSPS's current approach vs. Gann" conflicts
in the sense this section addresses. The *weight* half of that stopgap is no
longer among them: it was resolved on 2026-09-16 under "Gann-derived AND
measured" below, which supersedes it on principle rather than on a revert
trigger.

**On `GANN_SARA_CONFLUENCE.md`'s numerology rule and `lib/gann/digitalRoot.ts`'s
conservative treatment (updated 2026-09-16, project owner direction):**
both are superseded specifically by principles genuinely tied to Gann and
his methodology — not weakened in general. The "no new numerology without
an authorized specification" rule still holds as the guard against
*inventing* Gann lore nobody ever documented; what changed is what counts
as authorized. `docs/GANN_HISTORICAL_SOURCES.md` (the 25-document catalog)
and `docs/GANN_METHODOLOGY_FULL_REPORT.md` (§18.5, which states this
explicitly: "this report itself is the authorized specification" for the
techniques it documents, each traced to a cited primary source — A2.1,
A2.3 — not an inference) together are that authorization. So: a numerology
or astrology technique with no citable Gann source is still off-limits,
full stop. A technique citably his own — even one GSPS previously treated
as conservatively as `digitalRoot.ts` does today (confluence-only, never
independently gating) — can be built out further when Gann's own
methodology calls for it, per this same precedence rule.

## Gann-grounded platform — standing principle

Gann's methodology is the substance of this platform, not one input among
several. This holds on **every** surface, not just the scored criteria:
scanning, level construction, trade lifecycle, exits, risk, education copy,
and UI. Project owner direction, 2026-09-16.

The "WD Gann precedence" principle above governs **conflicts** — whose
answer wins when GSPS and the sources disagree. This one governs **scope**:
a component with no Gann grounding is a defect to be justified or replaced,
not a neutral default.

**This is the platform's governing substance, not one of its features.**
Project-owner direction, restated 2026-09-17: Gann's methodology runs the
entire platform. Scanning, scoring, level construction, entry triggers, stops,
targets, risk, lifecycle, charting, education copy and UI. Any component that
is not Gann-grounded is a defect to be replaced, grounded, or explicitly
justified — never a neutral default, and never "fine because it's only
display."

**MANDATORY, EVERY SESSION: verify platform-wide, do not trust this list.**
Every prior list in this file has turned out to be incomplete, and each time
the gap was found by sweeping rather than by reading. The verification is
cheap and it is not optional:

```
# Non-Gann techniques. Use word boundaries — unanchored "RSI" matches
# "reve<RSI>on" and will hand you a false count.
grep -rnE '\b(RSI|MACD|Bollinger|Wilder|adx|Supertrend|PSAR|Ichimoku|Elliott|Wyckoff|Keltner|Donchian|Fibonacci)\b' \
  --include=*.ts --include=*.tsx lib/ app/ components/ | grep -v __tests__

# Moving averages and VWAP. Added 2026-09-26: the regex above can't see them,
# and the 2026-09-25 audit found them feeding the verdict (F2.5). Hits under
# lib/strategies/, lib/indicators.ts, lib/analysis/indicators.ts and
# components/chart/ are the documented Strategy Modes / chart-overlay
# exceptions. Anything else needs a reason.
grep -rnE '\b(sma|smaSeries|ema|vwap|anchoredVwap|SMA|EMA|VWAP)\b' \
  --include=*.ts --include=*.tsx lib/ app/ components/ | grep -v __tests__ \
  | grep -vE '^(lib/strategies/|lib/indicators\.ts|lib/analysis/indicators\.ts|components/chart/)'
```

Then confirm each hit is dead, documented, or gone. **A component is only
"not live" once you have traced it to zero consumers** — an exported symbol,
an API route, a chart overlay and a database row are all live surfaces, and
three of those are invisible in a code diff. See "Live weights incident"
below for what trusting a diff cost.

**Audit obligation.** The platform contains non-Gann substance that predates
this principle. The list below was verified against code on 2026-09-16 and
extended on 2026-09-17 — it is a starting point, not an exhaustive one, and a
future session should re-check rather than trust it:

- **STRAT pattern detection** (`lib/strat/patterns.ts`) — `2-2`, `1-2-2`,
  `3-2-2`, `3-1-2`, `PMG`. Rob Smith's STRAT, not Gann. **This taxonomy has
  two distinct uses and they have different verdicts — do not collapse
  them.** It used to feed the `patternArmed` scored criterion and every trade
  plan's entry price (**resolved 2026-09-17**: renamed `entryTriggerArmed` and
  regrounded on `lib/gann/entryTrigger.ts` — see "Entry pricing moved off
  STRAT" under "Audit outcomes"), and it is separately wrapped by the
  non-gating confluence layer in `lib/signals/confluence/sara.ts`
  (**investigated and deliberately kept** — see "Audit outcomes" below). The
  last residue, `lib/backtest/replay.ts` using the detected pattern to choose
  which bars and which direction to test (finding F2.7/F3.3), was removed
  2026-09-25. The replay now arms exactly as the live scan does, via
  `lib/scan/entrySelection.ts`.
- **Wilder's ADX/DMI** (`lib/signals/indicators.ts#adx`) — **fully resolved
  2026-09-17.** The scored criterion was discarded 2026-09-16 (see "Audit
  outcomes"); the two remaining consumers, `lib/signals/regime.ts` and
  `lib/signals/states/rangeReversion.ts`, were then replaced by
  `lib/gann/trendStrength.ts`. The "different governing spec" carve-out that
  kept them was a stay of execution, not an acquittal — the question they ask
  ("is this trending or ranging") is one Gann's own swing charts answer. No
  caller of `adx()` remained, and the function was deleted as dead code on
  2026-09-25.
- **PSAR/Supertrend** — **resolved for the verdict engine.** The dormant
  `trendOverlayFlips` hook in `lib/signals/regime.ts` and
  `lib/signals/states/trendPullback.ts` was removed 2026-09-17 (see
  `regime.ts`'s header). Both are now computed, but only in the two places
  that are explicitly exempt: the user-driven chart overlays
  (`lib/indicators.ts`, see "Charting indicators" below) and the opt-in
  `psarSupertrend` Strategy Mode (`lib/strategies/psarSupertrend.ts`, see
  "Strategy Modes"). Neither feeds GSPS's own verdict.

- **Classic charting indicators** (`lib/indicators.ts`, `lib/analysis/indicators.ts`)
  — `sma`, `ema`, `bollinger`, `rsi`, `macd`. Found by the sweep above on
  2026-09-17 and absent from every prior version of this list, which is worth
  remembering when deciding whether to run that sweep again. **Not an open item
  — investigated and resolved the same day as a justified exception. See
  "Charting indicators" under Audit outcomes below before touching any of
  it.**

For each: establish a Gann grounding, replace it with the Gann technique
that serves the same purpose, or document explicitly why it is a justified
exception.

**Scope note — "display only" is not an exemption.** A chart overlay or an
education page teaches a method as surely as a scored criterion applies one.
The Sara/STRAT keep below is an exception because the project owner examined
it and decided it, on the record — not because display is categorically
exempt. Nothing is exempt by category.

### Audit outcomes

Worked examples of this obligation applied. Both are project-owner decisions
of 2026-09-16. Add to this list as the audit proceeds — an item resolved
without a record here will be re-litigated by the next session.

**Worked example: `adxTrendStrength` discarded entirely (2026-09-16,
project owner direction).** Not replaced with anything — the first worked
example of this principle's audit obligation running the other way, toward
removal rather than a swap. `adxTrendStrength` (Wilder's ADX/DMI,
`lib/signals/indicators.ts#adx`) was the one scored criterion with no Gann
lineage at all (postdates Gann's death by more than two decades). It
entered `lib/signals/regime.ts` as the Signal & Regime Engine's
trend-confirmation overlay specifically so that engine would not lean on a
PSAR/Supertrend-style indicator alone (the "Cross-platform consistency"
section's own opening example, and the PSAR/Supertrend bullet just above),
then propagated from there into this scorecard by the cross-platform
consistency principle above — never on an independent claim that it
belonged in a Gann-selected setup's score. With no PSAR anywhere in this
repo (`docs/GSPS_AUTOMATION.md` confirms zero matches), the thing it
substituted for does not exist here, so there is nothing left to keep
substituting for; the criterion comes out, full stop, not "quarantined
pending a replacement." The measured inversion (−0.245R, see
`lib/validation/criteria-registry.ts`'s RETIRED entry) was **consistent
with that absence of lineage, not the cause of the removal** — a
non-Gann trend filter measuring against Gann-selected setups is the
expected result of never having belonged, not a porting defect to hunt
down. Generalize the reason, not the number: when a non-Gann criterion on
this scorecard measures against its declared sign, ask first whether it
was ever grounded in the methodology the setups are selected by, before
spending effort hunting a translation bug that may not exist. The
indicator itself (`adx()`) was not removed at the time — `lib/signals/regime.ts` and
`lib/signals/states/rangeReversion.ts` still used it (both replaced the next
day; see "ADX's last two consumers replaced" below) for the different
question the Signal & Regime Engine's own spec asks (is this market
trending or ranging, at all?), which is the "different governing spec"
carve-out the cross-platform consistency principle above names. Only the
scorecard's independent claim that this indicator agreeing with a
Gann-selected setup meant something came out.

**Investigated and kept, not removed: Sara Sniper's bar-sequence taxonomy
(`lib/strat/patterns.ts`, wrapped by `lib/signals/confluence/sara.ts`)
— an explicit, justified exception, by project-owner direction
(2026-09-16), never gating.** The open question was whether this
"candle-counting" presentation already restates a Gann technique this
codebase implements elsewhere, which would upgrade it from tolerated
foreign method to a second display of something Gann-grounded. It does
not. `lib/strat/patterns.ts` classifies each closed bar's high/low against
the prior bar into a shape (`1` inside, `2U`/`2D` directional, `3`
outside), then pattern-matches short, fixed 2–3-bar *sequences* of those
shapes (`2-1-2`, `3-1-2`, `2-2`, `1-2-2`, `3-2-2`, PMG) to arm a trigger and
stop — this is "The Strat" (Rob Smith), a publicly known, non-Gann
methodology; `docs/GANN_SARA_CONFLUENCE.md`'s own "Controlling
clarification" already treats Gann Protocol and Sara Sniper Strat as two
separate, independently-authorized frameworks, neither substituting for
the other. That is a different mechanism from every Gann-grounded
bar-counting rule this codebase does implement: `lib/gann/swingChart.ts`'s
3-day/9-day swing charts count a *run* of closes against the prevailing
trend and flip only once that run reaches a fixed length (3 or 9,
Ch. VII, per `docs/GANN_HISTORICAL_SOURCES.md`); `lib/gann/ruleOfThree.ts`
counts a *run* of same-direction closes (2 or 3, `Wall Street Stock
Selector`, 1930). Both are streak-length counters over a single scalar
(the close's direction). Sara/Strat counts nothing and keeps no running
total — it classifies each bar's shape and looks up a short fixed sequence
of those classifications, a categorically different operation. Checked
against `docs/GANN_HISTORICAL_SOURCES.md` directly: no inside/outside-bar
sequence taxonomy appears anywhere in the Gann primary or secondary
catalog. So this is not "the same rule in different clothes" — it is a
genuine variant with no citable Gann source, which under the numerology
carve-out in "WD Gann precedence" above would normally stay off-limits as a
scored or confluence-gating criterion. It already doesn't gate: `sara.ts` is
additive-only, feature-flagged, and (per the decision hierarchy in
`docs/GANN_SARA_CONFLUENCE.md`) can never set `SignalGates` or a state's
`tradeable`. Kept anyway, by direct project-owner instruction, in the same
tolerated-exception category `digitalRoot.ts` and the research-only
`squareOf20.ts`/`hexagonChart.ts` already occupy: counting candles is
intuitive to read directly off a chart, and other traders may find that
presentation simpler to follow too. Do not remove it on a future audit,
and do not treat it as unjustified foreign substance — the provenance
question has been asked and answered here. If a future session finds an
actual Gann-sourced inside/outside-bar sequence rule this analysis missed,
that would change the classification from "documented exception" to
"Gann-grounded alternative display" — but nothing found so far supports
that.

**Investigated and kept, by project-owner direction (2026-09-17): the
classic charting indicators — and the reason generalises.** The sweep flagged
`lib/indicators.ts`/`lib/analysis/indicators.ts` (`sma`, `ema`, `bollinger`,
`rsi`, `macd`), the live `/api/indicators` route, and the SMA 20 / SMA 50 /
EMA 9 / RSI 14 / MACD 12/26/9 overlays in `components/chart/candles.tsx` as
unexamined non-Gann substance on a user-facing surface. That framing was
wrong, and the correction matters more than the item: **the project owner
asked for these specifically.** They are a deliberate feature, not drift.

The distinction that makes this an exception rather than a hole in the
"Gann-grounded platform" principle: these indicators are **tools the user
drives, not substance the platform asserts.** GSPS's own verdict — what it
scans for, scores, gates, and places orders from — remains entirely Gann. A
chart overlay a trader switches on to examine their own idea makes no claim
on the platform's behalf. The platform is not saying RSI means anything; it is
declining to prevent a competent adult from looking at one.

The intent is explicitly to widen this, not contain it: the roadmap's Q2
"Expanded indicator library for self-directed strategy testing" adds Stochastic,
Keltner, Donchian, OBV, volume profile, configurable periods and saved presets,
so that experienced traders can test their own strategies instead of being
confined to this one. A platform that forces its single method on a
sophisticated user loses that user.

**The boundary that keeps both things true, and the only line that must not
move:** no indicator in this family may feed a scored criterion, a signal
gate, a trade plan, an entry, a stop, a target, or any verdict GSPS itself
issues. The moment one does, it stops being a user's tool and becomes the
platform's substance, and the Gann-grounding principle applies to it in full.
Check that boundary rather than the indicator list.

**Narrow, explicit, later exception:** see "Strategy Modes" below
(2026-09-23) for the one deliberate, project-owner-authorized carve-out from
this line — a separate, clearly-labeled, opt-in system that a human
selects one-at-a-time, never substituted for GSPS's own Gann-grounded
verdict. It does not loosen this boundary for the display-only indicator
family itself, which this section still governs in full.

**Do not remove these on a future Gann-grounding audit**, and do not read the
"display only is not an exemption" rule above as overriding this — that rule
says display is not exempt *by category*, which is exactly why this exception
had to be examined and written down rather than assumed. It was, and it is.

**ADX's last two consumers replaced by Gann's swing structure (2026-09-17).**
`lib/gann/trendStrength.ts` now answers "is this market trending, and which
way" for the regime engine and the range states. The **9-day** chart gives the
direction; the trend is confirmed only when the **3-day** chart's swings are
stepping that way — rising tops AND rising bottoms for a bullish read, falling
for a bearish one. `isGannRangeBound` is defined as the exact negation, so a
market can no longer be judged trending and ranging at once (the old
arrangement had two independently-tuned thresholds on one ADX scale with no
guarantee they partitioned it).

**Two wrong answers were built first, and both are worth knowing because each
looks right in the abstract:**

- **Requiring the 3-day and 9-day charts to agree.** This is what the scored
  `swingChartTrend` criterion does, so it looks like the consistent choice. It
  makes a trend unreachable during any pullback — the 3-day chart flips on
  three closes against the swing, which is what a pullback *is* — and
  `lib/signals/states/trendPullback.ts` exists precisely to evaluate a market
  in one. The two charts answer different questions: the scored criterion asks
  "confirmed at two granularities", the regime engine asks "what is the
  prevailing trend", and that is the 9-day chart's job alone.
- **Counting 9-day reversals as a churn proxy.** A tight oscillation rarely
  strings nine closes together, so it completes almost no swings and scores as
  *low* churn — reading a textbook range as a strong trend. Frequency measures
  how often the chart flips, not whether price is getting anywhere.

The existing regime and state tests caught both without being modified, which
is the argument for fixing the rule rather than the fixtures. Dedicated
coverage is in `lib/gann/__tests__/trendStrength.test.ts`, including a
pulling-back-but-still-trending case that fails under the first wrong answer.

Two constants there are **engineering choices, labelled as such** rather than
dressed up as sourced: which chart supplies the structure pivots, and the
strictness of the rising/falling comparison. Gann gives the chart
construction, not a lookback or tolerance for reading it.

**Entry pricing moved off STRAT onto Gann's own rule (2026-09-17, project-owner
direction) — the largest single Gann-grounding change to date, and the one a
prior audit most badly understated.** `patternArmed` had been described as "one
of nine scored criteria." Tracing it properly found the bar-sequence pattern
also supplied `tradePlanReady` (a hard Execute gate independent of the scored
point), `lib/strat/levels.ts`'s `const entry = pattern.triggerPrice` — **every
trade plan's entry price** — and through `riskPerShare`, **every position
size**. The autonomous portfolio manager was placing orders at STRAT-derived
prices. Stops and targets were already Gann/structural; it was specifically the
entry trigger that was foreign.

Replaced by `lib/gann/entryTrigger.ts`: crossing an old completed swing top or
bottom, plus the "lost motion" allowance — both disclosed in
`docs/GANN_HISTORICAL_SOURCES.md` A8 (the nine Buying Points and nine Selling
Points; the Resistance Level method's overshoot observation). The mechanism is
unchanged — a breakout past a level plus a buffer — but the level is now a
swing extreme rather than the prior bar's high, and the buffer has a citation
rather than being an arbitrary penny. `patternArmed` was **renamed** to
`entryTriggerArmed` rather than retired, so `TOTAL_POINTS` stays 9 and neither
cutoff moved: the substance behind a criterion changed, not how many conditions
the scorecard counts. This closed the last gate-1 failure.

**The accepted trade-off, decided explicitly rather than absorbed silently.**
Gann's trigger needs materially more history than STRAT's: a bar sequence arms
on 2–3 bars, a swing crossing needs *two completed swings* — roughly 10+ bars
containing real reversals, and flat closes advance the swing walk not at all.
So the candidate population shrinks in both the live scan and the replay, and
the Execute bucket was already starved (0/1061 on the last committed run).
The project owner chose to accept this rather than fall back to the
bar-sequence trigger where history is short (which would have reintroduced
exactly what was removed) or shorten the swing count (which has no source).
The reasoning: starvation is a **threshold** problem, and thresholds are
display decisions measurement may legitimately move — fewer sourced setups
beat more unsourced ones. **Do not "fix" a thin Execute bucket by reverting
this.** Re-derive the cutoffs from a fresh run instead; the backtest hold that
was waiting on `patternArmed` is now lifted.

Two traps this left behind, both already hit once:

- **Flat fixtures arm nothing.** `lib/__tests__/replay.test.ts`'s warm-up was
  45 identical bars, which was harmless under the old trigger and yields zero
  trades under this one. It now oscillates. Any new fixture needs real
  reversals.
- **`patternArmed`'s measurements do not transfer.** It is kept in
  `criteria-registry.ts` as RETIRED so the 31 committed runs in
  `docs/replay-runs/` still validate, but its numbers describe a different rule
  on a different reference level. Treat `entryTriggerArmed` as unmeasured.

The bar-sequence taxonomy itself is **not** removed — it keeps the display and
confluence role the project owner deliberately kept (next entry), and in the
replay it still names the candidate for attribution grouping. What it no longer
does is decide where an order goes.

**What that keep does not cover.** It settles the *display* use only. The
same `lib/strat/patterns.ts` taxonomy used to feed `patternArmed`, a **scored**
criterion — and scoring gates, where `sara.ts` cannot. The keep gave that
scored use no shelter; it was closed separately by the 2026-09-17
rename/reground to `entryTriggerArmed` recorded above, not by this entry. Do
not read "Sara's candle counting is kept" as a reason STRAT may ever feed a
scored criterion again.

**Worked example: eight-item orphan-module audit (2026-09-17, project owner
direction).** A platform-wide sweep for modules that exist but never reach
production. Two of the eight named items turned out, on re-verification, to
already be fully wired — the standing lesson (generalize, don't just record
the two instances): *always re-verify a "no consumer" claim against the
actual current `main`, not against a stale checkout or an earlier session's
notes* — `lib/rate-limit.ts#checkRateLimit` is called from `proxy.ts` (this
fictional Next version's renamed middleware entry point, `export const
config = { matcher: ... }`), and `lib/validation/health.ts#MIN_SIGNIFICANCE_T`/
`correlationSignificance` are called from `checkSign`, itself called by
`auditCriteria`, wired into `lib/backtest/run.ts` and
`app/api/learning/propose-weights/route.ts`. Full verdicts:

1. **`lib/risk/position-limits.ts#checkPositionLimits`** — REQUIRED AND
   ALIGNED, genuinely orphaned, now wired. Gann-grounded:
   `docs/GANN_HISTORICAL_SOURCES.md`'s risk/money-management row (A2, A4,
   A5, A6, A8; the 10%-of-capital ceiling independently in A3/A5) already
   lists `lib/risk/*` as the disclosed rule "differently structured: % of
   account/multi-ceiling, not Gann's dollar/point tiers" — the same
   literal-magnitude carve-out `lib/strat/levels.ts#combineNearbyLevels`
   documents. The function enforces exactly that structure (single-position/
   aggregate/open-risk/correlated-group ceilings from `lib/risk/config.ts`)
   but had never been called from the one place a real order gets placed
   (`lib/trade/place-order.ts#placeSimulatedOrder`) — a Novice paper account
   had no live enforcement of any of the four ceilings before this. Wired
   there, before pricing, skipped only for a protective (risk-reducing)
   order. Correlated-group membership uses same-symbol as a documented,
   conservative proxy — no sector/instrument-correlation table exists
   anywhere in this codebase to do better, and that gap is called out
   inline rather than silently assumed away.
2. **`lib/rate-limit.ts#checkRateLimit`** — already wired (`proxy.ts`). Not
   an orphan; no action taken.
3. **`lib/validation/health.ts#MIN_SIGNIFICANCE_T`/`correlationSignificance`**
   — already wired (see above). Not an orphan; no action taken.
4. **`lib/risk/cooldown.ts`** — REQUIRED AND ALIGNED, but not a "superseded
   duplicate" as originally suspected: re-verification found the live
   circuit-breaker call site (`lib/trade/place-order.ts`'s live-order path)
   checked `gate.decision.newEntriesAllowed` directly, which would have
   **blocked a protective stop-loss/take-profit/close order during an
   active cooldown or lock** — contradicting the disclosed spec rule this
   file's own comments already claimed was true ("the account-wide circuit
   breaker never blocks a close"). `cooldown.ts`'s
   `ALWAYS_PERMITTED_ACTIONS`/`gateAction` exist specifically to encode that
   rule and had no caller anywhere, so nothing enforced it at the one
   live-relevant site. Fixed by splitting `gateAction` into
   `gateResolvedAction` (takes an already-resolved `CircuitDecision`, so the
   live call site doesn't have to re-resolve circuit state a second,
   potentially inconsistent way) and wiring that into
   `placeLiveOrder`. `validateResetChecklist`/`requiresResetChecklist`
   remain unwired — the reset-checklist submission flow needs real UI/API
   work this pass did not build, and is flagged here explicitly rather than
   silently left; a future session should not treat `cooldown.ts` as
   "handled" until that lands too.
5. **`lib/signals/confluence/registry.ts#CONFLUENCE_MODULES`** — REQUIRED
   AND ALIGNED, wired: it is now read by
   `lib/signals/confluence/__tests__/registry-db-alignment.test.ts`, which
   is also the fix for item 8's `strategy_modules` drift claim — see there.
   Not a standalone item; the same fix closes both.
6. **`lib/backtest/replaySignals.ts#replaySignalEngine`** — REQUIRED AND
   ALIGNED (infrastructure: an existing, tested evidence-gathering tool for
   the Signal & Regime Engine, parallel to `lib/backtest/replay.ts`'s
   already-wired walk-forward over the Gann/STRAT score — the exact
   "built once and left stranded" shape the cross-platform-consistency
   principle above names). Wired into `GET /api/backtest` as
   `?engine=signal`, reusing `lib/backtest/run.ts`'s existing daily-bar
   fetch (`fetchSeries`, now exported) rather than a second data path.
7. **`lib/gann/squareOf20.ts`/`hexagonChart.ts`** — re-verified, exception
   upheld, no code change. `docs/GANN_METHODOLOGY_FULL_REPORT.md` (§3.6,
   the source-tier table) states plainly that "illustrations for every
   chapter remain lost" even after the fuller A2.1 extraction pass that
   fully specified these two constructions' *numeric* content — so the
   specific blocker (`ringAndAngleOf`'s ring/angle placement can't be
   checked against Gann's lost hand-drawn wheel) has not changed since the
   2026-09-16 exception was recorded, and nothing in either source document
   supports reconstructing it from text alone. Do not re-litigate this
   without new source material. **Update 2026-10-16:** new source material
   arrived. The hexagon plate is printed p. 422 of the owner's Master Course
   PDF, and its time counts now act through `hexagonTime.ts`; `hexagonChart.ts`
   stays as the research copy of the text. `squareOf20.ts` is unchanged.
8. **Migration 0048's `strategy_modules`/`gann_evaluations`/`sara_evaluations`**
   — split verdict. `strategy_modules`: REQUIRED AND ALIGNED, kept — has a
   real (if thin) purpose, module identity queryable independent of a
   deploy — but its "can never drift" claim was, until this audit, an
   unenforced comment (migration 0065 already had to hand-correct one real
   drift). `lib/signals/confluence/__tests__/registry-db-alignment.test.ts`
   now parses the seed literals straight out of 0048's insert and 0065's
   updates and fails CI if they disagree with `CONFLUENCE_MODULES`,
   `moduleType`, or `lib/signals/confluence/flags.ts`'s per-market
   enablement — the first real consumer either side of that claim has ever
   had. `gann_evaluations`/`sara_evaluations` (plus the six now-unused
   `trade_plans` reference columns 0048 added): NOT REQUIRED — dropped, in
   `0066_drop_unwired_confluence_evaluation_audit_trail.sql` (not applied to
   any live database by this session — see PR notes). Zero rows were ever
   written in the three-plus weeks since 0048 shipped; 0048's own comment
   already called the write path "unscheduled follow-up work," and
   migration 0065's header reconfirmed the gap was still open. The
   "versioned and reconstructible from stored inputs" requirement
   (`docs/GANN_SARA_CONFLUENCE.md`'s acceptance table) is already met
   in-process by `ConfluenceEvidence.explanationTrace`, attached to
   `ScanResult.signals` on every scan — persisting a second, never-written
   copy was never load-bearing for anything that requirement actually
   needed. If a real requirement for a persisted per-scan audit trail shows
   up later, re-derive the schema against that concrete requirement rather
   than reviving 0048's tables verbatim; speccing the schema before any
   consumer existed is what let it sit unwired in the first place.

**Platform-wide alignment audit (2026-09-25, project owner direction) — open
findings awaiting sign-off.** Audited `main@bcfbf36` against current code, the
live Supabase tables and the Vercel env list. The full report (file:line
evidence, IDs F1.1–F7.7) was delivered as a PDF in that session. Only
comment/doc fixes and deletion of the dead `adx()` were applied. Everything
below touches production behaviour, risk or order placement, and is **held
for the project owner** — do not fix it silently, and re-verify it first:

- **Backtest trigger ≠ live trigger (F3.1–F3.3).** `lib/scanTicker.ts` computes
  `computeGannEntryTrigger` from **daily** bars with a `weightedTrendAgreement`
  direction. `lib/backtest/replay.ts` computes it from **15-minute** bars, only
  on STRAT-detected candidates, and additionally filters it through
  `gapRuleViolated`/`riskFloorViolated`. Replay runs since 2026-09-17,
  including the 2026-09-23 run that confirmed the 6/3.5 cutoffs, measure a
  trigger production doesn't use. This is the `harmonicProximity` failure
  shape again.
  **Resolved 2026-09-25, project-owner sign-off.** The replay now arms from
  the daily trigger in `preferredEntryDirection`'s macro-derived direction,
  and applies no STRAT gap rule or risk floor to it. Both surfaces call the
  same code (`lib/scan/entrySelection.ts`), so they cannot drift again.
  `STRATEGY_VERSION` is bumped to `2026-09-25-live-trigger-replay`. **Open
  consequence:** every committed run in `docs/replay-runs/` since 2026-09-17,
  including the 2026-09-23 run behind the 6/3.5 confirmation, measured the
  old trigger. The cutoffs stay where they are until a fresh run on this
  version re-derives them. Treat `entryTriggerArmed` and the Execute-bucket
  numbers as unmeasured until then.
  **Follow-up 2026-09-26:** the replay's two documented coverage gaps are
  closed. It now also arms continuation setups, gated exactly as
  `runMarketScan`'s continuation pass gates them. The shared helpers
  `macroBreadthAgrees` and `isContinuationShape` in
  `lib/scan/entrySelection.ts` are used by both. A session now arms on the
  live scan's own 30-bar daily minimum (`MIN_DAILY_BARS_FOR_SCAN`) instead of
  120. `STRATEGY_VERSION` is `2026-09-26-continuation-replay`, and no runs
  were committed on the interim `2026-09-25` version.
- **Live orders skip `checkPositionLimits` (F3.5).** **Resolved 2026-09-25,
  project-owner sign-off.** `placeLiveOrder` now enforces the same four
  ceilings as the paper path, after the circuit breaker and before any
  pricing or broker call. Exposure comes from the broker's own positions and
  planned open risk from the account's `working` live `protocol_exits` rows.
  It fails closed if either can't be read and is skipped for protective
  orders, the same as paper.
- **Autonomous live trading looks authorised (F4.4, F7.6).** An active
  `compliance_signoffs` row for `autonomous_live_trading` has existed since
  2026-09-03, and its `review_reference` says no formal review was performed.
  Production also sets `AUTONOMOUS_LIVE_TRADING_HALTED` (2026-09-23).
  Commit 95da144's "sign-off held back" was already untrue when written.
  This is latent while no live broker connection exists.
  **Resolved 2026-09-25, project-owner sign-off:** the row
  (`96573294-…`) was revoked in production, not deleted. `revoked_reason`
  cites this finding. `isFeatureAuthorized("autonomous_live_trading")` is
  now false. Re-record it with `scripts/record-autonomous-live-signoff.mjs`
  only once a real compliance/legal review exists.
  **Proving period, 2026-10-16 (owner: "remove the live broker connection,
  environment kill switch (enable), remove human compliance sign-off (it will
  go back on AFTER we have proven that the portfolio manager actually
  works)").** `AUTONOMOUS_PROVING_PERIOD` in
  `lib/automation/autonomous-live-gate.ts` runs every manager profile on paper,
  so neither the broker, the kill switch nor the sign-off is consulted, and no
  order it places can reach a real account. Setting it to `false` restores the
  live gates. The same day's diagnosis: no `trade_plans` row had ever armed
  (all 165 expired), because equity plan windows ran out overnight on the wall
  clock and confirmation advanced only one scan price per pass. Fixed by
  counting session bars (`sessionBarsDeadline`, interim until #309 drops the
  clock) and arming from real closed bars in the manager's own run
  (`lib/lifecycle/armFromBars.ts`), which also skips any plan whose stop broke.
  **Health check, 2026-10-21:** plans now arm (51 arms in two days), but no
  paper order had been placed since 2026-10-09. Activation tried the order
  once; an old-level or reaction entry is armed while it still waits for price,
  so it was refused (`awaiting_confirmation`) and never tried again. Each
  scheduled pass now retries active activations whose plan is still armed and
  that have no `broker_order_submitted` event (`placeRestingEntries`), and the
  same run manages every working paper exit (`manageAllSimulatedExits`), which
  before moved only when the owner opened the portfolio or orders page.
- **Entry confirmation isn't uniform (F3.4).** Guided execute, the demo
  auto-trader and the manual ticket place orders without it. Only plan-scoped
  automation requires an `armed` plan.
  **Decided 2026-09-26 (project owner delegated the call).** The divergence
  stays, and it is now principled and written down instead of accidental.
  Unattended execution (plan-scoped automation, the autonomous portfolio
  manager) requires the full confirmation sequence. Orders a person places
  (the manual ticket, Guided Mode's one-tap execute) rest as stop-entries at
  the trigger. That trigger is Gann's own Buying/Selling Point with the
  lost-motion allowance (A8), and the person approved that specific trade. The
  retest-and-hold stages come from the GSPS spec pack, not from Gann. Under
  "WD Gann precedence" they aren't imposed on a human's own order. The demo
  auto-trader follows Guided Mode on purpose (it exists to show Guided Mode)
  and is bound to switch rules if it ever trades a member's account. The
  measurement side is fixed: `lib/backtest/replay.ts` gained
  `entryRule: "stop" | "confirmed"`, both driven by
  `advanceEntryConfirmation`, so each path's actual entry rule can be
  measured. Until then nothing measured the rule automation trades on.
  `lib/lifecycle/entryConfirmation.ts`'s header had claimed every caller ran
  through confirmation. It was corrected.
  **Reversed by evidence the same day (2026-09-26).** The first run on the
  production-faithful replay (`docs/replay-runs/2026-09-26-766sym-NOTES.md`,
  766 symbols, production stop, fixed plan bracket, refused fills dropped)
  measured the stop entry at **−0.155R** [−0.254, −0.053] on all trades and
  −0.440R on Execute. The confirmed entry measured **+0.190R** [+0.068,
  +0.311], positive in both halves. The CIs don't overlap. Under the
  pre-registered Phase 4 rule
  (`BACKTEST_PRODUCTION_VS_BASELINE_HANDOFF.md`), confirmation should hold on
  every surface where a plan can be entered, the human paths included. The
  principled argument above ("a human approved it") doesn't survive
  measurement: the human approves the trade, not the fill rule, and the fill
  rule is what loses money. **Current recommendation:** align the manual
  ticket's advised entry, Guided execute and the demo auto-trader on
  confirmation. Guided and the demo would place their order only once the
  plan is `armed` (or the equivalent confirmation has been observed), instead
  of resting a stop at the trigger. This is a production and UX change, held
  for the owner's go-ahead. The code comments that describe the interim
  decision (`lib/lifecycle/entryConfirmation.ts`,
  `app/api/guided/execute/route.ts`, `lib/demo/auto-trade.ts`) point here.
  **Resolved 2026-09-27, project owner (decision 4, and "automation should
  adhere to the same rules as everything else on the platform").** One rule,
  one place: `lib/trade/place-order.ts` places any entry carrying the
  protocol's levels only once it has confirmed on closed execution-timeframe
  bars (`lib/lifecycle/confirmNow.ts`, the same state machine the plans and
  the replay use). That covers the manual ticket's advised entry, Guided Mode,
  the demo account and plan-scoped automation (the autonomous portfolio
  manager runs through it). A plan-sourced order is judged on its plan's own
  trigger over the bars since the plan was generated; an unconfirmed entry is
  refused with `awaiting_confirmation` and nothing is placed. The 2026-09-27
  swing-chart run agrees: confirmed +0.190R vs stop −0.052R overall. Not
  covered, deliberately: the ticket's "now" market entry (no trigger to
  confirm) and protective orders.
  **Superseded 2026-10-15 (PLAN.md item 4, owner: "GSPS should be a 1 for 1
  implementation of Gann's methodology"):** the confirmation is now Gann's
  crossing rule. A close 3 points past the old level arms the plan; the order
  rests as a limit at the level plus 1 point and fills on the reaction, with
  the stop 3 points the other side (W006 pp.20, 46-47). The retest-and-hold
  sequence survives only as the replay's `entryRule: "confirmed"`.
  `STRATEGY_VERSION` is `2026-10-15-gann-reaction-entry`.
- **Non-Gann inputs in the Signal & Regime Engine (F2.5).** SMA 20/50 and
  anchored VWAP (`lib/signals/regime.ts`, `lib/signals/states/trendPullback.ts`)
  feed user-facing tier/"Tradeable" labels and trade-plan expiry. The
  mandatory sweep regex above can't see them: it doesn't match SMA, EMA or
  VWAP.
  **Resolved 2026-09-26 (project owner delegated the call), and wider than
  reported.** The extended sweep found the same SMAs in the **core Gann
  verdict**, not only the regime labels. `lib/analysis/trend.ts#readTrend`,
  which reads the monthly/weekly/daily trends behind every setup's direction
  and the score's macro criteria, used SMA 20/50. Everything was replaced
  with Gann's own tools:
  - `readTrend`'s direction is `readGannTrend`: the 9-day swing chart
    confirmed by stepping 3-day swings, "sideways" when unconfirmed. Pivots
    still supply the S/R lists.
  - `lib/marketScan.ts`'s coarse gates measured "extension", "trend intact"
    and "travel" from 20/50-bar closing means. They now measure from the 50%
    point of the range, Gann's first-ranked retracement level
    (`lib/gann/retracement.ts#rangeMidpoint`).
  - `lib/signals/regime.ts` and `rangeReversion.ts` dropped MA alignment,
    slope and flatness. Trend is Gann-confirmed direction plus HH/HL
    structure, and range is its negation plus repeatable boundaries.
  - `trendPullback.ts`'s approved pullback locations were the 20/50 SMAs and
    an anchored VWAP. They are now Gann's top-ranked retracement levels of
    the latest swing (1/2, full, 1/4, 3/4) plus the existing S/R zones.
  - `confirmedReversal.ts` measures overextension from the range's 50% point
    instead of a 20-bar SMA.
  - `smaSeries`, `slope` and `anchoredVwap` (`lib/signals/indicators.ts`)
    and `lib/analysis/pivots.ts#sma` were deleted once they had no consumer.
  **This moves the verdict.** Macro trend reads are now stricter: a market
  with short legs that SMAs called trending often reads "sideways" until
  Gann's 9-day chart turns. The 6/3.5 cutoffs have to be re-derived on this
  code, not on the code before it.
- **VWAP in the intraday alerts (new, 2026-09-26, resolved 2026-09-28).**
  `lib/scanner/intraday.ts` uses session VWAP for its direction, its
  invalidation level and its first target. Those alerts carry a "Trade this"
  action into the order ticket, so VWAP there is platform substance, not a
  chart tool. It's a separate system with its own spec, so it wasn't rewritten
  in the F2.5 pass. It needs a Gann replacement (the session's 50% point is
  the natural counterpart) or an explicit exception recorded here.
  **Resolved 2026-09-28 (project owner: "not Gann methodology, so implement
  Gann's methods").** Direction, invalidation and first target now read the
  session's 50% point (`SessionMetrics.midpoint`); VWAP is gone from the
  alerts.
- **STRAT gated publication (new, 2026-09-26, resolved 2026-09-28).**
  `lib/marketScan.ts#hasTradePlan` requires `r.pattern !== null` before any
  setup reaches the daily lists, and `isMomentumContinuation` requires a
  continuation-shaped pattern. Since 2026-09-17 the bar-sequence taxonomy is
  meant to be display and confluence only. Here it still decides which
  Gann-armed setups are published. That contradicts "What it no longer does
  is decide where an order goes" in spirit, since publication decides what
  Guided Mode and the demo trade. It's a production behaviour change, so it's
  held for the project owner. The replay does not apply this filter.
  **Resolved 2026-09-28 (project owner, same instruction).** `hasTradePlan` no
  longer reads the pattern; a plan's levels come only from Gann's trigger. The
  continuation pass (live and replay) gates on Gann's with-the-daily-trend
  crossing (`lib/scan/entrySelection.ts#isGannContinuation`) instead of a
  STRAT continuation shape, and its top-up skip reads the daily trend too.
- **Being in `FALLBACK_UNIVERSE` doesn't mean being scanned (F1.7).** It
  comes last behind the tracked symbols, the rotation chunk (drawn from
  `LARGE_CAP_UNIVERSE` only) and the most-actives, inside a 250-slot cap.
  Check coverage in coarse telemetry, not list membership.
  **No market-cap ceiling (owner, 2026-10-16):** "a min on the megacap, but
  never a limit." `LARGE_CAP_UNIVERSE` had stopped at $200B, so every larger
  name failed `novice_eligible`'s market-cap check and Guided Mode could never
  show it. The $200B-and-up names now lead the list (hand-compiled, awaiting
  the Alpaca validation pass). The $10B floor is the only cap rule.
- Lesser items: F4.3 and F4.7 are closed (re-checked 2026-10-28). A
  `policy_values` row may only tighten a risk limit (`RISK_POLICY_DIRECTIONS`,
  owner Q13, 2026-10-16), and production held no `policy_values` row when read.
  `stopRoom` was retired on 2026-10-16 (owner Q23), replaced by Gann's stop
  3 points behind an old level (`stopBehindOldLevel`, W006 pp.20-24, 46-47),
  which is itself a check under the nine pillars. Kept rather than
  deleted because they're unfinished rather than dead:
  `withinTriggerTolerance` (an unenforced spec rule) and `toSaraStrategyResult`.
  **F4.2 closed 2026-10-22:** a promoted `learning_models` weight row is
  adopted only when it is uniform (`isUniformWeightSet`,
  `lib/scoring/active-weights.ts`), since nothing in Gann's sources ranks one
  pillar above another ("The scorecard's role"). No live row exists, so
  scores are unchanged and `STRATEGY_VERSION` stays.
  `quantityFromPermittedRisk`/`plannedRiskDollars` and the rest of the risk-band
  policy were removed 2026-10-21 (R-004): Gann's capital rules size every order.
- **F3.7, traced 2026-09-30 and resolved the same day (project owner).** The
  owner saw OXY and GOOGL read invalidated on the Dashboard while the chart
  still showed the plan. Three surfaces called a plan dead from a quote (the
  lists, the order ticket, the twice-hourly monitor sweep); the scan behind the
  symbol page read only completed daily structure, returned the same plan, and
  `evaluateMonitorsAndNotify` re-armed the monitor the sweep had just
  invalidated. The owner's rule: **"A breach retires the plan, until an updated
  scan is run and a plan is either confirmed or an updated plan replaces the
  original."** Follow-up the same day: **"if Gann has his own version of
  confirmed or replaced, implement his rule ... the sentiment/premise needs to
  align."** He has, and it is built: **confirmed is a failed break** (a closed
  bar closes back through the broken level by his 3-point allowance, price-scaled
  by `lib/gann/pointScale.ts`: NSTD p. 20, Master Course pp. 246-248 and rules 4-5),
  and **replaced is a new trade with a new stop from the new swing structure,
  never the old levels resumed** (Overnight Chart rule 4, NSTD Rule 6, *Tunnel*).
  Built as `lib/gann/stopBreach.ts` and `applyStopBreachHold`
  (`lib/scoring/score.ts`): the scan drops a broken plan to Reject (price through
  the stop, or broken earlier in the session with no bar since closing back
  through the line), so the monitor goes INVALIDATED and the plan leaves the
  lists. There is no stored "retired" flag: the scan reads the session's closed
  bars against the stop each time, so a late scan resumes correctly. Price
  returning to the old entry, or to between the stop and the line, does not
  reinstate it: the ticket latches a breach until a newer scan arrives, and the
  lists keep their ratchet until they reload. The replay does not enter a plan
  whose stop an earlier candle of the session traded through, reinstates it on
  the same closing test, and reports `retiredPlans`; otherwise the next
  session's read of the swing chart replaces it.
  `STRATEGY_VERSION` is `2026-09-30-stop-breach-retired`:
  replay runs before it entered such plans, so the Execute-bucket numbers
  measured on earlier versions describe a rule production no longer follows.
  Gann's sources and the options considered (option A for the break, his own
  failed-break test for the way back in) are in
  `docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md` Part 1. **The `trade_plans`
  lifecycle (built 2026-10-01, owner go-ahead; dormant).** A pre-entry plan
  whose own stop the scan reports broken now goes INVALIDATED through a `retire`
  event (`lib/lifecycle/retire.ts`, dispatched from the scan fan-out). The spec
  pack says a change to the lifecycle needs counsel review, and building it is
  not the review, so it is gated on a `compliance_signoffs` row for
  `preentry_plan_retirement` (`scripts/record-preentry-retirement-signoff.mjs`).
  **With no row it does nothing**, and a retired plan behaves as before (never
  advanced, expires on its clock, refused at the bracket,
  `fill_outran_bracket`). Recording the sign-off is a human act, not the build's.
  Terminal by design: a failed break or new structure earns a new plan. The
  reclaim line is also a replay option now (`reclaimPoints` 3 or 5), with the run
  and its reading rule pre-registered in
  `docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md` Part 5; live stays at 3. The
  intraday alerts are an exception by
  construction: they are recomputed from the session on every scan, and their
  invalidation is the session's 50% point or a point beyond the crossed prior
  session's high or low, so a break of it already changes the alert.


## Gann-derived AND measured — standing principle

Every scored criterion must clear two independent gates. Neither substitutes
for the other. Project owner direction, 2026-09-16.

1. **Gann-derived** — traces to a citable source in
   `docs/GANN_HISTORICAL_SOURCES.md`, with the tier recorded.
2. **Measured** — has outcome evidence in
   `lib/validation/criteria-registry.ts`.

**What measurement is FOR.** It verifies that *our translation* of a Gann
rule into code is faithful. A criterion measuring negative or inverted is
presumed a porting defect on our side — wrong anchor, wrong scale, wrong
timeframe — **not** evidence against Gann. `harmonicProximity`'s stale
Square-of-9 anchor is the worked example: the criterion was not wrong, the
anchor was, and measurement is what exposed it. Attribution is a debugging
instrument pointed at our own code. It is never a jury on the methodology.

**Check gate 1 before hunting a translation bug.** That porting-defect
presumption applies to a criterion that *is* Gann-derived. For one that
never was, an inversion is the expected result rather than a bug to chase:
a non-Gann filter measuring against Gann-selected setups is what "it never
belonged" looks like in the data. The `adxTrendStrength` discard (audit
outcome above) is the worked example, and the general rule it yields is
worth stating on its own — **when a criterion measures against its declared
sign, ask whether it was ever grounded in the methodology the setups are
selected by, before spending effort on a translation bug that may not
exist.** Gate 1 first, then gate 2.

**What measurement is NOT.** It does not confer legitimacy on a threshold.
Legitimacy lives in the criteria being counted, which are Gann's. A cutoff
on a count of Gann conditions is a ranking and display decision, not a claim
about the market.

**Gate 1 status** (2026-09-16; updated 2026-09-25 after re-verifying against
`lib/scoring/weights.ts#CRITERION_KEYS`):

- `adxTrendStrength` (Wilder) — **resolved: discarded, and landed.** Removed
  from `CRITERION_KEYS` in PR #236; `TOTAL_POINTS` is back to 9 and the
  cutoffs rescaled with it. See "Audit outcomes" above.
- `patternArmed` (STRAT) — **resolved 2026-09-17: renamed to
  `entryTriggerArmed` and regrounded** on Gann's swing-crossing rule
  (`lib/gann/entryTrigger.ts`). See "Entry pricing moved off STRAT" under
  "Audit outcomes". No gate-1 failure remains among the nine. The same
  taxonomy's non-gating display use is deliberately kept (audit outcome
  above).

Resolving a gate-1 item changes `CRITERION_KEYS.length` — which moves
`TOTAL_POINTS` and both thresholds — so it is deliberately not a drive-by
edit. PR #236 is the worked precedent for doing it properly: criterion out,
registry entry retired, thresholds rescaled to hold the same relative bar,
and the reasoning recorded here.

## The scorecard's role — recorded so it is not re-litigated

The scorecard supplies **no substance of its own**. It counts and ranks how
many of *Gann's* confirming conditions a setup satisfies, so the best
opportunities are identifiable — especially for a novice who cannot yet
weigh ten conditions by feel. It is a legibility layer over Gann's criteria,
not a competing method.

It earns its keep a second way: the factor table
(`lib/backtest/attribution.ts`) is the instrument that makes a mistranslated
criterion visible at all. Without it a wrong anchor stays invisible
indefinitely, which is exactly what happened to `harmonicProximity`.

Two consequences follow, and together they are why
`DEFAULT_CRITERION_WEIGHTS` is uniform as of 2026-09-16:

- **Weighting is substance.** A non-equal weight asserts that one of Gann's
  conditions outranks another. Nothing in the source catalog ranks the
  confirming conditions against each other — every "most important" in
  `docs/GANN_HISTORICAL_SOURCES.md` sits *within* a technique (50% among
  retracement levels, the Master Time Period among cycles, 1/2 = 26
  weeks among the 52-week fractions), never across them. (The Master Time
  Period's length depends on the lesson: 20 years in 1931, 60 in 1935, 56¾
  in 1953, 90 in 1955. Cite the lesson and year. See
  `docs/memory-bank/GANN_CYCLES_HERMETIC_MASTER_REPORT.md` Part I §1.6.) A weighted sum is
  therefore the scorecard injecting a ranking claim Gann never made. If a
  citable cross-criterion ranking is ever found, that changes this.
- **Thresholds are not substance.** A cutoff is where the ranked list gets
  split for display. It can be set or moved from measurement without
  claiming anything about the market.

## Hermetic principles & cycle theory — standing background lens

Per the project owner's explicit, standing direction (2026-09-16): the
seven Hermetic principles (Mentalism, Correspondence, Vibration, Polarity,
Rhythm, Cause and Effect, Gender) and the general cycle-theory material in
`docs/GANN_HISTORICAL_SOURCES.md` Part C (Dewey's Foundation for the Study
of Cycles, Tomes' harmonic-resonance cycle theory) are a standing design
lens for this codebase going forward — considered by default in every
session's Gann-adjacent work, not opted into case by case.

**Elevated 2026-09-17 from passive lens to active design input, by project-
owner direction.** These are not background reading to be noted and set
aside. Every Gann-adjacent piece of work — a new criterion, a rebuilt module,
an entry rule, a chart overlay — is to be *designed through* them, and the
design is to say so. Concretely, before building, answer all three in writing
(a module header is the right place, and `lib/gann/entryTrigger.ts` is the
worked example):

1. **Which Gann source discloses this, and at which tier** (`docs/GANN_HISTORICAL_SOURCES.md`).
2. **What the cycle-theory literature says about it** — Part C, Dewey's
   Foundation for the Study of Cycles and Tomes' harmonic-resonance work. Where
   the component makes any claim about periodicity or recurrence, run **Dewey's
   seven-item checklist** explicitly: dominance, regularity of timing,
   repetition count, constancy of period, phase-resumption after distortion,
   wave-shape identity, cross-series clustering. `lib/gann/spectralCycle.ts`
   evaluates three of the seven and says which — that is the standard: state
   which you cleared and which you did not. (Source note, 2026-09-27: these
   seven are a working subset. Dewey's own list in *The Case for Cycles*
   (1967) has 18 criteria. When a cycle claim is actually being *validated*
   rather than designed, also answer three that the seven omit: persistence
   through changed conditions, persistence after discovery (out-of-sample),
   and a mathematical significance test. See
   `docs/memory-bank/sources/C06_dewey_case_for_cycles.md`.)
3. **Which Hermetic principle it expresses** — Mentalism, Correspondence,
   Vibration, Polarity, Rhythm, Cause and Effect, Gender. Correspondence ("as
   above, so below") is why a technique proven on one timeframe or asset class
   is expected to hold on another, and is the reasoning behind the
   cross-platform consistency principle at the top of this file. Rhythm and
   Vibration are why cycle and swing work is load-bearing rather than
   decorative. Polarity is why every rule here has a symmetric short form —
   see `computeGannEntryTrigger`'s mirror.

**What this elevation does NOT change: the citation discipline.** Framing a
design through these principles is required; using them as *evidence* is still
not allowed. They shape what gets built and how it is reasoned about. They
cannot, on their own, move a threshold, a weight, or an architectural
decision — only a citable Gann source or a measured result can do that. A
belief with no citable source, or one that has not cleared Dewey's checklist,
stays where `lib/gann/digitalRoot.ts` sits: real, running, labelled a
hypothesis, confluence-only, never independently gating. Infusing the
literature means reasoning with it, not promoting it to proof. The load-bearing distinction, carried over
unchanged from the "WD Gann precedence" section above: a technique
citably tied to Gann's own methodology (or to the cycle-theory literature's
own rigorous validation standard) gets built and takes precedence over
GSPS's prior, more conservative treatment. A belief about numbers, cycles,
or vibration with no citable source, or that hasn't cleared **Dewey's own
cycle-validation checklist** — dominance, regularity of timing, repetition
count, constancy of period, phase-resumption after distortion, wave-shape
identity, cross-series clustering — stays exactly where `lib/gann/
digitalRoot.ts` already sits today: real, running, clearly labeled as a
hypothesis, confluence-only, never able to independently gate a live
verdict. Building this out is real work for future sessions
(`docs/GANN_METHODOLOGY_FULL_REPORT.md` §18.4 sequences it explicitly:
cheapest/most literal Gann rules first, the astrology/numerology module
family last, after the rest of the system is re-tested) — this section
establishes the mindset and the citation discipline, not a mandate to
build the whole layer in one session.

**Two things this section does NOT do, stated precisely so neither drifts
into becoming assumed history:**

- It does not establish, and no document in this repo establishes, that
  any existing GSPS constant (`TOTAL_POINTS`'s historical value of 9
  scored criteria included) was chosen for Hermetic, vibrational, or
  numerological reasons. That was a live question raised in this session;
  the honest answer, checked against `lib/scoring/weights.ts`'s own doc
  comments and every commit history available, is that it wasn't — the
  criteria count changed repeatedly over time as checks were added,
  retired, and replaced, tracking `CRITERION_KEYS.length` mechanically,
  not a numerological target. Going forward, a Hermetic/cycle-theory
  framing may legitimately *shape new design decisions* (per this
  section); it does not retroactively become the reason past ones were
  made.
- It does not resolve, in either direction, the specific tension between
  `GANN_HISTORICAL_SOURCES.md` B2 (digital-root reduction — "casting out
  nines" — is arithmetic mod 9, true of any multiple of 9 by construction,
  not a market discovery) and Part C's Tomes material (cycle *lengths*
  settling into small integer ratios, a physical-resonance claim). These
  are different claims about different things; Part C provides real,
  separately-testable evidence for the second claim, and doesn't overturn
  the first one's narrower arithmetic point. Cite each for what it actually
  says, not for a combined claim neither source makes on its own.

## Astrology — standing decision (2026-09-16, project owner direction)

> **Superseded in part on 2026-10-01** by the owner's decisions recorded in
> "Every Gann method acts" below: astrology from Gann and from Jensen now
> acts, and the "never gate" and "confluence first" rules here no longer
> bind it. The rest of this section (sourcing, the Dewey discipline) stands.

Real historical evidence says Gann himself used astrology (`docs/
GANN_HISTORICAL_SOURCES.md` A2.3's signed 1954 client letter — worked
planetary-degree conversions, dated aspect-based forecasts). GSPS's policy
is nonetheless settled, not open:

**Astrology must never gate a live verdict.** It is not a scored criterion,
not a pass/fail check, and never independently decides Execute/Watch/Avoid.

**It may exist only as a labeled, non-gating confluence signal** — the same
`confluence/context only` treatment `lib/gann/digitalRoot.ts` and
`lib/gann/decadeCycle.ts` already carry — and only if a legitimate, citable
technique can be encoded without inventing numerology GSPS has no authorized
specification for. The existing "no new numerology without an authorized
spec" rule (`docs/GANN_SARA_CONFLUENCE.md`) applies in full to any astrology
candidate: a real planetary-longitude/aspect calculation traceable to a
cited source is admissible as a confluence field; an invented price-to-degree
conversion constant is not, however Gann-flavored it sounds.

**Until such a technique and its citable specification exist, disregard
astrology entirely** — no code, no confluence field, nothing built. This is
the resolution of `docs/GANN_METHOD_COMPLETENESS_AUDIT.md`'s open item on
whether astrology has any place in GSPS at all; check that document's
"Astrology" addendum section if this ever needs revisiting.

**Priority clarified (2026-09-27, project owner direction): astrology is not
low priority where W.D. Gann himself says it is part of his methodology,
our source files (Gann's own and otherwise) corroborate it, and it can be
implemented in GSPS.** It is not placed first either. It ranks alongside
Gann's other techniques, by the strength of its sourcing and how feasible
it is to implement. It is no longer deferred to last: this supersedes the
"astrology last" sequencing in `docs/GANN_METHODOLOGY_FULL_REPORT.md` §18.4
and in the memory-bank report.
- "Gann himself says it" means a technique in his own text, letters or
  charts. Examples:
  - the 1954 soybean letter's heliocentric and geocentric averages of the six
    major planets, and the five-planet average with Mars left out
  - its "active angles" (a planet's longitude, and its squares, trines and
    oppositions, read as price and time)
  - its price-to-longitude placement on the Circle Chart
  - Jupiter–Saturn aspects
  - the Saturn return
  - the 1931 lesson's "30-year cycle caused by Saturn"
  - the 1948 soybean chart's and "Path of Planets" chart's plotted longitudes
  See `docs/memory-bank/` (A2.3, B03, B05). Interpretive decodings (Mikula's
  "natural"/"wise" key words) are leads, not sources.
- "Proven" means Dewey's full standard (`docs/memory-bank/sources/C06_dewey_case_for_cycles.md`):
  - a hit rate against a base rate
  - a significance test with a multiple-comparisons correction
  - out-of-sample persistence on data the rule never saw
  - the rule fixed **before** testing, with no searching across planets,
    orbs or price scales
- **Unchanged until the owner decides otherwise on measured evidence:** a
  proven technique enters as a labelled confluence field first and does not
  gate a verdict. Promotion beyond confluence is a separate, recorded owner
  decision.

**Owner decision, 2026-09-30: the planetary averages act, including the COE
and MOF.** In the owner's words: "There should be absolutely zero gaps between
Gann and GSPS. The CE average as well as the MOF formula should be
implemented ... The algorithmic/equations/methodology need to be
embedded/infused throughout the platform", then "Execute". This is the
recorded decision the bullet above asks for, and it covers the planetary
averages only (AS1). Built in `lib/gann/planetaryAverages.ts`:
- Gann's letter of March 20, 1954 (Tier A) gives the six major planets and the
  five with Mars left out, heliocentric and geocentric, as "the most powerful
  points for time and price resistance", and names the **COE** average (not
  "CE"; owner confirmed 2026-10-16) and the MOF formula. Their definitions, the circle of eight and the
  mean of five, are Tier B (Walker 2004; Ganntrader) and match the letter.
- They act where Gann says they act, as price resistance: each Tier A
  average's nearest points join the S/R list on the live scan and the replay
  (`lib/gann/masterLevels.ts`), so they reach the historical S/R criterion and
  plan stops and targets. They are also measured context factors.
- The Dewey discipline still holds: the rule was fixed before any test (one
  ephemeris, noon UTC, one price unit, the 360/N family, no scale or orb
  search), and the next full replay measures it. If it inverts, presume a
  translation defect first, per "Gann-derived AND measured".
- Not covered by this decision, so still research-only: active angles,
  aspects and returns (AS2–AS4), and any price-to-degree scale other than the
  Gann point. Name them to the owner before building them to act.
- No School lesson teaches them (owner: "we do NOT need to quote, or teach
  them").

## Every Gann method acts; Jensen's astrology is included — owner decisions, 2026-10-01

Recorded in the owner's words, from the side chat, with the instruction
"execute all five".

1. **Jensen is included, whatever his link to Gann.** "forget establishing a
   connection. being that his information is accurate. it needs to be
   included into what we're building astrologically. This is the 'missing
   piece' as far as forecasting goes with our scanner functionality." (L. J.
   Jensen, *Astro-Cycles and Speculative Markets*, source note B16.)
2. **The backend pinpoints astrological price and time points.** "if
   astrology, and gann's own method say that price will reach a certain
   point, based on astrology, our system (on the backend) should pinpoint
   those points as well." The goal is the most accurate forecasting scanner,
   across all 766 symbols and every timeframe from intraday to the decade.
3. **Every Gann method acts.** "we have enough facts for every Gann method to
   be implemented/act. no more watching, or background, or serving as
   confluence." For Gann's own methods and for Jensen's astrology, this
   supersedes:
   - the Astrology section's "never gate" and "labelled confluence first"
     rules
   - the "measured context" placements recorded for individual modules (for
     example the seasonal sixteenths, the time square, the day circle, the
     circle readings, the Square of 144 time readings and the F1 extreme
     rules)
   - the "confluence-only" treatment in the Hermetic section, for techniques
     that are citably Gann's own

   It doesn't cover non-Gann material: Strategy Modes, the chart indicators
   and the Sara/STRAT display stay as recorded. Each Gann method acts where
   Gann says it acts (a level as a level, a time count as a time window, an
   entry or exit rule as one). For Jensen's astrology the owner names the
   placement item by item (asked on 2026-10-01, before the build).

**Limits recorded with the decision.** These were raised in the side chat.
They bound how the decision is built, not whether.
- Only Jensen's planetary positions are verified (B16 §6). His market claims
  are unmeasured.
- Not every Gann method can be built, because nothing about it was disclosed
  or survives:
  - the Master Time Factor
  - the Master Three-Dimension Chart
  - the mass-pressure curve
  - the lost plates
  - the missing calculator chapters (Square of 90, Square of 52, Square of 67)
  - name numerology
- Gann gives no ranking between his techniques. How they combine when all of
  them act is GSPS's design choice, labelled as such (see "The scorecard's
  role").
- Daily time points can swamp a verdict unless each one acts where Gann says
  it acts. A time count marks a window for a turn; on its own it doesn't
  make a setup.
- The six-year one-hour run lost in every cell (2026-09-28). Every method
  that acts is measured in the replay, and an inversion is presumed a
  translation defect first.
- A future date shown to a user needs its source, method and measured record
  linked ("Forward-looking claims", 2026-09-28).
- No performance claims.
- The Dewey discipline holds: each rule is fixed before it is tested, with no
  search over orbs, scales or planets.

**Built 2026-10-16 under this decision (gaps G26–G28).** Gann's full angle set
(16x1 to 1x16) on the Gann point, from the major pivots, with the 45°, 2x1 and
4x1 copied to the preceding opposite pivot (GA-12 to GA-16), joins the S/R list (`lib/gann/patternAngles.ts`, via
`masterLevels.ts`, live and replay). `STRATEGY_VERSION` is
`2026-10-16-gann-pattern-angles`. **Batch V3, same day:** early leaders first and weak stocks held as buys (A-SELECTION-02/-04), the third time through a round number (A-LEVELS-08), the secondary rally top in the S/R pool (A-LEVELS-02) and Ch. 6's division tiers (M-P1); `STRATEGY_VERSION` is `2026-10-16-gann-selection-levels`. The Hexagon Chart's time counts, read from
Gann's own plate (`hexagonTime.ts`), and the Master Chart of 360°'s 48ths and
sevenths (`masterChartTime.ts`) are trace and measured factors until the
shared time-window mechanism exists. The plate is not lost (Master Course
p. 422), and it puts 66 on 60°, not 180°. The replay measurement is still
owed.

## Strategy Modes — scoped exception to the non-Gann boundary (2026-09-23, project owner direction)

> **Explain-only reversed 2026-10-22 (owner, Chuck): techniques that align
> first, the rest with their own levels.** In his words: "Highlight all the
> strategies that align with gsps first. All other strategies can get their own
> s/l, entry and tp1 (no mtp for anything that doesnt align with Gann trade
> plan)." His reasoning, given when told it overrules the 2026-10-16 rule below:
> "if an indicator is misaligned from a Gann method, and a user chooses to
> trust it, that would be a user choice. But to say that the indicator doesn't
> align with Gann, and then force them to align with Gann, isn't appropriate.
> We can guide users to the water, but we can NEVER force them to drink. Which
> is why that indicator feature is available. For anyone who wants the chance
> to create for themselves." So GSPS guides (Gann's plan is the default, and
> the techniques that agree with it are listed first) and never forces.
> Built in `lib/strategies/compare.ts`: a technique **aligns** when it has
> armed in the plan's direction, or, armed in neither, its lean agrees with
> the plan; armed against the plan never aligns, and with no Gann plan nothing
> does. An aligned technique trades GSPS's plan (entry, stop, TP1, MTP) and
> shows its reading of those levels. Every other technique offers its own
> entry, stop and TP1, **never an MTP**: the master take profit belongs to
> Gann's plan alone. `/api/strategy-levels/compare` reads every mode the tier
> allows plus the person's active scripts on one bar fetch, ranked aligned
> first; `/api/strategy-levels` returns `aligned` and the mode's own `levels`
> (no MTP) when it doesn't align. The order ticket lists them ("Read every
> technique"), and "Trade these levels" puts a non-aligned technique's entry
> (as the limit), stop and TP1 into a Manual Override, without the plan's
> crossing line, `entryKind` or failed-top target, and names the technique
> (`techniqueSource`), so placement waits for no Gann crossing on it
> (`confirmEntry`) and judges it as the person's own order. The risk rules
> still apply, as to any order: the 5-point stop cap, Gann's capital rules,
> the tenth at risk and the series of losses. The technique's levels lapse
> once the person changes the side, stop or target. The saved default
> technique's line (`plan-reading-line.tsx`: setup card, signal card, Guided,
> plan-scoped Automation) shows the technique's own levels when it doesn't
> align. Unchanged: nothing here reaches the scan, the score, the gates,
> GSPS's plan or any automated order; the tier gating; the script editor's
> rule test, which still shows every line the author wrote (`mtpr` included)
> because it tests the script, not a trade. The 2026-10-16 note below is
> history where it says "explain-only" or that no level reaches the ticket.

> **Narrowed 2026-10-16 (owner, confirming his 2026-10-01 note): explain-only.**
> "Gann's method is still how we plot the chart; the indicator of choice will
> just [be] how we explain the math on the front end." Asked whether that means
> modes and scripts only explain levels while Gann's plan sets them, he said
> yes. So a Strategy Mode or custom script no longer fills the order ticket's
> stop or target: the "Use these levels" buttons are gone, and the ticket shows
> the technique's reading next to Gann's plan (agrees or disagrees with its
> direction, its own levels marked "for comparison only"). The evaluators,
> chart overlays, script authoring and backtest stay as they were. Where this
> section below says a mode may "generate" or supply levels a human acts on,
> read it as this narrower rule.
>
> **Built the same day:** `lib/strategies/explain/` gives each of the nine
> modes, and any custom script, a reader that takes GSPS's plan and returns
> words only (`PlanReading`: a lean, a summary, one line per plan level). It
> has no output that can become a level, score, gate or order. The order
> ticket sends the plan to `/api/strategy-levels` and
> `/api/strategy-plugins/[id]/evaluate`, which return `reading`, and shows it
> in both protocol and manual mode, read on `EXECUTION_TIMEFRAME`. Owner
> decisions for the rest of the rollout: the setup card shows a one-line
> reading for the saved default technique, the chart switches the chosen
> technique's overlay on automatically, scripts keep `entry`/`stop`/`tp1r`/
> `mtpr` as optional lines, and every surface that shows a plan's levels gets
> the reading where it fits (cross-platform rule above).
>
> **Rolled out the same day.** `components/strategies/plan-reading-line.tsx`
> shows the saved default technique's reading of the plan on the setup card
> (so the daily lists, scanner rows, tracked, saved and intraday alerts), the
> ticker page's plan card, Guided Mode and plan-scoped Automation. It shows
> nothing for Novice or a saved default of GSPS's own plan. Choosing a
> technique in the ticket switches its chart overlay on (VWAP, Donchian and
> stochastic were added to `lib/indicators.ts` for this). Deliberate gaps:
> open positions (their levels may be a person's own edits, not the plan),
> scan history (an old plan read against today's bars), the Novice home
> summary (Novice has no techniques) and notifications (no per-person
> technique is known when they are sent). VWAP now anchors at the latest
> session in the mode, the reading and the chart alike
> (`lib/strategies/math.ts#latestSession`), so it arms only on intraday bars.
> Follow-up the same day: a script's `entry`/`stop`/`tp1r`/`mtpr` lines are
> optional (a block with none is signal-only), and `/api/strategy-levels`
> no longer sends a built-in mode's own prices, only the direction it arms in.

The "Gann-grounded platform" section above states a boundary "that must not
move": no non-Gann indicator (PSAR, Supertrend, RSI, MACD, Bollinger, the
STRAT bar-sequence taxonomy, etc.) may feed a scored criterion, a signal
gate, a trade plan, an entry, a stop, a target, or any verdict GSPS itself
issues. **This section is a deliberate, narrow, explicit exception to that
line, not a repeal of it** — the project owner asked directly for entry/
stop/target generation off PSAR+Supertrend and off Sara Strat bar patterns
(and, by the same reasoning, a small family of other well-known indicator
strategies), for a user's own opt-in intraday/swing trading. Per this file's
own established pattern (see "WD Gann precedence" and "Astrology" above),
the project owner is the one party who can amend a standing principle here,
and does so by writing the amendment down rather than silently patching
around it — this is that write-down.

**What is exempted, precisely, and what is not.** A new, separate system —
`lib/strategies/*`, "Strategy Modes" — may generate its own entry, stop
loss, first target, and master target from a named, real, citably-existing
(non-Gann) trading technique. Nothing about the core Gann-grounded verdict
engine changes:

- **Gann remains the default and the only substance behind GSPS's own
  verdict.** `ScanResult.levels`, the scored criteria, `SignalGates`, the
  scorecard, the Automated Portfolio Manager, and plan-scoped Automation are
  all untouched and continue to read only the Gann pipeline
  (`lib/gann/entryTrigger.ts`, `lib/strat/levels.ts`). A Strategy Mode result
  is never substituted into any of those.
- **Opt-in and one-at-a-time.** A human explicitly selects exactly one
  non-Gann mode for a given chart/order ticket (defaulting to Gann); modes
  are never combined, averaged, or auto-selected, and never persist as a
  silent account-wide override of the scored verdict.
- **A Strategy Mode result is the same kind of thing as a human typing a
  manual stop/target into the order ticket** — a computed suggestion a human
  chooses to act on — not a new GSPS-issued verdict. It carries its own
  label (which mode produced it) at every point it's displayed, so it is
  never presented as, or confused with, the Gann trade plan.
- **The underlying indicator math still must not leak into the display-only
  family.** `lib/indicators.ts` (the chart-overlay module, per the
  "Charting indicators" audit outcome above) keeps its own guarantee intact
  — Strategy Modes compute their own copy of any shared formula
  (`lib/strategies/math.ts`) rather than importing the display module, so
  that module's header comment ("must never feed... a trade plan") stays
  literally true.

**Modes built under this exception** (2026-09-23, nine total — six at first
write-down, three more the same day per direct follow-up request): PSAR+
Supertrend agreement-flip reversal, Sara Strat bar-pattern precision entry
(reusing `lib/strat/patterns.ts#detectPatterns`'s own trigger/stop, the same
taxonomy the "Gann-grounded platform" audit already investigated and kept
for display/confluence use), EMA9/SMA20 crossover, Bollinger Band reversion,
RSI(14) overbought/oversold reversal, MACD(12/26/9) momentum crossover, VWAP
reclaim/loss, Stochastic(14/3/3) crossover, and Donchian channel breakout —
see `lib/strategies/` and `docs/STRATEGY_MODES.md` for the architecture and
each mode's three-question design rationale (required by the mandate below
even though gate 1, Gann sourcing, is answered "none, deliberately" for
every mode here).
**Tenth mode, 2026-10-28 (owner: "GSPS should compute Elliott Wave"):**
`elliottWave`, a wave 3 entry from the shared count in
`lib/strategies/elliottCount.ts` (Elliott's three rules; diagonals, flats and
triangles not counted), Expert and Wall Street. The same count draws the
chart's "Elliott Wave" overlay and feeds the School's live examples, and every
surface says it is one valid count, not a forecast. Same boundary: it never
reaches the scan, score, gates, GSPS's plan or an automated order. Owner's
rule of the same day: user-facing copy teaches public methods like this one
and never names or describes the house method's sources.

**Tier-gated** (2026-09-23, direct project-owner instruction, same day as
the follow-up above): Novice has no Strategy Mode access at all — no
selector shown, only the structural/Gann plan; Pro (STANDARD) is scoped to
`macdMomentum`/`rsiReversal`/`maCrossover`/`vwap`; Expert and Wall Street get
all nine. See `lib/entitlements/policy.ts#allowedStrategyModes` and
`lib/strategies/access.ts`, checked server-side on every read/write
(`/api/strategy-levels`, `/api/strategy-mode-preference`) — no client
component computes its own idea of which modes a tier gets. This is an
access-control decision, not a technique-sourcing one: AGENTS.md's
Three-question mandate questions 1/2 (Gann sourcing, Dewey's cycle
checklist) don't apply to the gate itself, only question 3 does (Hermetic
Polarity — the same framing the mandate's own novice/expert interface-design
worked example already gives this exact shape of tiered-depth decision). See
`docs/STRATEGY_MODES.md`'s "Tier gating" section for the full reasoning and
why each mode landed where it did.

**What this does not open the door to.** This is not a general license to
weaken the non-Gann boundary elsewhere. The scored criteria, signal gates,
and the Gann trade plan are exactly as off-limits to these indicators as
before; the resolved gate-1 status of the scored criteria (see "Gann-derived
AND measured") is unaffected; the "Expanded
indicator library" Q2 roadmap item's own boundary ("no indicator added there
may feed a scored criterion...") is unaffected. This exception is scoped to
one new, clearly-labeled, opt-in system and nothing else.

**Custom-script/plugin system — all four phases (DSL + evaluator, plugin
registry + CRUD API, chart-plotting + level-generation hook, backtesting)
built 2026-09-23/25.** The project owner also asked about a
TradingView-style system where a user (or GSPS) can author and plot a new
indicator/strategy that generates its own levels the same way. `lib/strategies/custom/`
now has a small, safe, declarative condition/action DSL and a tree-walking
interpreter — text source is parsed by a whitelist-only recursive-descent
parser (`parser.ts`) into a bounded AST (`limits.ts`: max source length,
node count, nesting depth, indicator period/offset), then interpreted
(`interpret.ts`) into a function of the exact `(bars: Bar[]) => X | null`
shape `StrategyEvaluator` already uses. No `eval`/`new Function`/`vm`
anywhere, no loop or recursion in the language itself, no dynamic
identifier resolution outside `parser.ts`'s indicator/series whitelist —
see `types.ts`'s header for the full three-question design basis. A
compiled script's result is `CustomScriptLevels`, deliberately NOT shoehorned
into `StrategyLevels`/`StrategyModeId` (a closed union the nine built-ins
and `registry.ts` depend on staying closed) — it carries the script's own
`scriptId`/`scriptName`/`author`/`version` instead, satisfying hard rule 5
structurally rather than by convention. Verified: 22 unit tests including
exact parity against `evaluateMaCrossover` for an equivalent hand-written
rule, `tsc --noEmit` clean, lint clean, `check-banned-terms.mjs` clean.

Design decisions confirmed with the project owner before building (2026-09-23,
applying the Three-question mandate rather than engineering preference alone):
- **Textual grammar, not JSON-only.** Hermetic Correspondence — the text an
  author writes mirrors the AST 1:1, no opaque JSON-tree authoring. Safety is
  unaffected: the parser only ever emits nodes from the closed whitelist,
  identical to what a JSON-only front end would have validated.
- **Script authoring is Wall Street-tier only** (not extended to Expert
  alongside the nine built-in modes) — authoring is categorically more
  sensitive than selecting a pre-vetted built-in mode, so it sits one rung
  above "sees all built-in modes."
- **Private to the authoring user only, no marketplace, in v1.** A
  GSPS-curated/shared script is functionally identical in trust level to
  adding an official tenth built-in mode to `lib/strategies/` directly (GSPS
  wrote it, so it isn't untrusted the way a user script is) — routing it
  through the untrusted-script pipeline instead would be redundant, not
  safer, and cross-user script execution reopens exactly the trust problem
  the private-only scoping avoids. Read through Polarity (the same framing
  this section already gives the system overall): a script author trades
  their own method, they do not get to issue verdicts to other users.

**Phase 2 — plugin registry + CRUD API (built 2026-09-23).**
`supabase/migrations/0081_strategy_plugins.sql` adds `strategy_plugins`
(current state per script; owner-only RLS, private to the authoring user)
and `strategy_plugin_versions` (append-only, one row per saved `source`
edit — a `name`/`active` edit alone does not bump `version`). No compiled-
AST or evaluator column is stored anywhere — every read path recompiles
`source` through `compileCustomScript` on demand, so there is nothing
cached that could drift from the source of truth (AGENTS.md's orphan-
module audit outcome 5/8's "can never drift" lesson, applied here by
construction rather than by a registry-vs-code equality test like
`strategy_modules`' own, since this registry's content is user-authored,
not a static GSPS list). `/api/strategy-plugins` (list, create) and
`/api/strategy-plugins/[id]` (read + version history, edit, delete) — every
write checks `isCustomScriptAuthoringAllowedForPolicy` server-side and
compiles `source` via `compileCustomScript` before persisting; an invalid
script is rejected with the parser's own error message, never stored
half-valid. Verified: extended `access.test.ts`/`policy.test.ts` covering
the new gate, full suite 1882/1882 passing, `tsc --noEmit` clean, lint
clean (0 errors), `check-banned-terms.mjs` clean.

**Phase 3 — chart-plotting + level-generation hook (built 2026-09-25).**
`lib/strategies/custom/plot.ts` walks a compiled script's AST and extracts
every distinct named indicator/extreme reference (bare `open`/`high`/`low`/
`close`/`volume` and compound arithmetic are walked into, not plotted, so
only single named techniques ever appear as a line — the same convention
every built-in overlay follows) into a full, unshifted series per
reference, computed once even if the script reads it at several offsets.
`/api/strategy-plugins/[id]/evaluate` (new) computes one script's levels
*and* its plotted series for a symbol/timeframe in one call — private to
the authoring user (the plugin lookup is scoped to `user_id = auth user`,
so the route structurally cannot evaluate another account's script) — and
zips each series to its bar's own timestamp rather than returning bare
index-aligned arrays, since the chart's own candle fetch is a separate
request and time is the only safe join key across two independently-fetched
bar series. Wired into `components/chart/candles.tsx` via the exact same
`addLine`/`LineSeries` pattern the built-in SMA/EMA/Bollinger/PSAR/
Supertrend overlays already use (a small fixed color palette cycles across
a script's series, since the DSL assigns none of its own) — no parallel
rendering system, per the design doc's own instruction. Wired into
`components/trade/order-ticket.tsx`'s manual stop/target section the same
way the built-in Strategy Mode "Check levels"/"Use these levels" flow
already works: a "Custom script" picker (empty when the signed-in user has
no saved scripts, whatever the reason) that fetches the same evaluate route
and only ever fills the manual fields on an explicit click — never
auto-applied, always labeled by the script's own rationale (which itself
names the script and author). Verified: 5 new `plot.ts` tests (including
exact parity against `lib/strategies/math.ts`'s own `sma`/`ema`), full suite
1887/1887 passing, `tsc --noEmit` clean, lint clean (0 errors — 40 warnings,
all pre-existing except one `react-hooks/set-state-in-effect` warning of a
class already tolerated twice elsewhere in `candles.tsx`), build clean (all
three new routes compiled), `check-banned-terms.mjs` clean.

**Phase 4 — backtesting (built 2026-09-25).**
`lib/backtest/replayCustomScript.ts` walks one script forward over a
symbol/timeframe's history, re-evaluating it against every closed-history
window the same growing-window shape `replaySignals.ts#replaySignalEngine`
uses, and records an event only where the script actually armed —
evidence-gathering only, deliberately not a trade simulation (no fill/stop/
target-touch model, same restraint `replaySignals.ts`'s own header
documents, for the same "public accuracy claims outrunning validated
methodology" reason — a custom script is user-authored and this project has
no reviewed fill-simulation methodology for arbitrary author-defined entry/
stop/target logic). `/api/strategy-plugins/[id]/backtest` (new) wires it in,
same private-to-author scoping as `../evaluate/route.ts`. Verified: 5 new
`replayCustomScript.ts` tests (compile-failure handling, event ordering,
armed-count invariants, identity labeling, a flat-data zero-arm case), full
suite 1892/1892 passing, `tsc --noEmit` clean, lint clean (0 errors, no new
warnings), build clean (all four `/api/strategy-plugins/*` routes
compiled), `check-banned-terms.mjs` clean.

**Authoring UI (built 2026-09-25).** Never one of the four numbered
phases, but the CRUD API had no front end — `/settings/scripts`
(`app/(app)/settings/scripts/page.tsx`,
`components/settings/custom-script-editor.tsx`) is a thin client over
`/api/strategy-plugins*` that trusts nothing it hasn't fetched from those
routes, including authoring eligibility itself (`GET /api/strategy-plugins`
now also returns `authoringEnabled`, resolved server-side, since an empty
script list alone can't distinguish "no scripts yet" from "this tier can't
author them"). Reachable only from a plain-text link on the Settings page
(`components/settings/custom-scripts-settings.tsx`, itself gated on
`authoringEnabled`, rendering nothing otherwise), not the main nav — same
off-nav placement `components/app/nav.tsx`'s own header comment documents
for Glossary. The backtest panel repeats Phase 4's "evidence only, not a
performance claim" wording in the UI itself, not just the API response.
Verified: `tsc --noEmit` clean, lint clean (0 errors, 0 new warnings), full
suite still 1892/1892 (no route-level UI tests, matching this codebase's
existing convention — `app/api/**` and `app/(app)/**` have none), build
clean (`/settings/scripts` compiled, statically prerendered),
`check-banned-terms.mjs` clean. Not exercised in a live browser in this
session (no Supabase-authenticated environment available here) — say so
rather than claiming a manual click-through happened.

**Production verification pass (2026-09-27).** Migration 0081 had merged but
was **never applied to production**, so the whole feature was dead on the live
site. The UI hid that by turning the 500 into "not included on your plan".
Applied with project-owner sign-off. RLS was verified and the editor now shows
load errors. `0080_tier_promotion_three_paths.sql` had the same gap and was
applied in the same pass, also with sign-off. The live browser
click-through ran on 2026-10-16 and passed end to end (save, reload, check
levels, backtest, chart overlay, order ticket, `/promotion`); see
`docs/STRATEGY_MODES.md`'s "Production verification pass" and "Live
click-through". Generalises the live-weights lesson: **merging a
migration is not applying it.**

Any strategy plugin built or extended under this family must continue to
satisfy the rules this section states: opt-in, one-at-a-time, never
touching the Gann verdict, tier-gated and server-resolved only, and clearly
labeled.

## Forward-looking claims — standing direction (2026-09-28, project owner)

Forward-looking claims (a dated window, a projected turn) are allowed **when
verified by documentation**: the Gann source, the method that produced it, and
its measured record (a backtest or a forward test such as the F4 calendar
test) are written down and linked where the claim is shown. An undocumented
projection stays out. The owner cites a forward test from a former session
that projected a 2027–2029 window from Gann's own model; the module behind it,
`lib/gann/macroCycle.ts`, is on the unmerged branch `claude/stoic-brown-p296wd`.
This does not relax the rule against performance claims or guarantees.

## Three-question mandate — the lens work is reasoned through, every session

Project owner direction, 2026-09-23, standing indefinitely; clarified
2026-09-23 and again 2026-09-23 (see "Standing, generative, and
principle-led" below — the second clarification, not a new rule). This is
not a checklist bolted onto finished work and it is not a gate — it is the
**framework, the core, the structure**: the lens a session conceives of and
reasons through a concept with, from the moment the idea forms, not a
compliance step applied after the shape of the thing is already decided.
Read the three questions below in that spirit — as the soul/source the
platform is designed and reasoned through, not as boxes to tick once a
design is finished. In the project owner's own words: **"what we are
defining today is our soul... it is how we breathe life into this
platform."** That is not rhetorical framing to skim past — it is the
standard this section is held to.

**Why this exists — the motivating precedent.** A prior session proposed a
concept carrying an implicit linear, discrete-step assumption baked into
its design — the kind of default a mind reaches for without noticing it
has reached for it. The project owner was the one who caught it and
redirected the session toward a continuous scanning function instead; the
session then went back and confirmed the correction against its own notes.
Nothing about that idea was Gann-adjacent in the narrow, criteria-and-scoring
sense, and nothing about it was a citation problem — it was a *reasoning*
problem: a linear-thinking default slipped into a concept because nobody
was holding a lens up to it while it was still being conceived, only after
it had already taken a shape. This is recorded here the same way
`harmonicProximity`'s stale anchor and the ADX incident are recorded
elsewhere in this file — as a concrete, worked example of a failure mode,
not a hypothetical one — because the mandate exists specifically to catch
this class of mistake *before* it becomes a feature, not to audit it after.

Ask and answer these three questions — in writing, where the work lands
(module header, PR description, or the session's reply) — while conceiving
of and reasoning about a concept, in this order:

1. **How does Gann's own methodology best ground or improve this?** Cite
   the source and tier in `docs/GANN_HISTORICAL_SOURCES.md`.
2. **How does Dewey's and Tomes' work on cycles best inform this?** Where
   the component makes any claim about periodicity or recurrence, run
   Dewey's seven-item checklist explicitly (dominance, regularity of
   timing, repetition count, constancy of period, phase-resumption after
   distortion, wave-shape identity, cross-series clustering) and state
   which items were cleared and which were not.
3. **Which Hermetic principle does this best express** — Mentalism,
   Correspondence, Vibration, Polarity, Rhythm, Cause and Effect, or
   Gender — and does that framing change the design?

This is a **reasoning and design discipline**, not a new evidentiary
standard, and it is emphatically not a gating mechanism: it does not exist
to unlock or move thresholds, weights, or gates, and it does not relax the
citation discipline set out under "Hermetic principles & cycle theory"
above. Hermetic framing and cycle-theory literature shape *how* a
component is designed and reasoned about; they cannot, on their own, move
a threshold, a weight, or a gate. Only a citable Gann source (per "WD Gann
precedence" and "Gann-derived AND measured" above) or a measured result
(`lib/validation/criteria-registry.ts`) can do that. Applying this mandate
must not be read as license to smuggle in unsourced numerology, astrology,
or cycle claims that haven't cleared Dewey's checklist — those still stay
confluence-only and non-gating, per the existing rule.

**Scope: platform-wide, not Gann-adjacent-only.** All three questions apply
to every feature, function, and future update on this platform —
scoring/criteria/Gann-technical surfaces, yes, but equally UI/UX,
functionality, interface design, copy, onboarding, everything with a
product-facing shape. A prior framing of this section scoped it to
Gann-adjacent work only (new or audited criteria, scoring, level
construction, entry/exit/risk logic, lifecycle, charting, education copy);
that framing was too narrow and is corrected here. Where question 1 (Gann
sourcing) genuinely doesn't apply to a given surface — pure UI/UX work,
novice-vs-pro interface design, and similar cases where there is no Gann
technique to cite — questions 2 (cycle theory) and 3 (Hermetic principles)
still apply and should be worked through; question 1's inapplicability
does not excuse the other two. The one true exemption is work with no
product-facing shape at all — a build fix, a typo, a dependency bump, pure
infra with no design decision embedded in it — and that exemption should
be stated plainly rather than assumed: say "this has no product-facing
shape, the mandate does not apply" instead of silently skipping it or
padding an answer to appear compliant.

**Standing, generative, and principle-led — re-clarified 2026-09-23 so this
is never diluted or re-litigated.** Three points, stated explicitly because
each has drifted or could drift in a future reading of this section:

1. **This is not scoped to "Gann-adjacent" work.** The "Scope" paragraph
   above already says this once; it is restated here because a mandate this
   easy to mentally narrow back down to "the Gann stuff" needs saying twice.
   Every feature, function, and future update — scoring, UI/UX, copy,
   onboarding, access/tier design, billing flows, anything with a
   product-facing shape — is read through this lens. There is no category of
   product work this section quietly excludes.
2. **It is not a checklist to satisfy after a design is finished.** A
   design produced first and then annotated with "here's the Gann angle,
   here's the cycle angle, here's the Hermetic angle" has already failed the
   mandate, even if the three answers it produces are individually correct.
   The motivating precedent above is precisely a case where the failure was
   in *when* the lens was applied, not in the final write-up's content. The
   lens belongs at the moment a concept is being conceived — it is
   generative, not decorative. If a session catches itself writing the
   three-question answers only after the shape of a feature is already
   locked in, that is a signal to go back and re-examine the design itself,
   not just to backfill the writing.
3. **Pick whichever principle(s) actually fit — never default to one out of
   habit.** Question 3 lists seven Hermetic principles (Mentalism,
   Correspondence, Vibration, Polarity, Rhythm, Cause and Effect, Gender)
   precisely because different problems are illuminated by different ones,
   and a session that reaches for the same one or two every time (Polarity
   and Rhythm have both appeared repeatedly in this file so far, because the
   work so far has repeatedly been tier-ladder and cycle-shaped) is not
   applying the mandate — it is pattern-matching to precedent. Read all
   seven before choosing, name the one(s) that genuinely fit the problem at
   hand, and say in writing why the others don't. A session is free to
   invoke more than one where more than one genuinely applies (the novice/
   expert interface worked example below already does this, with Polarity
   and Rhythm together) — the discipline is fit, not variety for its own
   sake and not habit either.

**Worked example: the novice-friendly-yet-expert-depth interface design
goal.** This platform's goal of an interface that is approachable to a
novice while still carrying expert-level depth is a worked example of
**Polarity** (Hermetic principle, Emerald Tablet): two poles of the same
spectrum, novice and expert, held together in one coherent design — not a
tradeoff where one pole is chosen at the other's expense, and not a
compromise that dilutes both. It is also read through **Rhythm** and
cycle theory — specifically the technology adoption/product life-cycle
pattern (innovators through laggards, and the maturity/decline phase that
typically follows). GSPS's stance toward that pattern is to observe and
respect its actual behavior — its phases, its rhythm — without accepting
the pattern's typical terminal decline/obsolescence phase as inevitable
for this platform. The intent is not exemption from the cycle; it is
persistence *through* correctly adhering to whatever the pattern's real
underlying rule turns out to be, the same way a Gann technique is
implemented by translating its disclosed rule faithfully rather than by
declaring the rule optional. Treat this the way `lib/gann/entryTrigger.ts`
treats the three questions for a code module — stated in place, not
assumed. **This worked example is also the standing precedent for the
"Polarity gap" audit** (see the Polarity-audit section this file
cross-references once that work lands) — the same principle that names the
novice/expert interface goal is what exposed that a subtracted feature list
is not yet a genuine second pole.

This section is what makes the mandate durable across sessions: it is
checked into the repository and loaded by every session via
`CLAUDE.md` → `AGENTS.md`, the same mechanism that already carries every
other standing principle in this file. A session has no means to reach
into a different, already-completed session and retroactively change what
it did; a request to audit specific past work should name the PRs or
commits, and that audit should be run — and recorded here or in the
relevant doc — going forward, not assumed to have happened automatically.

### Worked example: universe rotation — the precedent this mandate codifies

**Note:** the "motivating precedent" above and this worked example are the
same event. This section predates the formal mandate by a few hours in the
same session; it is kept as the concrete artifact rather than folded away,
the same way `lib/gann/entryTrigger.ts` is a standing worked example rather
than a paragraph summarizing it.

## The Law of Creation — fourth question of the mandate (2026-10-21, project owner)

"Add this to the same memory bank that our mandate, roadmaps, parities and
memory [live in] so every session implements it by default." The owner's
Multi-Dimensional Creation Equation is in
`docs/memory-bank/LAW_OF_CREATION.md`, kept as he gave it: two complementary
entities that truly interact produce a third neither contained
(a ⊗ b = a + b + I(a,b)·ab, so 1 ⊗ 1 = 3), while a pair that does not interact
is a mixture (1 + 1 = 2); the created third can interact again; substance is
conserved, form is created. **Every session applies it by default** as a fourth
question beside the three-question mandate above, while conceiving a concept:
name the complementary pair, say whether the join is a creation or only a
mixture, and where a created third exists, what it is and where it re-enters.
Same discipline as the Hermetic lens: it shapes design and reasoning and is
never evidence. It cannot move a threshold, weight, gate or verdict, and its
counting results (2ⁿ − 1, the chain, 3ⁿ) are interpretive by the owner's own
tier, never market numbers. Worked readings (price ⊗ time, level ⊗ close,
novice ⊗ expert, live scan ⊗ replay) are in that file.

## Cycles as architecture, not only scoring — standing direction (2026-09-23, project owner)

The Hermetic principle of Rhythm — everything flows, out and in; a cycle
completes and *returns*, it does not complete and stop — governs how this
platform's own recurring processes are designed, not only which market
techniques get scored. This is the same "Hermetic principles & cycle
theory" section above, extended by direct project-owner instruction from
scoring criteria to the platform's architecture itself: a scheduled job
that drains a finite batch and halts is a linear model, and linear is not
how Gann's own cycle work treats the market, so it is not how this
platform's own scanning cadence should be modeled either.

**Worked example: the universe-rotation scan design**
(`lib/scan/universe-rotation.ts`, built the same session this direction was
given). The automated market scan's coarse universe was capped at the
top-250-most-active symbols every run (`FULL_UNIVERSE_TOP`,
`lib/marketScan.ts`) — a structural exclusion of most of the 766-ticker
large-cap universe from ever being looked at, not a deliberate choice (see
PR #265's platform-wide scan audit). The fix chunks the full universe and
rotates through the chunks so full coverage happens over a repeating cycle
instead of never happening at all. The rotation index is **time-anchored**
(`resolveRotationChunk`, keyed off ET wall-clock minutes via
`lib/market/session.ts#etParts`), not a stored counter that increments and
could desync — a missed or delayed cron tick still resolves to the correct
chunk on the next run, because the schedule's phase is recomputed from the
clock every time rather than carried forward as state. That is Dewey's
"phase-resumption after distortion" criterion (Part C), applied here as an
**engineering property of the mechanism**, not a claim about market data —
the distinction matters and is kept explicit in that module's own header.

**The boundary to hold, stated the same way `lib/gann/trendStrength.ts`
states its own two engineering constants:** the *shape* of the design (a
returning cycle, not a linear batch-and-halt) is Rhythm-grounded and
Dewey-informed reasoning about how to build a scheduler well. The
*specific numbers* — chunk size, rotation interval, how many chunks make a
full cycle — are engineering choices sized against the Vercel Hobby
60-second function budget and the measured per-symbol scan cost
(`FULL_UNIVERSE_TOP`'s own doc comment), not derived from any Gann source
or cycle-theory literature. Framing shapes the design. It does not source
the numbers. Do not let a future session read "time-anchored, phase-
resuming" as a claim that the rotation cadence itself is Gann-derived —
it isn't, and it doesn't need to be to be good engineering.

**Standing instruction going forward:** before designing any new recurring
platform process — a cron cadence, a rescanning loop, a rotation, a
retry/backoff schedule — ask whether a linear "run once and stop" or "drain
and halt" shape is actually right, or whether the process is naturally
cyclical (the market it serves never stops cycling either) and should be
built as a returning wheel instead. Say which, in the module's own header,
the same way `lib/gann/entryTrigger.ts` states its three-question Gann/
cycle-theory/Hermetic design basis.

## Three-path tier promotion (2026-09-25, project owner direction)

Every tier transition on the Novice → Pro → Expert → Wall Street ladder can
now be cleared through any one of three independent paths: **Curriculum**
completion (GSPS School), a demonstrated **Track Record**, or **Pay Your
Way**. See `lib/promotion/transitions.ts`, `trackRecordPolicy.ts`,
`curriculumPolicy.ts`, `paths.ts`, and `lib/billing/promotionPricing.ts`.

**Three-question mandate, applied before this was designed:**

1. **Gann sourcing**: N/A. This is a governance/access-tier ladder, not a
   market technique — there is no Gann source to cite for it, and none of
   the three paths' thresholds claim to be.
2. **Dewey/cycle theory**: the Track Record path is a rolling evaluation
   window, which is a periodicity claim. Dewey's seven-item checklist is
   run explicitly in `trackRecordPolicy.ts`'s own header — two items
   clear as genuine periodicity claims (regularity of timing, phase-
   resumption after distortion), three clear by policy construction rather
   than measured evidence (repetition count, constancy of period — and the
   window lengths themselves), and two don't apply to a single trader's
   evaluation (wave-shape identity, cross-series clustering). Stated
   honestly there rather than claiming a clean sweep.
3. **Hermetic principles**: **Polarity** is the load-bearing one — three
   genuinely different poles of qualification (discipline/study,
   demonstrated performance, capital), each a real path on its own, not one
   "real" path with two lesser substitutes. **Cause and Effect**: each path
   is a different kind of evidence offered as the cause a promotion is
   earned from. **Rhythm**: the Track Record path is a recurring, rolling
   measurement (per "Cycles as architecture" above) — a profile that later
   falls below the bar can fall back out of eligibility on the next read,
   this is not a one-time exam that stays passed forever once cleared.

**The project owner's own framing for the promotion moment itself**
(2026-09-23, carried into this build): tier promotion should read as a
genuine graduation out of the constraints appropriate to a lower stage —
"unshackled from their current binds," ascending the ladder — not merely
"more features unlocked." `app/(app)/promotion/page.tsx`'s copy is written
to that framing within `lib/promotion/copy.ts`'s existing forbidden-phrase
rule (no "guaranteed", "best trade", "safe", etc.) — the ascension is
expressed through what a tier's actual constraints were and now aren't,
never through a performance claim.

**The one mandatory, path-independent component** (direct project-owner
decision, 2026-09-25, made when asked which requirements should hold
"if persons are willing to pay"): Wall Street unlocks autonomous live-money
trading (`autonomous_portfolio_manager`, Wall-Street-only per
`lib/tiers.ts`). The Academy 8 capstone's live-trading risk/settlement/
gaps/slippage/account-type education is treated as a safety prerequisite,
not a monetization lever, and is required for **every** path to Wall
Street — curriculum, track record, or pay-your-way alike
(`lib/promotion/curriculumPolicy.ts`'s `mandatoryComponentMet`). This is
the one place the "three independent paths" model has a shared,
non-optional component. It is deliberate; do not "clean it up" into full
path independence without going back to the project owner first.

**Graduation exams (project owner, 2026-09-28).** Novice -> Pro and Pro ->
Expert each have a graduation exam in the tier's sandbox
(`lib/school/graduationExam.ts`, `/school/exam/[transition]`): real past charts
shown up to a date, graded on the server against the platform's rules (trend,
trade or wait, entry, stop, size), never on P&L. **It belongs to the curriculum
path only** (owner, same day: "if paying for expert tier, or advancing via
earning it through achieving sustained trading success, then they have
permission to advance"): the courses plus the exam clear that path; track
record and pay-your-way need no exam. Stored in `graduation_exam_attempts`
(migration 0084, applied to production with owner sign-off; service-role
writes only). Wall Street keeps the Academy 8 capstone on every path.

**Track Record thresholds — where the numbers come from.** GSPS has no
multi-year proprietary track record yet (`docs/replay-runs/`'s longest run
spans about two months). `lib/promotion/trackRecordPolicy.ts`'s own header
comment states this plainly and records the three real inputs actually
used: the existing, already-shipped Novice→Pro policy as the "easy" anchor;
GSPS's own measured backtest evidence (the Execute bucket's +0.362R
expectancy, 2026-09-23 run) as the ceiling a Wall Street-track-record
candidate must approach; and publicly documented funded-account evaluation-
program conventions (10-30 trading days, 8-10% first-phase profit targets)
used only as a structural analogy for window length and profitability-floor
shape, never as evidence about GSPS's own setups. The resulting ladder is
asymmetric by explicit design: no profitability requirement at all for
Novice→Pro (encourages early engagement), a modest floor for Pro→Expert, and
the hardest bar — approaching GSPS's own measured best bucket — for
Expert→Wall Street (discourages skipping the curriculum at the tier that
trusts an autonomous system with the user's money). These are starting
values, remotely tunable the same way the original Novice→Pro policy
already is; re-derive them once GSPS has its own multi-year data rather than
treating them as permanent.

**A profitability metric distinct from execution scoring, by design.**
`lib/risk/execution-score.ts`'s own header states P&L must never feed
execution scoring — luck can reward poor behavior, and correct execution
can still lose. The Track Record path's `cumulativeReturnPct`/`expectancyR`
(`lib/promotion/readiness.ts#gatherTrackRecordInputs`) are a deliberately
separate computation for a different question ("has this trader actually
made money," relevant to promotion specifically) and are never fed back
into risk sizing.

**Pay Your Way pricing — approved (2026-09-25), not yet a live product.**
Novice→Pro $49 one-time; Pro→Expert $499 one-time + the standard
subscription; Expert→Wall Street $1,499 one-time + the standard
subscription — sized against GSPS's own existing tier subscription prices
so pay-your-way is always the worse deal than earning a tier for free
through curriculum or track record, per the reasoning in
`lib/billing/promotionPricing.ts`'s own header (`APPROVED_PROMOTION_PRICING`).
Approval of the *price* is a separate action from activating billing:
`lib/billing/promotionPricing.ts` still follows the same "not enabled until
real Stripe prices exist" posture as the existing `lib/billing/stripe.ts` —
`isPromotionBillingEnabled()` stays `false` until `STRIPE_PRICE_PROMOTION_*`
env vars are actually set, which requires creating the real Stripe Price
objects first (Stripe dashboard access this session does not have). That
remaining ops step is what's left before checkout can go live, not further
pricing approval.

**Schema**: `supabase/migrations/0080_tier_promotion_three_paths.sql` adds
`tier_promotions_progress`, `tier_promotions_status`, and
`tier_promotion_purchases` — generalized across all three transitions,
including Novice→Pro going forward. The original `promotion_progress`/
`promotion_status` (0046) are left in place, immutable per this repo's
convention, and continue to be read for Novice→Pro's existing Foundations
education/practice-validation flags specifically — they are not migrated or
dropped, since no profile has been promoted through them yet. **Not applied to
production until 2026-09-27**: the migration merged without being run, so
`/promotion`'s three-path tables didn't exist until then (see "Production
verification pass" under Strategy Modes).

**What was generalized vs. left alone.** `lib/promotion/eligibility.ts`'s
original `evaluatePromotionReadiness`/`DEFAULT_PROMOTION_POLICY` are
untouched and still drive the pre-existing `/api/promotion/status` /
`/api/promotion/upgrade` routes and the Settings page's promotion card
exactly as shipped — this build added new, separate functions
(`evaluateTrackRecordEligibility`, `evaluatePromotionPaths`) and new routes
(`/api/promotion/paths/status`, `/api/promotion/paths/upgrade`) alongside
them rather than rewriting what already worked. A future session should
prefer the generalized surface for any new work and can retire the original
Novice→Pro-only routes once the new `/promotion` page is confirmed to be
the intended replacement UI, but that retirement is not done here.

## Setup cards, MTP and the intraday refresh budget (2026-09-30, project owner)

Standing facts for a session that touches any list of setups:

- **One card everywhere.** `components/setups/setup-card.tsx` (built from
  `lib/setups/card.ts`, and `lib/setups/intraday.ts` for an intraday alert) is
  the only way a setup opens from its name: the daily Buy/Sell lists, the
  tracked and saved lists, and the intraday alerts. A new list of setups uses
  it too (the cross-platform-consistency principle). The card shows the
  scorecard's **per-pillar rollup only** — `lib/scoring/public-summary.ts`'s
  rule that the named conditions stay server-side applies to it in full; never
  pass a row's `breakdown` to the client.
- **The name is MTP.** The master take profit was "MP" on the chart and
  "Master" in the lists; it is **MTP** (master take profit) wherever a person
  reads it. Guided Mode and the onboarding walkthrough keep their plain-English
  "next level" and add "(MTP)". The internal field stays `masterProfit`.
- **Intraday's TP1 and MTP are Gann levels or nothing.** The
  intraday scanner prices an exit (the session's 50% point or a point beyond the crossed prior-session
  extreme), a first target and, since 2026-10-22 (owner: "Include a mtp for
  intraday trades"), a master take profit: the next old level or round number
  beyond the first target (`gannMasterTarget`, the daily plan's "next level
  beyond TP1" at the session's scale). It rides into the ticket and the order
  record; nothing sells there (Q14), as with the daily MTP. The first target was
  twice the risk, an R-multiple with no Gann source; on 2026-09-30 the owner
  ("everything must align with Gann") had it replaced by `gannFirstTarget`
  (`lib/scanner/intraday.ts`): the nearest old top or bottom beyond the price,
  or a round number just short of one, at least one intraday ATR away. Where
  none lies ahead the target is null, "no target is fixed, the stop trails"
  (Gann's "never fix a target price"), and the card, alert and email say so
  rather than inventing one. The old levels read are the session's own extreme,
  the prior close, the session's completed swings, the prior session's high and
  low, and the 3-Day Chart's swings on the daily bars (`gannOldLevels`, added
  2026-10-16; live alert and intraday replay alike). A replay-only intraday profile to measure the method at
  intraday scale is built (2026-10-01, `lib/backtest/replayIntraday.ts`,
  `?profile=intraday`) and **not run**; its rules and the rule for reading the
  run are fixed in the doc's Part 5. Nothing measures it yet.
- **The refresh budget lives in `lib/entitlements/policy.ts`**
  (`intradayRefreshesPerDay` / `…PerWeek`; owner-set 2026-09-30: Pro 3 a day /
  10 a week, Expert 5 / 21, Wall Street unlimited with automatic refresh, Novice
  none) and is spelled out in
  `docs/GSPS_TIER_ENTITLEMENT_SPEC.md`. Enforcement is
  `lib/entitlements/intraday-refresh.ts`, counted from `scan_executions` rows
  (`source = 'intraday'`), one per completed on-demand scan, so it needs no
  migration. It is a soft budget: the count is read before the scan and the row
  written after, so two simultaneous requests can both pass. Do not "harden" it
  onto `reserve_usage_slot` without a migration to admit the usage key, and
  remember that merging a migration is not applying it.
- **The Dashboard watchlist** is the user's own 3–9 US stocks or crypto pairs,
  in the `watchlists` / `watchlist_items` tables migration 0001 created
  (`lib/dashboard/watchlist.ts`). `app/api/intraday-scan/route.ts` merges every
  user's watchlist symbols into the system scan's universe (capped at 100 total since
  2026-10-29, 50 before),
  so a symbol added there can be covered by that scan.
- **Timeline, in one line.** Entry is minutes to a few hours (four closed
  15-minute bars at least; a plan lasts its session unless its stop breaks first, Q17, 2026-10-16); the
  trade is days to weeks (median about 5 to 7 sessions in the replay, and 60%
  of trades on the live exits were still open at its 10-session limit).

**Intraday, 2026-10-21 (owner: SPY's daily plan filled in the first 45
minutes and nothing intraday said so; TSLA's 6/6 signal read "Suppressed").**
Gann trades the swing, not the day (*Annual Forecasts* p.24; "scalpers get
scalped", *Stock Selector*), and uses the hourly and session charts to time an
entry in an active market (Master Course Ch.13). So the intraday scanner now
times the daily plan: "Daily plan's level held" (`plan_level_held`,
`lib/scanner/intraday.ts`) fires when price reacts to a standing Execute or
Watch plan's entry without trading its stop and the session's swing chart turns
back through it; the stop at entry is the daily plan's own (Rule 3, aligned with
#411's styles, which move it after the fill), and TP1 and MTP are the daily plan's (NSTD pp.20, 46;
*Tunnel* p.198 for the re-buy). Not a session-swing stop: the six-year intraday
replay (2026-10-21, `replay-diagnosis/2026-10-21-intraday-profile-verdict.md`)
failed its test with every loss on the initial stop, so the panel says intraday
signals carry no measured record yet. The route reads
the plans from `daily_scans` and `active_monitors` (`loadDailyPlans`). Every
intraday TP1 must pay more than the risk (`gannFirstTarget`'s `risk`,
`targetPaysRisk`, M-K5), in the alert and the intraday replay; a plan with
none says no trade and offers no "Trade this". Alerts carry a "With the daily
trend" check. A signal inside its 30-minute cooldown stays on screen
(`ScanOutput.heldAlerts`, `firstFlaggedAt`); only the repeat is not persisted
or sent. The budget read returns today's scheduled-scan alerts (`recent`), so
a metered panel shows them before a refresh is spent, and the ticker page has
its own intraday panel, labelled apart from the daily verdict. A monitor goes
INVALIDATED only when the scan retired the plan for a broken stop; any other
Reject is NO_SETUP and sends nothing (`evaluateMonitorsAndNotify`). The daily
verdict and `STRATEGY_VERSION` are unchanged.
**Hourly chart on exchange hours, 2026-10-22.** Gann's hourly chart is read
on exchange hours (Master Course PDF 378): a US equity's hours count from the
9:30 ET open, crypto's stay on the clock. One key, `exchangeHourKey`
(`lib/gann/intradayExit.ts`), serves the intraday alerts' hourly chart, the
intraday replay and the Intraday style's hourly-turn exit. It had bucketed bars
by UTC hour, so an equity's first hour was 9:30-9:59 alone. The live scan's
display-only hourly trend still reads the vendor's clock-hour bars (it feeds
no score). `STRATEGY_VERSION` was `2026-10-22-gann-hourly-exchange-hours`.
**Rule recheck fixes, 2026-10-22 (owner: "run the code reviewer over those
rules"; the recheck is `/mnt/project-files/gann-feature-map/review/2026-10-22-recheck.md`).**
Nine defects, each answered from Gann. (1) The 7-day chart on weekly and monthly
bars turned on any bar that failed to extend the swing, an inside bar included;
Gann counts monthly moves as months "without breaking the previous month's low
or high" (*Commodities* pp. 102-103), so on bars that each span the chart's 7
days the line turns only on a break of the previous bar (`swingChart.ts`;
daily bars unchanged). (2) The time-window hold opened the yearly counts, great
cycles and day counts only for a turn of the anchor's own kind; Gann counts
"from any important top or bottom" (W006 pp. 14, 44), so `timeWindowsAt` reads
both (`timeCycles`' bullish/bearish tags stay for the coarse bonus and the
card). (3) The 5-point cap refused every automated re-buy and reversal; it now
yields to the plan's own stop on those two (`confirmEntry`), and only to it.
(4) The replay's `exitRule` defaults to `LIVE_EXIT_RULE` ("gann"), not
"bracket". (5) The intraday replays refuse an alert with no first target or one
that doesn't pay the risk, as the live panel offers no trade on it
(`target_unpaid`). (6) Placement refuses an add to a position not in profit,
paper and live (`averagingLossRefusal`, never-failing rule 13). (7) The live
trading unit reads the first verified equity as its starting capital
(`readLiveStartingCapital`), at placement and in the portfolio manager. (8) The
portfolio manager opens nothing in the twice-yearly rest window unless the
trader turned the reminder off or dismissed it. (9) The year fraction's
"anniversary" is the calendar date (`daysFromAnniversary`); the 360-day count is
labelled "360 days". `STRATEGY_VERSION` is `2026-10-22-gann-rule-recheck-fixes`;
Execute and the 7/4 cutoffs need a fresh run on it.
**Final stage after an advance, 2026-10-23 (diagnosis of the intraday alerts'
run 90).** The final stage's trails (A-STOP-04's 5 points under the day's high,
the last counter-move from the best price, the two-day counter) started at the
fill, so a trade bought in a campaign's 3rd section that had not moved was
trailed above its entry and taken off on noise (3 of run 90's 6 final-stage
exits had a best of 0.02R or less). Gann trails "in fast high-level advances"
(W006 p.46, Rule 2), and moves no stop until 3 points ahead (*Stock Selector*
Ch.II rule 4), so they now start once the trade has advanced 3 points, live and
replay alike (`readGannExit`). `STRATEGY_VERSION` was
`2026-10-23-gann-final-stage-after-advance`; verdicts don't move.
**The context-only time counts act, 2026-10-27 (recheck's open item, the
coordinator's assignment after #455).** `countWindowsAt` (`lib/gann/countWindows.ts`:
the seasonal sixteenths, the winter-quarter dates, the Ch.5 wheel, the week
counts, the Square of 52, time balance, the 11¼ market days, price read as
time, the square of 90, the year fractions, the other lessons' cycles, the
Square of 144 in time and the 7th/14th/21st day) now opens windows in the
time-window hold (`timeWindowsAt`), live and replay alike. A count from a pivot
opens for a top and a bottom alike (W006 pp. 14, 44); only a turn its source
names (the time balance's, the 7th/14th/21st day's) is held to it. The yearly
counts too long to repeat five times in the record (30, 50, 60 years) carry
CYC-04's label. Measured before wiring, 942 3-Day Chart turns on 80 random
walks: the hold was already open on every turn (yearly and day counts 90%, the
Square of Nine's and Hexagon's time counts 99% each), these counts alone on
98%, so the hold selects nothing a random turn would not meet; held for the
owner with P7's saturation. The real-data base rate
(`lib/research/timeWindowBaseRate.ts`) needs the vendor's bars, which this
sandbox can't reach. About 0.7 ms a read, only when a counter-trend Execute
needs a window. `STRATEGY_VERSION` was `2026-10-27-gann-count-windows-act`.
**Execute means placeable now, 2026-10-27 (owner amendment: "a trade SHOULD
NOT be executable if setup isn't ready currently"; "have 7 be the lowest
executable score. But it must still be deemed executable currently, with clear
and obvious take profits levels").** `applyReadyNowHold` (`lib/scoring/score.ts`)
holds a 7+ at Watch unless the definite indication is shown (a crossing closed
3 points past, W006 Rules 3(b)-(c)), the entry is within a day's range of price
(`lib/setups/resting.ts`, the owner's 2026-10-21 predicate, now part of the
verdict rather than the lists alone), and TP1 and MTP lie ahead of price with
MTP beyond TP1; M-K5 and the failed-top hold still apply. GSPS holds no measured
chance of reaching a target, so "probability" is read as those tests until the
replay supplies one. A Watch at the cutoff records its reason too, and the card
names what any held setup waits for in plain words (`heldNote`,
`public-summary.ts`). The lists' "Resting orders" now take a Watch at the
cutoff whose entry rests. The replay reads it at the fill (indication shown,
price at the entry), so only the targets reading holds there; the plan-time
reading the live scan shows is measured as the factor `readyNowAtPlan` (the
session's last close and daily ATR, when the plan is priced). `STRATEGY_VERSION`
was `2026-10-27-execute-ready-now`.
**Outdated plans expire, 2026-10-28 (owner: "I need to continue to track those
equities but I believe that the setups are expired"; plan approved "Go").** On
the 2026-10-27 scan 23 of the 43 listed setups already stood past TP1 (WAT's buy
at 395 with price 468). `readPlanExpiry` (`lib/gann/planExpiry.ts`) expires a
plan when price stands at or past its TP1 (a crossed level is the next support,
W006 pp.19-24, "old tops become bottoms"; the next scan prices the new buying
point), or when a reaction buy after a crossing could fill only on a reaction
over the campaign's greatest by a point (Master Course Ch. 8, PDF 249). Not for
an old-bottom buy: the double-bottom test is Gann's buy. `applyPlanExpiredHold`
makes it Reject, the scan returns no levels and `ScanResult.planExpired` keeps
the plan and a plain-words note, so no list, chart, ticket, Guided Mode,
automation or intraday timing offers it anew, and a tracked symbol's monitor
reads "No setup now" until a new plan arms it. A `trade_plans` row awaiting
confirmation is not armed past its TP1 (`armFromBars`, `targetPassed`); an
already-armed plan keeps its one-session window. Stored daily rows past TP1 are
dropped by `isInvalidated`. The replay does not enter such a plan, re-read on
each closed intraday candle (`planExpiryAt`, `expiredPlans`, inside
`retiredPlans`). `STRATEGY_VERSION` was `2026-10-28-plan-expiry`, merged onto the P1 long counts as `2026-10-28-plan-expiry-on-p1-long-counts`.
**The plan at the session's close, 2026-10-28 (found by the "symbol page keeps
its plan" thread).** The live scan read the lattice levels (Square of 144,
planetary averages, angles, Jensen, Square of Nine, name chart) and the Square
of Nine targets around the quote, so a plan's stop, TP1 and MTP, and with them
the S/R band, angles, square, range divisions and pillar facts, moved through
the session, while the replay reads them all at the last completed session's
close (`buildMacroContext`). Gann judged his charts after the close and kept
away from the ticker (*Truth of the Stock Tape* pp.5-7, 76-82; *Wall Street
Stock Selector* pp.41-42), so the live scan now reads them at that close
(`planPrice`, `lib/scanTicker.ts`); the quote still decides the stop breach,
ready-now and resting. Intraday replays read the prior session's daily close
for it too. `pillarParity.test.ts` holds a moving quote to the same plan and
score. `STRATEGY_VERSION` was `2026-10-28-plan-at-session-close`, merged onto the
plan expiry as `2026-10-28-plan-at-close-on-plan-expiry`.
**Double bottoms weeks apart, 2026-10-28 (diagnosis of the six-year daily
rerun's first quarter: old-bottom entries 4,856 trades at -0.076R, CI wholly
below zero).** One translation defect, fixed: the old-level buy rested at the
latest bottom however young it was, so it bought retests a few days after the
low (that these carry the loss is inferred: the run's per-trade rows could not
be read here), not Gann's double bottom, which is
"the same level weeks, months or a year or more apart" (W006 p.20, A-ENTRY-02;
tops alike, pp.22, 47). `computeGannOldLevelEntry` now rests the order only
once the bottom is `DOUBLE_BOTTOM_MIN_DAYS` (14, `entryKind.ts`) calendar
days old by the day after the last session, live and replay alike, and the
volume rule's heavy-top retest (A-ENTRY-20, the "sign to sell" note) needs its
two tops as far apart. Stated exception: the failed-top hold (A-LEVELS-04,
`multipleTops.ts`) still reads tops days apart, since a top price failed at is
resistance whatever the gap (W006 pp.19-24). An open trade bought at a younger
bottom before this change has its entry rebuilt as of its day under the new
rule, so its live exit may read a crossed level it never had; it ends with
those positions. "Weeks" read as two weeks is an
engineering choice, labelled; `timeRules.ts` reads "2-3 weeks" as from day 8,
a different phrase. Only the latest bottom is read, as before. `STRATEGY_VERSION`
was `2026-10-28-double-bottom-weeks`; Execute and the 7/4 cutoffs need a
fresh run on it. The industry group rank merged onto it in the 2026-10-28
release (no new rule): `STRATEGY_VERSION` is
`2026-10-28-groups-by-industry-on-double-bottom-weeks`.
Bell notices (owner, "Yes, build and apply it"): each new signal from the
scheduled intraday scan writes an `in_app_notifications` row (verdict
'Intraday', migration 0100, applied 2026-10-21) for every member with the
symbol on a watchlist or an open WATCH/EXECUTE monitor, by tier as the panel
shows it, once a move (`lib/notifications/intradayBell.ts`): a signal still standing is not written again the same New York day, only after the same symbol's signal turned the other way (2026-10-28; it had repeated every cooldown, 4,515 notices for 1,115 member-signal pairs on 10-26).
Email and browser push for the same signals (`lib/notifications/intradayDelivery.ts`,
2026-10-21, after #404) go to every member by their settings (push off until
turned on), score floor and quiet hours, each channel deduped on its own, and
now by tier as the bell is: before, email reached every member whatever their
plan. A signal goes once a move on each channel, as the bell's does (keyed on
symbol, signal and direction, never the drifting score; 2026-10-28, after 150
emails for 63 member-symbol-direction pairs on 10-27). **No email since
2026-10-28 (owner: "Yes" to email carrying only the key alerts):** intraday
signals go by push and the bell only; Resend refused sends once its daily
quota of about 200 was spent, and intraday was about 90% of email (10-23: 184
intraday, 16 monitor). The day's signals reach the inbox in the evening digest.
**Measured losing, 2026-10-22 (run 80,
`replay-diagnosis/2026-10-22-intraday-alerts-replay.md`):** "Daily plan's level
held" lost over Aug 26 to Oct 21 (152 trades, −0.107R, CI wholly below zero,
both halves), on the earlier stop. It stays on the panel labelled with that
record (`MEASURED_LOSING`, `lib/scanner/intradayDisplay.ts`), with no "Trade
this" and no bell, email or push, until a run on the current stop reads
otherwise; presume a translation defect first. Diagnosed the same day (owner:
"if it is a Gann method ... determine how and why we are getting negative
results, and correct it"): the alert fired on plans whose entry was a crossing
still to be made: with price under the entry (the reaction buy 1 point past the
old top), its touch test passed all session, so it bought the first intraday
bar through the top before a daily close 3 points past it gave the indication
(W006 Rule 3(b)-(c)). It now needs the prior session to have closed at or
beyond the entry (a held bottom's entry is that close), so the touch is a
reaction. A crossing closed past the entry but not yet 3 points past it is
refused too: the plan carries `entryAwaitsCrossing` (from
`GannEntryTrigger.held`) in `daily_scans.detail`, `active_monitors.entry_awaits_crossing`
(migration 0104) and the replay's session plan; a stored plan without it is read
on the prior close alone. The hold stays until a run on the fix reads positive.
**Focus list, same day (owner: "take the highly likely, and track those ...
invalidate and replace them").** After the close, `/api/intraday-focus`
(pg_cron 22:00 UTC, migration 0098, applied 2026-10-21) reads the scan universe's daily bars in
batches and stores the stocks primed for the next session
(`lib/scanner/focusList.ts`, table `intraday_focus`): a plan within a day's
range of its entry, a narrow range of 2-13 weeks (at its edge), a reverse
signal day or a wide day on heavy volume, or the close within 3 points of an
old 3-Day Chart top or bottom. Ranked by how many reasons, then dollar volume
(Gann ranks no reason above another). The scheduled intraday scan times the
top `FOCUS_SIZE` with the index funds, crypto and members' watchlists in place
of the fixed single stocks; a name whose daily plan's stop trades through is
invalidated and the next takes its place. Both intraday scans now read bars
in batches (100 symbols a request), not three requests a symbol.
**Session setups, 2026-10-28 (owner: the 15-minute scans "should really be
feeding that data to the intraday scanner"; "takes all 800+ equities ...
takes the highest scoring opportunities or the most executable
opportunities, and then tracks those throughout the day").** The dashboard
chooses (the daily plan), the intraday scanner times it. Both intraday scans
now read `lib/scanner/sessionSetups.ts` first after the funds and crypto:
the latest lists' Execute within a day's range of its entry, then the
overnight sweep's Execute (`universe_sweep`, all ~830 names) the lists have
not since read otherwise, then a Watch at the 7 cutoff within a day's range,
each by score; resting, retired, expired (`detail.planExpired`) and Rejected
rows are left out, and the lists overrule the sweep only once they were written after it. The sweep night is the market scan's own (`chooseSweepBasis`). Up to `SESSION_SETUPS_MAX` (24) on the scheduled scan, then
members' watchlists (so with more than about 21 watched names, some wait for a slot: an accepted trade-off for timing the best setups first; none were watched on 2026-10-28) and the focus list; a person's own refresh with no symbols puts
`SESSION_SETUPS_ON_DEMAND` (9) ahead of the core list. Because the 15-minute
market scan rewrites the lists, a setup that turns ready mid-session joins and
one that breaks leaves. Two reads, under 0.5 ms each in production. A sweep Execute the lists never publish keeps its plan on the sweep row (SUS-21, migration 0130: stop, TP1, MTP, the crossing flag, `invalidated_at`): the intraday scan times it from there (`loadDailyPlans`' `sweepBasis`, intraday scan only; the evening focus list reads none), the session trading through its stop after the row was priced, in the regular session, retires it (`invalidateBrokenSweep`; the focus list's own test now reads the same bars, `barsSincePlan`), and so does the day's market scan re-reading the stock without the plan (`retireOverruledSweepRows`); a retired row also leaves the market scan's first slots. The stop test is the lists' own (`readStopBreach` on closed 15-minute bars, so a poke that closes back past the reclaim line is no break), but a retired sweep row stays retired for the day: a failed break reinstates the plan only where the lists carry it. A plan past TP1 is retired only by the market scan's re-score, so not before 9:50 or when the full pass's deadline cuts it. Gann chose
from the daily charts after the close and timed in the session (*Truth of the
Stock Tape* Ch. XIV; Master Course Ch. 13). Verdicts unchanged.
**Fair slots and the evaluation ledger, same day (owner: "I approve all 5", on
the October 27 coverage report).** On October 27 the scheduled intraday scan
timed 41 of its 50 slots while the focus list's 36 reserves (BA at rank 48)
sat out. Its slots are now shared by `lib/scanner/queue.ts`, superseding the order under "Session setups" above: core whole, then
reserved shares for the session setups (14), discoveries (8), the focus list
including its reserves (12) and members' watchlists (6); setups, then watched
names, past their share take the slots other tiers left unused, and the wheel
always keeps its own 5, rotating through the names waiting from a clock-read
offset (no counter), so each is reached within a few scans. Only discoveries
the market scan reported in the last 35 minutes count (`last_discovery_at`);
discoveries alone never displace the fixed single stocks. Discoveries (`lib/scanner/discovery.ts`:
an old top or bottom crossed or met within 3 points, a new 13-week extreme, a
narrow range broken; one labelled heuristic, a wide range on heavy volume)
are read by the market scan from its coarse daily batch, observed through the
delayed fetch's end, about 0.25 s for the universe; they carry no levels and
only earn a slot to be examined. The evaluation ledger (`evaluation_ledger`,
migration 0129, `lib/ledger/evaluationLedger.ts`) keeps one row per session
and symbol with the first time each stage was reached (pre-filter, shortlist,
discovery, slot, deferrals, first detection with its bar, usable and
evaluation times apart), 400 days, service role only (applied to production
2026-10-28 on the owner's go-ahead); deferrals count once per 15-minute tick in
the regular session; every ledger write runs after the response (`after`),
so no scan waits on it; the owner's recap reads it (`lib/reports/coverage.ts`). `GSPS_EVALUATION_LEDGER=0` turns it off, and
the queue then has no discovery tier. Hindsight data (the recap's movers and
attribution) goes to the owner's two accounts only (`lib/auth/owner.ts`).
Verdicts unchanged.
**100 slots, equities only, 2026-10-29 (owner: "yes, raise the cap"; "SPY
should stay. QQQ and IWM can leave"; "For the moment, only equities should
populate the list").** `QUEUE_CAPACITY` is 100 and every share doubled (setups
28, discoveries 16, focus 24, watched 12, wheel 10; `SESSION_SETUPS_MAX` 48),
engineering figures; 50-symbol scans had returned in about 5-12 s. The crypto
pairs and crypto in any tier take no slot, and SPY is the only index fund in
the core list (QQQ and IWM stay in `WATCHLIST` for their kind). The crypto
pg_cron jobs are paused (`cron.alter_job`, active=false). Verdicts unchanged.
**Nearing the entry, same day (owner: alert "as price is moving towards that
entry level" early enough to sign in and place the order, the lead "determined
by all of the tools [Gann] used to determine how fast price is moving").** Two
notices on a standing daily plan, on `plan_level_held`'s gates (stop not
traded, crossing made, prior close on the plan's side): `entry_approach`, the
minutes left to the entry at the reaction's pace, read as Gann's angle, price
per bar since the reaction's top (`lib/scanner/entryApproach.ts`; the
Three-Dimension Chart that measured speed was never disclosed), with the feed's
lateness taken off; and `entry_reached`, the latest bar at the entry with the
stop held. Notices, not trades (`NOTICE_SIGNALS`, `intradayDisplay.ts`): they
carry the daily plan's levels, offer "Open the plan" (no order rests at a
fixed price: once a closed bar trades into the plan's zone its entry goes at
the market, never-failing rule 9) and never "Trade this", and the replay skips
them. A stock's notices are read in the regular session only, and an
approach only when it would arrive before the close. Notices are live
readings: never stored in the alert tables, never held by the cooldown, and
never counted in Pro's daily bound. Push sends an approach once the time left
is within the member's lead plus one scan
(`notification_preferences.entry_lead_minutes`, migration 0125: 15 by default,
the owner's figure; 5, 10, 30, 60 engineering), once a day per channel
(`signalHashFor`); email never sends a notice (an inbox is too slow for a lead
of minutes); the bell uses the default lead and repeats a notice at most every
12 hours. Unmeasured: nothing replays a notice. User-facing text names no
method. Verdicts unchanged.
**The plan's line ahead, 2026-10-28 (owner, on TXN: up $28 over three sessions
and nothing said until his 5:45 PM scan).** Production records (ET): the
evening list of Oct 26 had TXN at the top of a 21-session narrow range and at an
old top, ranked 42nd, past the slots the session timed; the night's sweep read it
Watch 5 with its line at 301.86; Oct 27 crossed the line and closed 308.96 with
no notice; Oct 28 1:21 AM it read Execute (bell and email). Gann knew the level
the night before and watched the session cross it, buying only after the close
confirmed, on the reaction (W006 p.20, Rules 3(b)-(c); Master Course Ch. 13).
Two pieces: (1) the intraday scan's focus tier now leads with the breakaway
lines, a focus name whose narrow range sits at its edge on the side of the
night's plan and whose line is still ahead of the close by no more than one
3-point allowance (`breakawayLinesFirst`, `lib/scanner/focusList.ts`; nearest
in allowances first, then the longer range, an engineering order; on the night
of Oct 26 there were 13 and TXN was 10th, inside the focus tier's 12); (2) two
notices on any standing plan whose prior close is short of its entry,
`line_approach` and `line_crossed` (`detectLineCrossing`, `intraday.ts`): the
session nearing or trading through the line, with the close that would confirm
it (`crossingLinesFromEntry`, `pointScale.ts`); a plan whose prior close crossed
the entry but not by 3 points (`awaitsCrossing`) reads the confirming close as
its line, and one that has made its crossing gets none. Notices, never trades: no
"Trade this", not stored, push and the bell only, worded as delayed observations
while the feed is delayed. The intraday alerts replay reads them as counts and
excursions only (`lib/backtest/lineNotices.ts`), never as trades; no run on real
bars yet. Verdicts unchanged.
**Before the open, same day (coordinator, from the TXN thread's proposal).**
`/api/pre-open-lines` (pg_cron 12:50 and 13:50 UTC on weekdays, migration 0135;
it acts only from 8:30 to the 9:30 open, New York time, on a trading day) lists
each equity plan whose line the prior close left within one 3-point allowance
(`lib/notifications/preOpenLines.ts`: `planLineAhead`, the allowance
`breakawayLinesFirst` reads, a close through the stop or a resting, expired or
retired row left out). Push (one a member, by their push, score and quiet-hours
settings) and the bell (watchers only), both gated as the line notices are and
once a New York day per symbol and side; never email. Worded as of the prior
close, never actionable (`checkNotificationFreshness`, an observation on the
daily chart). The bell counts it as a notice (`isNoticeTitle`), so it takes none
of Pro's daily bound. Unmeasured. Verdicts unchanged.
**The retest's volume at two-thirds, 2026-10-28 (fork FV2, answered from
Gann).** The volume pillar's retest confirmed on any smaller week, so once
price reached the old turn inside 3 points, noise passed it about half the time
(`replay-diagnosis/2026-10-28-six-year-daily/p8-volume-diagnosis.md`). Gann
names the figure: a double top "on two-thirds the volume" (W006 pp.43-44); the
Master Course's sell at "a third or less" (Ch. 12) lies inside it. So the
retest confirms at two-thirds of the first turn's week or less
(`RETEST_VOLUME_RATIO`, `volumeClimax.ts`), bottoms mirroring tops, live and
replay alike. Rules 1 and 7's secondary rally keeps "smaller", which names no
figure. `STRATEGY_VERSION` was `2026-10-28-retest-two-thirds-volume`; P8,
Execute and the 7/4 cutoffs need a fresh run on it. The share-class rule, the
base-left pillar, Gann's figures at his price and this rule merged together in
the 2026-10-28 midday release (no new rule): `STRATEGY_VERSION` was
`2026-10-28-midday-release`.

**The Rule of Three as a standing trend, 2026-10-28 (six-year daily rerun,
`replay-diagnosis/2026-10-28-six-year-daily/COMBINED.md`: within Execute,
trades passing `ruleOfThree` did 0.103R worse than trades failing it).** One
translation defect, fixed: the check passed only on the day a run of three
closes printed (three up closes in a row for a long), the move a reaction entry
waits out, and failed through every one- or two-day reaction of a trend the
rule still called up. Gann's third close reverses the trend "at least
temporarily" and the trend stands until the opposite third close (*Stock
Selector* p.72; U.S. Steel 1929 "at no time closed 3 consecutive days with
losses" until the top, Ch. VI p.125). `computeRuleOfThree` now returns `trend`,
the side of the latest run of three, and the check passes when the daily rule
reads the trade's side and neither the weekly nor the monthly rule reads against
it (the higher charts govern, never-failing rule 5; how the three combine is an
engineering choice, labelled: as standing trends, "any one" passes about 87% of
random-walk readings). The weekly and monthly context factors read the same.
Random walks (200 a drift, longs/shorts): no drift 13.1/18.8%, +0.05% a day
21.0/11.5%, +0.1% a day 29.4/6.9%; the old reading passed about 12% either way
whatever the drift. The cards' streak lines are unchanged. `STRATEGY_VERSION`
was `2026-10-28-three-closes-trend`; P2, Execute and the 7/4 cutoffs need a
fresh run on it.
**Reading that run's factor table, same day.** Its deltas are within Execute
only (the slices' logs kept no all-trade table), so they are conditioned on a 7+
score, and at about 2,100 trades with a spread near 1.4R a pass/fail delta has a
standard error near 0.06R: every listed inversion (Rule of Three −0.103, angles
−0.078, range divisions −0.058, relative strength and time −0.050, the square
−0.045, the indication −0.041) sits inside about two of them. They are leads,
not findings; a future run should keep the all-trade factor table. The Rule of
Three fix stands on Gann's text, not the delta. **P6's origin, same day:** the
monthly 45° is drawn from the latest monthly swing bottom (top, short) that has
held `MONTHLY_ORIGIN_HELD_MONTHS` (3) closed months with no later month 3 points
through it (`monthlyAngleOrigin`, `lib/scoring/pillars.ts`; Master Course Ch. 4,
GA-25 to GA-27: a higher bottom is an origin "only once the market has
held/advanced 3-4 months from it", retired "when exceeded by 3 points"; GA-9 the
same for tops); it read the latest pivot however young. Random walks (20 a
price, long/short): no drift $150 46.6/55.4 → 44.0/55.0%, $500 56.8/64.4 →
52.8/58.6%; +0.05% a day $500 73.8/36.8 → 69.8/32.8%. "3-4 months" read as 3 is
an engineering choice, labelled. `STRATEGY_VERSION` was
`2026-10-28-three-closes-angle-origin`; P6, Execute and the 7/4 cutoffs need a
fresh run on it. Merged onto the delayed fill timing (no new rule):
`STRATEGY_VERSION` was `2026-10-28-angle-origin-on-delayed-fill`.

**P3's leaders may lead, 2026-10-29 (six-year daily diagnosis,
`/mnt/project-files/replay-diagnosis/2026-10-28-six-year-daily/EDGE-DIAGNOSIS.md`:
Execute did worse than Watch, scores 8 and 9 worst, and within Execute
`lateMoverLong` passing measured −0.204R, a lead at about two and a half
standard errors).** Three fixes, each from Gann's text. (1) G25 (*Wall Street
Stock Selector* Ch. VII): "a stock must cross the high of the first year of the
bull campaign before it can lead a later section", so a long's leadership and
rank count, in P3 and in the lists' order (`selectionStrength`), only when
`longMayLead` (`lib/gann/leadership.ts`): not short of that high once the
campaign has run a year. APPROXIMATED: the campaign is the stock's own weekly
campaign, not the market's. (2) That high is crossed by the 3-point allowance
and held unless broken back by 3 (`campaignLedger.ts`; Jewel Tea, W006 Rule
3(c)); it read the latest close with no allowance. (3) First and late tops and
bottoms (`readLeadership`) read an extreme at a 3-Day Chart pivot on the whole
record as dated, one made after the chart's last pivot, not yet turned on and not rallied away from, as "not yet" (a stock
that turned while the market still makes new lows bottomed first; a stock still
making new lows is not read as late, since it has not bottomed), and any other
as unread: a market that rose all year has its lowest bar at the window's
start, no bottom, and every stock read as a late mover against it. A late mover
is not refused: Gann describes late movers without forbidding them, and
A-SELECTION-02 counts crossing previous years' tops first as leading. The market
scan's shortlist now reads the ledger too, as the full scan does. Random walks
(30 pairs, 630 readings a drift; drift 0, +0.05%, +0.1% a day): late movers
25.9/26.7/22.9%, early 42.7/34.3/29.8% (the review measured late 20/23/45%
before (3)); the first-year high
unread on 97-100% (the stock's campaign rarely runs a year), failed on 0-1.6%;
about 0.2 ms a read. `STRATEGY_VERSION` was `2026-10-29-gann-p3-may-lead`;
released with the section hold above as
`2026-10-29-gann-early-sections-and-leaders` (no new rule), which the six-year
rerun measures.

**Trade with the averages, 2026-10-29 (six-year rerun's long/short diagnosis,
`/mnt/project-files/replay-diagnosis/2026-10-29-six-year-rerun/LONGS-VS-SHORTS.md`:
longs bought in the four selloff windows lost 1,189R, more than the whole run's
1,165R, while shorts won in every window).** One translation defect, fixed: P1's
market leg read SPY with `readGannTrend`, whose 3-Day stepping test (an
engineering choice) read "no trend" on 78% of 2022's sessions and 88% of the 2025
decline, so the market's trend never acted on a long. Gann: "determine the
averages' trend with the 3-Day Chart and the 9-Point Swing Chart; trade stocks
that conform" (*45 Years in Wall Street*, 1949, Rule 1, p. 6), and "don't buck
the trend" (the never-failing rules, p. 15). Weighed against the *New Stock Trend
Detector* (1936, Ch. IV: don't trade from the averages; late movers top after
them): the hold never takes a side from the averages, and the 1949 book is the
later one. Now (`lib/gann/averagesTrend.ts`): an Execute is held to Watch when
SPY's 3-Day and weekly charts both read against it, shorts mirrored
(`applyMarketTrendHold`); when they disagree (a reaction in the main trend, Master
Course p. 10's buy) the stock's charts decide. P1's market leg reads the weekly
chart, the main trend. Read once in `readPillarFacts` (`PillarFacts.averages`),
live and replay alike; the intraday alerts read the same SPY bars
(`getMarketDailyBars`) and show an alert both charts run against for study only
(`againstMarketTrend`, `tradeHold`), and the alert replay enters none
(`marketDailyBars`). Crypto reads no averages. Stated exception: the intraday
profile replay (`replayIntraday.ts`) reads neither the daily nor the market
trend, as before. Random walks (40 a drift, 2,000 readings), long held / short
held: drift −0.1% a day 67/22%, 0 42/44%, +0.1% 19/69%; about 0.1 ms a read.
The charts walk the year before the last session read (`AVERAGES_WINDOW_DAYS`,
an engineering choice), so the live scan's 400 days and a replay's whole run read
the same span.
`STRATEGY_VERSION` was `2026-10-29-gann-averages-trend`.
**Taken out the same day, and shorts held on the main trend (owner: "Correct",
on the rerun, `/mnt/project-files/replay-diagnosis/2026-10-29-averages-trend-rerun/FINDINGS.md`).**
The hold above measured worse: Execute −0.081R [−0.140, −0.021] (n 1,304)
against −0.055R before. Over all 63,678 trades, longs made +0.036R and shorts
lost −0.079R (−2,381R), and the hold held the best longs (+0.101R with both of
SPY's charts down) and passed the worst shorts; both charts turn only once most
of a decline is done. So the hold is gone (live scan, replay, intraday alerts
and their replay; the intraday scan no longer reads SPY), and P1's market leg
still reads the averages' weekly chart. In its place, Gann's own rule for the
short: the monthly chart decides the main trend (Master Course GA-2/3), and he
does not sell short while it is up (Ch. 1, 1954, Vanadium: "don't short since
main trend still up"; Sell 3 is the secondary rally after it turns). A short
Execute is held to Watch unless the stock's own monthly swing chart, on closed
months, reads its main trend down (`applyMainTrendHold`, `lib/gann/mainTrend.ts`:
months counted "without breaking the previous month's low or high",
*Commodities* pp. 102-103; the turn on breaking the point the last run-up
began, NSTD pp. 19-20), live and replay alike through `PillarFacts.mainTrend`.
An unread trend (under 6 closed months) holds the short. Longs are not
mirrored: Gann buys the double bottom before the monthly chart turns (W006 Rule
1). The intraday alerts flag a sale before the turn for study only
(`againstMainTrend`), read from their prior daily bars, about 14 months, a
shorter record than the daily scan's (labelled), and their replay enters none.
The core replay profile shares the helper. Random walks (200 a drift, 2,600
readings of 24-120 closed months, about 8% a month): the main trend reads down,
so a short may pass, on 78.8% at −1% a month, 54.8% with no drift and 28.6% at
+1%; about 0.01 ms a read.
`STRATEGY_VERSION` is `2026-10-29-gann-main-trend-shorts`; Execute and the 7/4
cutoffs need a fresh run on it.

**The bare core, 2026-10-29 (owner: "let's rebuild from the core"; the six-year
daily run of the full rule stack, `/mnt/project-files/replay-diagnosis/2026-10-29-averages-trend-rerun/`,
showed no edge).** A separate replay strategy, `profile: "core"`
(`lib/backtest/replayCore.ts`, daily bars only), with only Gann's core from *New
Stock Trend Detector* (W006 pp.19-23, Rules 2-6): the main trend from the stock's
own monthly chart (`readMonthlyMainTrend`, `lib/gann/mainTrend.ts`, the one
reading the live short hold uses: the monthly swing chart on completed months,
turned by crossing its last swing top or breaking the point the last run-up
started from, with no 3-point margin since Gann's text names none for the turn), the crossing of an old
weekly-chart top by 3 points bought on the reaction to it plus 1 point, the 2-3
week reaction bought once it holds 2 days, shorts by the mirror rules only in a
monthly downtrend, 3-point stops, the stop trailed under each new weekly swing
bottom, out when the main trend turns, and pyramid adds (`PYRAMID_LOTS`,
`wholeLineStop`). Measured per campaign: each trade's `rMultiple` is the whole
line in the first lot's risk, `rFirstLot` beside it, and the report's `core`
block splits them (`summariseCore`). Rules come back one at a time through
`CoreReplayOptions.rules` ("gate" or "tag"), the "Prove each Gann rule one at a
time" thread's ladder. The production method (`replay.ts`, the live scan) is
unchanged, so `STRATEGY_VERSION` stays. Engineering choices are labelled in the
module header.

**The Intraday style, 2026-10-22 (owner: "The goal is to get AND out in a
matter of seconds, mins, or hours. And ideally closed by the end of the day
(although not mandatory)").** Swing and Fast both hold for days or weeks, and
"Trade this" on an intraday alert opened the ticket on the daily plan's levels,
not the alert's. Now the link carries the alert's own stop, first target and
MTP (`intradayTradeHref`; the MTP since the same day, sold at by nothing), and
the ticket opens on them as a market entry, labelled Intraday (`TRADE_STYLES.intraday`; it is the trade's source,
`orders.intraday_sourced`, not a picked preference). Once filled, the paper and
live exit managers walk it on the session's bars with the intraday replay's own
rules, now one module (`lib/gann/intradayExit.ts`), on regular-session bars
only for a US equity (pre- and post-market prints never move the stop): nothing
sold at the first target (Gann's "never fix a target price", as Q14 runs a daily
trade; the review of #439 answered it from Gann), the stop one intraday point
beyond each completed 15-minute swing (the Overnight Chart's 1-point stops, Master Course Ch. 3), out
when the hourly chart turns (Ch. 13, "the first change in trend"), and no
reversal or re-buy at the daily geometry. The trade closes from 3:45 PM New
York time (12:45 PM on an NYSE early close, `calendar.ts#isEarlyClose`), or at
the first pass after a close it outlived, decided from the clock even when the
bars can't be read, unless the trader ticks off the close (`orders.hold_overnight`, migration 0105): the owner's
choice, not Gann's, who never closed a trade because a session ended. Crypto has
no session and is never closed for it. The replay measures the style with
`?profile=intraday&sessionClose=1&scaleOut=0` (both off by default, so the
pre-registered run keeps its 60% at the first target and its 10-session hold).
Amended the same day, for parity with the live alerts and exits: a US equity's
profile reads regular-session bars only, entries, hourly chart and exits alike
(it read every pre- and post-market print before), and its hourly exit is the
first turn after the fill, which equals the old rule for a trade entered with
the hourly trend (`docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md` §5.2). An
intraday entry without a stop is refused as every new position is
(`stop_required`, A-STOP-01), and the ticket places one only with its stop and
first target, since its exits and its close live on that exit row. The live order row now records `intraday_sourced` too, as the
paper row did. The ticket says intraday has no measured record; nothing
automated trades it. Verdicts and the daily replay are unchanged, so
`STRATEGY_VERSION` stays.

**Email only for what needs the member, 2026-10-28 (owner, item 6: "send only
the most pertinent notifications via email….everything else should be a
mobile/in platform notification"; "Yes" to the plan).** Measured first: the
provider refused sends once about 200 had gone out in a UTC day (10-23, 10-26),
and intraday signals were about 90% of them. Intraday signals and entry notices
now go by push and the bell only (#502). Email keeps a member's own positions
and orders, a tracked symbol turning Execute (once a New York day,
`executeEmailedToday`), a broken plan only on a symbol they hold (`holdsSymbol`;
otherwise push and the bell), price alerts only when no push went out, the
evening digest (it now lists the day's intraday signals from the bell,
`lib/notifications/digestSignals.ts`, and goes on a day with signals even
without a closed trade), and the owner and ops reports. Every member email takes
a slot of a daily budget first (`lib/notifications/email-budget.ts`, migration
0126: 80 for alerts and digests, 95 for own trades and ops, UTC day, fails
open); over it the send is skipped and the bell keeps the notice. The bell
points a member without push on that device to the switch. A new email sender
calls `emailBudgetHold` with its kind. **Capacity, 2026-10-29:** the digest has
its own lower ceiling (60, under the alerts' 80 and own trades' 95), goes out
in a day-shuffled order (`dayRotation`), and a member whose digest email did
not go gets a "Summary" bell row and push instead. A member's own trade notices
(an order cancelled for a broken plan, a live loss threshold) are written to the
bell as "Your trade" and pushed whatever the email does
(`lib/notifications/keyNotice.ts`, migration 0139), so no key notice depends on
email alone. A new email-only notice must call `deliverKeyNotice` too.
October's overage was the per-member intraday emails, since moved off email:
10-23 and 10-26 sent 212 each before the provider refused more.

**Intraday audit fixes, 2026-10-28 (`/mnt/project-files/gann-alignment-audit/intraday-alerts-replay.md`).**
An intraday alert against the daily swing chart's trend is shown for study and
labelled so, never offered as a trade, written to the bell or entered by the
intraday replay (`againstDailyTrend`, `tradeHold` in
`lib/scanner/intradayDisplay.ts`; never-failing rule 5). The alert's confidence
is the share of its checks met, with no hand-set weights (Gann ranks no check
above another, "The scorecard's role"), and the unused `minMovePct` is gone.
The replay's reversal chain ran at most 3 deep; it now runs as NSTD Rule 6
(p.48) keeps with the trend, until three losses in a row pause it, as
placement's `lossSeriesRefusal` does live (`LOSS_SERIES_LENGTH`). The twice-yearly
rest reminder now comes back with a new entry placed in its window, as the
away reminder does (`closeOutNotice`, `lib/trade/away-notice.ts`; *Truth of
the Stock Tape* Ch. VII pp. 22-25). `STRATEGY_VERSION` was
`2026-10-28-intraday-audit-on-angle-origin` (built alone as `2026-10-28-intraday-audit-fixes`, merged onto the Rule of Three trend and angle origin with no new rule); daily verdicts are unchanged. The same
audit's trade, automation and lifecycle walk
(`gann-alignment-audit/trade-automation-lifecycle.md`) moved three more:
`equitySession` ends an NYSE early close's regular session at 1:00 PM (it read
4:00 PM), the options ticket charges about ten days of time decay, the
measured hold on Gann's exits, not the half day of the retired bar-pattern
trigger (`TYPICAL_HOLDING_DAYS`), and the portfolio manager's risk dial is
labelled the member's choice under Gann's tenth.

**Stops inside one point and the recap's scoring, 2026-10-29 (owner: the overnight recap "showed a lot of negative results"; diagnosis `/mnt/project-files/overnight-email-losses/2026-10-28-recap-diagnosis.md`).** An intraday alert whose stop sits less than one intraday point from its price (`Alert.riskUnderPoint`, `buildAlert`) is held from trade by `tradeHold`, so the panel, setup card, chart plan, bell and push never offer it, and the intraday alerts replay skips it as it skips an against-trend alert (its fill-time `risk_under_point` refusal stays): Gann's stop stands his allowance beyond the level (W006 pp. 20, 46-47). On Oct 28, 18 signals with stops within 0.2% of price lost 15 of 18. A reversal-risk warning's bell and push carry no stop or target (it is a stand-aside warning). The evening recap scores only what the platform offers as a trade: warnings, panel rows held or unpaid, reads before the session, no target, and fills through the stop or past TP1 are listed, not scored. Intraday alerts replay trades move; daily verdicts and `STRATEGY_VERSION` don't.

**Daily swing signals are not intraday trades, 2026-10-29 (owner, on META: entry 623.56, stop 604.21, TP1 676.63, "Is meta primed for that move?").** The "Daily swing turned" alert (`overnight_turn`) is Gann's Overnight Chart (Master Course Ch. 3), a daily swing chart held overnight; its stop 1 point beyond the last daily bottom is daily-scale (median 3.1% of price over Oct 21-29, the session signals 0.3-0.6%), so "pays more than the risk" (M-K5) put its TP1 at an old daily level (median 3.9%, the top tenth past 10.6%), offered as an Intraday trade closed at 3:45 PM. As a swing it is the Overnight method, measured and never placed. `DAILY_SCALE_SIGNALS` (`lib/scanner/intradayDisplay.ts`) holds it in `tradeHold`, so the panel, card, chart plan, bell, push and recap show it for study only, and the intraday alerts replay enters it only when a run names it in `signals`. The target code is unchanged. Daily verdicts and `STRATEGY_VERSION` don't move. **Out of the live scan entirely, same day (owner: "Only intraday scans should populate the intraday card(s)"):** `ScannerConfig.dailyScaleSignals` is off for the live scan, so `scanIntraday` never reads the daily swing turn and it reaches no panel, card, chart, bell, push, stored row or recap; today's stored rows are skipped on the panel's list (`loadRecentSystemAlerts`). The intraday alerts replay turns it on only for a run that names it in `signals`. **The card leads with the chart's alert, same day (owner, on FAST: the card showed the held daily swing signal, stop 49.69, while the chart drew the session's trend continuation, stop 52.00, TP1 52.92, MTP 54.56; "I like the charts setup"):** one choice, `leadAlert` (`lib/setups/intraday.ts`): an alert that offers a trade (`alertOffersTrade`: not held, not a notice or reversal risk, a stop and a TP1 that pays the risk) leads, then confidence. The card, its "Trade this", the chart, the ticket's session plan and the position form read it, fresh or stored; when the lead offers no trade, nothing draws levels. Display only.

**Evening reports, 2026-10-28 (owner: "Start sending the evening focus list as
well as the daily recap ... for now, desire to run tests").** `/api/evening-report`
(pg_cron 01:45 and 02:45 UTC Tue-Sat, migration 0123) emails the owner only
(`OWNER_REPORT_EMAILS`, default his two addresses) once the evening scan has
stored the session's plans: the next session's focus list with every Execute in
plain English (entry, stop, take profits) and why each other name is listed,
and the recap of the session just closed: top movers by dollars, percent and
price-scaled points, each setup shown that day judged by placement's own entry
rule (`confirmationFromBars`, filled at the next bar's open) on the session's
15-minute bars, and each intraday signal judged from the first time it reached
each member (`lib/reports/eveningReport.ts`). Misses and losses stay in; one
session is never presented as a record. Widen the recipients only on the owner's
word.

## Polarity audit: a genuine second pole for Novice/Pro, not a subtracted one (2026-09-23, project owner direction)

The novice/expert interface worked example in the Three-question mandate
section above names **Polarity** — two poles of the same spectrum held
together in one coherent design, neither diluting the other. The project
owner's own correction, from personal experience: a shorter feature list is
not a second pole. Expert/Wall Street having real depth (Strategy Modes,
exact score precision, backtesting) and Novice/Pro having a capped version
of the same list is subtraction, not design. This section records a
platform-wide audit for that pattern and what came of it.

**Three-question mandate, applied to this audit itself** (not retrofitted —
this is what shaped which findings below got built vs. flagged):

1. **Gann sourcing:** N/A for the audit itself — this is an access/UX design
   question, not a market-technique one. Individual findings below cite Gann
   sourcing where relevant (none did).
2. **Dewey/cycle theory:** N/A — no periodicity or recurrence claim.
3. **Hermetic principle:** **Polarity**, per the worked example above, read
   together with **Cause and Effect** for the specific fix this audit built
   (see "Trade Reviews" below) — pairing a trade's own criteria (cause) with
   its own outcome (effect) is a direct expression of that second principle,
   not just Polarity's "give the low tier its own thing."

**Findings, surface by surface** (full survey conducted 2026-09-23):

1. **Backtest attribution (`lib/backtest/attribution.ts`) — real gap,
   fixed.** Per-factor attribution is reachable only through backtesting,
   `backtestingEnabled: true` for Wall Street alone (`lib/entitlements/policy.ts`).
   No comment anywhere acknowledged a Novice/Pro/Expert equivalent — it was
   simply absent for three of four tiers. **Fixed**: `lib/lifecycle/review.ts`'s
   `buildPostCloseReview` (which already existed, already had an API route at
   `/api/trade-plans/[planId]/review`, and had **no UI consumer anywhere** —
   itself a "not existing everywhere it applies is equal to not existing
   anywhere" case) now also carries the plan's Rules Alignment breakdown
   (`lib/signals/scoring.ts`'s per-criterion evidence, already persisted on
   every `trade_plans` row via the `alignment` evidence field — no migration
   needed). A new list endpoint (`/api/trade-plans/reviews`) and UI panel
   (`components/portfolio/trade-reviews.tsx`, "Trade Reviews" on the
   Portfolio page) render it for every tier. This is deliberately **not** a
   diluted copy of backtest attribution: one trade's own cause and effect,
   no cross-symbol win rate, expectancy, or profit factor — those claims
   stay backtesting's own, still gated as before. The distinction is the
   point, not a compromise.
2. **Order ticket Strategy Mode area — real gap, fixed.** Pro's four-mode
   subset already carried a stated rationale (`lib/entitlements/policy.ts`);
   Novice's `[]` (no modes at all) had none beyond "consistent with every
   other advanced capability being withheld" — a bare exclusion where a
   selector renders for every other tier. **Fixed**: `components/trade/order-ticket.tsx`
   now renders a short explainer in that exact space for Novice/Pro without
   modes, naming what GSPS prices every plan from instead, rather than
   leaving a blank space where a control used to be.
3. **Chart complexity (`components/chart/candles.tsx`) — not yet a gap,
   flagged for whoever gates it.** Overlays are currently ungated for every
   tier, by explicit standing project-owner direction recorded in that
   file's own comment. Nothing to fix today, but the recorded *intent* is to
   eventually withhold PSAR/Supertrend from lower tiers with no companion
   plan for what Novice/Pro's chart should look like instead. Flagged here
   so that future gating work doesn't repeat the subtraction pattern this
   audit exists to catch — design the simplified counterpart in the same
   change that adds the gate, not after.
4. **Dashboard/setup-card display — investigated, no gap found.** The plain
   results table (`components/scan/results-table.tsx`) is the same shape at
   every tier (row count and score precision differ, nothing else) — but
   Guided Mode (`components/guided/guided-card.tsx`, `/guided`) is already
   the real teaching-oriented counterpart, already nav-prominent as "the
   novice's primary path" (`components/app/nav.tsx`'s own comment). This is
   Polarity done correctly, already in place — no action needed.
5. **Scoring precision (`lib/scoring/display.ts`) — investigated, no gap
   found.** Already a deliberately-designed second pole with its own
   in-code rationale (rounding to the half-point rather than a raw decimal
   for Novice/Pro), not a subtraction. Recorded here as the positive
   precedent this audit's other fixes followed.
6. **GSPS School curriculum (`lib/school/curriculum.ts`) — investigated, no
   gap found.** Genuinely tier-differentiated content (Foundations for
   Novice, advisory-only Academies 4-7 for Pro/Expert, a required capstone
   for Wall Street) rather than one curriculum stripped down. No new
   curriculum content was written for this pass — see the note below on
   what would be reused if it ever is.
7. **Watch → Execute alerts / monitoring — investigated, accepted as
   quantitative-only.** No qualitative depth difference exists between
   tiers here, only capacity numbers (`maxActiveWatchMonitors`, etc.). Not
   flagged as a gap: a monitor slot is a resource ceiling, not a taught
   skill, so there is no "shallow-but-designed" counterpart for it to be
   missing in the way there was for attribution or the order ticket.

**Content-reuse constraint that applies to any future curriculum work
building on this audit** (project owner direction, 2026-09-23): if new
GSPS School content is ever written to plug a Polarity gap, it must teach
the underlying premise of a technique without reproducing another
practitioner's specific words, methods, or published observations verbatim
— consistent with the numerology/astrology citation discipline elsewhere in
this file (a technique's *rule* can be taught; someone else's specific
proprietary expression of it cannot be lifted). No new curriculum content
was written in this pass, so this constraint did not need to be exercised
here — it's recorded for the session that first does.

## Temporary overrides — mandatory, check on every session

These are explicit, user-directed departures from the protocol's real design, made for a stated
reason and with a stated revert trigger. Read this section every session. When a trigger fires,
raise it with the user before doing anything else with the affected code — don't silently carry an
override past the point it was supposed to end.

### Equity data delay and notification freshness (2026-10-28, until real-time data is bought)

Owner directives DATA-DELAY-001 and NOTIFY-FRESHNESS-001. Full record and coverage matrix:
`docs/DATA_DELAY_AND_FRESHNESS.md`.

- **Time contract.** `lib/data/timeliness.ts` holds the one definition:
  - a bar's close (the provider stamps the open);
  - usable = max(close + the feed's delay, receipt);
  - a decision reads only what was usable at its evaluation clock;
  - an order fills at the first bar opening at or after the decision.
- **Where it is wired.**
  - The intraday scan filters its input (`usableInput`).
  - Placement and arming read only bars past the delay.
  - The replays fill late and refuse a fill whose stop traded first (`STRATEGY_VERSION` was `2026-10-28-delayed-fill-timing`; merged onto the midday release as `2026-10-28-delayed-fill-on-midday-release`, no new rule).
- **Notifications.**
  - The bell and push read `checkAlertFreshness` at the dispatch clock: actionable, informational or suppressed.
  - Only actionable wording may say "now" or give an arrival time.
  - Queued setup deliveries re-read the member's monitor (`supersededHold`).
  - A new notification path must call the same check.
- **Revert trigger: a verified real-time feed.**
  - It needs both `MARKET_DATA_REALTIME=true` and `MARKET_DATA_REALTIME_VERIFIED_AT`, set by an operator after checking a live trade arrives within seconds.
  - The flag alone reads as delayed.
  - Never set either without the owner's go-ahead.
  - Replays keep the contract's delay whatever the environment.

### Execution timeframe — reverted to 15Min early (2026-09-09 through 2026-09-17)

**Resolved 2026-09-17, project owner direction — reverted early, not via its own trigger.**
`EXECUTION_TIMEFRAME` in `lib/timeframe.ts` was temporarily forced to `"1Hour"` (2026-09-09) instead
of the protocol's real design of `"15Min"`, specifically because the free Alpaca feed's ~15-minute
equity delay makes a 15-minute bar's lag ratio exactly 1.0 — tripping `applyDataLagHold`
(`lib/data/latency.ts`) and holding *every* equity Execute verdict to Watch whenever the market is
open, so a `trade_plan` could never reach `armed` and the Automated Portfolio Manager could never
place a trade. That override's own stated revert trigger was `MARKET_DATA_REALTIME=true` (a paid
real-time feed). **That trigger never fired.** The override was reverted anyway, on the free delayed
feed, because its cost turned out to be worse than the starvation it was solving: setups armed on a
stale 1-hour-delayed bar were arriving with the move already largely played out — see the
2026-09-17 HBAN case (entry $16.77, price already at $15.66, through TP1, by the time the setup
rendered). The project owner's call: a thin-to-empty equity Execute bucket on 15Min (crypto
unaffected — `feedDelayMs` is always 0 for crypto) is an acceptable, understood cost; systematically
stale triggers are not, especially on a novice-facing platform. See `lib/timeframe.ts`'s own header
comment on `EXECUTION_TIMEFRAME` for the full detail — this entry is the historical record, that one
is the live rule.

No new override or revert trigger is standing in its place. If the equity Execute bucket proves too
thin to be useful before real-time data lands, that is a discussion to have with the project owner,
not a reason to silently re-widen `EXECUTION_TIMEFRAME` again — that was tried once already.

### Execute collapse stopgap — RESOLVED 2026-09-23

**Closed, not merely reverted.** The threshold half of this stopgap (`EXECUTE_SCORE_THRESHOLD`
6, `WATCH_SCORE_THRESHOLD` 3.5, `lib/scoring/weights.ts`) was a deliberate, temporary loosening
from the protocol's original 7/4 pair, made 2026-09-14 after all nine scored criteria were
replaced with specific, individually rare Gann technical events and the old bar admitted 0/1061
Execute trades on the committed run and 0 in production. Its own stated revert trigger — the next
fresh, committed backtest run with a non-trivial Execute bucket (n≥30) — fired 2026-09-23 on
`docs/replay-runs/2026-09-23-15Min-2R-within-all-12sym.json` (12-symbol universe, 615
unconditioned trades, captured after PR #274 fixed a replay-only wiring bug that had been zeroing
`entryTriggerArmed`). Execute bucket: 41 trades, +0.362R expectancy, 36.6% win rate, PF 1.87. A
supplementary per-score-band sweep of the same population confirmed the real zero-crossing sits
almost exactly at the existing 6-point cutoff (negative through score 4, turning positive at 5–6).
Re-deriving from this data does not move either number — it confirms them as the platform's actual
thresholds, not a stopgap. `lib/scoring/weights.ts`'s own comment on `EXECUTE_SCORE_THRESHOLD`
carries the full detail now; this entry is the historical record. **Caveat added 2026-09-25:** that run
predates the F3.1–F3.3 replay fix (see "Platform-wide alignment audit"). It
measured the old 15-minute STRAT-candidate trigger, not production's, so
this confirmation needs re-deriving from a fresh run on
`STRATEGY_VERSION` `2026-09-26-continuation-replay` or later.

The two band loosenings (`VOLUME_CLIMAX_THRESHOLD`, `SQUARE_TOLERANCE_BARS`) were already resolved
earlier (reverted and superseded respectively, both same-day 2026-09-14) and the weight-rebalance
half was settled on principle 2026-09-16 (see `DEFAULT_CRITERION_WEIGHTS`'s own doc comment) — all
now confirmed rather than merely carried forward, per the 2026-09-23 run above: `volumeClimax`
273/615 (44.4%) passing, Δ+0.645R; `timePriceSquare` 130/615 (21.1%) passing, Δ+0.111R (positive
for the first time since the ATR-normalization fix). See `lib/gann/volumeClimax.ts` and
`lib/gann/timePriceSquare.ts`'s own header comments.

**Settled 2026-10-28: the `stopRoom` question.** The open item this run raised (quarantined for
saturating 98–99% on the 2026-09-14 runs, in range on the 2026-09-23 run) is moot. `stopRoom` was
retired on 2026-10-16 (owner Q23) and replaced by Gann's own test, the stop 3 points beyond an old
top or bottom (`stopBehindOldLevel`, W006 pp.20-24, 46-47). That test is a check under the nine
pillars, scoring nothing alone. Its registry entry (`criteria-registry.ts`) records it as unmeasured.

**Live weights incident (2026-09-17) — merging is not shipping.** PR #235 merged the uniform
`DEFAULT_CRITERION_WEIGHTS` decision to `main` and deployed clean, and the change was still
**inert in production**. The project owner reported a score of `4.48` on the live site, which is
impossible under uniform weights — every scored criterion is worth exactly one point, so a score
can only be a whole number. `lib/scoring/active-weights.ts` prefers a `learning_models` row
promoted to `status = 'live'` over the code constant, and one had been promoted on 2026-09-16
carrying the very hand-set distribution PR #235 existed to repudiate. `4.48` reconciles exactly
against that row's ten-criterion parse. Three separate things went wrong and each is worth naming:

- **A database row silently outranked the repo.** The decision was merged, deployed and guarded
  by a test, and none of that reached the scan. Code review cannot see this surface.
- **The guard test only covered the constant.** `lib/__tests__/default-weights.test.ts` asserted
  the code default was uniform, which was true and irrelevant. A green test was read as evidence
  about production.
- **The row was already stale, and was being reshaped rather than rejected.** It was proposed
  against ten criteria including `adxTrendStrength`; when that criterion was discarded hours
  later, `parseCriterionWeights` dropped the unknown key and renormalised the remaining nine into
  a distribution nobody had proposed, measured or approved — well-formed, and indistinguishable
  at the call site from one that had been.

Fixed 2026-09-17: the row was demoted to `deprecated` (no live `score_adjustment` row exists
today), `isWeightSetAddressedToCurrentCriteria` in `lib/scoring/active-weights.ts` now rejects and
warns on any stored set whose key set does not match `CRITERION_KEYS` exactly, and
`lib/scoring/__tests__/active-weights.test.ts` guards that path with the real offending row as a
fixture.

**The general rule this yields — check the configuration surface, not just the code.** The
"Cross-platform consistency" principle at the top of this file says a concept must exist on every
surface it applies to. Runtime configuration is one of those surfaces, and it is the one a diff
cannot show you. Before reporting any constant, threshold, weight or flag as live, check whether
something outside the repo overrides it. Known override surfaces as of 2026-09-17:

- `learning_models` (`status = 'live'`) — overrides `DEFAULT_CRITERION_WEIGHTS` via
  `lib/scoring/active-weights.ts`. Guarded as above.
- `lib/risk/policy.ts` — `getRiskPolicy(supabase)` / `setRiskPolicyValue()` resolve risk policy
  from the database over `DEFAULT_RISK_POLICY_VALUES`. A row may only tighten a limit (Q13). Production
  held no `policy_values` row on 2026-10-28.
- Environment variables — the confluence modules read `GSPS_DISABLE_GANN_CONFLUENCE` /
  `GSPS_DISABLE_SARA_CONFLUENCE` (`lib/signals/confluence/flags.ts`), and `MARKET_DATA_REALTIME`
  carries a mandatory revert trigger above. Checked 2026-10-28 against the Vercel project's env list:
  none of the three is set in any environment, so both confluence modules run and the feed reads as
  delayed, as the code defaults intend. `learning_models` held no `live` row the same day.

The list is a starting point, not an inventory. Re-derive it rather than trusting it.

## Speed is a product requirement, not a platform ceiling — standing direction (2026-09-25, project owner)

Recorded here because it has had to be restated four times. The 60-second
budget that runs through this codebase (`maxDuration = 60` in
`app/api/market-scan/route.ts`, `FULL_UNIVERSE_TOP`,
`CONTINUATION_DEADLINE_MS`, `YEAR_CYCLE_RERANK_DEADLINE_MS`) is **a
self-imposed limit**, set so a novice feels safe using the product. If the
flagship scan feels slow, prospective users draw negative conclusions about
the whole platform, and that is the outcome to avoid.

What that means for a session:

- **Do not describe the budget as "Vercel's limit"** or treat it as a
  constraint to engineer around. It is a design decision about how the
  product should feel.
- **Do not solve latency by raising the budget.** Raising `maxDuration` or a
  deadline to make room for new work spends exactly what the budget exists to
  protect. New work fits inside it, or it runs off the user's path.
- **Every change that adds time to a scan says how much**, measured, not
  estimated (the `[market-scan]` `mark()` breadcrumbs exist for this), and
  says whether a user waits on it.

## Deployment (Vercel)

- The project runs on the **Vercel Hobby (free) plan**. Cron jobs are capped at **2 per project**, each running **no more than once a day**. Before adding a new scheduled job, confirm the total stays at or under that cap — see `docs/THIRD_PARTY_LIMITS.md`. If something needs to run more often than daily, it does not belong in `vercel.json` crons; trigger it from an external scheduler instead.
- `vercel.json` sets `"git": {"deploymentEnabled": {"main": true, "*": false, "*/**": false}}`: **only `main` builds**, and **merging to `main` deploys straight to production**. Pushing any other branch builds nothing and gets no preview URL (owner, 2026-10-16: previews were using up the Hobby plan's daily deployment limit, which failed every PR's Vercel check). The patterns are minimatch globs, and `*` never matches a `/`, so until 2026-10-21 every `claude/...` branch still built a preview and the account hit 100 deployments that day; `*/**` covers them. There is no manual gate in between. Treat a merge as a release: it is live for users within a couple of minutes.
- **Never trigger a Vercel deployment unless explicitly asked.** The user will say which environment — preview or production — when they want one. Don't assume. Because merges auto-deploy, this also means **don't merge to `main` unless asked** — merging is deploying.
- A branch push builds nothing on Vercel, so verify a change with the repo's own checks before merging. A preview is a manual deployment, made only when asked.

## Verify before you report — standing rule (2026-10-22, project owner)

Chuck's correction, after the same failure three times: the book reading
reported works as read or unread that weren't; a session reported 47 lines of
Gann code unusable when 6 were; and a "waiting on you" list named a Resend step
he had already done. Each time a count or a status was reported from memory or
an earlier note instead of from the source as it stands. Project memory is off,
so this file is the only place the rule carries between sessions.

- **Every count, status or "done / not done" you tell the owner is read fresh
  from its primary source in the same turn:** the file, the grep, the test
  run, the database row, the PR's checks, the other thread's latest message.
  A note, a summary, a checklist or your own earlier reply is a lead, never
  the evidence.
- **Say what you checked and when** ("grep at 01:30 UTC found 6"), so the
  owner can tell a measured figure from a remembered one. If you could not
  check, say that, and don't give the number.
- **A count is recounted, not carried.** When a figure came from a subagent,
  an earlier session or a document, re-derive it before repeating it, and
  report any difference from the earlier figure plainly.
- **What is waiting on the owner** lives in
  `/mnt/project-files/owner/waiting-on-chuck.md`. Add an item the moment it
  starts waiting on him and strike it the moment it is done. Before telling
  him what needs him, re-read that file and each item's own thread.
- **Reading coverage** ("read", "inspected", "complete") is claimed only from
  the work's own coverage record, page by page, never from a summary.

## Code review before every merge — standing mandate (2026-10-21, project owner)

In the owner's words: "1. code reviewer checks all code to make sure it is
working correctly, and implement just as Gann would. 2. any code that comes
back with an error is highlighted and solved for, as Gann would 3. only after
all code passes the reviewer can the pr be merged." Every session, every PR,
no exceptions by size.

- **Scope: the PR's own diff.** The whole repository was reviewed on
  2026-10-21 (`/mnt/project-files/senior-code-review/`), so a review covers
  only the code in the PR about to be pushed or merged, plus whatever that
  code calls or is called by where the change could break it.
- **Premise: the 2026-10-21 senior review's** (§1 of
  `senior-code-review/00-comprehension-and-manifest.md`). Two questions for
  every changed file:
  1. Does it work as intended? Logic, edge cases (NaN, null, Infinity,
     sub-penny and negative prices), rounding, New York time and DST,
     closed bars only, no look-ahead, determinism, error handling, and
     whether the tests prove the behaviour.
  2. Does it carry Gann's method? Each rule traced from its source (book
     and page) to the code and the test, marked FAITHFUL, APPROXIMATED,
     ABSENT or CONTRADICTED; the live scan and the replay run the same code;
     the rule reaches every surface it applies to (cross-platform rule
     above). Gann doctrine, the STRAT display taxonomy and the Hermetic
     gates stay separate in every finding.
- **Errors are highlighted and fixed, as Gann would.** Each finding is listed
  with file, line and a concrete failure. The fix follows "Gann answers the
  question" above: his rule is the answer, cited in the code and the change
  record. Only a question no Gann method answers goes to the owner.
- **Merge only after the review passes.** Fixes go on the same PR and are
  reviewed again until no blocking finding remains. Record the result in the
  PR body (a "Code review" section: what was checked, findings, fixes). The
  owner's "merge when green" means green CI and a passed review.
- A reviewer may be a separate agent or a fresh pass by the session itself,
  but it reads the diff cold, as a reviewer, not as the author defending it.
- PRs merged before this mandate (#405 and earlier on 2026-10-21) are
  reviewed after the fact when their thread is next active, and any fix
  ships in a new PR that passes review.

## GitHub Actions minutes: how every session works on the free tier (2026-10-28, owner)

The repository is private, and a private repository on GitHub's free plan
gets 2,000 Actions minutes a month. Once they run out, every check stops
until the month resets (the spending limit is $0, so nothing is billed). The
month before the switch used 13,321 minutes, about 33,000 a month at the
last week's pace (measured 2026-10-28 from the Actions run list). Chuck's
words: "Make the necessary changes so that this and future session adhere to
our new way of working (until we upgrade from the free tier)". These rules
hold until he says the plan has been upgraded.

- **One PR per piece of work, pushed once.** Finish the work, run the suite,
  `tsc --noEmit`, eslint and `scripts/check-banned-terms.mjs` locally, then
  open the PR. Don't open it early and push after every fix: every push to an
  open PR runs the full suite (3 to 5 minutes). Fix review findings in one
  push, not one push each. A PR that is still in progress is opened as a
  draft; drafts run no tests until marked ready.
- **No catch-up merges.** A branch pulls main's latest changes into itself
  only when GitHub reports a conflict, or the branch-age gate fails, never
  just to stay current. The release PR below tests every branch together
  with main anyway.
- **Four releases a day (owner, 2026-10-28: "every 6 hrs").** Finished,
  reviewed, green PRs wait in the merge queue (the Senior code review thread,
  `/mnt/project-files/merge-queue.md`). Around 6:00, 12:00, 18:00 and 00:00
  New York time, skipping a train with nothing ready, it builds one release branch from
  main, merges each waiting PR's branch into it (resolving any conflict
  between them there), opens one release PR, and merges it once it is green.
  Each included PR then shows as merged. Tests run once for the batch and
  production deploys once, which also keeps Vercel under its deploy limit.
  A production bug or a security fix may skip the wait and merge on its own;
  say why in the PR. When Actions minutes run near the 99% hold, trains fold
  into the next window with minutes to spare, and a release goes as one push
  and one CI run.
- **What CI skips** (`.github/workflows/test.yml`): branch pushes with no PR
  (since 2026-10-28), draft PRs, and PRs that change only Markdown other than
  README.md and FEATURES.md. Never widen a skip to `docs/**`:
  `criteria-gate.test.ts` reads `docs/replay-runs/*.json`.
- **Replays and manual workflows** (`backtest-universe.yml` and the like) run
  only on the owner's ask, and a session says the estimated minutes first.
- **Before adding a workflow, a job or a trigger**, say what it costs in
  minutes a month. A new check is a step in an existing job where it can be
  (each job is billed at least a minute, however short).

## Usage limits: alerts and the 99% hold (2026-10-28, owner)

Chuck: "track how close we are to reaching our limit(s). Update us at 25, 50,
60, 65, 70, and in intervals of 5 until 90% of usage. Go by 2 until 96%. Then
go by 1 until 99. But never allow us to use all 100% of our limits unless it is
within the last two days of the allotted month."

- **The meter** is `lib/ops/usageLimits.ts` (rules), `lib/ops/usageStore.ts`
  and `/api/ops/usage` (migration 0133). Meters: GitHub Actions minutes (2,000
  a UTC month), Vercel deployments (100 in a rolling 24 hours), email (Resend
  free: 100 a UTC day, 3,000 a month, from `email_daily_budget`), and, alert
  only, the Supabase database (500 MB), its connections (60), file storage
  (1 GB) and monthly active users (50,000), and Alpaca's 200 requests a
  minute (the month's busiest minute, from its rate headers). The full table,
  and what can't be read from here, is in `docs/THIRD_PARTY_LIMITS.md`. Each threshold emails the owner once
  a period, with times in ET.
- **How it is fed.** Every workflow job starts with a "Usage gate" step and
  ends with a "Usage report" step (`if: always()`) that posts its billed
  minutes, rounded up. A push to `main` also reports one Vercel deployment.
  **A new workflow job must carry both steps** (copy them from `test.yml`),
  or its minutes go unmetered. A manual Vercel redeploy is not seen; post it
  (`{"meter":"vercel_deployments","units":1,"key":"deploy-<id>"}`).
- **The hold.** At 99% the gate fails the job, and the merge queue merges
  nothing while `usage_readings` shows `hold = true` for `github_actions` or
  `vercel_deployments` (`select * from usage_readings` through the Supabase
  tools; it is rewritten on every report and hourly). The hold lifts in a
  monthly limit's last two days (UTC), when the period resets, or for an
  urgent production fix Chuck OKs: add the `usage-override` label to its PR,
  then close and reopen it (a label alone starts no run), and for a merge insert a `usage_overrides` row (`meter`, `until`, `reason`
  citing his message). Never add either without his OK in words.
- **Reconcile** when a session measures the real figure (the GitHub billing
  page, or the run list): post the difference as one event with a `key` of
  `reconcile-<date>`. Each job reports its step time plus 30 seconds for
  setup and post-job steps, so the meter runs close to GitHub's billed figure;
  a gate that can't read the meter warns and lets the job run. The meter started at 1,121 minutes measured from the run
  list at 22:20 UTC on 2026-10-28 (private since 04:47 UTC).

## Git / PR Workflow

- After pushing commits that contain code changes, **always open a pull request** against `main` rather than stopping at the push. Check for a PR template first.
- Do work on the designated feature branch for the task; don't commit directly to `main`.
- **No PR merges before its code review passes** (see "Code review before every merge" above).
- **Name the ROADMAP phase in the PR** — `Q1`, `Q2`, `Q3`, `Q4`, or `N/A` for out-of-phase work — in the title or body. The `roadmap-phase` CI gate requires it.
- **Delete the branch immediately after its PR merges** (`git push origin --delete <branch>`, or GitHub's button on the merged PR). Not later, not at the next cleanup.
- A PR whose branch diverged from `main` more than 30 days ago fails the `stale-branch` gate. Merge `main` in (or rebase onto it) and push.
- `bash scripts/audit-stale-branches.sh` reports merged, stale, and active remote branches; a scheduled job runs it monthly. See `CONTRIBUTING.md` → "Branch hygiene".
