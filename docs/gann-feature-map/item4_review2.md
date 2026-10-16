# Item 4 re-review after b031543 (worktree /home/claude/gsps-item4, HEAD 070b3c2)

Reviewer: fresh context, read-only. Every mutation was applied, the **full** suite was run (`npx vitest run`, 2382 tests), and the file was restored with `git checkout`. `git status` is clean at the end. A throwaway probe test was created and deleted.

Baseline: `npx vitest run` gives 238 files and 2382/2382 passing. `npx tsc --noEmit -p .` is clean.

Harnesses: `/tmp/claude-0/-home-claude-GSPS/7b7249ce-f02f-5728-a844-fc19299dfe3f/scratchpad/review4b/mut.py` and `mut3.py`. Raw output: `.../review4b/mut_out.txt`.

## Mutation results

| # | Mutation (file) | Result | Caught by |
|---|---|---|---|
| W1 (=M15) | scan back to the old breakout entry and swing stop (`lib/scanTicker.ts:289`) | caught | reactionWiring > scan plans carry the reaction pair |
| W1b | scan reaction pair without `gannReaction` (stop re-anchored to S/R) | caught | same |
| W2 (=M16) | plan advancement drops stopPrice (`advanceConfirmation.ts:82`) | caught | reactionWiring > arms a scan plan on a tick at the crossing line |
| W2b | pivot plans also read as the reaction pair | caught | reactionWiring > does not arm a stop-and-reverse plan on a single tick |
| W3 (=M17) | plan-sourced placement drops the stop (`place-order.ts:226`) | caught | reactionWiring > confirms a plan-sourced order on its plan's stop; portfolio-manager-e2e |
| W3b | no-plan placement ignores `entryStop` | caught | reactionWiring (2 tests) |
| W3c | no-plan placement drops the stop | caught | reactionWiring (2 tests) |
| W3d | no confirmation when no levels are attached (old gap 1) | caught | reactionWiring > confirms an advised entry with no levels attached |
| W4 | riskCapRefusal not applied | caught | reactionWiring > is checked before anything is placed |
| W5 / W5b | cap at 6 / 10 points | caught | reactionWiring (2 tests) |
| W6 | ticket stops sending `entryStop` | caught | order-ticket.test.tsx > sends the protocol stop with an advised entry |
| W7 | no-plan crossing window back to today's session (old gap 4) | caught | confirmNow.test > counts a crossing close from an earlier session |
| W8 | resting-order cutover ignored (old gap 2) | caught | reactionWiring > resting paper entries placed before the cutover |
| W9 | no "dead" after a close through the stop | caught | reactionEntry > calls the entry off ... |
| W10 | crossing counted on a wick | caught | reactionEntry (wick and short mirror) |
| W11 / W11b / W11c | replay **short** branch: entry sign, fill condition, crossing test | caught | replay-reaction (2-3 tests each) |
| W12 | `computeEquityTradeLevels` ignores the fixed stop | caught | 10 tests |
| W13 | bearish reactionStop sign | caught | 12+ tests |
| W14 | reaction entry at 2 points | caught | 8 tests |
| **W15** | portfolio manager reads a pivot plan's crossed level with `gannCrossedLevel` (`portfolio-manager.ts:316`) | **survives** | none |
| **W16** | replay **long** fill: `live.l <= reactionEntry` changed to `live.h >= reactionEntry` (`replay.ts:809`) | **survives** | none |
| **W16b** | replay **long** fill price: `Math.min(reactionEntry, open)` changed to `Math.max` (`replay.ts:850`) | **survives** | none |
| **W16c** | replay **long** crossing: any close counts, not just a close 3 points past the level (`replay.ts:806`) | **survives** | none |

M15, M16 and M17 from the first review are now all caught.

Why W16 survives: the replay fixture in `lib/__tests__/replay-reaction.test.ts` is **bearish**, not bullish as the first review said. A probe shows `computeGannEntryTrigger(DAILY, ...)` returns `direction: "bearish"`, so `S = -1`. Every replay assertion runs on the short branch only.

A related check: under `MARKET_DATA_PROVIDER=synthetic`, all 8 symbols in the scan wiring test (AAPL, MSFT, NVDA, AMD, XOM, JPM, KO, TSLA) give **bearish** plans. So the scan-level test only checks shorts. That part is acceptable, because the scan wiring is the same code for both directions and both directions of the helpers are pinned (reactionEntry.test.ts loops over both). The replay is different: its fill and crossing code branches on `long`.

## Verdicts

