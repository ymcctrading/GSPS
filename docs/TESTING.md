# Testing

## Running tests

```bash
npm test          # runs the full suite once (vitest run)
npx vitest         # watch mode
npx vitest gann     # run a single file/pattern
```

Test files live under `lib/**/*.test.ts` (see `vitest.config.ts`).

## What's covered today

- `lib/__tests__/gann.test.ts` — Gann analysis (Square of 9, fans, time cycles)
- `lib/__tests__/strat.test.ts` — Strat pattern classification and level detection
- `lib/__tests__/synthetic.test.ts` — synthetic/demo market-data provider

This is unit-level coverage of the deterministic analysis engine — the parts
of the codebase where correctness is easy to assert and expensive to get
wrong silently (a bad scoring change should fail a test, not surface as a
bad live signal).

## What's not covered, and why that's a known gap

- **API routes** (`app/api/**`) — no integration tests yet. These wrap
  external providers (Alpaca, Oanda, Twelve Data, Polygon, SnapTrade,
  Supabase) and would need mocking or recorded fixtures to test
  meaningfully without hitting live rate limits (see
  `docs/THIRD_PARTY_LIMITS.md`).
- **Broker execution** (`lib/brokers/**`) — order placement is currently
  verified manually against paper accounts, not via automated tests. Given
  this touches real trading, an eventual test suite here should exercise
  the AlpacaCreds/mode selection logic and request-building at minimum,
  even without hitting the live API.
- **UI/components** — no component or e2e tests yet.

## Conventions for new tests

- Co-locate as `lib/<area>/__tests__/*.test.ts` or under `lib/__tests__/`,
  matching the existing pattern.
- Prefer testing pure logic (`lib/gann`, `lib/strat`, `lib/scoring`,
  `lib/analysis`) over anything requiring network access. If a test needs a
  live API, it doesn't belong in this suite — use a fixture or mock instead.
- New scoring/pattern-detection logic should ship with a test asserting the
  known-correct output for at least one realistic input, since these are
  the functions most likely to fail silently (wrong number, not a crash).

## CI

There is currently no CI pipeline enforcing `npm test` or `npm run lint` on
push/PR. Until one exists, run both locally before asking for a merge.
