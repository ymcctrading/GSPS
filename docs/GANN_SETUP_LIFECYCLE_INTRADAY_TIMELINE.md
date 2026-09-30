# Setup lifecycle, intraday, and timeline: what Gann says, and what GSPS does

**Written:** 2026-09-30, answering items 2, 3 and 5 of the project owner's 2026-09-28 note.
**Status:** research and recommendations. **Nothing in this document changes a verdict, a level,
a gate or an order.** Where it recommends a change to one, the change is held for the owner (Part 4).
**Sources:** the page-by-page reads in `docs/memory-bank/sources/` (Tier A: Gann's own text, unless
marked), and the committed replay runs in `docs/replay-runs/`. Read
`docs/GANN_HISTORICAL_SOURCES.md` for the tier definitions.

## The three answers, up front

1. **Price breaks the stop, then comes back to the entry.** In Gann's method the old plan does not
   come back. The stop is caught because the structure it sat under has broken; the broken level
   then flips to the other side (*old bottoms become tops*), so a return to the entry is a test of
   resistance, not a second chance at the buy. A new long needs a new higher bottom and a new
   buying point, with a new stop. GSPS mostly agrees on the dashboard and **disagrees on the chart
   page**, for a specific reason that is a bug in the fit between two parts, not a market opinion
   (Part 1.3). The fix is a verdict change and is held for you.
2. **Intraday.** Gann's method is scale-free in how it is *built* and scale-bound in what it
   *measures*. He used it on the hour and endorsed an hourly chart in fast markets, but he also wrote
   that the money is made on the long swings and that swing trading beats scalping. GSPS's levels are
   swing levels (stops 3–15% away, first targets 3–15%) because they come from daily structure, which
   is why they look wrong on a chart you are trading by the hour. The honest state of the evidence is
   that the one-hour method has **lost money over six years** in the largest sample GSPS has run.
   Part 3 sets out how each piece of the method rescales and a measurement plan that would settle it.
3. **Timeline.** Entry is a matter of minutes to a few hours; the trade is a matter of days to
   weeks. Measured on 392 replayed trades, the median holding period was about **5 sessions** on the
   fixed bracket and about **7 sessions** on the exits that are live now, and 60% of trades on the
   live exits were still open when the replay's 10-session limit stopped them (Part 2).

---

## Part 1. The stop is broken, and price returns to the entry (item 2)

### 1.1 What GSPS does today

| Surface | What it does when price trades through a setup's stop |
|---|---|
| Dashboard lists (`components/scan/results-table.tsx`, `components/dashboard/tracked-execute-list.tsx`) | Marks the row invalidated the first time a live quote is through the stop, and **keeps it** (a one-way ratchet) so a feed gap or a tick back over the line can't un-invalidate it. |
| Order ticket on the symbol page (`components/trade/order-ticket.tsx`, `protocolInvalidated`) | Recomputed from the live price on every render. **No ratchet:** the banner disappears when price is back above the stop. |
| Daily list reader (`lib/dailyScans.ts`) | Drops a row whose *scan-time* price was already through the stop. |
| Monitor sweep (`app/api/monitors/invalidation-sweep/route.ts`) | Twice an hour in market hours, flips a WATCH/EXECUTE monitor to INVALIDATED if a fresh quote is through its stop. |
| Symbol page scan (`app/api/scan/route.ts` → `lib/scanTicker.ts`) | Re-scans from **completed daily structure** and knows nothing about the stop. It returns the same plan, and `evaluateMonitorsAndNotify` **re-arms the monitor** the sweep just invalidated (`lib/entitlements/monitor.ts`: INVALIDATED → WATCH → EXECUTE is a valid transition). |
| Trade-plan lifecycle (`lib/lifecycle/reaper.ts`) | Deliberately does **not** invalidate a pre-entry plan on a stop breach; the header says that decision is the product owner's. This is finding F3.7 in AGENTS.md, held since 2026-09-25. |

That is the whole of why the chart shows the plan as active. The list, the sweep and the ticket each
say "invalidated" from a quote; the scan behind the chart says "still valid" from the last completed
daily bars, and it is the scan that writes the monitor back to Execute. Three of those four agree
with each other. The fourth is the one that draws the lines.

### 1.2 What Gann says

Four separate teachings bear on this. Each is quoted from the read, with the source file.