### A-ENTRY-04: FAIL (on one surface only, with a one-test fix)
- **Proving tests (green):**
  - `reactionEntry.test.ts > prices a bullish plan at the level plus 1 point, stopped at the level less 3`
  - `> is ready once a close crosses the old top by 3 points ...`
  - `> is not ready on a wick ...`
  - `> calls the entry off ...`
  - `> fills the resting order only when price reacts back to the entry`
  - `reactionWiring.test.ts`: all of the placement, advancement and scan tests
  - `confirmNow.test.ts > counts a crossing close from an earlier session ...`
  - `order-ticket.test.tsx > sends the protocol stop ...`
- **Live paths:** scan, plan arming, ticket, Guided, demo and automation all hold. Each is pinned by a mutation (W1 to W10, W12, W14).
- **Failure:** the replay's long reaction branch is not tested. W16, W16b and W16c survive. With W16c, the replay buys longs with no 3-point crossing and every test still passes. The replay is how the rule is measured (AGENTS.md cross-platform rule; `entryRule: "reaction"`), so breaking the long rule there should fail a test, and it doesn't.
- **Fix:** add a bullish fixture to `replay-reaction.test.ts`, for example by running the four replay tests for both directions. A mirrored daily history should give a bullish trigger.
- **Old gaps 1, 2 and 4 are closed and pinned** (W3d, W8, W7).
- **Minor, not failing:** a limit at L+1 fills at market whenever price is anywhere between L+1 and the stop. That includes the range between L−2 and L−3, which is just past Gann's "down to 48". It doesn't break the stop or the cap.

### A-ENTRY-16: PASS
- **Proving tests:**
  - `reactionEntry.test.ts > prices a bearish plan at the level plus 1 point, stopped at the level less 3`
  - `> recovers the bearish crossing line and level ...`
  - `> mirrors for a short: a close 3 points under the old bottom`
  - `> fills the resting order only when price reacts back to the entry` (the sell-limit half)
  - `replay-reaction.test.ts`: all four replay tests (the fixture is bearish)
  - `reactionWiring > prices every equity plan ...` (every synthetic plan is bearish)
- **Mutations caught:** W11, W11b, W11c, W13, W10, plus every wiring mutation above.

### A-STOP-01: FAIL
- **Placement is pinned.** The stop sits 3 points beyond the crossed level on every plan (W1, W1b, W12, W13 and W14 are caught).
  - Tests: `reactionEntry > prices a ... plan ...` (equity and crypto, both directions); `reactionWiring > prices every equity plan ...`; `replay-reaction > carries the level, a buy 1 point past it and a stop 3 points the other side`.
- **Failing part: "Use a stop-loss order on every trade" is not met or tested.** A person can place an order with no stop at all:
  - "Exit this trade on the protocol's levels" can be unchecked (`components/trade/order-ticket.tsx:671`; the ticket then says "No stop or target attached", line 935).
  - A "now" market entry can go without levels.
  - `bracketBlocked` drops the levels silently (`order-ticket.tsx:346`).
  - `placeSimulatedOrder` and `placeLiveOrder` accept an entry with no stop, and `riskCapRefusal` returns null when there is no stop (`lib/trade/place-order.ts:189`). So an order with no stop also escapes the 5-point cap.
  - The paths GSPS places itself all carry the plan's stop: Guided (`app/api/guided/execute/route.ts:230`), demo (`lib/demo/auto-trade.ts:332`) and automation (`lib/automation/service.ts:297`).
- **Owner decision 1:** does "every trade" bind an order a person places themselves? If yes, require a stop on every non-protective entry and add a test. If no, record that scope in the entry.
- **Owner decision 2: "1, 2 or 3 points away".** The stop is 3 points from the crossed level and 4 points from the L+1 buy. Gann's own example (top 50, buy 51, stop 47) has the same 4. Reading "away" as "from the level" makes it satisfied (3 points). Reading it as "from the entry" makes it 4, and unsatisfied. This is not failed on this point alone.

### A-STOP-02: PASS
- **Proving tests:**
  - `reactionWiring.test.ts > never risk more than 5 points (A-STOP-02) > refuses a stop more than 5 points from the entry, a Manual Override stop included`
  - `> is checked before anything is placed`
  - `reactionWiring > prices every equity plan ...` (asserts risk ≤ 5 points)
  - `reactionEntry > prices a ... plan ...` (riskPerShare ≤ 5/3 × gannThreePoints(level))
  - `replay-reaction > carries the level ...` (exactly 4 points)
