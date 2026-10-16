# Review: item 8 steps 4-5, review fixes, A-ENTRY-20 (0da7eaa, 6239863, 0b6f9b1, 031cc42)

Reviewer: fresh context, read-only on `/home/claude/gsps-item5s4` (branch `item5-step4`; reviewed at `031cc42`; a later commit `d82bc16` landed during the review and is out of scope). Probes and mutations ran only in copies: `scratchpad/review9copy` (suite, tsc, terms, mutations) and `scratchpad/review9p` (probes), both `git archive 031cc42` with node_modules symlinked.

## Checks

- `npx vitest run` (full): **282 files, 2905 tests passed**, exit 0.
- `npx tsc --noEmit -p .`: exit 0.
- `npm run -s check:terms`: clean (773 source files + 2 public docs). The new copy (AWAITING_VOLUME note, hold note, card line, two lessons, `volumeNote`) has no "Gann".
- **STRATEGY_VERSION:** bumped in 0da7eaa (`gann-breakaway-volume`), 6239863 (`gann-volume-review`) and 0b6f9b1 (`gann-distribution-hold`), the three commits that move entries, the score or exits. 031cc42 changes only a note and correctly has no bump.
- **Live/replay parity** (`zzprobe9.test.ts`, 20 seeded walks, sessions 400-1500, 365-day live history against the full replay history, the session in progress included and trimmed):
  - `readDistributionStanding`: **0 of 3160 differ**.
  - `breakawayVolumeMet` reads `entryChartBars` (the 52 weeks before the date) on both surfaces, so it reads the same window by construction.
  - The live exit manager reads 730 days. The replay exit reads every prior session. Both feed the same last 240 sessions.
- **Base rates (random walks):**

  | Reading | Rate | Bound |
  |---|---|---|
  | `readDistributionStanding` (3.5% daily vol, price 200) | 1.55% of sessions | under 95% |
  | `readDistributionStanding` (2% vol, price 50; the 3-point allowance there is 6.6%) | 0% | under 95% |
  | `isGannRangeBound` on the 52-week entry chart, which is the A-VOLUME-10 gate | 63% of sessions | |
  | Crossings out of a "range" that meet the volume test | 43% | |
  | `volumeExtremeLow`, plain walk | 0% | was 24% before the H1 fix |
  | `volumeExtremeLow`, constant-dollar walk | 0.4% | |
  | `volumeExtremeLow`, constant-dollar uptrend | 0.1% | |
  | `retestOfHeavyTop` (of highs) | 7-8% | |
  | Low `confirms` / high `confirms` | 65-68% / 59-65% | |

  So about 36% of reaction entries on random walks wait for volume. H1 is fixed.
- **Mutations:** 41 run; 1 was a bad match (E3). Of the 40 valid: **29 killed, 11 survived**. The runner is `scratchpad/mut9/run.mjs`, the list is `mut9/muts.json` and the results are in `mut9/results.txt`. Details are under Findings.
- **Cost** (`zzbench9`, 251 bars):
  - `readDistributionStanding`: 32 ms per 250 symbols per call. The live scan calls it in `scanTicker`, and again through `readDisclosedRules` when the confluence flag is on, so about 64 ms in all.
  - `breakawayVolumeMet`: 0.28 ms per call.
  - The confirmation path now makes **one extra 1-year daily fetch** on the "ready" branch (`confirmNow.ts:185-187`), which used to return without any network call. That fetch is on the order-placement path, not the scan.
  - None of the four commits states its cost, which AGENTS.md "Speed" asks for.
- **Run 48** (recorded in 031cc42, on c6f9db0, before these fixes): `volumeClimax` passes 143 of 156 within Execute (91.7%, close to the 95% ceiling) with a delta of **−0.668R**. It is still inverted. Run 49 (0b6f9b1) is owed.

## Findings

### M1. MED: A-VOLUME-03 acts without the rule's "dull, narrow" clause, and nothing labels the omission
**Where:**
- `lib/gann/distribution.ts:64,97-117`
- `lib/gann/accumulation.ts:46-61`

**What's wrong:** Gann's Rule 2 (W006 pp.39-40) is "a **dull, narrow** sideways spell that breaks out downward on increased volume". The reading uses `readAccumulation`, whose "range" is just the 20 sessions before the break. Nothing tests width or dullness:
- the range is any width;
- the volume inside the spell is not compared with anything;
- `acc.long` and `acc.weeks` are computed and never read.

So the reading is really "a 20-session low broken by the 3-point allowance, on above-mean volume, after any lower weekly top".

When this was context only, the previous review called the reading faithful. Since 0b6f9b1 it holds long Execute verdicts and **exits open longs** (live scan, live exit manager, replay). The header labels "increased" and the lower-top spacing, but not the missing "dull, narrow".

**Probe** (`zzprobe9.test.ts`): on walks where the breakdown fires, the 20-session spell before the break has a median width of **24%**, and the 90th percentile is 45%. Those are not narrow spells.

