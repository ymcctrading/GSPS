# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
# GSPS Agent Instructions

## How this file works (2026-10-30, project owner; neutral since 2026-11-09)

Claude Code loads this file into every session, on every request, so it
holds only the standing rules. Each rule names the file with its full text,
history and rationale.

- **The method's standing rules are private.** The repository is readable
  outside the project, so the rules about the trading method, its sources
  and its design lenses, and the topic files that hold their full text, are
  kept in project files, not here:
  **`/mnt/project-files/private-research/agents/`**. Start with
  `AGENTS-FULL-2026-11-09-d2e65d0.md` there (this file as it stood before it
  was made neutral, word for word) and `README.md` there (the index of topic
  files). **Before any work on trading logic, scoring, levels, timing, stops,
  targets, the replay, education copy, or any product-facing design, read the
  matching private file.** Where this file and the private full text differ
  on a method rule, the private full text decides.
- A topic file that used to sit at `docs/agents/NN-….md` and is not in the
  repository any more is at the same file name in that private folder. Code
  comments that cite an AGENTS.md section by name resolve to that heading in
  the private full text or its topic files. Any other doc that has left the
  repository is at the same path under
  `/mnt/project-files/private-research/repo-docs/` (its README lists them).
- Read the matching `docs/agents/` file (in the repository) or private topic
  file before working in its area. A rule's summary here never overrides its
  full text. Where they seem to differ, the full text decides, and you fix the
  summary.
- **New dated history goes in the topic file, never here.** Add at most one
  line here when a new standing rule is made. `lib/__tests__/agents-md-size.test.ts`
  fails the suite once this file passes 48 KB.
- **Keep this file neutral:** no source, author, book or method name. A new
  rule about the method goes in the private files, with one neutral line here
  if every session needs it.

## Context efficiency — standing (2026-10-30, project owner)

1. Load only what the task needs. Search (`grep`, the index) before reading
   broadly, then read bounded sections. Read a whole source when correctness
   or a requested comprehensive review needs it.
2. Summaries and notes are navigation, not evidence. Exact wording, numbers
   and ids come from the source ("Verify before you report" below).
3. Don't reread unchanged material already in context. Reread when it may be
   stale, changed or incomplete.
4. Keep modes apart: an implementation task is not an unasked whole-platform
   audit, and an explicitly requested comprehensive audit is never shrunk to
   a diff. Keep a coverage ledger for it.
5. Delegate to subagents only focused work with a reason. Their tokens count
   too. Never spawn duplicates to hide context.
6. Bound tool output: keep long logs in a file, show excerpts, keep the real
   exit status, and never hide a failing check behind a filter.
7. Token ratios or estimated dollars are not savings. Measure accepted work
   and the allowance used.
8. **Fresh threads daily (owner, 2026-10-30).** A thread whose work runs past
   a day writes a checkpoint to `/mnt/project-files/checkpoints/<thread>.md`
   (objective, done, decisions with sources, open items, branch and PRs,
   next step, what waits on the owner) and continues in a fresh thread that
   starts from it. Re-check its facts at the source before relying on them.

## Product Roadmap

**`docs/SYNTHESIZED_ROADMAP.md` is the governing plan from 2026-10-21.** Read
it first: its Part 5 is the current phase's item-by-item status and its Part 7
says which thread owns what. `ROADMAP.md` keeps each phase's detail and
history. **Read it before proposing new work, scoping a feature, or
prioritizing between options** — it decides what gets built and in what
order, and it outranks `BACKLOG.md`, which is an unscheduled idea pool.

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

## Confidential sources — top-priority standing rule (2026-10-28, project owner)

The sources the back end is built from are the owner's confidential
intellectual property. **Nothing a person or a browser can read discloses
them or their method**, and GSPS presents itself as a stock trading and
scanning application. The full rule, with the list of sources, is in the
private full text.

