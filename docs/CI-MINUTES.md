# CI minutes: the budget if the repository goes private

GitHub bills no Actions minutes while the repository is public. A private repository on the free plan gets **2,000 minutes a
month**. Once they run out, every check stops until the month resets (the spending limit is $0). This page is how CI stays
inside that. Measured 2026-11-09 from the Actions API; the full breakdown is in the project files
(`claude-usage/actions-minutes-breakdown.md`).

## Where the minutes went (Sep 28 – Oct 28, 2026: about 15,500)
| Item | Minutes |
|---|---|
| Tests | 5,284, of which 2,183 were runs on branch pushes (8.4 runs per PR) |
| Universe backtest (manual replays) | 5,028, about 61 a run |
| Security | 1,867 |
| Branch hygiene | 1,246 |
| The banned-terms gate | 1,177 (since folded into Tests) |
| Scheduled jobs | 826 (moved to the database scheduler on Oct 21) |

## What runs now
| Workflow | Runs on | About |
|---|---|---|
| Tests (`test.yml`) | pull requests that are ready for review and change more than Markdown and non-test docs; by hand | about 3 min on a feature PR (related tests), about 5 on a release PR (full suite) |
| Security (`security.yml`) | pull requests that are ready for review; each push to main (the secret scan of what the merge adds) | 1 min |
| Branch hygiene (`branch-hygiene.yml`) | pull requests that are ready for review, including title and body edits (the roadmap-phase gate reads them); the 1st of each month | 1 min |
| Deploy to Cloud Run (`deploy-cloud-run.yml`) | each push to main | 1 min unconfigured, about 6 once set up |
| Universe backtest and fetch jobs | by hand only, on the owner's ask | about 61 min a backtest |

There is no Tests run on a push to main. Every push to main is a release-train merge, or an urgent fix merged alone, and its
pull request already ran the suite on the merge result. If main moved after a release PR's run, re-run the release PR before
merging it.

## The Tests job: before and after #628 (2026-11-09)
| Step | Before (3 runs on Nov 9) | After, measured on #628 (full suite: cold cache / warm cache) |
|---|---|---|
| Install | 34–54 s | 57 s / skipped (node_modules restored in 5 s) |
| Tests | 122–200 s, full suite | 198 s / 199 s, full suite. On a feature PR, the related tests are about 35 s (measured locally on #613's change set). |
| eslint | 25–38 s | 38 s / 2 s |
| tsc | 16–27 s | 26 s / 6 s |
| next build | 35–56 s | 56 s / 56 s |
| **Job** | **252–390 s, billed 5–7 min** | **391 s / 280 s** |

On the same runner speed, the caches save about 110 seconds a run. The narrower test run on feature PRs should cut a run to about
2 minutes, but that is not yet measured on GitHub. It will be confirmed on the first feature PR after #628. Runner speed varied
about 1.5× between runs, and a private repository's runner has half the cores of a public one, so compare runs on the same day.

The budget below still uses the earlier 13.6 minutes a feature PR. If the narrower run holds on GitHub, it comes to about 10,
about 220 minutes a month less. That would widen the margin from about 130 minutes to about 350.

## The budget
A train runs only when a PR is waiting, so a month has at most about as many trains as feature PRs (66 in October), not 120.
Each train is one release PR and one push to main. The push runs Security (about 1 minute) and the Cloud Run deploy: about 1
minute while it is unconfigured, and about 6 once it deploys for real (an estimate; no real deploy has been measured yet).

| Item | Minutes a month |
|---|---|
| About 66 feature PRs × about 13.6 (1–2 test runs, plus security and hygiene) | about 900 |
| Up to 66 release-train PRs × about 7.7 | up to about 510 |
| Up to 66 pushes to main × Security plus the deploy | about 130 unconfigured; about 460 once Cloud Run deploys |
| **Total** | **about 1,540 now; about 1,870 once Cloud Run deploys, of 2,000** |

**The margin is thin:** about 130 minutes once Cloud Run deploys. If trains ran four times a day all month (120 release PRs
and 120 pushes to main), the total would be about 2,660, over the cap. So the budget fits only while releases stay well under
four a day, which they do whenever trains carry real work.

At the measured November pace (Oct 29 to Nov 8, 11 quiet days, without the backtest or Tests on main), the month comes to about
1,690 (`actions-minutes-breakdown.md`) or 1,745 (the independent check of this PR, which counts the remaining runs slightly
differently). Both use the same runs; the difference is rounding and which push runs were removed. Scaled by the 7 days that
had runs instead of all 11, that pace would be about 2,740, so a busy month needs the train discipline above.

## Rules that keep it there
1. **Push a PR once or twice.** Finish the work, run the suite, `tsc --noEmit`, eslint and the banned-terms check locally, then
   open the PR. Fix review findings in one push. Every push to an open PR runs Tests (about 6 minutes). At October's 8.4 pushes
   per PR, test runs alone would be about 4,600 minutes a month.
2. **Open unfinished work as a draft.** Drafts run nothing until they are marked ready.
3. **Run replays and backtests from a session, never on Actions** (AGENTS.md, "Replays and backtests run in the session's
   environment"). `scripts/backtest-universe.mjs` takes the same inputs as the workflow, as flags; the command is at the top of
   `.github/workflows/backtest-universe.yml`.
4. **A new check is a step in an existing job.** Each job is billed at least a minute, however short.
5. **Say the cost before adding a workflow, job or trigger,** in minutes a month.

The usage meter (`/api/ops/usage`) counts each job's minutes and holds CI at 99% (AGENTS.md, "Usage limits"). It reads the
repository's visibility, so it starts counting again on its own the day the repository goes private.
