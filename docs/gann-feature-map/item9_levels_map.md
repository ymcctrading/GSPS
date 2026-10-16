# Item 9 map: Gann's price and level rules (A-LEVELS, A-PRICE, C-LEVELS, C-PRICE, C-NUMEROLOGY)

This is a read-only analysis of `/home/claude/gsps-item5s4`, branch `item5-step4`, at `031cc42` ("A-ENTRY-20: name the double top after a heavy earlier top"). Line numbers are for that commit. Tests were not run for this map; test names come from reading the files.

**Sources:**
- `gann_features.json`: 48 entries with these prefixes. **C-LEVELS-17 already passes**, which leaves 47 with `passes: false`. Of these, 11 are class A, 20 class C, 12 UNVERIFIABLE and 4 UNDISCLOSED.
- `PLAN.md` "Full parity order", item 9 ("Price and levels", moves the verdict).
- W006 detailed notes (`/mnt/project-files/literature-reading-output/works/W006/detailed-notes.md:33-89`). The same folder holds W001 (l.69-76), W036 (l.85, 139-152), W046 (l.15-16), W003 (l.36-47), W031, W033 (l.14-23), W009 (Hayashi-free SQ9 table), W011, W007 (l.62-70), W049 (l.27-46) and W023 (Hayashi workbook, `summary.md:13-20`).
- **Gann's own long books in the checkpoint** (`…/external/checkpoint_latest/unzipped/literature-reading-output/works/`). Its numbering differs from the main folder's:
  - W023 there is the *Master Stock Market Course* (l.31-37, 110-121, 148-163, 438-454, 542, 644-652);
  - W004 is *How to Make Profits in Commodities* (HTMPC, l.65-71);
  - W009 is *45 Years in Wall Street* (Ch. IV, l.49-59).
- `docs/gann-feature-map/item1_sweep_review.md:20-21`, `item5_map.md:69-73, 212`, `item6_trend_map.md:131-137, 216, 417-418`, `cluster_C_secondary.md:41-192`.

**Status:**
- `STRATEGY_VERSION` today is `2026-10-16-gann-distribution-hold` (`lib/backtest/strategyVersion.ts:204`).
- Today is 2026-10-16, roadmap phase Q1. Item 9 is out-of-phase parity work (PR phase `N/A`, direct owner request).
- Class C rules stay context-only and never gate. C-NUMEROLOGY entries need a citable spec (AGENTS.md "WD Gann precedence", numerology rule).

## 0. How GSPS reads levels today (verified)

| Step | Code | What it does | Live / replay |
|---|---|---|---|
| **S/R lists** | `lib/analysis/trend.ts:36-42` `readTrend` | `findPivots(bars,3)`. **Support = pivot lows below price only; resistance = pivot highs above price only.** Clustered at 1% (`pivots.ts:81-95`), sorted by touch count, top 5. A crossed old top (a high now below price) is in **neither** list. | Live: monthly (10 y provider), weekly (5 y provider), daily (1 y) (`scanTicker.ts:160-162`, `provider.ts:190-199`). Replay: monthly and weekly rolled up from `priorSessions` (≤6 y), and daily ≤6 y (`replay.ts:563-567`, 743). **Different bars, so different lists.** |
| Level pool | `scanTicker.ts:338-347`, `replay.ts:588-597` | The three S/R lists plus `majorPricePercentageLevels` (50% and 100% above the low, 50% of the high; `disclosedRules.ts:182-190`). The anchors are the extremes of `[...monthly, ...daily]`. | Live: 10 y monthly. Replay: `priorMonthly` from `monthlyChartFrom` (`run.ts:359`), up to about 16 y on late sessions. |
| **historicalSR (scored)** | `score.ts:445, 519-531`; `levelRole.ts:69-71` | Passes when the nearest pool level within `srBandPct` has the wanted role (support for a long). The role comes from which side of the level price is on. The test count note uses `countLevelTests` (`levelRole.ts:23`). | Live `scanTicker.ts:377-379, 433-436`. Replay `replay.ts:605-606, 640-643`. |
| Coarse pass | `marketScan.ts:402-403` | +2 when near `trend.support` (long) or `trend.resistance` (short). | Live only. |
| **Stops and targets** | `strat/levels.ts:228-269, 331-410` | The stop goes 3 points beyond the nearest support inside 3-15% (20% on large caps); nearby levels are combined at 1% (`:208`). TP1 is the nearest level in the 3-15% band from `gannTargets ∪ S/R ∪ even figures`. The master is the next level within 30%. | Live `scanTicker.ts:313-316, 362`. Replay `replay.ts:1309-1312`. `gannTargets` = **ATR fan-line prices + Square of Nine prices** on both. |
| Entries on old levels (acts) | `entryTrigger.ts:243-311` (crossing and held reaction), `:343-400` (`oldLevel`: double/triple bottom, **3-point band**), `:890-913` (`olderGannLevels`: prior years and the record) | Gann's crossing of an old top, the reaction buy at the crossed level, and the resting buy at an old bottom. | Same on both surfaces via `entryChartBars` (52 weeks, completed sessions; `entrySelection.ts:62-76`) and the monthly chart from `monthlyChartFrom`. |
| Context: tests, tops, percentages | `disclosedRules.ts:328-361` `readLevelTests` (1%, support from bottoms only); `multipleTops.ts:34, 63-91` (1%, `failed` only at ≥3 tests); `disclosedRules.ts:192-205` `readPricePercentages` | Card and `contextFactors.ts:54-59, 161-166`. Nothing acts. | Both read **`dailyBars`**: 1 y live, ≤6 y replay (`disclosedRules.ts:528-576`, `replay.ts:648`, `confluence/gann.ts:256`). |
| Angles | `fans.ts:72-105` (1x4…4x1 from the last `findPivots(…,4)` high and low; **unit = `atr(bars,14)` at the current bar**, l.74); `normalizedSlope.ts:75`; `timePriceSquare.ts:62` | Fans go to targets and the card. `gannAngleSlope` is scored but quarantined (`score.ts:501`). | Same function on both. Live daily may hold a forming bar (unverified; see item 8 §0). |
| Square of Nine | `squareOf9.ts:29-66, 87-111` | `(√anchor ± deg/180)²` from the last pivot high and low, at 45° steps. | Targets (above), card. Both. |
| Retracement + digital root (scored) | `score.ts:433-441, 579-590` | `gannRetracementConfluence` passes only when a retracement level matches **AND** the digital-root confluence (`digitalRoot.ts:227`) is not `NO_CONFLUENCE`. | Live `scanTicker.ts:201-206`. Replay `replay.ts:581-586`. |
| Even figures | `evenFigures.ts:79-216` | Targets just short of a figure, a stop moved beyond one, card notice, automation hold. | Plans on both; card. |
| Stop breach | `stopBreach.ts:94-189`; `score.ts:775-790` | A pre-stated stop retires the plan. A failed break reinstates it. | Live `scanTicker.ts:410-417`; replay documented. |
| School and exam | `curriculum.ts:365-379` (old highs and lows flip: "when price breaks above an old high…"), `:389-407` (halfway point and round numbers), `:708-721, 990-991` (entries); `graduationExam.ts:208-283` | Lessons teach the flip. **The code's S/R lists don't flip** (A-LEVELS-01). | n/a |

