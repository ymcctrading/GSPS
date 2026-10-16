# Item 6 map: Gann's trend rules (A-TREND, C-TREND, plus A-ENTRY-19)

Read-only analysis of `/home/claude/gsps-item5s4` at `caad438` (item 5, last step). Sources: `gann_features.json` (12 A-TREND + 8 C-TREND, plus A-ENTRY-19 deferred by item 5), `PLAN.md` "Full parity order" item 6, `claude-progress.txt`, `docs/gann-feature-map/item5_map.md`, and `/mnt/project-files/literature-reading-output/works/W006|W003|W034|W035/detailed-notes.md`. Line numbers are for that commit. `STRATEGY_VERSION` today: `2026-10-16-gann-bear-rally` (`lib/backtest/strategyVersion.ts:121`).

## 0. How GSPS reads trend today (verified)

| Step | Code | What it does |
|---|---|---|
| Swing charts | `lib/gann/swingChart.ts:137-252` `walkSwingChart` | 3-Day Chart (3 consecutive counter bars) and 7-calendar-day chart. The **trend** turns only on crossing the last completed swing top or breaking the last swing bottom (`:159-169`). A-TREND-03 passes on this. |
| Trend read | `lib/gann/trendStrength.ts:135-164` `readGannTrend` | Direction = the 7-day chart's trend, **only if** the 3-Day Chart's last two tops and last two bottoms step that way (`:145-157`) **and** the campaign ledger is not "changing" (`:158-161`: space over-balance, time over-balance or a monthly-low/high break). Otherwise null. |
| Ledger | `lib/gann/campaignLedger.ts:109-228` | Campaign from the 7-day chart's last trend change; legs from 3-Day pivots, sized in **% of price**; `greatestCounterMove` (`:158-161`); over-balance = current counter-move > greatest (`:189-192`); `monthlyBreak` = **the last bar only** vs the prior calendar month's extreme (`:95-107`, `:194-195`); `firstYearHigh` needs a campaign ≥ 365 days (`:207-213`), so it is null on the scan's year of daily bars. Header says "context only", but it is not: `changing` nulls every trend read. |
| Per timeframe | `lib/analysis/trend.ts:30-45` `readTrend` | `readGannTrend(bars).direction ?? "sideways"` on whatever bars it is given. The structure test always uses the 3-bar chart's pivots (`STRUCTURE_SWING_CHART`, `trendStrength.ts:100`), so on monthly bars a pivot needs a 3-month counter-move. |
| Live macro reads | `lib/scanTicker.ts:155-157` | `readTrend` on 10y monthly, 5y weekly, 1y daily (fetched). |
| Replay macro reads | `lib/backtest/replay.ts:552-554` | Same function on monthly/weekly **rollups** of the daily bars (documented difference, `replay.ts:44-49`). |
| Direction weighting | `lib/gann/timeframeWeight.ts:54-90` | W004 power ratio 30/7/1. Since 30 > 7 + 1, the monthly decides whenever it has a trend, then the weekly, then the daily: in effect W006's order, with the daily always a tie-break. |
| Which way to arm | `lib/scan/entrySelection.ts:146-153` `preferredEntryDirection` | The **reversion** pass arms **against** the weighted macro trend. **Defect:** with no trend anywhere, `weightedScore` is 0, `agrees` is false, `macroDir` becomes "bullish", and the scan arms **bearish**. Shared by `scanTicker.ts:246-249` and `replay.ts:731`. |
| With-trend arming | `entrySelection.ts:110-115` `macroBreadthAgrees` (2 of 3), `:132-137` `isGannContinuation` (**daily** trend only) | Continuation only. Live, it also needs `coarseContinuation` (`marketScan.ts:473-525`): ≥ 120 daily bars, a 4-hour bar ≥ 2× range and ≥ 2× volume (`hasExceptional4hMomentum`, `:286`), ATR expansion ≥ 1.2 (`MOMENTUM_EXPANSION`, `:253`, `:492`), price on the trend side of the 20-bar midpoint (`:498-501`), `momentumElevated`, an Execute score (`qualifiesAsContinuationFill`, `:661-666`), and a quota of 2 per side (`:757`). The replay arms a continuation on `momentumElevated` + breadth + daily (`replay.ts:756-764`) and does not model the 4-hour spike, the pool or the quota. |
| Coarse pre-filter | `lib/marketScan.ts:398-453` `coarseReversion` | Reads the **daily** trend only (`:407`), arms against it (`:410`), and adds +1 at ≥ 2 ATR and +1 at ≥ 4 ATR of **extension from the 50-bar range midpoint** (`:419-429`). Reversions fill the lists first (`:983`, `:992-996`). It is live only: the replay has no coarse pass. |
| Regime engine | `lib/signals/regime.ts:102-112, 151-154` | `readGannTrend`, **plus a second HH/HL test on `findPivots(bars,3)` fractal pivots** (last vs first of the last 4). That is a different pivot construction from `readGannTrend`'s 3-Day Chart. It feeds display tiers and, through the first evaluated verdict, plan expiry (`lib/lifecycle/fromScanResult.ts:79-99, 136-140`). |
| Scored | `lib/scoring/score.ts:299-302` `swingChartTrend` | Passes only when the 3-Day and 7-day charts on daily bars both run the trade's way. This is the one place counter-trend trades are penalised. |
| Exits | `lib/gann/exitRules.ts:168-178` (over-balance exit), `:225-228` (prior-month trail) | Same ledger. |
| Copy | `lib/school/curriculum.ts:358, 370-371, 932, 934` | Teaches "trade with the trend", HH/HL, and "the first break of the prior month's low after a long advance". |

**Measured context (not proof):** run 33 continuation +0.420R on 23 vs reversion −0.007R on 200; run 34 continuation +0.472R on 24 vs reversion +0.008R on 490 (`claude-progress.txt:144, 285`). No interval clears zero.

**Starvation the brief should know about.** Item 5's with-trend buying points can only be offered when `selectGannEntry` is called in that direction:
- A-ENTRY-08, the "days" hold (`entryTrigger.ts:546-551`, bull market, long only);
- A-ENTRY-05, crossing a previous year's top;
- A-ENTRY-18, the bear-rally sell.

