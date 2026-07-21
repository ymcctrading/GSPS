# GSPS — Global Scanner & Charting Platform System

Robinhood-simple UI, thinkorswim-deep analytics. Automated daily mean-reversion
scanning and multi-asset charting.

> **Phase 0 (this scaffold).** Everything runs in **paper/simulation mode** against
> a deterministic mock data provider. No real market data, no real money, no live
> order routing. Live execution is intentionally gated off pending a licensed
> brokerage partner and compliance sign-off. See `docs/GSPS-Doc-Review-Log.md` for
> the full plan, objections, and open questions.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS** for the "textbook stealth terminal" design system
- **Vitest** for unit tests

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000  (scanner dashboard)
npm run typecheck  # tsc --noEmit
npm test           # unit tests
npm run scan:once  # print a scan run to the console
```

## What's implemented

| Area | Where | Notes |
| --- | --- | --- |
| Market-data seam | `src/lib/marketData/` | `MarketDataProvider` interface + deterministic `MockMarketDataProvider`. Swap in a real vendor without touching consumers. |
| Candle aggregation | `src/lib/candles/` | Session-correct RTH/ETH bucketing in `America/New_York` (DST-aware) — the root fix for the 8-vs-9-candle bug. Tested. |
| Scanner | `src/lib/scanner/`, `src/lib/scanTicker.ts` | Strat Sniper Gate → 9-point checklist (Tier 1 = 8–9/9) → velocity fallback (7/9 + RVOL≥2.0 / ATR expansion) → top-15 bullish/bearish. |
| Scan status/cache | `src/lib/scanner/cache.ts` | Status enum + consumer-friendly loading copy that replaces the dev-facing cron string. |
| Tiers | `src/lib/tiers/` | 4-tier entitlement flags (Practice / Standard / Investor $99 / System Mastery $299). |
| Brokerage seam | `src/lib/brokerage/` | Paper broker only; live mode throws by design. |
| API | `src/app/api/` | `/api/scan`, `/api/batch-scan`, `/api/candles`, `/api/scanner/status`, `/api/scanner/run`. |
| Dashboard | `src/app/page.tsx`, `src/components/` | Live scanner status + bullish/bearish blocks. |
| DB schema | `db/schema.sql` | PostgreSQL DDL for users, tiers, automation dials, order & fee ledgers, scan runs. |

## Scheduling the scan

The mean-reversion scan is meant to run automatically after the close (16:15 ET,
weekdays) — never triggered by end users. In production, point an external
scheduler (Vercel Cron / GitHub Actions) at `POST /api/scanner/run`. See
`src/lib/scanner/cron.ts`.

## Not yet built (see the review log)

Live market data & brokerage integration, payments/billing, WebSocket tick
streams, the full charting UI (needs the reference screenshots — Q-6), drawing
tools / MACD / RSI, and the multi-asset automation engine (Phases A–C).
