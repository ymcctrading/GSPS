# Handoff: Production entry rules vs. baseline — which system should GSPS run platform-wide?

Repository: `ymcctrading/GSPS`. Today is 2026-09-25 or later. Phase: Q1 (Aug–Oct 2026). This task is
out-of-phase and was requested directly by the project owner, so mark the PR `N/A`.

## 0. Mandates. Read this section first. It is not optional.

1. **Read `AGENTS.md` and `CLAUDE.md` in full before doing anything.** They are long, and every section
   applies. In particular:
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
   - The **"Platform-wide alignment audit (2026-09-25)"** entry under *Audit outcomes*. It lists the
     findings this task builds on.
2. **Three-question mandate: apply it while designing, not afterwards.** Before you design the
   experiment or change the harness, answer all three questions in writing: Gann source and tier;
   Dewey's seven-item checklist, stating which items you cleared and which you didn't; and which
   Hermetic principle or principles fit. Read all seven principles first and say why the others don't
   fit. Put the answers in the PR description and in the header of any module you change. Don't
   default to Polarity or Rhythm out of habit.
3. **Accuracy over speed, always.** Two errors in the prior session came from stating things as
   verified after checking an adjacent file. Trace every claim to its real consumer or call path, and
   give file:line evidence. Re-verify every finding listed below against current `main` before you act
   on it. Don't trust this prompt either.
4. **Check the runtime configuration surface, not just code.** A `learning_models` row, a
   `policy_values` row or an env var can override a code constant. Check them before reporting any
   number as production behaviour.
5. **Don't change production behaviour.** This task changes the backtest harness only. Anything that
   alters live scanning, order placement, the Automated Portfolio Manager (APM), risk or thresholds is
   a *recommendation* for the project owner's sign-off, never a drive-by edit.
   - Don't merge to `main` unless the owner asks. Merging deploys to production.
   - Open a PR after pushing, following the template and naming the phase.
   - Delete the branch after it merges.
6. **Settled decisions you must not revert:**
   - Don't move the entry trigger back to STRAT. It moved to `lib/gann/entryTrigger.ts` on 2026-09-17.
   - Don't shorten Gann's swing counts.
   - Don't re-widen `EXECUTION_TIMEFRAME`.
   - Don't fix a thin Execute bucket by loosening a rule. Thresholds are display decisions, and are
     re-derived from measurement.
7. **Measurement is a debugging tool aimed at our own translation, not a verdict on Gann.** If a
   Gann-derived component measures negative, suspect a porting defect first.

## Status as of 2026-09-26 (read before section 1)

Re-verify every line of this section against current `main`.

