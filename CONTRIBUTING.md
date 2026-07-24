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
4. Merging to `main` does **not** trigger a deployment (see `AGENTS.md`,
   `vercel.json`'s `git.deploymentEnabled: false`). A deploy is a separate,
   explicit step — say which environment (preview or production) when you
   want one.

## Before opening a PR

- `npm run lint` and `npm test` should both pass locally.
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