- **A caught stop is a signal, not an accident to be undone.** "When the stop is caught the Overnight
  Chart has reversed — reverse position", with the exception that he does not reverse where there is
  no nearby second top or bottom to place the new stop against (*Master Stock Market Course*, Ch. 3,
  Rule 4; `sources/A2_1_master_stock_market_course.md`). In *New Stock Trend Detector*, Rule 6: close
  longs and go short when the trend changes; "if stopped, cover and go long again — keep with the
  trend all the time" (`sources/A05_new_stock_trend_detector.md`). In neither does he wait for price
  to return to where the first trade was entered.
- **The broken level changes sides.** "Old tops become bottoms; old bottoms become tops" (*New Stock
  Trend Detector* p. 13, `sources/A05_...md`), and, on closing prices, "breaks below old lows
  generally rally back to the old lows = safe sell" (*Master Course* rule 5,
  `sources/A2_1_...md` line 45). A long setup's stop sits under a swing bottom. Once that bottom is
  broken, it is resistance. A return toward the old entry is a return toward resistance.
- **Re-entry is a new trade with a new stop, not the old one resumed.** In *Tunnel Thru the Air* he
  is stopped out at 225 and re-buys at 218 "after the 12 to 15 point reaction he expected, stop
  212" (`sources/A03_tunnel_thru_the_air_1927.md`): a different price, a different stop, a stated
  reason. "Too soon, too late: wait for a well-defined change in trend, then act", and "never
  average a loss" (*Master Course*, fundamental rules, `sources/A2_1_...md` lines 37 and 39).
- **How much of a break is a break.** His stops are placed 1–3 points beyond the swing extreme so
  that ordinary "lost motion" does not catch them: price goes about 1⅞ points past a level but not 3
  full points, "so a 3¢ stop is caught least often" (*How to Make Profits in Commodities* p. 38,
  `sources/A08_how_to_make_profits_in_commodities.md` line 35). He prefers stops under closing prices
  because they are "caught less often than under intraday lows" (*Master Course*, Stops,
  `sources/A2_1_...md` line 57), and he wants a *close* beyond a level before treating a break of it
  as real, because "intraday pokes often reverse by the close" (rule 5). So the stop being *touched*
  is the trigger for an open position (a stop order fills on touch), but the confirmation that a
  *trend* has changed is a close, and the allowance beyond the swing extreme is already built into
  where the stop sits.

### 1.3 Reading the three situations

| Situation | Gann's answer | GSPS today |
|---|---|---|
| **An open position, stop hit** | Out. The reversal is the signal; he reverses only where a nearby second level gives the new stop somewhere to go. | Exits on the stop. GSPS does not reverse (noted in `sources/A2_1_...md`, "Implementation relevance"). |
| **A setup not yet entered; price falls through its stop** | The thesis is gone (the swing bottom that qualified it is broken). Don't enter the old plan. The break is confirmed by a close, and a poke that closes back inside is not a change of trend. | The list and the sweep treat a quote through the stop as final. The chart page's scan doesn't see it, and re-arms the plan. |
| **Price then returns to the original entry** | The old plan is not resumed. The old bottom is now resistance. A long needs a new higher bottom and a new buying point with a new stop; a short from the old level is the trade the method actually offers, if its own trigger arms. | The list keeps it dead. The ticket un-invalidates the moment price is back above the stop, and the chart shows the same plan. **This is the inconsistency you saw.** |

### 1.4 Options, and what I recommend

- **A. Gann-strict.** A breach of the stop retires that plan for good. It is only replaced by a new
  scan that produces new levels. Implementation: a stop-breach hold in the scan itself, beside
  `applyDataLagHold` and `applyBreakawayHold`, applied on the live scan and the replay alike (they
  must share the code, `lib/scan/entrySelection.ts`), which returns Reject for a plan whose stop is
  already through, so the monitor goes INVALIDATED and stays there until a genuinely new plan
  qualifies.
- **B. Gann's close standard.** The same, but a stop that is *touched* only puts the plan **on hold**
  (no entry while price is beyond it); it is retired when a session **closes** beyond it, and it
  recovers if the day closes back inside. This is the reading of "intraday pokes often reverse by
  the close" applied to a not-yet-entered plan.
- **C. Leave it.** Keep the list's ratchet and the ticket's live check, and accept that the chart
  and the list can disagree.

**Recommendation: A.** It is what the swing-chart rule GSPS already runs says: a trend turns when
the last swing extreme breaks (`lib/gann/swingChart.ts`, parity stage B1), and the stop sits beyond
that extreme by Gann's own allowance, so a touch of it has already cleared his "lost motion". It is
also his stop-caught rule. B is the fallback if the replay shows that a large share of breached
stops close back inside by the end of the session; the replay can answer that before anything ships.
Either ends the disagreement between the list and the chart.

