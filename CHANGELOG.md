# Changelog

All notable changes to GSPS are recorded here, newest first. This replaces
the previous practice of writing a one-off markdown file per release (e.g.
the old `VERSAILLES_DEPLOYMENT.md`) — new entries go here instead.

This project doesn't yet follow semantic versioning; entries are grouped by
date.

## 2026-08-17

### Added
- **Guided Decision Mode** (`/guided`) — one recommended action per symbol,
  sized from a per-trade risk cap rather than from a quantity the user types,
  placed through a single confirmation dialog. Paper-only and long-only at
  launch; only Execute-verdict setups with a priced trade plan are eligible;
  candidates are re-scanned live at render *and* again at submission, so a plan
  that de-armed or re-priced in between is refused rather than placed. Caps ship
  conservative: 1% of paper equity risked per trade, 3 new positions a day, 10 a
  rolling week, and no more than 25% of equity deployed through the mode at
  once. A connected live brokerage disables the mode entirely. Every
  recommendation *shown* — not only those acted on — is logged to
  `guided_recommendations` so the Backtest-style expectancy analysis can later
  be pointed at the guided stream itself. Every cap is editable in Settings
  (`/api/settings/guided`), within bounds the mode enforces on both sides. See
  `docs/GUIDED_DECISION_MODE.md`.
- **A liquidity floor on every scan** (`lib/scan/liquidity.ts`): US equities
  need a price of at least $5 and 500k average daily shares; crypto needs $5M of
  average daily turnover. The daily market scan gates both its candidate pools on
  it, and the intraday scanner records it in its per-symbol audit trail. The
  scanner had been surfacing sub-$1 names alongside megacaps with nothing on the
  row to distinguish them.

### Security
- **Cleared the database security advisors** (migration 0014). The three
  `learning_*` tables are service-role-only and had RLS enabled with no
  policies, which denies everything — correct, but indistinguishable from an
  oversight. They now carry an explicit restrictive `using (false)` policy for
  `anon` and `authenticated`, and the table grants for those roles are revoked
  so the denial survives RLS ever being switched off by accident. Effective
  access is unchanged: the service role does not consult policies.
- `pg_net` was registered against the `public` schema. All twelve of its
  functions actually live in `net`, so nothing callable sat on the public search
  path, but the registration is what governs where a future version would put
  things. It is non-relocatable, so it was dropped and recreated into
  `extensions` inside one transaction. Nothing depended on it — no cron jobs, no
  database webhooks, no referencing function bodies.
