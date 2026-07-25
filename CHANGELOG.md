# Changelog

All notable changes to GSPS are recorded here, newest first. This replaces
the previous practice of writing a one-off markdown file per release (e.g.
the old `VERSAILLES_DEPLOYMENT.md`) — new entries go here instead.

This project doesn't yet follow semantic versioning; entries are grouped by
date.

## 2026-07-25

### Fixed
- **Candles now match the timeframe they're labelled with.** The chart's
  timeframe buttons were labelled by lookback window on the higher
  timeframes (`10Y`, `5Y`, `1Y` actually selected monthly, weekly and daily
  candles) and by candle length on the intraday ones — so the row read as
  two different scales, and `1M` was ambiguous between one minute and one
  month. Buttons are now labelled by what one candle covers, with a
  "1 candle = …" caption under the chart.
- **Synthetic bars land on real interval boundaries.** The demo generator
  stamped bars at `start + i × interval`, so a 5-minute candle could open at
  13:37 instead of 13:35, and clamping the bar count left the newest candle
  hours or days in the past. Bars now step back from the candle containing
  "now", on UTC boundaries — with weeks starting Monday, months on the 1st
  and years on Jan 1 rather than a rolling average length.
- **Daily and higher candles no longer render dimmed.** A 1D+ bar is stamped
  00:00 UTC, which is 19:00 the previous day in ET, so the extended-hours
  classifier shaded every one of them as after-hours. Session shading is now
  limited to timeframes whose candles sit inside a single session.
- **`/api/indicators` returned 502 for every request.** It called
  `fetchBars(symbol, timeframe, assetClass)` against a six-argument
  signature, passing the asset class where the start date belongs, and its
  `5m`-style timeframe strings matched no known timeframe. MACD/RSI in the
  research panel now resolve shorthand timeframes and load real bars.

### Added
- **2H, 4H and yearly charts**, alongside the existing 1m/5m/15m/1h/D/W/M.
  Alpaca has no yearly bar, so `1Year` maps to its `12Month` candle.
- **Timeframe registry** (`lib/timeframe.ts`) — one source of truth for each
  timeframe's interval, label, lookback window and bar budget, shared by the
  chart, `/api/bars`, `/api/indicators` and the synthetic provider.
- **History scaled to the timeframe.** 1m/5m load ~15 days (they're read in
  real time), 15m ~2 months, 1h/2h 2 years and 4h/1D 3 years for comparing
  against past support and resistance, and W/M/Y request everything the
  provider has. Charts open framed on the most recent ~180 candles, so the
  deep history is a pan away instead of squashed into one screen.
- Alpaca bar fetches now page newest-first and reverse, so when a window
  holds more bars than the budget allows it drops the oldest ones — a chart
  can no longer stop days short of the current candle.

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