**What it would touch, and why I have not done it.** Every one of the surfaces in 1.1, plus Guided
eligibility, the demo account, plan-scoped automation and the autonomous portfolio manager (all of
which read the verdict), the monitor notifications (INVALIDATED notifies), and the replay's
measurement (which must arm and retire plans by the same rule as the live scan, or the two drift,
the `harmonicProximity` failure shape). It also changes what a "pre-entry plan" means in a module
whose own header says a change to it needs counsel review
(`lib/lifecycle/types.ts`). That is a verdict change, and AGENTS.md holds F3.7 for you. I would
build A once you say so, with the replay measuring the retired-plan counts before anything is
switched on.

**What I did change, and only this:** the dashboard lists now separate the broken setups from the
live ones. They sit in a closed "Setups that broke their stop" dropdown (tracked) or "No longer valid setups" dropdown
(saved), out of the live list and out of its count. The copy does not claim anything beyond what is
true today ("its entry is a dead level").

---

## Part 2. How long an executable setup takes (item 5)

There are two clocks, and they run at different speeds.

### 2.1 The entry clock: minutes to a few hours

- The **trigger** is set from daily bars (`lib/gann/entryTrigger.ts`, crossing an old swing extreme
  plus lost motion), so a setup can exist from the pre-open scan onward.
- The **entry** is confirmed on closed **15-minute** bars (`EXECUTION_TIMEFRAME`,
  `lib/timeframe.ts`), through four stages that each need a later bar than the last: the trigger is
  touched, a bar closes beyond it by the buffer, a later bar returns to it, and a later closed bar
  resumes beyond the retest bar's extreme (`lib/lifecycle/entryConfirmation.ts`). That is **at least
  four bars, about an hour**, and usually more.
- A trade plan **expires** if that doesn't happen: 3 bars (45 minutes) for a breakout, 4 bars for a
  confirmed reversal or a range reversion, 5 bars (75 minutes) for a pullback, and 20 bars (5 hours)
  when no state supplies its own (`lib/signals/states/*.ts`, `lib/lifecycle/fromScanResult.ts`).
- A Guided recommendation card is good for 15 minutes (`lib/guided/config.ts`).

### 2.2 The trade clock: days to weeks

Exits are judged on **completed daily sessions**, not on the 15-minute bars
(`lib/gann/exitRules.ts`): the hold test and the trail read daily closes and the prior month's low,
"three adverse closes" reads the first three sessions after the fill, and the trend-change exit
reads the weekly swing chart. Stops and first targets come from daily structure too
(3–15% for both on equities, `lib/strat/levels.ts`), so a level takes days to reach.

Measured on the 15-minute replay of 766 symbols, 392 trades, 2026-07-30 to 2026-09-25 (run 21,
`docs/replay-runs/2026-09-28-15Min-2R-within-all-766sym-firstdays-*.json`; 26 fifteen-minute bars
make one regular session):

| Exit | Trades | Median hold | In sessions |
|---|---:|---:|---:|
| Fixed bracket, all trades | 392 | 135 bars | **5.2** |
| Live rule (Gann exits, 60% off at TP1), all trades | 392 | 180 bars | **6.9** |
| … stopped at the initial stop | 45 | 52 bars | 2.0 |
| … three adverse closes | 40 | 70 bars | 2.7 |
| … hold test failed | 35 | 76 bars | 2.9 |
| … break-even | 17 | 105 bars | 4.0 |
| … final-stage trail | 13 | 132 bars | 5.1 |
| … trend change | 6 | 179 bars | 6.9 |
| … still open at the replay's 10-session limit | 236 | 260 bars | 10.0 (a floor) |

Read this as: **losers are out in two to three sessions; winners run longer than the replay
allowed**, because the last row is a limit, not a result. It is one two-month window, and the run
notes say plainly that it is a single market phase.

### 2.3 What Gann says about the same clocks

Bull-market reactions are "quick and sharp but never more than 3–4 weeks" (*Master Course* Rules for
stocks A); a normal reaction in a steady advance lasts 10–14 days, the next 28–30, and a move past
30 days is likely to run 60 (*How to Make Profits in Commodities* p. 310–311); a market that has
closed three days against you after entry is wrong (*New Stock Trend Detector* p. 23). He does not
give a holding period for a single trade, and he says not to fix a target
(*Truth of the Stock Tape*); the trade lasts as long as the trend does.

