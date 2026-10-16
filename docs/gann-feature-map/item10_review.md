# Review: item 9 steps 1-3b and item 8 second-review fixes (d82bc16, 6a05534, 848fefc, 9c121ad, 85b22af)

Reviewer: fresh context. I made no changes to `/home/claude/gsps-item5s4` or `/home/claude/GSPS`. All work ran in two clones of `item5-step4` at `49f2680`, with node_modules symlinked:
- `scratchpad/review10` (suite, tsc, terms, mutation batch 1);
- `scratchpad/review10p` (probes, mutation batch 2, fix check).

Line numbers are for `49f2680`.

## Checks

- **`npx vitest run` (full):** 282 files and 2931 tests passed.
- **`npx tsc --noEmit -p .`:** exit 0, no output.
- **`npm run -s check:terms`:** clean (775 source files + 2 public docs). No new test title or user-facing line contains the banned term.
- **STRATEGY_VERSION:** bumped once, in 85b22af (`2026-10-16-gann-volume-review2`, `lib/backtest/strategyVersion.ts:209`). That covers M1-M3, which move holds, exits and the volume criterion.
  - 848fefc and 9c121ad are context only (card and `contextFactors`; I traced every consumer), so no bump is needed.
  - d82bc16 changes the live coarse ranking with no bump of its own. Earlier live-only coarse changes were bumped and recorded (item 6 steps 6 and 7, `strategyVersion.ts:136-142`). The 85b22af bump came later on the same branch, with no run between them, so it covers the change in practice. But the comment block doesn't mention it (L1).
