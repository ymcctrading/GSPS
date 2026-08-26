# Third-Party Service Limits

GSPS runs on free/low tiers of several external services. Each one has a
ceiling, and hitting one unexpectedly has already broken a deploy once (see
`CHANGELOG.md` — the Vercel cron incident). This doc exists so the next
ceiling is caught before it breaks something, not after.

**Rule of thumb:** before adding a new scheduled job, a new polling loop, or
a new provider call site, check this table for the relevant service and
confirm you're still under its limit.

| Service | Current plan | Limit | What happens if exceeded | Notes |
|---|---|---|---|---|
| **Vercel** | Hobby (free) | 2 cron jobs per project, each ≤ once/day. Deployments/builds also capped (see Vercel dashboard for current usage). | Deploy fails, or the cron silently isn't created. | `vercel.json` now defines **2** crons — `/api/market-scan` (17:30 ET weekdays) and `/api/trade-journal/daily-email` (18:00 ET weekdays, 2 hours after close) — **both of 2 slots are now spent.** The 08:30 ET run of the market scan moved to GitHub Actions (`.github/workflows/premarket-scan.yml`) to free the slot the journal digest now uses; see below. `/api/intraday-scan` needs to run every ~15 minutes during the session, well past the 1-run/day cap, so it's scheduled the same way: `.github/workflows/intraday-scan.yml` calls it with `CRON_SECRET`, outside `vercel.json` entirely — it still also serves on-demand requests from a signed-in user's Scanner tab, same as before. That workflow now carries a second, always-on `*/15` schedule covering weekday overnight and the whole weekend (2026-08-21, alongside adding BTC/USD and ETH/USD to the watchlist) — the equity-hours run scans the full watchlist, the off-hours one passes `?universe=crypto` and scans crypto alone, since equities can't have moved while their market is shut. That's roughly 4x the GitHub Actions minutes this workflow used before; GitHub Actions itself has no row in this table yet because nothing had pushed it close to a real limit until now — worth watching if a private-repo minutes cap becomes a concern. **Any future scheduled job must use the GitHub Actions pattern below instead of `vercel.json` — there is no cron slot left.** Git-triggered deploys are **on**: a branch push builds a preview and a merge to `main` releases to production — see `AGENTS.md`. |
| **Supabase** | Free project tier | Row/storage/bandwidth caps per Supabase's Hobby project limits; project pauses after a period of inactivity. | Paused project = the whole app loses its database until manually resumed. | Check the Supabase dashboard for current usage before assuming headroom. |
| **Binance** (crypto data) | Public API | Effectively unlimited for basic market data (public endpoint, no key). | N/A | No auth required; still subject to Binance's general IP rate limiting under heavy load. |
| **Oanda** (forex data) | Practice/demo account | ~1200 requests/min | 429s from Oanda; endpoint returns an error to the caller. | `OANDA_API_KEY` required. Practice account, not live. |
| **Twelve Data** (futures/stocks) | Free tier | 800 requests/day | Requests start failing until the daily window resets. | `TWELVE_DATA_API_KEY` required. This is a *daily* cap, not per-minute — easy to blow through with polling. |
| **Polygon.io** (stocks/crypto/options) | Free tier | 5 requests/min, 1000/month | 429s; monthly cap can be hit well before month-end. | `POLYGON_API_KEY` required. Used as a fallback for futures data. |
| **Alpaca** (market data + trading) | Paper by default; live optional | ~200 requests/min (data API); order rate limits are separate and stricter | Requests throttled/rejected. | Live trading keys (`ALPACA_LIVE_API_KEY`/`SECRET`) hit real markets — see `SECURITY.md` for handling. |
| **SnapTrade** (external brokerage linking) | Whatever tier is configured via `SNAPTRADE_CLIENT_ID`/`SNAPTRADE_CONSUMER_KEY` | Sandbox vs. production have different call/account limits | Feature-flagged off entirely without credentials (`lib/brokers/snaptrade.ts`); with credentials, limits depend on SnapTrade's plan for this app. | Check the SnapTrade partner dashboard for the current plan before assuming production-grade limits. |
| **Finnhub** (analyst rating, ticker Company tab) | Free | 60 requests/min, no card required | Calls beyond the limit 429; `lib/data/finnhub.ts` treats any failure (missing key, 429, network error, timeout, wrong plan) as "no data" and falls back to the tab's simulated value for that request — never a broken page. | `FINNHUB_API_KEY` required; unset = fully simulated. Confirmed live 2026-08-19: `/stock/recommendation` (analyst rating) works free-tier; `/stock/price-target` 403s free-tier despite Finnhub's docs listing it as free — it needs a paid plan, so price target stays simulated on this key regardless. Short interest and institutional/13F ownership are **not** on Finnhub's free tier either and stay simulated. |