- **User-facing means everything a person or a browser can read:** UI copy,
  labels, tooltips, the school, emails, notifications, API responses (strings
  and, over time, field names), user docs, marketing and page metadata, and
  any string in a `lib/` module a client component imports (it ships in the
  JS bundle; comments don't).
- **The repository is readable too.** Code comments cite a source only by its
  neutral key (`ref: SRC-0NN`); the key map is in project files
  (`/mnt/project-files/private-research/sources/REFERENCE-MAP.md`) and never
  in the repository.
- The school teaches how to trade with publicly available methods; lesson ids
  are unchanged. `lib/school/__tests__/publicMethods.test.ts` guards it.
- **Ids a browser or a member's row can read are neutral (2026-10-28, #510).**
  Exit rules are `structure` and `structure-runner` (old ids still accepted),
  the strategy mode is `gsps`, the settings route is `/api/settings/trade-rules`,
  `pointScale.ts` exports `pricePoint`, `threePoints` and `pointForBars`, and
  scan results reach the client as `PublicScanResult`. Member-readable rows
  (`daily_scans`, `orders`, `trade_plans`, `trade_logs`) store
  `STORED_STRATEGY_VERSION`, a dated label, never the `STRATEGY_VERSION` name
  (`lib/backtest/publicVersion.ts`).
- `scripts/check-banned-terms.mjs`'s `CONFIDENTIAL_TERMS` gates the copy
  surfaces in CI, and `scripts/check-bundle-terms.mjs` gates the built bundle.
  Check the built bundle too (`grep -r` over `.next/static`) when a change
  touches what a client imports.

## Cross-platform consistency — standing principle

If a concept exists anywhere in this codebase — an indicator, an anchor
convention, a fixed constant, a computed field — and it applies to another
surface, it must exist there too. **Not existing everywhere it applies is
equal to not existing anywhere.** A concept built once and left stranded in
the module that introduced it is not "partially done" — treat it as not
done, and finish rolling it out before calling the work complete.

Two real defects had this shape (2026-09-10): an anchor fix that reached the
scored criterion's two callers (`lib/scanTicker.ts`, `lib/backtest/replay.ts`)
but not the coarse pre-filter (`lib/marketScan.ts`) or the confluence card,
which kept the old anchor for a day; and a trend-strength indicator built for
`lib/signals/regime.ts` that never reached the scanner score
(`lib/scoring/score.ts`). Full history in `lib/validation/criteria-registry.ts`
and the private full text.

Before considering any indicator, anchor rule, fixed threshold, or computed
field "in place," check every surface it plausibly applies to — other
scoring paths, the live scan vs. the backtest replay, confluence/display
modules, coarse pre-filters — and either wire it in everywhere applicable or
say explicitly why a given surface is an intentional exception. "When
appropriate" is the only carve-out: a concept that *shouldn't* apply
somewhere (different timeframe, asset class, or governing spec) is a real
exception, but the default assumption is that it applies, and silence is not
an exception.

## The method's rules — read the private files (summary of what binds every session)

The full rules are in `/mnt/project-files/private-research/agents/`
(`AGENTS-FULL-2026-11-09-d2e65d0.md` and topic files 04, 05, 06, 07, 09, 10,
11, 12, 14, 16 and 18). These neutral points bind every session without
opening them:

- **The method is the platform's substance** on every surface (scanning,
  scoring, levels, entries, stops, targets, risk, lifecycle, charting,
  education, UI). A component with no grounding in it is a defect to replace,
  ground or justify, never a neutral default. Where GSPS conflicts with the
  method, the method wins. Questions the method answers aren't held for the
  owner; only what it doesn't answer goes to him (security, access, billing,
  ops, legal, or a figure it never gave, labelled an engineering choice).