**Fix:** either read the clause or label it and put it to the owner.
- To read it: require `acc.long` (the spell lasted at least LONG_WEEKS); bound the spell's width (an engineering figure, labelled); and require the spell's mean volume to be below the sessions before it ("dull").
- Otherwise: label it as not read in the header, the card and the registry note, and put it to the owner before Run 49 is read.

Pin it with a wide-range negative fixture.

### M2. MED: a long filled after a standing breakdown is never exited by it, and placement doesn't check it
**Where:**
- `lib/gann/exitRules.ts:256-264` (`standing.breakDate >= pos.entryDate`)
- `lib/trade/place-order.ts:211-275` (confirmation reads only the trigger)

**What's wrong:** the hold acts only on the scan verdict. A plan armed Execute before the breakdown can still be placed after it: confirmation never reads `distributionStanding`. The exit then skips that position because the break predates the fill.

The replay has the same gap. Watch-bucket longs are traded there during a standing breakdown and are never exited by it.

Gann's "signals a further decline" doesn't depend on when the long was bought.

**Probe** (`zzprobe9b.test.ts`, "exitTiming"): a breakdown stands on 2023-04-05.
- A long filled on 2023-04-06 gets `exit: null` from the distribution rule while the breakdown still stands.
- The same position filled before the break exits. Another rule fired first in that fixture, which is why the reason reads `trend_change`.
- D5 (drop the date test) is killed by a test that asserts the skip, so the skip is deliberate. It is not justified in the header, though.

**Fix:** pick one and pin it.
- Exit any open long while a breakdown stands.
- Or refuse a long placement in `entryConfirmationRefusal` while one stands.

### M3. MED: `retestOfHeavyTop` names a breakout above the old top "a second test … a sell"
**Where:** `lib/gann/volumeClimax.ts:371-387` and `lib/scoring/score.ts:257`.

**What's wrong:** `reached` is `anchor.price >= previous.price - tol`, so it has no upper bound.

**Probe** (`zzprobe9b`): the test's `doubleTop(4000, secondTop)` with the second top at 100, 104, 110 and 120 (anchors 101, 105, 111, 121; the heavy first top is at 101).
- Every case reads `retestOfHeavyTop: true`.
- Every case gets the note "is a second test of a top that came on heavy volume: a sell, with the stop 3 points over the old top."

A top 20 points over the old one has crossed it by far more than Gann's 3 points. Under W006 p.20 and Rule 3 that is a **buy** signal, and certainly not a double top.

The note is also shown on any short whose high anchor qualifies, including crossing shorts whose plan stop is not "3 points over the old top". So the copy says more than the plan.

**Fix:**
- Bound `reached` from above for this naming (`anchor.price <= beyondByThreePoints(previous.price, 1)`, or the 1% tolerance).
- Show the "a sell, stop 3 points over" clause only when the plan's entry kind is `oldLevel`.
- Add the higher-top negative test.

The same unbounded `reached` also feeds `retestOnLowerVolume` and the A-VOLUME-13 ratio. That predates this range, but it is worth the same bound.

### M4. MED: the M2 fix from the last review (FV4's `majorPivots` guard) is still not pinned
- **The claim.** The 6239863 progress note says the random-walk pin "fails without majorPivots" and that V16 is killed.
- **Result.** Mutant M2b (`majorPivots(findPivots(read, 3))` → `findPivots(read, 3)`) **survives the full suite**.
- **Measured.** On the pin's own walks the rate is **0.271** with `majorPivots` and **0.229** without it. Dropping the guard makes the rate *lower*, so a `< 0.5` bound can never catch the mutant.
- **Fix:** pin the guard with a fixture where a minor weekly high falls after the last major top, so the two readings differ. Correct the progress note.

### M5. MED: three parity and exemption choices in A-VOLUME-10 are unpinned
| Mutant | Change | Result |
|---|---|---|
| BV9 | `onVolume` reads raw `daily`, which includes the session still trading, instead of `entryChartBars` | survived |
| BV12 | the live early return drops `restsWithoutCrossing`, so double/triple bottoms and holds in a range would wait for volume | survived. The replay side (BV11) is killed. |
| BV14 | the replay reads `breakawayVolumeMet(dailyBars, …)`, the whole series including future sessions | survived. Lookahead is not caught. |

The code is right today. These are the parity and completed-sessions guarantees the step claims.

**Fix:** three tests:
- a forming-session bar that would flip the read;
- a resting old-level buy in a range that is ready on low volume;
- a replay fixture whose post-date volume would change the result.

