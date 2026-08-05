# Changelog

All notable changes to GSPS are recorded here, newest first. This replaces
the previous practice of writing a one-off markdown file per release (e.g.
the old `VERSAILLES_DEPLOYMENT.md`) — new entries go here instead.

This project doesn't yet follow semantic versioning; entries are grouped by
date.

## 2026-08-05

### Fixed
- **The daily scan could not save.** Migration `0006` (four price columns
  `NOT NULL`) was applied to production on 2026-08-04 while the writer still
  sent rows with null levels, so Postgres rejected every batch with `23502`
  and the dashboard held the 2026-08-03 lists. `runMarketScan` no longer ranks
  a result that armed no pattern — it has no priced plan — and `buildScanRows`
  filters again before the insert, renumbering ranks so the stored list is
  `1..n`.
- **A failed save used to empty the day.** The write deleted the day's rows
  before inserting the replacement, so a rejected insert left nothing behind.
  Rows are now upserted over the `(scan_date, direction, rank)` key and the
  stale tail pruned afterwards; the previous run stays readable until the new
  one lands. A scan that finds no publishable setup leaves the lists alone
  instead of clearing them.
- **"Scan ran but couldn't save ([object Object])".** A PostgREST error is a
  plain object, not an `Error`, so `String(err)` erased the one thing worth
  reading. `describeDbError` reports message, details, hint and SQLSTATE, and
  the route logs the same line server-side.
- **An unset `CRON_SECRET` looked like an attack.** The cron entry point
  answered `401` whether the caller was unauthorized or the deployment simply
  had no secret configured. The second case now answers `503` and says so —
  Vercel only sends the bearer header when the variable exists, so this is the
  likelier cause of a scan that never runs.

### Removed
- **The mock daily scan.** Migration `0007` unschedules the out-of-repo
  `gsps-daily-scan` pg_cron job. It POSTed a Supabase edge function that fell
  back to a fixed mock universe whenever `GSPS_SCAN_ENDPOINT` was unset —
  every row written between 2026-07-23 and 2026-08-03 carries its arithmetic
  prices (entry `100 + i`, stop `entry - 3`, TP1 `entry + 4`, master profit
  `entry + 8`), which is why SPY was listed entering at $100.00. Real scans
  come from `/api/market-scan` on the Vercel cron. Those 36 rows, across six
  scan dates, have been deleted from `daily_scans`.
- **The edge function behind it.** Unscheduling left the function deployed and
  publicly invokable with `verify_jwt: false`, and its first act was
  `delete from daily_scans where scan_date = today`. Its body is now a stub
  that touches no data and answers `410`, with `verify_jwt` on. The deployed
  source lives at `supabase/functions/daily-scan/index.ts` rather than only in
  the Supabase dashboard — running unversioned code against this database is
  how the mock prices survived unnoticed for two weeks.

## 2026-08-01

### Added
- **MACD study.** A `MACD 12/26/9` toggle next to RSI, using the exact same
  study-pane architecture (histogram + two lines in a dedicated bottom pane
  via `lightweight-charts` panes). New shared `macd()` in `lib/indicators.ts`.
- **Options chain: full greeks, moneyness tranches, and horizon-bounded
  expirations.** Every strike now shows Delta, Gamma, Theta, Vega, Beta, open
  interest and volume on both legs, computed from Black-Scholes at zero rates
  (`lib/options/greeks.ts`) so the numbers are internally consistent with the
  chain's own IV rather than a hand-tuned proxy. Contracts are classified
  ITM/ATM/OTM (`lib/options/contracts.ts`) with a filter that keeps all three
  reachable from one grid. Expiration pickers are capped at 12 months for
  daily-expiry names (SPY/QQQ/IWM) and 24 months for everything else.