- Migration 0013's policy statement is now re-runnable (`drop policy if
  exists` ahead of the `create`), matching what was applied to the database.

### Changed
- Merged `main` (#72, #73, #74), which had landed overlapping work while this
  branch was open. Three reconciliations worth naming, because a careless merge
  would have reverted shipped fixes:
  - `lib/trade/place-order.ts` was **re-extracted from main's** post-#72/#73
    handler rather than kept as this branch's copy of the pre-#72 one. The
    stale copy would have silently reverted both short-side staged exits (#72)
    and filling a marketable limit at the market price (#73) the moment the
    route started delegating to it.
  - This branch's `tickerHref` (single segment, hyphen-encoded pair) is dropped
    in favour of main's catch-all `[...symbol]` route and `lib/routes.ts`
    helper, which shipped first. The round-trip test this branch wrote is kept
    and retargeted at main's helper, which had none.
  - `MIN_SCAN_PRICE` is now an alias of the platform-wide
    `MIN_EQUITY_PRICE_USD` rather than a second $5 that can drift from it. The
    absolute average-volume floor sits alongside it and is explicitly *not* the
    relative-volume gate reverted in `6a34f33` — that one failed a symbol for
    trading below its own trailing average, which half of all symbols do at any
    moment.
- Order placement moved out of the `/api/orders` route handler into
  `lib/trade/place-order.ts`, so Guided Mode submits through exactly the same
  path the manual ticket does — same price-increment validation, same bracket
  checks, same staged protocol exit — rather than through a copy of it that
  would drift.
- The phone tab bar renders seven of the eight destinations; Glossary keeps its
  place in the top bar and gives up its tab slot to Guided.

### Fixed
- **The daily market scan kept ranking sub-$5 penny stocks (OSRH, GRAB, …)
  alongside real setups, and could rank a "Sell" setup on a symbol Alpaca
  won't let anyone short (ONDS scored 7/9 "Execute" the same day its own
  order ticket refused the short and pointed at a put instead).** Neither
  gate had ever existed in `runMarketScan` — the only prior liquidity/volume
  gate was reverted in `6a34f33` for unrelated reasons (it coin-flipped on
  volume, not price or borrow), and shortability was checked only client-side,
  lazily, in the order ticket, never during scanning/ranking. Added two
  independent gates in `lib/marketScan.ts`: a flat `MIN_SCAN_PRICE` ($5, the
  SEC's own penny-stock line) applied in the coarse pass before either setup
  kind is scored, and `filterShortable`, which checks Alpaca's per-symbol
  `shortable` flag for the bearish list only (going long never needs a
  borrow) and drops rows the broker would reject on submission. Both fail
  toward showing a shorter, honest list rather than a padded one: an
  unreachable broker leaves the shortability check open (same direction as
  the `/api/assets` preflight the ticket already uses) instead of blanking
  the whole bearish list. Tests added
  (`lib/__tests__/market-scan-filters.test.ts`).

### Added
- **Short and Manual Override orders can now carry a staged, managed exit.**
  Protocol Recommended shorts attach the protocol's stop/TP1/master the same
  way a long does — GSPS stages and manages the exit itself
  (`lib/trade/exit-manager-sim.ts` already supported `side: "short"`; the
  `/api/orders` route just never exercised it). Manual Override gets optional
  custom stop-loss/take-profit fields, on both sides, that stage the same way.
  Closes the gap where a short or a manual order carried no protection beyond
  ticket copy telling the user to watch it by hand (Q1 roadmap: conditional
  orders).
- Dashboard "Buy setups"/"Sell setups" preview cards now show a "Scanned
  HH:MM" timestamp, so a card can't silently disagree with a fresher scan
  without the user knowing.
- A short position with no broker-side stop now carries a persistent "No
  stop" badge in the Portfolio order ledger, not just easy-to-miss ticket copy.
- A soft nudge appears next to Quantity when submitting qty=1 in Protocol
  Recommended mode ("Buy 2+ to use the full staged-exit plan").

### Fixed
- **A marketable limit order filled at its stale limit price instead of the
  live market, so an "advised price" short placed after the market had
  already rallied past its entry filled instantly at a worse price than what
  was on offer — reading as an immediate paper loss the moment the ticket
  confirmed.** `isMarketable` correctly judges a sell limit marketable once
  `market >= limitPrice` (and a buy limit once `market <= limitPrice`), but
  both fill paths (`POST /api/orders`'s synchronous fill and
  `evaluateRestingOrders`'s resting-order sweep) then filled at the order's
  own limit price rather than the market price that made it marketable.
  Marketable by definition means the market is already at least as good as
  the limit, so both now fill at the live market price — the same price
  improvement a real broker reports, and the fix for the case that motivated
  it: an ASML short's advised entry at $1,877.79 filled while the market was
  already at $1,886.38, instead of getting that better price.
- **`/ticker/BTC/USD` — one of only 9 symbols in the default watchlist —
  404'd.** The dynamic route was a single `[symbol]` segment, so `/USD` split
  off as an extra path segment. Switched to a catch-all `[...symbol]` route
  and added a shared `tickerHref()` helper (`lib/routes.ts`) so every link
  builder encodes a slash-bearing symbol consistently instead of ad hoc
  `encodeURIComponent` calls (or none) scattered across five components.
- Settings/Glossary described TP1/Master as flat 2:1/3:1 reward-to-risk; the
  scoring engine actually targets ~1.5R (TP1, snapped to the prior candle's
  high/low if further) and ~2.5R equities/3R crypto (Master, snapped to a
  structural/harmonic level) — copy now matches. Also documented the
  `tradePlanReady` gate: a 7+ score with no armed entry/stop/target reads as
  Watch, not Execute, which the settings/glossary text didn't explain.
- The chart Share button's Web Share path returned without ever flashing the
  "Copied" confirmation, so a successful native share looked like nothing
  happened.

- **Settings and the landing page advertised a reward:risk the engine has never
  priced.** TP1 was described as 2:1 and the master target as 3:1; the engine
  prices TP1 at 1.5R and the master at the asset class's runner multiple (2.5R
  equities, 3R crypto), stepped to a structural level up to a 5R cap. The stop
  rule was described as "12–18% of price paid", which is the option-premium band
  and was never how a share entry's stop is placed. All four protocol rules are
  now generated from the engine's own constants (`lib/trade/protocol-rules.ts`)
  and a test fails if the copy and the code diverge.
- **"Execute threshold: score 7+ of 9" did not describe what the app does.** A
  7-scored setup is correctly held at Watch when it has no priced trade plan,
  when a bare 2-2 reversal lacks momentum and support/resistance confirmation, or
  when the price feed is a full execution candle behind — so users saw 7s
  labelled Watch and nothing reaching Execute, with no stated reason. The
  behaviour was right; the copy now states every condition.
- **Links to a crypto pair 404'd.** `/ticker/${symbol}` on `BTC/USD` produced
  `/ticker/BTC/USD` — two path segments against a one-segment route. Links now go
  through `tickerHref`, which keeps the pair in one segment, and the page
  restores the separator via `symbolFromRoute`. Percent-encoding is not a fix:
  `%2F` is normalised back to a slash before the route matches.
- The `settings` table's `tp1_r_multiple` / `master_r_multiple` defaults (2 and
  3) now match the engine (1.5 and 2.5). Existing rows are untouched.
- **The bars-batching fix below this same day silently dropped most of the
  scan universe, cutting a normal 8-20-setup day down to one lone `Reject`
  row.** `fetchBarsBatch`'s `limit` param is a total across every symbol in
  the multi-symbol request, sorted symbol-then-timestamp — not a per-symbol
  cap, contrary to what the batching fix assumed. A 100-symbol chunk asking
  for a year of daily bars (~250/symbol, ~25k total) blew through the
  10k-per-page ceiling in one page, which came back with bars for only the
  first ~38 symbols and nothing at all for the rest — every one of those
  silently read as "insufficient data" and got dropped everywhere
  downstream (coarse candidates, the full pass, continuations). Fixed by
  draining `next_page_token` per chunk until exhausted, merging each page's
  per-symbol bars — the same pattern the single-symbol `fetchBars` already
  used, just not carried over to the batch path. Regression test added
  (`lib/__tests__/alpaca-batch.test.ts`) simulating a response split across
  two pages.

- **The market scanner had produced zero results for 72 hours and had grown
  from ~5s to 60s+ per run.** Two compounding regressions:
  - `runMarketScan` fetches bars one HTTP request per symbol per timeframe —
    ~700 Alpaca requests for a full scan (100-symbol coarse pass × 2
    timeframes, up to 60 shortlisted symbols × 6 requests, up to 24 top-up
    scans × 6 requests). A rate limiter added in #68 to stop recurring 429s
    (`lib/data/http.ts`) correctly throttles that volume to Alpaca's real
    ~150-200/min cap, but that makes the *total* volume the actual problem:
    at the throttled rate the scan takes minutes, and the route silently
    outlives Vercel Hobby's 60s function ceiling before it can persist
    results — every cron run died mid-scan with nothing saved, though the
    logs gave no indication anything was wrong.
  - Fixed by batching: `fetchBarsBatch` (`lib/data/alpaca.ts`) fetches many
    symbols' bars for one timeframe in a single Alpaca request (it accepts a
    comma-separated symbol list), and `fetchAllTimeframesBatch`
    (`lib/data/provider.ts`) does this across all five scan timeframes at
    once for a symbol set. `runMarketScan`'s coarse, full, and continuation
    passes now batch-fetch up front instead of looping `scanTicker`/
    `fetchBars` per symbol; `scanTicker` accepts the pre-fetched bars and
    skips its own fetch when given them. Cuts a full scan from ~700 requests
    to roughly 100, comfortably finishing well inside both Alpaca's rate
    limit and the 60s function cap.
  - A separate, already-fixed regression (`extended_hours=true` added to
    intraday bar requests on 2026-08-15, which Alpaca's bars endpoint
    rejects with a 400) had been the actual cause of the empty results for
    the ~36 hours before the rate limiter landed; scans were completing
    fast but every bar fetch was failing and getting swallowed into an
    empty result set. Removed the param — it's an order-placement field, not
    a bars-query one.

### Changed
- **Renumbered the two colliding migration filenames.** `0003` named both
  `order_greeks_and_targets.sql` and `positions_side.sql`; `0008` named both
  `intraday_alerts.sql` and `order_lifecycle_reconciliation.sql` — one file
  per PR, merged independently, neither branch aware the number was taken.
  Both pairs had already been applied to production safely, under distinct
  Supabase-assigned versions, so this is a repo-only rename: `positions_side`
  → `0017`, `order_greeks_and_targets` → `0018`, `intraday_alerts` → `0016`.
  (The renames originally targeted `0013`–`0015`; those numbers were taken by
  Guided Decision Mode and the security remediations while this branch was
  open, and `0015` is claimed by the guided short-side migration in flight, so
  the batch moved up to the next free numbers rather than re-creating the
  collision this change exists to remove.)
  Left as a genuine duplicate, either pair was a `supabase db push` landmine:
  that tool tracks applied migrations by the leading number, so a real
  duplicate is read as "the second file is already applied" and silently
  skipped.
- **Verified the full migration backlog against production, table by table
  and column by column** — every table, check constraint, unique index and
  RLS policy in `supabase/migrations/0005`–`0012` and the renamed `0016`
  matches what's live, with the one exception below. Nothing needed
  (re-)applying; this was reconciliation, not a deploy.
- **`0005_learning_brain.sql`'s invalid `learning_coefficients` constraint
  was already fixed** — by the time this reconciliation reached it, the file
  in the repo already used a `create unique index ... coalesce(...)`
  instead of a table-level `UNIQUE` over expressions, which Postgres
  rejects. Confirmed the index that's live matches the file exactly.
- **`supabase/AGENTS.md` updated**: the table list was current as of
  migration `0004` and eleven tables behind; now lists all twenty-three,
  grouped by what added them. Adding-a-migration steps now say to check
  `ls supabase/migrations/` for the real next number rather than trusting
  the last commit you saw, and to confirm a migration actually landed
  (`list_migrations`) before merging — a file in the repo is a claim about
  the database, not a guarantee.

## 2026-08-16

### Fixed
- **Paper trading is now simulated per-user instead of sharing one real Alpaca
  paper account across every signed-in user.** A brand-new signup landed in
  the same portfolio as every other account — the same shares, the same cash,
  the same open positions — because every "paper" route resolved credentials
  from a single set of server env vars (`envCreds("paper")`) rather than
  anything user-specific. `lib/brokers/simulator.ts` replaces that: a market
  order (or a marketable limit) fills synchronously against the live
  market-data feed already used elsewhere in the app, debits/credits a new
  per-user `paper_accounts.cash` balance, and writes straight to this app's
  own `positions`/`orders` tables — both already RLS-scoped by `user_id`, the
  same isolation every other per-user table relies on. A non-marketable limit
  order rests and is evaluated against live price on each poll
  (`evaluateRestingOrders`).
- The staged protocol exit (60% at TP1, 20% at the master target, the rest on
  a trailing stop — see the 2026-08-13 entry) is reworked for the simulator in
  `lib/trade/exit-manager-sim.ts`: since there's no external broker for the
  profit tranches to rest at, each tranche's fill is evaluated and executed
  directly against live price on every poll, using the same rule logic
  (`lib/trade/protocol-exit.ts`) unchanged. A conditional claim on each
  tranche's order-id column stops two overlapping polls from double-filling
  (and double-crediting cash for) the same tranche.
- Cash updates move through a single atomic `increment_paper_cash` Postgres
  function (migration `0011`) rather than a read-then-write from application
  code, which would otherwise lose an update when two fills for the same user
  land close together.
- Trade logs for paper trades are now written already settled — a simulated
  fill's price is known the instant it happens, so the old pending → broker →
  settle two-step (`lib/portfolio/trade-log-settle.ts`, still used for live
  trading) is bypassed entirely for paper.
- **Options now try a live per-contract quote before falling back.**
  `fetchOptionLatestTrade` (`lib/data/alpaca.ts`) reads Alpaca's options
  trades endpoint for a market fill and for marking an open option leg's
  P/L; the ticket's known premium, then the underlying's spot, are the
  fallbacks when no live options data is available (no subscription on the
  account, or the contract hasn't traded recently) — this app still has no
  guaranteed options quote feed, only a best-effort one.
- **A plain sell that closes a position outside the dedicated "Close
  position" action is now logged too** — a resting limit order filling, or a
  plain sell placed straight through the order ticket. `logPlainClose`
  writes the trade log directly from the fill, skipping it only when a
  working `protocol_exits` plan already owns the symbol (that log is
  written once, blended, when the whole plan finishes).
- **Position writes are now atomic too.** `execute_position_fill` (migration
  `0012`) locks the position row with `for update` for the length of a fill,
  closing the same class of race `adjustCash` closed for cash: two fills for
  the same user+symbol landing close together — a resting order filling on
  one poll while a fresh order for it is submitted on another — now
  serialize on the lock instead of one clobbering the other's read.
  `exit-manager-sim.ts`'s tranche fills go through the same atomic path
  instead of duplicating the position/cash mutation.

## 2026-08-15

### Added
- **Structural levels now say support or resistance, not just "structural."**
  Gann fan lines and Square-of-9 levels carry a `role` — support while price
  sits above the line, resistance while below — computed fresh from current
  price so the label never goes stale as price crosses it. Every proximity
  criterion's note also says which timeframe the level is best used on
  (daily structure for fan/harmonic levels, the level's own timeframe for
  historical S/R), matching how the scan pipeline already separates macro
  context from execution timing.
- **Continuations are scouted every scan, not only when reversions fall
  short.** The coarse continuation gate now requires a genuine range *and*
  volume spike in the most recently closed 4-hour bar (`hasExceptional4hMomentum`),
  and every run scans a small guaranteed allotment of continuation candidates
  per direction even when the reversion list already filled — reversions still
  get scanned first and keep priority.
- **Closed positions are deleted 24 hours after they close**, not kept
  indefinitely. `pruneClosedPositions` removes the `positions` row once
  `closed_at` is more than a day old; `pruneClosedOrders` removes the
  matching `orders` rows once they're filled, no longer held, and untouched
  for 24+ hours — both run on every Portfolio/Orders poll. `trade_logs` is
  unaffected: its `position_id`/`order_id` columns are `on delete set null`,
  so the analytics record survives even though the raw ledger row doesn't.
- **Intraday bars now include extended-hours trades live.** `/api/bars`
  (and the chart it feeds) omitted the `extended_hours=true` parameter on
  Alpaca bar requests, so pre/post-market prints were dropped from intraday
  candles entirely and only reappeared the next day once the daily bar
  backfilled from the consolidated tape. Pre/post-market now shows up on the
  chart as it happens.

### Changed
- **"Bullish"/"bearish" setup labels read as "Buy"/"Sell"** wherever the UI is
  telling someone which side to trade — the dashboard, results table, signal
  card, order ticket, and automation directional-bias control. Trend-context
  displays (the multi-timeframe trend grid) are unchanged, since a trend
  reading isn't a trade instruction.

## 2026-08-13

### Added
- **Protocol orders now exit themselves, in stages.** "Attach protocol levels"
  used to place one Alpaca bracket: the whole position left at TP1, or the whole
  position left at the stop. That is not the protocol, and a user who scaled out
  by hand was doing the work the checkbox implied was automatic. Four rules now
  run, in the order they bind:

  1. **The stop takes the user completely out.** Every tranche carries the same
     stop price, so a stop-out closes the trade in full.
  2. **TP1 takes 60% out.** Whole shares, never rounded up to the entire
     position — a "60% scale-out" that exits everything is a full exit wearing
     the wrong name.
  3. **The master target takes half of what is left** (20% of the original).
     The last 20% keeps running until the user closes it, or until price pushes
     through the master target and falls back through it, which closes the
     remainder.
  4. **Once TP1 is reached the stop never sits below the entry again**, and from
     there it trails the best price seen by one unit of the trade's original
     risk. It only tightens. A trade that has proved itself cannot come back as
     a loss.

  The ticket states the real share counts before the order is placed
  (`3 of 5 shares (60%) exit at TP1, 1 at the master target, 1 runs on behind a
  trailing stop`), because the wording it replaced described a different order.
  A single share cannot be scaled out of and says so rather than rounding to
  100%.

  **Why the exits are not a bracket.** A bracket attaches to an entry and an
  entry carries one, so three tranches would need three bracketed buys — and
  Alpaca refuses a buy while a sell is working on the same symbol ("potential
  wash trade detected"), which would reject the second and third. The entry
  therefore carries a single full-size stop, attached atomically because it is
  the rule that caps the loss, and the profit tranches go on as sell-side OCO
  orders once the shares are held (`lib/trade/exit-manager.ts`). The tranche
  orders rest at the broker as GTC, so rules 1–3 fill whether or not the app is
  running.

  **What depends on the app being open.** Rule 4 and the reversal half of rule 3
  cannot be resting orders: both depend on where price has *been*. They advance
  on a pass that runs inside `GET /api/orders`, which the Portfolio polls. So
  between polls the protection in the market is the last stop that pass placed —
  never nothing, but never tighter than the last sample either. The ticket says
  this rather than implying a tick-by-tick trail. New `protocol_exits` table
  (migration `0009`) holds the levels, tranche order ids, the best price seen,
  and the stop currently resting; `GET /api/orders` reports what each pass did.

  **Correctness hardening from review, before this ever ran against a live
  account:**
  - The exit tranches attach only once the entry order has *stopped* filling
    (`entryStillFilling`) — attaching against a partial fill would have locked
    the split in permanently and left later fills with no stop and no exit
    orders at all.
  - A concurrent poll (a second tab, or a request outliving the interval) no
    longer double-attaches a plan: `claimAttach` marks the plan as claimed,
    with a database-level conditional update, before the entry's stop is
    cancelled.
  - An attach that fails completely — the entry's stop cancelled and every
    replacement rejected — no longer marks the plan as attached. That used to
    freeze it forever with zero resting protection: nothing would ever close a
    position that's still open, and `exits_attached_at` being set meant the
    attach itself would never retry.
  - The master-target reversal no longer arms on the master tranche's own
    fill. It requires price to trade *past* the target, not just touch it, and
    the trigger sits at the target rather than one tick inside it — the
    previous version could close the runner on the very next tick of ordinary
    noise, the moment the master tranche itself filled.
  - `classifyExit` (`lib/portfolio/reconcile.ts`) now recognizes the staged
    exit's own order shapes — a plain stop, an OCO limit — instead of only
    Alpaca brackets. Every protocol exit was settling as `manual` with no
    signal adherence recorded at all.
  - `"replaced"` status is no longer read as "dead" (an entry that never
    filled) or as "still resting" (a stop safe to replace) — it means a
    *different* order took over, whose id this app doesn't have, and treating
    it as either abandoned a plan or replaced a stale, already-superseded
    order.
  - `planProtocolExit` no longer produces a phantom order for a non-finite or
    zero/negative quantity (`Math.max(1, NaN)` used to become an order for
    `"NaN"` shares).
  - A manual close's trade-log row now always carries the plan's *original*
    quantity, not just what that particular call closed. Settlement consumes a
    row's fills oldest-first up to its declared quantity; a row that
    under-declares (the remainder after TP1 already took some shares) got
    satisfied by TP1's own earlier fill and never reached the fill the manual
    close actually produced — reporting the wrong exit price, timestamp and
    P/L sign.
  - A genuinely partial manual close (some, not all, of what's held) no longer
    retires the plan — it kept abandoning the trailing-stop management on
    whatever remained.
  - Two independent writers finishing the same plan at nearly the same moment
    (a poll's own completion, and a manual close) can no longer produce two
    trade-log rows: `trade_logs.exit_plan_id` is unique where not null, so the
    database — not a check-then-insert race in application code — decides the
    loser.
  - The `exits` payload `GET /api/orders` was already computing (what moved,
    what failed) is now shown on the Portfolio page (`ExitActivity`) instead of
    being silently dropped.

### Fixed
- **A staged protocol exit's trade log had nothing to complete it, and no
  single-fill exit price could describe it correctly anyway.** The
  2026-08-11 fix wired `reconcilePositions` into `GET /api/portfolio`, so a
  plain position's full close is recorded there with a real exit price. That
  approach cannot describe a staged exit: `reconcilePositions.recordClose`
  prices the *entire* original quantity off whichever single closing order
  happened to fill *last* — right for one fill, wrong the moment a position
  leaves in three tranches at three different prices (60% at TP1, part of the
  rest at the master target, a runner behind a trailing stop).

  So the staged exit gets its own settlement path rather than reusing that
  one. A close writes the trade log the moment it happens — from the broker's
  own position (entry price, quantity, side) read *before* the liquidation —
  with the exit left empty, because at that instant the order has been
  accepted, not filled. `settlePendingTradeLogs`
  (`lib/portfolio/trade-log-settle.ts`) then matches each pending row against
  the broker's fill activities and writes back the *quantity-weighted* exit
  price across every tranche that closed it, realized P/L and P/L percent, and
  which protocol level produced the exit. `GET /api/trade-log` settles before
  it reads, so the log is completed by the act of looking at it. A row it
  cannot complete stays pending and is *counted* as pending in the response —
  a trade still holding a runner is not finished, and a fabricated exit price
  in an audit trail is worse than an absent one.

  The two systems are partitioned so they never write the same trade twice:
  `lib/portfolio/reconcile.ts`'s `recordOpen` now skips creating a `positions`
  row for any order carrying an `exit_plan_id` (see the staged-exit entry
  above), which means that symbol's close is structurally invisible to
  `reconcilePositions` — the new settlement path owns it end to end instead.
  `/api/positions/close` picks between the two the same way: a protocol-managed
  symbol logs its own close and defers to `settlePendingTradeLogs`; a plain
  one is left for `reconcilePositions`, exactly as it was on 2026-08-11.

  `/api/portfolio/close` was a second, unused implementation of the close
  route; it is now an alias for `/api/positions/close` rather than a second
  place for this logic to drift out of sync. `POST /api/trade-log` also
  stopped claiming to return the row it inserted — it never selected one back,
  so `tradeLog` was always undefined.

### Changed
- **The verdict ladder inverts out of sample, and nothing is being re-weighted
  until that is understood.** Two more runs over the same six symbols, on 1Hour
  bars, which reach back two years where 15Min reaches back sixty days:

  | Run | Window | Trades | Execute | Watch | Reject | All |
  |---|---|---:|---:|---:|---:|---:|
  | 15Min, 2R | 2 months | 1,033 | **+0.013R** | −0.072R | −0.081R | −0.062R |
  | 15Min, 3R | 2 months | 1,033 | **+0.132R** | −0.126R | — | −0.084R |
  | 1Hour, 2R | 2 years | 3,631 | **−0.230R** | +0.038R | +0.086R | +0.026R |
  | 1Hour, 3R | 2 years | 3,631 | **−0.289R** | +0.057R | +0.061R | +0.030R |

  Yesterday's baseline said Execute was the one bucket above water and read as
  the score doing its job. On a sample twelve times larger the order reverses at
  both targets: Execute is the worst bucket and Reject among the best. The
  honest reading is that **the score has not been shown to select for
  anything**, and that the comfortable result was also the smallest and
  shortest one.

  So the change this was heading towards — promoting the master target to the
  recommended exit, on the strength of Execute's +0.132R at 3R — is **not
  made**. The evidence it rested on did not survive the first attempt to
  reproduce it. `docs/BACKTESTING.md` carries the table and what would settle
  it; `docs/REPLAY_RESULTS_1H_2R.md` and `_1H_3R.md` carry the runs.

### Added
- **`--since` / `?since=`, to hold the period still while the timeframe moves.**
  The two runs above differ in execution timeframe *and* in period, because each
  timeframe carries its own lookback — so they cannot say whether the inversion
  belongs to the timeframe or to the market it covered. `since` trims the
  execution bars to a fixed start while leaving the daily bars that feed the
  score untouched, which turns two variables into one. An unparseable value is
  rejected rather than ignored: a silently dropped start would publish two years
  of trades under a heading claiming two months.

### Security
- **`GET /api/backtest` requires a session.** It was unauthenticated — the
  middleware matcher excludes `/api`, and unlike `/api/scan` the route had no
  check of its own. A request walks every bar of every symbol, holds a function
  open for the whole run, and spends vendor quota metered per project rather
  than per caller, so one URL was an unauthenticated way to exhaust both. It now
  returns `401` without a session.

  `/learning` joins `PROTECTED_PREFIXES` in `proxy.ts` for the same reason: it
  is the page that calls this endpoint, and left public it would render a page
  whose only button 401s. `/automation` stays off that list deliberately — it
  authenticates and tier-gates itself in the server component.

## 2026-08-12

### Added
- **The baseline run exists.** `docs/REPLAY_RESULTS.md` said "no live run has
  been recorded yet" since the harness was built. It is now a real run on live
  Alpaca bars — SPY, AAPL, AMD, TSLA, MSFT, NVDA on 15Min over
  2026-06-15 → 2026-08-12, 3,351 setups armed and 1,033 triggered — and
  `docs/REPLAY_RESULTS_3R.md` is the same window at the master target.

  | At 2R (break-even 33.3%) | Trades | Win rate | Expectancy | Total |
  |---|---:|---:|---:|---:|
  | Execute | 126 | 34.1% | +0.013R | +1.6R |
  | Watch | 843 | 31.2% | −0.072R | −61.0R |
  | Reject | 64 | 31.3% | −0.081R | −5.2R |
  | **All** | 1033 | 31.6% | −0.062R | −64.5R |

  | At 3R (break-even 25.0%) | Trades | Win rate | Expectancy | Total |
  |---|---:|---:|---:|---:|
  | Execute | 126 | 28.6% | **+0.132R** | +16.6R |
  | Watch | 843 | 22.1% | −0.126R | −106.0R |
  | **All** | 1033 | 23.1% | −0.084R | −86.5R |

  So the question the PDF's blank cell left open has an answer, and it is not
  the one either arm of that arithmetic guessed. Taken as a whole the protocol
  is **negative at both targets** — 31.6% against a 33.3% break-even at 2R,
  23.1% against 25.0% at 3R. What is positive is Execute, and only Execute:
  +0.132R per trade at the master target, on 126 trades. The verdict ladder
  also orders correctly at both targets (Execute > Watch), which is the first
  direct evidence that the score separates anything at all.

  Two cautions the numbers carry themselves. 126 trades over a two-month window
  on six large-caps is one market regime, and +0.013R at 2R is indistinguishable
  from zero. The window is short because `15Min` history is the binding limit,
  not a choice.

- **`npm run backtest -- --from <payload.json>`.** The credentials are not
  always where the checkout is: this container has no vendor keys, and the
  deployment that has them returns exactly the `BacktestReport` the renderer
  consumes. `--from` renders a captured run instead of performing one, saves the
  payload beside the report (`docs/replay-runs/`) so every figure stays checkable
  against the response that produced it, and applies the same two refusals — a
  captured synthetic run is no more publishable than a local one.

  `refuseReason` is now its own exported function rather than two inline blocks,
  and `lib/__tests__/replay-report.test.ts` covers it and the renderer: the
  synthetic and no-trade refusals, the above-break-even column, empty buckets
  dashed rather than reported as 0.0%, and the reproduce line being built from
  the report rather than from whichever flags the process was handed.

## 2026-08-11

### Fixed
- **`trade_logs` rows from a full position close no longer get stuck on
  `pending`.** A market close order is often accepted-but-unfilled in the
  response `/api/positions/close` gets back from the broker, so writing the
  audit row immediately meant recording a guess — and nothing ever revisited
  that row,
  because the same code also marked the local `positions` ledger closed on
  the spot, which hid it from the one function built to fix this up:
  `reconcilePositions` (`lib/portfolio/reconcile.ts`) diffs the live broker
  book against that ledger and, on noticing a position gone, pulls the real
  filled closing order and writes a `trade_logs` row with the actual exit
  price, P/L and exit condition (`tp1` / `stop_loss` / `manual`) — but it had
  **zero callers**, so none of that ever ran.

  Now wired into `GET /api/portfolio`, which the Portfolio page already polls
  every 10 seconds, so every full close — a bracket TP/SL fill or the
  "Close position" button — gets its trade_logs row from there instead, with
  a real fill price rather than a placeholder. `/api/positions/close` no
  longer writes a row or marks the position closed for a full close; it
  still does both for a **partial** close, since `reconcilePositions` can
  structurally never see one (the position shrinks, it doesn't disappear) —
  previously it *also* marked a partial close as fully closed, which would
  have made the next reconciliation poll treat the still-live remainder as a
  brand-new position once this wiring went in. `isFullClose`
  (`lib/portfolio/trade-log.ts`) makes the split explicit and testable.

  `reconcilePositions` also went from swallowing every write failure
  silently (the Supabase client resolves with `{ error }`, it does not
  throw) to surfacing them: each write now throws on an error response, the
  position-close write is reordered after the trade_logs write so a failure
  leaves the row eligible for retry on the next poll rather than lost
  forever, and the route surfaces a `sync.reconciled` / `sync.reconcileError`
  summary the same way `/api/orders` already reports its own sync outcome.

## 2026-08-10

### Correction
- **`CRON_SECRET` is set on Vercel production, correcting the 2026-08-09
  entry below.** That entry's `503` finding was accurate at the time — the
  Vercel dashboard now shows the variable present and scoped to Production
  and Preview. No `GET /api/market-scan` has yet been observed at either
  cron window (`12:30`/`21:30` UTC) in the runtime logs, so whether the
  scheduled run now succeeds is still unconfirmed, not yet disproven; the
  original entry is left as written below rather than edited, per this
  file's own convention, since it was true when recorded.

## 2026-08-09

### Fixed
- **The liquidity hard-reject gate is split back out of the score.** PR #45
  added two things together: scaling the bracket's minimum gap with price
  (kept), and a hard gate that rejected any setup whose trailing 20-day
  volume trailed its own prior 80-day average unless volatility was
  elevated. By construction roughly half of all symbols fail that
  comparison at any given moment, including the most liquid ones — it read
  AAPL in a quiet week as a 0-confluence Reject while letting a thin
  small-cap with a volume spike through, and it thinned the daily lists
  hardest on the quiet days a mean-reversion protocol expects to find
  setups on. Reverted (`lib/scoring/score.ts`, `lib/scanTicker.ts`,
  `lib/backtest/replay.ts`) so the volume/liquidity idea can be redesigned
  and reviewed on its own; the bracket-gap fix is untouched.

- **`persistDailyScans` now prunes a direction with zero new rows, instead
  of leaving the previous run's list in place.** If today's scan finds no
  bearish setups, the previous run's bearish rows described a different
  day's tape and shouldn't keep publishing as if the current scan still
  stood behind them. `lib/scan/publish.ts` no longer skips the delete when
  a direction wrote nothing — `rank > 0` clears the whole direction for
  that date in that case.

- **Orders were failing in production since the reconciliation columns
  were never migrated.** `app/api/orders/route.ts` writes
  `broker_submitted_at`, `reject_reason`, `last_synced_at`,
  `requested_limit_price`, `tick_size` and `tick_source` on every order,
  but migration `0008_order_lifecycle_reconciliation.sql` had never been
  applied to the live database — confirmed live in the runtime logs as
  `Could not find the 'broker_submitted_at' column of 'orders' in the
  schema cache` on every reconciliation pass. Applied directly.

### Database
- Applied `0008_order_lifecycle_reconciliation.sql` (`orders` gains
  `broker_submitted_at`, `reject_reason`, `last_synced_at`,
  `requested_limit_price`, `tick_size`, `tick_source`, plus two indexes),
  which shipped in the repo but was missing from the live database.

### Known issue
- **The market-scan cron has never fired successfully.** `CRON_SECRET` is
  not set on the Vercel production project — confirmed by an unauthenticated
  `GET /api/market-scan` against `https://gsps.vercel.app`, which returns
  `503 {"error":"CRON_SECRET is not configured on this deployment"}` rather
  than `401`. Every `daily_scans` row landing on schedule so far has come
  from `components/scan/auto-scan.tsx` — a client-side effect that POSTs to
  the same endpoint whenever a signed-in user loads the dashboard and
  today's scan is missing — not from the Vercel Cron in `vercel.json`. That
  also explains the off-schedule write times (06:17, 19:58, 23:23 UTC
  instead of 12:30/21:30): those are page loads, not cron ticks. Needs a
  `CRON_SECRET` value set in the Vercel project's environment variables;
  no tool available in this session can set it.

