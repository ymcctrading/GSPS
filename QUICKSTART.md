# GSPS Developer Quickstart Guide

Get up and running with the GSPS (Gann Sniper Protocol Scanner) trading platform in minutes.

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Git
- Supabase account (free tier available)
- Alpaca API credentials (for market data and trading)
- Optional: SnapTrade credentials (for multi-broker support)

## Local Development Setup

### 1. Clone and Install

```bash
git clone https://github.com/ymcctrading/GSPS.git
cd GSPS
npm install
```

### 2. Configure Environment Variables

Copy the example env file:
```bash
cp .env.example .env.local
```

Update `.env.local` with your credentials:
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Alpaca Market Data
ALPACA_API_KEY=your_alpaca_key
ALPACA_API_SECRET=your_alpaca_secret
ALPACA_BASE_URL=https://data.alpaca.markets

# Optional: SnapTrade
SNAPTRADE_CLIENT_ID=your_snaptrade_client_id
SNAPTRADE_CLIENT_SECRET=your_snaptrade_secret
SNAPTRADE_CONSUMER_KEY=your_consumer_key
```

### 3. Set Up Database

```bash
# Push Supabase migrations
npx supabase db push

# Or manually run migrations from supabase/migrations/
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure Quick Reference

```
gsps/
├── app/                    # Next.js app directory
│   ├── (app)/             # Protected authenticated routes
│   ├── (auth)/            # Public auth routes
│   └── api/               # Backend API endpoints
├── components/            # Reusable React components
│   ├── app/              # App-specific components
│   ├── chart/            # Chart components (Lightweight Charts)
│   ├── scan/             # Scan results components
│   └── ui/               # Base UI components
├── lib/                  # Core business logic
│   ├── gann/            # Gann analysis algorithms
│   ├── strat/           # Pattern recognition
│   ├── brokers/         # Broker integrations
│   ├── data/            # Data providers
│   └── scoring/         # Signal scoring
├── supabase/            # Database migrations
└── public/              # Static assets
```

## Key Features Overview

### Market Scanning
- Scan single ticker: `GET /api/scan?symbol=SPY`
- Batch scan multiple tickers: `POST /api/batch-scan`
- Daily market scan: `GET /api/market-scan`

### Live Data
- Get current quote: `GET /api/quote?symbol=SPY`
- Get OHLC bars: `GET /api/bars?symbol=SPY&timeframe=5m`

### Trading
- Create order: `POST /api/orders`
- Get portfolio: `GET /api/portfolio`
- View orders: `GET /api/orders`

### SnapTrade Integration
- Connect account: `POST /api/snaptrade/connect`
- List accounts: `GET /api/snaptrade/accounts`

## Common Development Tasks

### Add a New Feature

1. **Create API endpoint** in `app/api/[feature]/route.ts`
2. **Add business logic** in `lib/[feature].ts`
3. **Create React component** in `components/[feature].tsx`
4. **Add route** to `app/(app)/[feature]/page.tsx`

### Add a Gann Analysis Tool

1. Create file in `lib/gann/[tool].ts`
2. Export calculation function
3. Add unit tests in `lib/__tests__/gann.test.ts`
4. Use in `lib/scanTicker.ts`

Example:
```typescript
// lib/gann/newTool.ts
export function calculateNewGannTool(price: number): number {
  // Implementation
  return result;
}

// lib/__tests__/gann.test.ts
describe('New Gann Tool', () => {
  it('should calculate correctly', () => {
    expect(calculateNewGannTool(100)).toBe(expected);
  });
});
```

### Add Pattern Recognition

1. Create file in `lib/strat/[pattern].ts`
2. Implement pattern detection logic
3. Add to `lib/strat/patterns.ts` exports
4. Add tests in `lib/__tests__/strat.test.ts`

### Connect to a New Broker

1. Create broker integration in `lib/brokers/[broker].ts`
2. Implement: `getQuote()`, `getBars()`, `submitOrder()`
3. Add to broker factory pattern
4. Configure environment variables

## Testing

### Run All Tests
```bash
npm test
```