## Caching as the first line of defense

`lib/data/*` providers each implement a short in-memory TTL cache
(10–15 seconds) specifically to avoid re-hitting a rate-limited provider on
every request. If you're adding a new call site for an existing provider,
route it through the existing provider module rather than calling the
vendor API directly — you'll get the cache for free.

## When you actually need more than a free tier allows

Prefer, in order:
1. **Cache more aggressively** or reduce polling frequency in the calling code.
2. **Move frequent/scheduled calls outside Vercel Cron** to an external scheduler (e.g. a GitHub Actions cron job hitting the route over HTTPS) rather than upgrading Vercel — cheaper, and Vercel's cron limit isn't a data-provider limit anyway.
3. **Upgrade the specific service's plan** only once you've confirmed the above two don't solve it — and only with explicit sign-off, since it's a recurring cost.

### One Vercel cron slot is free; the other run moved to GitHub Actions

`vercel.json` used to spend both of the Hobby plan's 2 cron slots on
`/api/market-scan` (one pre-market run, one post-close run). Both runs are
still needed — the endpoint's inputs and RUNBOOK guidance around
`pricedBeforeSession` depend on it firing at both times — so freeing a slot
meant moving one run off Vercel Cron entirely rather than dropping it.

The 08:30 ET / 12:30 UTC pre-market run now fires from
`.github/workflows/premarket-scan.yml` (GitHub Actions schedule), calling
`/api/market-scan` over HTTPS with the same `CRON_SECRET` bearer auth the
route already checks for the native Vercel cron. The 17:30 ET / 21:30 UTC
post-close run — the more time-sensitive of the two, since it feeds the next
session's list — stays a native `vercel.json` cron, since Vercel's scheduler
is more punctual than GitHub Actions' (which can run several minutes late
under load, sometimes more; see `crontap`/Vercel community reports on GitHub
Actions cron drift). The pre-market run tolerates that slack because the
route reads bars as of a fixed prior close regardless of the exact minute
it's called.

**This requires two things set outside this repo, neither of which any tool
available to this codebase's agent can configure — both need to be done by
hand in GitHub → Settings → Secrets and variables → Actions:**
1. Repository secret `CRON_SECRET` — same value as the Vercel project's
   `CRON_SECRET` env var, so the workflow's bearer token matches what the
   route checks.
2. Optionally, repository variable `PRODUCTION_URL` if the production
   domain isn't `https://gsps.vercel.app` — the workflow falls back to that
   default otherwise.

Without secret (1) set, the workflow runs on schedule but every invocation
gets a 401 from the route — check the Actions tab for the workflow's run
history if the pre-market scan looks like it stopped firing.

That left **1 of 2 Vercel cron slots free** for the next daily job, which is
now spent: `/api/trade-journal/daily-email` (18:00 ET weekdays) emails each
user their trade-journal spreadsheet 2 hours after the close — see
`lib/journal/build-workbook.ts`. **Both Vercel cron slots are now in use.**
Any further scheduled job — daily or otherwise — needs the external-scheduler
pattern instead, option 2 above, and the `premarket-scan.yml` file as a
template:

```yaml
name: External cron — <name>
on:
  schedule:
    - cron: '<schedule>'
  workflow_dispatch:
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X GET "https://gsps.vercel.app/api/<route>" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

No route needs this yet beyond the pre-market scan above — add a job when a
real one (token refresh, reconciliation) exists, rather than standing up an
unused workflow now.