The reversion pass asks for the direction **against** the macro trend, so for a symbol whose monthly and weekly are both bullish it asks only for shorts. These rules therefore reach the lists only through the momentum-gated continuation pass, or when the monthly and weekly disagree. This is item 5 map conflict 6, and it is the heart of A-TREND-09 below.

## 1. Entry-by-entry map

Legend for "Today": (a) prices or arms plans, (b) scored, (v) moves the verdict another way (direction, hold, gate), (c) context or card only, (d) display tier only, (e) nothing.
Surfaces: **LS** live scan (`scanTicker.ts`), **CP** coarse pre-filter (`marketScan.ts`), **RP** replay (`replay.ts`), **RG** regime engine and states, **SC** scoring (`score.ts`), **CF** confluence/card/contextFactors, **SCH** school copy.

### A-TREND-01: monthly for the main trend, weekly next, daily only for fast active stocks
- **Rule:** "Read the main trend from a monthly high-low chart, the weekly chart next (Ch. VII calls the weekly the best chart for trading), and the daily only for fast, active stocks." **Source:** "W006 p.19". **Class A.**
- **Source check:** p.19 matches ("Monthly high-low chart for the main trend; weekly next best; daily when fast and active"). The Ch. VII phrase ("the best chart for trading purposes") is on **p.46**, not p.19. This is a citation mismatch only; the rule is unchanged.
- **Today (v):**
  - `timeframeWeight.ts:54-90`: 30/7/1 weights, used by `preferredEntryDirection` (`entrySelection.ts:146-153`).
  - `readTrend` on all three timeframes: `scanTicker.ts:155-157`, `replay.ts:552-554`.
  - Test: `lib/gann/__tests__/timeframeWeight.test.ts:10`, plus `lib/analysis/__tests__/trend.test.ts` (item 2).
- **Surfaces:**

  | Surface | Today | Applies the rule? |
  |---|---|---|
  | LS | Weighted M/W/D | Yes in effect: the weighting is lexicographic M > W > D |
  | RP | Same weighting, on daily rollups | Yes |
  | CP | **Daily trend only** (`marketScan.ts:407, 485`) | **No**: the one surface that treats the daily as "the trend" |
  | `isGannContinuation` | **Daily only** (`entrySelection.ts:136`) | Partial: reads as entry timing, defensible |
  | RG | Bars it is handed: daily (`scanTicker.ts` passes `daily`) | Regime runs on the daily chart |
  | SC | `swingChartTrend` on daily bars | n/a (a separate criterion) |
  | SCH | `curriculum.ts:932` names two swing charts, not the M/W/D order | No |

- **Differs:**
  1. The daily always votes as a tie-break when monthly and weekly are both flat. W006 uses the daily only for fast, active stocks; "fast and active" is UNSPEC.
  2. The coarse pre-filter picks candidates and their direction from the daily trend alone, so the full scan's direction (weighted) can disagree with the coarse candidate's.
  3. On monthly bars the structure test needs 3-month counter-moves for pivots, while Gann's monthly tops and bottoms include 2-month reactions (W006 p.38). The monthly read is therefore probably sideways often. **Not measured**: measure how often `readTrend(monthly)` is sideways on the 766 universe before changing anything.
  4. The trendless default to bearish (§0) is part of this rule's surface.
- **Proposed minimal change (after fork F2):**
  - `coarseReversion` / `coarseContinuation` read `readTrend(toWeeklyBars(daily), "1Week")` (`disclosedRules.ts:382`), falling back to the daily only when the weekly is sideways. CPU only, on 52 bars: state the measured `mark()` cost per AGENTS "Speed".
  - Keep W004's 30/7/1 for the full scan and document it as Gann's own ratio.
  - Add one sentence to `curriculum.ts:932` on the M/W/D order.
- **Moves the verdict:** yes. The shortlist changes (live only; the replay has no coarse pass), so bump `STRATEGY_VERSION` and run the replay; it will not show the change, which is a stated limitation.
- **Failing test:** `lib/__tests__/market-scan-coarse.test.ts` (new). A symbol whose daily trend is bearish but whose weekly trend (from the same daily bars) is bullish is offered by `coarseContinuation`/`coarseReversion` in the weekly's direction. It fails today.
- **Done in items 3-5?** No. readTrend tests were added by item 2 only.

### A-TREND-02: higher tops and bottoms = uptrend; lower = downtrend
- **Rule:** "Higher tops with higher bottoms mean an uptrend; lower tops with lower bottoms mean a downtrend." **Source:** "W006 pp.19-20". **Class A.**
- **Source check:** matches ("Strength: support, absorption, higher bottoms and tops. Weakness: lower tops and bottoms").
- **Today (v):** `trendStrength.ts:145-163` and `trend.ts:35`. Tests:
  - `trendStrength.test.ts:50` (item 1 review: **FAIL**, "a different trigger is used", `item1_sweep_review.md:10`);
  - `lib/analysis/__tests__/trend.test.ts` (item 2, HH/HL to bullish, LH/LL to bearish, flat to sideways).
- **Surfaces:**
  - LS, RP, CP: all through `readTrend`.
  - RG: a **second, different HH/HL test** (`regime.ts:106-112`, fractal pivots, last vs first of 4).
  - SCH: `curriculum.ts:370, 377`.
- **Differs:**
  1. HH+HL does not decide on its own. The 7-day chart's trend must agree (A-TREND-03 applied to the 7-day chart), and `changing` (over-balance, monthly break) nulls the direction.
  2. The structure is read on the 3-Day Chart while the direction comes from the 7-day chart (an engineering choice, labelled at `trendStrength.ts:91-100`).
  3. The regime engine uses a non-swing-chart pivot construction for the same question, which breaks cross-platform consistency.
- **Proposed minimal change:**
  - (i) Regardless of the fork: delete the fractal HH/HL test in `regime.ts:106-112` and use `gannTrend.structureAgrees`, so there is one definition of structure. This changes regime labels, and through the first evaluated verdict it changes the trend-pullback state's plan expiry. That is display plus expiry, so bump `STRATEGY_VERSION`.
  - (ii) Per fork F3.