### Added
- **A committable backtest run.** `npm run backtest` replays the shipped entry
  logic over a stated universe and writes `docs/REPLAY_RESULTS.md` with every
  cell filled — trades, win rate, expectancy and total R per verdict bucket,
  the factor table, and the stop-width bands. It refuses to write a report from
  synthetic bars or from a run with no trades, because a complete and confident
  table describing a seeded random walk is exactly how a placeholder becomes a
  published finding.

  A run now also reports the **window it actually covered** (from the bars
  returned, not the lookback requested) and the **break-even win rate for its
  target**, `1 / (1 + targetR)`. That second number is why the previous
  headline decided nothing: 29% is a losing system at a 2R target (break-even
  33.3%) and a winning one at 3R (break-even 25%), and the cell that separated
  them was blank.

- **Weight proposals from attribution.** All nine criteria were worth one point,
  which was a placeholder rather than a measurement, while
  `lib/backtest/attribution.ts` already produced the number a weight should be
  set from. `POST /api/learning/propose-weights` — and the **Proposed weights**
  panel on `/learning` — splits a run chronologically, keeps only criteria whose
  expectancy gap holds up on the later half and agrees in sign, sizes the move
  off the weaker half, caps the step, and renormalises the set to nine points so
  the Execute and Watch cutoffs keep their meaning. The result is saved as a
  **draft** and changes no score until a human promotes it to live. Not on a
  Vercel cron, and documented as needing an external scheduler: the Hobby plan's
  two daily crons are already spent, and a replay is far too slow for one.

