# Review: item 7 steps 4-5 and the item 7d review fixes (5b27268..b7b2900)

Reviewer: fresh context, read-only on `/home/claude/gsps-item5s4` (HEAD `b7b2900`, branch `item5-step4`). Probes and mutations ran only in the copy at `scratchpad/review7ecopy` (node_modules symlinked). The worktree now has uncommitted changes that are not part of this review: `lib/research/calendarTest.ts`, `scripts/backtest-universe.mjs`, and the new `lib/research/timeWindowBaseRate*` and `scripts/time-window-base-rates.mjs`. The `backtest-universe.mjs` edit only adds a `time-window-base-rates` dispatch; it does not touch the replay call that finding M1 is about.

Commits:
- `de68aab`: passes flips (A-TIME-04, C-TIME-02)
- `e636571`: A-TIME-12, time to hold
- `4d9e880`: run 44 notes
- `9f3ae39`: A-TIME-05/-21 month counts, A-TIME-06 bear duration
- `2ad36a5`: ten passes flips
- `b7b2900`: fixes for item7d M-a, M-b, M/L-c, M/L-d, L-a…L-d

## Checks

- `npx vitest run` (full): **278 files, 2812 tests passed**, exit 0.
- `npx tsc --noEmit -p .`: **exit 0**.
- `npm run -s check:terms`: **clean** (766 source files + 2 public docs).
- `gann_features.json` across 5b27268..b7b2900:
  - Same 342 ids, and **only `passes` changed**: 12 entries false → true. They are A-TIME-01, -02, -04, C-TIME-02, -12, -21, -25, -37, -38, -40, -42, -44.
  - No rule, test, class or location text changed. The count is now 27 passing.
- **Class isolation.** None of the new readings is read outside `contextFactorsFor` and `describeDisclosedRules`. The new readings are `monthCounts`, `bearDuration`, `secondaryTime.*` and `holdWarning`/`readHoldTime`. The one exception is the pyramid gate, which is A-TIME-12's intended action (fork F6). No scored criterion, gate, hold or rank reads any of them. Class C stays context only.
- **STRATEGY_VERSION.** Bumped in `e636571`, because the pyramid gate moves replay trades under `pyramid: true`. Bumped in `b7b2900`, because the exit guard moves Gann's exits. `9f3ae39` is context only and correctly has no bump.

## Findings

### M1. MED: the 766-symbol runner passes neither `longMonthlyBars` nor `marketMonthlyBars` to `replay()`
**Where:** `scripts/backtest-universe.mjs:415` and `:426`, unchanged in this range. The code ignores the `monthlyLong` that `fetchSeries` now returns. It calls `replay(symbol, bars, { …, dailyBars: daily, monthlyBars: monthly, instrument, marketDailyBars })`.

Only `lib/backtest/run.ts:483` (`collectRun`, i.e. `/api/backtest`, capped at 12 symbols) passes both. PLAN requires 766-symbol replays per item, and those run through the script (`.github/workflows/backtest-universe.yml`).

**What follows in the runner:**
- `sessionArm` sets `monthlyLong: null`, so `readDisclosedRules` falls back to `instrument.monthly` (`disclosedRules.ts:523`). That is `priorMonthly`, which reaches from Jan of (daily start − 10 y). For a 15Min run in Aug–Oct 2026 that is Jan 2010, about 16.7 years, against the live scan's 13.
  - The M-b failure shape therefore survives on the measured surface. Fractions and counts from pivots 13-16.7 years old appear in the replay and never live.
  - `majorPivots`' top-quartile cut is taken over a different span, so the selected anchors can differ for C-TIME-09, C-TIME-12 and A-TIME-05/-21 alike.
- `marketMonthly` is null, so `bearDuration` is **always null** in the runner. `marketBearBottomWindow` and `marketBearYoung` (A-TIME-06) are therefore never measured on the 766-symbol replay.
  - The same is true of `weakStock` (A-TREND-07/-08). That gap is pre-existing, and those entries are not passing.

**Probe** (`review7ecopy/lib/gann/__tests__/zzprobe7e.test.ts`, "universe runner"): a monthly V with its low 15 years (180 months) before a 2026-09-15 session.
- The runner's inputs (`monthly` 16 y, `monthlyLong: null`) give `cycleFractions` = ["3/4 of the 20-year cycle", "1/2 of the 30-year cycle", "1/4 of the 60-year cycle"].
- The live inputs (`longMonthlyWindow`, 13 y) give `[]`.

**Fix:** pass `longMonthlyBars: monthlyLong` and `marketMonthlyBars` in the script. The SPY monthly is already fetched there via `fetchSeries("SPY", …, true)`; only `.daily` is kept today. A guard test that the script forwards every `ReplayOptions` bar series that `collectRun` forwards would stop this recurring.

