# Item 3 review: Gann's 3 points on the entry side

Reviewer: fresh-context, read-only. Worktree `/home/claude/gsps-item3`, branch `item3-three-points`, commit `c28e7a4` against base `35bd646`.
Scope: `git diff 35bd646 c28e7a4`, checked against PLAN.md item 3 and feature entries A-ENTRY-01, -02, -04, -14, -15, A-STOP-01, A-STOP-03.
Full suite at c28e7a4: 235 files, 2345 tests, all passing. The worktree was left clean after the mutation runs.

## 1. What the diff does

- `pointScale.ts`: adds `beyondByThreePoints(level, sign)` and `levelBeforeThreePoints(trigger, dir)`, the fixed-point inverse. The inverse is correct. g(p) = 3pts(p) grows sub-linearly (slope under 0.12), so the iteration contracts, and the test round-trips 12 to 60,000 on both sides.
- `entryTrigger.ts`: the trigger is now pivot ± 3pts(pivot) and the stop is protective pivot ∓ 3pts(protective pivot). `LOST_MOTION_BUFFER_PCT` is deleted. An optional `bufferPct` override is kept for the intraday replay.
- `entryConfirmation.ts`: `DEFAULT_CONFIRMATION_BUFFER_PCT` goes from 0.3 to 0. The crossing is counted once, in the trigger, so nothing is double-counted on the daily path.
- `timeRules.ts` (halt stop), `multipleTops.ts` (crossed), `accumulation.ts` (inside/breakout), `pyramid.ts` (add trigger) and `evenFigures.ts` (stop beyond figure) all use `beyondByThreePoints`.
- `strat/levels.ts`: the flat `EQUITY_STOP_BUFFER_PCT` 0.5% becomes `equityStopBufferPct(level, entry)` = 3pts(level)/entry. The even-figure cap becomes `stopMaxPct + gannThreePointsPct(entry)`.
- `portfolio-manager.ts`: recovers the crossed level with `levelBeforeThreePoints`.
- Copy changes: `signal-card.tsx` headline; `protocol-rules.ts` STOP_RULE_DETAIL ("about 7% of a $40 stock, 5% at $100, under 4% at $200"). I checked those figures against the curve: 7.2%, 5.0%, 3.75%. They are correct.
- `STRATEGY_VERSION` is now `2026-10-15-gann-three-points-entry`.

Live scan versus replay: both call `computeGannEntryTrigger` with default arguments (`scanTicker.ts:278`, `replay.ts:703/713`). Both price equity plans through `computeTradeLevels` → `computeEquityTradeLevels`. Both confirm with `advanceEntryConfirmation` and no buffer override (`advanceConfirmation.ts:69`, `replay.ts:795`, `backtest/entryConfirmation.ts`). `gann-exit-live.ts` and `graduationExam.ts` follow automatically. No divergence between live and the daily replay.

The leftover grep (`LOST_MOTION`, `EQUITY_STOP_BUFFER_PCT`, `0.3`, `1.003`, `0.997` across lib/, app/, components/ and scripts/) finds no product code still on 0.3%. The only hits are comments and history notes.

## 2. Correctness gaps