### Changed
- **"Near a level" is measured in ATR, not percent of price.** The three
  structural proximity criteria gated on fixed percentages — 1.5% for a support
  line, 1.0% for a harmonic level, 1.5% for historical support/resistance. On a
  5%-ATR name that is a third of a day's range and the point is nearly free; on
  a 1%-ATR name it is more than a full day's range and the point is genuinely
  selective, so a 7/9 did not mean the same thing across the universe — and the
  bias ran towards volatile names, which the momentum criterion also rewards.
  The bands are now 0.5× the daily ATR (0.33× for the harmonic level, the same
  ratio the fixed pair expressed). This is the move the stop placement already
  made in `lib/strat/levels.ts`.

- **Delayed data is a scoring input, not a chart footnote.** Stocks run ~15
  minutes behind on the free feed, which is a *full candle* on the 15-minute
  execution timeframe — an armed trigger can already have come and gone before
  it renders. A scan now computes that lag against the execution bar, states it
  on the signal card, and holds Execute at Watch when it runs a whole bar or
  more *while the market is open* — with the market shut the lag is still
  reported but nothing can have come and gone behind it, so the daily post-close
  scan is unaffected. Crypto and the synthetic generator carry no delay, and
  `MARKET_DATA_REALTIME=true` turns the hold off for a paid real-time feed.

