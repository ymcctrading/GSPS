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
| Tests (`test.yml`) | pull requests that are ready for review and change more than Markdown; by hand | 6 min a run |
| Security (`security.yml`) | pull requests that are ready for review; each push to main (the secret scan of what the merge adds) | 1 min |
| Branch hygiene (`branch-hygiene.yml`) | pull requests, including title and body edits (the roadmap-phase gate reads them); the 1st of each month | 1 min |
| Deploy to Cloud Run (`deploy-cloud-run.yml`) | each push to main | 1 min unconfigured, about 6 once set up |
| Universe backtest and fetch jobs | by hand only, on the owner's ask | about 61 min a backtest |

There is no Tests run on a push to main. Every push to main is a release-train merge, or an urgent fix merged alone, and its
pull request already ran the suite on the merge result. If main moved after a release PR's run, re-run the release PR before
merging it.

## The budget
| Item | Minutes a month |
|---|---|
| About 66 feature PRs × about 14 (1–2 test runs, plus security and hygiene) | about 900 |
| Up to 120 release-train PRs (4 a day) × about 8 | up to about 900 |
| Pushes to main: security, plus the deploy | about 50–250 |
| **Total** | **about 1,700–1,900 of 2,000** |

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
