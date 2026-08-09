# Changelog

All notable changes to GSPS are recorded here, newest first. This replaces
the previous practice of writing a one-off markdown file per release (e.g.
the old `VERSAILLES_DEPLOYMENT.md`) — new entries go here instead.

This project doesn't yet follow semantic versioning; entries are grouped by
date.

## 2026-08-09

### Changed
- **The candle stat panel can be put away, and reads open/close first.** The
  panel docked over the price pane — open, close, high, low, range and volume —
  now has a **Candle stats** checkbox beside Extended hours and Show structural
  levels. It is painted over the chart rather than beside it, so switching it
  off is the one control that hands a corner of the price pane back to the
  candles. On by default.

  Its price grid now reads **open, close, high, low** rather than the
  conventional OHLC. Open and close are the pair that decide whether the bar
  went up or down, so they share the first line; high and low describe how far
  it stretched getting there and sit beneath them. OHLC order splits that first
  pair across both lines, which makes the comparison a reader makes first the
  one the layout makes hardest.

  This replaces the **Volume in readout** switch added earlier the same day —
  a control for one row of a panel that can now be dismissed whole was a
  toolbar slot doing very little. The **Volume pane** switch is unaffected.

- **Volume is a display switch, not an indicator.** Both places the chart draws
  volume can now be turned off from the same row as Extended hours and Show
  structural levels:

  - **Volume pane** — the histogram below price. It was already optional, but
    only as a chip in the indicator strip, which scrolls sideways on a phone
    and spent most of its life past the right edge of the screen. The chip is
    gone; the checkbox replaces it. Still off by default.
  - **Volume in readout** — the VOL row and its meter inside the docked candle
    panel. This had no switch at all. On by default, as before.

  Two switches rather than one because the two cost different things: the pane
  takes height away from the candles and the readout row takes none, so they
  have opposite defaults and one switch could only have honoured one of them.
  The indicator strip keeps the chips for the things that are actually derived
  indicators — the moving averages, Bollinger, RSI and MACD.

## 2026-08-08

### Changed
- **The scoring model stops being published.** The symbol page listed every
  criterion the score tests — twice, as the research tab's checklist and again
  under the protocol signal — each with the threshold it measured and the value
  that passed or failed it. That is the product, printed on the page.

  Both listings are gone, and so is the underlying leak: `/api/scan` and
  `/api/batch-scan` now strip `decision.breakdown` before responding, so the
  criteria are not readable from a network response either. What ships in its
  place is a rollup — points earned per pillar (trend, structure, setup,
  timing, risk/reward) out of points available — which still answers "where did
  this score come from" without answering "what earns one". The scan pipeline,
  the backtest replay and the published `daily_scans` rows are unaffected: the
  breakdown is intact server-side, it just stops at the boundary.

- **The symbol and price stay on screen.** The header on a symbol page pins
  under the app nav instead of scrolling away, so the ticker you are reading a
  chart, ticket or signal against is always in the top-left corner. Only the
  bar's background and border change when it pins — never its contents or
  height, since it is the first element in the flow and anything it gained or
  lost on pinning would jerk the page mid-scroll. Phones drop the turn-window
  note and the regular-close reference from the bar (both still shown in the
  research tab) to keep it to a single line.

### Fixed
- **"Buy a PUT instead" bought a call.** The shortcut offered when a symbol
  can't be sold short sets the option type and opens the options tab in one
  handler, and the chain load read the call/put state from the render that
  created it — still `call` at that point, because `setOptionType` had not
  committed. The chain then selected an at-the-money *call* while the UI showed
  Put selected, so the order submitted the opposite instrument to the one on
  screen. The type is now passed explicitly rather than inferred from state
  that hasn't landed.

  The argument is validated rather than defaulted: the same callback is wired
  straight to the Retry button's `onClick`, which would otherwise hand it a
  MouseEvent as the requested option type.

  Only reachable on a bullish scan — a bearish one already defaults to `put`,
  which is why it survived earlier passes over this component.

### Changed
- **`docs/THIRD_PARTY_LIMITS.md` stopped claiming deploys are manual.** The
  Vercel row still read "Auto-deploy on push is disabled", which `AGENTS.md`
  had already been corrected away from: Git-triggered deploys are on, a branch
  push builds a preview and a merge to `main` releases to production. Two docs
  disagreeing about whether merging is releasing is the kind of thing that gets
  read the wrong way round exactly once.

## 2026-08-07