- **The learning tables have writers.** `recordScanEvent`,
  `recordSignalLifecycleEvent` and `recordExecutionEvent` had no callers outside
  the route that defined them, so nothing was ever recorded and the 100- and
  50-sample training floors were unreachable forever. Verdicts are now recorded
  on `/api/scan` for signed-in callers, order outcomes (including rejections) on
  `/api/orders`, and exits on `/api/positions/close` — which also writes the
  `trade_logs` row that endpoint has never had a writer for. Recording never
  fails the request it is recording, and is inert without a service-role key.

  Relatedly, `modelConfidenceScore` took `features` and never read it, so how
  well a setup matched the model had no bearing on how much the model was
  trusted. It now scores scope against the setup in front of it and discounts
  conditions the model cannot speak to.

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

### Added
- **The dashboard says how old its prices are.** `getDailyScans` returns the
  newest scan in the table whatever its age, and nothing said so: a Friday list
  rendered identically to this morning's. The four price columns are
  15-minute-bar levels — an entry a penny beyond a signal candle, a stop a penny
  beyond the other side — so outside their own session they are meaningless, and
  they still look precise. `scanFreshness` counts the sessions between the scan
  and now, and `StaleScanNotice` states it on the dashboard and both direction
  lists: a quiet line at one session behind, a red warning from two. Age is
  counted in sessions, so a Friday scan does not read as stale on Saturday.

