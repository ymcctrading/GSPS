# Multi-Provider Market Data Scanner

This document outlines the new multi-provider market data architecture for GSPS.

## Overview

The scanner now supports data from multiple providers, each specialized for different asset classes:

- **Binance**: Cryptocurrency (public API, no auth required for basic market data)
- **Oanda**: Forex/Currency Pairs (requires API key)
- **Twelve Data**: Futures, Stocks, Indices, ETFs (requires API key)
- **Polygon.io**: Stocks, Crypto, Options, Forex (requires API key)
- **Alpaca**: Original provider for stocks and crypto (existing integration)

## Unified Data Schema

All providers return data normalized to this schema:

```typescript
interface UnifiedMarketData {
  symbol: string;
  price: number;
  timestamp: string; // ISO timestamp
  change: number; // percentage change
  changeAbsolute?: number; // absolute price change
  volume?: number;
  high?: number;
  low?: number;
  open?: number;
  source: "alpaca" | "binance" | "oanda" | "twelve_data" | "polygon";
}
```

## API Endpoints

### /api/crypto
Fetches cryptocurrency data from Binance.

**Query Parameters:**
- `symbols` (required): Comma-separated list of crypto symbols (e.g., `BTC,ETH,SOL`)

**Example:**
```bash
curl "https://your-domain.com/api/crypto?symbols=BTC,ETH"
```

**Response:**
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

### /api/forex
Fetches currency pair data from Oanda.

**Query Parameters:**
- `symbols` (required): Comma-separated currency pairs (e.g., `EUR-USD,GBP-USD`)

**Example:**
```bash
curl "https://your-domain.com/api/forex?symbols=EUR-USD,GBP-USD"
```

**Requirements:** `OANDA_API_KEY` environment variable

### /api/futures
Fetches futures and stock data from Twelve Data or Polygon.

**Query Parameters:**
- `symbols` (required): Comma-separated symbols (e.g., `ES,NQ,CL`)
- `provider` (optional): `twelve_data` (default) or `polygon`

**Example:**
```bash
curl "https://your-domain.com/api/futures?symbols=ES,NQ&provider=twelve_data"
```

**Requirements:**
- `TWELVE_DATA_API_KEY` for Twelve Data provider
- `POLYGON_API_KEY` for Polygon provider

## Environment Setup

### Local Development

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Add your API keys:
   ```env
   OANDA_API_KEY=your_oanda_key
   TWELVE_DATA_API_KEY=your_twelve_data_key
   POLYGON_API_KEY=your_polygon_key
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

### Vercel Production Deployment

Add environment variables via Vercel CLI or web dashboard:

```bash
vercel env add OANDA_API_KEY
vercel env add TWELVE_DATA_API_KEY
vercel env add POLYGON_API_KEY
```

Or use the Vercel dashboard:
1. Go to your project Settings
2. Navigate to Environment Variables
3. Add each API key with the exact names above

## Cron Jobs

The scanner includes automated polling via Vercel Crons:

- **Futures (ES, NQ, CL)**: Every 10 minutes
- **Crypto (BTC, ETH, SOL)**: Every 5 minutes
- **Forex (EUR-USD, GBP-USD, USD-JPY)**: Every 10 minutes

Customize these in `vercel.json` under the `crons` array.

## Caching Strategy

Each provider implements a simple in-memory TTL cache:

- **Binance (Crypto)**: 10 seconds
- **Oanda (Forex)**: 10 seconds
- **Twelve Data (Futures)**: 15 seconds
- **Polygon**: 10-15 seconds depending on asset class

This prevents hitting rate limits when multiple requests are made within a short window.

## Getting API Keys

### Binance
- No key needed for public market data
- Visit: https://www.binance.com/en/trade/BTC_USDT

### Oanda
- Sign up for a practice/demo account
- API key available in Account Settings
- Visit: https://www.oanda.com/

### Twelve Data
- Free tier: 800 requests/day
- Sign up: https://twelvedata.com/
- Get key from Account Settings

### Polygon.io
- Free tier: 5 API calls/minute, up to 1000 calls/month
- Sign up: https://polygon.io/
- Keys available in API Keys section

## Error Handling

All endpoints return standardized error responses:

```json
{
  "error": "TWELVE_DATA_API_KEY is not configured"
}
```

HTTP Status Codes:
- `400`: Missing or invalid parameters
- `502`: Provider API error or misconfiguration
- `200`: Success

## Rate Limiting

Monitor these rate limits to avoid issues:

| Provider | Free Tier | Paid | Note |
|----------|-----------|------|------|
| Binance | Unlimited | Unlimited | Public endpoint |
| Oanda | 1200 requests/min | Higher | Practice account |
| Twelve Data | 800 requests/day | Higher | Based on plan |
| Polygon | 5 requests/min, 1000/month | Higher | Varies by plan |

## Integration with Scanner Frontend

The normalized schema makes it easy to swap providers or add fallbacks:

```typescript
// Frontend usage (with fallback)
async function getMarketData(symbol: string, assetClass: string) {
  try {
    if (assetClass === "crypto") {
      return fetch(`/api/crypto?symbols=${symbol}`);
    } else if (assetClass === "forex") {
      return fetch(`/api/forex?symbols=${symbol}`);
    } else {
      return fetch(`/api/futures?symbols=${symbol}`);
    }
  } catch (err) {
    console.error("Market data fetch failed:", err);
    // Fallback to existing Alpaca /api/quote endpoint
    return fetch(`/api/quote?symbol=${symbol}`);
  }
}
```

## Testing

Test each endpoint locally:

```bash
# Crypto (Binance - no auth required)
curl http://localhost:3000/api/crypto?symbols=BTC,ETH

# Forex (requires OANDA_API_KEY)
curl http://localhost:3000/api/forex?symbols=EUR-USD

# Futures (requires TWELVE_DATA_API_KEY or POLYGON_API_KEY)
curl http://localhost:3000/api/futures?symbols=ES,NQ
```

## Data Schema Sync with Spacebase

The unified `UnifiedMarketData` type is the single source of truth. When updating the schema:

1. Update `lib/data/market-data.ts` interface
2. Sync with Spacebase reference schema
3. Verify all providers return normalized data
4. Update API documentation

Current schema version: `1.0` (2026-07-24)

## Future Enhancements

- [ ] Add provider-specific options (e.g., bid/ask spreads for forex)
- [ ] Implement circuit-breaker pattern for API failures
- [ ] Add webhook support for real-time updates
- [ ] Multi-provider fallback chain
- [ ] Provider performance metrics/monitoring