- **Moves the verdict:** (i) plan expiry, display tiers. (ii) yes under F3 option b.
- **Failing test (i):** `lib/signals/__tests__/regime.test.ts`. On bars where the 3-Day Chart's last two tops and bottoms rise and the 7-day chart is bullish, but the last-vs-first-of-4 fractal highs do not rise (a lower 2nd-oldest fractal high), `classifyRegime` returns `regime: "trend"`. It fails today.
- **Failing test (ii, if F3=b):** `trendStrength.test.ts`. With HH+HL and a bullish 7-day chart plus a monthly-low break, `readGannTrend` has `direction: "bullish"` and `changing: true`.
- **Done?** Tests from item 2. Not passed.

### A-TREND-03: breaking the start of the last run-up turns the trend (mirror)
- **Rule / source / class:** "W006 pp.19-20", A. **`passes: true`.** Source matches.
- **Today (v):** `swingChart.ts:159-169`. Test: `swingChart.test.ts:95`.
- **Surfaces:** every `readTrend` and `swingChartTrend` reader. **Done.** The item 1 review suggested asserting `trendChanges` as well; that is optional.

### A-TREND-04: trade each stock's own trend, not the averages
- **Rule:** "Trade each stock's own trend, not the averages; the Dow Theory has been obsolete since 1916." **Source:** "W006 pp.16-18". **Class A.**
- **Source check:** matches (Ch. IV, "The Dow Theory obsolete", pp.17-18).
- **Today:** the verdict paths read only the symbol's own trends:
  - `macroBreadthAgrees`, `isGannContinuation`, `preferredEntryDirection` (`entrySelection.ts:110-153`) take only `TrendReading[]`.
  - `readLeadership` compares with SPY (`leadership.ts:53-60`), but as context. That is Gann's own use (early and late leaders, W006 pp.24-29, A-SELECTION-02/-03), not a confirmation gate.
  - **(d) The Signal & Regime Engine** hard-codes `benchmarkSectorAlignment: false` (`lib/signals/scanGates.ts:37`) inside `allSafetyGatesPass` (`lib/signals/disqualifiers.ts:81`). Every state therefore fails a benchmark/sector "safety gate", which caps its tier (display; `tradeable` is read only by cards and notification copy).
- **Surfaces:** LS/RP/SC comply. RG (display tier) contradicts the spirit. SCH: no copy on it.
- **Differs:** no index enters the verdict. The only conflict is the regime engine's benchmark-alignment safety gate.
- **Proposed minimal change:**
  - (i) Test only: pin that the entry-selection helpers take no index series.
  - (ii) Fork F8: drop `benchmarkSectorAlignment` from `allSafetyGatesPass`, or mark it not applicable, citing A-TREND-04.
- **Moves the verdict:** (i) no. (ii) display tiers only, no `STRATEGY_VERSION` bump.
- **Failing test (ii):** `lib/signals/__tests__/disqualifiers.test.ts`. `allSafetyGatesPass` is true when every gate passes except `benchmarkSectorAlignment`. It fails today. For (i), the entry's own TO WRITE test (`lib/scan/__tests__/entrySelection.test.ts`) passes today: a pin, not a fix.
- **Done?** No.

### A-TREND-05: a smaller, shorter secondary move leaves the trend unchanged
- **Rule:** "A secondary rally (or reaction) shorter and smaller than the one before it shows the main trend is unchanged (e.g. 41 points in 69 days after 99 points in 155 days: still down)." **Source:** "W006 pp.13-14". **Class A.**
- **Source check:** matches. The 99/155 rally is the secondary rally after the 1929 first section; 41/69 is the next one (Feb 1931).
- **Today (v):** `campaignLedger.ts:158-192` compares the open counter-move with the campaign's **greatest**, in **%** and calendar days. `readGannTrend` stays confirmed unless that is exceeded.
- **Surfaces:** LS/RP/CP/RG through `readTrend`; exits (`exitRules.ts:168-178`); CF (`contextFactors.ts:67-72`); SCH `curriculum.ts:934`.
- **Differs:** none in the conclusion. "Smaller than the preceding one" implies "smaller than the greatest", which implies no over-balance and an unchanged trend. So A-TREND-05 holds under the ledger. The ledger is silent between "bigger than the previous" and "smaller than the greatest", and A-TREND-05 says nothing there either. Two documented engineering differences remain:
  - % instead of points (the ledger header, `:31-33`, is allowed by PLAN pass rule 1);
  - "greatest" rather than "previous", which belongs to the converse rules (Space Rule, A08 p.312 "the first reaction exceeding the previous down-swing") and not to this entry.
- **Proposed change:** test only.
- **Moves the verdict:** no.
- **Test (expected to pass, a pin):** `lib/gann/__tests__/trendStrength.test.ts`. A bear campaign with a first counter-rally of 20% over 30 days, then a second of 10% over 14 days, reads `readGannTrend(...).direction === "bearish"`, with `spaceOverbalanced` and `timeOverbalanced` both false. If it fails, it is a real bug and becomes its own fix.
- **Done?** No. Its cited test (`campaignLedger.test.ts:31`) asserts sections and the greatest reaction, not this rule.

### A-TREND-06: a reaction holding above the previous section's top = trend still up
- **Rule:** "A reaction that holds above the previous campaign's top means the trend is still up (Oct 1933 low 82½ held above the Sep 1932 top of 81)." **Source:** "W006 p.14". **Class A.**
- **Source check: wording mismatch.** In W006 p.14 the Sep 1932 top of 81 is the top of the **first section of the same 1932-35 bull market**, not of a previous campaign. Read it as "the previous section's top".
- **Today:**
  - (v) `readGannTrend`'s rising-bottoms test. A low above the prior section's top is above the prior bottom too, so it passes a fortiori.
  - (b) `levelRole` (`levelRole.ts:70-72`) calls that top support once price is above it, which feeds `historicalSR`.
- **Surfaces:** LS/RP/RG through `readTrend`; SC `historicalSR`; SCH `curriculum.ts:380` ("becomes a floor").
- **Differs:** Gann's rule is a sufficient condition GSPS already satisfies, **except** when the same reaction over-balances the campaign's greatest in % or days. Then `changing` nulls the trend while Gann's p.14 says it is still up. Gann's own example is not over-balanced (25% in 96 days vs 39% in 172 days).
- **Proposed change:** test only. Fork F9 only if the owner wants A-TREND-06 to override over-balance.
- **Moves the verdict:** no (yes under F9 a).
- **Test (pin):** `lib/gann/__tests__/trendStrength.test.ts` with the Dow 1932-33 shape scaled (up 40→81, react to 49½, up to 110½, react to 82½ and hold). It reads bullish, and `levelRole(price, 81)` is "support".
- **Overlap:** A-LEVELS-01 (item 9).