- **F3.1–F3.3 are fixed on `main`** (PR #290, commit `c113f6a`).
  - The replay now arms exactly as the live scan does, through `lib/scan/entrySelection.ts`: the
    daily-bar Gann trigger, the macro-derived direction, no STRAT candidate gate, and no gap rule or
    risk floor on the trigger.
  - It fills the resting stop order on 15-minute bars, at the open when a bar gaps past it.
  - `STRATEGY_VERSION` is now `2026-09-25-live-trigger-replay`.
  - Per AGENTS.md, every committed run since 2026-09-17, including the one behind the 6/3.5 cutoffs,
    needs re-deriving on this version.
  - Your job on these three findings is to **verify** the fix, not redo it.
- **The confirmation option is stranded.** `requireEntryConfirmation` lives only on
  `claude/great-brown-h6hops`, and that branch now **conflicts with `main`** in
  `lib/backtest/replay.ts` and `lib/backtest/run.ts`. Port the option onto the new replay, on a
  fresh branch from `main`, rather than merging the old branch. Keep what that branch got right:
  - stop, risk and target fixed from the original trigger;
  - gross P&L from the actual price distance.
- **The full-universe runner exists and works.**
  - Workflow: "Universe backtest (manual)" (`.github/workflows/backtest-universe.yml`).
  - The `ALPACA_API_KEY` and `ALPACA_API_SECRET` repository secrets are set.
  - A `mega-12` smoke test (run 36172659557) reproduced the committed
    2026-09-23 run to within window drift.
- **The first full-universe run is committed, and it's a pre-fix baseline.** It covers 766 of 766
  symbols, ran on `main@f67575d` (the old harness) as workflow run 36172939410, and is in
  `docs/replay-runs/2026-09-25-*766sym*`. Read `docs/replay-runs/2026-09-25-766sym-NOTES.md`.

  | Execute bucket, n=1,444 | Expectancy [95% CI] |
  |---|---|
  | raw stop | +0.124R [+0.055, +0.192] |
  | production stop | +0.020R [−0.053, +0.093], below Watch (+0.092R) and Reject (+0.149R) |

  - The 12-symbol +0.362R headline was mostly a small-sample artefact.
  - Under the production stop, the score's ranking inverted.
  - `ruleOfThree`, `swingChartTrend`, `volumeClimax` and `historicalSR` measured negative. All four
    are daily-chart concepts measured against the old 15-minute trigger. That makes PR #290 the
    first explanation to test before calling any of them inverted.
- **The production stop is a cap, not a widening.** Earlier notes, including this prompt's first
  version, called it "widened". `computeStopWithLeeway` (`lib/strat/levels.ts`) adds a small ATR
  leeway, then **clamps** the stop to at most 2.5× the 15-minute ATR (3.5× for large caps). For
  most trades that makes it *tighter* than the structural stop. Mean Execute hold fell from 76.6
  bars to 21.2.
- **Next run that counts:** the same `raw` and `prodstop` cells, plus a `confirmed` cell once it has
  been ported, all on `STRATEGY_VERSION` `2026-09-25-live-trigger-replay`, with `universe:
  large-cap`. Compare it against the pre-fix baseline above.

## 1. The question

The prior session built `requireEntryConfirmation` into the backtest harness. It lives on branch
`claude/great-brown-h6hops` and is not merged. It models production's mandatory
break → retest → confirmation-move sequence, from `lib/lifecycle/entryConfirmation.ts`.

Early results:

| | 12-symbol mega-cap | 27-symbol diversified |
|---|---|---|
| Unconfirmed (current harness baseline) | 41 trades, +0.362R, 36.6% win | 41 trades, −0.298R, 14.6% win |
| Confirmed | 40 trades, −0.198R, 25.0% win | stale, not re-run |

The owner needs to decide which entry model GSPS should run everywhere: the live scan, Guided Mode,
demo auto-trade, plan-scoped automation and the APM. **These numbers can't answer that yet.**
Section 2 explains why. The harness must first model production faithfully. Then run a
pre-registered experiment.

Frame the decision correctly. The backtest is never allowed to be easier than production. The real
choice is between two options:

- **(A)** Keep production's confirmation rule. The confirmed number is then the honest one.
- **(B)** Recommend changing production's rule, and only if the evidence shows confirmation destroys
  edge.

Either way, the harness and production must end up measuring the same thing.

## 2. Known defects to fix in the harness before any run that counts

All come from the 2026-09-25 audit. Re-verify each one.

- **F3.1–F3.3 (trigger timeframe, direction source, filters): fixed on `main` by PR #290.** Verify
  it. Read `lib/scan/entrySelection.ts`, and confirm `lib/scanTicker.ts` and `lib/backtest/replay.ts`
  both call it with daily bars and apply the same filters. Don't re-implement it.
- **F1.2: the target differs from production.**
  - The replay targets `trigger + targetR × risk`.
  - Production attaches the plan's structural `takeProfit1`. See `lib/lifecycle/fromScanResult.ts` and
    `lib/automation/service.ts#deriveOrderInputFromPlan`.
  - Model TP1 from `computeTradeLevels`, as the scan does. If you keep a targetR variant, label it as
    non-production.
- **F1.3: fills past the bracket.**
  - Production rejects a fill that lands past its stop or target with `fill_outran_bracket` (409), in
    `lib/trade/place-order.ts` around lines 451–469.
  - The replay counts that trade instead, as a "win" with negative gross.
  - Drop those trades, and report how many were refused.
- **F1.5: possible duplicates.**
  - The same setup can re-arm on consecutive bars and confirm on the same bar.
  - Production de-duplicates through `signalFingerprint`.
  - De-duplicate by (symbol, trigger level, confirmation bar).
- **F1.4: confirmation cadence.**
  - Production advances confirmation once per scan pass. It builds a flat bar from `currentPrice` and
    only advances symbols in that pass's visible set. See `lib/lifecycle/advanceConfirmation.ts` and
    `lib/entitlements/scan-fanout.ts`.
  - Production expires plans on wall-clock time, using the verdict's `expiresAfterBars` times 15
    minutes.
  - Either model scan-cadence sampling, or document the replay as an upper bound on how many
    confirmations production would achieve.
- **Stop model.** Production uses `computeStopWithLeeway`: a small ATR leeway, then a cap at 2.5× (large caps 3.5×) the 15-minute ATR. That is usually *tighter* than the structural stop, not wider. Run
  production cells with `useProductionStop` on.

Also confirm what's already correct on that branch:

- Stop, risk-per-share and target are fixed from the *original* trigger. Only the fill price moves.
  This matches `deriveOrderInputFromPlan`.
- Gross P&L uses the actual price distance, not a flat R.

Keep both of those.

Add tests for every fix. Test fixtures need real price reversals: flat fixtures arm nothing under the
Gann trigger.

## 3. Experiment design

**Pre-register it.** Write the design and the decision rule into the PR description *before* looking
at results.

**Cells.** Compare entry models under otherwise identical, production-faithful settings:

1. **Baseline:** stop-order fill at the Gann trigger, no confirmation.
2. **Production:** the full confirmation sequence, stop and target fixed from the trigger, refused
   fills dropped.
3. *(Optional, label it clearly)*: a production variant on its own, for example confirmation without
   the 0.3% break buffer. Only include it if it's Gann-grounded; cite the "3-point rule" source.

**Universes.**

- The 12-symbol mega-cap set.
- The 27-symbol `DIVERSIFIED_BACKTEST_SAMPLE`.
- **The full `LARGE_CAP_UNIVERSE` (~766 symbols).** Treat this as the primary result. Small universes
  are only for sanity checks.

**How to run the full universe.** Use the **"Universe backtest (manual)"** GitHub Actions
workflow (`.github/workflows/backtest-universe.yml`), which drives `scripts/backtest-universe.mjs`.
Don't use `/api/backtest`: that route caps a request at 12 symbols to fit Vercel's 60 s limit. The
workflow instead:

- runs the harness in one job, with a 330-minute timeout;
- fetches each symbol once and replays every cell on the same bars;
- paces itself to leave rate-limit headroom for production scans;
- refuses to run on synthetic data;
- reports bootstrap CIs, time-half splits and cell-vs-cell difference CIs;
- warns if two cells with different options produce identical trades, which means an option isn't
  implemented on that ref.

Its inputs:

- `ref`: your harness branch. It must include `main` from after this workflow landed.
- `universe`: `large-cap`, `mega-12`, `diversified`, or a comma-separated list.
- `cells`: JSON, for example
  `[{"label":"baseline","options":{"useProductionStop":true}},{"label":"confirmed","options":{"useProductionStop":true,"requireEntryConfirmation":true}}]`.
- `symbols_per_minute`: keep at 30 or below during market hours. It can go higher off-hours.

Results come back in two places. They're printed between `=== BEGIN … ===` / `=== END … ===` markers
in the "Print results" step's log, which you can read with the GitHub MCP job-log tools. They're also
uploaded as an artifact.

To trigger a run, ask the owner, or use the GitHub MCP `actions_run_trigger` tool if it's available.
This requires repository secrets `ALPACA_API_KEY` and `ALPACA_API_SECRET`. If they're missing, the job
fails immediately with a clear message.

The workflow itself is already smoke-tested. After your harness changes, run a quick `mega-12` pass
first to check that the new cells produce different trades from `raw`. The runner warns if two
cells with different options produce identical trades. Don't expect it to reproduce the 2026-09-23
numbers: PR #290 changed the trigger. A full-universe run takes about 26 minutes at 30 symbols a
minute.

**Buckets.** Report Execute, Watch and unconditioned results for every cell, plus a per-score-band
sweep.

**Statistics.**

- Report n, expectancy in R with a **bootstrap 95% CI**, win rate, profit factor and max drawdown in R.
- Report refused fills, the expiry rate and the confirmation rate.
- Around 40 trades gives roughly ±0.2R standard error on expectancy. Don't call a difference real
  unless the CIs separate, or a paired or bootstrap test of the difference clears 95%.
- Report per-universe results and a pooled result.
- Check stability across time: split the window into halves.

**Commit every run** to `docs/replay-runs/` in the existing format, with the harness commit SHA and
every flag recorded.

**Attribution.** Run the factor table (`lib/backtest/attribution.ts`) per cell. If a Gann-derived
criterion inverts under the production-faithful harness, treat it as a porting-defect lead. Flag it;
don't fix it silently.

## 4. Decision rule (pre-register it; adjust only with written justification)

- **Recommend keeping production's confirmation rule platform-wide** if its Execute-bucket
  expectancy CI lies above 0 on the full universe, *or* if it isn't significantly worse than baseline.
- **Recommend the owner consider changing production's rule** only if baseline beats confirmation
  with separated CIs on the full universe *and* the result is stable across time halves. Any change
  must stay Gann-grounded; the confirmation buffer itself is cited to the "3-point rule". Write it as a
  proposal. Don't implement it.
- **If neither model's Execute CI clears 0 on the full universe,** say so plainly. That points at the
  thresholds or the translation, not at the entry model. Recommend re-deriving the cutoffs (`6`/`3.5`
  in `lib/scoring/weights.ts`), which were confirmed on the 12-symbol run only.

## 5. Scope reminders (platform-wide means all of these)

The chosen model has to hold on every surface. Cross-platform consistency applies here. List where
each surface stands today, then check each one yourself:

- **Live scan and trade plans:** plans start `awaiting_entry_confirmation` and are armed by
  `advanceEntryConfirmationForSymbol`.
- **APM and plan-scoped automation:** they only act on `armed` plans. See
  `lib/automation/portfolio-manager.ts` → `activateAutomationProfile` → `deriveOrderInputFromPlan`.
- **Guided Mode execute, demo auto-trade and the manual ticket:** these currently place orders *without*
  confirmation (audit finding F3.4). Whatever model wins, recommend aligning them, or recording an
  explicit exception.
- **Latent risk items the owner must also see.** Don't fix these here, but list them in the report:
  - Live orders skip `checkPositionLimits` (F3.5).
  - Autonomous live trading looks authorised: there is an active `compliance_signoffs` row, and the
    `AUTONOMOUS_LIVE_TRADING_HALTED` env var is set in production (F4.4 / F7.6).

  These matter more if the APM becomes more active.

## 6. Deliverables

1. A harness PR with the fixes from section 2, tests and the pre-registered design. Keep it separate
   from, or rebased onto, `claude/great-brown-h6hops`. Don't rewrite that branch's history.
2. Committed run files in `docs/replay-runs/`.
3. A report with the per-cell table, CIs, the decision under the pre-registered rule, what it means
   for the APM, and every limitation. Include coverage honestly: state what was fully run, partially
   run, or not run.
4. A dated addendum under *Audit outcomes* in `AGENTS.md` recording the result, so it isn't
   re-litigated.
5. No production behaviour change. List the recommended changes for the owner's sign-off.
