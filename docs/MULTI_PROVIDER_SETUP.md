# Multi-Provider Market Data

GSPS pulls market data from several providers, each specialized for a
different asset class, normalized to a single schema so the frontend and
scanner never need to know which vendor answered.

## Providers

| Provider | Asset class | Auth | Module | Functions |
|---|---|---|---|---|
| Alpaca | Stocks, crypto (primary) | `ALPACA_API_KEY`/`ALPACA_API_SECRET` (paper) or `ALPACA_LIVE_*` | `lib/data/alpaca.ts` | via `lib/data/provider.ts` seam |
| Binance | Crypto | None (public endpoint) | `lib/data/binance.ts` | `fetchBinanceData()`, `fetchBinanceMultiple()` |
| Oanda | Forex | `OANDA_API_KEY` | `lib/data/oanda.ts` | `fetchOandaData()`, `fetchOandaMultiple()` |
| Twelve Data | Futures, stocks, indices, ETFs | `TWELVE_DATA_API_KEY` | `lib/data/twelve-data.ts` | `fetchTwelveDataQuote()`, `fetchTwelveDataMultiple()`, `fetchFuturesData()` |
| Polygon.io | Stocks, crypto, options (fallback) | `POLYGON_API_KEY` | `lib/data/polygon.ts` | `fetchPolygonStockSnapshot()`, `fetchPolygonCryptoSnapshot()`, `fetchPolygonMultiple()` |
| Synthetic | Demo fallback, no keys required | None | `lib/data/synthetic.ts` | used automatically when no real provider is configured |

Alpaca specifically goes through the provider seam described in
`lib/data/AGENTS.md` (`getMarketDataProvider()`), since it's the primary feed
used by the scan pipeline. The other four are called directly from their
respective API routes.

## Unified Data Schema

All providers normalize to this schema (`lib/data/market-data.ts`):

```typescript
interface UnifiedMarketData {
  symbol: string;
  price: number;
  timestamp: string; // ISO timestamp
  change: number; // percentage change
  changeAbsolute?: number;
  volume?: number;
  high?: number;
  low?: number;
  open?: number;
  source: "alpaca" | "binance" | "oanda" | "twelve_data" | "polygon";
}
```

When updating this interface, update every provider module that returns it
and re-check anything on the frontend that destructures the response shape.

## API Endpoints

### `GET /api/crypto?symbols=BTC,ETH,SOL`
Binance. No auth required for basic market data.

### `GET /api/forex?symbols=EUR-USD,GBP-USD,USD-JPY`
Oanda. Requires `OANDA_API_KEY`.

### `GET /api/futures?symbols=ES,NQ,CL&provider=twelve_data`
Twelve Data (default) or Polygon via `?provider=polygon`. Requires
`TWELVE_DATA_API_KEY` or `POLYGON_API_KEY` respectively.

All three are **on-demand, read-through proxies** — they fetch live data and
return it; nothing persists the response. They are called by the frontend
when a user views that asset class, not on a schedule (see "Scheduling"
below).

Example:
```bash
curl "https://your-domain.com/api/crypto?symbols=BTC,ETH"
```

Response:
```json
{
  "data": [
    {
      "symbol": "BTC",
      "price": 42500.50,
      "timestamp": "2026-07-24T12:34:56Z",
      "change": 2.3,
      "changeAbsolute": 952.50,
      "volume": 28500000000,
      "source": "binance"
    }
  ],
  "timestamp": "2026-07-24T12:34:56Z",
  "source": "binance"
}
```

### Error handling

```json
{ "error": "TWELVE_DATA_API_KEY is not configured" }
```

- `400` — missing or invalid parameters
- `502` — provider API error or misconfiguration (e.g. missing key)
- `200` — success

## Scheduling

These three routes are **not** on Vercel Cron. They were originally
scheduled (every 5–10 minutes) but that accomplished nothing — nothing
persisted the response — and it also pushed the project over the Vercel
Hobby plan's 2-cron limit. They were removed from `vercel.json` for that
reason; see `CHANGELOG.md` and `docs/THIRD_PARTY_LIMITS.md`.

If a real need for scheduled polling emerges (e.g. persisting a price
history), don't add it back to Vercel Cron — see the "when you actually need
more" section of `docs/THIRD_PARTY_LIMITS.md` for the preferred approach
(external scheduler hitting the route over HTTPS), and make sure the route
actually does something with the data it fetches.

The only Vercel Cron job in this project is `/api/market-scan` — see
`app/api/AGENTS.md`.

## Caching

Each provider module implements a short in-memory TTL cache to stay well
under rate limits:

| Provider | TTL |
|---|---|
| Binance | 10s |
| Oanda | 10s |
| Twelve Data | 15s (delayed feed) |
| Polygon | 10–15s depending on asset class |

Route new call sites through the existing provider module to get this
caching for free rather than calling a vendor API directly.

## Environment Setup

Local:
```bash
cp .env.example .env.local
# fill in OANDA_API_KEY / TWELVE_DATA_API_KEY / POLYGON_API_KEY as needed
npm run dev
```

Vercel: add the same keys via the dashboard (Project → Settings →
Environment Variables) or `vercel env add <NAME>`.

## Getting API keys

- **Binance** — no key needed for public market data.
- **Oanda** — sign up for a practice/demo account; key is in Account Settings.
- **Twelve Data** — free tier: 800 requests/day. https://twelvedata.com/
- **Polygon.io** — free tier: 5 requests/min, 1000/month. https://polygon.io/

Full limits and what happens when they're exceeded:
`docs/THIRD_PARTY_LIMITS.md`.

## Testing

```bash
curl http://localhost:3000/api/crypto?symbols=BTC,ETH
curl http://localhost:3000/api/forex?symbols=EUR-USD          # needs OANDA_API_KEY
curl http://localhost:3000/api/futures?symbols=ES,NQ          # needs TWELVE_DATA_API_KEY or POLYGON_API_KEY
```

## Future Enhancements

- [ ] Provider-specific fields (e.g. bid/ask spreads for forex)
- [ ] Circuit-breaker pattern for provider failures
- [ ] Multi-provider fallback chain (e.g. Polygon → Twelve Data automatically)
- [ ] Provider performance/error-rate monitoring