- **The pre-open scan says it is one.** The 12:30 UTC cron fires at 08:30 ET, an
  hour before the open, and the scan reads *closed* 15-minute bars — so its
  levels are drawn on the previous session's tape, then filed under today and
  written over the previous evening's list. By date alone it looked like the
  freshest thing available. `pricedBeforeSession` reads `detail.scannedAt` (now
  carried on every row) and the dashboard says so. The 17:30 ET run is also
  outside market hours but reads that day's bars, so it is not flagged.

### Fixed
- **The learning brain's schema now exists.** Migration `0005` had never been
  applied: `learning_coefficients` declared its scope key as a table-level
  `UNIQUE` over `coalesce()` expressions, which Postgres rejects — only bare
  column names are allowed there — so the file failed on parse and all seven
  tables were missing while `lib/learning/db.ts` queried them. The key is now a
  unique index, which does permit expressions. Applied to production, along with
  `0008`, whose `scan_events` foreign key was the reason it could not run either.
  The intraday alert cooldown works from here.
- **Three system tables were reachable with the publishable key.**
  `learning_models`, `learning_coefficients` and `learning_audit_log` carry no
  `user_id`, so `0005` left RLS off — which in a Supabase project means
  PostgREST serves them to anyone. RLS is on with no policy attached: the
  service role still writes them, nothing else reads them. The linter reports
  that as `rls_enabled_no_policy` at INFO; it is deliberate.
- **One definition of the trading day.** `scan_date` was the UTC date, but the
  sessions it describes are Eastern. The two disagree between 20:00 ET and
  midnight, so a post-close re-run was filed under tomorrow — and tomorrow then
  opened on tonight's levels with nothing marking them old. The scan, the
  freshness reading and the auto-scan guard now all date themselves with
  `etDateKey`, which moves to `lib/market/session.ts` as the single
  implementation the intraday scanner also uses.
- **A direction the scan found nothing in is cleared, not left standing.** The
  prune had been skipped when a side came back empty, on the reasoning that
  wiping it would erase the earlier run. It would — and that is the point: the
  rows left behind are ones the current scan no longer endorses, rendered under
  the current scan's date with no way for a reader to tell. The case that skip
  was protecting is already handled: a run that resolves no symbol at all
  produces zero rows on both sides and returns before touching the table.

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
