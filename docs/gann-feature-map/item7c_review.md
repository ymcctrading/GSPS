# Review: item 7 step 1, item 7 step 3, item 6 second-review fixes (c9c5c9c..67f2724)

Reviewer: fresh context, read-only. Worktree /home/claude/gsps-review7 at 67f2724. Probes and mutations ran only in the copy at
/tmp/claude-0/-home-claude-GSPS/7b7249ce-f02f-5728-a844-fc19299dfe3f/scratchpad/review7copy.

## Checks run

- `npx vitest run` on the changed and related test files (thirdMonth, monthlyWarning, bearMarketCallers, market-scan-shortable, gann, extremeTiming, criteria-gate, disclosedRules): **8 files, 145 tests passed.**
- `npx tsc --noEmit -p .`: **exit 0.**
- `npm run -s check:terms`: **clean** ("No banned terminology in 760 source files + 2 public docs"). New test titles use identifiers only (`gannEntryOf`), which follows existing practice and the script's word-bounded rule.
- `gann_features.json`: unchanged in the diff. All six entries are still `passes: false`.
- `STRATEGY_VERSION` was bumped: `2026-10-16-gann-trend-review` → `2026-10-16-gann-weekly-sections`.
- Mutation run in the copy against the third-month code, with thirdMonth, monthlyWarning, trendStrength and campaignLedger tests. **All 8 were caught.**
  - M1: drop `counterMoveThirdMonth` from `changing`.
  - M2: clock to the last bar instead of the extreme.
  - M3: `>` changed to `>=`.
  - M4: clock from the 3-Day last point.
  - M5: bull side only.
  - M6: boundary moved to 90 days.
  - M7: `monthlyBreakInReaction` changed to `monthlyBreak`.
  - M8: section tops taken from the 3-Day pivots.
- Source check for W006 p.38 (works/W006/detailed-notes.md:104):
  > "in a bull market a rising stock reacts no more than two to three months and resumes in the third; a falling one keeps falling in the third ... One of the signs of weakness in a bear market is a rally of only six to seven weeks or not more than two months."

  The build reads it as "a reaction still making new extremes after day 60 changes the trend". That is a fair reading and matches fork F2 (b), which the map recommends.
  - The day-60/61 boundary is pinned both ways.
  - It shares `SECOND_MONTH_END_DAYS` with `counterMovePhase`.
  - It counts calendar days (`days()` rounds timestamp differences), as Gann did.
  - The boundary itself is correct.

## Findings

### H1. HIGH: a lower weekly top becomes the "section top", so the third-month clock and the section rule both misfire on an ordinary two-leg reaction
Where:
- `lib/gann/campaignLedger.ts:270` (`weeklyTops` = every weekly trend-side pivot);
- `:276-279` (`sectionTop = lastTop`, `priorTop = weeklyTops[-2]`);
- `:289`, `:300`, feeding `lib/gann/trendStrength.ts:174-178`.

The fix for F1 moved the section tops from the 3-Day pivots to the weekly pivots. It takes **every** weekly top, though, including a top that is lower than the one before. Take a reaction whose B-wave bounce lasts 7 calendar days or more (a weekly swing) and whose C-leg holds above the A-leg's low, so the weekly trend stays up. Then:
- the bounce's lower top becomes `sectionTop`;
- the reaction's real starting top becomes `priorTop`;
- every bar after the bounce is under `priorTop`, so `reactionBelowPriorSection` is trivially true. This is the same defect F1 reported, one chart up;
- the third-month clock starts at the bounce top, not at the top the reaction began from.

Probe results (`zzprobe7c.test.ts` in the copy). Every shape starts from CAMPAIGN as in thirdMonth.test.ts: 30→40→81, a reaction to 60, then up to 120. The prior section's top is 81.

| Shape after the 120 top | third | rbps | changing | weekly | structure rising | direction |
|---|---|---|---|---|---|---|
| E: 120→110 (20d), **10-day** bounce to 115, drift to 111 over 62d, then rising 3-day swings 111→114→112→114.5→113 | true | true | **true** | bullish | true | **null** |
| E2: same, drift 30d | false | true | **true** | bullish | true | **null** |
| E control: same as E with a **5-day** bounce | false | false | false | bullish | true | **bullish** |

Failing scenario (E):
- The reaction from 120 made its low (110) on day 20 and held it. It never went near 81. The 3-day structure is stepping up again and the weekly chart is up.
- Gann's W006 p.14 test (held above the prior section's top) and p.38 (no new low in month 3) both say the trend is still up.
- The code reads `changing: true`, so the trend is unconfirmed on that timeframe, live and in the replay. That moves the macro direction, `isWithGannTrend`, continuation admission and the scored macro criteria.
- The only difference from the passing control is that the bounce lasted 10 days instead of 5.
- The bear mirror has the same defect: a weekly higher bottom inside a bear rally.

