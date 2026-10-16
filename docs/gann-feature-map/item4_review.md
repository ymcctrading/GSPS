# Item 4 review: Gann's reaction buy after a crossing (diff 5b42668..b55ad22)

Reviewer: independent, fresh context. Read-only. Mutations were run in /home/claude/gsps-item4 and restored with `git checkout -- <file>`; `git status` is clean afterwards.

Baseline: `npx vitest run lib` gives 2185/2185 passing. The 7 directly relevant files give 108/108.

Mutation harness: `/tmp/claude-0/-home-claude-GSPS/7b7249ce-f02f-5728-a844-fc19299dfe3f/scratchpad/review4/mut.py` and `mut2.py`.

## Mutation results

| # | Mutation | Result |
|---|---|---|
| M1 | reactionEntry = L + 2 points (not 1) | caught, 7 tests fail |
| M2 | reactionStop = L − 6 points (risk 7) | caught, 7 fail |
| M3 | short sign error on reactionStop | caught, 6 fail (bearish pricing, line recovery) |
| M3b | short sign error on reactionEntry | caught, 5 fail |
| M4 | crossing counted on a wick, not a close | caught ("not ready on a wick", short mirror) |
| M5 | gannBreakLine at 2 points | caught, 4 fail |
| M5b | gannBreakLine at 6 points (3 points counted twice) | caught, 5 fail |
| M6 | replay buys the reaction with no prior crossing | caught, 3 fail |
| M7 | replay keeps the old protective-swing stop | caught, 3 fail |
| M8 | simulator back to buy-stop (breakout) semantics | caught, 5 fail |
| M9 | equity stop re-anchored to S/R band (ignores reaction stop) | caught, 2 fail |
| M10 | crypto ATR leeway applied to the reaction stop | caught, 2 fail |
| M11 | no "dead" check after a close through the stop | caught, 1 fail |
| M12 | automation sends a market order instead of the limit | caught, 2 fail (e2e) |
| M13 | place-order drops the plan's stop (falls back to 4-stage retest) | caught, 1 fail (e2e) |
| M14 | replay crossing = close at the level (not L+3) | caught, 1 fail |
| M18 | replay priceTradeLevels back to the old entry source | caught, 10 fail in replay.test.ts |
| **M15** | **live scan `lib/scanTicker.ts:289` back to the old breakout entry/stop source** | **SURVIVES: 2185/2185 pass** |
| **M16** | **plan lifecycle `lib/lifecycle/advanceConfirmation.ts:77` drops stopPrice (old 4-stage retest)** | **SURVIVES: 2185/2185 pass** |
| **M17** | **ticket/Guided/demo confirmation `lib/trade/place-order.ts:192` drops the stop (old rule)** | **SURVIVES: 2185/2185 pass** |

The helpers are well pinned. The production wiring is not. Reverting the live scan to the pre-item-4 breakout entry and protective stop (M15) passes CI. That one change undoes every rule below on every live plan.

## Verdicts

