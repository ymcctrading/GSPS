# GSPS current-state baseline (first session)

Status: DRAFT. Written 2026-10-06 from read-only inspection of the repository and PR metadata. Nothing here has been run, tested or deployed by this session.

## 1. Exact references (verified from GitHub API, 2026-10-06)

| Item | Value |
|---|---|
| Current main head | `06d11240663272ac46e8a5889ef497b071487eab` (PR #305, merged 2026-10-01) |
| PR #306 head | `b16bcb1f02708b9fcc813b854175242e76bbe0ae` |
| PR #306 base | `25fd0e6dc3bbace8d75016cb85f0134c10bb50ac` (PR #304 merge) |
| PR #306 state | open, not merged, mergeable_state `dirty` (main moved by PR #305) |
| PR #306 size | 47 files, +3,260 / -52, 11 commits |
| Deployed production commit | NOT VERIFIED |
| Preview deployments | NOT VERIFIED |

PR #306 must be rebased on main before it can land.

## 2. Verified facts

- PR #306 reports lint, 2,189/2,189 tests, tsc and build passing. These are the PR author's claims; this session did not re-run them.
- PR #306 reports a full replay on the new version was NOT done and should run before merge.
- Main's commit log records negative six-year replays: one-hour run 22 is -0.058R overall and -0.053R on Execute; daily run 23 is -0.066R overall and -0.048R on Execute (interval touching zero).
- `swingChartTrend` is quarantined in the criteria registry (inverted on every six-year run); live scoring unchanged.
- PR #305 retires a plan whose stop is breached; the pre-entry lifecycle transition is dormant until a `preentry_plan_retirement` row exists in `compliance_signoffs`.

## 3. Not verified

- Status on current main of the older fix-list items (dead /backtest route, Master-target-confirmed polarity, Settings loading states) and the outstanding-fixes handoff (rate limiting on /api/auth/resolve-username, branch protection, migration reconciliation).
- Corpus manifest, page-level reading ledger, atomic method register, Cycles and Hauck inventories (none exist yet).

## 4. Proposed sequence

1. Verify each older fix-list item against current main.
2. Rebase PR #306; re-run checks; run the full replay against a pinned baseline before any merge decision.
3. Build the source manifest and reading ledger in parallel (does not block reliability fixes).
4. Resolve the S/V scoring specification (owner decision) before any i SEE implementation.

## 5. Owner decisions needed

- Rebase and replay PR #306 first, or hold until the negative-expectancy question is resolved?
- Surface live expectancy to users (product decision)?
- Make the 0-9 setup score the headline likelihood score of a multi-asset forecaster, and for which asset classes first?

No merge, deploy, spend or external communication is authorized by this document.
