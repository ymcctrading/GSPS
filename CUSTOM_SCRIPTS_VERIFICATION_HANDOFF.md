# Custom-script Strategy Modes — browser verification handoff

Machine-oriented handoff for a Claude Code session to pick up where a prior
session left off: verify the custom-script Strategy Modes feature in a live
browser and create a test script. The prior session built and merged the
feature but never opened it in a browser.

## What shipped, and where

Built across PR ymcctrading/GSPS#280, merged to `main` at commit `703b762`.
See `AGENTS.md`'s "Strategy Modes" section (specifically the "Custom-script/
plugin system" subsection) and `docs/STRATEGY_MODES.md` for the full design
record, hard rules, and Three-question-mandate reasoning behind every piece
below — read those before changing anything here, not just this file.

1. `lib/strategies/custom/` — a sandboxed DSL (whitelist-only recursive-
   descent parser, no `eval`/`new Function`/`vm`) that compiles small
   condition/action rule scripts into entry/stop/target evaluators.
2. `supabase/migrations/0081_strategy_plugins.sql` + `/api/strategy-plugins*`
   — CRUD for saving scripts, gated to Wall Street tier
   (`lib/entitlements/policy.ts#customScriptAuthoringEnabled`), private per
   user via RLS.
3. `lib/strategies/custom/plot.ts` + `/api/strategy-plugins/[id]/evaluate`
   — wired into `components/chart/candles.tsx` (a "My scripts" overlay
   picker) and `components/trade/order-ticket.tsx` (a "Custom script"
   Check-levels/Use-these-levels flow).
4. `lib/backtest/replayCustomScript.ts` + `/api/strategy-plugins/[id]/backtest`
   — evidence-only backtesting (armed-event counts; explicitly never a
   win-rate/R-multiple/P&L claim — see that module's own header for why).
5. `/settings/scripts` (`app/(app)/settings/scripts/page.tsx`,
   `components/settings/custom-script-editor.tsx`) — the authoring UI:
   list/create/edit/delete scripts, view version history, run Check-levels
   and Run-backtest against a symbol.

**One real bug already caught and fixed in the building session:** the
original migration was numbered `0080_strategy_plugins.sql`, which collided
with `0080_tier_promotion_three_paths.sql` from a different PR that merged
to `main` first. CI's `check:migrations` job caught it; renumbered to
`0081` and every reference updated before merging. Confirm
`node scripts/check-migrations.mjs` still reports clean on current `main`
in case anything since has re-collided.

**What was NOT done in the building session:** no live browser click-
through. Everything was verified via `tsc --noEmit`, the full vitest suite
(1910/1910 passing on the merge base), `eslint`, `npm run build`, and
`check-banned-terms.mjs` — never actually opened in a browser. That is the
entire reason this handoff exists.

## Task

1. **Sanity-check the merged code first**, quickly — confirm `main` is in
   the state described above (`git log --oneline -5`, confirm
   `supabase/migrations/0081_strategy_plugins.sql` exists, skim
   `AGENTS.md`'s "Strategy Modes" section if anything looks off).
2. **Get a browser onto `/settings/scripts` logged in as a Wall Street–tier
   account.** `customScriptAuthoringEnabled` is `true` only for
   `SYSTEM_MASTERY` (`lib/entitlements/policy.ts`) — if no test account
   already on that tier exists, either use one that does or promote one
   (check `profiles.tier` in Supabase, or use `lib/promotion/`'s flow).
   Without that, the page will just show "Custom-script authoring isn't
   included on your plan."
3. **Create this test script** (the exact fixture Phase 1's unit tests
   parity-check against `evaluateMaCrossover`, so its behavior is
   known-good):

   ```
   rule bullish when crossesAbove(ema(9), sma(20)) {
     entry = high[0] * 1.0005
     stop = lowest(low, 10)
     tp1r = 2
     mtpr = 4
   }

   rule bearish when crossesBelow(ema(9), sma(20)) {
     entry = low[0] * 0.9995
     stop = highest(high, 10)
     tp1r = 2
     mtpr = 4
   }
   ```

   Name it something like "EMA9/SMA20 crossover (test)".

4. **Exercise the full path**:
   - Save it (confirms create + compile-on-save).
   - Reload the page and re-select it (confirms read + list).
   - Run "Check levels" against a liquid symbol like SPY or AAPL (confirms
     `/evaluate`).
   - Run "Run backtest" against the same symbol (confirms `/backtest` and
     that the evidence-only disclaimer renders in the UI, not just the API
     response).
   - Toggle it as a chart overlay from `/chart/AAPL` (or wherever the chart
     lives) (confirms the plot-series wiring in `candles.tsx`).
   - Check the order ticket's "Custom script" section picks it up too.
5. **Report back**: what worked, what errored, what looked wrong or
   confusing in the UI, and any console/network errors. If something's
   broken, fix it — full design-decision context is in
   `docs/STRATEGY_MODES.md` and `AGENTS.md`'s "Strategy Modes" section;
   read the relevant part before changing behavior, not just the code.

## After this handoff is executed

This file has served its purpose once the verification above is done and
reported. Delete it (or fold any real findings into `docs/STRATEGY_MODES.md`
/ `AGENTS.md` the way every other worked example in this codebase is
recorded) rather than letting it linger as stale instructions for a later
session to stumble on.