- **Two gates for every scored criterion:** traced to a cited source (by
  key) and measured (`lib/validation/criteria-registry.ts`). A
  source-derived criterion that measures negative is presumed a porting
  defect first. Changing `CRITERION_KEYS` moves `TOTAL_POINTS` and both
  thresholds, so it is never a drive-by edit (PR #236).
- **The scorecard supplies no substance of its own:** weights are uniform
  (`DEFAULT_CRITERION_WEIGHTS`), and a cutoff is a display decision.
- **Every work in the collection has been read (owner, 2026-10-16), and
  `/mnt/project-files/private-research/agents/00-where-to-look.md` says where
  (owner, 2026-11-07).** Read it before calling any work unread or building or
  testing a rule. A connector read that stops early is never evidence a work
  is unread.
- **`STRATEGY_VERSION`** lives in `lib/backtest/strategyVersion.ts`. Bump it
  when verdicts or replay trades move, and record the change in the private
  topic file. Current standing values (read the code before quoting them):
  `LIVE_EXIT_RULE` is `"structure"` (no fixed target), and the
  production-faithful replay cell is
  `{"usePlanLevels":true,"entryRule":"reaction","exitRule":"structure"}`.
- **Porting a figure:** a figure the method gives at a price is divided by
  `pricePoint` at that price. Only its "3 points" and figures it states
  across price bands read as points directly.
- **Design lenses are design inputs, never evidence:** only a cited source or
  a measured result moves a threshold, weight or gate. Each new feature
  answers the mandate's questions in writing while it is conceived (private
  topic file 14, and the creation note in `docs/memory-bank/` or its moved copy; see "How this file works"): (1) how the
  method best grounds or improves it, with source key and tier; (2) how the
  cycle work informs it, with the periodicity checklist for any cycle claim,
  saying what cleared and what didn't; (3) which of the seven design
  principles fits, chosen by fit, and whether it changes the design; (4) the
  creation question: name the complementary pair, say whether the join
  creates a third or is only a mixture, and where a third exists, what it is
  and where it re-enters. Applies platform-wide (UI, copy, onboarding, tiers,
  billing); only work with no product-facing shape is exempt, said plainly.
- **Forward-looking claims** (a dated window) are allowed only with their
  source, method and measured record written down where shown; never a
  performance claim or guarantee.
- **Recurring processes** are designed as returning cycles anchored to the
  clock, not a stored counter (`lib/scan/universe-rotation.ts`); the numbers
  are engineering choices.
- **Data:** bars are split-adjusted, share counts are not; read historical
  counts through `splitAdjustedSharesAsOf`.
- **Server rules:** read the service key through `serviceRoleKey()`
  (`lib/supabase/service-key.ts`), never `process.env`; every write to the
  ledger tables goes through `ledgerWriter` (`lib/supabase/ledger.ts`);
  closed orders, positions and trade logs are never deleted by the app, and
  notices are pruned only within the windows in `lib/ops/retention.ts`;
  re-run `fetch-industry-groups.yml` when `LARGE_CAP_UNIVERSE` changes; a new
  password form calls `lib/auth/breached-password.ts`.
- **Live autonomous trading is authorised by people, never by a session.**
  `AUTONOMOUS_PROVING_PERIOD` (`lib/automation/autonomous-live-gate.ts`)
  keeps every manager profile on paper. The `autonomous_live_trading` and
  `preentry_plan_retirement` sign-offs are human acts.
- **One entry rule on every path:** `lib/trade/place-order.ts` places any
  entry carrying the protocol's levels only once it has confirmed on closed
  bars; a new placement path goes through it. Entry pricing is
  `lib/gann/entryTrigger.ts`; don't revert it to fix a thin Execute bucket.
- **No market-cap ceiling** on the scan universe; the $10B floor is the only
  cap rule.
- **Decided exceptions:** the bar-sequence taxonomy (display and confluence
  only), the user-driven chart indicators (which **never feed a scored
  criterion, gate, trade plan, entry, stop, target or verdict**) and Strategy
  Modes (below). A component is "not live" only once traced to zero
  consumers. Re-verify any "no consumer" claim against current `main`.

**Every session, sweep the platform for techniques outside the method; don't
trust a list** (full text in private topic file 06):