### Changed
- **The deployment SOP drops its staging phase, and the runbook stops
  promising manual deploys.** Two loose ends from the 2026-08-04 correction.

  The SOP described three phases, the middle one being a staging deployment
  of `main` to `staging.gsps.vercel.app` for final validation before
  production. That gate cannot exist: with `deploymentEnabled: true`, `main`
  *is* production, so validating it after merge inspects a release users are
  already on — and the domain it named was never configured. The phase is
  gone. Its verification checklist was the part worth keeping and now runs
  pre-merge against the PR's preview URL, where it can still change the
  outcome. Two phases remain: Preview (pre-merge) and Production (the merge).
  A real staging setup is written up under Future Enhancements, with the
  two-merges-per-change cost that is why it isn't built.

  Also adds a "landing a change without shipping it" section, since merging
  is no longer a way to do that, and a note on migration ordering — applying
  a constraint before the code satisfying it has shipped is what broke the
  daily scan for four days.

  `docs/RUNBOOK.md` still had two sections claiming deploys never happen
  automatically and that a redeploy must be requested after a revert. Both
  now describe automatic deploys, and rollback leads with promoting the last
  good build rather than reverting, which is faster when the current build is
  the broken thing.

## 2026-08-06

- **The Portfolio's order ledger splits by asset type.** One table served both
  shares and contracts, so every equity row rendered four Greek columns filled
  with em dashes — which reads as "these failed to load" rather than "shares do
  not have a Delta". Shares and contracts now render separate tables with their
  own columns, and option Greeks sit behind a `Show Greeks` toggle that starts
  closed. Both layouts render as cards below the `sm` breakpoint so a phone
  reads top-to-bottom instead of scrolling a fifteen-column grid sideways.

- **Pending orders sort on the broker-accepted time**, falling back to local
  placement time. The two diverge exactly when it matters: an order queued
  before the open is accepted at 09:30, hours after it was placed. Ties break
  on row id so the order does not shuffle between renders.

- **Order statuses render normalized labels.** `accepted_for_bidding` means
  nothing to a first-time user; the six user-facing states are Pending,
  Partially filled, Filled, Rejected, Cancelled and Sync error, each with a
  plain-language description. An unrecognized broker status becomes Sync error
  rather than silently landing in a bucket that looks fine.

### Added
- **A per-candle readout on the chart.** Hovering a candle now reports that
  bar's numbers in a panel docked to the top-left of the price pane: date and
  timeframe, the percentage change across the bar, O/H/L/C in a 2×2 grid, and
  two measure rows — range and volume.

  The measure rows carry the part that reading four prices does not give you
  quickly. Range plots the bar's low→high as a track with the open→close body
  drawn inside it and a notch where the close landed, so "long upper wick,
  closed on the lows" is a shape rather than an arithmetic exercise; a doji
  still shows a sliver. Volume is drawn against its own trailing 20-bar
  average with the 1× mark ruled on the track, which is the only way a volume
  number means anything without the chart's volume study open. The average
  covers the bars *behind* the current one — including it would pull the
  baseline toward the very spike the ratio exists to reveal.

  Docked rather than floating on the crosshair: a panel that chases the
  pointer covers the candles either side of the one it describes, which is the
  context you are reading it against, and on a phone it would sit under the
  thumb. With the pointer off the chart it idles on the newest bar and tracks
  the live close, so it doubles as a legend.

  The maths lives in `lib/chart/readout.ts`, apart from the chart component
  and under test — a body percentage that divides by a zero-range bar, or a
  change taken against the wrong bar, is a wrong number shown with full
  confidence. It indexes the bars actually on screen, so a candle hidden by
  the extended-hours toggle can never be the one reported.

- **Open positions carry the moment they were first opened.** Derived in
  `lib/portfolio/opened-at.ts` from the broker's fill activities, not from an
  order's placement time — a limit order can rest for days before it fills, and
  the position began at the fill. The derivation walks executions oldest to
  newest carrying a signed net quantity, recording the fill that took the net
  off zero and discarding it when the net returns; partial fills and scale-ins
  keep the original timestamp, a flatten-and-reopen starts a new one, and a
  fill that reverses through zero opens the new position. When the replay
  doesn't reconstruct the quantity the broker reports, the history window is
  too short to answer and the cell reads `Unavailable — historical fill data
  missing` rather than dating the position from whatever fill happened to be
  visible. Rendered in Eastern time with the zone named, on both the desktop
  table and the mobile card.

- **A dedicated Rejected Orders section.** Rejections were previously grouped
  with routine cancellations inside a collapsed panel. They now have their own
  always-expanded section carrying the broker's reason, the timestamp, a
  `Fix order` route back to the symbol's ticket, and — where the submitted
  price differs from the requested one — a line saying so.