### M2. MED: C-TIME-23's 90-day record now fires on almost every session
**Where:** `lib/gann/secondaryTime.ts:440` and `:457-464`. `everyAnchor` pairs every `findPivots(bars, 4)` pivot with its preceding opposite pivot. A strength-4 micro-swing therefore counts as "the range", and its own 50%-at-half-time meeting (±max(1 day, T/16)) is recorded for 90 days.

**Probe** (same file, "C-TIME-23 base rate"): 20 seeded random walks on weekday bars, 260 sessions each, sampled every third session from session 120 (940 sessions).
- `halfPriceHalfTime` is non-null on **98.4%** of sessions.
- The old fan-anchor reading was 72.6%.
- An alternative anchored on `majorPivots` (`zzprobe7e2.test.ts`) gives 57.6%.

The fix stops a newer swing erasing the meeting, but now nearly every session carries one. The card line ("half the range at half the time … a three-month fast move may follow") and the `halfPriceHalfTimeRecent` factor no longer separate anything. As a criterion it would be past the 95% saturation bound.

**Fix:**
- Record the meeting as it was read at the time: the fans' anchors as of each past session within 90 days, which is literally "recorded for 90 days".
- Or anchor `everyAnchor` on `majorPivots`.
- Either way, pin a base-rate test. For example: on a seeded random walk the share stays under some pre-registered bound.

### M3. MED: A-TIME-21's reader cannot produce the source's own example
**Where:** `lib/gann/angleMonthCounts.ts:188-191`. `readMonthCounts` counts only from `majorPivots(findPivots(monthly, 3))`.

`findPivots(…, 3)` needs three later bars, so no pivot younger than 3 months is ever listed (`lib/analysis/pivots.ts:21-23`). The top-quartile cut also drops the minor pivots Gann counts from.

W046 p.2 counts from four pivots dated to the day: 9 months from 19 Jun 1953, 2 from 19 Jan 1954, 6 from 15 Sep, 5 from 19 Oct.
- "2 from 19 Jan" is unreachable on every surface by construction.
- The 15 Sep low and the 19 Oct high are one month apart, so both cannot be strength-3 monthly pivots.

The entry's written test passes only through `monthCountsToTurn` with the pivots handed in (`angleMonthCounts.test.ts`, coffee case). The setup path that ships, `readMonthCounts`, would fail the same case.

**Probe:**
- `readMonthCounts` on a 21-month coffee-shaped series to 19 Mar 1954 returns `[]` (`zzprobe7e.test.ts`). That series is only an approximation of the coffee data.
- The structural limit (counts ≥ 3 months) holds for any input.

A-TIME-05's rule ("each major top and bottom") and its 1936 counts (36-48 months) are reachable, so this bears on -21 only.

