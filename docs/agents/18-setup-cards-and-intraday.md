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

