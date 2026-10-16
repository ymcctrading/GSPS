# GSPS Gann element map (read-only survey, 2026-10-15)

Repo: /home/claude/GSPS, HEAD 06d1124 (2026-09-30, #305). `STRATEGY_VERSION` = `2026-09-30-stop-breach-retired` (lib/backtest/strategyVersion.ts:48).
Method: exports grepped per file; consumers = non-test files importing the module (lib/app/components/scripts); tests = test files importing it; last commit = `git log -1 -- <file>`.
Surface key: LIVE = lib/scanTicker.ts / lib/marketScan.ts (live scan); REPLAY = lib/backtest/replay.ts (and replayIntraday.ts); EXITS = lib/trade/protocol-exit.ts / gann-exit-live.ts / exit-manager*; CARD = lib/signals/confluence/gann.ts -> components/scan/confluence-card.tsx; DR = via lib/gann/disclosedRules.ts (which LIVE, REPLAY, contextFactors, exitRules, timeRules and the card consume).

## 1. Gann element -> code -> consumers -> tests -> last change

| gann_element | file: exported fn(s) | computes | consumers / surfaces | tests (count) – representative names | last commit |
|---|---|---|---|---|---|
| Swing charts (3-Day + 7-day weekly; trend on break of last swing extreme) | lib/gann/swingChart.ts: walkSwingChart, swingChartDirection, computeSwingChart, swingPivots, computeCampaignLeg; THREE_DAY_CHART, WEEKLY_SWING_CHART | swing walk on highs/lows, direction, pivots | score.ts (swingChartTrend), scanTicker, replay, replayIntraday, regime.ts, confluence/gann, and 10 gann modules (entryTrigger, trendStrength, campaignLedger, exitRules, breakaway, pyramid, multipleTops, extremeRules, timeConvergence, disclosedRules) | gann/__tests__/swingChart.test.ts (17) "takes its first direction from the first bar outside the opening range"; entryTrigger.test.ts | d4ef926 2026-09-27 Rebuild the swing charts to Gann's own construction (X3) |
| Trend strength / range-bound (regime) | lib/gann/trendStrength.ts: readGannTrend, isGannRangeBound; STRUCTURE_SWING_CHART (=THREE_DAY_CHART) | confirmed trend direction from stepping swings + campaign over-balance | analysis/trend.ts (readTrend -> macro trends), signals/regime.ts, states/rangeReversion.ts, breakaway, sevenZones, school/graduationExam | trendStrength.test.ts (7) "confirms a stepping uptrend", "does not confirm a flat oscillating range, however long" | 5323143 2026-09-27 Infuse Gann's trend, time, level and Rule of Three rules into the verdict |
| Monthly/weekly/daily trend read | lib/analysis/trend.ts: readTrend | trend per timeframe via readGannTrend + pivots S/R | LIVE, REPLAY (macro context), entrySelection | **none direct** (no test imports readTrend) | d4ef926 2026-09-27 |
| Power-ratio timeframe weight 7/30/365 | lib/gann/timeframeWeight.ts: weightedTrendAgreement, TIMEFRAME_POWER_RATIO | weighted M/W/D trend agreement | scan/entrySelection.ts (-> scanTicker, marketScan, replay) | timeframeWeight.test.ts (5) "lets a single monthly trend outweigh two flat 2-of-3 daily/weekly votes" | 81ab179 2026-09-16 |
| Entry selection / stock's-own trend / Gann continuation | lib/scan/entrySelection.ts: preferredEntryDirection, macroBreadthAgrees, isGannContinuation, rankArmedPatterns, MIN_DAILY_BARS_FOR_SCAN | shared live/replay arming direction and continuation gate | scanTicker, marketScan, replay | lib/__tests__/replay.test.ts (53, shared) | c99e4dd 2026-09-28 |
| Entry trigger: Buying/Selling Point + lost motion | lib/gann/entryTrigger.ts: computeGannEntryTrigger, LOST_MOTION_BUFFER_PCT (= DEFAULT_CONFIRMATION_BUFFER_PCT = 0.3%), ENTRY_TRIGGER_SWING_DAYS | trigger price crossing old completed swing top/bottom + buffer | score.ts (entryTriggerArmed via scanTicker), scanTicker, replay, replayIntraday, gann-exit-live, automation/portfolio-manager, graduationExam, breakaway, pyramid, evenFigures, timeRules, accumulation, multipleTops | entryTrigger.test.ts (9) "returns completed swing extremes, not per-bar extremes"; breakaway.test.ts; replay.test.ts | c518d92 2026-09-27 |
| Entry confirmation (touch/break/retest/hold; "3-point" buffer) | lib/lifecycle/entryConfirmation.ts: advanceEntryConfirmation, entryReady, freshEntryConfirmation, replayEntryConfirmation, DEFAULT_CONFIRMATION_BUFFER_PCT=0.3 | four-stage confirmation state machine | plans lifecycle, replay (`entryRule: confirmed`), confirmNow | lifecycle/__tests__/entryConfirmation.test.ts (4) "requires all four stages, each on a later bar"; backtest/__tests__/entryConfirmation.test.ts; automation tests | 04e4f9e 2026-09-27 C5 |
| Confirmation at order time (every path) | lib/lifecycle/confirmNow.ts: readEntryConfirmationNow, confirmationFromBars, closedSessionBars, stageOf | confirm on closed execution bars before placing | trade/place-order.ts (refuses `awaiting_confirmation`) | lifecycle/__tests__/confirmNow.test.ts (3) "reports the stage reached and is ready only after the full sequence"; trade/__tests__/place-order-live.test.ts, place-order-stale-bracket.test.ts | 04e4f9e 2026-09-27 |
| Breakaway (sideways range: Execute needs breakaway) | lib/gann/breakaway.ts: readBreakaway, BREAKAWAY_RANGE_DAYS; score.ts: applyBreakawayHold | 13-week range extremes; hold Execute->Watch inside | scanTicker, replay, score.ts, capitalStock | breakaway.test.ts (5) "reads a sideways market as range-bound and holds an entry inside the range" | 0ff7dda 2026-09-27 |
| Stop breach / plan retirement / failed-break reclaim | lib/gann/stopBreach.ts: readStopBreach, isStopBreached, isStopBreachedByBar, isReclaimedByClose, reclaimLevel, RECLAIM_POINTS=3, RECLAIM_POINTS_STRICT=5; score.ts: applyStopBreachHold; lib/lifecycle/retire.ts: retirePlansForBrokenStops etc. | broken stop -> Reject; reclaim on close back through by Gann's price-scaled 3 pts | scanTicker, score.ts, replay, replayIntraday, backtest/run.ts; retire.ts via scan fan-out (gated on signoff) | stopBreach.test.ts (21) "retires a long when price reaches or falls through the stop"; lifecycle/__tests__/retire.test.ts (11); replay.test.ts | 06d1124 2026-09-30 |
| Gann's "3 points", price-scaled | lib/gann/pointScale.ts: gannThreePointsPct, gannThreePoints, MIN/MAX_ALLOWANCE_PCT | price-banded 3-point allowance | exitRules, stopBreach, replayIntraday | pointScale.test.ts (3) "gives 3 points in the middle of the $25-60 band and 7.5 in the middle of $100-300"; stopBreach.test.ts; replay-intraday.test.ts | c99e4dd 2026-09-28 |
| Gann exits (hold test, 3 adverse closes, break-even, trails, final stage, weekly/over-balance, D2 distribution week) | lib/gann/exitRules.ts: readGannExit, FINAL_STAGE_SECTION | per-position exit decision, no fixed target | trade/protocol-exit.ts (LIVE_EXIT_RULE="gann", SCALE_OUT_PCT 60% at TP1), trade/gann-exit-live.ts (readLiveGannExit -> exit-manager.ts, exit-manager-sim.ts), replay (`exitRule: gann`/`gann-runner`) | exitRules.test.ts (12) "fails the hold test when a close falls back under the crossed top by 3 points, price-scaled"; trade/__tests__/gann-exit-live.test.ts (2); lib/__tests__/protocol-exit.test.ts (26) | 1ed122b 2026-09-28 |
| Protocol exit plan (scale-out, stop adjustments) | lib/trade/protocol-exit.ts: planProtocolExit, planStopAdjustment, storedStopReason, extendHighWater, LIVE_EXIT_RULE | bracket/tranche plan; Gann exit rule live | place-order.ts, guided/service.ts, guided/sizing.ts | protocol-exit.test.ts (26) "takes 60% off at TP1 and splits the rest..." | 6bbebc1 2026-09-28 Switch live and paper exits to Gann's rules |
| Pyramiding | lib/gann/pyramid.ts: readPyramidAdd, MAX_LOTS | half-lot add at crossed swing top, stop to combined BE, 4 lots | replay (`pyramid: true`), app/api/positions/pyramid/route.ts (suggestion) — **not automated** | pyramid.test.ts (3) "adds half the last lot at the crossed swing top and lifts the stop to break-even" | d517959 2026-09-28 |
| Rule of Three (daily/weekly/monthly) | lib/gann/ruleOfThree.ts: computeRuleOfThree; disclosedRules: readRuleOfThreeTimeframes, toWeeklyBars, toMonthlyBars | consecutive-close streak reversal signal | score.ts (ruleOfThree criterion incl. weekly/monthly), scanTicker, replay, disclosedRules | ruleOfThree.test.ts (7) "does not signal bullish on only one higher close (needs 2)"; disclosedRules.test.ts | 1cba6e0 2026-09-16 |
| Gann angles / 1x1 slope | lib/gann/normalizedSlope.ts: normalizedSlope, nearestGannAngle, computeAngleSlopes; lib/gann/fans.ts: computeFanLines, nearestFanLine, ANGLES | ATR-normalized slope vs Gann angles; fan lines + time projections | score.ts (gannAngleSlope via scanTicker), scanTicker, replay, marketScan (fans), CARD | normalizedSlope.test.ts (6) "computes (price_t - anchor_price) / (atr_at_anchor * bars_since_anchor)"; fans in lib/__tests__/gann.test.ts (20) | normalizedSlope 9dce90a 2026-09-10; fans 5790410 2026-09-16 |
| Range divisions / retracement (½, ¼, ¾, ⅓, ⅔, ⅛s); 50% midpoint | lib/gann/retracement.ts: computeRetracementLevels, nearestRetracementLevel, rangeMidpoint | Gann eighths/thirds levels; range 50% point | score.ts (gannRetracementConfluence), scanTicker, replay, marketScan coarse gates, states/trendPullback, states/confirmedReversal | retracement.test.ts (6) "includes the full retracement (100%) and 1/16, 1/3, 2/3, 15/16 fractions" | d463282 2026-09-26 |
| Square of Nine | lib/gann/squareOf9.ts: squareOf9Levels, nearestS9Level, recentSquareOf9Levels | 180° = +1 root price levels | scanTicker, replay, CARD | lib/__tests__/gann.test.ts "produces the classic 360° doubling relationship" | c57b253 2026-09-09 |
| Time = price squaring | lib/gann/timePriceSquare.ts: computeTimePriceSquare, SQUARE_TOLERANCE_BARS | bars since pivot vs ATR-normalized price move | score.ts (timePriceSquare), scanTicker, replay | timePriceSquare.test.ts (5) "reads both the low-anchored and high-anchored pivot" | e174088 2026-09-23 |
| Volume rule at turns (drying-up bottoms, retests, climax exception) | lib/gann/volumeClimax.ts: computeVolumeClimax, VOLUME_CLIMAX_THRESHOLD, DRY_UP_BARS, RETEST_TOLERANCE_PCT | volume confirmation at a pivot | score.ts (volumeClimax), scanTicker, replay, marketScan pre-filter, boilingPoint, CARD | volumeClimax.test.ts (8); volumeRule.test.ts (3) "confirms a normal bottom on drying-up volume and a narrowing range" | 71ce410 2026-09-27 Stage D1 |
| Boiling point (6th–7th week blow-off) | lib/gann/boilingPoint.ts: computeBoilingPoint | weeks since climax in classic blow-off window | score.ts (note), scanTicker, replay, CARD | boilingPoint.test.ts (6) | cdf1b65 2026-09-16 |
| Old tops/bottoms S/R, 4th test, levels, stops, targets | lib/strat/levels.ts: computeTradeLevels, computeEquityTradeLevels, computeStopWithLeeway (+ combineNearbyLevels internal) | entry/stop/TP1/TP2/MTP from structural levels; even-figure offsets | scanTicker/plans, replay, intraday (no) | lib/__tests__/equity-levels.test.ts (20) "anchors the stop to the nearest support level within band, on a long"; strat.test.ts; protocol-rules.test.ts | e82b0a6 2026-09-28 |
| Even figures (round numbers) | lib/gann/evenFigures.ts: figuresAround, figuresBetween, approachingFigure, shortOfFigure, targetCandidates, stopBeyondFigure, roundNumberEntryBlocked | price-scaled round-number grid; targets short of / stops beyond | strat/levels.ts, replay, contextFactors, disclosedRules, portfolio-manager, scanner/intraday.ts (gannFirstTarget), components round-number-notice, ticker-view | evenFigures.test.ts (6) "scales the grid with price: quarters at $100 and above, halves below" | e82b0a6 2026-09-28 |
| Disclosed rules bundle (Stage A: bar midpoint, % of extreme price, day-count bands, year fractions, counter-move clock, level tests, R3 timeframes) | lib/gann/disclosedRules.ts: readDisclosedRules, describeDisclosedRules, readBarMidpoint, pricePercentageLevels, majorPricePercentageLevels, readPricePercentages, readDayCountBands, readYearFraction, YEAR_FRACTIONS, readCounterMove, counterMovePhase, readLevelTests, readRuleOfThreeTimeframes | aggregator of context fields | scanTicker, replay, contextFactors, exitRules, timeRules, CARD | disclosedRules.test.ts (13) "reads a close above the midpoint as up and below as down"; components/scan/confluence-card.test.tsx | 73a879b 2026-09-28 |
| Campaign ledger (Space Rule, over-balance time/space, monthly-low break, sections, time balancing, first-year high) | lib/gann/campaignLedger.ts: buildCampaignLedger, describeCampaignLedger | per-campaign swing ledger | trendStrength (verdict), exitRules, disclosedRules, leadership, sharesPerPoint | campaignLedger.test.ts (5) "flags over-balance when a reaction outlasts and outsizes every earlier one" | 5323143 2026-09-27 |
| Time cycles (major pivots, cycle hierarchy, fixed calendar, day-count bands, year fractions) | lib/gann/timeCycles.ts: timeCycles, yearCycleConvergence, DAY_COUNT_BANDS, MAJOR_CYCLE_YEARS, FIXED_CALENDAR_WINDOWS (10 windows) | time windows from pivots; year-cycle convergence | scanTicker, marketScan (ranking), replay, CARD, disclosedRules, incorporationCycle, macroCycle | **no file in lib/gann/__tests__**; covered by lib/__tests__/cycle-ranking.test.ts (13) "counts a major low exactly one cycle length back as a bullish hit", lib/__tests__/gann.test.ts | 6d18856 2026-09-28 |
| 7/14-day alternation; Square-of-144 convergence; projection dispersion | lib/gann/timeConvergence.ts: readTiming, ALTERNATION_DAYS, PROJECTION_CYCLES | timing context from 3-Day pivots | DR only | extremeTiming.test.ts (7, shared) | 346bb20 2026-09-28 Stage F |
| Reverse signal day, 7–10 Day Rule, gaps | lib/gann/extremeRules.ts: readExtremeRules, readReverseSignal, readGaps | extreme-price context | DR only | extremeTiming.test.ts "reads a top reverse day...", "reads the 7-10 Day Rule after a run with no lower lows" | 346bb20 2026-09-28 |
| Daily/weekly time rules (2–3-day halt, reaction week, 3rd week) | lib/gann/timeRules.ts: readTimeRules, HALT_LOOKBACK | time-rule context | DR only | timeRulesAndTops.test.ts (4) "finds a two-day halt at a fresh top and puts the stop beyond it" | 73a879b 2026-09-28 |
| Double/triple tops | lib/gann/multipleTops.ts: readMultipleTops | level tests testing/crossed/failed on 3rd | DR only | timeRulesAndTops.test.ts | 73a879b 2026-09-28 |
| Seasonal counts from Mar 21 | lib/gann/seasonalCounts.ts: readSeasonalCount, SEASONAL_POINTS | ranked seasonal points | DR only | missingRules.test.ts (5 shared) "ranks the half year first and finds the midseason points" | ab7a9e8 2026-09-28 |
| Accumulation time | lib/gann/accumulation.ts: readAccumulation | weeks in range + breakout dir | DR only | missingRules.test.ts "counts the weeks in a range and reads the breakout" | ab7a9e8 2026-09-28 |
| Shares per point | lib/gann/sharesPerPoint.ts: readSharesPerPoint | volume/point on current vs prior leg | DR only | missingRules.test.ts | ab7a9e8 2026-09-28 |
| Leaders (early/late; first-year high) | lib/gann/leadership.ts: readLeadership | bottomed/topped vs SPY | DR only | missingRules.test.ts | ab7a9e8 2026-09-28 |
| Seven Zones of Activity | lib/gann/sevenZones.ts: readSevenZones, describeSevenZones | zone from behaviour | DR only | sevenZones.test.ts (3) "reads a quiet advance as zone 1 and a feverish one as zone 3" | 932879c 2026-09-28 |
| Capital stock / float volume (D2) | lib/gann/capitalStock.ts: readCapitalStock, describeCapitalStock | ⅔-float week, plain-top week, range turnover | exitRules (long exit), disclosedRules | capitalStock.test.ts (7) "reads two-thirds of the stock in one week at a top as distribution" | 262067b 2026-09-28 |
| Incorporation anniversary (D3) | lib/gann/incorporationCycle.ts: readIncorporationCycle, describeIncorporationCycle | inception anniversaries/degrees/cycles | replay, disclosedRules, data/instrumentReference.ts | incorporationCycle.test.ts (7) "finds every printed U.S. Steel seasonal date from the Master Course, Ch. 14" | 262067b 2026-09-28 |
| Replay context factors | lib/gann/contextFactors.ts: contextFactorsFor | per-trade measured context factor map | replay only | indirect: campaignLedger.test.ts | 6d18856 2026-09-28 |
| Macro cycle (Dow anchors projection) | lib/gann/macroCycle.ts: computeMacroCycle, MACRO_CYCLE_ANCHORS | recurring macro cycle windows | CARD (confluence/gann), contextFactors (replay) | macroCycle.test.ts (7) "keeps projecting past 1989 — cycles recur rather than firing once" | 1442963 2026-09-26 (added 8f87c1e) |
| Periodogram / spectral cycle | lib/gann/spectralCycle.ts: detectSpectralCycle | Schuster p, cosinor CI, hold-out | CARD only | spectralCycle.test.ts (8) "detects a clean embedded 20-bar sinusoidal cycle as dominant" | 4c0d1e9 2026-09-28 |
| Master 12 / Square of 52 / angle month-counts | masterTwelve.ts: masterTwelveLevels, nearestMasterTwelveLevel, squareMonthsFromPriceRange; squareOf52.ts: squareOf52Windows; angleMonthCounts.ts: angleMonthCounts, monthsElapsed | squares of time | CARD only | masterTwelve.test.ts (8), squareOf52.test.ts (7) "reproduces every disclosed week-count exactly", angleMonthCounts.test.ts (9) | 10d21e4 2026-09-16 (all three) |
| Decade-digit years | decadeCycle.ts: computeDecadeCycle | bull/bear by decade digit | CARD only | decadeCycle.test.ts (4) | 0c99a26 2026-09-16 |
| Digital root (numerology, confluence-only) | digitalRoot.ts: digitalRoot1to9, calculateGannDr, priceTimeConfluence, buildDigitalRootFeature, ... | DR price/time confluence | score.ts (gannRetracementConfluence stack via scanTicker), scanTicker, replay, CARD, lib/types.ts | digitalRoot.test.ts (23) | 9dce90a 2026-09-10 |
| Coordinate ledger | coordinateLedger.ts: buildCoordinateLedger | prior D/W/M high-low coordinates | CARD only | coordinateLedger.test.ts (5) | e22fbef 2026-09-09 |
| Square of 20 / Hexagon (research-only) | squareOf20.ts: ringAndAngleOf, dateToGridCell; hexagonChart.ts: centeredHexagonalNumbers, describeCrossConstructionConfluence | research constructions | **no consumers** (by design) | squareOf20.test.ts (9), hexagonChart.test.ts (5) | 10d21e4 2026-09-16 |
| Trader prefs: even-figure notices, rest twice a year | traderPrefs.ts: resolveGannRulePrefs, currentRestWindow, restReminderDue, REST_REMINDER_COPY | per-user Gann rule toggles; rest window | portfolio-manager, app/api/settings/gann-rules, components/gann/use-gann-rule-prefs | traderPrefs.test.ts (3) "opens a rest window at each half-year turn, including across the new year" | e82b0a6 2026-09-28 |
| Scorecard | lib/scoring/score.ts: computeScore, applyDataLagHold, applyBreakawayHold, applyStopBreachHold, applyReversionConfirmation; weights.ts: CRITERION_KEYS, TOTAL_POINTS=9, EXECUTE 6 / WATCH 3.5 | 9 Gann criteria + holds | scanTicker, replay | lib/__tests__/score.test.ts (22), gann.test.ts, default-weights.test.ts, validation/__tests__/criteria-gate.test.ts (9) "declares every scored criterion the scan actually uses" | 06d1124 2026-09-30 |
| Regime engine | lib/signals/regime.ts: classifyRegime | trend/range regime from Gann trend + HH/HL | signals pipeline (scanTicker) | signals/__tests__/regime.test.ts (4) "reads a clean, sustained uptrend as a bullish trend" | d4ef926 2026-09-27 |
| Series of losses | lib/risk/lossSeries.ts: readLossSeries, readUserLossSeries, LOSS_SERIES_LENGTH=3 | pause entries after 3 losses for that day + next | place-order.ts (every placement path; protective exempt) | risk/__tests__/lossSeries.test.ts (3) "pauses after three losses in a row, for that day and the next trading day" | 0fa4883 2026-09-28 |
| Position ceilings (≤10%-style %-of-capital risk) | lib/risk/position-limits.ts: checkPositionLimits; lib/risk/config.ts (ceilings); cooldown.ts: gateResolvedAction | four ceilings; circuit breaker | place-order.ts paper + live | risk/__tests__/position-limits.test.ts (6) "flags a single position over the 25% allocation ceiling"; cooldown.test.ts | position-limits 47108f8 2026-08-31; config 47108f8 2026-08-31; cooldown 0fa4883 2026-09-28 |
| Intraday scanner (session 50% point, Gann TP1 or none) | lib/scanner/intraday.ts: scanIntraday, sessionMetrics, gannFirstTarget, scoreConfidence | intraday alerts | intraday-scan route, setups/intraday card | lib/__tests__/intraday-scanner.test.ts (60), setups/__tests__/intraday.test.ts | 06d1124 2026-09-30 |
| Intraday replay profile (not run) | lib/backtest/replayIntraday.ts: replayIntraday, intradayPoint | intraday-scale Gann replay | backtest route `?profile=intraday` | lib/__tests__/replay-intraday.test.ts (12) "is a third of Gann..." | 06d1124 2026-09-30 |
| Live scan / coarse pre-filter | lib/scanTicker.ts: scanTicker (imports 15 gann modules); lib/marketScan.ts: runMarketScan, coarseReversion, coarseContinuation, hasTradePlan, rankShortlist (fans, retracement, timeCycles, volumeClimax) | per-symbol scan; universe pre-filter | market-scan route | market-scan-*.test.ts, cycle-ranking.test.ts | scanTicker 06d1124 2026-09-30; marketScan c99e4dd 2026-09-28 |
| Replay | lib/backtest/replay.ts: replay (imports 20 gann modules) | walk-forward measurement | backtest route | lib/__tests__/replay.test.ts (53), attribution.test.ts | 06d1124 2026-09-30 |

## 2. Parity roadmap matrix (docs/memory-bank/GANN_PARITY_ROADMAP.md Part 3)

Note: the matrix has no row IDs; IDs below are assigned here as section.row (T=Time, P=Price, R=Trend, E=Entries/exits, V=Volume, K=Risk, H=Trader, S=Astro). Gap IDs cited by the doc are given where present. Part 2 summary: 73 rules; 64 Aligned, 2 Partial, 0 Conflict, 3 Missing (research), 4 other.

### 3.1 Time
| ID | Rule (source) | Status | Code named |
|---|---|---|---|
| T1 | Time outranks price (A2.1, A2.2, A11) | Aligned | timeCycles.ts; pivot polarity |
| T2 | Count from every major pivot (A03; A2.1 Ch.13) | Aligned | `majorPivots` (lib/analysis/pivots.ts) |
| T3 | Cycle hierarchy 1–60 yrs (A2.1 Ch.7) | Aligned (M5 labelled) | MAJOR_CYCLE_YEARS, yearCycleConvergence |
| T4 | Convergence of cycles (G11) | Aligned (context, measuring) | yearCycleConvergence; timeConvergence.ts |
| T5 | Permanent annual calendar | Aligned (fixed 2026-09-27) | FIXED_CALENDAR_WINDOWS |
| T6 | Fractions of the year ranked (G8) | Aligned | squareOf52.ts, WHEEL_COUNTS, YEAR_FRACTIONS |
| T7 | Day-count bands (G17) | Aligned | DAY_COUNT_BANDS (timeCycles.ts) |
| T8 | Seasonal counts from Mar 20/21 | Aligned (context, measuring) | seasonalCounts.ts |
| T9 | Counter-move duration prior (G2, G24) | Aligned (context, measuring) | readCounterMove |
| T10 | Daily/weekly time rules | Aligned (context, measuring) | timeRules.ts; boilingPoint.ts |
| T11 | Time balancing (G22) | Aligned (context, measuring) | timePriceSquare.ts; campaign ledger; onTimeBalanceDate |
| T12 | Accumulation time | Aligned (context, measuring) | accumulation.ts |
| T13 | 7/14-day alternation (G9) | Aligned (context, measuring) | timeConvergence.ts |
| T14 | Incorporation anniversary (D3, G10) | Aligned (context, measuring) | incorporationCycle.ts |
| T15 | Periodogram (M1/M2) | Aligned | spectralCycle.ts |
| T16 | Master 12 / Sq 52 / angle month-counts | Aligned | masterTwelve.ts, squareOf52.ts, angleMonthCounts.ts |
| T17 | Decade-digit years | Aligned | decadeCycle.ts |
| T18 | Square of 20 and Hexagon | Research-only | squareOf20.ts, hexagonChart.ts |
### 3.2 Price and levels
| P1 | Range divisions | Aligned | retracement.ts, gannRetracementConfluence |
| P2 | % of extreme price (G13) | Aligned | pricePercentageLevels |
| P3 | Old tops = support | Aligned | historicalSR, levels.ts |
| P4 | Clustered levels averaged | Aligned | combineNearbyLevels |
| P5 | Double/triple tops | Aligned (context, measuring) | multipleTops.ts |
| P6 | 4th test goes through (G15) | Aligned (context, measuring) | readLevelTests |
| P7 | Square of Nine | Aligned | squareOf9.ts |
| P8 | Gann angles / 1x1 | Aligned (ATR-scaled) | fans.ts, normalizedSlope.ts, gannAngleSlope |
| P9 | Price = time squaring | Aligned | timePriceSquare |
| P10 | Even figures | Aligned | evenFigures.ts |
### 3.3 Trend
| R1 | Swing chart 3-day / 7-day weekly (X3, B1) | Aligned (B1 built) | swingChart.ts |
| R2 | Time trend turn | Aligned in structure | trendStrength.ts |
| R3 | Rule of Three D/W/M | Aligned | ruleOfThree.ts |
| R4 | Space Rule (G3, G14) | Aligned | campaignLedger.ts -> readGannTrend |
| R5 | Over-balance of time | Aligned | campaignLedger.ts |
| R6 | Monthly-low break (G6) | Aligned | campaignLedger.ts |
| R7 | Close vs bar midpoint (G1) | Aligned (context, measuring) | readBarMidpoint |
| R8 | Weekly 1-bar swing chart (G5) | Aligned (subsumed by B1) | swingChart.ts weekly |
| R9 | M>W>D hierarchy 7/30/365 | Aligned | readTrend, timeframeWeight.ts |
| R10 | Stock's own trend (X2 withdrawn) | Aligned | macroBreadthAgrees |
| R11 | Campaign sections 3–4 | Aligned | campaignLedger; exitRules final stage; `lateSection` |
| R12 | Sideways: trade the breakaway (decision 5) | Aligned | rangeReversion.ts, breakaway.ts, applyBreakawayHold |
### 3.4 Entries, stops, exits, lifecycle
| E1 | Cross old swing extreme + lost motion (C4) | Aligned | entryTrigger.ts |
| E2 | 3-point confirmation beyond level | Aligned | entryConfirmation.ts buffer |
| E3 | Stop at entry beyond level | Aligned | plan invalidation |
| E4 | Hold test (G4) | Aligned (live 2026-09-28) | exitRules.ts, pointScale.ts |
| E5 | 3 adverse closes | Aligned | exitRules.ts |
| E6 | Break-even (G23) | Aligned | exitRules.ts |
| E7 | Trailing stops (G18, G24) | Aligned | exitRules.ts |
| E8 | Never fix a target (X4) | Aligned | LIVE_EXIT_RULE, `gann-runner` |
| E9 | Entry confirmation every path (C5) | Aligned | place-order.ts |
| E10 | Pyramiding | **Partial** (not automated) | pyramid.ts |
| E11 | Reverse signal day; 7–10 Day Rule (G20) | Aligned (context, measuring) | extremeRules.ts |
| E12 | Gap rules (G21) | Aligned (context, measuring) | extremeRules.ts |
### 3.5 Volume
| V1 | Normal bottoms drying up; climax exception (X1, D1) | Aligned | volumeClimax.ts |
| V2 | Shrinking volume on lower low | Aligned | retestOnLowerVolume |
| V3 | Volume vs float (D2, G7) | Aligned (exit measured in replay) | capitalStock.ts, exitRules.ts |
| V4 | Shares-per-point | Aligned (context, measuring) | sharesPerPoint.ts |
### 3.6 Risk
| K1 | Risk ≤10%; equal risk | Aligned (percentage form) | lib/risk/*, checkPositionLimits |
| K2 | Series of losses (E1, G16) | Aligned | lossSeries.ts; cooldown.ts |
| K3 | No size-up after winning run | Aligned (structure) | sizing (no code named) |
| K4 | Close all twice a year, rest | Aligned | dashboard reminder (traderPrefs.ts) |
| K5 | Reward/risk 3–5 vs 1–2 | Aligned | plan R:R checks |
| K6 | Never trade impaired | Aligned (education) | loss-series pause; ticket reminder |
### 3.7 Trader / education
| H1 | Five qualifications | Aligned | School Academy 4 course |
| H2 | Seven Zones | Aligned (context, measuring) | sevenZones.ts |
| H3 | Early/late leaders; first-year high | Aligned (context, measuring) | leadership.ts |
| H4 | Never buy one to follow another | Aligned | stock-own trend |
| H5 | Dated forecasts | **Partial** (Owner) | macroCycle.ts "on branch claude/stoic-brown-p296wd" |
### 3.8 Astrology / numerology / forecasting
| S1 | Planetary averages (AS1) | Missing (research) | none |
| S2 | Active angles (AS2) | Missing (research) | none |
| S3 | Jupiter–Saturn, Saturn return (AS3, AS4) | Missing (research) | none |
| S4 | Eclipse longitudes | Excluded | none |
| S5 | Sacred numbers, digital root | Aligned (confluence only) | digitalRoot.ts |
| S6 | Name/letter numerology | Excluded | none |
| S7 | Master Time Factor | Cannot be copied | none |

## 3. Mismatches between the matrix and the code

1. **H5 / macroCycle is stale in both the roadmap and AGENTS.md.** Both say `lib/gann/macroCycle.ts` lives on the unmerged branch `claude/stoic-brown-p296wd`. It is on HEAD (added 8f87c1e, fixed 1442963 2026-09-26, merged via "Merge main (PR #285 macro cycle)" 6d18856). It is consumed by confluence/gann.ts (card) and contextFactors.ts (replay), and has 7 tests. The "bring onto this branch" next step is done; what is still open is the documented-record display the owner rule asks for.
2. **R1 (swing chart) reads "Aligned", but the scored `swingChartTrend` criterion was quarantined on 2026-09-30** in criteria-registry.ts. It measured against its sign on six-year runs 12, 22 and 23. The roadmap (last update 2026-09-28) does not mention this.
3. **E2 "3-point confirmation" vs the price-scaled 3 points.** `DEFAULT_CONFIRMATION_BUFFER_PCT` is a fixed 0.3% (entryConfirmation.ts:80), and `LOST_MOTION_BUFFER_PCT` in entryTrigger.ts aliases it. The exits and stopBreach moved to `pointScale.ts` (price-scaled 3 points) on 2026-09-28, after run 16 showed 0.3% was about a tenth of Gann's figure. Entry confirmation and the lost-motion buffer don't import pointScale. Either this is an intended difference (entry lost motion of about 1⅞ points vs a 3-point exit allowance) or it is the cross-surface gap AGENTS.md warns about. Nothing records which, and the E1 row's "≈1⅞, never 3 points" isn't price-scaled in code either.
4. **Stale "Next step" cells on rows marked Aligned and already built:** T6 ("Add the ranking to the output (G8)"), T7 ("G17: add the bands… Confluence first"), P2 ("G13: add as levels to retracement.ts", though it lives in disclosedRules.ts), P6 ("G15: an invalidation or confluence field"), R3 ("Apply on weekly and monthly", done in Stage A), R4/R5/R6/R11 ("build the ledger", built as campaignLedger.ts), R2 ("Re-verify after B1"), E9 ("**Owner**", already decided and built).
5. **T5 says "8 dated windows", but FIXED_CALENDAR_WINDOWS has 10 entries.** The ⅓ and ⅔ seasonal dates were added (T8 notes this). Only the T5 text is stale.
6. **Modules without a dedicated test:** lib/analysis/trend.ts (`readTrend`, which feeds every macro trend read) has no test file importing it. timeCycles.ts has no test in lib/gann/__tests__; it is covered only by lib/__tests__/gann.test.ts and cycle-ranking.test.ts. contextFactors.ts is tested only indirectly (campaignLedger.test.ts). fans.ts and squareOf9.ts are tested only in lib/__tests__/gann.test.ts. Four modules (seasonalCounts, accumulation, sharesPerPoint, leadership) share one 5-test file (missingRules.test.ts). sevenZones, pyramid, pointScale, traderPrefs and gann-exit-live have only 2–3 tests each.
7. **Context-only modules with a single consumer.** extremeRules, timeConvergence, timeRules, multipleTops, seasonalCounts, accumulation, sharesPerPoint, leadership and sevenZones are imported only by disclosedRules.ts. They do reach the live scan, the replay and the card through it, which matches "context, measuring", but none acts on a verdict, plan or exit yet. Under the owner's 2026-09-28 rule ("not parity-complete while it only shows on a card"), these are Aligned only in the measuring sense.
8. **The cycle squares are card-only:** masterTwelve, squareOf52, angleMonthCounts, decadeCycle, spectralCycle and coordinateLedger have no replay or contextFactors consumer, so they are never measured against outcomes. That fits "confluence only", but the matrix lists T15–T17 as plain "Aligned" without "(context)". squareOf20 and hexagonChart have zero consumers, as intended (research-only).
9. **E10 pyramid:** consumed by the replay and app/api/positions/pyramid/route.ts only. That matches "Partial, not automated".
10. **K1 risk:** position-limits.ts and config.ts were last changed 2026-08-31, before any Gann-citation pass. The matrix names `lib/risk/*` generically, and no Gann citation was added to those files in this program (cooldown.ts got its citation in 0fa4883).
11. **Intraday scanner** (lib/scanner/intraday.ts) imports only evenFigures from lib/gann. Its swing structure, 3-point allowance and stop-breach logic don't use swingChart, pointScale or stopBreach, while replayIntraday.ts uses all three. AGENTS.md records it as a separate system, but the live intraday alerts and the intraday replay profile now read different Gann primitives.
12. **Registry vs roadmap on "measured":** entryTriggerArmed, gannRetracementConfluence, ruleOfThree, breakaway and stopBreach are `unmeasured`. volumeClimax and timePriceSquare are `hypothesis`. Only historicalSR is `validated`. The matrix's "Aligned" counts don't reflect that Part 6 test 3 ("Measured") is unmet for most scored rows.

## 4. CRITERION_KEYS (lib/scoring/weights.ts:68) and registry status (lib/validation/criteria-registry.ts)

TOTAL_POINTS = 9; EXECUTE_SCORE_THRESHOLD 6; WATCH_SCORE_THRESHOLD 3.5.

| key | registry evidence | source named |
|---|---|---|
| swingChartTrend | **quarantined** (2026-09-30; inverted on six-year runs 12/22/23) | score.ts, swingChart.ts |
| gannAngleSlope | **quarantined** (starved: ~2% pass rate on 15Min/1Hour) | score.ts |
| volumeClimax | hypothesis | score.ts, volumeClimax.ts |
| historicalSR | validated | score.ts |
| entryTriggerArmed | unmeasured | score.ts, entryTrigger.ts |
| stopRoom | **quarantined** (saturation; us_equity branch) | score.ts |
| timePriceSquare | hypothesis | score.ts, timePriceSquare.ts |
| gannRetracementConfluence | unmeasured | score.ts |
| ruleOfThree | unmeasured | score.ts, ruleOfThree.ts |

Retired (kept for historical payloads): patternArmed (to 2026-09-17), adxTrendStrength (2026-09-16), momentum (2026-09-08), fanProximity, masterStructural, hourlyTrend, macroTrend, timeCycle, harmonicProximity (all 2026-09-10).
Non-scored holds/gates registered as unmeasured: tradePlanPriced, reversionConfirmation, breakaway (lib/gann/breakaway.ts), stopBreach (lib/gann/stopBreach.ts), dataLag (lib/data/latency.ts); plus per-state rulesAlignment and disqualifiers entries.

## 5. vitest for lib/gann

**Not run.** The repo has no `node_modules` (no `vitest` or `vite` installed). `npx vitest run lib/gann --reporter=dot` pulled vitest@5.0.5 into the npx cache and failed at startup with `ERR_MODULE_NOT_FOUND: Cannot find package 'vite'`. Under the no-install constraint, I couldn't get a pass/fail count. Static count: 36 test files in lib/gann/__tests__ with about 268 `it(`/`test(` cases. Out-of-folder coverage of gann modules is lib/__tests__/gann.test.ts (20 cases) and cycle-ranking.test.ts (13).