**Live and replay read different bars for levels.** This is the main parity gap for item 9:
- The scored `historicalSR`, the stop anchor and the target pool all come from `readTrend` lists. Those lists are built from 10 y/5 y/1 y provider bars live and from up to 6 y of rolled-up sessions in the replay.
- With `clusterLevels` ranking by touch count and keeping 5, a longer history picks different levels.
- `multipleTops`, `readLevelTests` and `readPricePercentages` read 1 y live against up to 6 y in the replay.
- The entries do not have this gap: `entryChartBars` and `olderGannLevels` already fixed it (item 5).

## 1. Entry-by-entry map

Legend for "Today": (a) prices or arms plans, (b) scored, (v) acts another way, (c) context or card only, (e) nothing.

### Class A

#### A-LEVELS-01: old tops become bottoms, old bottoms later become tops
- **Source:** W006 p.13 ("My rule is that old tops become bottoms…", 1931's 120 against the 1919 top), p.24, pp.40-41. Verified (W006:42). **Class A.** Failed review (`item1_sweep_review.md:20`).
- **Today (a)(b), differs:**
  - `levelRole` flips by side (`levelRole.ts:69-71`), but its inputs never contain a flipped level: `readTrend` keeps lows below price and highs above it (`trend.ts:38, 41`), and so does `readLevelTests` (`disclosedRules.ts:350-357`).
  - So a crossed old top never reaches `historicalSR`, the stop search (`levels.ts:249-269`) or the coarse +2 (`marketScan.ts:402`).
  - **Only the entry acts on the rule:** the held reaction buy at the crossed level (`entryTrigger.ts:281-298`).
- **Surfaces:** live scan, coarse, replay, levels.ts (stops/targets), card (`readLevelTests`), school (`curriculum.ts:372`, already teaches it).
- **Smallest change (FL1):** build the support list from **every** pivot price below price (highs and lows) and the resistance list from every one above. Under FL1 (a), a high joins support only once a close has cleared it by `gannThreePoints` (`pointScale.ts:56`); until then it stays resistance. Make the same change in `readLevelTests`.
- **Moves the verdict:** yes (historicalSR, coarse, stops, targets). Bump the version and run a 766-symbol replay. Report historicalSR's pass rate against the saturation bounds.
- **Failing test first:** `lib/analysis/__tests__/trend.test.ts` (or `levelRole.test.ts`). Bars with a 3-Day top at 100, a close at 104 (more than 3 points past it) and price at 101: `readTrend(...).support` contains ≈100, and `computeScore` for a long passes `historicalSR` on it. Mirror for a broken bottom. Fails today.
- **Live vs replay:** different (§0). Fix the spans first (build step 4).
- **Engineering labels:** pivot strength 3, cluster 1%, top 5 (existing, unlabelled; label them).

#### A-LEVELS-05: in bear markets old tops act as support; a rally failing just below an old top (119 vs 120) keeps the bear on
- **Source:** W006 p.24 (1931 broke 120 by 3 points, then 110 (1916 top); the Nov 1931 rally failed at 119). Verified (W006:72). **Class A.**
- **Today:**
  - The first half has the same gap as -01: the 110 top below price is never support.
  - For the second half, `readGannTrend`'s lower top keeps the read bearish by construction. Untested.
- **Smallest change:** none beyond FL1. Add a pin for the second half.
- **Failing tests:**
  - `trend.test.ts`. Dow 1930-31 scaled: after a 3-point break of a 120 top, a 110 old top below price is in `support`. Fails today.
  - The rally to 119 under the 120 top leaves `readGannTrend(...).direction` bearish and `levelRole(119,120)` resistance. Likely passes; it is a pin.
- **Moves the verdict:** via FL1 only.

#### A-LEVELS-06: a low not 3 points under the old lows shows good support (64 vs 66; 40½ vs 43)
- **Source:** W006 p.11 (Aug 1921) and p.24 (Jul 1932). Verified (W006:23, 70). Corroborated by Master Course "double/triple ranges within 1-3 points; 3 full points = a definite signal" (checkpoint W023:454). **Class A.**
- **Today:**
  - **(a) acts** in `computeGannOldLevelEntry`: the bottoms within 3 points since the last 3-point break count as one level (`entryTrigger.ts:369-386`).
  - **(c) differs** in context: `multipleTops` clusters at 1% (`multipleTops.ts:34, 50`), and so do `readLevelTests` (`disclosedRules.ts:328`) and `clusterLevels` (`pivots.ts:81`).
  - The entry's `gsps_location` is partly stale: entries already use 3 points.
- **Smallest change (FL2 a):** `multipleTops.TEST_TOLERANCE_PCT` and `LEVEL_TEST_TOLERANCE_PCT` become `gannThreePointsPct(level)`. A low that undercuts by less than that is a test, not a break. Context only, so no version bump.
- **Failing test (as written):** `lib/gann/__tests__/multipleTops.test.ts` (new). Bottoms at 66 then 64.
  - At that price 3 points is about 4.3%, so 64 counts as a second test (`tests=2`, state `testing`).
  - A low at 62 (6% under) starts a new level.
  - Fails today at 1%.
- **Live vs replay:** `multipleTops` reads `dailyBars`: 1 y against ≤6 y. Slice to `entryChartBars` on both, as the entries do.
- **Base-rate check:** at $42.50 the band is ±7%, so report the cluster saturation on random walks before and after.

#### A-LEVELS-04: failing to pass an old top (a double top), especially on a third test, is a top
- **Source:** W006 pp.14-15 (Feb 1934's 111½ double top: failing to pass 112 was the top) and p.44 ("the third time at the same level was signal of top"). Verified (W006:44-46). **Class A.** Failed review (`item1_sweep_review.md:21`).
- **Today:**
  - **(c)** `multipleTops` sets `failed` only at `tests >= 3` (`multipleTops.ts:79-86`). A failed double top stays `testing`, then drops past 3% (l.88).
  - The factor `thirdTestFailedAgainstTrade` is context (`contextFactors.ts:161-166`).
  - **(a)** Item 5's `oldLevel` short already sells the second or third test of a top (`entryTrigger.ts:343-400`), so the *short* half acts.
  - Nothing holds or exits a **long** under a failed top.
- **Smallest change:**
  - Context: `failed` at `tests >= 2` once a close is back under the level by 3 points (FL2's band), keeping `tests` so the card says double or triple.
  - Then FL3 (a): `applyFailedTopHold` on the `applyDistributionBreakdownHold` template (`score.ts`). It holds a long Execute to Watch while a failed double or triple top stands within the trade's TP1 path. Wire it at `scanTicker.ts:412-417` and the replay's hold chain. `readGannExit` exits a long when such a failure prints after the fill. Shorts mirror at bottoms.
- **Moves the verdict:** yes under FL3 (a). Bump the version and run a replay.
- **Failing tests:**
  - `timeRulesAndTops.test.ts`: a double top (two 3-Day tops within 3 points) followed by a close 3 points under reads `state: "failed", tests: 2`. Fails today.
  - The cited triple-top test stays.
- **Live vs replay:** 1 y against ≤6 y (`dailyBars`). Slice as in -06.

#### A-LEVELS-02: the top of a secondary rally is always an important point to watch
- **Source:** W006 p.13 (the secondary rally to 297 on 17 Apr 1930). Verified (W006:42). **Class A.** The verb is "watch".
- **Today (a), differs:** the crossing reads the last completed 3-Day top, any top (`entryTrigger.ts:254-262`). No "secondary rally" is identified anywhere. The volume rule's lower secondary top (`volumeClimax.ts:176-184`) is a volume reading, not a level.
- **Smallest change:** add `secondaryRallyTop` from the campaign ledger (`campaignLedger.ts:160`): the top of the first rally after the first down section from a major top. Put it on the card, add it to the S/R pool as a resistance level (support once crossed, FL1), and add the factor `belowSecondaryRallyTop`. Context first. Joining the pool moves historicalSR, so bundle that part with FL1's replay.
- **Failing test:** `campaignLedger.test.ts`. The Dow 1929-30 shape scaled (386 → 198 → 297 → 155) names 297 as the secondary rally top. The cited `entryTrigger` test stays as it is.
- **UNSPEC:** Gann defines "secondary rally" by example only. The campaign ledger's first counter-section is the engineering choice.

#### A-LEVELS-03: after a 3-point break of the previous bear-campaign bottom, look to the next older campaign bottom, then the next
- **Source:** W006 pp.23-24 (from 1929: the 1923-24, 1921, 1917, 1914, 1907, 1903-04 and 1896 lows). Verified (W006:70). **Class A.**
- **Today (e), differs:**
  - Monthly `readTrend` support is the top 5 lows by touch count, unordered by age (`trend.ts:37-39`).
  - `olderGannLevels` lists prior calendar years and the record (`entryTrigger.ts:890-913`), not campaign bottoms.
  - No "next older" walk exists.
- **Smallest change (FL7 a):** `campaignBottoms(monthly)` from `majorPivots(findPivots(monthly,3))` lows (the anchors `readMonthCounts` uses, `angleMonthCounts.ts:189`), ordered newest first. When the nearest has been broken by 3 points, the next older one is `nextCampaignSupport`.
  - Context first.
  - Then it joins a short's target pool and a long's watched support, which moves plan levels (version bump).
- **Failing test (as written):** `lib/__tests__/equity-levels.test.ts`. After a 3-point break of the nearest campaign bottom, the next support offered is the next older campaign bottom.
- **Live vs replay:** must read the same monthly span. Live has 10 y (13 y in `monthlyLong`); replay `priorMonthly` reaches further back on late sessions. Pin the span to `OLDER_LEVELS_YEARS` (`entryTrigger.ts:873`) on both.
- **Data limit:** the feed reaches about 2016-17 (run 47). Gann's ladder spans 33 years. Record this as an exception by data.

#### A-PRICE-01: moves speed up above 50, faster above 100, very wide above 150-200; the first 50-100 points down from an extreme high fall fastest
- **Source:** W006 pp.22-23. Verified (W006:66). **Class A.** No act-verb.
- **Today (e):** `pointScale.ts:51-55` scales only the allowance, not a speed reading.
- **Smallest change (FL10 a):** a context field `priceZone` (`<50`, `50-100`, `100-150`, `150-200`, `>200`), in Gann's literal dollars and labelled. Add `firstFallFromHigh` (price within 100 points under the 52-week high after a top). Card line, factor and a School line. No version bump.
- **Failing test:** `lib/gann/__tests__/priceZone.test.ts`. $45 reads `<50`; $160 reads `150-200`; a fall of 60 points from a 300 top reads `firstFallFromHigh`. The cited `pointScale` test stays as it is.
- **Live vs replay:** same (the price, plus a 52-week high from `entryChartBars`).

#### A-PRICE-02: speed is a movement in price during a unit of time
- **Source:** W001 p.11. Verified (W001:76). **Class A.** A definition.
- **Today, differs:** `normalizedSlope` measures in ATR per bar (`normalizedSlope.ts:31-39`). Its parameter is named `atrAtAnchor`, but callers pass the current ATR (`:75`; copy fix).
- **Smallest change:** add `pointsPerDay` (and per week and month, calendar time) to `AngleSlopeReading`. Raw price units. Context only.
- **Failing test (as written):** `normalizedSlope.test.ts`. A move from 100 to 130 over 30 calendar days reads 1.0 point per day. The cited ATR test stays.

#### A-PRICE-05: a 45° line from a major low at a fixed number of points per month (coffee 435 + 30 × 276 = 8715)
- **Source:** W046 p.1. Verified (W046:15-16; the printed "50" is a slip for 30). Master Course: "45° = 1 point per month", with angle rates of 8, 4, 3 and 1½ per month and a scale of 1 point per ⅛ inch (checkpoint W023:110-111; also 1° per month on a 45°, W023:652). **Class A.**
- **Today (b, quarantined)(a), differs:** fans and `gannAngleSlope` use one ATR per trading bar (`fans.ts:74`). Fan prices are plan targets (`scanTicker.ts:313-316`).
- **Smallest change (FL4 a):** a separate `monthlyAngle(low, lowDate, pointsPerMonth, asOf)` on the monthly chart, in calendar months.
  - `pointsPerMonth` is a labelled per-instrument input: the Master Course's 1 per month for stocks, and 30 for the coffee test.
  - Context and card first. The ATR fans stay, labelled as engineering, until a replay compares the two.
- **Moves the verdict:** no as context. Yes under FL4 (b).
- **Failing test (as written):** `lib/gann/__tests__/fans.test.ts`. A 1x1 from 435 at 30 points per month reaches 8715 after 276 months.
- **UNSPEC:** Gann never says how to choose points per month for a market.

#### A-PRICE-06: expected annual range (9-12 points on the averages, 20-30 on active stocks; wheat 30-35¢)
- **Source:** W036 p.12 (l.85), p.22 (l.139). Verified. On the same page Gann says "you must not depend too much on the number of cents… watch the dates" (W036:139). **Class A.** Forecast-specific.
- **Today (e).**
- **Smallest change (FL11 a):** context `expectedAnnualRange` = the median calendar-year high-low of the symbol's last completed years, in points. Same 10 calendar years on both surfaces. Gann's 1921 numbers are not ported.
- **Failing test (as written):** `lib/gann/__tests__/annualRange.test.ts`. A per-instrument expected annual range is reported as context from the symbol's own history.

#### A-PRICE-07: state a conditional price trigger in advance (May wheat at 1.08 after Jan 25 → 95-92¢; a rally to 116 reverses the trend)
- **Source:** W036 pp.22-23. Verified (W036:141, 152). **Class A.**
- **Today (v):**
  - Every plan pre-states its trigger (`entryTrigger.ts:274-277`) and its stop.
  - The stop retires the plan (`stopBreach.ts:163`, `score.ts:775`, `lifecycle/retire.ts`).
  - The cited test covers only the retiring half.
- **Gap:** no test pins that both levels are stated before the event and each acts. Gann's "after Jan 25" (a date condition) has no counterpart beyond plan expiry. **UNSPEC** for equities.
- **Smallest change:** test only.
- **Failing test (pin):** `stopBreach.test.ts`. A plan priced on day 0 keeps its trigger and stop. A later close past the trigger arms it (`confirmNow`), and a later breach drops it to Reject with the stop unchanged. Likely passes. Then review.

### Class C (context only; never gate)

- **C-LEVELS-01** (W003 p.16: squares of integers and the midpoints between them, "not tradable alone"; verified W003:36).
  - (e).
  - Add `integerSquareLevels(price)` (n², (n²+(n+1)²)/2) as a card line only. It must not join `gannTargets` or the S/R pool.
  - Test as written: `gann.test.ts`. Around 110 the set contains 100, 110.5 and 121, and no scored criterion reads it (grep pin).
- **C-LEVELS-08** (W003 p.20: square from a high; a 1x1 from 60 reaches 0 on day 60; verified W003:46).
  - Differs: ATR units.
  - The Master Course's "square of distance: a 100-point fall needs about 100 months" (checkpoint W023:148) is Gann's own monthly version.
  - Builds on FL4's fixed-scale angle: the test is `monthlyAngle(60, …, 1 per day)` reaching 0 on day 60. Context only.
- **C-LEVELS-10** (W003 p.20: angles from the 50% mark).
  - (e).
  - Add a midpoint-anchored fan as a separate function. It must not feed `gannTargets` (`computeFanLines` does).
  - **UNSPEC:** the time origin of a 50% angle. Label it as engineering (the bar where price last crossed the midpoint).
  - Test as written.
- **C-LEVELS-12** (W007 p.65: Gann's "Even Squares for Cotton & Eggs", 16×16, 30 points a cell).
  - (e).
  - A research-only module with no consumer, like `hexagonChart.ts`. Test as written.
- **C-LEVELS-14** (W009 table: (n+k/8)² per 45°).
  - (c), differs by convention.
  - **Gann's own Master Course diagonals (3, 13, 31, 57, 91; 7, 21, 43, 73, 111; checkpoint W023:163) step about +2 in √price per 360°.** That is GSPS's `deg/180` (`squareOf9.ts:42`) and M-P7 (180° = +1).
  - GSPS's 360° level from 3, 13, 31 and 57 gives 13.93, 31.42, 57.27 and 91.20 (checked here). W009's step would give half the rotation.
  - Keep GSPS. Test-only pin that records the convention, which satisfies the entry's "or the convention difference is recorded".
- **C-LEVELS-15** (Hayashi 33×33 wheel, CF and Step, 22.5° rays).
  - (e).
  - Research-only grid, no consumer. Test as written. Not on any surface.
- **C-LEVELS-16** (Hayashi hexagon 1-1,518 with a Step).
  - Gann's own Ch. 15B rings 1, 7, 19 … 397 (checkpoint W023:644) equal `HEXAGON_RINGS` (`hexagonChart.ts:45-54`), so GSPS follows Gann.
  - Pin: `centeredHexagonalNumbers(23)` ends at 1,519, so 22 full rings cover Hayashi's 1,518. The Step input is Hayashi's and is not adopted. Test only.
- **C-LEVELS-18** (W031: fraction-angle pairs).
  - **Built**: `RETRACEMENT_ANGLE_PAIRS` (`secondaryTime.ts:236-246`, item 7, C-TIME-39 passes). The entry's "none" is stale.
  - Test-only pin in `gann.test.ts` against that table.
- **C-LEVELS-19** (W031: breaking an angle doesn't mean the next).
  - Consistent by absence: no exit or stop reads a next fan line (`exitRules.ts`, `levels.ts`).
  - Note: fan prices **do** sit in the TP1 pool (FL6).
  - Pin as written.
- **C-LEVELS-20 to -24, C-PRICE-04** (Jensen W049: fixed $1/day calendar scale, the square of 90 with square/trine points, adding points to the low, the protractor table, parallelogram balance, converging lines from double bottoms).
  - (e), or differs (`angleMonthCounts.ts`, fans).
  - **The reading notes find no Gann attribution:** "Gann relevance: None direct… Treat any resemblance as parallel, not lineage" (W049:46).
  - FL9 (a): hold, don't build.
- **C-LEVELS-25** (astral points, key withheld) and **C-NUMEROLOGY-02** (planetary magic squares, "not sourced to Gann").
  - Never built: no operational rule, and the second has no Gann source.
- **C-PRICE-02** (W003 p.21: 1, 2, 3, 4, 7, 9 and 12 times the low; verified W003:47).
  - Differs: `pricePercentageLevels` stops at 2× (`disclosedRules.ts:153-171`).
  - Gann's own *45 Years* Ch. IV ranks "100% of the low and multiples" second after 50%, with proofs at 500% of 64 and 1250% of 28.50 (checkpoint W009:51-54). HTMPC p.32: "divide the low by 8; 50%, 75% and 100% are the key points" (W004:65).
  - FL8 (a): after a page check, add Gann's integer multiples within the record's range. W003's 7/9/12 list stays out.
  - Test as written: from a low of 10, the levels include 30 and 40 (Gann's multiples). 70, 90 and 120 only under FL8 (b), as context.
- **C-PRICE-03** (W033: 1184 × 2 = 2368).
  - (b) through the pool: '100% above the low' is in `majorPricePercentageLevels`. It stands on Gann's 45 Years and HTMPC (M-P2), not on this class C entry.
  - Test-only pin: the price is 2368 (`disclosedRules.test.ts:42-49` asserts only the label and importance).
- **C-NUMEROLOGY-04** (W011: digital roots of 30° steps cycle 3-6-9).
  - (c) `digitalRoot.ts:20`. Arithmetic mod 9, true by construction.
  - Test-only pin as written; it carries no market claim.
  - **But see FL5:** the same module gates the scored `gannRetracementConfluence` (`score.ts:438-441`).

### Held

- **UNDISCLOSED (never built):**
  - A-PRICE-03 (price in or out of balance with time);
  - A-PRICE-04 (True Trend Line);
  - A-LEVELS-07 (Corner Stone, Key Stone, Cap Stone);
  - A-LEVELS-08 (Major Motors round number). Even figures stand on other sources (`evenFigures.ts:1-15`; Master Course "watch selling at 100, 200 and 300", checkpoint W023:542).
- **UNVERIFIABLE (12): status unchanged, but the checkpoint now holds Gann's own text for most of them.** Recommend an F0-style page check, then *new* class A entries; never edit the entry text (FL12).
  - **C-LEVELS-02 (angles from tops and bottoms):** Master Course "draw angles from successive higher bottoms and lower tops" (W023:150).
  - **C-LEVELS-04 (angles from zero):** "8x1 from 0 and from 90 cross at 45" (W023:115).
  - **C-LEVELS-05 (angles from double bottoms):** "crossing of the 45° from 1B and the 2x1 from 2B at 48" (W023:249).
  - **C-LEVELS-09 (angle ranking):** "draw the 45° first, then the 2x1s, then 4x1 and 8x1"; "90° strongest" (W023:110, 121).
  - **C-LEVELS-11 (50%, centre of gravity):** HTMPC "½ gravity center" and "you can make a fortune by following this one rule" (W004:68-69); Master Course "best buying point: 50% of the highest price" (W023:35); 45 Years ranks 50% first (W009:51). GSPS already ranks it first (`retracement.ts:46-57`).
  - **C-NUMEROLOGY-03 (144 grid):** Master Course "Master 12" chart: "squares end at 144, 288, 432 and 576", "TIME, SPACE OR VOLUME", "Breakout: 3 points into square #2 (147)" (W023:154-158). This is the citable spec AGENTS.md asks for, for the 144 multiples only. W011's 18/36/54/72 steps have no Gann cite. Note that `masterTwelve.ts` is a base-12 spiral, a GSPS reconstruction, not this grid.
  - **C-LEVELS-03/-06/-07:** substance already covered by A-LEVELS-01 and -04 and W006 p.20. Nothing to build beyond those.
  - **C-LEVELS-13, C-NUMEROLOGY-01, C-PRICE-01:** no Gann text found. The measured move in `trendBreakout.ts:321-322` is a class C / UNVERIFIABLE target fallback in the Signal & Regime Engine's plan. Flag it for item 11 rather than item 9.
  - The adjacent **M-P1, P2, P4, P6, P7, P9 and P10** (UNVERIFIABLE, outside the prefixes) are page-checkable the same way. Examples: HTMPC "Near Same Levels" (W004:70, M-P4) and "dangerous to buy at the fourth test" (W004:72, M-P6).

## 2. Conflicts and copy-vs-code findings

1. **Square of Nine step.** W009 has (n+k/8)² per 45° (+1 √ per 360°). Gann's Master Course wheel and M-P7 have +2 per 360°. GSPS follows Gann. Record this, and don't adopt W009 (C-LEVELS-14).
2. **Hexagon.** Hayashi's grid runs to 1,518 with a Step input; Gann's Ch. 15B lists rings to 397. GSPS follows Gann.
3. **Breaking an angle.** W031 says price need not go to the next angle; W003 p.20 says "breaking the 1x1 means weakness to the next angle" (W003:46). Both are class C, and nothing is built either way.
4. **The same-level band.** W006 says 3 points (A-LEVELS-06); the Master Course says 1-3 points; Jensen says 1 point (W049:37); GSPS context uses 1%. FL2.
5. **Multiples of the low.** W003 lists 1, 2, 3, 4, 7, 9 and 12×. Gann's 45 Years says "100% of the low and multiples"; HTMPC says eighths up to 100%. FL8.
6. **Points per month.** Coffee's printed 50 is a slip for 30 (NOTES). The Master Course gives 1 per month for stocks. Gann never gives a rule for choosing the rate. FL4.
7. **The annual range.** Gann discounts his own cents figure on the same page (W036:139), so it stays context only (FL11).
8. **The digital root gates a scored Gann rule.** `gannRetracementConfluence` (`score.ts:438-441`) requires a digital-root confluence (class C, W011, arithmetic) on top of Gann's own retracement rule. That breaks "class C never gates" and the numerology rule's spirit (`criteria-registry.ts:536-543` calls it a deliberate AND). FL5.
9. **Copy fixes, no behaviour change:**
   - `squareOf9.ts:4` and `masterTwelve.ts:107-108` say one rotation "multiplies sqrt(price) by 2"; the code *adds* 2.
   - `score.ts:91-96` says `timePriceSquare` counts the raw price move at one point per day; the code uses ATR units (`timePriceSquare.ts:62-75`).
   - `normalizedSlope.ts:31` names a parameter `atrAtAnchor`, but callers pass the current ATR (`:75`).
   - `masterTwelve.ts:1-20` presents its spiral as the Chapter 13 construction, while the Master Course describes the Master 12 as a 12×12 grid ending at 144, 288, 432 and 576 (checkpoint W023:154).
10. **School vs code.** `curriculum.ts:372` teaches that an old high, once broken, becomes support. The code's S/R lists can't hold such a level (A-LEVELS-01). Align after FL1.
11. **Class C in the target pool.** ATR fan prices (not Gann's scale) and Square of Nine prices are TP1 and master candidates (`scanTicker.ts:313-316`, `replay.ts:1312`). FL6.

## 3. Owner forks (recommendation first)

- **FL1 (A-LEVELS-01/-05): when a crossed level changes sides.**
  - **(rec) (a):** an old top joins support once a close clears it by Gann's 3 points (W006 p.20's crossing). Until then it stays resistance under test. Mirror for bottoms. Applies to the S/R lists, `readLevelTests`, historicalSR, the coarse pass, stops and targets.
  - (b) On any print through it (`levelRole` today).
  - (c) Keep same-side lists (today; fails both entries).
- **FL2 (A-LEVELS-06): the band for "the same level".**
  - **(rec) (a):** Gann's 3 points (`pointScale`) for tests of a level (`multipleTops`, `readLevelTests`), as the entries already use. Leave `clusterLevels` and `combineNearbyLevels` at 1%: that is the separate A8 "near same levels" rule, labelled.
  - (b) 3 points everywhere, including S/R clustering (moves the verdict).
  - (c) 1% (today).
- **FL3 (A-LEVELS-04): how "is a top" acts.**
  - **(rec) (a):** read the failed double top. While a failed double or triple top stands in a long's path, hold the long Execute to Watch; exit a long when one prints after the fill. Mirror for bottoms on shorts. The short entry is already built.
  - (b) Context only (today, plus the double-top reading).
- **FL4 (A-PRICE-05/-02, C-LEVELS-08): the angle's price unit.**
  - **(rec) (a):** add Gann's fixed scale (points per calendar month on the monthly chart, a labelled per-instrument rate, 1 per month for stocks per the Master Course) as a separate reading, and measure it against the ATR fans. Keep the ATR fans, labelled as engineering.
  - (b) Replace ATR everywhere (moves `gannAngleSlope`, `timePriceSquare` and targets).
  - (c) Keep ATR only.
- **FL5: the digital-root AND on `gannRetracementConfluence`.**
  - **(rec) (a):** remove it. Gann's retracement levels (50% first; 45 Years, HTMPC) score on their own, and the digital root stays on the card. Moves the verdict.
  - (b) Keep it (today).
  - (c) Drop the criterion.
- **FL6: what may be a target.**
  - **(rec) (a):** keep Square of Nine prices (Gann's wheel, reproduced within 1 of his diagonals). Take ATR-fan prices out of the TP1 and master pool until FL4 settles a Gann scale.
  - (b) Keep both (today).
  - (c) Remove both.
- **FL7 (A-LEVELS-03): what a "campaign bottom" is.**
  - **(rec) (a):** the monthly chart's major pivot lows (the `readMonthCounts` anchors), newest first, over the same `OLDER_LEVELS_YEARS` on both surfaces.
  - (b) Prior calendar years' bottoms (`olderGannLevels`).
- **FL8 (C-PRICE-02/-03): multiples of the low.**
  - **(rec) (a):** page-check 45 Years Ch. IV, then add "100% of the low and multiples" (2×, 3×, 4×… within the record) as a new class A entry and as levels.
  - (b) Also add W003's 7×, 9× and 12× as context.
  - (c) None.
- **FL9 (Jensen, W049: C-LEVELS-20 to -24, C-PRICE-04).**
  - **(rec) (a):** hold, not built. The reading finds no Gann lineage.
  - (b) Research-only context.
- **FL10 (A-PRICE-01).**
  - **(rec):** Gann's literal dollar zones as context, with a School line.
  - Alternatively, none (pointScale covers the allowance).
- **FL11 (A-PRICE-06).**
  - **(rec):** the symbol's own median calendar-year range as context.
  - Alternatively, none.
- **FL12 (UNVERIFIABLE with Gann text in the checkpoint).**
  - **(rec):** page-check the checkpoint readings and add new class A entries (C-LEVELS-02, -04, -05, -09, -11, C-NUMEROLOGY-03's 144 multiples, M-P1/P2/P4/P6/P7/P9/P10).
  - Alternatively, wait for the owner's own reading notes.

## 4. Build order (smallest and most literal first)

1. **Test-only pins** (no product change, no version bump). Any pin that fails becomes its own fix.
   - C-PRICE-03 (2368).
   - C-LEVELS-14 (GSPS's 360° against Gann's diagonals; W009's convention recorded).
   - C-LEVELS-16 (rings 3n²+3n+1, 397, 1,519).
   - C-LEVELS-18 (`RETRACEMENT_ANGLE_PAIRS`).
   - C-LEVELS-19 (no exit or stop reads a next fan line).
   - C-NUMEROLOGY-04 (3-6-9).
   - A-PRICE-07 (trigger and stop pre-stated, each acts).
   - A-LEVELS-05 second half (the 119 rally keeps the read bearish).
   - **These fail today, as real gaps:**
     - A-LEVELS-01 (a crossed top is in `support`);
     - A-LEVELS-05 first half (a 110 old top is support in a decline);
     - a parity pin that `readTrend` lists and `multipleTops`/`readLevelTests`/`readPricePercentages` match on a 1-year and a 6-year history ending on the same date.
2. **Copy fixes** (§2.9). No behaviour change.
3. **Context fields** (card and `contextFactors`; no version bump; live and replay through `readDisclosedRules`):
   - A-PRICE-01 zones;
   - A-PRICE-06 annual range;
   - A-PRICE-02 points per day;
   - A-PRICE-05 fixed-scale monthly angle (the W046 test);
   - A-LEVELS-02 secondary rally top;
   - A-LEVELS-03 campaign-bottom ladder;
   - A-LEVELS-06 / -04 multipleTops on 3 points with the double-top `failed` (FL2 a);
   - C-LEVELS-01 integer squares;
   - C-LEVELS-10 midpoint fan (kept out of `gannTargets`);
   - C-LEVELS-08 on FL4's scale;
   - C-PRICE-02 under FL8;
   - research modules C-LEVELS-12 and -15.
   - Failing tests first: each entry's TO WRITE above. Report saturation on random walks for the 3-point clusters.
4. **Level parity (engineering, not a fork).** Build every level list from the same spans on both surfaces:
   - monthly from `priorMonthly` / provider monthly, sliced to `OLDER_LEVELS_YEARS`;
   - weekly from the last 5 years of completed sessions;
   - daily from `entryChartBars`;
   - `dailyBars` for the context readers sliced the same way;
   - `majorPricePercentageLevels` anchors over the same years.
   - Live hardly moves, but replay numbers do: bump the version and run a replay so later steps are measured on matched lists.
5. **FL1 flip (A-LEVELS-01/-05). Moves the verdict.**
   - Files: `trend.ts:36-42`, `disclosedRules.ts:341-357`, `marketScan.ts:402` (live only), `levels.ts` (stops/targets inherit), `curriculum.ts:365-379` check.
   - Bump the version and run a 766-symbol replay. Report historicalSR's pass rate, the stop-from-structure share and scan cost (`mark()`).
6. **FL5 digital-root AND removed. Moves the verdict.**
   - Files: `score.ts:438-441, 579-590`, `criteria-registry.ts:530-543` (the note changes; still unmeasured).
   - Bump the version and run a replay.
7. **FL3 failed-top hold and exit (A-LEVELS-04). Moves the verdict and exits.**
   - Files: `applyFailedTopHold` in `score.ts`, wired with the other holds (`scanTicker.ts:412-417` and the replay's chain); an `exitRules.ts` branch beside "distribution"; `gann-exit-live.ts`.
   - Bump the version and run a replay.
8. **FL6 target pool and the A-LEVELS-03 ladder in targets. Moves plan levels.**
   - Files: `scanTicker.ts:313-316`, `replay.ts:1312`, `levels.ts:386-409`.
   - Bump the version and run a replay.
9. **Held, not built:**
   - the UNDISCLOSED four;
   - the UNVERIFIABLE twelve (page check only, FL12);
   - Jensen's six (FL9);
   - C-LEVELS-25 and C-NUMEROLOGY-01/-02;
   - the measured-move fallback (`trendBreakout.ts:321`), flagged to item 11.
