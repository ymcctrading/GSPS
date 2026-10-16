# Item 8 map: Gann's volume rules (A-VOLUME, C-VOLUME)

This is a read-only analysis of `/home/claude/gsps-item5s4`, branch `item5-step4`, at `9e975e6` ("Item 7 step 6: base rates for the time windows"). Line numbers are for that commit.

**Sources:**
- `gann_features.json`: 11 A-VOLUME entries (-03 to -13) and C-VOLUME-01. There is no A-VOLUME-01 or -02. A-VOLUME-01 was classed philosophy-no-method, and A-VOLUME-02 was merged into A-VOLUME-07 (`docs/gann-feature-map/features_A_notes.md:52`, `cluster_A_gann_primary.md:148-149, 288`).
- `PLAN.md` "Full parity order", item 8 ("Volume rules", moves the verdict). Old item 6 also listed A-VOLUME-12 as a context field (`PLAN.md:73`).
- W006 (*New Stock Trend Detector*) detailed notes: `/mnt/project-files/literature-reading-output/works/W006/detailed-notes.md:108-131`.
- The long-book checkpoint (`…/external/checkpoint_latest/unzipped/literature-reading-output/works/`): W023 Master Course Ch.12 (`W023/detailed-notes.md:549-561`), W001 HTMPC p.25 and p.63 (`W001/detailed-notes.md:32, 66`), W005 TST/WSSS, W009 *45 Years* R7.
- `docs/memory-bank/sources/A2_1_master_stock_market_course.md:652-676`.
- `docs/memory-bank/GANN_PARITY_ROADMAP.md` §3.5 (l.132-139) and Stage D (l.248-250).
- `docs/memory-bank/GANN_CYCLES_HERMETIC_MASTER_REPORT.md` §5 (l.181-192) and conflict X1 (l.412-415).
- `docs/gann-feature-map/item1_sweep_review.md:18-19` and `item5_map.md:72-75`.

**Status:**
- `STRATEGY_VERSION` today is `2026-10-16-gann-section-exits` (`lib/backtest/strategyVersion.ts:188`).
- Today is 2026-10-16, roadmap phase Q1. Item 8 is out-of-phase parity work (PR phase `N/A`, direct owner request).
- Tests were not run for this map. The test names below come from reading the files.

## 0. How GSPS reads volume today (verified)

