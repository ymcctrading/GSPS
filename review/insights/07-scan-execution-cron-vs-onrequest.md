# Change 07 — Scan Execution Model (Cron+Cache vs. On-Request)

**Type:** Change (architecture) / Decision to confirm
**Priority:** Medium-High (affects cost, latency, and correctness)

## Problem
The current `batch-route.ts` runs a **live scan on every HTTP request** —
`Promise.all(tickers.map(scanTicker))` fires on each call.

But *7-21-26 for Claude code* §4 explicitly requires the opposite:
> "The scanning engine will run completely server-side, triggered automatically
> precisely at market close. The results will be parsed, cached, and immediately
> available to populate user dashboards prior to the next pre-market session."

And the dashboard is meant to show a *cached* status message
("Analyzing market close data… New setups will go live shortly"), not compute
on demand.

## Why it matters
- **Cost:** every dashboard load re-scanning 9+ assets against a live data feed
  multiplies API/data costs and rate-limit pressure.
- **Consistency:** users should all see the *same* daily setups, computed once at
  close — not slightly different results depending on when they loaded the page.
- **Latency:** a cached read is instant; a live 9-asset scan is not.

## Recommendation
Split into two paths:
1. **Scheduled batch (the default dashboard source):** a cron job at market close
   computes the 15 mean-reversion setups, writes them to a cache/table, and the
   dashboard reads from there. This is First Task #2.
2. **On-request scan (ad-hoc only):** keep the live `?ticker=` / `?tickers=`
   endpoints for a user manually scanning a specific symbol on demand — but this
   is not what populates the main dashboard.

## Action
- [ ] Confirm the market-close-cron + cache model for the dashboard.
- [ ] Choose the schedule store (e.g. Vercel Cron / Supabase scheduled function).
- [ ] Keep the live endpoints for manual one-off scans only.
