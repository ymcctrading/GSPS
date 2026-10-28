# Equity data delay and notification freshness

Owner directives of 2026-10-28: DATA-DELAY-001, the platform-wide delay
directive, and NOTIFY-FRESHNESS-001. These hold until a real-time equity feed
is purchased, configured and verified (see "Live-feed transition" below).

## The contract (`lib/data/timeliness.ts`)

The facts are kept separate and resolved on the server, never from a chart,
a client, a tier or an unverified env flag.

- **Entitlement** (`resolveFeedPolicy`):
  - Alpaca equities: `delayed`, 15 minutes.
  - Crypto: `realtime`, 0.
  - Synthetic data: `unavailable`, 0.
  - Any other source: `unknown`, read as delayed.
- **Candle semantics** (`barCloseAt`):
  - The provider stamps a bar with its open, so the close is derived.
  - A bar is clipped to the session close: the 3:30 PM hour ends at 4:00 PM, and at 1:00 PM on an early close.
  - A daily bar closes at its session's close.
- **Availability** (`availability`, `usableBy`):
  - modeled = close + delay; usable = max(modeled, received).
  - An observation is eligible only when usable <= evaluatedAt.
- **Age** (`observationAgeMs`): null when unknown, never 0.
- **Execution** (`delayedFillIndex`): a bar-based fill goes at the first bar opening at or after the decision's usable time. That is an approximation, since a real order fills at a price inside the bar.
  - A decision read in session that lands after the close fills at the next regular open, never on an extended-hours bar.
  - The series' bar length is read once over the whole series (`seriesSpacingMinutes`), so a thin symbol's skipped bars don't pass for its length.
- **The delay is applied once.**
  - The live intraday route still fetches with `end = now - 16 min`, which is the feed's limit, not a second delay.
  - The scan filters by availability against the evaluation clock.
  - Approach timing subtracts the data age once, from the bar close.

Worked example: the 9:30-9:45 ET candle is usable at 10:00:00, or at 10:00:08
if it was received then. A scan at 10:06 is evaluated at 10:06 and reads it.
The 9:45-10:00 candle is not usable until 10:15.

## Notification freshness (`lib/notifications/freshness.ts`)

`checkNotificationFreshness(evidence, dispatchAt)` returns the owner's
`NotificationFreshnessResult`. `checkAlertFreshness(alert, dispatchAt)` reads
the timing the scan recorded on the alert (`Alert.timeliness`). The steps run
in this order:

1. **Permission.** Delivery not permitted means suppress. Tier, channel, quiet hours and budgets stay their own gates. This field only records them.
2. **Provenance.** Missing or invalid timestamps, a negative delay, or an evaluation after dispatch all mean suppress (`invalid_provenance`).
3. **Availability.** Data that was not usable at evaluation means suppress (`unavailable_at_evaluation`).
4. **Supersession.** A plan that was replaced since the alert means suppress, even for a protective warning (`superseded_plan`).
5. **Protective warnings.** These are never suppressed for want of an entry authorization or for age. They are informational at worst.
6. **Expiry.** An alert dispatched more than one scan cadence (15 minutes) after evaluation means suppress (`expired_notification`).
7. **Actionability.**
   - An upstream hold gives `entry_held`. Today that is a measured-losing signal or a first target that doesn't pay the risk.
   - A feed that is not real-time gives `delayed_observation`.
   - A missing or mismatched authorization (symbol or plan) gives `actionability_unverified`.
   - A real-time observation older than a bar at dispatch gives `authorization_expired`.
   - So does one whose bars a newer bar has since followed (`structureAsOf`, `newerBarUsable`): a current quote over stale bars is not a current decision. The scan withholds the authorization the same way.
   - Only what is left is `actionable`.

The formatter (`buildIntradayBellRow(alert, freshness)`) is given the
disposition and cannot raise it. Titles never change with it, because
deduplication and the digest read them. Only actionable wording may say "now",
give an arrival time or read as a call to act.

## Messages, before and after (delayed equity feed)

