# GSPS

GSPS is a Next.js trading platform: a Gann/Strat-based market scanner, live
charting, paper and live order execution (via Alpaca and SnapTrade), and
portfolio tracking, backed by Supabase.

## Stack

- **Frontend/Backend**: Next.js 16 (App Router), React 19, TypeScript
- **Database/Auth**: Supabase (Postgres + JWT auth)
- **Styling**: Tailwind CSS 4
- **Charts**: Lightweight Charts
- **Broker integrations**: Alpaca (paper + live), SnapTrade (external brokerage linking)
- **Market data**: Alpaca, Binance, Oanda, Twelve Data, Polygon — see `docs/MULTI_PROVIDER_SETUP.md`
- **Testing**: Vitest
- **Deployment**: Vercel (Hobby plan — see `docs/THIRD_PARTY_LIMITS.md` and `AGENTS.md` before touching crons or deploy config)

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in the keys you need — see below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With no keys configured,
market data falls back to a synthetic demo provider so the app still runs.

### Environment variables

See `.env.example` for the full list. At minimum for local development with
live data you'll want Supabase and Alpaca paper-trading keys. Optional
providers (Oanda, Twelve Data, Polygon, SnapTrade) are feature-flagged off
until their keys are present.

## Scripts

```bash
npm run dev     # start the dev server
npm run build   # production build
npm run start   # run a production build locally
npm run lint    # eslint
npx vitest      # run the test suite — see docs/TESTING.md
```

## Documentation

- `AGENTS.md` — instructions for AI coding agents working in this repo (deploy rules, cron limits, git workflow)
- `IMPLEMENTATION.md` — system architecture, data flow, key algorithms
- `FEATURES.md` — feature documentation
- `BACKLOG.md` — roadmap
- `CHANGELOG.md` — release history
- `SECURITY.md` — how secrets and credentials are handled, and what to do if one leaks
- `docs/MULTI_PROVIDER_SETUP.md` — market-data provider architecture and setup
- `docs/THIRD_PARTY_LIMITS.md` — plan tiers and rate limits for every external service this app depends on
- `docs/RUNBOOK.md` — what to do when something breaks
- `docs/TESTING.md` — test strategy and how to run the suite
- `CONTRIBUTING.md` — dev workflow conventions
