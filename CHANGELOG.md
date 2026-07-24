# Changelog

All notable changes to GSPS are recorded here, newest first. This replaces
the previous practice of writing a one-off markdown file per release (e.g.
the old `VERSAILLES_DEPLOYMENT.md`) — new entries go here instead.

This project doesn't yet follow semantic versioning; entries are grouped by
date.

## 2026-07-24

### Fixed
- **Vercel cron limit compliance.** Removed the crypto/futures/forex crons
  from `vercel.json` — the project has been on the Vercel Hobby plan, which
  caps cron jobs at 2 per project (each running at most once/day), while
  the project had 5 configured. The three removed crons also weren't
  accomplishing anything: they fetched live data on a schedule but nothing
  persisted the response. Only the two daily `/api/market-scan` crons
  remain, which is exactly at the plan limit. See
  `docs/THIRD_PARTY_LIMITS.md`.
- **Disabled automatic deploys.** Added `"git": {"deploymentEnabled": false}`
  to `vercel.json` so pushes and merges no longer trigger automatic preview
  or production deployments. Deploys are now always explicit — see
  `AGENTS.md`.

### Added
- MACD and RSI technical indicators (`/api/indicators`), displayed in the
  ticker research panel.
- **Versailles release**: trade logging system (`trade_logs` table,
  `/api/trade-log`), scanner tab restoration (Magnificent 7, Forex,
  Futures), options trading (Greeks, bid/ask, strike-group filtering, paper
  and live purchase support), and real-time portfolio tracking
  (10-second refresh).
- Multi-provider market data scanner: Binance (crypto), Oanda (forex),
  Twelve Data (futures/stocks), and Polygon.io (fallback), normalized to a
  shared `UnifiedMarketData` schema. See `docs/MULTI_PROVIDER_SETUP.md`.
- Documentation overhaul: `SECURITY.md`, `docs/THIRD_PARTY_LIMITS.md`,
  `docs/RUNBOOK.md`, `docs/TESTING.md`, `CONTRIBUTING.md`, `LICENSE`, scoped
  `AGENTS.md` files under `app/api/`, `lib/data/`, `lib/brokers/`, and
  `supabase/`; consolidated the multi-provider implementation docs into a
  single `docs/MULTI_PROVIDER_SETUP.md`.

## 2026-07-23

### Added
- Market-data provider seam (`lib/data/provider.ts`) with a synthetic demo
  fallback, so the app renders live-looking charts with no API keys
  configured.
- Chart drawing tools, additional market tabs, alerts, and public chart
  sharing.
- Pinned the Vercel framework preset to Next.js so production serves the
  app correctly.

## 2026-07-21

### Added
- Initial scaffold: Next.js 16 app, Supabase auth, Gann/Strat scan engine.
- Daily market scan (`/api/market-scan`) and its Vercel Cron configuration.
- Accepted alternate Alpaca environment variable names (`ALPACA_KEY_ID`,
  `APCA_API_KEY_ID`, etc.) to survive naming mismatches across
  environments — see `lib/brokers/alpaca.ts:envCreds`.