1. **The intraday replay counts the allowance twice.** This was already true before the diff, but the new header now describes it wrongly. `replayIntraday.ts:203` builds the trigger with `bufferPct` (one intraday point beyond the swing). `:255` then passes `confirmationBufferPct: plan.bufferPct`, so the break stage asks for a second point. The new `entryConfirmation.ts` header says a caller "whose trigger is not already a 3-point crossing can pass its own confirmationBufferPct (the intraday replay does)". The intraday trigger *is* already a crossing, so it violates the "counted once" rule this diff states. This is item-8 territory, but the comment the diff added makes it look intended.
2. **The equity stop gets the allowance twice through the even-figure rule.** The 3-point buffer (about 5% at $95) often pushes the raw stop to within `APPROACH_WINDOW_PCT` (2%) of a round number. `stopBeyondFigure` then moves it another 3 points beyond that figure. The changed fixture in `equity-levels.test.ts` ("anchors the stop to the nearest support level within band, on a long") encodes exactly this: support at 95, raw stop 90.2, final stop 90 − 3pts(90) ≈ 85.5. That is about 9.5 points beyond the support, not 3. The test was rewritten to expect it, so the fixture now hides the compounding instead of catching it. Gann's "old top 100 crossed, stop at 97" applies when the level is the figure. It does not apply to a figure the buffer itself walked into.
3. **The equity plan stop is not anchored to the level Gann names.** For `us_equity` the trigger's own `stopPrice` (protective swing ∓ 3 points) is discarded. The plan stop is the nearest clustered S/R level 3–15% from entry, plus 3 points, or a fixed fallback % when none is in the band (`levels.ts:338–351`). For crypto, `computeStopWithLeeway` clamps the stop to `MAX_STOP_ATR_MULTIPLE × atr15`, which can pull it back inside the 3-point line. So "stop 3 points beyond the old top/bottom" holds only for the trigger object, not for the plan that is traded on every path.
4. **Breakaway is not converted.** `breakaway.ts:68` releases an Execute when `trigger.triggerPrice > rangeHigh` with a bare comparison. The trigger now sits about 5% beyond the *last* swing top. A last top a few points under the 13-week high therefore "breaks away" even though the entry clears the range extreme by less than Gann's 3 points. This effectively loosens the decision-5 hold. The `breakaway.test.ts` fixture was re-shaped (last leg lowered) to keep the range-bound case passing. That change is legitimate, but no test covers the looser case.
5. **The confirmation header overstates the mapping.** It says "old top 50, a close at 53 or more is the break, a reaction back toward the old top is the retest, and the entry follows". In code, the retest stage is `bar.l <= trigger`, a return to 53, not to the 51–48 zone. The entry is a close above the retest bar's low, and there is no stop at 47 (3 under the old top). It does not map "as written".
6. **Stale comments and one stale education line.** Comment-only: `entryTrigger.ts:12/23–28/51/110` still frame the buffer as "lost motion … rarely a full 3 cents". `stopBreach.ts:49`, `scanTicker.ts:269`, `scoring/weights.ts:54`, `scoring/score.ts:141`, `strat/levels.ts:470` and `criteria-registry.ts:328` all describe the old lost-motion allowance. `app/api/guided/execute/route.ts:20` still says "a close through the trigger by the 3-point-rule buffer". The user-facing line is `lib/school/curriculum.ts:712–713` (lesson "Breakout Levels and Where the Stop Goes"): "by a small margin so a brush … doesn't count" and "again by a small margin". The margin is now about 5–7% of price. The lesson also says the stop goes beyond the last swing bottom, but the equity plan's stop is the nearest S/R level (gap 3).
7. **Plans already stored when this deploys.** `trade_plans` rows written before deploy carry a 0.3% trigger. They now confirm with a 0 buffer, so they arm at 0.3% total. The portfolio manager's `levelBeforeThreePoints` also recovers the wrong crossed level for them. This is transitional and bounded by plan expiry, but it is worth noting at merge.
8. **`backtest-run.test.ts` swaps its symbols.** NVDA/TSLA/IWM no longer produce trades on the synthetic feed, so the test now uses AMZN/DIS/MSFT. This is legitimate, since the test asserts attribution shape and not counts. It is also the first sign that the candidate population shrinks. The replay run PLAN.md item 3 calls for has not been done.

## 3. Mutation check of `lib/gann/__tests__/threePoints.test.ts`

Each product change was reverted in place to its 0.3%-style equivalent, the test was run, then the file was restored with `git checkout`.

| Mutation | threePoints.test.ts | Full suite |
|---|---|---|
| M1 trigger and stop default → 0.3% | KILLED (2 tests) | |
| M2 confirm buffer → 0.3 | KILLED | |
| M2b confirm buffer → 5 (double count) | KILLED | |
| M3 halt stop → 0.3% (both sides) | KILLED | |
| M3b halt stop → 0.3% at **bottom only** | survived | **SURVIVED** |
| M4 multipleTops top-crossing → 0.3% | KILLED | |
| M4b multipleTops **bottom**-crossing → 0.3% | survived | **SURVIVED** |
| M5 accumulation upper → 0.3% | KILLED | |
| M5b accumulation **lower** → 0.3% | survived | **SURVIVED** |
| M6 pyramid → 0.3% (both) | KILLED | |
| M6b pyramid **short** only → 0.3% | survived | **SURVIVED** |
| M7 evenFigures stop → 0.3% | KILLED | |
| M8 equity stop buffer → 0.5% | KILLED | |
| M8b equity stop buffer at entry price instead of level | KILLED | |
| M9 even-figure cap `stopMaxPct + gannThreePointsPct(entry)` → `+0.5` | survived | **SURVIVED** |
| M10 `levelBeforeThreePoints` evaluates g at the trigger, not the level | KILLED | |
| M11 portfolio-manager crossed level → `/1.003` | survived | **SURVIVED** |

