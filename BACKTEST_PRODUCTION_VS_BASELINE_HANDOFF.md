# Handoff: close the audit, re-measure, then decide the platform's entry rules

Repository: `ymcctrading/GSPS`. Written 2026-09-26. Phase: Q1 (Aug–Oct 2026). This work is
out-of-phase and was requested directly by the project owner, so mark every PR `N/A`.

**The goal.** Determine whether production's entry rules or the current baseline is the more
proficient system to run platform-wide, including the Automated Portfolio Manager (APM). Then
re-derive the score cutoffs from evidence that actually describes production.

**The order is the owner's decision (2026-09-26): fix the known audit bugs first, measure second,
tune last.** Don't tweak thresholds, stops or criteria before Phases 1 and 2 are done.

## 0. Mandates. Read this section first. It is not optional.

1. **Read `AGENTS.md` and `CLAUDE.md` in full before doing anything.** They are long, and every
   section applies. In particular:
   - Cross-platform consistency
   - WD Gann precedence
   - Gann-grounded platform, including the mandatory sweep
   - Gann-derived AND measured
   - The scorecard's role
   - Hermetic principles & cycle theory
   - The Three-question mandate
   - Cycles as architecture
   - Temporary overrides
   - The Live weights incident
   - Deployment and Git/PR workflow
   - The **"Platform-wide alignment audit (2026-09-25)"** entry under *Audit outcomes*. It records
     which findings are resolved and which are open.
2. **Three-question mandate: apply it while designing, not afterwards.** Before designing a fix, the
   experiment or the diagnosis, answer all three in writing:
   - Gann source and tier.
   - Dewey's seven-item checklist: say which items you cleared and which you didn't.
   - Which Hermetic principle or principles fit. Read all seven first and say why the others don't
     fit.

   Put the answers in each PR description and in the header of any module you change. Don't default
   to Polarity or Rhythm out of habit. Work with no product-facing shape is exempt, but say so
   explicitly.
3. **Accuracy over speed, always.** Two errors in an earlier session came from stating things as
   verified after checking an adjacent file. A third came from this handoff's own history: the
   production stop was described as "widened" when it is a cap.
   - Trace every claim to its real consumer or call path, with file:line evidence.
   - Re-verify every status line below against current `main` before acting on it.
   - Don't trust this prompt either.
4. **Check the runtime configuration surface, not just code.** A `learning_models` row, a
   `policy_values` row or an env var can override a code constant. Check them before reporting any
   number as production behaviour.
5. **Production-behaviour changes need the owner's sign-off.** That covers anything touching live
   scanning, order placement, the APM, risk, thresholds or user-facing verdicts.
   - Section 1 marks which fixes are pre-approved and which need a decision. Ask the owner the
     decision questions at the **start**, with your recommendation, before building those items.
   - Don't merge to `main` unless the owner asks. Merging deploys to production.
   - Open a PR after pushing, following the template and naming the phase.
   - Delete the branch after it merges.
6. **Settled decisions you must not revert:**
   - Don't move the entry trigger back to STRAT. It moved to `lib/gann/entryTrigger.ts` on
     2026-09-17.
   - Don't shorten Gann's swing counts.
   - Don't re-widen `EXECUTION_TIMEFRAME`.
   - Don't fix a thin Execute bucket by loosening a rule. Thresholds are display decisions,
     re-derived from measurement.
7. **Measurement is a debugging tool aimed at our own translation, not a verdict on Gann.** If a
   Gann-derived criterion measures negative, presume a porting defect on our side first. Check
   gate 1 (is it actually Gann-derived?) before hunting.

## Status as of 2026-09-26 — verify each line

**Resolved on `main` by other sessions. Verify these; don't redo them.**

