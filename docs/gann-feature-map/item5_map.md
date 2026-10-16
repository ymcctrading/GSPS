# Item 5 map: Gann's buying and selling points (A-ENTRY, C-ENTRY)

Read-only analysis of `/home/claude/gsps-item4c` at `73c4c1e` (item 4c). Source: `gann_features.json`, `PLAN.md` "Full parity order" item 5, and the code. Line numbers are for that commit.

## 0. What the pipeline is today (verified)

Every trade plan comes from **one** construction, Gann's crossing of the last completed 3-Day Chart swing:

| Step | Code | What it does |
|---|---|---|
| Level | `lib/gann/entryTrigger.ts:145-187` `computeGannEntryTrigger` | Last completed 3-Day Chart top (long) or bottom (short) from **daily** bars. `triggerPrice` = L ± 3pts, `reactionEntry` = L ± 1pt, `reactionStop` = L ∓ 3pts (1pt = 3pts/3), `stopPrice` = protective swing ∓ 3pts (no longer used by plans). |
| Points | `lib/gann/pointScale.ts:52-66` | Price-scaled 3 points (power curve, clamped 1-12%). |
| Direction | `lib/scan/entrySelection.ts:95-102` `preferredEntryDirection` | Reversion pass arms **against** the weighted macro trend. Continuation pass (`marketScan.ts`, `replay.ts:719-730`) arms with it only when momentum is elevated, breadth agrees and the daily Gann trend agrees (`isGannContinuation`, `:81-86`). |
| Price | `lib/strat/levels.ts:520-528` `gannEntrySource` → `computeTradeLevels:530` | Entry = L+1pt, stop = L-3pt, used as given (`gannReaction`, `:563`, `:587`). Targets from S/R and Gann levels. |
| Arm | `lib/lifecycle/entryConfirmation.ts:120-132` | With `stopPrice`, ready on the first closed **15-min** bar closing at or past `gannBreakLine(entry, stop)` = L+3pt. |
| Live gate | `lib/lifecycle/confirmNow.ts:72-114`, `lib/trade/place-order.ts:167-214` | Reads bars **since `plan.generatedAt`**; "dead" on a later close through the stop. Order rests as a limit at the entry. |
| Replay | `lib/backtest/replay.ts:700-737` (arming), `:802-809` (`entryRule: "reaction"`), `:893-905` (bracket), `:937` (exit's crossed level), `:1187-1215` `priceTradeLevels` | Same trigger and `gannEntrySource`. |
| Exits | `lib/trade/gann-exit-live.ts:69-75`, `lib/gann/exitRules.ts:138-143` | Live exits **recompute** the crossed level from `computeGannEntryTrigger` at the entry date; the replay passes `trigger.pivot.price`. |
| Scored | `lib/scoring/score.ts:396` `entryTriggerArmed` | Passes iff a swing-crossing trigger exists in the scored direction. |

**The brief's claims hold, with one exception.** `multipleTops`, `timeRules` (halt, reaction weeks), `accumulation`, `extremeRules` and `leadership` are only consumed through `readDisclosedRules` (`lib/gann/disclosedRules.ts:481-512`). That function feeds two things: the confluence card (`lib/signals/confluence/gann.ts:256`, `describeDisclosedRules`) and the replay's measured, non-gating `contextFactors` (`lib/gann/contextFactors.ts:107-130`). None of them prices, arms or gates a plan. Two modules are different:

- **`breakaway.ts` is not context.** It is a verdict hold: `applyBreakawayHold` (`score.ts:632`) holds Execute to Watch. It reads the swing-crossing trigger, so it is not an entry of its own.
- **`pyramid.ts` is not context either.** It is an add-on suggestion (`app/api/positions/pyramid/route.ts`) and a replay option (`replay.ts:1142`). It is never an initial entry.

Its 3-point values were moved by item 3, so several `gsps_location` fields in `gann_features.json` are **stale**. They still cite 0.3% for A-ENTRY-01/-04/-14/-15 and "exit only" for A-ENTRY-16. Correct readings are below.

### Pipeline defects that block every "reaction after a crossing" rule (fix first)

1. **The crossed level re-anchors.** A reaction of 3 or more daily bars completes a new 3-Day Chart top at the post-crossing high (`swingChart.ts:137+`). After that, `computeGannEntryTrigger` returns the **new** top, not the crossed one (`entryTrigger.ts:155`), and the old reaction buy disappears from both the scan and the replay (the replay's `pivotKey` changes, `replay.ts:751`). A reaction back to L+1 that takes 3+ days is therefore never bought, live or in the replay. Gann's rule is about the *crossed* level and holds until it is bought or broken by 3 points. That is the A-ENTRY-04 and -16 defect and the reason neither can pass today.
2. **Live and replay arm over different windows.**
   - **Live** reads closes since `plan.generatedAt` (`confirmNow.ts:76-78`). Plans expire after hours (`lifecycle/fromScanResult.ts:97`: `expiresAfterBars` × 15 min). A crossing made before the current plan was generated is lost. If price has already reacted back below L+3, the order is refused (`awaiting_confirmation`) even though Gann buys exactly then.
   - **The replay** counts from the first session the pivot armed (`replay.ts:803-806`).
   - This is the cross-platform failure shape AGENTS.md names.
3. **The replay default is not the production rule.** `ReplayOptions.entryRule` defaults to `"stop"` (`replay.ts:657`, `run.ts:544`), but production has traded `"reaction"` since 4b. Every item-5 replay must pass `entryRule: "reaction"`, or the default must change.
4. **The geometry is recovered from (entry, stop), with no stored kind or level.** `gannBreakLine` = entry+(entry-stop)/2 and `gannCrossedLevel` = (3·entry+stop)/4 (`entryTrigger.ts:198-205`). These assume entry = L+1, stop = L-3. Callers:
   - `entryConfirmation.ts:124`
   - `place-order.ts:186-193`
   - `portfolio-manager.ts:311`
   - `graduationExam.ts:250`
   - `gann-exit-live.ts:69-75`, which recomputes the level instead of recovering it.

   `PlanCoordinates` (`lifecycle/types.ts:66-76`) has no field for the arming line, the level or the entry kind. **Any buying point with a different geometry needs these to be carried explicitly.** Otherwise a double-bottom buy at L with a stop at L-3 would be "armed" by a phantom line at L+1.5.

## 1. Entry-by-entry map

Legend for "Today": (a) entry that prices plans, (b) scored criterion, (c) card/context only (including replay `contextFactors`), (d) unused code, (e) nothing.
**UNSPEC** = a parameter Gann does not give. It cannot be invented, so it needs an owner decision or a labelled engineering choice of the kind `pointScale.ts` documents.

### Family X: crossing an old level, then buy the reaction (shares the existing construct)

| ID | Rule (short) / source / class | Today | 1-for-1 build needs | Pipeline |
|---|---|---|---|---|
| A-ENTRY-04 | Cross old top by 3; buy a 1-2pt reaction (51 down to 48), stop 3 under the old top (W006 pp.20, 46-47, A) | **(a)** `entryTrigger.ts:182-186`, `levels.ts:520`, `entryConfirmation.ts:120`; replay `"reaction"`. Exit hold test (`exitRules.ts:138`). | **Level:** old top. **Arm:** close ≥ L+3 (have). **Order:** limit for the reaction (have, at L+1). **Stop:** L-3 (have). **Missing:** the level must persist after crossing until filled or broken (defect 1); live and replay must share the arming window (defect 2). **Direction:** none stated. **Time:** none. **UNSPEC:** p.20 "1-2 point reaction" is measured from the *high*, while the Rule 3 example buys 51-48, from L+1 down to L-2. GSPS uses L+1, which matches the worked example; a reaction from a high above 53 is not specified. | Shares. Fix `entryTrigger.ts:155-164` (choose the *crossed* top: the most recent top with a close ≥ L+3 after it and no close ≤ L-3 since) and `confirmNow.ts:72-81` (count from the crossing, not plan generation). |
| A-ENTRY-16 | After an old bottom is broken by 3+, sell a small rally, stop 3 above the old bottom (W006 p.22, A) | **(a)**, not exit-only as the feature says. It is the bearish mirror of -04 in the same code (`reactionEntry` = L-1, `reactionStop` = L+3). | Same as -04, mirrored. **UNSPEC:** size of the "small rally" (L-1 used). | Shares; same two defects. |
| A-ENTRY-15 | Short after distribution and a 3-pt break of the last *important* bottom (W006 pp.22, 47, A) | **(a)** for the 3-pt break, via the -16 construct. No distribution precondition. "Important" is not read (any last 3-day bottom). | **Precondition:** distribution. GSPS readings available: `accumulation.ts` breakout "down" after time in range, and `capitalStock.ts` distribution week. **Order:** "sell short after … break" is a stop-entry at L-3 or the -16 sell-the-rally; the text allows either → **UNSPEC**. **UNSPEC:** what makes a bottom "important" (weekly chart? campaign bottom? age, per A-ENTRY-09?); how long distribution must last (the Commodities 2-6/10-13 weeks is a different source). | Shares, plus a precondition flag on the trigger. Gate at `scanTicker.ts:278` and `replay.ts:717/727`. |
| A-ENTRY-05 | After crossing a previous *year's* top by 3, buy any small reaction (W006 pp.20, 47, A) | **(e)**. `leadership.ts` `firstYearHighCrossed` is a different level (the campaign's first-year high) and is context. | **Level:** prior calendar year's high. Daily history is 1y live (`data/provider.ts:190`), so read monthly (10y, `:188`); the replay has `priorMonthly` (`replay.ts:705`). **Arm:** close ≥ L+3. **Order/stop:** "any small reaction" with no stop stated in this entry. Using -04's L+1/L-3 is an inference from -04, to be labelled as such. **UNSPEC:** reaction size; whether "previous year" is the calendar year or any prior year's top (A-ENTRY-09 suggests older is stronger). | Shares if the trigger accepts a level source other than the 3-day chart (see §3). |
| A-ENTRY-17 | Break of a previous year's bottom by 3 is a short (W006 pp.22, 47, A) | **(e)** | Mirror of -05. **Order:** "is a short" with no stop and no order type → **UNSPEC**. The -16 mirror is the nearest Gann-stated construct. | Shares (as -05). |
| A-ENTRY-06 | New all-time highs are usually safe buys (W006 p.47, A) | **(e)** | **Level:** all-time high. The feed reaches about 10y monthly, so "all-time" is "feed-reach high": a documented limitation, not Gann's. **Arm/order/stop:** not stated in the rule → UNSPEC. The crossing construct (-04) is the inference. | Shares (level source). |
| A-ENTRY-09 | The further back an old top, the more important when crossed (W006 p.24, A) | **(e)**. Not an entry: a ranking of crossings by the age of the level. | Pivot age (bars or calendar time since `pivot.index`) carried on the trigger. Used in the selection design (§4), not as a gate. **UNSPEC:** any numeric weight. | Field on the trigger; consumed by selection. |

### Family H: holding a level (new construct: no crossing; buy at or after a held low)

| ID | Rule / source / class | Today | 1-for-1 build needs | Pipeline |
|---|---|---|---|---|
| A-ENTRY-01 | Single bottom held 2-3 weeks (p.46: 1-3+ weeks), then buy, stop 3 under the lowest week. Active markets: 2-3 days, lowest day (W006 pp.20, 46-47, A) | **(c)** `timeRules.ts:50-64` halt: a 20-session low made 2-3 sessions ago, with `stop` = extreme − 3pts (price-scaled since item 3; the feature text saying 0.3% is stale). No week-hold rule. Card and `contextFactors.haltAgainstTrade` only. | **Level:** the lowest week's low (weekly), or the lowest day's low (active). **Arm:** no lower low for 2-3 weeks (2-3 days active). **Order:** "then buy", type **UNSPEC** (next open or a market order at the end of the hold is the literal reading). **Stop:** lowest week − 3pts / lowest day − 3pts. **Direction:** none stated; it is a bottom, so a reversion long. **UNSPEC:** "active market" (which symbols use days vs weeks); 2-3 vs 1-3+ weeks (source conflict, owner); what "a reaction" first requires (minimum decline); halt window (20 sessions is an engineering choice). | **New construct.** Needs its own arming state ("held N sessions"). It cannot use `gannBreakLine` (defect 4). |
| A-ENTRY-08 | Bull-market reactions run 2-3 weeks; buy once the stock holds 2-3 days after one (W006 pp.46-47, A) | **(c)** `timeRules.ts:65-71` (`reactionInZone` days 8-21, `thirdWeek`) + halt; `contextFactors.ts:117-123`. | **Precondition:** bull market (weekly trend bullish; `readCounterMove.trend`) and a counter-move of 2-3 weeks. **Arm:** 2-3 day hold (no lower low). **Stop:** not stated here. -01's active-market form (3 under the lowest day) is the Gann-stated analogue. **Order:** **UNSPEC**. **UNSPEC:** "2-3 weeks" in days (8-21 is an engineering choice already labelled). | New construct H with a trend + duration precondition. With the trend: continuation pass only. |
| A-ENTRY-07 | In a bull market buy reactions, stop 3 under the previous support (W006 p.20, A) | **(c)/(e)**. The feature's location is stale: since 4b the equity stop is the crossed level − 3 (`levels.ts:352-353`), not support-anchored. `trendPullback.ts` is the separate Signal & Regime layer and never prices a GSPS plan. | **Stop:** previous support − 3pts. **Level/order:** "buy reactions" gives no entry price → **UNSPEC**. **UNSPEC:** "previous support" (last 3-day bottom? last weekly bottom? nearest clustered S/R?). **Direction:** bull market. | Probably folds into -08 (same act, -08 adds the timing). Owner to confirm it is not a separate entry. |
| A-ENTRY-02 | Double/triple bottoms (same level, weeks to a year+ apart): buy, stop 1-3 (never > 3) below (W006 pp.20, 46, A) | **(c)** `multipleTops.ts:63-91` (bottom cluster, `tests`, state testing/crossed/failed). Card and `contextFactors` only. Its band is 1% (`:34`). | **Level:** the cluster level. **Arm:** a 2nd/3rd test that holds. **Order:** "buy" at the test → **UNSPEC** (limit at L is the closest literal reading). **Stop:** L − 3pts (3 = "safest", A-STOP-03, consistent with item 3). **Same-level band:** Gann's A-LEVELS-06 gives "not 3 points under the old low" as holding. That supports a band of up to 3pts *below*; the 1% band is not Gann's. **UNSPEC:** tolerance *above* the old low; the minimum separation ("weeks"). | New construct H (limit at a level). |
| A-ENTRY-03 | A triple bottom that holds the third time → advance follows while it is not broken (W006 p.11, A) | **(c)** `multipleTops.ts`; `levelRole.ts:50` `levelTestConfidence` (feeds the `historicalSR` note text only, `score.ts:410-416`). | Same as -02 with `tests ≥ 3`. Invalidation = break of the third bottom, which A-LEVELS-06 reads as 3pts → same as -02's stop. | Fold into -02. |
| A-ENTRY-10 | All-time low held weeks or months without a 3-pt break: buy, stop 3 under (W006 p.24, A) | **(e)** | **Level:** all-time low (feed reach, as -06). **Arm:** no close (or low? **UNSPEC**) 3pts under for "weeks or months" (**UNSPEC** minimum; -01's 2-3 weeks is the nearest Gann figure). **Stop:** L − 3. **Order:** **UNSPEC**. | Construct H with a different level source. |
| A-ENTRY-14 | Short against single, double or triple tops, stop 3 above (W006 pp.22, 47, A) | **(c)** `multipleTops.ts` (top, state failed), `timeRules.ts` halt at top (stop L+3). | Mirror of -01/-02. | Construct H, mirrored. |
| A-ENTRY-20 | Double top whose earlier high came on heavy volume: short, stop 3 above the old high (W006 p.28, A) | **(c)/(b)**: `multipleTops` (c) and `volumeClimax` (b, scored, high anchor with `retestOnLowerVolume`). Never combined. | -14 plus a precondition: the earlier top printed on heavy volume. **UNSPEC:** "heavy" (`VOLUME_CLIMAX_THRESHOLD` 1.5 is GSPS's engineering figure, not Gann's). | Construct H + volume flag. |
| A-ENTRY-18 | Bear-market rallies last 2-3 weeks: sell at the end of week 2 or 3, stop 3 above the previous week's high (W006 p.47, A) | **(c)** `timeRules.ts` (`reactionInZone`, `thirdWeek`, bearish counter-move). No weekly-high stop. | **Precondition:** bear market (weekly trend bearish) and a rally in week 2 or 3. **Order:** at the end of the week (a weekly close: a market order on the last session of the week or the next open; **UNSPEC** which). **Stop:** "previous week's" high + 3pts. **UNSPEC:** whether "previous" means the week just ended or the one before it. **Time:** a hard time trigger, unlike every other entry. | **New construct T (time-triggered).** No level crossing at all. |
| A-ENTRY-19 | A narrow week followed by a sharp drop on large volume turns the trend down: short even while the averages rise (W006 p.27, A) | **(e)** | Precondition only. Entry, stop and order are all unstated. **UNSPEC:** "narrow", "sharp", "large". Explicitly **not** gated by the market trend. | Cannot be built 1-for-1 without four owner choices. Recommend context first, as PLAN old item 6 had it. |

### Class C / UNVERIFIABLE

| ID | Rule / source / class | Today | Build | Note |
|---|---|---|---|---|
| C-ENTRY-01 | Never enter with the trend on the 3rd day of a run (W003, UNVERIFIABLE) | (e) | **Held** (PLAN: UNVERIFIABLE waits for the owner's reading). | It would veto some A-ENTRY-04 crossings closing on day 3, and -08's "holds 2-3 days" entries. Class A wins on conflict. |
| C-ENTRY-02 | A narrow 3-4 day range breaks into a sharp 3-day move (W003, C) | (c)-adjacent: `breakaway.ts` (13 weeks) is a verdict hold; `accumulation.ts` (20 sessions) is context. | No entry, stop or order given; "narrow" is UNSPEC. Not an entry rule as written. | It conflicts in scale with Gann's own 2-6/10-13-week breakaway (A, Commodities). Recommend context only. |
| C-ENTRY-03 | Fast moves start from the 3rd/4th higher bottom (W003, UNVERIFIABLE) | (e). `trendStrength.ts` reads rising bottoms but does not count them. | **Held.** | It would be a ranking input, not an entry. |
| C-ENTRY-04 | The first return to 50% after a break below it is a short; mirror for longs (W003, C) | (c)-adjacent: `retracement.ts:117` `rangeMidpoint` (no range defined there); `intraday.ts` uses the session 50% for direction and invalidation; `trendPullback.ts` (separate layer). | **Level:** 50% of *which* range is UNSPEC. **Order:** limit at the 50% retest. **Stop:** UNSPEC. | It conflicts with class A's sell-the-rally level (A-ENTRY-16: the broken old bottom, stop 3 above) and A-LEVELS-01. A wins. Build only as a labelled class-C option, if at all. |

### Related buying and selling points owned by other items (do not double-build)

| ID | Point | Today | Owner item |
|---|---|---|---|
| A-TREND-10 | After a late-bear break to new lows, a rally back 3 above the old bottom = buy (AT&T at 91) | `stopBreach.ts:119-146` `isReclaimedByClose` reinstates a broken plan; it is not an entry. | 6 (trend), but it is construct X mirrored (crossing a broken bottom back up). Share the code. |
| A-EXIT-02 | Reverse at a trend change: short near an old top of 75 held 1-2 weeks, stop 78; if stopped, reverse | Exits only (`exitRules` trend_change). | 11. Its entry half is A-ENTRY-14 with a 1-2 week hold (a third duration figure; see conflicts). |
| A-PYRAMID-07 | Re-buy after a 12-15 pt reaction, stop about 6 pts away | (e) | 10 |
| A-TIME-15 | Trade the dates: buy or sell at a forecast turn regardless of price | Context (`timeCycles.ts`) | 7; held by the F4 result and owner policy |
| A-SELECTION-02/-03 | Buy the stocks that cross previous years' tops first; short those that break previous years' bottoms first | (c) `leadership.ts` | 11. It reuses the -05/-17 yearly-level reading. |

## 2. Conflicts

**Between rules (all class A, W006 unless noted):**

1. **Stop anchor.** Gann places the stop on four different anchors:

   | Rule | Stop |
   |---|---|
   | -04 | crossed level − 3 |
   | -01 | lowest *week* − 3, or lowest *day* − 3 in active markets |
   | -02 | bottom − 1 to 3 (never > 3) |
   | -07 | previous support − 3 |
   | -18 | previous week's high + 3 |

   All are "3 points beyond a named level", so they share one formula, `beyondByThreePoints(anchor)`, with a different anchor per construct. The real conflict is with **A-STOP-02, never risk more than 5 points**. An entry after a 2-3-week hold, stopped 3 under the lowest week, can sit more than 5 points from entry, and -08's market entry after a reaction can too. Construct X never conflicts (risk = 4pts). PLAN item 4's proposal (hold to Watch when the stop is wider than 5pts) is not built (grep finds no cap). **The owner must choose:** skip the entry, or let the 5-pt cap override the anchor. Gann's text implies skip.
2. **-02 "1-3 points" vs A-STOP-03 "3 is safest".** Take 3, consistent with the item-3 decision. No owner call needed.
3. **Hold durations.** -01 gives p.20 "2-3 weeks" against p.46 "1-3+ weeks" (recorded in NOTES.md), A-EXIT-02 says "holding 1-2 weeks" at a top, and -10 says "weeks or months". The owner decides, or -01's 2-3 weeks applies only to -01.
4. **The reaction size in -04.** "1-2 point reaction" from the high versus "51 down to 48" in the worked example (from L+1 down to L-2). A limit at L+1 satisfies the example. A reaction measured from a high above L+3 is not specified.
5. **The same level as both a buy and a sell (Polarity, not a contradiction).** A double top shorted with a stop at L+3 (-14, -20), and the same top crossed by 3 (-04), are bought at the same line. That is a stop-and-reverse (A-EXIT-02 "if stopped, reverse again"). Selection must allow a short and a long armed on one symbol at once, and must not net them.
6. **Direction gating.**
   - -07, -08 and -05 (implicitly) are bull-market-only; -18 is bear-market-only; -19 is explicitly *not* market-gated.
   - The holding-bottom rules (-01, -02, -10) are reversals.
   - GSPS's reversion pass arms only **against** the weighted macro trend (`entrySelection.ts:100-101`). Its continuation pass arms with it only under `momentumElevated` + breadth + daily trend (`replay.ts:722-726`). The momentum gate has no Gann source, so -07, -08 and -05 would be wrongly suppressed in quiet bull markets. The with-trend gate for these rules should be the weekly swing trend alone (Gann's), not the GSPS momentum filter. That moves the continuation pass, so it is an owner decision linked to item 6 (A-TREND-09).
7. **The 3-Day Chart against "the crossed level"** (defect 1): GSPS's own construction against Gann's rule. Gann's rule wins (precedence principle). This is not an owner decision.

**Class A against class C:**

- **C-ENTRY-04 against A-ENTRY-16 / A-LEVELS-01.** The sell-the-rally level is 50% of a range (C) versus the broken old bottom with its stop 3 above (A). A wins.
- **C-ENTRY-02 against A breakaway.** A 3-4 day narrow range (C) versus 2-6 or 10-13 weeks (A, Commodities). A wins; C stays context.
- **C-ENTRY-01 (UNVERIFIABLE) against A-ENTRY-04 and -08.** A day-3 veto. Held.
- **C-ENTRY-03 (UNVERIFIABLE) against A-ENTRY-03.** These count different things (successive higher bottoms versus repeated tests of one level), so they do not conflict. C is held.

## 3. One design that serves both families

Generalise the trigger instead of adding parallel pipelines:

```
GannBuyingPoint {
  kind: "crossing" | "reactionAfterCrossing" | "heldLevel" | "timedRally" ...,
  ruleId: "A-ENTRY-04" | ...,           // provenance, shown on the card
  direction,
  level,                                 // the old top/bottom/held low
  armLine: number | null,               // close needed to arm (L±3) — null for held-level/timed
  armCondition: "closePast" | "heldFor" | "weekEnd",
  heldSince?: bar index/time,           // for heldFor
  entry, entryOrder: "limit" | "market_next_open" | "stop",
  stop,                                  // beyondByThreePoints(anchor)
  anchor: "crossedLevel" | "lowestWeek" | "lowestDay" | "clusterLevel" | "priorWeekHigh",
  levelAgeBars,                          // for A-ENTRY-09
}
```

Change points:

1. **`lib/gann/entryTrigger.ts:100-187`.** Keep `GannEntryTrigger` and add `computeGannBuyingPoints(daily, weekly/monthly, direction) → GannBuyingPoint[]`. The existing crossing becomes `kind: "reactionAfterCrossing"`, with the crossed level persisting (defect 1). Remove `gannBreakLine`/`gannCrossedLevel` (`:198-205`) once nothing recovers geometry.
2. **`lib/strat/levels.ts:488-528`.** `EntrySource` gains `armLine`, `level`, `anchor`, `ruleId` and `entryOrder`, and `gannReaction` generalises to "stop fixed by a Gann rule". `computeTradeLevels:530` already takes entry and stop as given when the flag is set.
3. **`lib/lifecycle/types.ts:66-76` `PlanCoordinates`, `fromScanResult.ts:97-108`, and a migration for the `trade_plans` columns.** Store `armLine`, `level`, `ruleId` and `armedAt`. Remember that merging a migration is not applying it.
4. **`lib/lifecycle/entryConfirmation.ts:120-132`.** Read `rule.armLine` instead of `gannBreakLine`. Add the arm conditions `heldFor` (no close/low beyond `stop` for N bars since `heldSince`) and `weekEnd`.
5. **`confirmNow.ts:72-114`, `place-order.ts:167-214`.** Count from `armedAt` / the pivot, not from `generatedAt` (defect 2). Pass `armLine` explicitly.
6. **Every caller that currently recomputes or recovers geometry must read the stored level:**
   - `portfolio-manager.ts:311`
   - `graduationExam.ts:250`
   - `gann-exit-live.ts:69-75` (the hold test belongs to construct X only)
   - `replay.ts:937`
7. **`scanTicker.ts:278-289`.** Compute the list and select one per direction (§4). `ScanResult.levels` is a single plan today, which is the main surface constraint.
8. **`replay.ts:631-643, 700-737, 751, 800-905, 1187-1215`.**
   - `SessionTrigger.trigger` becomes a `GannBuyingPoint`.
   - `pivotKey` includes `ruleId` and `level`.
   - A fill branch is added per `entryOrder`.
   - `priceTradeLevels` uses the point's entry and stop.
   - The default `entryRule` changes to `"reaction"` (defect 3).
9. **`breakaway.ts:54-72` and `score.ts:396, 488`.**
   - `readBreakaway` takes the point's arm line.
   - `entryTriggerArmed` says which buying point armed.
   - A held-level buy inside a sideways range would be held to Watch by decision 5. Gann's -01/-02 are buys *at* range bottoms, which **conflicts with owner decision 5** ("range setups are Watch context; Execute needs the breakaway"). Flag for the owner.
10. **Sources of the new readings:**
    - Weekly bars come from `toWeeklyBars` (`disclosedRules.ts`) or the fetched weekly bars (5y).
    - The prior-year and all-time levels come from the monthly bars (10y) live and `priorMonthly` in the replay.
    - Promote `timeRules.ts:48-73`, `multipleTops.ts:63-91` and `accumulation.ts:46-60` from context readers into point generators, keeping their card output.

Construct X (-04, -16, -15, -05, -17, -06, A-TREND-10) shares everything after this. Constructs H (-01, -02/-03, -08/-07, -10, -14, -20) and T (-18) need the new `armCondition`s and the stored `armLine` and `level`. None needs a second pipeline.

## 4. Choosing among several armed points on one symbol

**What Gann states (partial orders only):**

- **Among crossings, the older level matters more** (A-ENTRY-09). By extension, an all-time high or a prior-year top outranks a 3-Day Chart top (A-ENTRY-05/-06 call them "safe" or "any small reaction").
- **Among tests of one level:** the third test decides (A-ENTRY-03), and the fourth is caution (`levelTestConfidence`, A9, unread here).
- **Breaks:** "Safest at 3 points" (A-ENTRY-15, A-STOP-03) concerns the margin, not which point to take.
- **Trend:** "Keep with the trend all the time" (A-EXIT-02).

Gann gives **no ranking across families** (crossing vs held bottom vs timed rally), and AGENTS.md already records that the sources never rank conditions against each other.

**Proposed design (not inventive):**

1. Arm every point, one live candidate per (direction, level).
2. **Act on the first to arm and fill.** That is event order, which is how a resting set of Gann orders behaves, not a ranking claim. Hold one initial position per symbol; later points become pyramid adds under `pyramid.ts` rules, with the same direction only.
3. **On the same bar, break ties by A-ENTRY-09:** the older level first, then the higher test count.
4. **For display, where the scan returns one plan:**
   - Show the point that arms nearest to price.
   - List the others.
   - Never score the choice.

**Owner decisions:**

- **(a)** A ranking across families, if he wants one beyond event order.
- **(b)** Whether a long and a short may both rest on one symbol. Gann's stop-and-reverse implies yes.
- **(c)** Whether `ScanResult` may carry more than one plan.

## 5. Build order inside item 5 (cheapest and most literal first)

1. **Fix the shared construct.**
   - Defects 1-3: the crossed level persists, live and replay share the arming window, and the replay defaults to `reaction`.
   - Store `armLine`/`level`/`ruleId` (defect 4).
   - This is what lets **A-ENTRY-04 and -16** pass. It moves the verdict, so bump `STRATEGY_VERSION` and run the replay.
2. **A-ENTRY-02/-03 and -14** (double/triple bottoms and tops).
   - The reading already exists (`multipleTops.ts`). The stop is literal (L ∓ 3), and the band can come from A-LEVELS-06 (3 points below).
   - Needs construct H with a limit at the level.
   - Order type is UNSPEC; the owner confirms a limit at the level.
3. **A-ENTRY-05/-17** (prior-year top/bottom) and **-06/-10** (all-time levels).
   - These are a new level source on construct X/H; the monthly bars are already fetched.
   - -09 (level age) is a field added in the same change.
4. **A-ENTRY-01** (single bottom with hold), then **-08/-07** (bull-market reaction plus a 2-3 day hold).
   - Needs the `heldFor` arm condition.
   - The A-STOP-02 5-point decision and the hold-duration conflict must be settled first.
5. **A-ENTRY-15** (distribution precondition) and **-20** (heavy-volume precondition). These are preconditions on built constructs, each with an UNSPEC term.
6. **A-ENTRY-18** (time-triggered weekly sell). This is construct T and is the only time-triggered entry.
7. **Not built 1-for-1:**
   - A-ENTRY-19: four UNSPEC terms; context first.
   - C-ENTRY-02 and -04: class C, conflicting with class A; context or skip.
   - C-ENTRY-01 and -03: held as UNVERIFIABLE.

## 6. Owner decisions this item needs (collected)

1. **The 5-point risk cap (A-STOP-02) against stops at the lowest week or day.** Skip the trade, or cap it?
2. **Hold durations:** 2-3 weeks (p.20) or 1-3+ weeks (p.46); what counts as an "active market" (days vs weeks); the minimum for -10.
3. **Entry order type for held-level and bull-reaction buys:** a limit at the level, or the next open after the hold.
4. **Held-bottom buys inside a sideways range:** these conflict with owner decision 5's breakaway hold.
5. **The with-trend gate for -05/-07/-08:** the weekly Gann trend alone, or keep GSPS's momentum + breadth continuation gate.
6. **"Important" bottom (-15), "heavy" volume (-20), "previous week" (-18), the reaction size in -05/-06/-17, and the -02 band above the old low.**
7. **Selection:** a cross-family ranking, simultaneous long/short, and multi-plan `ScanResult`.