| Step | Code | What it does | Live / replay |
|---|---|---|---|
| **Scored volume rule (D1)** | `lib/gann/volumeClimax.ts:138-181` `computeVolumeClimax(bars, lookback=20)` | Pivots: `findPivots(bars,4)` (l.139). For each kind it takes the last `RECENT_PIVOTS_CHECKED`=3 pivots (l.100, 143) and reads: `climax` = best `relativeVolume` among them > `VOLUME_CLIMAX_THRESHOLD` 1.5 (l.80, 156); `dryingUp` = mean volume **and** mean range of the `DRY_UP_BARS`=5 bars ending at the pivot both below the 20 before (l.103, 128-136); `retestOnLowerVolume` = the anchor reaches the previous pivot of its kind within `RETEST_TOLERANCE_PCT`=1% or beyond it, with a lower relative volume (l.105, 158-165). `confirms`: a low passes on dryingUp, retest or climax; a high on climax or retest (l.166). | Live `scanTicker.ts:189` → `computeScore` (`scanTicker.ts:423`). Replay `replay.ts:577` → `replay.ts:1352`. Same function on both. |
| Scoring | `lib/scoring/score.ts:412-414` (anchor kind matches the direction, l.374); criterion row l.502-509; note text `volumeNote` l.244-256 | 1 of 9 points (`lib/scoring/weights.ts:68-78`; Execute 6, Watch 3.5, l.143-144). | Live and replay. |
| **Coarse pre-filter** | `lib/marketScan.ts:438-443` | +2 to the coarse reversion score when `climax?.confirms`. | **Live only.** The replay has no coarse pass (same gap as item 7 §4.7). |
| Measurement status | `lib/validation/criteria-registry.ts:225-290` | `evidence: "hypothesis"`. Lines 231-235 say the D1 construction is unmeasured and earlier numbers don't transfer. | Run 12 (six years, 1 hour, on the D1 version) says only "`volumeClimax` … hold their sign" (`docs/replay-runs/2026-09-27-766sym-NOTES.md:135`). No per-criterion figure is recorded for D1. |
| Boiling point | `lib/gann/boilingPoint.ts:58` | Weeks since the climax anchor; appended to the note (`score.ts:419-422`). | Context; live and replay. |
| **Capital-stock turnover (D2)** | `lib/gann/capitalStock.ts:97-150` | Reads shares outstanding. `distributionWeek` = ⅔ of the stock in one week (l.63, 132); `plainTopWeek` ≥ 90% (l.65, 133). Both need the heavy week to close in the upper half of the 13-week range (l.114) and look back 4 weeks (l.71, 112). `distributionInRange` = the whole stock traded inside a range-bound `readBreakaway` range after an advance (l.116-135). The reading is dropped if the median week turns over more than 25% (l.69, 104-105). | Context live via `evaluateGannConfluence` → `readDisclosedRules` (`signals/confluence/gann.ts:256`, `disclosedRules.ts:538`). That path runs only when the `gann_confluence_layer` flag is on (`scanTicker.ts:496`, `confluence/flags.ts:27`). Replay via `replay.ts:647`, using `splitAdjustedSharesAsOf` for the session date (`replay.ts:742`). Live uses the latest stored count (`scanTicker.ts:505`). |
| **D2 distribution exit (acts)** | `lib/gann/exitRules.ts:232-244` | A long exits when a distribution or plain-top week prints in or after the fill week. Longs only (l.36-44). | Live `lib/trade/gann-exit-live.ts:122-130` (completed daily bars, `ref.sharesOutstanding`). Replay `replay.ts:1019, 1225` (count as of the date). Same function. |
| Shares per point | `lib/gann/sharesPerPoint.ts:49-66` | Volume per point of the current up leg against the prior up leg. `topWarning` when the ratio ≥ `TOP_WARNING_RATIO` 1.8 (l.29) and price is within 3% of the campaign high (l.30, 63). Legs come from `buildCampaignLedger`, i.e. **3-Day Chart swings** (`campaignLedger.ts:5-6, 36-37`). | Context (`disclosedRules.ts:547, 581`; `contextFactors.ts:118-120`). Live and replay. Measured `sharesPerPointTopAgainst` +0.18 (n 59), small sample, sign against Gann (`2026-09-27-766sym-NOTES.md:396`). |
| Narrow week | `lib/gann/narrowWeek.ts:42-61` | Narrowest of 4 weeks, then a 3-point close beyond it on volume above the 13-week average. | Context (`disclosedRules.ts:555`; `contextFactors.ts:80`). A-ENTRY-19, not item 8. |
| Accumulation | `lib/gann/accumulation.ts:46-61` | A 20-session range, weeks spent inside it, breakout by 3 points. **No volume.** | Context (`disclosedRules.ts:546`; `contextFactors.ts:114-116`). |
| Breakaway hold (acts) | `lib/gann/breakaway.ts:77`; `score.ts:683-699` `applyBreakawayHold` | A range-bound Execute that doesn't cross the range extreme becomes Watch. **No volume.** | Live `scanTicker.ts:388, 412`. Replay `replay.ts:773, 1341`. |
| Multiple tops | `lib/gann/multipleTops.ts:63` | Third test decides (testing / crossed / failed). **No volume.** | Context (`disclosedRules.ts:552`; `contextFactors.ts:134`). Item 5's `oldLevel` short at double/triple tops prices orders (`entryTrigger.ts:318-382`). |
| School copy | `lib/school/curriculum.ts:734-735, 1019` | Bottoms dry up, retests are quieter, a panic is the exception; tops come on heavy volume, and a second top on smaller volume says the advance is tiring. | Matches D1. |

**Live and replay feed different daily bars into the same functions:**
- Live `daily` is one year (`lib/data/provider.ts:190`). Replay `priorSessions` is every session before the date, up to 6 years (`replay.ts:735`, `lib/timeframe.ts:160`).
- Live `daily` probably includes a bar dated today. `entryChartBars` filters on `d < asOf` (`lib/scan/entrySelection.ts:70-75`) to drop it from the entry chart, but `computeVolumeClimax`, `readCapitalStock`, `readSharesPerPoint` and `readNarrowWeek` get the unfiltered `daily`. Could not verify that the provider returns a forming daily bar.
- Effects today:
  - `volumeClimax` changes little: its pivots need 4 bars on each side.
  - `capitalStock`'s median-turnover check runs over 52 weeks live and up to 6 years in the replay (`capitalStock.ts:104`).
  - The campaign ledger behind `sharesPerPoint` may start differently on the two spans. Could not verify.
- **Any new rule that reads the latest bar's volume** (A-VOLUME-09, -10, -12) must use completed sessions on both surfaces. A part-day or part-month bar always looks "small".
- Bars are fetched with `adjustment=split` (`lib/data/alpaca.ts:187`). Whether Alpaca also split-adjusts volume could not be verified here. That matters for any multi-year volume comparison (-09, -11, -12).

**Gann's own framing that bears on every entry:**
- Master Course Ch.12 makes volume the **fourth factor**, "always used in combination with" formations, time and resistance (A2_1:653).
- HTMPC p.56: "the time factor will overbalance both space and volume" (W001:57).
- The rules apply "to total exchange volume and to single stocks" (W006:110; A2_1:659).
- So a volume reading adding to a count (the scored criterion) fits Gann. A volume reading that gates on its own needs his act-verb.