**Fix:** count A-TIME-21 from the day-dated swing points (the 3-Day or weekly swing chart's tops and bottoms) to the turn. Keep the major monthly anchors for -05, or label the narrower anchor set as an engineering choice and leave -21 failing.

### L1. LOW: A-TIME-12 test and caller gaps
- **Mutation T4 survives.** Setting `since.length >= 3` to `>= 4` (`exitRules.ts:123`) delays every add by a session. No fixture has exactly three closes since the fill.
  - The probe shows the code is right: three closes give `withTrendAfter3: true`.
  - Add a test with exactly three sessions.
- **The live route is untested.** `app/api/positions/pyramid/route.ts:57,60`: dropping the `< today` filter (T9) or using today as the lot date (T10) both survive. This matches the repo convention of no route tests, but the live half of the hold gate rests on reading only.
- **The live lot date is the `protocol_exits.created_at`.** That matches the replay's fill-session date for paper fills, which `place-order.ts:671-690` inserts after the synchronous fill.
  - It does not match for:
    - mode `live` rows, inserted at order submission with a placeholder price (`place-order.ts:1069-1083`);
    - rows attached later to an older position (`attach-protocol-exit.ts:107-125`).
  - For those, the hold time counts from the submission or attach day.
  - This is the same convention `gann-exit-live.ts:112` already uses for `three_adverse_closes`, so it is pre-existing. The progress note's claim that the row is "written when the position is open" is true for paper only.
  - Latent while no live broker connection exists.
- **Interpretation recorded, not a defect.** "Still after three days" is read as the fill session plus the third close (`since[2]`), the same day-one convention as `three_adverse_closes`. That is defensible, and it is stated in the header.

**Live and replay agree.** Both call `readPyramidAdd` with the first lot's price and session date, and with daily bars strictly before the current day:
- replay: `replay.ts` `prior = dailyBars < date`, lot date `bars[from]` session;
- live: `bars < today`, `etDateKey(created_at)`.

### L2. LOW: C-TIME-09 "ten years unchanged" is right in code but weakly pinned
- **Live** (`provider.ts:199,282`): `tenYears(monthlyLong, yearsAgo(10))` keeps the bars with `t ≥ now − 10 y`.
  - This equals the old 10-year fetch only if Alpaca's `start` filters on the bar timestamp. Then a mid-month start drops that month's bar, both before and after.
  - I could not verify the vendor semantics offline. If Alpaca instead returned the month containing `start`, the live 10-year series lost its first bar.
- **Replay** (`run.ts:370`): `monthlyFrom` is Jan 1 00:00Z, so the filter is exact.
- **Mutations:**
  - L2 and L3 survive (`yearsAgo(10)` → `yearsAgo(9)`, single and batched). The test only bounds the slice from below.
  - L7 survives (`fetchSeries`' `monthly = monthlyLong`). Nothing pins the replay's other monthly readings to their old span.
  - Add an exact-first-bar assertion for both.
- **Speed.** It was inferred, not measured, which is short of the AGENTS speed directive. By reading `alpaca.ts`' paging (10k bars per page, shared across a 100-symbol chunk):
  - a full chunk needs 2 pages before and after (12k → 15.7k bars);
  - chunks of 64-83 symbols gain one page.
  - So the cost is likely negligible, but it should be measured with the `mark()` breadcrumbs.

### L3. LOW: test strength (the code is right; these mutants survive)
- MC1: 30 dropped from `WATCHED_MONTH_COUNTS`. 30 and 42 are never asserted.
- MC5: the month counts read the 10-year monthly instead of the long series. Nothing pins A-TIME-05/-21 to `monthlyLong`.
- MC6/MC7: pivot strength 2 / no `majorPivots`.
- B7: `marketBearStart` accepts a null trend.
- B8: `bearDuration` on the raw market monthly, without the month so far.
- D3: tolerance /32 (lower bound unpinned).
- D5/D6: the 7/8-8x1 and 1/4-1x4 multiples are unasserted.
- E4/E5: newest-vs-oldest half hit; `everyAnchor` preceding the same kind.

### L4. LOW: C-TIME-39, observation after the fix
Under W033's multiples, `due` for 1/8-1x8 (T/64) and 1/4-1x4 (T/16) falls inside the ±T/16 tolerance of the anchor itself. A bar right after any pivot that spans 1/8 or 1/4 of the swing counts.

Because a strength-4 pivot is known only four bars later, `retracementTiming` (open windows only) can show those two pairs only for swings longer than about 50-60 days. That follows from W031's pairing under W033's convention; it is not a code error. Worth a line in the header.

### L5. LOW: process
`claude-progress.txt:514` records forks F3 and F4 "taken at their recommendation". By the run's own stated practice (`claude-progress.txt:339`: an owner card where two of Gann's texts disagree), F3 is such a case:
- W006 p.13's 43 against its own 53;
- the Master Course's 34 m 5 d.

The pick is context only and reversible, and the conflicts are recorded in `bearDuration.ts`' header. Chuck should still see it on the next card.

## Re-checks of earlier fixes

- **M-a (C-TIME-39): fixed.**
  - `due = t0 + f·r·T` (`secondaryTime.ts:486`), with `r` equal to `FAN_TIME_RATIOS`' multiple. So 1x2 is 1/2 and 3x1 is 3, which agrees with C-TIME-40 and with W033's notes ("1x8 rises 8 points a month … reaches it at 12.5% in time").
  - The tests pin 1/8-1x8 at day 1, 3/8-1x2 at 3.75 days, and 2/3-3x1 at day 40.
  - Mutations D1, D2 and D4 are caught.
- **M/L-c (C-TIME-19): fixed.**
  - The counts are in (previous session, today], read once (`:304-313`).
  - A Wednesday pivot's 45-46 is read on the Monday as 45, and a Thursday pivot's 23 on the Monday.
  - The weekday fixture asserts first, previous and next session for 23, 45-46 and 49.
  - F1-F3 are caught.
- **M-b (C-TIME-09): fixed on the live scan and in `replay()`/`collectRun`.**
  - `LONG_MONTHLY_YEARS` = 13; `longMonthlyWindow` caps the replay before each session.
  - `scanTicker` passes `monthlyLong` on both instrument branches (wiring test).
  - L1, L4, L5, L6, L8, L9 and L10 are caught.
  - **Not fixed in the 766-symbol runner (M1).**
  - Every other live monthly reading still gets the 10-year slice. These are `readTrend`, `ruleOfThree`, `yearCycleConvergence`, `entryChart`, `majorPricePercentageLevels` and `weakStock`'s `monthly`, at `scanTicker.ts:158-344,505`. `marketBenchmark.ts` (SPY, 10 y) is unchanged.
  - The replay's `monthlyBars` is the same span as before (`run.ts:370`), subject to L2.
- **M/L-d (C-TIME-23): the erase case is fixed, but the fix over-admits (M2).**
- **L-a (SEASONAL_FRAME): fixed.**
  - The frame equals `SEASONAL_POINTS` (pinned).
  - 195° is Oct 7, 337.5° is Feb 26 of the next year, and 285° and 292.5° fall across the new year.
  - April 5 and 12 are unchanged.
  - S1-S4 are caught.
- **L-b/L-c (A-TIME-01/-02 exits): fixed.**
  - The monthly-break/section branch now has a fires and a doesn't-fire test.
  - The at-entry guard compares `sectionTopDate` (`exitRules.ts:222`, `campaignLedger.ts:340`), so a new section's own call after the fill exits.
  - X1-X4 are caught.
- **M1 leftover (no-campaign line): fixed.** It says only "past two months" (`disclosedRules.ts` thirdMonth note). N1 is caught.

## Mutation summary
Runner: `scratchpad/mut7e.py`. Results: `scratchpad/mut7e_results.json` and `mut7e_log.txt`. 59 mutants: 42 caught, 17 survived.
- **Caught:** T1-T3, T5-T8; MC2-MC4; B1-B6, B9; D1, D2, D4; E1-E3; F1-F3; L1, L4-L6, L8-L10; S1-S4; X1-X4; N1.
- **Survived:** T4, T9, T10; MC1, MC5, MC6, MC7; B7, B8; D3, D5, D6; E4, E5; L2, L3, L7.

## Per-entry verdicts

| ID | Verdict | Reason |
|---|---|---|
| A-TIME-12 | **PASS** | All three clauses are built. The first-close warning reaches the hint. The add waits for a profit at the first close and the third close, and the three-adverse-closes exit is unchanged. One function serves live and replay, and both read the same session convention. T1-T3 and T5-T8 are caught. Fix the L1 test gaps (exactly-three-closes boundary). The live-mode lot date is a pre-existing caveat. |
| A-TIME-05 | **PASS** | It counts months from each major monthly top and bottom (13 y live, with the month so far). The counts are listed, and the 18-48 six-month steps are marked as a labelled, fair use: HTMPC p.58 lists exactly 18, 24, 30, 36, 42 and 48 months (checked against the W001 notes). It is context only. Caveat M1: the 766 runner reads it over about 16.7 y. |
| A-TIME-21 | **FAIL** | M3: the reader never counts from a pivot under 3 months old or from a minor pivot. So the coffee example (2 months from 19 Jan, and the Sep low and Oct high a month apart) cannot arise on any surface. The written test passes only on the helper with the pivots handed in. |
| A-TIME-06 | **FAIL** | The reading itself is right: W006's 30-36 and 40-43 windows, 12/43, culminations; it is context only, longs only; `marketBearStart` mirrors the bull start; and it is tested with B1-B6 and B9 caught. It fails only because the 766-symbol replay never reads it: `marketMonthlyBars` is not passed (M1). Live shows it and the measured replay is always null. The fix is one line; it passes once that lands. |
| C-TIME-39 | **PASS** | The angle time now follows W033's convention and `FAN_TIME_RATIOS`. The 1x1/50% case and three other pairs are pinned, and the off-date case is not flagged. It is context only. See L3 (D5/D6) and L4. |
| C-TIME-23 | **FAIL** | M2: the record now comes from every strength-4 swing. It is present on 98.4% of random-walk sessions, so it no longer reports the event the rule names. |
| C-TIME-19 | **PASS** | 23, 45-46 and 49 are read on the first session on or after the day, once, and asserted on weekday bars. The class A bands are untouched. F1-F3 are caught. |
| C-TIME-09 | **FAIL** | The live scan and `replay()`/`collectRun` now agree (13 y, capped per session), and every other live monthly reading keeps 10 y. The 766-symbol runner still feeds `replay()` the uncapped series. The probe shows 15-year fractions there that live can't show (M1), which is the original M-b mismatch on the measured surface. |
| C-TIME-37/-38 (L-a) | fix verified | `SEASONAL_FRAME` is pinned to the class A dates, and the second half of the year is now on the sources' dates. |
| A-TIME-01/-02 (L-b/L-c) | fix verified | The section-top guard and the monthly-break branch are tested; X1-X4 are caught. |
| Third-month no-campaign line | fix verified | N1 is caught. |

## Reproduction (copy only)
- `review7ecopy/lib/gann/__tests__/zzprobe7e.test.ts`:
  - C-TIME-23 base rate (new vs old);
  - A-TIME-21 `readMonthCounts` minimum age;
  - C-TIME-09 runner vs live fractions;
  - A-TIME-12 exactly-three-closes.
- `review7ecopy/lib/gann/__tests__/zzprobe7e2.test.ts`: the C-TIME-23 major-pivot alternative (57.6%).
- Run either with `--reporter=verbose --silent=false` to see the printed numbers (`scratchpad/probe7e_out.txt`).
