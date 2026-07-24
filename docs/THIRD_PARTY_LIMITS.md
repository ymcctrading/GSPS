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
| **Vercel** | Hobby (free) | 2 cron jobs per project, each ≤ once/day. Deployments/builds also capped (see Vercel dashboard for current usage). | Deploy fails, or the cron silently isn't created. | `vercel.json` currently defines exactly 2 crons (`/api/market-scan`, weekdays). Auto-deploy on push is disabled — see `AGENTS.md`. |
| **Supabase** | Free project tier | Row/storage/bandwidth caps per Supabase's Hobby project limits; project pauses after a period of inactivity. | Paused project = the whole app loses its database until manually resumed. | Check the Supabase dashboard for current usage before assuming headroom. |
| **Binance** (crypto data) | Public API | Effectively unlimited for basic market data (public endpoint, no key). | N/A | No auth required; still subject to Binance's general IP rate limiting under heavy load. |
| **Oanda** (forex data) | Practice/demo account | ~1200 requests/min | 429s from Oanda; endpoint returns an error to the caller. | `OANDA_API_KEY` required. Practice account, not live. |
| **Twelve Data** (futures/stocks) | Free tier | 800 requests/day | Requests start failing until the daily window resets. | `TWELVE_DATA_API_KEY` required. This is a *daily* cap, not per-minute — easy to blow through with polling. |
| **Polygon.io** (stocks/crypto/options) | Free tier | 5 requests/min, 1000/month | 429s; monthly cap can be hit well before month-end. | `POLYGON_API_KEY` required. Used as a fallback for futures data. |
| **Alpaca** (market data + trading) | Paper by default; live optional | ~200 requests/min (data API); order rate limits are separate and stricter | Requests throttled/rejected. | Live trading keys (`ALPACA_LIVE_API_KEY`/`SECRET`) hit real markets — see `SECURITY.md` for handling. |
| **SnapTrade** (external brokerage linking) | Whatever tier is configured via `SNAPTRADE_CLIENT_ID`/`SNAPTRADE_CONSUMER_KEY` | Sandbox vs. production have different call/account limits | Feature-flagged off entirely without credentials (`lib/brokers/snaptrade.ts`); with credentials, limits depend on SnapTrade's plan for this app. | Check the SnapTrade partner dashboard for the current plan before assuming production-grade limits. |

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