```
# Word boundaries matter: unanchored "RSI" matches "reve<RSI>on".
grep -rnE '\b(RSI|MACD|Bollinger|Wilder|adx|Supertrend|PSAR|Ichimoku|Elliott|Wyckoff|Keltner|Donchian|Fibonacci)\b' \
  --include=*.ts --include=*.tsx lib/ app/ components/ | grep -v __tests__

# Moving averages and VWAP. Hits under lib/strategies/, lib/indicators.ts,
# lib/analysis/indicators.ts and components/chart/ are the documented
# exceptions. Anything else needs a reason.
grep -rnE '\b(sma|smaSeries|ema|vwap|anchoredVwap|SMA|EMA|VWAP)\b' \
  --include=*.ts --include=*.tsx lib/ app/ components/ | grep -v __tests__ \
  | grep -vE '^(lib/strategies/|lib/indicators\.ts|lib/analysis/indicators\.ts|components/chart/)'
```

Confirm each hit is dead, documented, or gone. An exported symbol, an API
route, a chart overlay and a database row are all live surfaces.

## Strategy Modes — scoped exception

Full text: private topic file `12-strategy-modes.md` (and
`docs/STRATEGY_MODES.md`). An opt-in system (`lib/strategies/*`) that reads
named third-party techniques. It **never reaches the scan, score, gates,
GSPS's plan or any automated order**; one mode at a time, chosen by a person,
labelled at every display; a technique that doesn't align offers its own
entry, stop and TP1, never an MTP. Tier gating is server-side only
(`lib/entitlements/policy.ts#allowedStrategyModes`). A mode's orders still
meet every risk rule. Modes compute their own copy of a shared formula
(`lib/strategies/math.ts`). Custom scripts: Wall Street only, private to the
author, whitelist DSL, no `eval`. **Merging a migration is not applying it.**

## Three-path tier promotion (2026-09-25, project owner direction)

Full text: `docs/agents/17-tier-promotion.md`.

Every tier step clears through Curriculum, Track Record or Pay Your Way
(`lib/promotion/*`). The Academy 8 capstone is required for Wall Street on
every path; don't make that path-independent without the owner. Graduation
exams belong to the curriculum path only. The track-record profitability
metric never feeds risk sizing or execution scoring. Promotion billing stays
off (`isPromotionBillingEnabled()`) until real Stripe prices exist. Promotion
copy expresses graduation through constraints lifted, never performance
claims (`lib/promotion/copy.ts`).

## Setup cards, MTP and the intraday refresh budget (2026-09-30, project owner)

Full text: private topic file `18-setup-cards-and-intraday.md`. Read it
before touching any list of setups, the intraday scanner, its queue, alerts
or notices.

- **One card everywhere:** `components/setups/setup-card.tsx` opens every
  setup by its name; a new list uses it. It shows the per-pillar rollup only;
  **never pass a row's `breakdown` to the client**, and `daily_scans` stores
  only the score rollup (R-021).
- The master take profit is **MTP** wherever a person reads it. Intraday TP1
  and MTP are method levels or nothing; every intraday TP1 pays more than the
  risk. Alerts held by `tradeHold` (`lib/scanner/intradayDisplay.ts`) are
  shown for study only.
- The refresh budget lives in `lib/entitlements/policy.ts` and is enforced
  in `lib/entitlements/intraday-refresh.ts`.
- **Email only for what needs the member:** a new email sender calls
  `emailBudgetHold` with its kind; intraday signals and notices go by push and
  the bell only.
- The evening report goes to the owner's addresses only; widen recipients
  only on his word. Hindsight data goes to the owner's two accounts only
  (`lib/auth/owner.ts`).
- Nothing automated trades the Intraday style. Don't move the refresh budget
  onto `reserve_usage_slot` without a migration admitting its usage key.

## Polarity audit: a genuine second pole for Novice/Pro, not a subtracted one

Full text: `docs/agents/19-polarity-audit.md`.