### L1. LOW: other survivors
- **BV5.** The mean is taken over the 91-day range rather than the whole year read: unpinned.
- **D9.** The exit's `asOf` (`last.t + 36h`) could drop the last completed session and stay green.
- **D12.** `SESSIONS_READ` 220 → 240 (the author's P1) survives. The parity it protects is only asserted on a walk where both give the same tops.
- **H5.** A low inside the first 126 sessions read counts as a bottom: unpinned. It is near-unreachable on 250-bar histories.
- **H2.** Equivalent: the quiet month is the last completed month, so the gap can't go below −1.
- **L2a.** The bear-low guard is unpinned. It is practically unreachable, as the last review said.

### L2. LOW: copy
- **AWAITING_VOLUME** (`confirmNow.ts:221`) says "waits for a completed session to close past the line on more than the range's average volume". The rule takes only the *crossing* session (`breakaway.ts:186-191`). So after a low-volume crossing, a heavier session that stays above the line never satisfies it: probe `lowCrossThenHeavy: false`.
  - Say "the session that crossed the line came on less than the range's average volume; the entry waits for a new crossing on volume", or change the rule.
  - "Leaving a narrow range" also overstates `isGannRangeBound`, which is true on 63% of random-walk charts and has no width test. The header labels that engineering choice; the note doesn't.
- **The A-VOLUME-03 card line, hold note and lesson** say "while price stays under the range". The standing ends after `STANDING_SESSIONS` (20) even if price stays under. Say "for up to four weeks while price stays under the range", or drop the look-back.
- **The Pro course** (Academy 4, `curriculum.ts:713-717` and `:735`) still describes the crossing with no volume wait, and doesn't mention the breakdown hold or exit. Pro users' orders are now held by both rules. Only Academy 6 was updated; the 0da7eaa progress note says "Academy 4", but line 990 is Academy 6.
- **A-ENTRY-20's source.** The W006 p.28 notes (American Commercial Alcohol, July 1933: "double top with 1929: sell, stop 3 points above high") don't mention the earlier top's volume. The feature entry's "came on heavy volume" clause can't be confirmed from the notes in the reading output. Re-check the page before relying on the volume clause.

### L3. LOW: cost, and a duplicate read
- The breakdown read runs twice on a live scan when confluence is on (`scanTicker.ts:398` and `disclosedRules.ts:574`). Passing the scan's reading through would halve the 64 ms.
- The extra confirmation fetch (Checks) could reuse the held path's daily fetch.
- State both figures in the commit, per AGENTS.md.

## Re-checks of the previous review (item8_review.md)
- **H1:** fixed.
  - The bottom must be the lowest of 126 sessions before it.
  - The quiet month must fall in the low's month, up to two months after it, or the month before.
  - The rate on uptrends is now 0.1%; it was 24%.
  - H1, H3, H4 and H6 are killed.
- **M1 (wiring):** fixed. `volumeClimaxWiring.test.ts` checks the replay and the live scan at runtime, and the other callers by source. The source regexes kill a renamed call, but they are brittle.
- **M2:** `>` is fixed and pinned (M2a killed). The `majorPivots` pin does not work (M4 above).
- **M3:** fixed. `readSharesPerPoint(dailyBars, campaign, asOf)` drops the session still trading (M3a killed).
- **L2:** labels and guard added; the guard is unpinned (L2a). **L3:** pinned under 0.85. **L4:** header notes added.

## Verdicts

| ID | Verdict | Reason |
|---|---|---|
| A-VOLUME-03 | **FAIL** (small fix) | The hold and exit are wired on all three surfaces with 0/3160 parity diffs, and most mutants are killed. But the rule now acts with "dull, narrow" unread and unlabelled (M1: spells 24% wide at the median). Longs filled while a breakdown stands are neither refused nor exited (M2). |
| A-VOLUME-09 | **PASS pending replay** | H1 is fixed: the quiet month is tied to a half-year bottom in or near that month; uptrend rate 0.1%; the core mutants are killed. Scored, and `volumeClimax` was still inverted in run 48, so read run 49 first. H5 is a LOW pin. |
| A-VOLUME-10 | **PASS pending replay** (after M5 pins) | At confirmation on every placement path and in the replay's production reaction rule. Same completed sessions, resting buys exempt, one-session delay labelled, 43% met on random-walk crossings. BV9, BV12 and BV14 (parity, exemption, lookahead) are unpinned. The waiting note's copy needs correcting (L2). |
| A-VOLUME-11 | **PASS** | M3 is fixed and pinned (M3a killed); the live scan drops the session in progress. Context only. |
| A-ENTRY-20 | **FAIL** (small fix) | The sell is the existing old-level short, and the heavy earlier top is already in `climax`. But `retestOfHeavyTop` names tops 4-20% *above* the old top "a second test … a sell" (M3). The note's stop claim applies to plans that don't carry it. The heavy-volume clause is not confirmable from the W006 notes. |

## Reproduction (copies only)
- **`review9copy/lib/gann/__tests__/zzprobe9.test.ts`:**
  - breakdown-standing rate and parity;
  - spell width at the break;
  - breakaway gate and met rates;
  - `volumeClimax` field rates on three walk types.
  - Output: `scratchpad/probe9.json`.
- **`review9p/lib/gann/__tests__/zzprobe9b.test.ts`:**
  - the higher-top `retestOfHeavyTop` cases;
  - low-volume crossing, then a heavy session;
  - exit timing.
- **Mutations:** `node scratchpad/mut9/run.mjs scratchpad/mut9/muts.json` (it runs the full suite with `--bail=1`, from `review9copy`).
- **M2b rate check:** the "rare on random walks" test with a `console.log` added, run with and without `majorPivots`.