**Dewey's checklist, since these are recurrence claims.** None of the durations above has been
validated in GSPS. Regularity of timing and constancy of period are asserted by Gann and untested
here; the dated-window version of the claim failed its own test on 2019–2025 data
(`docs/replay-runs/2026-09-27-766sym-NOTES.md`, "F4 calendar test"). They are context, not gates.

---

## Part 3. Gann's method and intraday trading (item 3)

### 3.1 Why the levels look wrong on an intraday chart

They are swing levels by construction. On equities the stop is placed at a structural level 3–15%
away (`EQUITY_STOP_MIN_PCT`/`MAX_PCT`), TP1 is 2 daily ATRs clamped to 3–15%, and the master target
is 3.5 ATRs clamped to 6–25% (`lib/strat/levels.ts`). A stock that moves 1–2% in a day does not
reach a 3% first target in a session, and a 3% stop is a large loss for a trade meant to last an
hour. The 15-minute bars in GSPS decide *when* to enter a swing plan; they don't size it.

### 3.2 What Gann himself says

| Statement | Source (tier) | Bearing |
|---|---|---|
| "When markets are very active… keep an **hourly** High and Low Chart… the Hourly Chart will give the first change in trend." 144 hours ≈ 28 days. | *Master Course* Ch. 13 (A) | He charted by the hour, in fast markets. |
| The law governs "the daily and even **hourly** movements." | 1909 *Ticker* interview (A) | Correspondence: the same law at every scale. |
| In active fast markets use the daily chart and the **close**; "intraday pokes often reverse by the close." | *Master Course* rule 5 (A) | Caution about acting on an intraday break. |
| "The big money… is made on the long swings and not by day to day trading." | *Annual Forecasts* 1919–22, closing (A) | Against day trading as the main source of profit. |
| "Swing trading is most profitable. Hold until a reverse swing, and don't scalp." | *How to Make Profits in Commodities* p. 316 (A) | Same. |
| Five factors for time and price: high, low, halfway point, open, close; close vs halfway point gives the bar's trend. | *Master Course* Ch. 13 (A) | A per-bar rule that works at any bar length. |
| 4 minutes = 1° of rotation, "the smallest cycle… in things that are very active." | *Tunnel Thru the Air* (A, novel) | A time unit for the smallest scale; no trading rule attached. |
| Overnight Chart method: 1-point stops, a 3-point reversal for larger swings, trades at the halfway point, stop and reverse. | *Master Course* Ch. 3 (A) | His most mechanical system, and a tight-stop one. |
| Mikula's guess that Gann traded 1909 from Moon angles off intraday pivots. | *Scientific Methods* vol. 2, Ch. 6 (B, interpretive; he admits it is speculation) | A lead, not a source. |

So: he had an intraday chart, he tightened his stops when he traded short-term, and he believed in
the swing. The 1909 audited record (286 trades in 25 market days) is a historical claim about the
method's *shape*, a level, a limit and a tight stop, and is not evidence for GSPS
(`sources/A01_ticker_interview_1909.md`).

### 3.3 What GSPS has measured

- **One-hour bars, 2020-09-29 to 2026-09-25, 766 symbols (run 12):** every cell loses and every
  interval sits wholly below zero, in both halves. Execute is worse than Watch. It is the largest
  sample GSPS has (8,600 to 17,000 trades). "The intraday question is answered, and the answer is
  no", in the run notes' words.
- **15-minute bars, two months (runs 16, 19, 21):** positive (+0.075R live rule, +0.095R bracket),
  but it covers one market phase and its first half is slightly negative.
- The two are not the same test: the six-year run predates two translation fixes (Gann's points
  scaled to price, and the first-days reading of the adverse-closes rule), and it traded the old
  replay stop. **Nothing yet measures the fixed method at intraday scale over years.**

### 3.4 How each piece rescales

Gann's constructions are ratios and structures, so they carry over. His *measures* (points, days)
do not, and have to be re-derived in the unit of the chart. That is the same move
`lib/gann/pointScale.ts` already makes from his 1930s points to a percentage at any price.