A shorter feature list is not a second pole. When a feature is gated away
from a lower tier, design that tier's own counterpart in the same change
(Trade Reviews and Guided Mode are the examples). New curriculum teaches a
technique's premise, never another practitioner's words or methods verbatim.

## Temporary overrides — mandatory, check on every session

Full text: `docs/agents/20-temporary-overrides.md`. When a revert trigger
fires, raise it with the user before touching the affected code.

- **Equity data delay and notification freshness (2026-10-28, until real-time
  data is bought).** `lib/data/timeliness.ts` is the one time contract
  (`docs/DATA_DELAY_AND_FRESHNESS.md`): a decision reads only bars usable at
  its clock, orders fill at the first bar after it, replays keep the delay.
  **A new notification path must call `checkAlertFreshness`**; only
  actionable wording may say "now". Revert trigger: a verified real-time
  feed, needing both `MARKET_DATA_REALTIME=true` and
  `MARKET_DATA_REALTIME_VERIFIED_AT`. Never set either without the owner.
- **Longer scan deadlines on Render only (owner, 2026-11-11).** `scanDeadlines()`
  (`lib/marketScan.ts`) stretches the scan's deadlines 5x on Render alone.
  Revert trigger: the app is back on Vercel.
- **Execution timeframe is 15Min.** Don't re-widen `EXECUTION_TIMEFRAME`
  for a thin Execute bucket; that was tried and reverted.
- **Check the configuration surface, not just the code.** Before reporting
  any constant, threshold, weight or flag as live, check what overrides it
  outside the repo: `learning_models` live rows (adopted only if uniform and
  keyed to `CRITERION_KEYS`), `policy_values` (may only tighten a limit), and
  environment variables (the `GSPS_DISABLE_*_CONFLUENCE` flags,
  `MARKET_DATA_REALTIME`). Re-derive the list rather than trusting it.

## Speed is a product requirement, not a platform ceiling — standing direction (2026-09-25, project owner)

The 60-second budget in this codebase (`maxDuration = 60` in
`app/api/market-scan/route.ts`, `FULL_UNIVERSE_TOP`,
`CONTINUATION_DEADLINE_MS`, `YEAR_CYCLE_RERANK_DEADLINE_MS`) is **a
self-imposed limit**, set so a novice feels safe using the product.

- **Do not describe the budget as "Vercel's limit"** or treat it as a
  constraint to engineer around.
- **Do not solve latency by raising the budget.** New work fits inside it,
  or it runs off the user's path.
- **Every change that adds time to a scan says how much**, measured (the
  `[market-scan]` `mark()` breadcrumbs), and whether a user waits on it.

## Deployment (Vercel)

- **Cloud Run while Vercel is paused (owner, 2026-11-04).** Vercel paused the Hobby account on 2026-10-31 until 2026-11-30; the owner chose Google Cloud Run's free tier. Every push to `main` deploys there through `.github/workflows/deploy-cloud-run.yml` (it does nothing until the `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT` variables exist; it signs in keyless through Workload Identity Federation). The service's environment is written from GitHub's secrets on each deploy, so a key is changed there, never on the service. The scheduled jobs call the address in the Vault secret `gsps_app_base_url` (migration 0144), and every schedule lives in pg_cron (`vercel.json` has no crons). The usage meter switches function limits by host (`docs/THIRD_PARTY_LIMITS.md`, "Cloud Run").
- **Render while Google asks for a prepayment (owner, 2026-11-11: "I am not interested in paying").** `.github/workflows/deploy-render.yml` deploys each push to `main` to Render's free web service once the `RENDER_API_KEY` secret and `RENDER_SERVICE_ID` variable exist; `gsps-keep-awake` (migration 0149) keeps it from sleeping (`docs/THIRD_PARTY_LIMITS.md`, "Render").
- The project runs on the **Vercel Hobby (free) plan**: cron jobs capped at **2 per project**, each **no more than once a day** (`docs/THIRD_PARTY_LIMITS.md`). Anything more frequent uses an external scheduler.
- `vercel.json` sets `"git": {"deploymentEnabled": {"main": true, "*": false, "*/**": false}}`: **only `main` builds**, and **merging to `main` deploys straight to production**. No other branch builds or gets a preview URL. Treat a merge as a release.
- **Never trigger a Vercel deployment unless explicitly asked.** The user will say which environment. Because merges auto-deploy, **don't merge to `main` unless asked** — merging is deploying.
- A branch push builds nothing on Vercel, so verify a change with the repo's own checks before merging.