- **Last-synced stamp and a real Refresh control.** The Portfolio says when the
  order list was last confirmed against the broker and offers a refresh that
  performs a server round trip rather than a client re-render. A failed sync
  says so instead of letting a stale list pass for a current one.

- **Intraday movement scanner** (`lib/scanner/intraday.ts`,
  `/api/intraday-scan`, `components/scan/intraday-alerts.tsx`). The existing
  market scan could not have flagged a large intraday move: it runs twice a day
  on cron (08:30 and 17:30 ET, neither during the session), it is a *reversion*
  screen that selects the direction opposite the trend, and its execution
  timeframe requires an armed reversal pattern on closed 15-minute bars. There
  was no detector for "this moved a lot today", so this adds one.

  Five modes — opening momentum, trend continuation, volatility expansion,
  unusual volume and reversal risk — each sized against the symbol rather than
  a fixed dollar threshold: move size is measured in multiples of the symbol's
  own ATR, and relative volume against a same-time-of-day baseline rather than
  a whole-session average, which would otherwise make every symbol look quiet
  through the morning. Every alert names the reference price and the basis it
  came from, the data timestamp separately from the trigger time, an
  invalidation level, an inspectable confidence breakdown, a continuation plan
  and an opposite-direction pivot plan.

  A per-symbol audit trail records what happened to everything that was *not*
  alerted — evaluated and quiet, filtered on liquidity, suppressed by a
  cooldown, or skipped because its feed was stale. "The scanner missed it" was
  previously unanswerable.

  Served on demand rather than on a schedule: the Hobby plan's two cron slots
  are both spent on the daily market scan, and a scan that needs to run every
  few minutes cannot come from `vercel.json`. The panel refreshes while it is
  open and the footer says so.

### Fixed
- **Orders placed after 31 July never reached the Portfolio.** Two independent
  defects, both in `app/api/orders/route.ts`, and each one alone was enough to
  produce the symptom.

  A rejected order left no trace anywhere. `POST` called `placeOrder` inside a
  `try`, and the `supabase.from("orders").insert(...)` sat *after* it in the
  same block — so a broker refusal threw straight past the insert into the
  `catch`, which returned an error message and wrote nothing. The order had
  never existed at the broker and now did not exist locally either. A day whose
  orders were refused (the DRAM sub-penny rejection, for one) looked like a day
  on which nothing had been submitted. Both paths now write a row; the
  rejection path records `status: 'rejected'` with the broker's reason.

  Nothing ever updated an order after insert. The `status` column was written
  once, from `broker.status ?? "new"`, and no code path revisited it — `GET`
  read straight out of Supabase and `lib/brokers/alpaca.ts#getOrders` was only
  ever called by close reconciliation. Every order ever placed therefore stayed
  Pending forever, whatever had since happened to it at the broker. "Pending
  Positions (22)" was an archive of everything ever submitted, and the newest
  row in it was the newest order that had ever been *accepted* — which is why
  the list appeared to stop on a date. `lib/portfolio/order-status.ts` adds the
  missing half: `reconcileOrders` diffs the local ledger against the broker's
  order list on every load and writes the broker's answer back. Only working
  rows are chased, so a settled ledger costs no broker call.

- **Limit prices are validated against the instrument's increment before
  routing.** `Invalid limit_price 49.755. sub-penny increment does not fulfill
  minimum pricing criteria.` arrived from the broker after the user had already
  committed to the order. `lib/trade/tick-size.ts` applies SEC Rule 612 for
  shares ($0.01 at or above $1.00, $0.0001 below) and the OPRA increments for
  contracts ($0.05 below $3.00, $0.10 at or above, $0.01 only for a class the
  broker confirms trades in pennies), snaps the price, and blocks submission
  when no valid price can be produced or the instrument's metadata is missing.

  The default rounding is conservative by side: a buy rounds down so the fill
  can never be above the price asked for, a sell rounds up so it can never be
  below. The ticket states the corrected price, the rule behind it, and what
  the rounding costs in fill probability — and repeats the corrected number on
  the button, so it cannot be pressed unseen. `Round down` / `Round to nearest`
  / `Round up` are selectable per order.

### Database
- `supabase/migrations/0008_order_lifecycle_reconciliation.sql` adds
  `broker_submitted_at`, `reject_reason`, `last_synced_at`,
  `requested_limit_price`, `tick_size` and `tick_source` to `orders`, plus two
  indexes. Every column is nullable and added with `if not exists`, so the
  migration is safe on a populated table and safe to re-run; a null
  `last_synced_at` reads as "never synced" and the reconciler picks the row up
  on the next load. Rollback is a `drop column if exists` per column — no
  existing column is altered and no data is rewritten.