| Entry | Verdict | Test that proves the helper | Mutation(s) | Reason |
|---|---|---|---|---|
| A-ENTRY-04 | **FAIL** | `lib/gann/__tests__/reactionEntry.test.ts > the reaction buy on the live plan > prices a bullish plan at the level plus 1 point, stopped at the level less 3`; `... > is ready once a close crosses the old top by 3 points ...`; `... > is not ready on a wick ...`; `lib/__tests__/replay-reaction.test.ts > replay entryRule: reaction > buys the reaction to 1 point past the level after a close 3 points beyond it` / `does not buy when price never closed 3 points beyond the level` | M1, M4, M5, M5b, M6, M14 caught; **M15, M16, M17 survive** | The rule is asserted as Gann wrote it (close at L+3 crosses; limit at L+1, filled on the reaction; stop L−3; price-scaled), and the tests are green. It fails criterion 3 on the live paths: the scan pricing, the plan-arming lifecycle and the person-placed confirmation can each revert with no test failing. It is also carried only partly. (a) An advised ticket entry without attached levels skips confirmation, and under the new limit semantics it fills at once below the level, before any crossing (gap 1). (b) Non-plan paths (Guided, demo, the manual ticket) only see today's session for the crossing close, so a reaction on a later day than the crossing is refused (gap 4). |
| A-ENTRY-16 | **FAIL** | `reactionEntry.test.ts > prices a bearish plan at the level plus 1 point, stopped at the level less 3`; `> recovers the bearish crossing line ...`; `> mirrors for a short: a close 3 points under the old bottom`; `simulator.test.ts > isTriggered > fills a sell limit once the market rallies up to or through it` | M3, M3b, M4 caught; M15–M17 survive | The short mirror is right in the helpers: line L−3, sell limit at L−1, stop L+3, and the sign mutations are caught. The replay test fixture only exercises one direction, the bullish one (`S` comes from the fixture's trigger), so the replay short branch is unpinned. Same live-wiring and partial-carry reasons as A-ENTRY-04. |
| A-STOP-01 | **FAIL** | `reactionEntry.test.ts > prices a ... plan at the level plus 1 point, stopped at the level less 3` (equity and crypto) | M9, M10 caught; M15 survives | Plan stops are now 3 points beyond the crossed level, which is the feature map's reading (E3, `features_A_notes.md:82,126`). Two problems remain. "On every trade" is not met: the ticket can place a protocol-advised entry with no stop (`attachLevels` unchecked or bracket blocked), and nothing asserts that every placed entry carries a stop. The live-scan wiring is also unguarded (M15). Note that on the literal p.46 reading ("stop 1–3 points away" from the purchase), a fill at the L+1 limit is 4 points from the stop. Gann's own 50/53/51/47 example has the same 4, so if the owner wants to judge "away" from entry rather than from the level, that is a fork for him to decide. |
| A-STOP-02 | **FAIL** | `reactionEntry.test.ts > prices a ... plan ...` asserts `riskPerShare <= 5/3 * gannThreePoints(level)`; `replay-reaction.test.ts > carries the level, a buy 1 point past it and a stop 3 points the other side` asserts 4 points | M2 caught; M15 survives | The 5-point cap holds by construction: 4 points at L+1, less on a better fill. I checked shorts too. points ∝ price^0.59 on pointScale's curve, so 4·p(L) ≤ 5·p(L−p(L)) for every allowed pct (≤12%). But it is not enforced anywhere: no placement or scan check refuses a stop wider than 5 points, and the scan's use of the reaction stop is unguarded (M15 restores 15–20% stops with every test green). Also, the replay's default `entryRule: "stop"` with `usePlanLevels` now pairs a L+3 entry with the plan's L−3 stop, so the measured trade risks 6 points (gap 5). The cited test plan (`equity-levels.test.ts`, "no computed stop further than 5/3 × gannThreePoints(entry)") was not written; the substitute uses `level`, which is equivalent or stricter for longs and still holds for shorts. |
| A-STOP-03 | **FAIL** | `reactionEntry.test.ts > prices a ... plan at the level plus 1 point, stopped at the level less 3`; `replay-reaction.test.ts > carries the level ...` | M2, M3, M9, M10 caught; M15 survives | Placement at exactly 3 points beyond the level is asserted and mutation-proof in the helpers and the replay. It fails criterion 3 on the live scan (M15). |

All five would pass on the helper and replay level. What fails them is the wiring tests (criterion 3) plus the partial carries listed in the gaps. The smallest fix that flips A-ENTRY-04, -16, A-STOP-02 and -03 has three parts: a scanTicker-level test (or a test on whatever builds `entrySource` for the scan) pinning `levels.entry`/`levels.stopLoss` to `reactionEntry`/`reactionStop`; tests pinning `advanceEntryConfirmationForSymbol` and the no-plan `entryConfirmationRefusal` to the stop-carrying rule; and fixes for gaps 1 and 4.

## Gaps (correctness or stated requirements)

1. **An advised entry without attached levels buys before the crossing, below the level.** `lib/trade/place-order.ts:172` returns no confirmation when `attachLevels` is absent. The ticket still sends `limitPrice = levels.entry` (`components/trade/order-ticket.tsx:220,436`), for example with "attach protocol levels" unchecked, or when `bracketBlocked` drops the levels. Since `isTriggered` became limit semantics (`lib/brokers/simulator.ts:460`), `place-order.ts:516` fills it immediately at market whenever the market is at or below L+1, including below L with no crossing. Before this diff the same order was a buy-stop that waited for price to reach the trigger. This is a wrong-price fill introduced by the diff.
2. **Resting orders placed before the deploy flip direction.** Any `new` advised limit/bracket row created under the old buy-stop semantics (trigger above the market) satisfies `market <= limit` on the first `evaluateRestingOrders` poll (`lib/brokers/simulator.ts:539`). It fills at market, below its old trigger, with no crossing. The diff has no migration, cancel or re-price for open rows.
3. **gannBreakLine is wrong where entry/stop aren't a reaction pair.**
   - Pivot plans: `lib/lifecycle/fromPivot.ts:73,76` sets entry = old stop (L−3p) and stop = old entry (L+p). `advanceConfirmation.ts:77` and `place-order.ts:183` then derive a line at L−5p and a "crossed level" at L−2p (also `portfolio-manager.ts:311`, the round-number check). Neither price is a real level.
   - Manual Override: `place-order.ts:192` takes the user's own typed stop. A stop tighter than L−3 pulls the line toward the entry, down to about entry + ε, so the order can arm before any 3-point crossing. A wider stop pushes the line beyond L+3. The comment calls this intended, but it departs from Gann's line, which is fixed at L+3 whatever stop the user chooses.
   - Rounding: `lib/strat/levels.ts:748` rounds entry and stop to cents, and the formula multiplies that error by 1.5. This is negligible for stocks. For sub-dollar crypto (pct clamped at 12%) the derived line can be off by a large fraction of a point (pre-existing cent-rounding, amplified).
4. **The crossing window for non-plan paths is today's session only.** `lib/lifecycle/confirmNow.ts:80` applies when there is no `since`, which covers Guided, demo and the advised ticket. A crossing close on an earlier day followed by today's reaction (the very buy Gann describes) reads as `not_touched`/`touched` and is refused `awaiting_confirmation`. So those paths can only buy a reaction in the same session as the crossing. Plan-sourced orders read since `generatedAt`, but plans expire after 45 minutes to 5 hours. Separately, the crossing close is read on 15-minute execution bars, not the daily close of Gann's example. That is a translation choice worth stating, not necessarily a defect.
5. **The replay default no longer measures production.** `lib/backtest/replay.ts:657` and `lib/backtest/run.ts:544` still default `entryRule` to `"stop"`, and live now trades `"reaction"` (the AGENTS.md cross-platform rule). Worse, with `usePlanLevels` the `"stop"`/`"confirmed"` rules take `planLevels.stopLoss` (`replay.ts:905`). Since `priceTradeLevels` now uses `gannEntrySource`, that stop is the reaction stop L−3, paired with an L+3 or confirmed entry: a 6-point risk that no production path takes. Any run that omits `entryRule=reaction` mis-measures the live rule.
6. **No live check enforces the 5-point cap.** It holds only because every plan is reaction-priced. Neither `placeSimulatedOrder`/`placeLiveOrder` nor the scan refuses or holds to Watch a stop wider than 5 price-scaled points, which PLAN.md item 4 states ("held to Watch rather than widened"). Manual Override and person-moved stops can exceed it unchecked.
7. **Minor: the reaction setup is dropped when the protective swing is close.** `lib/gann/entryTrigger.ts:178` still nulls the trigger when the old protective-swing stop sits on the wrong side of `triggerPrice`. That stop is no longer used for trading, so valid reaction setups in tight ranges are dropped. This narrows the verdict; prices are unaffected.
8. **Minor: a live gap below the stop.** The paper simulator cancels a resting order once the market is through the stop (`simulator.ts` checks the stop before the fill), and `place-order.ts:516` refuses a placement-time fill through the stop. The live Alpaca limit at L+1 has no such guard: a gap open below L−3 fills below the bracket stop and is stopped at once.

Not found: double counting of the 3 points (the line is L+3 once, and M5b confirms 6 points would be caught); short-side sign errors in the helpers; any remaining live path that still prices the old breakout entry (all paths read plan or scan levels, which now come from `gannEntrySource`; automation now sends a limit).