### A-TREND-07: a stock that tops in year 1-2 of a bull market and fails for two years to exceed it is weak
- **Rule:** "A stock that tops in the first or second year of a bull market and then fails for two years to exceed that top is weak." **Source:** "W006 pp.25, 27". **Class A.**
- **Source check:** matches (Corn Products: 1933 top, 78⅜ in Jul 1935, 12 points short). The memory-bank A05 note adds "short when the monthly/weekly trend turns".
- **Today (c):** `campaignLedger.ts:207-213` `firstYearHigh` (needs a 365-day campaign on 1y of daily bars, so almost always null). It is surfaced through `leadership.ts:60`, `contextFactors.ts:155` and the card (`disclosedRules.ts:557`).
- **Surfaces:** CF only (null in practice). LS/RP/SC: no. SCH: none.
- **Differs:**
  - no two-year failure count;
  - wrong data reach (daily, 1y);
  - "bull market" is read as the stock's own campaign, not the market's;
  - no action anywhere.
- **Proposed minimal change:** `readEarlyTopFailure(monthly, marketMonthly, asOf)` in `lib/gann/leadership.ts`:
  - date the bull market from the **market's** monthly campaign start (per F6);
  - take the stock's highest monthly high in months 1-24 of it;
  - flag `weak` when 24+ months have passed since that top with no monthly high above it.
  - Live: 10y monthly is already fetched (`scanTicker.ts`). Replay: `priorMonthly` (`replay.ts:721`) plus SPY monthly from `marketDailyBars`.
  - Context: card line plus `contextFactors.earlyTopFailedLong`. The **action** ("leave the weak alone; short the weakest") is A-SELECTION-04 in item 11. Do not build it twice.
- **Moves the verdict:** no in item 6.
- **Failing test:** `lib/gann/__tests__/leadership.test.ts`. A stock whose month-6 high is never exceeded over the next 24 monthly bars, while the market makes new highs, reads `weak: true`; one that exceeds it in month 20 reads false. Fails today: no function.
- **Done?** No.

### A-TREND-08: in a bull market, a stock that rallies only 2-3 months at the start and never exceeds it is weak
- **Rule:** "In a bull market, a stock that rallies only 2-3 months at the start and never exceeds that first rally is weak." **Source:** "W006 p.35". **Class A.**
- **Source check:** matches (American Home Products 25 → 43¾ → 25 → 36).
- **Today (c):** the same `firstYearHigh`, which is the wrong level (the first year, not the first 2-3-month rally).
- **Differs:** as -07.
- **Proposed change:** same module as -07. On monthly bars from the market's bull start, take the stock's first up-leg; if it lasted ≤ 3 monthly bars and no later monthly high exceeds its top, set `weak: true, basis: "firstRally"`. Context only; the action is in item 11.
- **Moves the verdict:** no.
- **Failing test:** in `leadership.test.ts`, a fixture of 25→43¾ in 3 months, back to 25, then up to 36 and below reads weak; a fixture crossing 43¾ later does not.
- **Duplicate:** builds with -07 in one commit. A-SELECTION-04 consumes both.

### A-TREND-09: never too high to buy while the trend is up, nor too low to sell while it is down
- **Rule:** "A stock is never too high to buy while its trend is up (with a stop), nor too low to sell short while its trend is down." **Source:** "W006 pp.22, 38-39". **Class A.**
- **Source check:** matches. p.22: "A stock is never too high to buy so long as the trend is up, provided you place a stop loss order." pp.38-39: "a buy at 400 while rising and a short at 40 while falling. Stops on every trade."
- **Today:** the opposite on the main path.

  | Surface | What it does | Against the rule? |
  |---|---|---|
  | CP `coarseReversion` (`marketScan.ts:398-453`) | Arms against the daily trend and scores **extension** from the 50-bar midpoint (+1 at > 2 ATR, +1 at > 4 ATR, `:419-429`). Reversions fill the lists first. | **Yes**: "too high" is a scored reason to sell |
  | CP `coarseContinuation` (`:473-525`) | Rewards travel (`:516-520`), but gates on non-Gann momentum (4h spike, ATR expansion, ≥ 120 bars) | Not penalised for height, but with-trend trades are rationed by a non-Gann gate |
  | Continuation publication (`:631-666, :757, :1062-1075`) | Execute score, breadth 2/3, `momentumElevated`, 2 slots a side | Rationing, non-Gann |
  | LS `preferredEntryDirection` (`entrySelection.ts:146-153`) | Every reversion scan asks for the direction against the macro trend; trendless defaults to bearish | Yes for the default direction; item 5's with-trend rules are starved (§0) |
  | RP (`replay.ts:731-765`) | Same reversion direction; continuation on `momentumElevated` + breadth + daily | Same as LS, minus the 4h/quota parts (not modelled) |
  | RG `confirmedReversal.ts:63-72, 135-148` | `meaningfulLocation` passes on overextension ≥ 2 ATR from the 50% point *or* a clustered level | Partly: height alone qualifies a reversal (display tier only) |
  | RG `rangeReversion.ts:125` | Only in a range (`isGannRangeBound`) | No conflict: no trend |
  | SC | `swingChartTrend` fails counter-trend trades; nothing penalises height | Complies |
  | SCH `curriculum.ts:358, 370-371` | "Trade with the trend"; "buying because it looks cheap" is wrong | Teaches the rule the scan does not follow (Correspondence gap) |

