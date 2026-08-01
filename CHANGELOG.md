# Changelog

All notable changes to GSPS are recorded here, newest first. This replaces
the previous practice of writing a one-off markdown file per release (e.g.
the old `VERSAILLES_DEPLOYMENT.md`) — new entries go here instead.

This project doesn't yet follow semantic versioning; entries are grouped by
date.

## 2026-08-01

### Added
- **Trading-logic invariants.** `computeTradeLevels()` now rejects any scan
  where master profit isn't strictly more extreme than TP1, or TP1 isn't
  strictly more extreme than entry, in the trade direction — a real gap
  where a wide structural target could otherwise land past the Gann-capped
  master profit. The failure surfaces through the existing scan error path
  (`outputState: "Reject"`) rather than displaying a corrupt signal.
- **2-2 reversion confirmation gate** (`applyReversionConfirmation` in
  `lib/scoring/score.ts`). A bare `2-2` reversal that would otherwise score
  into "Execute" is downgraded to "Watch" unless both momentum/volatility
  and a historical support/resistance level confirm it. Compound patterns
  (`1-2-2`, `3-2-2`, `2-1-2`, `3-1-2`) are unaffected.
- **Data retention config** (`lib/config.ts`): a single
  `DATA_RETENTION_WINDOW_YEARS`/`_LABEL` pair, now surfaced on the Settings
  page and documented in `SECURITY.md`, so future retention-policy copy has
  one source instead of being hardcoded per surface.
- **Portfolio: filled/pending order split.** The merged "Order history"
  table is now two sections — Filled and Pending — each showing the called
  entry/SL/TP1/MTP levels captured at order time (already stored in
  `orders` but not previously rendered) alongside the actual fill price and
  quantity for filled orders.
- **SL-hit notifications.** `/api/portfolio` now attaches the most recently
  called stop-loss per symbol (from bracket orders), and the portfolio page
  compares it against live price on its existing 10-second poll, raising a
  browser notification and an in-app banner the moment a position's stop is
  hit — previously silent.

### Known limitation
- The per-trade record does not yet show "which levels were actually hit
  vs. manually overridden" or realized P/L after close — `trade_logs` has
  the right columns (`exit_condition`, `outcome`, `profit_loss_dollars`)
  but nothing in the app writes to it yet. That's a separate follow-up:
  wiring position-close events into `trade_logs`.

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