- **F3.1–F3.3** (PR #290, `c113f6a`).
  - The replay arms exactly as the live scan does, via `lib/scan/entrySelection.ts`: the daily-bar
    Gann trigger, the macro-derived direction, no STRAT candidate gate, and no gap rule or risk floor
    on the trigger.
  - `STRATEGY_VERSION` is `2026-09-25-live-trigger-replay`.
  - Every committed run before it, including the one behind the 6/3.5 cutoffs, needs re-deriving.
- **F3.5** (`3d379d5`, PR #289). `placeLiveOrder` now enforces `checkPositionLimits`.
- **F4.4 / F7.6.** The 2026-09-03 `compliance_signoffs` row for `autonomous_live_trading` was
  revoked in production, so autonomous live trading is not authorised.

**In PR #294 (`claude/jolly-gauss-k1ky1w`, added 2026-09-26). If it has merged, treat these as
done and verify them; if not, don't duplicate them.**

- **Replay coverage.** Continuation setups are replayed, gated as `runMarketScan` gates them. A
  session arms on the scan's own 30-bar minimum. `STRATEGY_VERSION` is
  `2026-09-26-continuation-replay`.
- **Phase 1 "port `requireEntryConfirmation`": done, under a different name.** Use
  `ReplayOptions.entryRule: "stop" | "confirmed"`. `"confirmed"` drives
  `advanceEntryConfirmation` bar by bar and fills at the next open. Don't port the old branch's
  option as well.
- **Phase 1 F1.3: done.** For both entry rules the bracket is fixed from the trigger, as
  `deriveOrderInputFromPlan` attaches it: stop, risk and target. R is measured on the plan's risk,
  and gross P&L on the actual fill distance. Fills at or beyond the stop or target are dropped and
  counted in `refusedFills`, which is also in the report. F1.2 (the production TP1 target), F1.5
  (de-duplication) and F1.4 (confirmation cadence) are **not** done.
- **F2.5: done, and wider than scoped here.** The project owner delegated the call.
  - `readTrend`, the core macro trend read, uses Gann's confirmed swing trend instead of SMA 20/50.
  - The coarse gates measure from the range's 50% point.
  - The regime engine no longer uses MAs or VWAP.
  - The mandatory sweep regex covers SMA/EMA/VWAP.
  - AGENTS.md records the two new open findings: VWAP in `lib/scanner/intraday.ts`, and
    `hasTradePlan` requiring a STRAT pattern.
- **F3.4: a current decision is recorded, and Phase 4 may revise it on evidence.** Unattended
  execution requires confirmation. Human orders (the ticket, Guided) and the demo use the stop
  entry. **Early evidence against that decision.** Run 36212431397 used the pre-F1.3 bracket
  semantics, the production stop, all trades and 766 symbols:
  - `stop`: −0.208R (n=898); Execute −0.468R (n=96).
  - `confirmed`: +0.073R (n=581); Execute +0.194R (n=70).
  - Confirmed minus stop, all trades: +0.28R, CI [+0.13, +0.43].
  - Re-check on the corrected run before acting on it.

**Tooling that exists and works.**

- The workflow "Universe backtest (manual)" (`.github/workflows/backtest-universe.yml` →
  `scripts/backtest-universe.mjs`).
  - It runs the harness over the full universe in one job, fetching each symbol once and replaying
    every cell on the same bars.
  - It reports bootstrap CIs, time-half splits and cell-vs-cell difference CIs.
  - It refuses synthetic data, and warns when an option isn't implemented on the ref.
  - The `ALPACA_API_KEY` and `ALPACA_API_SECRET` repository secrets are set.
  - A full large-cap run (766 symbols) takes about 26 minutes at 30 symbols a minute. Keep the pace
    at 30 or below in market hours, because the live scans share the Alpaca account.
  - Trigger it with the GitHub MCP `actions_run_trigger` tool, or ask the owner. Read results from
    the "Print results" step log, between the `=== BEGIN/END ===` markers.

**Pre-fix baseline (evidence about the old harness only).** `docs/replay-runs/2026-09-25-*766sym*`
comes from workflow run 36172939410 on `main@f67575d`, before PR #290. Read
`docs/replay-runs/2026-09-25-766sym-NOTES.md`.

| Execute, n=1,444 | Expectancy [95% CI] |
|---|---|
| `raw` (structural swing stop) | +0.124R [+0.055, +0.192] |
| `prodstop` (production stop) | +0.020R [−0.053, +0.093]; Watch +0.092R, Reject +0.149R |

- The 12-symbol +0.362R headline was mostly a small-sample artefact.
- Under the production stop, the score's ranking inverted.
- **Production stop = `computeStopWithLeeway` (`lib/strat/levels.ts`).** It adds a small ATR leeway,
  then **caps** the stop at 2.5× the 15-minute ATR (3.5× for large caps). In the baseline that made
  the stop tighter for most Execute trades, and mean hold fell from 76.6 bars to 21.2.

## 1. Phase 1: close the open audit findings

Work in small PRs off a fresh `main`, one theme each.

### Pre-approved: build these without asking

- **Port `requireEntryConfirmation` onto the new replay.**
  - It exists only on `claude/great-brown-h6hops`, which now conflicts with `main` in `replay.ts`
    and `run.ts`. Don't merge or rewrite that branch; port the option onto a fresh branch.
  - Keep what it got right: stop, risk and target are fixed from the original trigger, and gross P&L
    uses the actual price distance. That matches `deriveOrderInputFromPlan`.
- **F1.2: target.**
  - The replay targets `trigger + targetR × risk`. Production attaches the plan's structural
    `takeProfit1`. See `lib/lifecycle/fromScanResult.ts` and
    `lib/automation/service.ts#deriveOrderInputFromPlan`.
  - Add a production-target option that models TP1 exactly as `computeTradeLevels` prices it.
  - Label the targetR variant as non-production.
- **F1.3: fills past the bracket.**
  - Production refuses a fill beyond its stop or target (`fill_outran_bracket`, 409, in
    `lib/trade/place-order.ts`).
  - The replay must drop those trades, not count them, and report how many it refused.
  - Check the new gap-fill-at-open path too: a gap past the trigger can also land past the target.
- **F1.5: duplicates.**
  - One setup can arm, or confirm, on several consecutive bars.
  - Production de-duplicates through `signalFingerprint`. De-duplicate by (symbol, trigger level,
    fill or confirmation bar).
- **F1.4: confirmation cadence.**
  - Production advances confirmation once per scan pass. It builds a flat bar from `currentPrice`,
    only for symbols in that pass's visible set, and expires plans on wall-clock time.
  - Either model that, or document the replay's confirmation rate as an upper bound.
- **F4.3: `policy_values` overrides have no bounds.** Add per-key sanity bounds to
  `lib/policy/store.ts#getPolicyOverrides`, rejecting and logging out-of-range values. Today the table
  has no rows, so this changes nothing live.
- **Tests for every fix.** Fixtures need real price reversals: flat bars arm nothing under the Gann
  trigger.

### Needs the owner's decision first: ask at the start, with your recommendation

- **F2.5: SMA 20/50 and anchored VWAP in the Signal & Regime Engine.**
  - Where: `lib/signals/regime.ts` and `lib/signals/states/trendPullback.ts`.
  - They feed user-facing tier and "Tradeable" labels and trade-plan expiry.
  - Recommend replacing them with swing-chart structure (`lib/gann/trendStrength.ts`), per "WD Gann
    precedence", or recording an explicit exception.
  - Also extend AGENTS.md's mandatory sweep regex to match `SMA`, `EMA` and `VWAP`.
- **F3.7: pre-entry stop breach.** A plan in `awaiting_entry_confirmation` is never invalidated when
  price trades through its stop (`lib/lifecycle/transitions.ts`). Recommend adding pre-entry
  invalidation, in both production and the replay.
- **F4.2: weight promotion.** The weight-promotion path can still promote non-uniform weights, against
  "weighting is substance". Recommend blocking non-uniform promotion unless a citable
  cross-criterion ranking exists.
- **F1.7: universe coverage.** Being in `FALLBACK_UNIVERSE` doesn't mean being scanned. Check
  migration `0082_coarse_gate_telemetry_cycle_columns.sql` and coarse telemetry first: another
  session may already be on this.
- **F7.1: PR #285, `macroCycle` (unmerged).** Its projections stop at 1989, so it can never be active
  today. Recommend fixing it or closing the PR.
- **Leave F3.4 until Phase 4.** Whether Guided execute, demo auto-trade and the manual ticket must
  pass entry confirmation depends on the result of Phase 2, so don't decide it before then.

## 2. Phase 2: one production-faithful run (pre-register it)

Write the design and decision rule into the PR description **before** running. Run on
`STRATEGY_VERSION` `2026-09-25-live-trigger-replay` with the Phase 1 fixes. Use `universe:
large-cap` as the primary run; `mega-12` and `diversified` are sanity checks only.

**Cells**, all with refused fills dropped and duplicates removed:

1. `raw`: the structural swing stop, and no confirmation.
2. `prodstop`: the production stop, and no confirmation. This is the baseline.
3. `confirmed`: the production stop, plus the full confirmation sequence. This is production.
4. The same three cells with the **production TP1 target**, if F1.2 lands as a separate option.

**The stop-cap question is answered by `raw` vs `prodstop` in this run.** In the pre-fix baseline,
the cap cost Execute −0.103R (CI −0.202 to −0.002), but it improved the overall result: +0.042R, CI
+0.020 to +0.065. It also improved Reject (+0.070 to +0.149R). Watch moved +0.020R, within noise. So there is **no evidence yet that the cap limits profitable trades.** The baseline measured
the old trigger, used a targetR target that moves with the stop, and counted refused fills.

- Compare the cells in R. Production sizes positions from a dollar risk, so R is the right unit.
- Report both the per-bucket results and the ATR-band table.
- Don't propose changing the cap unless the post-fix run shows `raw` beating `prodstop` on Execute
  with separated CIs, stable across both halves, **and** with the production TP1 target.

**Report**, for every cell:

- n, expectancy with a 95% CI, win rate, profit factor and max drawdown in R;
- Execute, Watch, Reject and all trades;
- a per-score-band sweep;
- both time halves;
- the refused-fill count, the confirmation rate and the expiry rate;
- the factor table.

**Commit the run** to `docs/replay-runs/` with a NOTES file (see the 2026-09-25 one as the model).

## 3. Phase 3: diagnose `stopRoom` and the four negative Gann criteria

Only on the Phase 2 data. Don't diagnose from the pre-fix baseline.

**`stopRoom`** was the strongest positive in the baseline: +0.358R under the production stop, but
only +0.052R under `raw`.

- What it measures, for equities: whether the plan's stop is anchored to a real nearby structural
  level rather than a fixed fallback percentage (`levels.stopFromStructure`,
  `lib/strat/levels.ts#computeEquityTradeLevels`). See its registry entry
  (`lib/validation/criteria-registry.ts`), which is quarantined for near-saturation and has a
  2026-09-15 fix history.
- The leading hypothesis to test is an **interaction, not an edge**. When no structure is near
  (fail, n=134), a tight capped stop sits in noise and gets hit, at −0.305R. With the wider raw stop,
  the same trades are barely worse.
- Test it by comparing `stopRoom`'s delta across `raw`, `prodstop` and `confirmed`, and by
  cross-tabbing it against the ATR bands.
- Check gate 1 too. The registry records its provenance, so establish whether it is a Gann-derived
  criterion or a risk-hygiene one before treating it as confirming the method.

**`ruleOfThree`, `swingChartTrend`, `volumeClimax` and `historicalSR`** were negative inside Execute
under the production stop in the baseline.

1. First, check whether they are still negative on the Phase 2 run. All four are daily-chart
   concepts, and the baseline measured them against the old 15-minute trigger.
2. If one still inverts, trace its translation end to end, with file:line evidence. The code starts
   in `lib/scoring/score.ts` (around lines 240–360) and `lib/gann/*`. Check:
   - the bars it reads;
   - its look-ahead guard in the replay: prior sessions only;
   - the anchor it uses;
   - its direction convention. It's scored in the trade's direction: support for longs, low anchors
     for longs, higher closes for bullish.
   - whether the scan and the replay compute it identically;
   - whether its Gann source (`docs/GANN_HISTORICAL_SOURCES.md`) supports the setup kind being
     scored. Most live setups are *reversions* of the macro move, and a trend-confirmation rule may
     be being applied to a counter-trend entry.
3. Report each as one of: **translation defect found** (with the fix), **no defect found**, or
   **inconclusive** (with the sample needed).
4. Fixes are Phase 1-style PRs, owner-approved, followed by a re-run. Don't reweight or drop a
   criterion to make the numbers better.

## 4. Phase 4: decide (pre-registered rule; adjust only with written justification)

- **Recommend keeping production's confirmation rule platform-wide** if `confirmed`'s Execute CI lies
  above 0 on the full universe, *or* if it isn't significantly worse than `prodstop`.
- **Recommend the owner consider changing production's rule** only if `prodstop` beats `confirmed`
  with separated CIs on the full universe **and** the result is stable across both halves. Any change
  must stay Gann-grounded: the confirmation buffer is cited to the "3-point rule". Write it as a
  proposal. Don't implement it.
- **If no cell's Execute CI clears 0,** say so plainly. That points at the translation (Phase 3) or
  the thresholds, not at the entry model. Re-derive the 6/3.5 cutoffs (`lib/scoring/weights.ts`) from
  the per-score-band sweep, as a proposal.
- **Then settle F3.4.** Whichever model wins must hold on every surface where a plan can be entered:
  - the live scan and trade plans;
  - the APM and plan-scoped automation, which act only on `armed` plans;
  - Guided execute;
  - demo auto-trade;
  - the manual ticket.

  Recommend aligning them, or recording an explicit, justified exception.
- **Also flag** that `lib/promotion/trackRecordPolicy.ts` cites +0.362R as its Wall Street ceiling.
  That number came from the superseded 12-symbol run.

## 5. Deliverables

1. Phase 1 PRs: fixes, tests and the three-question answers.
2. Committed run files and a NOTES file for every run that counts.
3. A report covering:
   - the per-cell tables with CIs;
   - the stop-cap answer;
   - each criterion's Phase 3 verdict;
   - the Phase 4 recommendation and what it means for the APM;
   - honest coverage: what was fully done, partially done, or not done.
4. A dated addendum under *Audit outcomes* in `AGENTS.md` recording what closed and what the run
   showed, so it isn't re-litigated.
5. A list of production changes awaiting the owner's sign-off. Nothing ships without it.