## 1. Entry-by-entry map

Legend for "Today": (a) prices or arms plans, (b) scored, (v) moves the verdict another way (hold, gate, exit), (c) context or card only, (e) nothing.

### A-VOLUME-07 (merged with -02): Rule 1 and Rule 7
- **Rule:**
  - a large increase in volume ends a prolonged advance;
  - rapid advances to high levels come on rising volume;
  - after a sharp decline on heavy volume, a secondary rally on smaller volume marks the final top.
- **Source:** W006 pp.39-40 (Rule 1) and p.48 (Rule 7). **Class A.** `passes: false`.
- **Corroboration:** Master Course Ch.12 Rule 1 (A2_1:655); HTMPC p.63 (1) (W001:66). W006's own example: Apr 1930's secondary rally to 297, **23% under** the 386 top, on falling volume (W006:42).
- **Today (b):**
  - High `confirms` on `climax` or `retestOnLowerVolume` (`volumeClimax.ts:166`).
  - The retest only counts when the second high is within 1% of the first or above it (`volumeClimax.ts:162-163`). So Gann's lower secondary rally is never read.
  - The "after a sharp decline on heavy volume" precondition is not read.
  - "Rising volume into the advance" is not read; `climax` looks only at the pivot bar.
  - The existing test `volumeRule.test.ts:75` covers a secondary top that *reaches* the first.
- **Gap:** a secondary rally that is a lower top on smaller volume does not confirm.
- **Smallest change (forks FV1, FV3):** widen `retestOnLowerVolume` for highs to "a later top **at or below** the earlier one, after a completed decline from it, on smaller volume". Keep the 1% band only as the "double top" case of A-VOLUME-13. Write the precondition (the decline from the first top came on heavy volume) as a labelled engineering choice.
- **Moves the verdict:** yes, through the scored criterion and the live coarse pre-filter. Bump `STRATEGY_VERSION` and run a 766-symbol replay. Report the pass rate against the registry's saturation bounds.
- **Failing test first (as written):** `lib/gann/__tests__/volumeClimax.test.ts`. A high anchor printed on climax volume confirms. A secondary high clearly below it (say 10% lower) on lower volume reads `retestOnLowerVolume=true` and confirms. The second half fails today.

### A-VOLUME-03: Rule 2: after a second, lower top, a dull narrow sideways spell that breaks out downward on increased volume signals a further decline
- **Source:** W006 pp.39-40; Master Course Ch.12 Rule 2 (A2_1:656). **Class A.** `passes: false`.
- **Today (c):**
  - `readAccumulation` reports a downward breakout (`accumulation.ts:59`) with no lower-top precondition and no volume.
  - `narrowWeek.ts` reads volume, but only on a one-week narrow range.
  - Nothing acts.
- **Gap:** all three parts missing together (the lower top, the volume on the breakout, any action).
- **Smallest change:**
  - Add `afterLowerTop` and `breakoutVolumeRatio` to the accumulation reading:
    - the last two completed tops of the weekly (7-day) chart, the second lower;
    - the breakout session's volume over the mean of the range's sessions, completed sessions only.
  - Add `distributionBreakdown` = a downward breakout with both conditions. Context first: `contextFactors` gets `distributionBreakdownAgainst/With`, plus a card line.
  - Then fork FV7 for the action.
- **Moves the verdict:** no as context. Yes under FV7 (b).
- **Failing test (as written):** `lib/gann/__tests__/missingRules.test.ts`. After a lower top, a narrow range broken downward on above-average volume reads as a distribution breakout. The same break on below-average volume, or without the lower top, does not.

### A-VOLUME-04: Rule 3: at the end of a long decline volume decreases and the range narrows
- **Source:** W006 p.40; Master Course Rule 3; *45 Years* Ch.X; HTMPC p.63 (3). **Class A.** **`passes: true`** (item 1, `item1_sweep_review.md:18`).
- **Today (b):** `dryingUp` (`volumeClimax.ts:128-136, 157`), scored. The test is `volumeRule.test.ts:27`.
- **Residual note (not a fail):** the code doesn't require the decline to be *long* (item 1 noted this). Gann's "weeks, months or years" (A2_1:657) gives no floor. Leave as is unless the owner asks (FV5 covers the long-span reading).
- **Action:** none. Done.