| Notice | Before | After |
|---|---|---|
| At the plan's entry | "Price is at the entry now (price 501.20). Daily plan: …" | "Delayed observation: price reached the entry in the 10:15–10:30 AM ET candle. Equity data is delayed by 15 minutes. Current entry status has not been verified. Daily plan: … Open the plan to see where price is before acting." |
| Nearing the plan's entry | "About 5 minutes away at the current pace (price 504.00). …" | "Based on data through 10:30 AM ET, price was moving toward the entry. This is an estimate from delayed observations, not a live arrival time. Equity data is delayed by 15 minutes. Daily plan: …" |
| Intraday signal | "Price 770.00, stop 760.00, TP1 790.00. Timing for a daily plan; …" | "Based on data through 10:30 AM ET: Price 770.00, stop 760.00, TP1 790.00. Equity data is delayed by 15 minutes. Current status has not been verified. Timing for a daily plan; …" |
| Panel, at the entry | "Price is at the plan's entry, 501.00. …" | "Price traded to the plan's entry, 501.00, in data through 10:30 AM ET. The data is delayed, so where price is now has not been verified. …" |
| Price alert | "TSLA fell below your alert level of $200.00. Last price checked: $199.00." | Same, then "Equity prices are delayed by 15 minutes." |

On a verified real-time feed with a current authorization, the actionable
wording ("Price is at the entry now", "About 5 minutes away") is unchanged.

## Coverage matrix

Statuses: IMPLEMENTED (wired in code), TESTED (a test fails if it is removed),
INTENTIONAL EXCEPTION (with the reason), UNVERIFIED (not proven here).

