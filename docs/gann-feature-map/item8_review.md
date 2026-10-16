# Review: item 7 third-review fixes and item 8 steps 1-3 (0e3f970..1497a62)

Reviewer: fresh context, read-only on `/home/claude/gsps-item5s4` (HEAD `1497a62`, branch `item5-step4`, worktree clean). Probes and mutations ran only in the copy at `scratchpad/review8copy` (made with `git archive HEAD`, node_modules symlinked).

Commits:
- `991e468`: item 7e fixes (M1 `replaySeriesOptions`, M2 `halfMeetingsAsRead`, M3 `readSwingMonthCounts`, L1, L4)
- `fcfb0db`: item 8 map and step 1 pins (`TOP_WARNING_RATIO` 1.8 → 1.7)
- `aefe000`, `c83e590`, `d3a2ff8`, `87e74d3`: step 2 context readings (A-VOLUME-12, -11, -13 ratio, -03, -10)
- `c6f9db0`: step 3, the scored `volumeClimax` (FV1-FV5), `STRATEGY_VERSION` `2026-10-16-gann-volume-rules`
- `61787b8`, `a20b559`, `1497a62`: run notes, handoff `summary.json` (no rule code)

## Checks

- `npx vitest run` (full): **281 files, 2870 tests passed**, exit 0.
- `npx tsc --noEmit -p .`: **exit 0**.
- `npm run -s check:terms`: **clean** (772 source files + 2 public docs). No "Gann" in the new card lines, score notes or lesson copy.
- **Class isolation.** The step-2 readings are `topVolume`, `secondTopVolumeRatio`, `distribution` and `breakawayVolume`, plus `sharesPerPoint` regrounded. None of them is read outside `contextFactorsFor` and `describeDisclosedRules`. Every card line ends "Shown for context; it does not change the setup." Only the step-3 fields feed `confirms` → the scored point and the live coarse +2.
- **STRATEGY_VERSION.** Bumped once, in `c6f9db0`, the only commit that moves the verdict. Step 2 and `991e468` are context only and correctly have no bump.
- **Live/replay parity probes.** 30 seeded random walks, 750 sessions, comparing a 365-day history plus 10 years of monthly bars (live) against 6 years plus every prior month (replay), same `asOf`.
  - `computeVolumeClimax`: 0 of 750 readings differ, on every field including `volumeExtremeLow`.
  - `readTopVolumeWarning`, `readDistributionBreakdown`, `readBreakawayVolume` and `readSharesPerPoint`: 0 of 1640 differ.
  - `halfPriceHalfTime` (C-TIME-23): 0 of 330 differ.
  - `readSwingMonthCounts` (A-TIME-21): 1 of 330 differs, because the swing walk depends on where the history starts. See L6.