- **Differs:** GSPS's primary pass fades extended trends, and its with-trend pass is rationed by momentum gates with no Gann source. Gann's own counter-trend points (double and triple tops and bottoms, held levels; A-ENTRY-02/-14) are legitimate and stay. What W006 rejects is **height or extension itself** as the reason.
- **Proposed minimal change, staged (fork F1):**
  - **(a)** Delete the extension tiers from `coarseReversion` (`:419-429`, with `EXTENSION_ATR_TIER1/2` and the fallbacks if they end up unused; telemetry `extension_pct` can stay as a diagnostic). Delete the overextension branch of `confirmedReversal`'s `meaningfulLocation`, keeping the clustered-level branch. Add one Academy 4/6 sentence: "a stock is never too high to buy while its trend is up, with a stop".
  - **(b)** The with-trend pass on Gann's trend alone:
    - `preferredEntryDirection` returns both directions, or the scan calls `selectGannEntry` for the with-trend direction too;
    - the continuation pass drops `hasExceptional4hMomentum`, `MOMENTUM_EXPANSION`, the ≥ 120-bar floor, `momentumElevated` and the 2-slot quota as admission gates (keep them as ranking or telemetry if wanted);
    - "with the trend" means the weighted M/W trend (A-TREND-01), not the daily alone;
    - the replay arms the same way (`replay.ts:752-765`), so live and replay stay identical.

    This also un-starves A-ENTRY-05/-08/-18.
