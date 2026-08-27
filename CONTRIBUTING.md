# Contributing

GSPS is currently maintained by a single owner, with AI coding agents doing
most of the implementation work under human direction. These conventions
exist so that work stays consistent regardless of who (or what) is writing
the code.

## Workflow

1. Work on a feature branch — never commit directly to `main`.
2. Commit with clear, descriptive messages explaining *why*, not just *what*.
3. Push the branch, then open a pull request against `main`. This is not
   optional: per `AGENTS.md`, a PR follows every push of code changes.
4. Merging to `main` **deploys to production automatically** (see
   `AGENTS.md`, `vercel.json`'s `git.deploymentEnabled: true`). There is no
   separate deploy step and no manual gate: merge when you mean to ship.
   Pushing a branch likewise builds a preview automatically.

## Branch hygiene

Branches outlive their PRs by default, and this repo has accumulated dozens of
them. Three rules keep that from recurring; the first is the one that matters.

1. **Delete the branch as soon as its PR merges.** As of 2026-08-27, GitHub's
   "Automatically delete head branches" repo setting is turned on, so this now
   happens on its own the moment a PR merges — no manual step or agent action
   required. (It only fires on merge; branches from closed-without-merge PRs,
   and anything predating this setting, still need manual or scripted
   cleanup.) If you ever need to delete one by hand — e.g. for a branch whose
   PR was closed unmerged — use GitHub's "Delete branch" button on the PR, or:

   ```sh
   git push origin --delete <branch>
   ```

   A merged branch has no remaining purpose — its commits are in `main` — and
   every one left behind makes the next audit longer.

   **Existing backlog:** the branches this repo accumulated before auto-delete
   was enabled have *not* been cleaned up yet — that cleanup is deferred to a
   later date, deliberately, rather than being done as part of turning the
   setting on. Run `scripts/audit-stale-branches.sh` (rule 3 below) when that
   cleanup happens to see what's safe to remove.

2. **Name the roadmap phase in every PR.** Put `Q1`, `Q2`, `Q3`, `Q4`, or
   `N/A` in the title or body (the PR template has a field for it). The
   `roadmap-phase` gate enforces this. `N/A` is a legitimate answer for a
   production bug, a security fix, docs, or a direct request — `AGENTS.md`
   allows out-of-phase work, it just wants it marked as a deviation. The point
   is that open PRs can be filtered by phase without opening each one.

3. **Audit monthly.** A scheduled job runs on the 1st and posts a report to
   the Actions run summary. Run the same report locally any time:

   ```sh
   git fetch --prune origin && bash scripts/audit-stale-branches.sh
   ```

   It sorts every remote branch into merged (safe to delete, with the delete
   commands ready to paste), stale-and-unmerged (needs a decision — finish it
   or delete it), and active. It never deletes anything itself.

A PR whose branch diverged from `main` more than **30 days** ago fails the
`stale-branch` gate. Merging `main` into the branch and pushing resets the
merge base and clears it. The gate measures divergence rather than the
branch's first commit, because what makes an old branch dangerous is how far
`main` has moved underneath it — merging is a production deploy, and a
three-month-old branch deploys three-month-old assumptions.

## Before opening a PR

- `npm run lint` and `npm test` should both pass locally.
- E2E specs live in `e2e/` (Playwright) and are not wired into CI, since they
  need a live Supabase project — run them locally or against a preview
  deploy with `npm run test:e2e` (set `E2E_BASE_URL` to point at a preview
  instead of spinning up `next dev`). They sign up a disposable throwaway
  account per run rather than relying on shared seed credentials.
- If you touched `vercel.json` crons, re-check `docs/THIRD_PARTY_LIMITS.md`
  — the Vercel Hobby plan caps at 2 cron jobs, once/day each.
- If you touched anything credential- or encryption-related
  (`lib/crypto.ts`, `lib/brokers/**`, anything reading `process.env` for a
  secret), read `SECURITY.md` first.
- If you added a new third-party API call, note its rate limit in
  `docs/THIRD_PARTY_LIMITS.md`.

## Code conventions

- TypeScript throughout; avoid `any` where the real type is knowable.
- Server-only code (broker calls, encryption, service-role Supabase client)
  must never be imported into a client component — see `SECURITY.md`.
- Market data goes through the provider seam (`lib/data/provider.ts`,
  `getMarketDataProvider()`), not directly against a vendor SDK — see
  `lib/data/AGENTS.md`.
- Follow the existing directory structure documented in `IMPLEMENTATION.md`
  rather than introducing a new organizational pattern for similar code.

## Documentation

If a change affects deployment, cron scheduling, environment variables, or
a third-party integration's limits, update the relevant doc in the same PR
(`AGENTS.md`, `docs/THIRD_PARTY_LIMITS.md`, `.env.example`, or the relevant
scoped `AGENTS.md`) rather than leaving it for later — these docs drift
fast otherwise, and this repo has already accumulated stale docs once.