- **Base rates (random walks, 1860 high and 1860 low readings, sessions 300-1500 of 20 seeds).**
  - High `confirms`: **60.7%**. Low `confirms`: **56.3%**. Both are under the 95% bound (the author's figures were 66%/66%).
  - High readings by field:
    - `retestOnLowerVolume` 565
    - **`heavyAdvance` 566 (30% of all highs on its own)**
    - `climax` 213
    - `secondaryOnLowerVolume` 122
  - Low readings by field:
    - `retestOnLowerVolume` 613
    - `dryingUp` 530
    - `climax` 178
    - `secondaryOnLowerVolume` 40
    - `volumeExtremeLow` 25
    - `panicSecondary` 16
  - Context readings, share of sessions:
    - top-volume warning 7.6%
    - breakaway-volume reading 3.8%
    - distribution breakdown 0% (random walks don't form the narrow spell)
    - C-TIME-23 record 81%
- **Mutations:** 50 run, 36 killed, 14 survived. The runner is `scratchpad/mut/run.mjs`, the mutant lists are `mut/muts.json` and `mut/muts2.json`, and the results are in `mut/results.txt`. Detail is under Findings and in the mutation summary.
- **Cost.** I did not re-measure. The author's figure is 54 ms per 250 symbols per call, in four live places, about 170 ms in total.
  - Two of the four calls are redundant on a single scan: `disclosedRules.ts:573` and `signals/confluence/gann.ts:201` each recompute what `scanTicker.ts:190` already has.

## Findings

### H1. HIGH: A-VOLUME-09's "smallest month in years" confirms any low reading, wherever price is
**Where:**
- `lib/gann/volumeClimax.ts:232-244` (`smallestMonthInYears`)
- `:360` (`volumeExtremeLow = kind === "low" && smallestMonthInYears(opts.monthly, opts.asOf)`)
- `:363` (ORed into the low's `confirms`)
- `lib/scoring/score.ts:252` (note)

**What's wrong:** the test asks only whether the last completed month is the quietest of the last 60. Nothing ties it to the low anchor: not the anchor's date, not price being at or near a low, not the low falling in that month.

Gann's cases are bottoms: Feb 1933's low at 50 on 19 M, and Sep 1934 near the Jul 1934 bottom. "A sure sign of bottom" is said of a market *at* a low. The feature's own test text is "a **low printed on** the lowest … volume".

**Probe** (`zzprobe8.test.ts`, "uptrend at constant dollar volume"): 40 seeded walks drifting +0.12% a day, with share volume = constant dollars / price.
- `smallestMonthInYears` fires on **24%** of sessions.
- **92.5%** of those sessions close within 10% of the 52-week high.

A second probe (`XL_AT_HIGH`) has a stock 0.75% under its all-time high and its low anchor 13% below. It gets `volumeExtremeLow: true, confirms: true`. The card would tell the user "the smallest monthly volume in five years: a sign of bottom".

Share volume falls as price rises (and the data feed split-adjusts), so multi-year uptrends are exactly where this fires. It awards the scored point to long setups for a bottom reason at a top. That says more than the source, on a criterion that moves the verdict.

**Fix:** require the quiet month to be the month of the bottom. Either:
- the anchor low (or the lowest low of the last N months) falls in the smallest-volume month or the month after it; or
- the anchor low is the lowest low of the 60 months read.

Pin it with the uptrend probe as a negative test.

### M1. MED: nothing pins that the scored criterion gets `asOf` and the monthly bars on any surface
All six wiring mutants survive the related suites (18 test files, including `replay.test.ts`, `score.test.ts`, `gann.test.ts` and `longMonthlyWiring.test.ts`):

| Mutant | Change | Where |
|---|---|---|
| W01 | replay drops `monthly` | `replay.ts:578` |
| W02 | live drops `monthly` | `scanTicker.ts:190` |
| W03 | live drops `asOf` (reads the session still trading) | `scanTicker.ts:190` |
| W04 | coarse drops `asOf` | `marketScan.ts:445` |
| W05 | context ratio drops `asOf` | `disclosedRules.ts:573` |
| W06 | confluence drops `asOf` and `monthly` | `gann.ts:201` |

The module tests are strong: V10 and V17, the month-in-progress and session-in-progress trims, are killed inside `computeVolumeClimax`. But the step's main parity claim is that it reads completed sessions and the closed months on the scan, the replay, the confluence and the coarse pass. Any caller can drop either input and stay green.

The parity probe shows the code is right today.

**Fix:** a wiring test on the `longMonthlyWiring.test.ts` model. Spy on `computeVolumeClimax` (or mock the module) in `scanTicker` and `buildMacroContext`, and assert that `opts.asOf` and `opts.monthly` arrive. Add a source-level assert for `marketScan.ts`, as `seriesOptions.test.ts` does for the runner.

### M2. MED: FV4's anti-saturation choice is unpinned, and the low week counts as "the advance"
**Where:** `volumeClimax.ts:276-284` (`heaviestWeekBeforeTop`).
- **V16 survives.** It replaces `majorPivots(findPivots(read, 3))` with every weekly pivot. The header (`:55-57`) records that the "previous local top" version passed 80% of random-walk tops and was dropped, so the one choice that keeps FV4 informative has no test. On the current code `heavyAdvance` alone sets 30% of high readings on random walks, the largest single contributor alongside the retest.
- **V13 survives.** `heaviest >= low` → `heaviest > low` changes nothing in the suite. Under `>=`, a capitulation week that *is* the low week counts as "the heaviest week in the advance into the top". That is A-VOLUME-06's panic bottom, not Master Course Ch.12's heavy volume before the top. `>` is the faithful reading.
- **Also unlabelled.** `heavyAdvance` can confirm any strength-4 high, including a minor pause in mid-advance, whenever a heavy week came anywhere after the low. "Often comes before the final top" can't be told apart from "before any top". Worth a header line, since it now confirms shorts in uptrends.

**Fix:**
- Use `>`.
- Add a pinned base-rate test (e.g. `heavyAdvance` under a pre-registered share of random-walk highs) that fails without `majorPivots`.
- Add a fixture whose heaviest week is the low week.

### M3. MED: A-VOLUME-11 (regrounded in this range) still reads the session in progress on the live scan
**Where:**
- `disclosedRules.ts:561` `readSharesPerPoint(dailyBars, campaign)`
- `sharesPerPoint.ts:58-68`: `walkSwingChart(daily, …)`, `perPoint(daily, currentStart, daily.length - 1)`, `daily[daily.length-1].c`

**The mismatch:** the live `dailyBars` is the scan's `daily` (`scanTicker.ts:501`). This range's other new readings treat it as carrying today's forming bar: `distribution.ts:127-130` and `breakaway.ts:134-136` drop it explicitly, and the progress note says "live drops today's bar". `readSharesPerPoint` does not drop it.
- On the live scan the current section's volume per point includes a part session (less volume, and an intraday price). A part session can also move the weekly chart's last pivot.
- The replay's `priorSessions` never contains it.

The map (§0, §3.8) made completed sessions the condition for every volume reading in this item. `sharesPerPoint` was rebuilt in `aefe000` without it.

**Fix:** trim trailing bars dated `>= etDateKey(asOf)`, as `distribution.ts` does, and pin it with a part-session test.

### L1. LOW: test strength (the code is right; these mutants survive)
- **V11** (`EXTREME_LOW_MONTHS` 60 → 48): the "reads only the last five" test uses a month six years back, so the 60 boundary is unpinned. Moot if H1 changes the rule.
- **V18** (retest `ratio < 1` → `<= 1`) and **V19** (smallest month `>` → `>=`): ties unpinned.
- **V20**: the reaction's mean excluding the low bar.
- **V21** (bear low over the 60 sessions before the low instead of the last 252 read): the "not a bear low" fixture's deeper low is only 20 bars back.
- **V23**: `heaviestWeekBeforeTop(allBars, …)`, equivalent in practice.
- **T04** (`topVolume.ts:56` without `majorPivots`) and the author-noted W3 tie (`>` vs `>=`, `topVolume.ts:67`).
- **D04** (distribution reads the whole history): equivalent apart from cost.
- **A01** (`readSwingMonthCounts` on the 3-Day Chart instead of the weekly chart): the straight-leg coffee fixture gives the same pivots on both charts. The choice is labelled as engineering, so this is only unpinned.

### L2. LOW: unlabelled omissions in the FV1 readings
- **Rule 1/7:** "sharp" decline is not read; only "heavy" is (`:338`). The header labels "heavy" but not the missing "sharp".
- **Rule 4:**
  - "Out of a bear market" is proxied by "the previous low is the lowest of the last 252 sessions read" (`:346`). That is weaker than the map's recommendation (the weekly chart turning up from a bearish campaign). It is labelled.
  - The `after` window (`:349`) does not require price to be advancing. It is just every session after the anchor.
  - When `previous.index < bars.length - 252` (replay only: a low older than a year with no newer strength-4 low), the slice is empty and `every` returns **true** vacuously. Live can't see that pivot at all. It is practically unreachable, but add `previous.index >= start` as a guard.
- **A-VOLUME-06:** "rally on fair volume" between the panic low and the secondary low is not read (`:354-355`). Say so in the header.

### L3. LOW: C-TIME-23's record is under the bound but loosely pinned
- `halfPriceHalfTime` shows on **81%** of random-walk sessions here (79% in the author's test). The test asserts only `< 0.95` (`secondaryTime.test.ts`, "keeps the half-and-half meeting rare enough"), so a regression back to about 90% stays green. H01-H03 are killed, so the "as read" construction itself is pinned.
- Consider pinning the measured rate with a margin (e.g. `< 0.85`). The owner should know the line shows on four sessions in five; class C context only.

### L4. LOW: completed-session edge cases on the live scan
- **After the close:** the `asOf` trim drops any bar dated today (`volumeClimax.ts:291-294`). A scan run after 16:00 ET therefore reads through yesterday, although today's session is complete.
- **Weekends:** `topVolume.ts:52-53` excludes the week whose Monday equals the current Monday. A Saturday scan drops the just-finished week.
- Neither breaks parity, since the replay never reads at those times. Both are one session or one week stale.
- **Crypto (unverified):**
  - If the feed stamps crypto daily bars at 00:00Z, `etDateKey` files today's still-trading bar under yesterday, and the trim keeps it.
  - With 7 bars a week, two strength-4 pivots can share one calendar week, which gives `ratio` exactly 1 (never "smaller").
  - Say which convention the feed uses, in the module header.

### L5. LOW: copy
- `score.ts:252` "the smallest monthly volume in five years: a sign of bottom" is wrong wherever H1 fires off a bottom. It is fixed with H1.
- The Academy 4 and Academy 6 lessons (`curriculum.ts:735, 1021`) match the built rules.

### L6. LOW: A-TIME-21 swing walk and history length
`readSwingMonthCounts` walks the weekly chart over the whole `dailyBars`. In 1 of 330 sessions the 1-year and 6-year walks list different recent swings. A bounded read like `distribution.ts`'s 240 sessions would remove it. The live scan also feeds it the part session, like M3, but the effect is smaller since only pivot dates matter.

### L7. LOW: cost and duplication
On one live scan `computeVolumeClimax` runs on the same bars:
- in `scanTicker` (190);
- in the confluence (`gann.ts:201`);
- in `readDisclosedRules` (573), for one field.

Passing `scanTicker`'s readings through would remove two of the four calls (about 110 ms per 250 symbols on the author's figure). This is not a correctness issue.

## Re-checks of the item 7e findings (991e468)

- **M1: fixed.**
  - `replaySeriesOptions` (`run.ts:380-388`) is used by both `collectRun` and the runner (`backtest-universe.mjs:437`). SPY's monthly is kept.
  - R01 and R02 are killed, and the runner source is asserted.
  - Run 48 will be the first measured replay with `longMonthlyBars` and `marketMonthlyBars`.
- **M2: fixed.**
  - `halfMeetingsAsRead` reads each of the last 90 days' sessions with the fans' anchors as of that session (`secondaryTime.ts:468-480`).
  - The rate is 81% / 79%, under the bound. Parity holds (0 of 330 differ). H01-H03 are killed. See L3.
- **M3: fixed.**
  - `readSwingMonthCounts` (`angleMonthCounts.ts:204-212`) is the shipping reader. It reproduces 9, 2, 6 and 5 on the coffee swings and is on the card.
  - A02 and A03 are killed. A01 survives (L1).
- **L1 (exactly three closes) and L4 (header note): done.** L5 has gone to the owner per the progress note.

## Mutation summary
50 mutants: 36 killed, 14 survived.
- **Killed:**
  - V01b, V02-V10, V12, V14, V15, V17, V22
  - T01-T03; D01-D03; B01-B03; S01, S02; R01, R02; H01-H03; A02, A03
- **Survived:**
  - V11, V13, V16, V18-V21, V23
  - W01-W06
  - T04, D04, A01
- V01 (a Sunday-start week) was equivalent on weekday bars, so it was replaced by V01b (a Tuesday-start week).

## Per-entry verdicts

| ID | Verdict | Reason |
|---|---|---|
| A-VOLUME-03 | **HOLD** (FV7) | The reading is faithful and tested (lower weekly top, 3-point break of the spell, break volume above the range mean). D01-D03 are killed, live and replay match, and it is context only. Gann's "signals a further decline" waits on FV7 (hold or exit a long). Pass it as context if the owner takes FV7 (a). |
| A-VOLUME-05 | **PASS pending replay** | A higher secondary low out of a year's low, a reaction lighter than the advance, and a heavier advance after it, all tested with negatives. V05-V07 are killed. Before flipping: M1 (wiring) and the L2 labels and guard (vacuous `every`, `after` not tied to price). |
| A-VOLUME-06 | **PASS pending replay** | A panic low on climax volume, then a secondary low at or above it on ≤½ its week. Tops on heavy volume were already pinned. V08 and V09 are killed. Label the missing "fair-volume rally" (L2). |
| A-VOLUME-07 | **PASS pending replay, after M2** | A lower secondary top after a heavy decline, on a smaller week, plus the heaviest week in the advance (FV4). V02-V04 and V14-V15 are killed. M2: V16 (the `majorPivots` guard that keeps FV4 under saturation) and V13 (`>=` lets the low week count) survive. Fix and pin before flipping. |
| A-VOLUME-09 | **FAIL** | H1: the quiet month is not tied to a low. It fires on 24% of uptrend sessions, 92% of those near the high, and awards the scored point with "a sign of bottom". |
| A-VOLUME-10 | **HOLD** (step 4 / FV6) | Only the context ratio is built (tested, B01-B03 killed). The rule's "avoid … until they break out on volume" acts at entry confirmation, which is step 4. |
| A-VOLUME-11 | **FAIL** (small fix) | The weekly sections and 1.70 cutoff are right and pinned: the 1937 figures test, S01 and S02 killed, history parity 0 differs. But the live scan reads the session still trading, and the replay never does (M3). That breaks this item's completed-sessions rule. Flip once it trims to completed sessions. |
| A-VOLUME-12 | **PASS** | The last completed week is the heaviest since the last major weekly top, over 48 weeks. The week in progress is never counted (T01 killed). The read is the same on 1 y or 6 y (0 of 1640 differ). Context only, "watch for", with no bottom mirror invented. T04 and the W3 tie survive (L1). |
| A-VOLUME-13 | **PASS pending replay** (FV2 open) | A double top on a smaller week confirms (FV2 a). The week ratio is exposed, with context factors at ⅔ and ⅓. The 2/3 test uses uneven days so that weeks, not days, decide, and the negative on a heavier second top is pinned. The third-test clause carries no volume and stays with `multipleTops` (context). FV2 (⅔ / ⅓ as gates) still waits on the owner. |
| A-TIME-21 | **PASS** | The shipping reader (`readSwingMonthCounts`) gives the coffee letter's 9, 2, 6 and 5, and the line is on the card. The weekly chart is a labelled engineering choice. A01 (chart choice unpinned) and the 1/330 history difference are LOW. |
| A-TIME-06 | **PASS** | It failed only on item 7e M1. The runner now passes the market's monthly bars (R02 killed). Run 48 is the first replay that measures it. |
| C-TIME-09 | **PASS** | It failed only on M1. The runner now hands `replay()` the long monthly series, which `replay()` caps at 13 years per session, as `collectRun` does (R01 killed). |
| C-TIME-23 | **PASS** (weak context) | Read as each session read it. 81% of random-walk sessions, under the bound. Live and replay match. H01-H03 are killed. Tighten the pin (L3) and tell the owner the line shows on about four sessions in five. |

## Reproduction (copy only)
- `review8copy/lib/gann/__tests__/zzprobe8.test.ts`:
  - scored base rate and field counts;
  - the uptrend / smallest-month probe;
  - live vs replay parity of the scored and context readings;
  - `XL_AT_HIGH`.
- `review8copy/lib/gann/__tests__/zzprobe8b.test.ts`: C-TIME-23 rate and parity; A-TIME-21 parity.
- Output is in `scratchpad/probe8.out`.
- Mutations: `node ../mut/run.mjs ../mut/muts.json` (and `muts2.json`) from `review8copy`.
