<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# GSPS Agent Instructions

## Product Roadmap

`ROADMAP.md` is the governing roadmap for this project. **Read it before
proposing new work, scoping a feature, or prioritizing between options** — it
decides what gets built and in what order, and it outranks `BACKLOG.md`, which
is an unscheduled idea pool rather than a set of commitments.

**Work out the current phase from today's date against this table** — don't
assume Q1:

| Phase | Window | Theme |
|---|---|---|
| Q1 | Aug–Oct 2026 | Monetization & retention foundation |
| Q2 | Nov 2026 – Jan 2027 | Differentiation & scale foundation |
| Q3 | Feb–Apr 2027 | Mobile & community |
| Q4 | May–Jul 2027 | Enterprise & scale |

Then open `ROADMAP.md` for that phase's goals, initiatives, and dependencies.
If today's date is past Jul 2027, the roadmap is expired — say so rather than
defaulting to the last phase.

- When suggesting work, name the phase it belongs to. If it fits no phase, say
  so plainly — it is either out of scope or a reason to amend the roadmap.
- Out-of-phase work is fine when there's a reason (production bug, security
  issue, blocked dependency, or a direct request). Note the deviation rather
  than presenting it as planned.
- When a change invalidates part of the roadmap, update `ROADMAP.md` in the
  same PR and move its "Last updated" date.

## Cross-platform consistency — standing principle

If a concept exists anywhere in this codebase — an indicator, an anchor
convention, a fixed constant, a computed field — and it applies to another
surface, it must exist there too. **Not existing everywhere it applies is
equal to not existing anywhere.** A concept built once and left stranded in
the module that introduced it is not "partially done" — treat it as not
done, and finish rolling it out before calling the work complete.

This is not hypothetical caution; it is the exact shape of three real defects
found in this codebase, on 2026-09-10 and 2026-09-11:

- **`harmonicProximity`'s stale Square-of-9 anchor.** The fix landed in the
  two callers feeding the scored criterion (`lib/scanTicker.ts`,
  `lib/backtest/replay.ts`), but `lib/marketScan.ts`'s coarse pre-filter and
  `lib/signals/confluence/gann.ts`'s confluence card kept the old, buggy
  anchor for another full day — quietly undermining every backtest run
  measured against the "fixed" criterion in between (see
  `lib/validation/criteria-registry.ts`'s `harmonicProximity` entry for the
  full history).
- **ADX/DMI**, built and validated for `lib/signals/regime.ts` (the Signal &
  Regime Engine) specifically to avoid leaning on PSAR/Supertrend as a sole
  signal, never reached the separate 9-point scanner score
  (`lib/scoring/score.ts`) at all — a second subsystem with the exact same
  "which indicator confirms a trend" problem, solved once and never
  propagated.
- **Reversion-against-macro-trend as a silent default direction.**
  `lib/scanTicker.ts` used to compute a `reversionDirection` (the opposite of
  the 2-of-3 monthly/weekly/daily trend read) and use it as the tie-break for
  *which armed STRAT pattern got scored and traded* whenever a caller didn't
  supply an explicit direction — every caller except `lib/marketScan.ts`'s
  continuation top-up pass. So when both a bearish reversal pattern and a
  bullish continuation pattern were armed on the same closed bars, the
  bearish one always won the tie-break if the macro trend read bullish, not
  because it had better evidence, but purely because it agreed with an
  assumed mean-reversion premise. `lib/marketScan.ts` had already solved this
  correctly for its own batch pipeline — `coarseReversion`/`coarseContinuation`
  as two independently scored candidate pools, neither the assumed default —
  but that design never reached `scanTicker.ts`'s own no-preference behavior,
  which is what powers the single-ticker scan, Guided Decision Mode, and the
  batch scan's own reversion pass. Fixed 2026-09-11: `scanTicker.ts` now
  prices and scores the best-armed pattern in *each* direction that has one
  armed and reports whichever direction's evidence actually wins, everywhere
  a caller doesn't supply an explicit direction.

Before considering any indicator, anchor rule, fixed threshold, or computed
field "in place," check every surface it plausibly applies to — other
scoring paths, the live scan vs. the backtest replay, confluence/display
modules, coarse pre-filters — and either wire it in everywhere applicable or
say explicitly why a given surface is an intentional exception (e.g. a
module whose spec genuinely calls for different behavior, not just an
oversight). "When appropriate" is the only carve-out: a concept that
*shouldn't* apply somewhere (different timeframe, different asset class,
different governing spec) is a real exception, not a violation of this
rule — but the default assumption is that it applies, and silence is not
an exception.