### A-VOLUME-05: Rule 4: after the first sharp advance out of a bear market, a secondary reaction on decreasing volume, then an advance on heavier volume, signals higher prices
- **Source:** W006 p.40 (the text's "Rule 5" is a slip for Rule 4); Master Course Rule 4. **Class A.** `passes: false`.
- **Gann's example:** the Feb 1933 secondary decline to 49½ came **9 points above** the 40½ low on tiny volume (W006:49, 114).
- **HTMPC p.63 (4)** words it as "a second rally on heavier volume after a first sharp advance". That is the same sequence seen from the second advance.
- **Today (b, partly):**
  - `retestOnLowerVolume` for lows needs the new low within 1% of the old or below it (`volumeClimax.ts:163`). A higher secondary low doesn't count.
  - The "out of a bear" precondition and the heavier advance after it are not read.
- **Gap:** the precondition, a higher secondary low, and the volume of the following advance.
- **Smallest change:** add `secondaryReactionOnLowerVolume` for lows. Conditions:
  - the campaign ledger shows the first up section after a bearish campaign (the weekly chart turned up from the bear low);
  - a later low **above** the bear low on smaller volume than the first advance;
  - the up leg after it on heavier volume than the reaction.
  - Then OR it into the low's `confirms`.
- **Moves the verdict:** yes (scored). Same version bump and replay as -07.
- **Failing test (as written):** `lib/gann/__tests__/volumeRule.test.ts`. A secondary low on lower volume than the first, followed by an up-leg on higher volume, confirms. Add the negative: the same low with the following advance on *lower* volume does not set the new field.

### A-VOLUME-06: volume rises near tops and falls near bottoms, except in abnormal markets; a panic can bottom on large volume, rally on fair volume, then make a secondary decline on much less volume
- **Source:** W006 pp.40, 48. **Class A.** `passes: false`. Item 1's FAIL reasons (`item1_sweep_review.md:19`):
  - the panic sequence is untested;
  - "volume rises near tops" was untested;
  - the secondary decline counts only within 1% of the panic low.
- **Corroboration:**
  - Master Course summary (A2_1:660): panics culminate on large volume with a swift rebound.
  - The May 1938 secondary reaction on very small volume was a buy (A2_1:669).
- **Today (b):**
  - A climax alone confirms a low (`volumeClimax.ts:166`). The test is `volumeRule.test.ts:34`.
  - Tops on heavy volume are now tested (`volumeRule.test.ts:61`, added in item 2).
  - The secondary decline still needs the 1% band.
- **Gap:** the secondary decline after a panic need not retest the low.
- **Smallest change:** the same widening as -05. The secondary decline is a later low at or above the climax low, on much less volume than the climax.
  - Keep climax-alone confirming. W006 p.40 and Master Course both say the panic bottom *is* the large-volume low.
  - Needs fork FV1's "much less" reading.
- **Moves the verdict:** yes, together with -05/-07.
- **Failing test (to add next to the cited one):** `volumeRule.test.ts`, a panic sequence:
  1. a climax low;
  2. a rally on ordinary volume;
  3. a secondary low 5% above the climax low on under half its volume.
  - It reads `retestOnLowerVolume` (or the new field) as true. It fails today on the 1% band.

### A-VOLUME-08: judge volume against shares outstanding; a small float moves over a wider range (GM 44M shares vs Chrysler 4½M)
- **Source:** W006 pp.38-39, 48. **Class A.** `passes: false`.
- **Today (c, and an exit):**
  - `readCapitalStock` reads turnover against shares outstanding: the ⅔ week, the plain-top week and range distribution (WSSS Ch.VII and Master Course Ch.12 rules, `capitalStock.ts:9-18`).
  - The ⅔ and plain-top weeks are a long exit (`exitRules.ts:232-244`), live and replay.
  - Shares are split-adjusted in the replay (`replay.ts:742`) and the latest count is used live.
- **Gap:** the "small float, wider range" half has no code. W006 states it as an explanation of Chrysler's range, with no act-verb and no number.
- **Smallest change (fork FV10):** none for the range half under the recommendation.
  - The "judge volume against shares outstanding" half is built. On review, consider passing the entry with the range half recorded as an observation.
  - The act-verb version is A-SELECTION-07 (short small floats), which is item 11.
- **Exception by construction:** crypto has no shares outstanding, so `readCapitalStock` returns null (`capitalStock.ts:102`; `gann-exit-live.ts:126`). That's correct, and should be stated in the module header.
- **Moves the verdict:** no.
- **Failing test (if FV10 b):** `capitalStock.test.ts`, a context line ranking the stock's share count against its own weekly range. Not recommended.

### A-VOLUME-09: the smallest volume in years is a sure sign of bottom
- **Source:** W006 pp.43-44:
  - Feb 1933, 19M a month, "the smallest volume … since the top in September, 1919";
  - Sep 1934, 12M, "the smallest in many years" (W006:114, 116).
- Master Course Ch.12 has the same rule: smallest **monthly** volume in years (A2_1:670; W023:552 "smallest in over 10 years").
- **Class A.** `passes: false`.
- **Today (b, different):** `dryingUp` compares 5 bars with the 20 before (`volumeClimax.ts:103, 128-136`). Nothing reads volume across years.
- **Gap:** the multi-year monthly volume low.
- **Smallest change (fork FV5):**
  - Add `volumeExtremeLow(monthly, asOf)`. True when the last **completed** month's volume is the lowest of the stored monthly history: live 10 years (`provider.ts:198`), replay `priorMonthly` (`replay.ts:738`). Require at least 36 completed months.
  - The month in progress must be excluded on both surfaces: its volume is partial, so it would always look like the smallest.
  - Gann says "a sure sign of bottom", so OR it into the low's `confirms` (scored), and add a card line.
- **Moves the verdict:** yes, a little. `dryingUp` already confirms many lows, so the OR adds few new passes. Bundle it with -05/-06/-07.
- **Failing test (as written):** `volumeRule.test.ts`. A low printed on the lowest monthly volume of the stored multi-year history is flagged as a volume-extreme bottom. Add a guard: a partial current month with tiny volume is **not** flagged.

### A-VOLUME-10: avoid stocks in long, narrow ranges until they break out on volume
- **Source:** W006 p.20 (W006:68). HTMPC pp.51-52 is the breakaway rule already built. Master Course: "volume rises as a stock starts from dullness" (A2_1:170); TST/WSSS: "narrow, low-volume days near a top or bottom → act on the breakout" (W005:403). **Class A.** `passes: false`.
- **Today (v):** `applyBreakawayHold` holds a range-bound Execute that doesn't cross the range (`score.ts:683-699`), live and replay. The breakaway carries **no volume condition** (`breakaway.ts:77`).
- **Gap:** "on volume".
- **Where the test belongs:** the plan is a stop-entry ahead of the break, so the breakout volume exists only once price crosses. The volume test belongs at entry confirmation, not in the scan verdict:
  - `lib/lifecycle/confirmNow.ts`, used by `lib/trade/place-order.ts:16, 181` on every path;
  - `advanceEntryConfirmation` in the replay (`replay.ts:97, 891`).
- **Smallest change (fork FV6):**
  - First, context: `breakawayVolumeRatio`, the crossing session's volume over the range's mean session volume, on completed sessions.
  - Then, under FV6 (b): a range-bound breakaway confirms only once a **completed daily session** has closed beyond the range on volume above the range's mean. This costs one session of delay.
- **Moves the verdict:** yes under FV6 (b) (entries, live and the replay's `confirmed` cell). Bump the version and run a replay.
- **Failing test:** `lib/gann/__tests__/breakaway.test.ts`. A range-bound breakaway whose crossing session's volume is below the range mean does not confirm; the same crossing on above-mean volume does. The cited test (`breakaway.test.ts:43`) covers only the hold.

### A-VOLUME-11: compare total volume and points gained across campaigns; much more volume for fewer points warns of a top
- **Source:** W006 pp.43-45:
  - 422M shares for 60 points (Mar-Jul 1933) against 350M for 96 (May-Sep 1929): **1.93×** per point (W006:115);
  - 407M for 65 points Jul 1934-Nov 1935 (W006:117).
- Master Course Ch.12: 88,860 shares a point (Jul 1934-Oct 1936) against 151,197 (Oct 1936-Mar 1937), **1.70×**, "nearly double" (W023:554; A2_1:663-665).
- **Class A.** `passes: false`.
- **Today (c):**
  - `readSharesPerPoint` compares the current **3-Day Chart** up leg with the prior one, both inside the current weekly campaign (`sharesPerPoint.ts:49-66`; `campaignLedger.ts:5-6, 36-37`), with a 1.8 cutoff (l.29).
  - The test is `missingRules.test.ts:70-77`.
  - Measured small and against Gann's sign (+0.18, n 59).
- **Gaps:**
  1. The **unit**. Gann compares months-long campaigns or sections, not 3-day swings.
  2. **The 1.8 cutoff misses Gann's own 1937 case (1.70×).**
  3. W006 compares across a bear market (1933 against 1929); Master Course compares consecutive legs of one bull. See FV11.
- **Smallest change:**
  - Read per-point over the **weekly (7-day) chart's up sections**: the current up section against the prior up section.
  - Set `TOP_WARNING_RATIO` at or under 1.70, so both of Gann's worked cases warn (labelled as the lower of his two examples).
  - Keep it context: Gann's verbs are "warns" and "watch for".
- **Moves the verdict:** no (context). Do not bump the version.
- **Failing test:**
  - As written: `missingRules.test.ts`, an up leg at 1.8× the prior leg's volume per point, within 3% of the high, sets `topWarning=true`. This passes today; keep it.
  - Add the one that fails today: a section at **1.70×** (the 1937 figures) near the high sets `topWarning`.

### A-VOLUME-12: the largest weekly volume since a prior top warns to watch for a top
- **Source:** W006 p.44: the week to 23 Nov 1935, nearly 19M, "the largest since the week of 10 Feb 1934" (that is the Feb 1934 top): watch for top (W006:116). **Class A.** `passes: false`. `gsps_location: none`.
- **Corroboration:** Master Course Ch.12: "the largest volume of sales often comes **before** final top" (W023:556; A2_1:662). Jan 1936 and Jan 1937 had the largest volume, and the highs came in Apr 1936 and Mar 1937.
- **Today (e).**
- **Smallest change:**
  - Add `readTopVolumeWarning(weekly, majorTops)`. True when the last **completed** week's volume is the largest since the last major top (`majorPivots` of the weekly chart, or the campaign ledger's previous top).
  - It is a long-side warning only. Gann gives no bottom mirror, so none is invented (the bottom rule is -09).
  - Context: `contextFactors` gets `topVolumeWarningAgainst/With`, plus a card line ending "shown for context".
  - It is also the input FV4 (b) would use.
- **Moves the verdict:** no (context). Under FV4 (b), yes.
- **Failing test (as written):** `lib/gann/__tests__/capitalStock.test.ts` (or a new `topVolume.test.ts`). A week whose volume is the largest since the last major top is flagged as a top warning. A heavier week *before* that top is not. The partial week in progress is not counted.

### A-VOLUME-13: a double top on two-thirds of the first top's volume, and a third test of the same level, signal a top
- **Source:** W006 pp.43-44:
  - Aug-Sep 1933 double top "on two-thirds the volume";
  - Jan-Feb 1934 double top just over the Jul 1933 high: "the third time at the same level was signal of top" (W006:115-116).
- **Class A.** `passes: false`.
- **Conflict:** Master Course Ch.12 (A2_1:669): the Aug 1937 secondary rally came within 5 points of the top on **⅓ or less** of the volume: "a signal to sell the market short". This could not be confirmed in the W023 checkpoint notes, which summarise Ch.12 more briefly (W023:549-561). See FV2.
- **Today (b) and (c):**
  - `retestOnLowerVolume` for highs: within 1%, lower relative volume of **any** amount (`volumeClimax.ts:162-164`).
  - `multipleTops` reads the third test (testing / crossed / failed) with no volume (`multipleTops.ts:63`), context only.
  - The two are never combined.
  - Item 5's `oldLevel` short at double/triple tops prices orders (`entryTrigger.ts:318-382`) with no volume.
- **Gaps:**
  - no ratio;
  - relative volume (each pivot bar against its own trailing 20) instead of the two tops' own volume (FV3);
  - the third test isn't tied to volume.
- **Smallest change:**
  - Expose `retestVolumeRatio` (the second top's volume over the first's, measured per FV3) on the reading.
  - Confirm per FV2.
  - Add a `multipleTops` cross-reference: the third test of a top on lower volume than the first.
  - Leave item 5's `oldLevel` short unchanged. Its volume precondition is A-ENTRY-20 (§2).
- **Moves the verdict:** yes, if FV2 changes what confirms (scored). Otherwise the ratio is context only.
- **Failing test (as written):** `volumeClimax.test.ts`. A second top at about two-thirds of the first top's volume confirms a top reading. This passes today under "any lower volume", but only when the second top is within 1%. Add a pin that it fails when the second top's volume is *higher*.

### C-VOLUME-01: Proof 8: volume is a proof of resistance (named only)
- **Source:** W003 p.16, an anonymous compiler; probable origin the Master Course, unread at extraction. **Class UNVERIFIABLE.** `passes: false`.
- **Held, not built.**
- The Master Course is now readable in the checkpoint (W023). Its Ch.12 makes volume the "fourth factor", used in combination. Could not verify a "Proof 8" list or "proof of resistance" wording there.
- Recommendation: re-check the status under the same F0-style page check item 7 proposed. Change only `class`/`passes` after a page check, never the entry text.
- The code it points at (`volumeClimax`) stands on A-VOLUME-04/-06/-07 (class A), not on this entry.

## 2. Other volume-bearing entries (outside A-VOLUME)

- **A-ENTRY-20** (W006 p.28): sell a double top whose *earlier* high came on heavy volume, stop 3 points above.
  - `multipleTops` and `volumeClimax` are never combined (`item5_map.md:73`).
  - It is an entry rule for item 5, but it shares FV3's measurement of "the earlier top's volume". Build it after step 3 below, so it uses the same per-top volume.
- **A-ENTRY-19** (narrow week then a sharp drop on large volume): context (`narrowWeek.ts`). Item 6 F7 (a). Not reopened here.
- **A-TIME-03** (first rally that can't go higher in its third month on large volume): item 7. Its volume half can reuse -12's heavy-week reading.
- **A-SELECTION-07** (small floats short best): item 11. It rests on A-VOLUME-08's share count.
- **C-TREND-02, C-TIME-03, C-TIME-08:** class C or UNVERIFIABLE, and they touch `volumeClimax` and `boilingPoint`. Held or context, per their own items.
- **A-OTHER-04, A-OTHER-06** (TIME, PRICE, VOLUME, SPEED; three-dimension chart): UNDISCLOSED, never built.
- **Master Course "space by volume" chart** (⅛ inch per 25,000 shares; volume breaks the angle first, A2_1:159-166): no feature entry. Recorded as unbuilt and not proposed.
- **HTMPC open interest:** documented asset-class exception (`volumeClimax.ts:48-60`). Correct as it stands.

## 3. Conflicts and copy-vs-code findings

1. **The secondary top: a lower rally or a double top.** W006 Rule 1/Rule 7 and Apr 1930 are a *lower* secondary rally after a sharp decline. A-VOLUME-13 and Master Course are a double top at about the same level. The code reads only the second (`volumeClimax.ts:163`). FV1.
2. **The ratio at a double top.** W006 gives ⅔ (an observation of one case). Master Course gives ≤⅓ as a sell signal. Rules 1 and 7 say only "decreasing/smaller". FV2.
3. **Where the heavy volume at a top sits.** Master Course: the largest volume comes *before* the final top, and the high itself is on smaller volume. W006 Rule 1: a large increase ends the advance. The code confirms a high on a climax **at the pivot bar** (`volumeClimax.ts:156, 166`). FV4.
4. **The shares-per-point cutoff misses Gann's 1937 case.** The header cites the 1937 top, but 151,197/88,860 = 1.70 < 1.8 (`sharesPerPoint.ts:6-8, 29`). Gann's W006 case is 1.93. FV11.
5. **The unit of comparison** is relative volume per pivot bar (code) against the volume of the two moves (Gann, monthly and weekly). FV3.
6. **Copy.** `curriculum.ts:735` ("very heavy volume while price stops rising" at a top) is nearer the Master Course reading than the code is. `curriculum.ts:1019` matches the code. After FV1/FV4, align both lessons with whatever is built.
7. **Live-only coarse pre-filter** (`marketScan.ts:438-443`): any change to `confirms` moves live ranking that the replay can't see. This is the same as item 7 §4.7. Record it, or model it with item 7 step 8.
8. **The live scan feeds the volume readings a possibly in-progress daily bar** (§0). New volume rules must read completed sessions, weeks and months on both surfaces.

## 4. Owner forks (one line each, recommendation first)

- **FV1 (A-VOLUME-07/-05/-06): what counts as a secondary move.**
  - **(rec) (b):** read both Gann cases.
    - The double top or bottom: within 1%, as today.
    - The secondary rally (reaction): a lower top (higher low) after a completed opposite swing, on smaller volume, with its precondition (a heavy-volume decline for tops; the first up section out of a bear for lows).
    - "Heavy" means above the mean volume of the 20 sessions before the first pivot, labelled as engineering.
  - (a) Keep the 1% band only (today; fails -05/-06/-07).
- **FV2 (A-VOLUME-13): the volume ratio at a double top.**
  - **(rec) (a):** confirm on any smaller volume (Rules 1 and 7 wording), expose the ratio, and measure ≤⅔ and ≤⅓ as context factors before either gates.
  - (b) Confirm only at ≤⅔ (W006).
  - (c) ≤⅓ as the sell signal (Master Course), ⅔ as watch.
- **FV3 (all secondary-move readings): what volume is compared.**
  - **(rec) (b):** the raw volume of the **week** containing each pivot (Gann's weekly chart, W006 p.46), second over first.
  - (a) Today's relative volume per pivot bar.
  - Either way it moves the scored criterion.
- **FV4 (A-VOLUME-07/-12): heavy volume at a top.**
  - **(rec) (b):** a high confirms on a climax at the pivot **or** when the largest weekly volume of the advance since the prior top came within the current up section (A-VOLUME-12's reading). This covers both W006 and the Master Course.
  - (a) Pivot-bar climax only (today).
- **FV5 (A-VOLUME-09): "in years".**
  - **(rec):** the last completed month is the lowest of the stored monthly history (10 years live), with at least 36 completed months. OR it into the low's `confirms`.
  - Alternatively, context only.
- **FV6 (A-VOLUME-10): where "break out on volume" acts.**
  - **(rec) (b):** at entry confirmation. A range-bound breakaway confirms once a completed session closes beyond the range on volume above the range's mean, on every path (`confirmNow.ts`, `place-order.ts`) and in the replay's confirmed cell.
  - (a) Context only.
  - (c) In the scan verdict. Not recommended: the break hasn't happened when the plan is priced.
- **FV7 (A-VOLUME-03): how "signals a further decline" acts.**
  - **(rec) (b):** while it stands, a long Execute is held to Watch (on the `applyMonthlyBreakHold` template, `scanTicker.ts:412`, `replay.ts:1341`), and a long exits as D2 does. Shorts already pass the breakaway down.
  - (a) Context only.
- **FV8 (market volume):** Gann's rules apply to total exchange volume too.
  - **(rec):** stock volume only, recorded as an exception (SPY's volume isn't NYSE total volume).
  - Alternatively, SPY volume as context.
- **FV10 (A-VOLUME-08's range half):**
  - **(rec):** no code. It's an explanation. The act-verb is A-SELECTION-07 (item 11).
- **FV11 (A-VOLUME-11): what is compared.**
  - **(rec):** consecutive weekly-chart up sections (fits both texts), with the cutoff at or under 1.70.
  - Alternatively, across campaigns (W006's 1933 against 1929).

## 5. Build order (smallest and most literal first)

1. **Test-only pins** (no product change, no version bump).
   - `sharesPerPoint` on Gann's 1937 figures (1.70×). This fails today: a real bug, fixed in step 2.
   - A-VOLUME-13 negative: a second top on *higher* volume doesn't retest-confirm.
   - A completed-bars guard: partial months and weeks are excluded from any new reading.
   - A parity pin: `computeVolumeClimax` gives the same readings on a 1-year and a 6-year history ending at the same date.
   - Any pin that fails becomes its own fix.
2. **Context fields** (`contextFactors` and the card; no version bump).
   - A-VOLUME-12 `readTopVolumeWarning`.
   - A-VOLUME-11 regrounded on weekly sections with the cutoff ≤1.70 (FV11).
   - A-VOLUME-03 `distributionBreakdown`.
   - A-VOLUME-10 `breakawayVolumeRatio`.
   - The A-VOLUME-13 ratio.
   - Failing tests first: each entry's TO WRITE above. Live and replay through `readDisclosedRules` (`disclosedRules.ts:538-555`; `replay.ts:647`).
3. **The scored rule** (A-VOLUME-07, -05, -06, -09, -13 with FV1-FV5). **Moves the verdict.**
   - Files: `volumeClimax.ts`, `score.ts:244-256` (notes), the `marketScan.ts:438-443` pre-filter (live only), `criteria-registry.ts` (the note says the construction changed; still unmeasured), `curriculum.ts:735, 1019`.
   - Failing tests first: the lower secondary top (-07), the higher secondary low with a heavier following advance (-05), the panic sequence (-06), the multi-year monthly low (-09).
   - Bump `STRATEGY_VERSION` and run a 766-symbol replay. Report the `volumeClimax` pass rate (saturation bounds), the mutation count and scan cost (`mark()`).
4. **A-VOLUME-10 breakaway on volume** (FV6 b). **Moves entries.**
   - Files: `lib/lifecycle/confirmNow.ts` and `entryConfirmation.ts`, `place-order.ts`, `replay.ts:891`.
   - Failing test: `breakaway.test.ts` (low-volume crossing doesn't confirm).
   - Bump the version and run a replay.
5. **A-VOLUME-03 action** (FV7 b). **Moves the verdict and exits.**
   - Files: a new `applyDistributionBreakdownHold` in `score.ts`, wired at `scanTicker.ts:412` and `replay.ts:1341`, plus an `exitRules.ts` branch beside D2 (l.232-244).
   - Bump the version and run a replay.
6. **A-ENTRY-20** (item 5 follow-up) on step 3's per-top volume.
7. **Held, not built:**
   - C-VOLUME-01 (UNVERIFIABLE; re-check status only);
   - A-VOLUME-08's range half (FV10);
   - market-wide volume (FV8);
   - the volume-time chart;
   - open interest (documented exception).

## 6. Already done or covered elsewhere

- **Pass already:** A-VOLUME-04 (item 1).
- **Volume acts today:**
  - the scored `volumeClimax` (D1), live and replay;
  - the live-only coarse pre-filter (+2);
  - the D2 distribution-week long exit, live (`gann-exit-live.ts`) and replay (`exitRule` gann/gann-runner).
- **Built, context:** capital-stock turnover (D2), shares per point, narrow week, boiling point.
- **Item 2 added tests:** volume at highs (`volumeRule.test.ts:60-75`) and the shares-per-point top warning (`missingRules.test.ts:70-77`).
- **`GANN_PARITY_ROADMAP.md` §3.5:** all four volume rows read "Aligned". This map finds that the D1 row is aligned only for the double-top and retest-at-the-low cases. Secondary moves away from the first extreme (Rules 1, 4 and 7) and the multi-year low are not built. Update that row when step 3 lands.