Six product changes have no test anywhere that fails when they are reverted: halt at bottom, multiple-bottom crossing, accumulation breakdown, short pyramid, the even-figure cap argument, and the portfolio-manager wiring. The halt-at-bottom gap matters most: it is exactly the A-ENTRY-01 case (single bottom, stop under the lowest day), and the "TO WRITE" test the feature entry names was not written.

## 4. Verdicts

Pass rule: a test must assert the rule as Gann wrote it, allowing only the price-scaling the code documents. Any structural difference fails.

| Entry | Verdict | Reason |
|---|---|---|
| A-ENTRY-01 (single bottom, 2–3 week hold, stop 3 under lowest week; active markets 2–3 days) | **FAIL** | No 2–3 week hold rule and no weekly "lowest week" stop. The 2–3 day halt is context only, with no buy. The bottom-side halt stop is untested (mutation M3b survives). |
| A-ENTRY-02 (double/triple bottoms, buy with stop 1–3 points, never more than 3, below) | **FAIL** | Still context only. No buy and no stop derived from the bottom cluster. Only the bottom-*crossing* line changed, and that line is untested (M4b). |
| A-ENTRY-04 (cross old top by 3, buy the 1–2 point reaction down to just under the old top, stop 3 under the old top) | **FAIL** | The crossing by 3 points is now carried and tested. But there is no buy-the-reaction entry (the retest is a return to the trigger, i.e. 53, not 51→48), and the stop sits beyond the protective swing (or nearest S/R for equities), not 3 points under the crossed top. |
| A-ENTRY-14 (short against single/double/triple tops, stop 3 above) | **FAIL** | Context only: no short entry is generated from a failed top or a halt at a top. The halt-at-top stop value is 3 points (tested), but nothing acts on it. |
| A-ENTRY-15 (short after distribution and a 3-point break of the last important bottom) | **FAIL** | The 3-point break is carried and tested (threePoints "breaks the old bottom by 3 points"). There is still no distribution precondition. The trigger arms on any last swing bottom, not the "last important" one after distribution. |
| A-STOP-01 (stop on every trade, 1, 2 or 3 points away) | **FAIL** | The traded equity stop is nearest S/R in a 3–15% band plus 3 points, or a fixed fallback %. The even-figure rule can add a second 3 points (about 9.5 points total in the changed fixture). Crypto is ATR-capped. None of these is "1–3 points away". |
| A-STOP-03 (a 3-point stop is the safest) | **FAIL** | 3 points beyond the level now holds for the trigger object, structural equity stops, halts and figures (all tested). But the plan stop on fallback equities and crypto is not 3 points beyond anything. The even-figure step compounds to roughly 6 points, and the test fixture now expects that compounding. |

**Result: 0 of 7 pass.** The diff correctly carries the 3-point *magnitude* onto every surface PLAN.md item 3 names, live and replay together. Each entry still fails on structure: holds, buy-the-reaction, context-only versus acting, the stop's anchor level, and the distribution precondition. The magnitude was not what was missing.

## 5. Suggested fixes (not applied)

- Add tests for the bottom and short mirrors (halt at bottom, multiple-bottom crossing, accumulation breakdown, short pyramid), for the even-figure cap argument, and for `levelBeforeThreePoints` inside `portfolio-manager.ts`.
- Decide whether `stopBeyondFigure` should run on a stop that the 3-point buffer itself placed near a figure. As written, the fixture locks in the double allowance.
- Convert `breakaway.ts` to require the trigger beyond `beyondByThreePoints(rangeHigh/Low)`, or record why not.
- Fix the intraday replay's double allowance, or the comment that blesses it.
- Update the comments listed in gap 6, and the curriculum lesson at `lib/school/curriculum.ts:712–713`.
- Run the replay PLAN.md item 3 calls for before any cutoffs are trusted on `2026-10-15-gann-three-points-entry`.