| Piece | Swing form (today) | Intraday form | Basis |
|---|---|---|---|
| Trend | 9-day / 3-day swing charts; weekly 7-day chart (`lib/gann/swingChart.ts`) | The same swing-chart rules on 15-minute and hourly bars: a swing reverses when the last extreme breaks. | Master Course Ch. 13 (hourly chart "gives the first change in trend"). |
| Buying/selling point | Cross of an old swing top/bottom on daily bars, plus lost motion | The same cross on the 15-minute / hourly swing, plus a lost-motion allowance re-derived for the session's range | A8 nine buying points. His lost motion is in absolute cents and points, so it has to be rescaled, as `pointScale.ts` does for the exits. |
| Stop | 3–15% band under a daily swing | 1 point-equivalent beyond the intraday swing extreme, scaled as `pointScale.ts` scales it | Master Course Ch. 3 (1-pt stops); NSTD stops of 1, 2, 3 points on cheap stocks. |
| First target | 2 daily ATRs, clamped | The nearest old top/bottom or halfway point above the entry: the day's 50% point, the prior session's high/low | Master Course: sell at old tops, the halfway point as the gravity center. |
| Master target | 3.5 ATRs | **None.** Trail the stop under each higher intraday bottom | "Never fix a target price" (*Truth of the Stock Tape*); the intraday scanner already prices no MTP. |
| Confirmation | Four stages on 15-min bars | Four stages on 5-min bars | Same rule, finer bar. |
| Time | Daily/weekly counts | Hourly counts (144 hours), 4-minute rotation | Master Course Ch. 13; *Tunnel*. Research only until Dewey's items are met. |
| Exit on trend change | Weekly swing chart turns | The hourly swing chart turns | Same rule, finer chart. |

The intraday scanner (`lib/scanner/intraday.ts`) already uses two of these: the session's 50% point
(replacing VWAP, 2026-09-28) and the opening range. Its first target is the exception: it is
twice the risk (`continuationPlan`), which is an R-multiple with no Gann source. The new intraday
cards say so on their face ("2.0× risk", and a note that there is no MTP). It is the one intraday
component that fails the Gann-grounded standard, and the table's "first target" row is its
replacement.

### 3.5 A measurement plan that would settle it

Pre-registered, in the way `docs/memory-bank/F4_CYCLES_CALENDAR_RESEARCH.md` is, so the rule is
fixed before the data is seen:

1. Build the intraday profile as a *replay* option only (`entryRule`/`exitRule` already work this
   way), with the rows in 3.4 as its rules and no parameter searched.
2. Run it on the 766-symbol universe over the longest 5-minute and 15-minute window the feed
   returns, plus the six-year hourly window, with the halves and the 95% interval that runs 12–21
   already report.
3. Judge it by Dewey's standard as well as sign: a hit rate against a base rate, out-of-sample
   persistence, and the two halves agreeing.
4. Only then decide whether it gets a product surface. Until then the intraday cards stay
   *confirmations of moves that have already happened*, which is what the scanner says it is.

**Recommendation.** Keep swing as GSPS's method, keep the intraday panel as confirmation, and
commission step 1 if you want the intraday profile built. It is a replay-only build, no product risk,
and it is the only route to an answer that isn't "the hourly run lost money, presumed a translation
defect".

---

## Part 4. Decisions for the owner

1. **Stop-breach rule** (Part 1.4): A, B or C. Recommended: A. Needs a go-ahead because it changes
   the verdict, the monitors and the replay together.
2. **Intraday profile** (Part 3.5): build as a replay-only option? Recommended: yes.
3. **Refresh numbers** (shipped with the intraday cards, `lib/entitlements/policy.ts`): Pro 3 a day /
   10 a week, Expert 8 / 30, Wall Street unlimited with automatic refresh, Novice none (no intraday
   access, unchanged). These are starting values I chose; the rule is in one place to change.

## Three-question basis

1. **Gann.** Cited throughout, Tier A except where marked. The recommendations follow *Master
   Course* Ch. 3 Rule 4, *New Stock Trend Detector* Rule 6 and p. 13, *Tunnel*, and the close
   standard from rule 5.
2. **Cycles (Dewey/Tomes).** Part 2's durations and Part 3's time counts are recurrence claims.
   Cleared: none. Regularity of timing and constancy of period are asserted, untested here; the
   pre-registered dated-window test failed. They stay context.
3. **Hermetic.** **Polarity** for Part 1: a broken support becomes resistance, the level itself
   flips sides. **Cause and Effect**: a caught stop is an effect whose cause, the broken structure,
   has to be read before another entry. **Rhythm** for Part 2: the entry clock and the trade clock
   are two cycles at different periods, and the scan returns on its own schedule rather than
   completing once. **Correspondence** for Part 3, held to the citation discipline: "the same law at
   every scale" shapes the table in 3.4; it is not evidence, and the six-year hourly run is the
   evidence that has to be answered.