The new tests miss this because both the monthlyWarning and thirdMonth fixtures use bounces under a week (the progress note says so). A ≥7-day bounce was assumed to flip the weekly trend, which is only true when the C-leg breaks the A-leg's low.

Suggested fix: only a **record** weekly top starts a section. A section top is a weekly top above every earlier weekly top in the campaign (a weekly bottom below every earlier one in a bear). A lower weekly top is part of the reaction. `priorTop` is the previous record top, and the reaction and the clock run from the last record top. Add E and E2, plus their bear mirrors, as tests: `changing` should be false and direction bullish (or bearish).

### M1. MED: the card's counter-move clock contradicts the new trend rule
Where:
- `lib/gann/disclosedRules.ts:281`, `:300-317` (`readCounterMove`);
- `:618` ("in its third month, which signals a change in trend");
- `components/scan/confluence-card.tsx:159` ("3rd month: trend change");
- `lib/school/curriculum.ts:961` ("A reaction that reaches a third month is treated as a change of trend").

The commit says the two clocks share their months. They share the constant only:

| | Starts from | Measures to |
|---|---|---|
| Card (`readCounterMove`) | the last **3-Day** pivot | today (duration) |
| Verdict (ledger) | the section top | the reaction's latest extreme |

Failing scenarios (probed):
- The thirdMonth.test.ts "held" case (low on day 45, then 25 flat days). The trend reads `bullish`, confirmed and not changing. The card shows `70d (3rd month: trend change)`, and the rules text says "in its third month, which signals a change in trend".
- Shape E above: the card reads `3d (normal)` while the ledger says the third month changed the trend.

Suggested fix:
- Drive the card's third-month label and text from `ledger.counterMoveThirdMonth`. Alternatively, rename `readCounterMove`'s phase to a duration-only label that makes no trend-change claim.
- Align the curriculum to "a reaction still making new lows (highs) in its third month".

### M2. MED: the live exit manager and the graduation exam read a full month of future data in the new trend triple
Where:
- `lib/trade/gann-exit-live.ts:92-93` (`before(monthly)` = `b.t.slice(0,10) < day`), with monthly fetched with `end = null` (`:53`);
- `lib/school/graduationExam.ts:242`.

Monthly bars are stamped on the 1st of the month. A position opened on 2026-07-15 keeps the **July** bar, whose high, low and close, fetched later, include every session after the entry. `readTrend(monthly)` can then disagree with what the scan saw on the day. That changes `bearMarket`, so it changes which buying point `gannEntryOf` rebuilds and `entryCrossedLevel`'s answer. This is exactly the "rebuilt as a different trigger" error that F3 set out to remove.
- `olderGannLevels` never reads the as-of month, so the lookahead is new in this diff.
- The exam's monthly fetch passes `end = asOf`. Whether the provider then cuts the month's aggregate at `end` was not verified.
- The replay rolls months from daily bars up to the day, so the surfaces now differ.

Suggested fix: keep only months before the as-of month (`b.t.slice(0,7) < day.slice(0,7)`) and append a partial month rolled from the daily bars before the day, as the replay does. Add a test with a mid-month entry where the rest of the month would flip the monthly trend.

### M3. MED/LOW: same-side duplicates are possible after the `listedSymbols` change (F5)
Where: `lib/marketScan.ts:748-749` together with `:1056`, `:1072`, `mergeContinuations:651-658` and `takeShortable`.

`lists.bearish` keeps every ranked sell row (`sideLimit.bearish = Infinity`), but `published` now holds only the top `perSide`. A sell row ranked past `perSide` can be rescanned as a bearish continuation when its trend is bearish (`cannotArm` false). `mergeContinuations` does not dedupe, and `takeShortable` can keep both rows when higher rows are unshortable.

Probe (unit composition in the copy):
- bearish list = [NOSH1 9, NOSH2 8, A 7, C 6] with NOSH* unshortable, `perSide` 3;
- `published` = {NOSH1, NOSH2, A}, so C is rescanned;
- final sell list = **["A", "C", "C"]**.

The same gap can put a symbol on both sides: its continuation buy is admitted, then its sell is promoted into the cut list. Neither state before R5 nor the state after R5 allowed either of these.

Suggested fix:
- exclude every row already on the **same** side from that side's fills, and use the top-`perSide` cut only for the opposite side; or
- dedupe by symbol in `mergeContinuations` and before `takeShortable`.

Add a test.

### L1. LOW: the exits don't act on the third-month change of trend
Where: `lib/gann/exitRules.ts:174`.

