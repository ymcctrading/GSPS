## Temporary overrides — mandatory, check on every session

These are explicit, user-directed departures from the protocol's real design, made for a stated
reason and with a stated revert trigger. Read this section every session. When a trigger fires,
raise it with the user before doing anything else with the affected code — don't silently carry an
override past the point it was supposed to end.

### Equity data delay and notification freshness (2026-10-28, until real-time data is bought)

Owner directives DATA-DELAY-001 and NOTIFY-FRESHNESS-001. Full record and coverage matrix:
`docs/DATA_DELAY_AND_FRESHNESS.md`.

- **Time contract.** `lib/data/timeliness.ts` holds the one definition:
  - a bar's close (the provider stamps the open);
  - usable = max(close + the feed's delay, receipt);
  - a decision reads only what was usable at its evaluation clock;
  - an order fills at the first bar opening at or after the decision.
- **Where it is wired.**
  - The intraday scan filters its input (`usableInput`).
  - Placement and arming read only bars past the delay.
  - The replays fill late and refuse a fill whose stop traded first (`STRATEGY_VERSION` was `2026-10-28-delayed-fill-timing`; merged onto the midday release as `2026-10-28-delayed-fill-on-midday-release`, no new rule).
- **Notifications.**
  - The bell and push read `checkAlertFreshness` at the dispatch clock: actionable, informational or suppressed.
  - Only actionable wording may say "now" or give an arrival time.
  - Queued setup deliveries re-read the member's monitor (`supersededHold`).
  - A new notification path must call the same check.
- **Revert trigger: a verified real-time feed.**
  - It needs both `MARKET_DATA_REALTIME=true` and `MARKET_DATA_REALTIME_VERIFIED_AT`, set by an operator after checking a live trade arrives within seconds.
  - The flag alone reads as delayed.
  - Never set either without the owner's go-ahead.
  - Replays keep the contract's delay whatever the environment.

### Execution timeframe — reverted to 15Min early (2026-09-09 through 2026-09-17)

**Resolved 2026-09-17, project owner direction — reverted early, not via its own trigger.**
`EXECUTION_TIMEFRAME` in `lib/timeframe.ts` was temporarily forced to `"1Hour"` (2026-09-09) instead
of the protocol's real design of `"15Min"`, specifically because the free Alpaca feed's ~15-minute
equity delay makes a 15-minute bar's lag ratio exactly 1.0 — tripping `applyDataLagHold`
(`lib/data/latency.ts`) and holding *every* equity Execute verdict to Watch whenever the market is
open, so a `trade_plan` could never reach `armed` and the Automated Portfolio Manager could never
place a trade. That override's own stated revert trigger was `MARKET_DATA_REALTIME=true` (a paid
real-time feed). **That trigger never fired.** The override was reverted anyway, on the free delayed
feed, because its cost turned out to be worse than the starvation it was solving: setups armed on a
stale 1-hour-delayed bar were arriving with the move already largely played out — see the
2026-09-17 HBAN case (entry $16.77, price already at $15.66, through TP1, by the time the setup
rendered). The project owner's call: a thin-to-empty equity Execute bucket on 15Min (crypto
unaffected — `feedDelayMs` is always 0 for crypto) is an acceptable, understood cost; systematically
stale triggers are not, especially on a novice-facing platform. See `lib/timeframe.ts`'s own header
comment on `EXECUTION_TIMEFRAME` for the full detail — this entry is the historical record, that one
is the live rule.

No new override or revert trigger is standing in its place. If the equity Execute bucket proves too
thin to be useful before real-time data lands, that is a discussion to have with the project owner,
not a reason to silently re-widen `EXECUTION_TIMEFRAME` again — that was tried once already.

### Execute collapse stopgap — RESOLVED 2026-09-23

**Closed, not merely reverted.** The threshold half of this stopgap (`EXECUTE_SCORE_THRESHOLD`
6, `WATCH_SCORE_THRESHOLD` 3.5, `lib/scoring/weights.ts`) was a deliberate, temporary loosening
from the protocol's original 7/4 pair, made 2026-09-14 after all nine scored criteria were
replaced with specific, individually rare Gann technical events and the old bar admitted 0/1061
Execute trades on the committed run and 0 in production. Its own stated revert trigger — the next
fresh, committed backtest run with a non-trivial Execute bucket (n≥30) — fired 2026-09-23 on
`docs/replay-runs/2026-09-23-15Min-2R-within-all-12sym.json` (12-symbol universe, 615
unconditioned trades, captured after PR #274 fixed a replay-only wiring bug that had been zeroing
`entryTriggerArmed`). Execute bucket: 41 trades, +0.362R expectancy, 36.6% win rate, PF 1.87. A
supplementary per-score-band sweep of the same population confirmed the real zero-crossing sits
almost exactly at the existing 6-point cutoff (negative through score 4, turning positive at 5–6).
Re-deriving from this data does not move either number — it confirms them as the platform's actual
thresholds, not a stopgap. `lib/scoring/weights.ts`'s own comment on `EXECUTE_SCORE_THRESHOLD`
carries the full detail now; this entry is the historical record. **Caveat added 2026-09-25:** that run
predates the F3.1–F3.3 replay fix (see "Platform-wide alignment audit"). It
measured the old 15-minute STRAT-candidate trigger, not production's, so
this confirmation needs re-deriving from a fresh run on
`STRATEGY_VERSION` `2026-09-26-continuation-replay` or later.