- **Mutations caught:** W4, W5, W5b, W1, W14.
- **Coverage:** the cap runs inside `entryConfirmationRefusal`, which both `placeSimulatedOrder` (line 394) and `placeLiveOrder` (line 921) call for every non-protective, non-option entry. That closes old gap 6.
- **Not failing, but noted:**
  - An entry with no stop has no risk bound at all (see A-STOP-01).
  - The scan never needs to "hold to Watch" a wide stop, because every plan is reaction-priced at 4 points.
  - The replay's default `entryRule: "stop"` with `usePlanLevels` still pairs an L+3 entry with an L−3 stop, a 6-point risk. This is the known open item on the replay default.

### A-STOP-03: PASS
- **Proving tests:**
  - `reactionEntry.test.ts > prices a bullish/bearish plan ... stopped at the level less 3` (equity and crypto, with no ATR leeway and no S/R re-anchor)
  - `reactionWiring > prices every equity plan at the level plus 1 point with the stop 3 points the other side`
  - `replay-reaction > carries the level, a buy 1 point past it and a stop 3 points the other side`
  - `pointScale.test.ts > gannThreePoints ...` for the price scaling
- **Mutations caught:** W1, W1b, W12, W13, W14 (and M2, M9 and M10 from the first review).
- The replay's stop is `trigger.reactionStop` in both directions, so the W16 gap doesn't touch it.

## Other gaps (correctness)

1. **The cutover is a fixed timestamp, not the deploy time.** `REACTION_LIMIT_CUTOVER = "2026-10-15T19:00:00Z"` (`lib/brokers/simulator.ts:471`).
   - Any advised paper order placed on production after 19:00Z but before this branch deploys is still a buy-stop above the market.
   - Once deployed, it reads as a limit and fills on the first poll, below its trigger, with no crossing.
   - The cutover should be set at merge or deploy time, or the open rows cancelled. Not tied to a single entry.
2. **W15 survives.** `lib/automation/portfolio-manager.ts:313-318`: the pivot-plan branch of the round-number crossed-level check has no test. This is the round-number block, not one of these five rules. Minor.
3. **A person can place an advised order on the side opposite the plan.** The protocol pair still feeds `gannBreakLine`, so `entryStop = levels.stopLoss` arrives with `side` opposite to the plan (`order-ticket.tsx:440`, `place-order.ts:234`). A bearish read of a bullish pair gives a line above the entry, so the order is "ready" at once. This is an edge case for a person's own counter-plan order. Minor.

Known open items, not re-reported: the replay default `"stop"`; entryTrigger dropping a setup whose swing stop is on the wrong side; no gap-through-stop guard on the live Alpaca limit; a slow reaction letting a new 3-Day top replace the level.

---

## Addendum: A-ENTRY-04 re-check at 36a2bb6

Since 070b3c2, `lib/__tests__/replay-reaction.test.ts` runs every test over two fixtures via `describe.each(FIXTURES)`: "a long above an old top" (`fallingHistory`) and "a short below an old bottom". Each fixture first asserts its own direction (`arms in the fixture's direction`), so the long tests can't quietly run on the short branch.

Baseline: full suite 2390/2390 passing; `tsc --noEmit` clean.

| Mutation | Result | Caught by |
|---|---|---|
| W16: long fill condition `live.l <= reactionEntry` changed to `live.h >= reactionEntry` (`replay.ts:809`) | **caught** | long > refuses a gap through the stop line rather than buying it |
| W16b: long fill price `Math.min` changed to `Math.max` (`replay.ts:850`) | **caught** | long > buys the reaction to 1 point past the level ...; long > refuses a gap ... |
| W16c: long crossing counts any close (`replay.ts:806`) | **caught** | long > buys the reaction ...; long > does not buy when price never closed 3 points beyond the level; long > refuses a gap ... |
| W11, W11b, W11c (the short-side regression check) | caught | the same tests on the short fixture |

On the first run of W16b, three place-order tests also failed (in `reactionWiring.test.ts` and `place-order-live.test.ts`). A rerun of W16b on its own did not reproduce them; only the two replay-reaction failures came back. They were flaky under load and are not caused by the mutation.

W16 is caught by a single test, the gap test. That is enough for criterion 3. The "buys the reaction" bar also has its high above the entry, so that test can't tell the two fill conditions apart.

The live-path mutations (W1 to W10, W12, W14) were caught at 070b3c2. The diff since then touches only the replay tests, the ticket's `entryStop` (now sent only on the plan's own side, which closes "other gaps" item 3) and docs/json, so they were not rerun.

**A-ENTRY-04: PASS.** The rule is asserted as Gann wrote it, price-scaled; the tests are green; and every mutation of the live paths and of both replay branches fails a test. The minor note stays: a fill between L−2 and L−3 is just past Gann's "down to 48", inside both the stop and the cap.

After the work: files restored, `git status` clean at 36a2bb6.
