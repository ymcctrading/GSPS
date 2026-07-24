# lib/data — Market Data Providers

## The provider seam

Anything that needs price/bar data for the scan pipeline or chart tabs goes
through `getMarketDataProvider()` in `provider.ts` — never import a vendor
module (`alpaca.ts`, `synthetic.ts`) directly outside this seam. Selection
order:

1. `MARKET_DATA_PROVIDER=alpaca|synthetic` env override
2. Alpaca, when its credentials are configured
3. Synthetic demo data (so a public chart still renders with no keys)

If you add a new provider that should participate in this seam (i.e. it can
serve `fetchBars`/`fetchLatestPrice` for the scan pipeline), implement the
`MarketDataProvider` interface and wire it into `getMarketDataProvider()`.
If it's a standalone asset class with its own API route (like Binance,
Oanda, Twelve Data, Polygon today), it doesn't need to implement the full
interface — see the next section.

## Standalone providers (crypto/forex/futures)

Binance, Oanda, Twelve Data, and Polygon are each called directly from
their own API route (`app/api/crypto`, `/forex`, `/futures`), not through
the `MarketDataProvider` interface. They all normalize their response to
`UnifiedMarketData` (`market-data.ts`) so the frontend has one shape to
handle regardless of source. See `docs/MULTI_PROVIDER_SETUP.md` for the
full provider table and endpoint docs.

## Caching

Every provider module implements a short in-memory TTL cache (10–15s) to
stay under the vendor's rate limit. When adding a new call site for an
existing provider, call through the existing module rather than hitting the
vendor API directly — you get the cache for free, and you avoid quietly
multiplying request volume against a limit documented in
`docs/THIRD_PARTY_LIMITS.md`.

## Adding a new provider

1. Add the module here, returning `UnifiedMarketData` (or implementing
   `MarketDataProvider` if it should serve the scan pipeline).
2. Add its API key to `.env.example` with a comment on what it's for.
3. Add its rate limit to `docs/THIRD_PARTY_LIMITS.md` — this is not
   optional; every provider call site needs its limit documented before
   something else (a cron, a polling loop) can safely be built on top of it.
4. Document the endpoint in `docs/MULTI_PROVIDER_SETUP.md`.