- **Mutations:** 35 run in all. Batch 1 (`mut10/muts.json`) ran on the full suite; batch 2 (`mut10/muts2.json`) on lib/{lifecycle,gann,scan,backtest,__tests__,trade}. **29 killed, 6 survived.** I checked one kill by hand (D1: the volume-ranking test fails on its assertion).

  | Commit | Killed | Survived |
  |---|---|---|
  | d82bc16 | D1 (volume point), D2 (ATR expansion re-added) | D3 (the 50%-point ranking point; it predates this commit) |
  | 6a05534 pins | P1 (Square of Nine deg/180 to deg/360), P2 (eighths of the low), P3 (3/8 paired with 1x3), P4 (hexagon ring formula) | none |
  | 848fefc | T1 (multipleTops band 1%), T2 (failed without the 3 points), T3 (readLevelTests band 1%), T4 (only a third test fails), T6 (crossed without the 3 points) | T5 (card says "third" for a double) |
  | 9c121ad | C1 (break line without the 3 points), C2 (today's session counted), C3 (10-year span dropped), C6 (factor sign), C7 (oldest-first order) | C4 (pivot strength 3 to 2), **C5 (the forming month included)** |
  | 85b22af | V1 (narrow off), V2 (dull off), V3 (exit date test restored), V4 (placement check off), V5 (replay skip off), V6 and V7 (the retest's upper and lower bounds off), V8 (dull baseline 3), V11 (end of the standing at range high), V12 (placement reads two fewer sessions), BV9, BV12, M2b | V9 (narrow measured at the range high: near-equivalent), V10 (placement check applied to shorts too) |

- **Base rates (random walks):**

  | Reading | Rate | Notes |
  |---|---|---|
  | `readDistributionStanding` / `distributionBreakdown` | **0 of 4,000** iid-walk sessions (prices 30-200, daily vol 1.5-3.5%) and **0 of 48,000** GARCH-walk sessions | Was 1.55% in item8b. Of the 13 3-point breakdowns seen on GARCH walks, none came out of a narrow spell. The hold is now close to inert, so run 50 should report how many trades it touched. |
  | `multipleTops` reading present | 81-93% of sessions | Was 82-96% at 1%. |
  | `multipleTops` "failed" | 17-23% | Was 2-8%. Context only today; weigh this before FL3 makes it hold a long. |
  | `campaignBottoms` latest bottom broken | 18-23% | Context only. |
  | `volumeClimax` high-anchor `secondaryOnLowerVolume` | 17.6% now; 11.5% with H1's fix and 11.5% before 85b22af | The gap of about 6 points is the H1 mislabel. |
  | High `confirms` | 58.9% now; 54.5% with H1's fix; 61.8% before 85b22af | |
  | Low `confirms` | 61.7% now; 61.1% with H1's fix; 65.9% before 85b22af | |

- **Live vs replay parity** (probe `review10/lib/zzprobe/probe10b.test.ts`): the same walk was read on its last 252 sessions (live's year) and on the full 1,600-2,600 sessions (the replay's `priorSessions`).
  - `readMultipleTops` disagrees on **74-88%** of sessions (70-87% before 848fefc).
  - `readLevelTests` disagrees on **72-86%** (63-81% before).
  - See M2.
- **Cost on the user's path:**
  - d82bc16 removes the coarse pass's 4-hour batch fetch, which saves time. It is not measured.
  - 848fefc and 9c121ad add arithmetic over bars already in memory (about 120 monthly bars for the ladder).
  - 85b22af adds one 1-year daily fetch on a ready long at placement (`confirmNow.ts:176-178`). That is not on the scan path, and its progress note says so.
  - No commit states a measured figure (L1).

## Findings

### HIGH

**H1. The M3 retest bound moved crossed tops and broken bottoms into the "secondary move" branch, where they confirm the scored volume criterion and get the opposite caption.**
- **Where:** `lib/gann/volumeClimax.ts:405` (highs) and `:418` (lows).
- **What's wrong:** 85b22af gave `reached` an outer bound of 3 points (`:377-380`), which was right. But Rules 1/7 and Rule 4 still test `!reached`. Before the change, `!reached` meant "lower top" or "higher low". It now also means "crossed the old top by more than 3 points" or "broke the old bottom by more than 3 points".
- **Probe** (`review10/lib/zzprobe/probe10a.test.ts`):
  - A top at 100, a heavy decline to 80, then a **higher** top at 111 or 121 on lighter volume. Both read `secondaryOnLowerVolume: true` and `confirms: true`, with the note "is a **lower** secondary rally on smaller volume … the final top may be in."
  - A bear low at 100, then a **lower** low at 89 or 79 (broken by 11-21 points). Both read Rule 4, `confirms: true`, with "a **higher** secondary low … higher prices ahead."
  - Before 85b22af the same cases read as retests, which was the M3 defect. So the fix moved the confirmation from one wrong label to another instead of removing it.
  - Under W006 p.20, a 3-point crossing of a top is a buy signal and a 3-point break of a bottom is a sell. Neither is a Rule 1/7 or Rule 4 setup.
- **Effect:** about 6% of random-walk high-anchor sessions. The scored `volumeClimax` confirms 58.9% of high anchors against 54.5% with the fix. Run 50 would measure the mislabel.
- **Smallest fix (checked in review10p: lib/gann, lib/scan and lib/__tests__ all green, 1901 tests):**
  - `:405`: `secondaryOnLowerVolume = anchor.price < previous.price - tol && heavyDecline && …`
  - `:418`: `secondaryOnLowerVolume = anchor.price > previous.price + tol && bearLow && …`
  - Pin both probe cases. No further version bump is needed if it lands before run 50.

### MED

**M1. C5 survives: the ladder's "completed months only" is unpinned.**
- **Where:** `lib/gann/campaignBottoms.ts:54`.
- **What's wrong:** the live scan's `monthlyLong` includes the month in progress (`disclosedRules.ts` comment at `readDisclosedRules`; the provider's monthly bar). So `< thisMonth` is what keeps the forming month's close, which includes today's partial session, out of "broken". Changing it to `<=` passes the full suite. The existing forming-session test covers the daily side only.
- **Fix:** add a test with a monthly bar stamped in the current month whose close is 3 points under the latest bottom, and expect `broken: false`.

**M2. `multipleTops` and `readLevelTests` still read different sessions live and in the replay. A-LEVELS-04 and -06 rest on them.**
- **Where:** `lib/gann/disclosedRules.ts:580, 599`.
- **What's wrong:**
  - The live scan passes 1 year of daily bars, including the session still trading (`lib/data/provider.ts:171-191`, end = now − 16 min). `readMultipleTops` takes that session's last price and swings, and `readLevelTests` clusters on them.
  - The replay passes every prior session, up to about 6 years and none of the replayed day.
  - The probe has the two disagreeing on 74-88% of sessions. The readings feed `thirdTestFailedAgainstTrade`, which the replay measures, while the card shows the live reading.
  - The item 9 map asked for this fix under A-LEVELS-06 ("Slice to `entryChartBars` on both"). 848fefc changed the band but not the window, and the wider band slightly widened the disagreement.
  - It predates this range, but the pass rule ("live scan and replay must read the same sessions") applies to the two entries these commits re-ground.
- **Fix:** in `readDisclosedRules`, pass both readers the completed sessions before `asOf`, sliced to the last 252, the way `distribution.ts` does with `SESSIONS_READ`. Add a parity pin: 1 year against 6 years, ending on the same date, with a forming bar. No version bump (context only).

**M3. "The same level" now has three bands.**
- **Where:** `lib/gann/volumeClimax.ts:152, 373`; `lib/gann/multipleTops.ts:58`; `lib/gann/entryTrigger.ts:365-374`.
- **What's wrong:**
  - `multipleTops`, `readLevelTests` and the old-level entry treat a second top or bottom within Gann's 3 points as a test (A-LEVELS-06).
  - `volumeClimax`'s retest still requires the second turn within **1%** on the near side. The new far-side bound is 3 points.
  - So a second top 2-5% under a heavy first top is a double top to the entry (which sells it) and to the card. It is not one to `retestOfHeavyTop` / `retestOnLowerVolume`, which are A-ENTRY-20's and A-VOLUME-13's readings.
  - This is the cross-platform rule's failure shape.
- **Fix:** `tol = gannThreePoints(previous.price)` at `:373`. This moves the scored criterion, so it needs a version bump and should go in with H1 if possible.

**M4. C-NUMEROLOGY-04's module still gates a scored criterion.**
- **Where:** `lib/scoring/score.ts:439-441` (`gannConfluenceStackPassed = retracementMatch !== null && drConfluenceHolds`).
- **What's wrong:** the pins in 6a05534 are right, and the arithmetic holds by construction. But the entry's `gsps_location` calls `digitalRoot.ts` "confluence-only". The same module's reading is ANDed into `gannRetracementConfluence`, so a class C rule gates a scored point. This is the map's FL5, an open owner fork.
- **Fix:** the owner's FL5 decision. Option (a), dropping the AND, moves the verdict and needs a bump.

### LOW

- **L1.**
  - d82bc16 isn't recorded in the `strategyVersion.ts` history comment, though earlier live-only coarse changes were.
  - No commit states its measured cost or saving, per AGENTS.md "Speed".
  - D3 survives: the coarse continuation's 50%-point ranking point (`lib/marketScan.ts:453`) is unpinned.
  - The coarse pass also reads the forming daily bar for its volume and 50%-point ranking. That predates this range and is ranking only.
- **L2.** T5 survives: the card line "failed on its second/third test, a top" (`disclosedRules.ts:692`) is unpinned. For bottoms, "Double bottom at X: failed on its second test, a bottom" can read as the bottom breaking, when it means the decline failed and the bottom held. "Held on its second test" would be clearer for bottoms.
- **L3.** V10 survives: the new placement wait (`confirmNow.ts:174`) has no test that a short is unaffected. The test helper already takes a `direction`, so it is a one-line pin.
- **L4.** C4 survives (pivot strength 3 to 2). It is labelled engineering, so acceptable. The doc comment at `campaignBottoms.ts:45` says `nextSupport` is null when "none is below price", but no price test exists: a bottom being undercut inside the 3 points stays `nextSupport` while above price. Fix the comment or add the check.
- **L5.** In C-LEVELS-14's pin (`lib/__tests__/gann.test.ts:557`), the second `expect` computes W009's formula inline and compares it with itself, so it asserts nothing about the code. It is harmless, but the record of the convention rests on the first assertion and the diagonals test.
- **L6.**
  - The replay skip for longs during a standing breakdown (`replay.ts:880`) and the BV14 lookahead guard are pinned only by source regexes (`volumeClimaxWiring.test.ts:85-88`). They kill the obvious mutants (V5) but are brittle to renames.
  - The skip also comes before the `crossing` and `confirmation` state updates, so a crossing printed during the standing is forgotten. That matches production, where the scan holds the plan to Watch and a fresh plan starts its own confirmation, so it is consistent rather than a defect. It is worth one comment line.
- **L7. Out of my id list but on the branch:** 49f2680 flips A-VOLUME-11 to `passes: true` while its `gsps_location` still says "differs: compares the current up leg with the prior up leg, not whole campaigns". Under the pass rule's "a structural difference does not pass", that needs either an owner-recorded acceptance of the leg-for-campaign reading or a note on why the leg is Gann's comparison.
- **L8. A-LEVELS-05 pin sensitivity.**
  - The trend read stays bearish for a rally to 119 under the 120 top (good). It flips to `direction: null` at 121, one point over and inside Gann's 3 points.
  - That is the swing chart's own construction (trend turns on exceeding the last swing extreme), not this commit's.
  - It is noted for item 6/9's reading of "a rally that fails just below an old top" against "crossing by 3 points".

## Per-rule verdicts

| ID | Verdict | Reason (and the smallest fix where it fails) |
|---|---|---|
| A-VOLUME-03 | **PASS pending replay** | M1 is fixed: narrow ≤ 2×3 points and dull against the 40 sessions before, both labelled, with V1/V2/V8 killed. M2 is fixed: an open long exits whenever it was bought (V3 killed), placement waits (V4 killed), and the replay doesn't enter (V5 killed). Completed sessions and the 240-session window are the same on all surfaces. Copy matches the 20-session standing. Random-walk rate 0%: run 50 must show the count of trades it touched before the hold is judged. V10 is a LOW pin. |
| A-ENTRY-20 | **FAIL** (small fix) | `retestOfHeavyTop` is now bounded (V6 killed) and the note no longer claims a stop. But the same bound pushed a crossed heavy top into "lower secondary rally … the final top may be in", still confirming (H1). The near-side 1% band also misses double tops 2-5% under (M3). Fix: H1's two-line change; M3's band. The W006 p.28 volume clause is still unconfirmed against the page (item8b L2). |
| A-VOLUME-10 | **PASS pending replay** | M5 pins added: BV9 and BV12 killed here, BV14 pinned by a source regex. Nothing else changed. |
| A-VOLUME-09 | **PASS pending replay** | Untouched by these commits apart from the M4 pin (M2b now killed). It still waits on run 49/50 for the scored `volumeClimax`. H1 affects the same criterion but not this reading. |
| A-LEVELS-04 | **FAIL** | The reading is right on the 3-point band, a double top can fail, and T1/T2/T4/T6 are killed. But (a) it is context only on the long side where Gann acts ("is a top"), and FL3's hold and exit are not built; (b) live and replay read different sessions (M2), including the forming bar live. Fix: M2's slice now; FL3 as planned (version bump and replay). |
| A-LEVELS-06 | **FAIL** (small fix) | The band is Gann's 3 points, price-scaled and documented. The 64-under-66 and 61-under-66 pins are faithful, and T1/T3 are killed. The only gap is parity and completed sessions (M2). Fix: slice both readers to the same completed 252 sessions in `readDisclosedRules`, with a parity pin. |
| A-LEVELS-03 | **FAIL** (by plan, not a defect) | The ladder is faithful: newest first, broken by a 3-point close, next unbroken older bottom, the same 10 calendar years and completed sessions on both surfaces; C1-C3, C6 and C7 are killed. But it is context only, while Gann treats the next bottom as the support to trade against (targets and watched support, the map's step 8). The forming-month guard is unpinned (M1). Fix: M1 pin now; step 8 to pass. |
| A-LEVELS-05 | **FAIL** | Only the second half is pinned, and that pin is meaningful (L8). The first half, a 110 old top acting as support in a decline (FL1), is not built, and the map itself lists it as failing today. |
| A-PRICE-07 | **PASS** | The pin shows a trigger and stop stated in advance: arming only after a close past the trigger, and retiring on the unchanged stop through the same `applyStopBreachHold` the scan uses. Gann's date condition is UNSPEC for equities, as the map records. Test only; no surface changes. |
| C-PRICE-03 | **PASS** | `pricePercentageLevels(1184, …)` gives exactly 2368 (P2 killed). The level reaches the S/R pool on Gann's own class A sources (45 Years, HTMPC), not on this class C entry, so class C does not gate here. |
| C-LEVELS-14 | **PASS** | The entry allows "or the convention difference is recorded". The pin records GSPS's +2√ per turn against W009's +1, and checks it against the Master Course diagonals within 1 point (P1 killed). The `squareOf9.ts` header was corrected. L5 is cosmetic. |
| C-LEVELS-16 | **FAIL (hold for owner)** | The ring pin is right: 397, 1,387 and 1,519 (P4 killed). But the rule as written includes angles every 30° and a Step input. GSPS has neither; the angles are deliberately unbuilt (AGENTS.md orphan audit item 7, lost illustrations). That is a structural difference under the pass rule unless the owner records it as an accepted exception, as C-LEVELS-14's entry text allows for its own case. |
| C-LEVELS-18 | **PASS** | `RETRACEMENT_ANGLE_PAIRS` matches W031's nine pairs (P3 killed). It is consumed only by `secondaryTime`'s context reading; it gates nothing. |
| C-NUMEROLOGY-04 | **FAIL (owner fork FL5)** | The 3-6-9, 1/32-step and multiple-of-9 pins are right, and the arithmetic holds by construction. But the module is not confluence-only: it gates the scored `gannRetracementConfluence` (M4), which breaks "class C never gates". Fix: the FL5 decision. |

## Reproduction (copies only)
- **Probes in `scratchpad/review10/lib/zzprobe/`:**
  - `probe10a.test.ts`: H1 cases;
  - `probe10b.test.ts`: base rates and 1-year vs full-history parity;
  - `probe10c.test.ts`: distribution rate on GARCH walks.
- **Probes in `scratchpad/review10p/lib/zzprobe/`:**
  - `p5.test.ts`: A-LEVELS-05 sensitivity;
  - `p10d.test.ts`: `volumeClimax` rates current / fixed / pre-85b22af.
- Run any probe with `npx vitest run <file> --reporter=verbose --silent=false`.
- **Mutations:**
  - `node scratchpad/mut10/run.mjs <repo> scratchpad/mut10/muts.json`: full suite, results in `muts.json.results.txt`;
  - `run2.mjs` with `muts2.json`: targeted directories.