## Verify before you report — standing rule (2026-10-22, project owner)

The owner's correction after the same failure three times: counts and
statuses reported from memory or an earlier note instead of from the source.

- **Every count, status or "done / not done" you tell the owner is read fresh
  from its primary source in the same turn:** the file, the grep, the test
  run, the database row, the PR's checks, the other thread's latest message.
  A note, a summary, a checklist or your own earlier reply is a lead, never
  the evidence.
- **Say what you checked and when** ("grep at 01:30 UTC found 6"). If you
  could not check, say that, and don't give the number.
- **A count is recounted, not carried.** Report any difference from an
  earlier figure plainly.
- **What is waiting on the owner** lives in
  `/mnt/project-files/owner/waiting-on-chuck.md`. Add an item the moment it
  starts waiting on him and strike it the moment it is done. Re-read that
  file and each item's own thread before telling him what needs him.
- **Reading coverage** ("read", "inspected", "complete") is claimed only from
  the work's own coverage record, page by page, never from a summary.

## Code review before every merge — standing mandate (2026-10-21, project owner)

In the owner's words: a code reviewer checks all code to make sure it works
correctly and implements the method faithfully; any code with an error is
highlighted and solved; only after all code passes the reviewer can the PR be
merged. Every session, every PR, no exceptions by size.

- **Scope: the PR's own diff**, plus whatever it calls or is called by where
  the change could break it. The whole repository was reviewed on 2026-10-21
  (`/mnt/project-files/senior-code-review/`).
- **Premise:** §1 of `senior-code-review/00-comprehension-and-manifest.md`.
  Two questions for every changed file: (1) does it work as intended (logic,
  edge cases such as NaN, null, Infinity, sub-penny and negative prices,
  rounding, New York time and DST, closed bars only, no look-ahead,
  determinism, error handling, and tests that prove the behaviour); (2) does
  it carry the method (each rule traced from its source, by key, to the code
  and the test, marked FAITHFUL, APPROXIMATED, ABSENT or CONTRADICTED; live
  scan and replay run the same code; the rule reaches every surface it
  applies to). The full premise is in the private full text.
- **Errors are highlighted and fixed** with file, line and a concrete
  failure; the method's rule is the answer, cited by key.
- **Merge only after the review passes.** Fixes go on the same PR and are
  reviewed again until no blocking finding remains. Record the result in the
  PR body's "Code review" section. The owner's "merge when green" means green
  CI and a passed review.
- A reviewer may be a separate agent or a fresh pass by the session itself,
  but it reads the diff cold.
- The merge queue is `/mnt/project-files/merge-queue.md` (the Senior code
  review thread).

## GitHub Actions minutes: how every session works on the free tier (2026-10-28, owner)

A private repository on GitHub's free plan gets 2,000 Actions minutes a
month; once they run out, every check stops until the month resets. These
rules hold until the owner says the plan has been upgraded.

- **One PR per piece of work, pushed once.** Finish the work, run the suite,
  `tsc --noEmit`, eslint and `scripts/check-banned-terms.mjs` locally, then
  open the PR. A PR still in progress is opened as a draft; drafts run no
  tests until marked ready. Fix review findings in one push.
- **No catch-up merges.** A branch pulls main only when GitHub reports a
  conflict or the branch-age gate fails.
