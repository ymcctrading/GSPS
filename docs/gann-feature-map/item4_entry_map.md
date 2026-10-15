# Item 4: where the crossing entry, stop and fill flow

Map made 2026-10-15 by a read-only planning subagent. Line numbers refer to commit 5b42668.

## Gann's rule being built
W006 pp.20, 46-47. Take an old top L. A close at L+3 points crosses it. Buy the reaction from L+1 down to L-2, with the stop at L-3, and never risk more than 5 points. Points are price-scaled by `pointScale.ts`. Shorts are the mirror.

## Change points, in dependency order
1. **`lib/gann/entryTrigger.ts`.** Add `level`, `breakPrice` (L±3), `entryPrice` (L±1) and `stopPrice` (L∓3). Keep `bufferPct`, which the intraday replay passes. `levelBeforeThreePoints` users (`portfolio-manager.ts:308`) must read the stored L instead.
2. **Plan pricing.** These must share one helper:
   - `scanTicker.ts:278-293` and `replay.ts:1152-1187` `priceTradeLevels` build the `EntrySource`, duplicated.
   - In `levels.ts`, the us_equity branch (l.514-544) ignores `pattern.stopPrice` and takes the stop from the S/R band, `computeEquityTradeLevels`.
   - The crypto branch (l.549-558) ATR-clamps `pattern.stopPrice`.
   - Both need stop = L∓3.
3. **trade_plans writer.**
   - `fromScanResult.ts:103-115`: `entryTrigger` = entry and `invalidation` = stop. No column holds L or the break price, so they need a JSON field or a migration.
   - Other readers: `fromPivot.ts`, `review.ts`, `expiry.ts`.
4. **Confirmation (`entryConfirmation.ts`).**
   - Current stages: touch, break (close > trigger), retest (low ≤ trigger), hold (close > retest bar).
   - Gann's stages: break (close ≥ L+3), then fill (low ≤ L+1), or dead (close ≤ L-3 first).
   - Callers: `confirmNow.ts`, `advanceConfirmation.ts` (it builds a degenerate o=h=l=c bar), `place-order.ts:161-197` (an advised order without a plan uses `limitPrice` as the trigger), `lib/backtest/entryConfirmation.ts` and `replayIntraday.ts:255`.
5. **Orders.**
   - Automation and the portfolio manager place a **market** order (`service.ts:271-300`).
   - The ticket, Guided Mode and demo place a limit at `levels.entry`.
   - The simulator gives limits stop-entry semantics (`simulator.ts:462` `isTriggered`), so a reaction limit would fill instantly. It needs true limit semantics for protocol entries.
   - Live Alpaca already rests a true limit (`alpaca.ts:200-232`).
   - `invalidate-pending.ts` cancels on a stop *touch*.
6. **Replay.**
   - The default `entryRule` is "stop": it fills at max(trigger, open).
   - "confirmed" fills at the next open after the state machine is ready.
   - The default stop is the protective swing; `usePlanLevels` takes the plan's.
   - R is measured trigger-to-stop.
   - Gann's version: arm on a close ≥ L+3, fill at min(L+1, open) when low ≤ L+1, dead on a close ≤ L-3, R = 4 points.
7. **Other readers.**
   - criterion copy in `score.ts:145, 484-488`
   - `learning/record.ts:311`
   - the graduation exam answer keys (`graduationExam.ts:176-190`)
   - `breakaway.ts:69` (it should read the break price)
   - `replayIntraday.ts`
   - the `readStopBreach` use in `scanTicker.ts:386`

## Risks
- **Owner decision 4.** Retest-and-hold was adopted on a measured +0.190R. Replacing it needs a fresh replay.
- **Paper and live fill differently today.** Paper fills at market on a limit; live waits for the price.
- **Smaller risk on high-priced stocks.** A stop at L-3 shrinks risk sharply there (about 2.5% at $200), so position sizes grow and `stopRoom` moves.
- **Breach timing.** A breach is a touch, but Gann's "dead" is a close.
- **The degenerate scan bar.** It can't see a wick reaching L+1.

## Live vs replay differences today
- **Entry rule.** The replay defaults to "stop"; live always confirms.
- **Stop.** The replay defaults to the swing stop; live equities use the S/R band and crypto uses the ATR clamp.
- **Fill.** The replay fills at the next open, automation at market, and paper as a stop-entry.
- **Confirmation window.** The replay starts it at the arm date; place-order starts it at `generatedAt`.

## Tests that pin current behaviour
- `entryTrigger.test.ts` and `threePoints.test.ts` (the trigger and stop)
- `lifecycle/__tests__/entryConfirmation.test.ts` and `confirmNow.test.ts`
- `backtest/__tests__/entryConfirmation.test.ts`
- `replay.test.ts` (l.156-227 fills, 268-318 confirmed, 382-401 production stop, 611 plan levels, 668-771 breach)
- `simulator.test.ts` `isTriggered`
- `place-order-stale-bracket.test.ts` and `place-order-live.test.ts`
- `strat.test.ts` `computeTradeLevels`
- `trade-plan.test.ts`, `stopBreach.test.ts` and the lifecycle tests
- automation `service`, `portfolio-manager-e2e` and `stop-out`
- `guided-eligibility.test.ts`, `user-copy.test.ts`, `signal-card.test.tsx`, `order-ticket.test.tsx` and `breakaway.test.ts`

## Copy that needs "buy the reaction" wording
- `signal-card.tsx:31-35, 114, 184`
- `glossary.tsx:27-29, 151-153`
- `order-ticket.tsx:71-78, 528, 635`
- `guided-mode.tsx:127-137` and `guided-card.tsx:153`
- `signal-regime-card.tsx:87`, `ticker-view.tsx:166-171` and `results-table.tsx:139`
- `confirmNow.ts` NOTES
- `score.ts:488` and `weights.ts:97`
- the setupLabel in `scanTicker.ts:291` and `replay.ts:1170`
- `levels.ts` `buildPivotPlan`
- `resend-handler.ts:101-134, 328-346`