- **Moves the verdict:** (a) the coarse shortlist (live only) and the confirmedReversal tier. (b) a large change in direction, plans and orders. Each step gets a bumped `STRATEGY_VERSION` and a 766-symbol replay with the cells input and the full SHA (`claude-progress.txt` run 36 lesson).
- **Failing tests:**
  - (a) `lib/__tests__/market-scan-continuation.test.ts` (the entry's own TO WRITE): a bullish-trend symbol far above its 50-bar midpoint gets **no** extra `coarseReversion` score for the extension. Assert that `coarseReversion` of the same bars at 1 ATR vs 5 ATR extension gives the same `coarseScore`. Fails today (+2 vs +0).
  - (a) `confirmedReversal.test.ts`: with no clustered level nearby, an extreme 3 ATR from the midpoint does **not** pass `exhaustionAtMeaningfulLevel`. Fails today.
  - (b) `lib/scan/__tests__/entrySelection.test.ts`: with monthly and weekly bullish and a held "days" bottom (A-ENTRY-08) on the daily chart, the scan's selected entry is that long. Fails today (it asks for bearish).
  - (b) Same test in `lib/__tests__/replay.test.ts`.
- **Done in items 3-5?** No. Item 5 map conflict 6 and owner decision 5 deferred the with-trend gate to here. PLAN item 7 had already listed this as Chuck's call.

### A-TREND-10: after a late-bear break to new lows, a rally 3 points back over the old bottom ends the decline
- **Rule:** "After a late-bear break to new lows, a rally back to 3 points above the old bottom means the decline is over (AT&T a buy at 91)." **Source:** "W006 p.30". **Class A.**
- **Source check:** matches. Note that "late in a bear campaign" is the **section heading**. The rule sentence itself ("after a stock declines to new low levels and then rallies back 3 points above the old bottom, it is an indication that the decline is over") has no lateness condition. AT&T broke its 1907 low of 88, made 70¼, and crossed 91 = 88 + 3.
- **Today (e for entries):**
  - `stopBreach.ts:119-146` `isReclaimedByClose` applies the same failed-break test to a **plan's own stop**, not to an old bottom as a buying point.
  - Bullish crossings read **tops only**: `latestCrossedLevel` filters `kind = direction === "bullish" ? "top" : "bottom"` (`entryTrigger.ts:696`), so a broken old bottom regained is never a buy. The mirror is the same.
  - The trend usually turns anyway: the 7-day chart crosses the post-break swing top on the way back to L+3 (A-TREND-03). That is not guaranteed.
- **Surfaces:** LS/RP (`selectGannEntry` → `computeGannEntryTrigger`), the live exit (`gann-exit-live.ts`, crossed level), the exam, SCH (none). None does it.
- **Differs:** a whole buying point (and its mirror, the sell when price falls back 3 under a crossed old top: "failed to get 3 above 32: short" is the A-ENTRY-16 side) is missing.
- **Proposed minimal change:** `latestCrossedLevel` also takes, for a long, old **bottoms** (swing and `olderGannLevels` bottoms) that have **closed 3 points under** after forming, as candidates crossed upward at L + 3 (and the mirror for shorts). Reuse the crossing construct: arm on a close ≥ L+3, buy the reaction at L+1, stop L−3, a 4-point risk inside the 5-point cap. Label it an inference per fork F5. `source` gets a new value or a `regained: true` flag for the copy ("regained the old bottom at 88"). Wire it through everything that reads a crossing: the score note, setup label, signal card headline, exam and Academy 6. `sameGannLevel` handles a level that is both an old bottom and the record.
- **Moves the verdict:** yes (a new buying point). Bump `STRATEGY_VERSION` and run the replay.
- **Failing test:** `lib/gann/__tests__/regainedBottom.test.ts`. Bottom at 88 formed; closes to 84.9 (3 under, broken); a low of 70.25; then a close at 91.1. `selectGannEntry(bars, "bullish")` returns a crossing with `level ≈ 88`, `reactionEntry ≈ 89`, `reactionStop ≈ 85` (price-scaled 3 points). Fails today: it returns the last swing top. Mirror: a top crossed, then a close 3 under it, gives a short.
- **Overlap:** A-LEVELS-06 (held 3-point margin, item 9); stopBreach (shares `reclaimLevel` arithmetic). It is item 5 map's "construct X mirrored", listed there as owned by item 6, and is not covered by items 3-5.

### A-TREND-11: the first monthly break of a prior month's low warns of a turn
- **Rule:** "On the monthly chart, the first break of a prior month's low after a long advance warns of a trend turn (Oct 1929; May 1930)." **Source:** "W006 p.41". **Class A.**
- **Source check:** matches (pp.40-42: Oct 1929 "the first break of a prior month's low since May 1929"; May 1930 "the first broken monthly low since November"). Gann's wording is "the first … **since** [the previous break]". "After a long advance" is the extractor's paraphrase; the elapsed spans are 5-6 months.
- **Today (v):** `campaignLedger.ts:95-107, 194-195` `monthlyBreak` feeds `readGannTrend.changing` (`trendStrength.ts:160`), so every macro trend read goes sideways on the bar it fires. Also `contextFactors.ts:71` and the exit trail `exitRules.ts:225-228`. **The test exists** (`campaignLedger.test.ts:58`, item 2); the entry still says TO WRITE.
- **Surfaces:** LS/RP/CP/RG via `readTrend`; exits; CF; SCH `curriculum.ts:934` ("the **first** break … **after a long advance**", which the code does not check).
- **Differs:**
  1. **Last bar only.** A break on day 3 that recovers by day 20 no longer reads as a break, but Gann's monthly bar keeps the low for the whole month. On monthly input the last bar is the month so far, which is correct; on daily or weekly input it is wrong.
  2. No "first since the last break" (or since the campaign began); every break counts.
  3. No length condition on the advance (UNSPEC).
- **Proposed minimal change:** in `campaignLedger.ts`, compare the **month-to-date extreme** (all bars in the last bar's calendar month) with the prior month's extreme. Add `monthlyBreakFirst`: no earlier month in this campaign broke its predecessor's extreme. Keep `changing` on any month-to-date break (conservative; Gann's own words make it a warning) and use `monthlyBreakFirst` for copy and context, so the copy matches the code. Do not add a length condition (UNSPEC; the campaign start already implies an advance).
- **Moves the verdict:** yes, (1) extends the unconfirmed window through the rest of the month. Bump `STRATEGY_VERSION` and run the replay.
- **Failing test:** `campaignLedger.test.ts`. In a bull campaign, day 3 of March trades under February's low, then March rallies to new highs by day 20; `buildCampaignLedger(bars to day 20).monthlyBreak === true`. Fails today (false). Second test: the second month to break in one campaign has `monthlyBreakFirst === false`.
- **Done?** Partly: item 2's tests cover the last-bar case.

### A-TREND-12: a monthly bar crossing the previous month's high after a long decline shows the turn up
- **Rule / source / class:** "W006 pp.42-43", A. **Source check:** matches ("late July [1932] crossed June's high = trend turning up").
- **Today (v):** the bearish branch of the same `monthlyBreak`. Test `campaignLedger.test.ts:74` (item 2).
- **Differs / change / verdict:** as -11 (the mirror). The same commit, and the mirror test (month-to-date high over the prior month's high, early in the month, then a decline).
- **Note:** Gann says "shows the trend turning up". GSPS only unconfirms the bear trend and does not turn it bullish; the 7-day chart's crossing does that. This is a conservative reading, recorded rather than changed.

### A-ENTRY-19 (deferred from item 5): a narrow week, then a sharp drop on large volume, turns the trend down
- **Rule:** "A narrow week followed by a sharp drop on large volume turns the trend down; short even while the averages are rising." **Source:** "W006 p.27". **Class A.**
- **Source check:** matches (Corn Products, week ended 20 Jul 1935, a sharp drop to 70½ on large volume after a narrow week; "short while the averages rose"). The memory-bank A05 note ties it to -07: the weak stock is shorted when this turn comes.
- **Today (e):** none. Nearby code:
  - `narrowRange.ts`: class C, 3-4 days, context (C-ENTRY-02);
  - `accumulation.ts`;
  - `volumeClimax.ts`.

  None of these reads a narrow **week** followed by a down week on volume.
- **Surfaces it would apply to:** LS/RP (a trend warning or a sell), CF, SCH. No index gate ("even while the averages rise" is consistent with A-TREND-04).
- **UNSPEC:** "narrow", "sharp", "large volume", and the entry, stop and order type. As a sell after the drop with a stop 3 over the narrow week's high, risk usually exceeds the 5-point cap (A-STOP-02), which is why item 5 deferred it.
- **Proposed minimal change (fork F7, rec a):** `lib/gann/narrowWeek.ts` `readNarrowWeekBreak(toWeeklyBars(daily))`, with these definitions pre-registered and labelled as engineering choices:
  - narrow = the narrowest range of the last 4 completed weeks;
  - sharp = the next week closes ≥ 3 price-scaled points under the narrow week's low;
  - large = that week's volume above its 13-week average.

  Context only: card plus `contextFactors.narrowWeekBreakAgainst/With`. Measure it before it feeds `changing`.
- **Moves the verdict:** no under a. Yes under b/c.
- **Failing test:** `lib/gann/__tests__/narrowWeek.test.ts` (the entry's own TO WRITE). Weekly ranges 6, 5, 7, **2**, then a week down 4 points (scaled) on 2× volume reads `{ direction: "bearish" }`; the same drop on average volume reads null.
- **Done?** No. Item 5 deferred it here (`claude-progress.txt:316`).

### C-TREND-01: tops take longer to form than bottoms; V bottoms commoner than spike tops
- **Source:** "W003 p.15 (probable origin: 45 Years in Wall Street or How to Make Profits in Commodities, unread)". **Class UNVERIFIABLE.**
- **Source check:** matches W003 p.15.
- **Today:** none. **Held, do nothing** (PLAN: UNVERIFIABLE waits for the owner's reading).

### C-TREND-02: blow-offs of up to 20% a day in small stocks at climaxes
- **Source:** "W003 p.15". **Class C.**
- **Source check:** matches (W003 "Tops and bottoms (pp.15-16)").
- **Today (c):** `boilingPoint.ts:58`, `volumeClimax.ts` read climaxes from volume, never from a daily % move.
- **Differs:** no magnitude reading.
- **Proposed change (context only, never gating):** add `maxDayPctInClimaxWindow` (the largest |close-to-close| % in the boiling-point window) to `BoilingPointReading`, shown on the card. The 20% is a ceiling Gann's compiler reports, not a trigger, so no flag at 20%. Lowest value in this item; it can be skipped with a recorded reason.
- **Moves the verdict:** no.
- **Test:** `boilingPoint.test.ts`. A 20%-range day at a volume climax reports `maxDayPctInClimaxWindow ≈ 20`, and `computeScore` output is unchanged with or without it. Fails today: no field.

### C-TREND-03: a correction larger in price and time than every earlier one is the first warning in a bull market
- **Source:** "W003 pp.15-16 (probable origin: How to Make Profits in Commodities or 45 Years in Wall Street, unread)". **Class UNVERIFIABLE.**
- **Source check:** matches.
- **Today (v, not context):**
  - `campaignLedger.ts:189-192` with `trendStrength.ts:160`: space **or** time over-balance nulls the trend;
  - `exitRules.ts:173` exits on it.

  The code cites A08/A09/A2.1 via `docs/memory-bank/sources/` (2026-09-27 reads). A08 p.312 there says: "Never consider that the trend has definitely changed until the TIME PERIOD has OVERBALANCED. Both price and time overbalanced means a definite change." That is **AND**, or time first. The code uses **OR**.
- **Action:** **held, do nothing** per PLAN. Flag for the owner's HTMPC/45Y reading: the code already gates on this, and OR vs AND is the open question (`features_C_notes.md:19` makes the same point).

### C-TREND-04: late in a trend, reactions get smaller until a sharp reversal
- **Source:** "W003 p.17". **Class C.**
- **Source check:** matches.
- **Today (c, partial):** `sevenZones.ts:89` describes zones qualitatively; the ledger records legs but never compares them (`features_C_notes.md:79`).
- **Proposed change (context only):** add `contracting` to the ledger: the last three counter-legs each smaller in % than the one before. Card line plus `contextFactors.reactionsContractingWithTrade`. Never gates; no `STRATEGY_VERSION` bump (item 5's class-C precedent).
- **Test:** `campaignLedger.test.ts` (the entry's own TO WRITE). Counter-legs of 6%, 4% and 2% read `contracting: true`; 6%, 7% and 2% read false. Fails today.

### C-TREND-05: from a bear bottom, about 3 weeks up, 3-5 weeks sideways, then acceleration
- **Source:** "W003 p.17 (… unread)". **Class UNVERIFIABLE.** Source matches. No code. **Held.**

### C-TREND-06: the first sign of change is over-balance (a reaction larger in price than any earlier one)
- **Source:** "W003 p.17; W034 p.2 (… unread)". **Class UNVERIFIABLE.** Matches; W034 p.2 is a duplicate of W003 pp.16-17.
- **Today (v):** `spaceOverbalanced` in `readGannTrend.changing`. Test `trendStrength.test.ts:80`.
- **Action:** **held, do nothing.** It is a duplicate of C-TREND-03's price half.

### C-TREND-07: a rising market should spend more time rising than falling
- **Source:** "W003 p.17; W034 p.2". **Class C.** Source matches.
- **Today (c, partial):** `legs[].days` is recorded and never summed.
- **Proposed change (context only):** add `trendDays`, `counterDays` and `timeRatioInverted` (counter > trend) to the ledger, using only completed legs plus the open leg. Card plus `contextFactors.timeRatioInvertedAgainstTrade`.
- **Test:** `campaignLedger.test.ts`. A bull campaign with up-legs of 5 and 4 days and down-legs of 6 and 7 days reads `timeRatioInverted: true`. Fails today.

### C-TREND-08: a 4th consecutive higher weekly close means higher; the 5th unit is "of Ascension"
- **Source:** "W035 p.3 (probable origin: Master Stock Market Course or 45 Years in Wall Street, unread)". **Class UNVERIFIABLE.**
- **Source check:** matches (W035 p.3, an unattributed typed passage on a forum post).
- **Today:** `ruleOfThree.ts:37-39` (2 higher / 3 lower closes, W004 class A); `decadeCycle.ts:63` "Year of Ascension".
- **Action:** **held, do nothing.** It would contradict W004's class-A 2-close count. A class-A source wins if it is ever verified.

## 2. Conflicts

1. **A-TREND-09 against the reversion-first architecture** (fork F1). W006 pp.22, 38-39 (A) against GSPS's own extension score and momentum gates (no Gann source). By AGENTS.md "WD Gann precedence", Gann wins. Only the size and staging of the change is the owner's call.
2. **W004's 30/7/1 against W006's "daily only for fast stocks"** (fork F2). Both are Gann (A). The weighting already orders M > W > D, so the real difference is small: the daily tie-break, plus the coarse pre-filter's daily-only read.
3. **A-TREND-02 (structure alone) against GSPS's composite.** The composite adds A-TREND-03 on the 7-day chart, and the A-TREND-11/over-balance warnings null the direction (fork F3). All of these are Gann's, so this is a mapping choice, not a source conflict.
4. **A-TREND-06 against over-balance** (fork F9). A reaction held above the previous section's top can still over-balance in % or days. Gann's example does not, so this is untested ground.
5. **C-TREND-03 (AND) and A08 p.312 (time decides) against the code's OR.** Held (UNVERIFIABLE); the owner's reading of HTMPC settles it.
6. **A-ENTRY-19 / A-TREND-10 as sells or buys against A-STOP-02's 5-point cap.**
   - A-TREND-10 under the crossing construct is 4 points, so it is fine.
   - A-TREND-10 as "buy at L+3, stop L−3" is 6 points: skip.
   - A-ENTRY-19 as a short after the drop is usually over the cap.
7. **Live and replay asymmetry this item touches:** the coarse pre-filter and the continuation pass's 4-hour spike and quota exist only live. Changing them moves live behaviour the replay cannot show. State that in each PR; the AGENTS cross-platform rule asks for it to be said, not hidden.
8. **Copy against code:**
   - `curriculum.ts:934` ("first … after a long advance") against `monthlyBreak` (any, last bar);
   - `curriculum.ts:358, 370-371` ("trade with the trend") against the reversion-first scan.

## 3. Owner forks (one line each, recommendation first)

- **F1 (A-TREND-09).** How should "never too high to buy" act on the reversion-first scan?
  - (a) Only delete the extension score (coarse) and confirmedReversal's overextension branch.
  - **(b, rec)** (a), then a with-trend pass armed on Gann's weighted trend alone: drop the 4-hour spike, ATR expansion, 120-bar, `momentumElevated` and 2-slot-quota admission gates, and arm both directions per session, live and replay.
  - (c) Keep as is, labelled non-Gann.

  Stage (a) and (b) as separate commits, each with a replay.
- **F2 (A-TREND-01).** What role does the daily trend play?
  - **(a, rec)** Keep W004's 30/7/1 (monthly governs, weekly next) and move the coarse pre-filter from the daily read to the weekly read rolled from the same bars.
  - (b) Drop the daily from the direction entirely (W006 p.19).
  - (c) Define "fast and active" (UNSPEC) and use the daily only for those stocks.
- **F3 (A-TREND-02).** Do Gann's change warnings (over-balance, monthly break) null the trend (today) or ride alongside it?
  - **(a, rec)** Keep today's composite (every part is Gann's) and accept a test that asserts each part as A-TREND-02's pass.
  - (b) Direction = structure + A-TREND-03 only; warnings become a `changing` flag that holds a with-trend Execute to Watch.
- **F4 (`preferredEntryDirection`, trendless symbols).** Today the scan arms short by default.
  - **(a, rec)** Arm both directions and let the nearer buying point win (Polarity).
  - (b) Arm nothing.
  - (c) Keep the bearish default.

  F1(b) subsumes this if chosen.
- **F5 (A-TREND-10).** Which order for a regained old bottom?
  - **(a, rec)** The crossing construct: arm at L+3, buy the reaction at L+1, stop L−3 (an inference, within the cap).
  - (b) "Buy at 91" literally: a stop-entry at L+3 with the stop at L−3 is 6 points, so it is always skipped by the cap.
  - (c) Trend context only.

  No "late bear" precondition: the rule sentence has none.
- **F6 (A-TREND-07/-08).** Whose bull market dates "the first or second year"?
  - **(a, rec)** The market's (SPY monthly), as `leadership.ts` already reads.
  - (b) The stock's own monthly campaign.

  The action stays in item 11 (A-SELECTION-04).
- **F7 (A-ENTRY-19).**
  - **(a, rec)** Context only, with the pre-registered narrow/sharp/large definitions, measured.
  - (b) Also feed `readGannTrend.changing` (moves the verdict).
  - (c) A short with the stop 3 over the narrow week's high, offered only inside the 5-point cap.
- **F8 (A-TREND-04, Signal & Regime Engine).**
  - **(a, rec)** Drop the always-false `benchmarkSectorAlignment` safety gate, or mark it not applicable. This is a display tier only.
  - (b) Keep it, labelled non-Gann.
- **F9 (A-TREND-06 against over-balance).**
  - **(a, rec for now)** Keep over-balance winning (Gann's most repeated trend-change rule) until a replay case shows the conflict.
  - (b) A reaction held above the previous section's top keeps the trend confirmed despite over-balance.

## 4. Build order (smallest and most literal first)

1. **Test-only pins (no product change):**
   - A-TREND-04 (i): entry selection takes no index series;
   - A-TREND-05: a smaller secondary rally keeps the trend;
   - A-TREND-06: a reaction held above the previous section's top;
   - A-TREND-03: optionally add a `trendChanges` assertion.

   Any that fails is a real bug and becomes its own fix.
2. **Class C context fields (never gate, no version bump):**
   - C-TREND-04 `contracting`;
   - C-TREND-07 `timeRatioInverted`;
   - C-TREND-02 `maxDayPctInClimaxWindow` (optional).

   Each goes into ledger/boilingPoint, then `contextFactors`, then the card.
3. **A-TREND-11/-12** month-to-date monthly break plus `monthlyBreakFirst`, with copy alignment at `curriculum.ts:934`. Moves the verdict (trend reads).
4. **Regime HH/HL unification** (A-TREND-02 i: delete the fractal test in `regime.ts:106-112`). Moves plan expiry and display.
5. **F4 trendless direction** (if F1(b) is not chosen). Moves the verdict.
6. **A-TREND-09 step (a):**
   - drop the coarse extension score;
   - drop confirmedReversal's overextension branch;
   - one Academy sentence.

   Moves the coarse shortlist (live only).
7. **A-TREND-01 (F2a):** the coarse pre-filter reads the weekly trend from the daily bars, and `curriculum.ts:932` gets one sentence. Moves the shortlist.
8. **A-TREND-10 (F5a):** a regained old bottom (and its mirror) as a crossing. Moves the verdict; new copy everywhere a crossing is named.
9. **A-TREND-07/-08 readings** on monthly bars (F6a). Context only; the action is in item 11.
10. **A-ENTRY-19 (F7a):** the narrow-week reading as context, measured.
11. **A-TREND-09 step (b) (F1b):** the with-trend pass on Gann's trend alone, live and replay. This is the largest verdict move in the item; do it last, on its own replay.
12. **A-TREND-04 (ii) (F8a):** the benchmark safety gate (display). It can go any time after the owner's answer.
13. **Held:** C-TREND-01, -03, -05, -06, -08 (UNVERIFIABLE).

Each verdict-moving step (3-8, 11) gets a bumped `STRATEGY_VERSION` and a 766-symbol replay with the cells input and the full SHA. The replay cannot see steps 6-7 (coarse pass, live only), and the PR must say so.

## 5. Already done or covered elsewhere

- **Done:** A-TREND-03 (`passes: true`).
- **Tests exist, entry not flipped:**
  - A-TREND-11/-12 (`campaignLedger.test.ts:58, 74`, item 2): blocked by the month-to-date and "first" differences above;
  - A-TREND-01/-02 (`lib/analysis/__tests__/trend.test.ts`, item 2): A-TREND-02 was FAILed in the item 1 review (F3).
- **Items 3-5 provide parts:**
  - the price-scaled 3 points (`pointScale.ts`, item 3) that A-TREND-10/-11/-12 and A-ENTRY-19 use;
  - the crossing construct, `olderGannLevels`, `sameGannLevel` and the copy plumbing (item 5) that A-TREND-10 reuses;
  - item 5 deferred A-ENTRY-19 and the with-trend gate (its map, conflict 6) to this item.
- **Duplicates and overlaps:**
  - C-TREND-06 ⊂ C-TREND-03.
  - A-TREND-12 is the mirror of -11 (one change).
  - A-TREND-07 and -08 are one module; their action is A-SELECTION-04 (item 11).
  - A-TREND-06 overlaps A-LEVELS-01 (item 9).
  - A-TREND-10 overlaps A-LEVELS-06 (item 9) and `stopBreach.ts`.
  - The 2-3-month counter-move strength (A-TIME-01/-02, item 7) is the time half of the trend read and should not be built here.
  - A-ENTRY-19 is distinct from C-ENTRY-02 (`narrowRange.ts`, 3-4 days, class C).