| Surface | Status | Where |
|---|---|---|
| Intraday scan: bars, recent bars and quote | IMPLEMENTED, TESTED | `scanIntraday` → `usableInput`; `lib/scanner/__tests__/noLookAhead.test.ts` (changing unusable bars on one symbol or another changes nothing) |
| Intraday scan: a fresh quote over stale bars | IMPLEMENTED, TESTED | `alertTimeliness` records `structureAsOf` (the last bar's close) apart from `dataAsOf` (which a quote may set); no authorization while a newer bar was usable and unread. Checked again at dispatch. `noLookAhead.test.ts`, `freshness.test.ts`, `freshnessDelivery.test.ts` 7b |
| Intraday scan: alert provenance | IMPLEMENTED, TESTED | `alertTimeliness` (data as of, usable, evaluated, age, lag hold, authorization only when real-time and usable) |
| Intraday route: evaluation clock, receipt, feed | IMPLEMENTED | `app/api/intraday-scan/route.ts` (`scanIntraday(..., new Date())` after the fetch; `receivedAt` per batch; `resolveFeedPolicy`) |
| Daily scan verdict (Execute while prices move) | IMPLEMENTED (already) | `applyDataLagHold` in `lib/scanTicker.ts`; plans read at the last completed session's close |
| Discovery, trend, swing, levels, volume baselines | IMPLEMENTED | Daily and longer timeframes read completed sessions. Intraday ones go through `usableInput`. |
| Cross-symbol and group inputs | IMPLEMENTED | Universe and group ranks read completed months only (`universeStrength.ts`). The intraday scan has no cross-symbol intraday input (tested). |
| Placement confirmation (manual, Guided, automation) | IMPLEMENTED, TESTED | `confirmNow.ts`: readiness reads closed bars past the delay (`closedSessionBars(..., delayMs)`). The stop and dead checks read every closed bar received, so a close through the stop inside the delay still ends the entry. Tested in `closedSessionBarsDelay.test.ts` and `confirmNowDelayStop.test.ts`. |
| Plan arming (portfolio manager) | IMPLEMENTED | `armFromBars.ts`: arming reads bars past the delay |
| Stop-breach and plan-expiry checks before arming | INTENTIONAL EXCEPTION | These read every bar received. A protective retirement should never wait on the delay, because it can only remove risk. |
| Paper and live exit managers (stops, Gann exits) | INTENTIONAL EXCEPTION | Protective. They act on the freshest data received, and the stop fills at the market quote. Delaying a stop would add risk. |
| Daily replay | IMPLEMENTED, TESTED | `replay.ts` fills via `delayedFillIndex` (unchanged on daily bars). A stop before the fill refuses it (`delayedRefusals`). Re-buys and reversals wait the same way. |
| Intraday replays (profile, alerts) | IMPLEMENTED, TESTED | `replayIntraday.ts`, `replayIntradayAlerts.ts` (evaluated at close + delay; fill at the first bar after) |
| Forward test (shadow signals) | IMPLEMENTED, TESTED | `walkShadowTrade` fills via `delayedFillIndex` on the 15-minute bars, and a stop traded while the order waited refuses the fill (`retired`), as the replay does. Added 2026-10-28 (cross-surface check of #518); it had filled at the next bar's open. `lib/shadow/__tests__/evaluate.test.ts` |
| Resting stop-entry ("stop" rule) in the replay | INTENTIONAL EXCEPTION | Held by the broker, so it fills when price trades there, with no decision lag |
| Bell (intraday) | IMPLEMENTED, TESTED | `recordIntradayBells`: freshness at each member's dispatch, suppress = no row |
| Push (intraday) | IMPLEMENTED, TESTED | `notifySubscribedUsers`: freshness at each send; suppress = no send and no log; log stamped at dispatch |
| Email (intraday) | N/A | Removed by #502 and not brought back |
| Approach and entry-reached notices | IMPLEMENTED, TESTED | Same path as bell and push. Wording from the disposition. On delayed data the panel wording gives no arrival time. |
| Panel's trade link | IMPLEMENTED, TESTED | On delayed data the panel shows "Review in the ticket (delayed data)", not "Trade this". The person still chooses; the platform guides and doesn't force. This also covers stored alerts with no timing for equities. Tested in `intraday-alerts.test.tsx`. |
| Reversal-risk warning | IMPLEMENTED, TESTED | Protective: informational at worst, never suppressed for want of authorization. |
| Superseded plan on bell and push | INTENTIONAL EXCEPTION | These are dispatched in the same run that computed the alert, with no queue, so the plan cannot change in between. `currentPlanKey` is checked for queued deliveries (`supersededHold`). |
| Execute/Watch and invalidation deliveries (queued, retried) | IMPLEMENTED, TESTED | `dispatchNotificationDelivery` → `supersededHold` (the monitor moved on means skipped; an invalidation is never held). The Execute verdict itself already passed `applyDataLagHold`. |
| Price alerts (bell, push, email) | IMPLEMENTED, TESTED | Wording states the equity delay. The alert fires on the latest received quote, which is the member's own threshold, not a platform decision. |
| Evening report, trade-journal email, digests | INTENTIONAL EXCEPTION | They run after the close on completed sessions, so the delay has passed. Digests read bell rows, which carry the new wording. |
| Evening recap's setup judgement | IMPLEMENTED, TESTED | `judgeDailySetup` fills a setup through `delayedFillIndex` on the session's 15-minute bars, and a stop traded while the order waited calls it off (`stop_while_waiting`), as the replay refuses it. Added 2026-10-28; it had filled at the next bar's open. An intraday signal is taken at the first bar after the member received it, which already carries the delay. `lib/reports/__tests__/eveningReport.test.ts` |
| Automation notices | IMPLEMENTED | Automation places through `confirmNow`, which is covered above. It sends no intraday notice of its own. |
| Queue and retry expiry | IMPLEMENTED, TESTED | Intraday: no queue; each send is checked at its own clock. Deliveries: the existing 6-hour session limit plus `supersededHold`. |
| Paper fill price of a person's market order | UNVERIFIED | Fills at the latest received quote, which is delayed for equities. It is a person's own order and was not changed here. |
| Symbol page chart and quote | UNVERIFIED | Display only. The chart reads the provider's bars as received. Labelling the delay on the chart was not changed here. |

## Live-feed transition

1. Buy and configure the real-time equity feed (owner's approval).
2. An operator confirms that a live trade arrives within seconds, then sets `MARKET_DATA_REALTIME=true` and `MARKET_DATA_REALTIME_VERIFIED_AT=<ISO time of that check>`.
3. `realtimeState()` reads "verified":
   - `resolveFeedPolicy` returns real-time with no delay.
   - `feedDelayMs` is 0.
   - The scan's alerts can carry an authorization, and notifications can be actionable.

`MARKET_DATA_REALTIME=true` alone reads as declared but unverified, which means delayed.
Historical replays keep the contract's delay (`replayFeedDelayMs`) whatever the
environment, so old runs stay comparable. Real stale-data protection
(`staleUnderRealtime`, more than a bar old) stays after the transition.

Nothing in this change sets either variable.

## Safeguards kept

None of these were removed:
- the data-lag hold
- stop-loss and capital and risk controls
- entry confirmation
- plan invalidation and expiry
- instrument restrictions
- member and channel permissions
- the measured-losing hold

## Known limits (from the review)

- Bell deduplication and the digest read the bell row's title (pre-existing). Titles never change with the disposition, and a test holds that, but a structured signal key on the row would need a migration and is not in this change.
- Across a session break, `newerBarUsable` reads the overnight gap as missed bars, so a real-time authorization waits for the session's first bar. Conservative, and moot while equities are delayed.

- The live intraday route still fetches with `end = now - 16 min` (the feed's limit), so the scan runs about a minute behind what the contract allows.
- The route evaluates the scan at its own clock after the fetch. The focus-list invalidation and other helpers still read the request's start time.
- A signal near the end of a replay's data, with no bar left to fill on, counts under `refusedFills` and `delayedRefusals`.
- If two open monitors ever exist for one symbol, `supersededHold` cannot read a single state and lets the send through, with a log line. The database's unique index prevents that case.
