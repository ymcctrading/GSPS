# GSPS Engine & Backend

Implementation of the GSPS platform upgrades from the 2026-07-21 design document:
scanner waterfall, market-close automation, 4-tier monetization, the multi-asset
automated portfolio manager, and drop-in UI components.

> **Repo status.** The full Next.js app (dashboard, charts, order ticket) is not
> yet connected to this repo. Everything here is built to merge cleanly into that
> app once GitHub is connected: the engine is framework-free, the UI are drop-in
> React components, and the Supabase changes are **already applied live**.

## What's live right now (Supabase project `vebhpmmzxixlhujlptue`)

| Change | Status |
| --- | --- |
| `platform_tier` on `profiles` + `user_automation_profiles` | ✅ applied |
| Multi-asset `asset_class` (option/future/forex/commodity) | ✅ applied |
| `platform_transaction_revenue_ledger` + fill trigger | ✅ applied |
| `scan_runs` status table (dashboard state) | ✅ applied |
| `daily-scan` edge function (waterfall) | ✅ deployed (ACTIVE) |
| `gsps-daily-scan` cron — weekdays 20:15 UTC | ✅ scheduled |

SQL mirrors live in `supabase/migrations/`; revert with
`supabase/migrations/ROLLBACK.sql`.

## Layout

```
engine/                     framework-free, unit-tested core
  scanner/                  mean-reversion waterfall (Strat gate → 8/9 → 7+velocity → top 15)
lib/scanTicker.ts           core per-ticker scan engine (scores a symbol → Execute/Watch/Reject)
lib/providers/              market-data providers (Alpaca live feed + env-based resolver)
  tiers/                    4-tier entitlement matrix + FeatureGate helpers
  automation/               MultiAssetAutomationController, OptionsChainParser,
                            RiskPositionSizer (TS + Py), AssetLifecycleEngine (trailing stops)
  market-data/              MarketDataIngestor (live WS + simulated fallback)
ui/                         drop-in React components
  ActivePositionTicket.tsx  NinjaTrader live-P/L HUD (tap to cycle $/%/pts, MARKET EXIT/REVERSE)
  AutomationControlPanel.tsx risk/bias/volatility dials (mobile-first)
  ScannerResultBadge.tsx    gold (8-9) / flame (7+velocity) badges
  FeatureGate.tsx           tier paywall overlay
  lib/pnl.ts                P/L math (unit-tested)
supabase/
  migrations/               applied schema + ROLLBACK.sql
  functions/daily-scan/     market-close cron edge function
docs/CHARTING_SPEC.md        charting spec grounded in the Webull reference set
route.ts, batch-route.ts     existing /api/scan handlers (pre-existing; see below)
```

## The scanner waterfall (the twice-emphasized rule)

`engine/scanner/waterfall.ts` — for **each** of the bullish/bearish lists:

1. **Hard gate** — drop anything failing the Strat sniper/snapper barrier.
2. **Tier 1** — pristine setups scoring **8 or 9**.
3. **Tier 2** — only if <15, open to score **exactly 7** with **RVOL ≥ 2.0 or ATR
   expansion**.
4. **Rank & slice** — score desc, RVOL tie-break, **top 15**.

Wire it into `batch-route.ts` by mapping each `scanTicker` result to a
`ScannedAsset` (`score`, `passesStratBarrier`, `direction`, `relativeVolume`,
`atrExpansion`) and calling `processProtocolReversions(universe)`.

## 4-tier model (`engine/tiers/entitlements.ts`)

| Tier | Price | Monetization | Unlocks |
| --- | --- | --- | --- |
| Practice | $0 | none (sandbox) | paper trading, manual orders |
| Standard | $0 | per-trade micro-fee | live execution, streaming, ETH toggle |
| Investor Mode | $99/mo ($990/yr) | fee + sub | drawing tools, MACD/RSI, signals, tactical levels, **scanner** |
| System Mastery | $299/mo | fee + sub | tick streams, webhooks, **autonomous portfolio manager** |

Live trading + the full manual order suite are always free; subscriptions pay for
intelligence and automation.

## Market data

There are two data seams, both simulated-by-default and swappable to live:

- **Scanner** — `lib/scanTicker.ts` scans through a `MarketDataProvider`.
  `lib/providers/resolveMarketDataProvider()` returns the live **Alpaca** feed
  when credentials are set, else the deterministic simulated feed.
- **Streaming automation** — `engine/market-data/marketDataIngestor.ts` auto-falls
  back to a high-fidelity simulated random-walk feed; set `MARKET_DATA_WS_URL` +
  `MARKET_DATA_API_KEY` to flip to a live WebSocket provider.

### Going live with Alpaca (one config change)

1. Create an Alpaca account (https://app.alpaca.markets) and generate an API
   **Key ID** + **Secret**. Start with **paper** keys — real prices, fake money.
2. Set them where the app runs — no code change:

   ```bash
   ALPACA_API_KEY_ID=...        # from the Alpaca dashboard
   ALPACA_API_SECRET_KEY=...
   ALPACA_FEED=iex              # optional: iex (free) | sip (paid)
   ```

   Locally: copy `.env.example` → `.env`. In production: Vercel env vars (for the
   `/api/scan` routes) and, if the cron hits a different host, Supabase secrets.
3. That's it — every scan (single, batch, and the daily cron via
   `/api/batch-scan`) flips to the live Alpaca feed. With no keys, it stays on the
   simulated feed so the pipeline always runs.

`lib/providers/alpacaProvider.ts` computes `price`, `previousClose`,
`relativeVolume`, and ATR from real Alpaca daily bars. The 0-9 rule checklist and
Strat gate are a transparent, tunable first pass (each rule is a named technical
confirmation, documented inline) — swap in the full proprietary Strat/Gann rules
when ready. Execution (placing orders) is a separate, later step; this wires up
live **data** only.

## Develop

```bash
npm install
npm test          # vitest — 63 tests (scanTicker, alpacaProvider, waterfall, entitlements, automation, pnl)
npm run typecheck # tsc --noEmit
```

## Environment / secrets

- Scanner live feed: `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, optional
  `ALPACA_FEED` (see `.env.example`). Absent → simulated feed.
- Edge function reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-provided),
  optional `GSPS_SCAN_ENDPOINT` (the app's `/api/batch-scan`) and `CRON_SECRET`.
- Never commit broker or market-data keys — use Supabase function secrets / Vercel
  env vars. `.env` is gitignored; only `.env.example` (no values) is tracked.

## Notes for integration (when GitHub connects)

- The two root files `route.ts` / `batch-route.ts` pre-date this work and import
  `@/lib/scanTicker` — now provided by `lib/scanTicker.ts`, so both handlers
  resolve and run against the engine (deterministic simulated feed until a live
  `MarketDataProvider` is passed). They belong under `app/api/scan/` and
  `app/api/batch-scan/` in the Next.js app; the `@/` alias resolves `@/lib/...`
  to `lib/...` at the project root. To build the dashboard board, map each
  `scanTicker` result (already a `ScannedAsset`) through
  `processProtocolReversions(universe)`.
- `docs/CHARTING_SPEC.md` is the blueprint for the charting fixes (NOK candle bug,
  OHLC tooltip, timeframe ladder, ETH bands, MACD/RSI) — frontend work that lands
  once the app source is here.