### Run Specific Tests
```bash
npm test -- gann.test.ts
npm test -- strat.test.ts
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

## Building for Production

```bash
# Build the application
npm run build

# Start production server
npm start

# Or deploy to Vercel
# The vercel.json is already configured
npx vercel deploy
```

## API Response Format

### Success Response
```json
{
  "status": "success",
  "data": { /* response data */ }
}
```

### Error Response
```json
{
  "status": "error",
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Authentication

- Supabase JWT tokens in secure HTTP-only cookies
- Automatic token refresh on page load
- Middleware validates token on protected routes
- `/login` and `/signup` are public routes
- All `/app/*` routes require authentication

## Database Quick Reference

### Key Tables
- `users` - User accounts
- `user_portfolios` - Portfolio snapshots
- `trades` - Trade history
- `scan_results` - Market scan results
- `user_watchlists` - Saved watchlists
- `snaptrade_links` - Linked SnapTrade accounts

### Query Examples

```typescript
// Get user with Supabase
const { data } = await supabase.auth.getUser();

// Query portfolio
const { data: portfolio } = await supabase
  .from('user_portfolios')
  .select('*')
  .eq('user_id', userId);

// Insert trade
await supabase
  .from('trades')
  .insert({ user_id, ticker, quantity, price });
```

## Debugging Tips

### Enable Logging
```typescript
// In lib/supabase/client.ts or server.ts
const supabase = createClient(url, key, {
  auth: { debug: true }
});
```

### Check API Responses
- Open DevTools → Network tab
- Look for API endpoint calls
- Check response and error messages
- Check status codes and headers

### Test Endpoints with cURL
```bash
# Get quote
curl "http://localhost:3000/api/quote?symbol=SPY"

# Scan ticker
curl "http://localhost:3000/api/scan?symbol=SPY"
```

### View Database
1. Go to Supabase dashboard
2. Navigate to "SQL Editor"
3. Run queries directly
4. View table data in "Table Editor"

## Performance Tips

1. **Batch requests** - Use `/api/batch-scan` instead of multiple `/api/scan` calls
2. **Cache data** - Store scan results and quotes locally
3. **Lazy load charts** - Load chart data on demand
4. **Optimize images** - Use Next.js Image component
5. **Monitor API calls** - Watch for redundant requests

## Deployment

### Deploy to Vercel

```bash
# Push to GitHub
git push origin main

# Vercel auto-deploys on push
# Or manually deploy:
npx vercel deploy --prod
```

### Environment Variables in Vercel

1. Go to Vercel project settings
2. Add environment variables
3. Redeploy to apply changes

## Getting Help

### Documentation
- `FEATURES.md` - Feature documentation
- `BACKLOG.md` - Roadmap and feature backlog
- `IMPLEMENTATION.md` - Architecture and technical details

### External Resources
- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Alpaca API Docs](https://alpaca.markets/docs)
- [SnapTrade Docs](https://snaptrade.com/docs)

### Common Issues

**"Cannot find module" error**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Supabase connection failed**
- Check `.env.local` credentials
- Verify Supabase project is active
- Check network connectivity

**Alpaca API errors**
- Verify API key and secret
- Check base URL matches your account type
- Ensure API access is enabled in Alpaca dashboard

**Port 3000 already in use**
```bash
npm run dev -- -p 3001
```

## Next Steps

1. ✅ Set up local environment (see above)
2. 📖 Read `FEATURES.md` to understand available features
3. 🏗️ Check `IMPLEMENTATION.md` for architecture details
4. 🎯 Pick a feature from `BACKLOG.md` to implement
5. 🧪 Write tests for your changes
6. 🚀 Deploy to production

## Quick Command Reference

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm start                # Run production server
npm test                 # Run tests
npm run lint             # Run ESLint
npm run format           # Format code

git push origin main     # Push to main
git checkout -b feature  # Create feature branch
git commit -am "message" # Commit changes
```

---

**Happy coding! 🚀 If you have questions, check the documentation files in the root directory or open an issue on GitHub.**