## 2026-08-05

### Changed
- **The Portfolio tab splits into four sections.** The single flat order
  ledger mixed working orders with settled ones; it now partitions into
  Open, Pending, Closed, and Canceled & Rejected, each with its own header,
  count, empty state, and newest-first ordering. Closed and Canceled &
  Rejected start collapsed, since both grow without bound — an empty one
  drops its toggle and shows its empty state outright.

  No single column answers "is this position open?" — a filled entry and a
  filled exit are indistinguishable in `orders.status` — so the split is a
  derived condition in `lib/portfolio/sections.ts`: order status settles
  working vs. terminal, and a `filled` order is Open or Closed depending on
  whether the symbol is still in the broker's live position list. When that
  snapshot is unavailable (a paper account with no Alpaca keys gets a 503
  from `/api/portfolio` while `/api/orders` keeps serving rows), the list is
  null rather than empty and a filled order stays Open. Reporting a held
  position as closed on the strength of a response that never arrived is the
  more dangerous way to be wrong.

  Canceled and rejected orders never became positions, so they sit outside
  Closed entirely, grouped by how each one ended — canceled, rejected,
  expired, replaced, done for day — with a line explaining each disposition.
  A cancellation is an order pulled after the broker accepted it; a rejection
  is the broker refusing it outright. `rejected` badges red. `stopped` counts
  as Pending rather than terminal: the broker has guaranteed a trade at a
  stated price, but it hasn't happened yet.

### Added
- **React Testing Library.** Vitest now runs two projects: `lib` keeps the
  pure-logic tests in Node, `ui` renders components in jsdom with the
  jest-dom matchers (`vitest.setup.ts`). Rendering behaviour no unit test
  could reach — sections landing in the right panel, empty states, collapse
  toggles, disposition sub-groups — is covered in
  `app/(app)/portfolio/page.test.tsx`.
- **Momentum continuations top up a short direction list.** Refusing to publish
  a row without a trade plan can leave a side with fewer than 15 setups. Rather
  than pad it back out with symbols that have nothing to enter against, the
  daily scan reads a second candidate pool off the same daily bars: trends whose
  range is expanding at least 1.2x its trailing baseline, still holding the
  trend side of their 20-bar mean, with volume behind the move. When — and only
  when — a direction comes up short, the highest-momentum of those are scanned
  with a continuation preference and appended if they arm a `2-1-2` or `3-1-2`
  running the same way the macro timeframes read. `scanTicker` takes an optional
  `ScanPreference` so the pattern chosen, the plan priced from it and the macro
  criterion it is scored on all describe the same trade; a continuation is
  credited for a macro trend running *with* it, where a reversion is credited
  for one running against it. Continuation rows are tagged in the table, carry
  `detail.setupKind`, and are reported per direction as `continuationFills` in
  the scan response. Top-up scans are capped at 24 and split across short sides.
  This matters more now that `MIN_RISK_ATR_FRACTION` sits at `0.75`: roughly
  half as many setups arm, so a side comes up short far more often.

### Fixed
- **"Execute" now always has an order to place.** Seven of the nine confluence
  criteria are context — macro trend, structure, cycles, momentum — and could
  all pass with no pattern armed and no levels computed, scoring 7/9 and
  rendering as Execute with nothing to enter against. Without a priced plan the
  state is held at Watch, with the reason appended to the breakdown.
- **The pattern criterion is named after the trade it describes.** A `2-1-2`
  carrying a trend was scored under "Reversal pattern armed" — the opposite
  trade. Both the criterion and its failing note follow the setup kind.
- **Rows stored before the filter existed no longer render.** `getDailyScans`
  drops any row missing one of the four prices, so the lists correct themselves
  without waiting for the next scan.
- **Empty price columns say why.** A results-table row with no plan reads
  "no trade plan" in the setup column, so four em-dashes can't be mistaken for
  prices that failed to load.
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

## 2026-08-04

### Changed
- **Automatic deploys are back on, and the docs now say so.** `vercel.json`
  was flipped to `"git": {"deploymentEnabled": true}` on 2026-08-03, which
  reversed the 2026-08-01 entry below: pushing a branch builds a preview
  again, and **merging to `main` deploys production immediately**. Four
  documents still described the old manual-only workflow and have been
  corrected — `AGENTS.md`, `CONTRIBUTING.md`, `docs/RUNBOOK.md` and
  `docs/DEPLOYMENT_SOP.md`. The practical consequence, now stated in each:
  a merge to `main` *is* a release, so review and verification have to
  happen before the merge, not between merge and deploy.

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