The two band loosenings (`VOLUME_CLIMAX_THRESHOLD`, `SQUARE_TOLERANCE_BARS`) were already resolved
earlier (reverted and superseded respectively, both same-day 2026-09-14) and the weight-rebalance
half was settled on principle 2026-09-16 (see `DEFAULT_CRITERION_WEIGHTS`'s own doc comment) — all
now confirmed rather than merely carried forward, per the 2026-09-23 run above: `volumeClimax`
273/615 (44.4%) passing, Δ+0.645R; `timePriceSquare` 130/615 (21.1%) passing, Δ+0.111R (positive
for the first time since the ATR-normalization fix). See `lib/gann/volumeClimax.ts` and
`lib/gann/timePriceSquare.ts`'s own header comments.

**Settled 2026-10-28: the `stopRoom` question.** The open item this run raised (quarantined for
saturating 98–99% on the 2026-09-14 runs, in range on the 2026-09-23 run) is moot. `stopRoom` was
retired on 2026-10-16 (owner Q23) and replaced by Gann's own test, the stop 3 points beyond an old
top or bottom (`stopBehindOldLevel`, W006 pp.20-24, 46-47). That test is a check under the nine
pillars, scoring nothing alone. Its registry entry (`criteria-registry.ts`) records it as unmeasured.

**Live weights incident (2026-09-17) — merging is not shipping.** PR #235 merged the uniform
`DEFAULT_CRITERION_WEIGHTS` decision to `main` and deployed clean, and the change was still
**inert in production**. The project owner reported a score of `4.48` on the live site, which is
impossible under uniform weights — every scored criterion is worth exactly one point, so a score
can only be a whole number. `lib/scoring/active-weights.ts` prefers a `learning_models` row
promoted to `status = 'live'` over the code constant, and one had been promoted on 2026-09-16
carrying the very hand-set distribution PR #235 existed to repudiate. `4.48` reconciles exactly
against that row's ten-criterion parse. Three separate things went wrong and each is worth naming:

- **A database row silently outranked the repo.** The decision was merged, deployed and guarded
  by a test, and none of that reached the scan. Code review cannot see this surface.
- **The guard test only covered the constant.** `lib/__tests__/default-weights.test.ts` asserted
  the code default was uniform, which was true and irrelevant. A green test was read as evidence
  about production.
- **The row was already stale, and was being reshaped rather than rejected.** It was proposed
  against ten criteria including `adxTrendStrength`; when that criterion was discarded hours
  later, `parseCriterionWeights` dropped the unknown key and renormalised the remaining nine into
  a distribution nobody had proposed, measured or approved — well-formed, and indistinguishable
  at the call site from one that had been.

Fixed 2026-09-17: the row was demoted to `deprecated` (no live `score_adjustment` row exists
today), `isWeightSetAddressedToCurrentCriteria` in `lib/scoring/active-weights.ts` now rejects and
warns on any stored set whose key set does not match `CRITERION_KEYS` exactly, and
`lib/scoring/__tests__/active-weights.test.ts` guards that path with the real offending row as a
fixture.

**The general rule this yields — check the configuration surface, not just the code.** The
"Cross-platform consistency" principle at the top of this file says a concept must exist on every
surface it applies to. Runtime configuration is one of those surfaces, and it is the one a diff
cannot show you. Before reporting any constant, threshold, weight or flag as live, check whether
something outside the repo overrides it. Known override surfaces as of 2026-09-17:

- `learning_models` (`status = 'live'`) — overrides `DEFAULT_CRITERION_WEIGHTS` via
  `lib/scoring/active-weights.ts`. Guarded as above.
- `lib/risk/policy.ts` — `getRiskPolicy(supabase)` / `setRiskPolicyValue()` resolve risk policy
  from the database over `DEFAULT_RISK_POLICY_VALUES`. A row may only tighten a limit (Q13). Production
  held no `policy_values` row on 2026-10-28.
- Environment variables — the confluence modules read `GSPS_DISABLE_GANN_CONFLUENCE` /
  `GSPS_DISABLE_SARA_CONFLUENCE` (`lib/signals/confluence/flags.ts`), and `MARKET_DATA_REALTIME`
  carries a mandatory revert trigger above. Checked 2026-10-28 against the Vercel project's env list:
  none of the three is set in any environment, so both confluence modules run and the feed reads as
  delayed, as the code defaults intend. `learning_models` held no `live` row the same day.

The list is a starting point, not an inventory. Re-derive it rather than trusting it.