- **Four releases a day (owner, 2026-10-28: "every 6 hrs").** Finished,
  reviewed, green PRs wait in the merge queue. Around 6:00, 12:00, 18:00 and
  00:00 New York time, one release branch is built from main with each
  waiting PR merged in, one release PR is opened and merged once green. A
  production bug or security fix may skip the wait; say why in the PR.
- **What CI skips** (`.github/workflows/test.yml`): branch pushes with no PR,
  draft PRs, and PRs that change only Markdown other than README.md and
  FEATURES.md. Never widen a skip to `docs/**`: `criteria-gate.test.ts` reads
  `docs/replay-runs/*.json`.
- **Replays and backtests run in the session's environment, not on Actions**
  (owner, 2026-10-30). Set placeholders and route Node through the proxy:
  `NODE_USE_ENV_PROXY=1 MARKET_DATA_PROVIDER=alpaca ALPACA_API_KEY=via-proxy
  ALPACA_API_SECRET=via-proxy node scripts/backtest-universe.mjs ...`
  (without `NODE_USE_ENV_PROXY` Alpaca answers 401). The manual workflows run
  only on the owner's ask.
- **Before adding a workflow, a job or a trigger**, say what it costs in
  minutes a month. A new check is a step in an existing job where it can be.

## Usage limits: alerts and the 99% hold (2026-10-28, owner)

The owner asked to be alerted at 25, 50, 60, 65, 70, then every 5 to 90%,
every 2 to 96% and every 1 to 99%, and never to use 100% of a limit except in
the last two days of its month.

- **The meter** is `lib/ops/usageLimits.ts` (rules), `lib/ops/usageStore.ts`
  and `/api/ops/usage` (migration 0133). Meters: GitHub Actions minutes,
  Vercel deployments, Vercel function CPU and calls (`lib/ops/functionMeter.ts`,
  migration 0142), email (Resend free tier, from `email_daily_budget`), and,
  alert only, the Supabase database, connections, file storage and monthly
  active users, and Alpaca's 200 requests a minute. The full table is in
  `docs/THIRD_PARTY_LIMITS.md`. Each threshold emails the owner once a
  period, with times in ET.
- **How it is fed.** Every workflow job starts with a "Usage gate" step and
  ends with a "Usage report" step (`if: always()`). **A new workflow job must
  carry both steps** (copy them from `test.yml`). A manual Vercel redeploy is
  not seen; post it (`{"meter":"vercel_deployments","units":1,"key":"deploy-<id>"}`).
- **A public repository** bills no Actions minutes, so the Actions meter
  reads the repository's visibility at each reading (`repositoryVisibility`,
  `lib/ops/usageStore.ts`) and meters the 2,000 minutes again once private,
  with no code change.
- **The hold.** At 99% the gate fails the job, and the merge queue merges
  nothing while `usage_readings` shows `hold = true` for `github_actions` or
  `vercel_deployments`. The hold lifts in a monthly limit's last two days
  (UTC), when the period resets, or for an urgent production fix the owner
  OKs: the `usage-override` label on its PR (then close and reopen it), and a
  `usage_overrides` row for a merge. Never add either without his OK in words.
- **Reconcile** when a session measures the real figure: post the difference
  as one event with a `key` of `reconcile-<date>`.

## Git / PR Workflow

- After pushing commits that contain code changes, **always open a pull request** against `main`. Check for a PR template first.
- Work on the designated feature branch for the task; don't commit directly to `main`. **Start each new piece of work on a fresh branch from `main`, and check that no open PR already uses the branch before the first push.**
- **No PR merges before its code review passes.**
- **Name the ROADMAP phase in the PR** — `Q1`, `Q2`, `Q3`, `Q4`, or `N/A` for out-of-phase work. The `roadmap-phase` CI gate requires it.
- **Delete the branch immediately after its PR merges.**
- A PR whose branch diverged from `main` more than 30 days ago fails the `stale-branch` gate. Merge `main` in (or rebase onto it) and push.
- `bash scripts/audit-stale-branches.sh` reports merged, stale, and active remote branches; see `CONTRIBUTING.md` → "Branch hygiene".