The "change of trend after entry" exit fires on `spaceOverbalanced || timeOverbalanced` only. The two other readings that now set `changing` are not wired there:
- `counterMoveThirdMonth`;
- `monthlyBreakInReaction && reactionBelowPriorSection` (item 6).

The cross-platform rule says the concept should also act where Gann acts on a trend change (exits). In practice the trailing stop under each week's bottom usually fires first.

Suggested fix: add `ledger.counterMoveThirdMonth` to that condition, with the after-fill guard measured from the section top. Otherwise, record the exception in the module header.

### L2. LOW: test strength gaps in the new pins
- `lib/scan/__tests__/bearMarketCallers.test.ts` "trendsFromBars":
  - The `readTrend` mock overrides direction by timeframe label, so `readTrend(daily, "1Week")` in place of `readTrend(toWeeklyBars(daily), "1Week")` (`entrySelection.ts:140`) would pass.
  - Nothing asserts that the exam or the exit manager pass a *bearish* triple through. Passing `[]` survives the guard test.
- `lib/__tests__/gann.test.ts` A-TIME-04: the title says "only within two days", but changing `timeCycles`' `windowDays` default from 2 to 5 **survives** (mutated in the copy: 3 passed). The rule doesn't fix the width, so this is a title overclaim. Assert that +3 is inactive to pin it.
- `criteria-gate.test.ts` C-TIME-02: the import scan skips `lib/analysis` (including `trend.ts` on the verdict path), `lib/strat`, `lib/trade` and `lib/risk`. It also matches only `@/` alias imports, not relative ones. An `import { calculateRSI } from "./indicators"` in `lib/analysis/trend.ts` would pass it.

### L3. LOW: process
- No 766-symbol replay on `2026-10-16-gann-third-month` / `-gann-weekly-sections` is evidenced in claude-progress.txt or docs/replay-runs. The map's step 3 and PLAN require one, with the result in the PR, because this moves the verdict.
- Design note, not a defect: a reaction whose low lands on day 61-62 and then recovers to just under the top stays "changing" until a new section top (probe C). This is defensible under "keeps falling in the third month", but it is an interpretation the owner may want stated.

## Per-entry verdicts

| ID | Verdict | Reason |
|---|---|---|
| A-TIME-01 | **FAIL** | The rule is built (fork F2 b), it reaches every `readTrend` surface live and in the replay, and the tests are strong (8/8 mutations caught, day 60/61 pinned). It is not implemented as written for a common shape: H1 starts the clock at a lower weekly top, so a reaction that held its month-1 low is called a trend change (probe E). M1: the card and curriculum still state a different third-month rule. The replay run is not yet done (L3). |
| A-TIME-02 | **FAIL** | This is the mirror build, and its mirror test asserts 70-day changing / 45-day bearish. The cited readCounterMove 45/70 test exists and passes. H1 applies mirrored: a higher weekly bottom inside a bear rally. M1 applies too. |
| A-TIME-04 | **PASS** | `timeCycles` opens buy-side windows 1, 2 and 3 years after a low and sell-side windows after a top, polarity asserted. Dropping a year or flipping polarity fails the test. "Watch" is context, which matches the rule. Caveat L2: the "within two days" title isn't pinned. The live-only coarse ranking (§4.7) is build step 8, not this entry. |
| A-TIME-08 | **FAIL (partial)** | The "each stock keeps its own time" clause is asserted: a shifted series shifts its anniversary. The `toppedFirst`/`bottomedLate` flags are tested in missingRules.test.ts. The rule's first clause, "late tops make late bottoms, early tops make early bottoms", links a stock's top timing to its bottom timing. No code makes that link and no test asserts it. |
| C-TIME-18 | **FAIL (partial)** | Days 7, 14 and 21 ±1 from the last 3-Day pivot are asserted and mutation-tight, and the 2-3 week reactions are covered by `timeRules` (`reactionInZone`, tested elsewhere). The rule also says "watch the 3rd-4th day from a top or bottom" and that day 14 is "most significant". Neither is implemented or asserted. It stays class C and context only, with no gating, which is compliant. |
| C-TIME-02 | **PASS** | No `CRITERION_KEYS` entry names an oscillator or divergence, and nothing in the scanned verdict dirs imports the oscillator modules. An injected import fails the test. Caveat L2: the scan coverage is incomplete (`lib/analysis`, relative imports). |

## Reproduction (copy only)
- `review7copy/lib/gann/__tests__/zzprobe7c.test.ts`: shapes A, B, C, E, E2, H and controls; prints ledger and trend fields.
- `review7copy/lib/__tests__/zzprobe_dup.test.ts`: "probe unit" composes `listedSymbols` → `mergeContinuations` → `takeShortable` and prints `["A","C","C"]`.
- `scratchpad/mut7c.py`: the mutation runner for M1-M8. The original files were restored and verified with `cmp`.