- **Click-to-trade strike tickets.** Every strike/side cell in the options
  chain opens a purchase modal (`components/trade/strike-order-modal.tsx`):
  buy/sell, market/limit, quantity, an expiration picker bounded by the
  underlying's horizon, and a live-recalculating preview-cost block (premium,
  per-contract cost at the 100x multiplier, breakeven, max loss).
- **Order history: contract economics, entry greeks, live day P/L, and
  target-hit tracking.** `orders` gained purchase price, contract cost, an
  entry-time greeks snapshot, and `tp1_hit_at`/`mp_hit_at`/`sl_hit_at`
  (migration `0003`). `/api/orders` now enriches every row with a live mark
  and per-target status (`lib/trade/targets.ts`) — hit/reached/pending/none,
  evaluated against the recorded hit first and the live price otherwise — and
  the portfolio page renders it as a three-marker TP1/MP/SL strip (green
  check, green check, red X).
- **Close position.** A working "Close position" action on every open
  position and every leg of a blended group, backed by a new
  `/api/positions/close` route that liquidates at market via Alpaca.
- **Blended position tracking.** Open Positions now groups a broker's flat
  position list by underlying ticker (`lib/portfolio/blend.ts`,
  `lib/portfolio/occ.ts` for OCC symbol parsing), so a shares leg and every
  option contract on the same name render as separate rows under one parent
  container with an aggregate market value / P&L header. The shares leg shows
  avg fill, total shares, current price and equity P/L; each option leg shows
  premium, strike, expiration, greeks (modeled by solving implied vol from
  the position's own live premium) and its own P/L — independently, since
  Alpaca already tracks P/L per leg correctly.
- **Strict `asset_type` flag.** `orders` and `positions` gained a generated
  `asset_type` (`'EQUITY' | 'OPTION'`) column derived from the existing
  `asset_class` (migration `0004`) — one source of truth, not a second flag
  that could drift out of sync. Order history and Open Positions both render
  it as a SHARES/OPT badge.
- **Chart-side trading.** A Buy/Sell quick-action overlay sits directly on
  the chart canvas (ticker pages only — the public/shared chart stays
  read-only). Placing an order from it opens a floating, live-updating P/L
  panel tethered to the chart, tracking the position it just opened.
- **The dashboard scan populates itself.** The "Run market scan" button is
  gone; the bullish/bearish opportunity lists now kick off the scan on
  mount when today's hasn't run yet (`components/scan/auto-scan.tsx`), with
  a manual "Refresh scan" override still available. Guarded so navigating
  between pages doesn't re-trigger it more than once a day per tab.
- **Earnings calendar + Market News.** A monthly calendar
  (`components/macro/earnings-calendar.tsx`) filtered to Fortune-500 /
  major-index names (`lib/macro/universe.ts`), and a Forex-Factory-styled
  news feed (`components/macro/market-news.tsx`) with impact-tier colour
  coding, date headers, and asset tags. Neither has a live data feed wired in
  yet — both generate a deterministic, clearly-labelled demo calendar shaped
  like the real thing (`lib/macro/earnings.ts`, `lib/macro/news.ts`), ready
  to swap for a real provider later without changing the UI.
- Shared `Modal` primitive (`components/ui/modal.tsx`) — portal-based,
  animated enter/exit, used by every new popup (strike ticket, chart trade
  ticket, close-position confirmation) so they transition consistently.

### Fixed
- **Entry/SL/TP1/MP chart lines no longer clip candle bodies.** They were
  solid, full-opacity price lines drawn over the candles; now dashed and at
  35% opacity, so a wick or body crossing one stays fully readable.
- Confirmed the `/api/indicators` 502 (wrong `fetchBars` arity plus
  unresolved `"5m"`-style timeframe strings) is fixed by the prior
  timeframe-alignment change, and hardened it further: the research panel now
  surfaces a real error message instead of silently vanishing when indicators
  fail to load, and a regression test
  (`lib/__tests__/analysis-indicators.test.ts`) exercises the exact call
  shape the route makes.

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