## Temporary overrides — mandatory, check on every session

These are explicit, user-directed departures from the protocol's real design, made for a stated
reason and with a stated revert trigger. Read this section every session. When a trigger fires,
raise it with the user before doing anything else with the affected code — don't silently carry an
override past the point it was supposed to end.

### Execution timeframe forced to 1Hour (since 2026-09-09)

**What:** `EXECUTION_TIMEFRAME` in `lib/timeframe.ts` (the single source of truth — every consumer
imports it from there) is set to `"1Hour"`, not the protocol's real design of `"15Min"`.

**Why:** The free Alpaca feed delays equities ~15 minutes. On a 15-minute execution bar that's a
lag ratio of exactly 1.0, which trips `applyDataLagHold` (`lib/data/latency.ts`) and holds *every*
equity Execute verdict to Watch whenever the market is open — so a `trade_plan` can never reach
`armed`, and the Automated Portfolio Manager can never place a trade. At 1Hour the same delay is
25% of a candle, comfortably under the hold. The user asked for this explicitly, to verify the
automation *pipeline* (plan created → armed → picked up → order placed) works end to end on paper
money, while real-time data is not yet purchased.

**What this is NOT:** validation that the strategy works at 1Hour. `docs/BACKTESTING.md` records
that 1Hour has historically inverted the scoring model's own verdict ranking (Execute measuring as
the *worst* bucket, not the best) — untouched by this override. Never cite a paper trade produced
under this override as evidence the strategy is sound; it's only evidence the plumbing fired.

**Mandatory revert trigger:** the moment `MARKET_DATA_REALTIME=true` is set for a paid real-time
feed (removing the 15-minute delay entirely — `feedDelayMs` then returns 0 regardless of bar size),
this override must be reverted to `"15Min"` in the same change. Reminder text for that moment:
*"You asked to be reminded — real-time data is live now, so the temporary 1Hour execution-timeframe
override should come out."* Don't wait to be asked twice; raise it as soon as you see
`MARKET_DATA_REALTIME` being turned on, or see it already on, in the same session.

**To revert:** change `EXECUTION_TIMEFRAME` in `lib/timeframe.ts` back to `"15Min"`, delete this
section, and re-run `lib/data/__tests__/provider-execution-timeframe.test.ts` plus a fresh
`?within=all` backtest capture to confirm 15Min's criteria evidence still holds (data ages between
now and the revert). `PLAN_TIMEFRAME` (lib/lifecycle/fromScanResult.ts) and the copy in
`lib/analysis/levelRole.ts` both derive from `EXECUTION_TIMEFRAME` and need no separate edit.

## Deployment (Vercel)

- The project runs on the **Vercel Hobby (free) plan**. Cron jobs are capped at **2 per project**, each running **no more than once a day**. Before adding a new scheduled job, confirm the total stays at or under that cap — see `docs/THIRD_PARTY_LIMITS.md`. If something needs to run more often than daily, it does not belong in `vercel.json` crons; trigger it from an external scheduler instead.
- `vercel.json` sets `"git": {"deploymentEnabled": true}`, so Git-triggered deployments are **on**: pushing a branch builds a preview, and **merging to `main` deploys straight to production**. There is no manual gate in between. Treat a merge as a release: it is live for users within a couple of minutes.
- **Never trigger a Vercel deployment unless explicitly asked.** The user will say which environment — preview or production — when they want one. Don't assume. Because merges auto-deploy, this also means **don't merge to `main` unless asked** — merging is deploying.
- A branch push unavoidably spawns a preview build. That is expected and fine when you are pushing real work; don't push no-op commits just to move a pointer.

## Git / PR Workflow

- After pushing commits that contain code changes, **always open a pull request** against `main` rather than stopping at the push. Check for a PR template first.
- Do work on the designated feature branch for the task; don't commit directly to `main`.
- **Name the ROADMAP phase in the PR** — `Q1`, `Q2`, `Q3`, `Q4`, or `N/A` for out-of-phase work — in the title or body. The `roadmap-phase` CI gate requires it.
- **Delete the branch immediately after its PR merges** (`git push origin --delete <branch>`, or GitHub's button on the merged PR). Not later, not at the next cleanup.
- A PR whose branch diverged from `main` more than 30 days ago fails the `stale-branch` gate. Merge `main` in (or rebase onto it) and push.
- `bash scripts/audit-stale-branches.sh` reports merged, stale, and active remote branches; a scheduled job runs it monthly. See `CONTRIBUTING.md` → "Branch hygiene".
