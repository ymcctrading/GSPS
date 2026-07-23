# GSPS Implementation Guide

## System Architecture

### Technology Stack
- **Frontend**: Next.js 16.2 with React 19, TypeScript
- **Backend**: Next.js API Routes, Node.js runtime
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth (JWT-based)
- **UI Framework**: Tailwind CSS 4 + Lucide React icons
- **Charts**: Lightweight Charts 5
- **Data Validation**: Zod 4
- **Testing**: Vitest 4
- **Broker APIs**: Alpaca SDK, SnapTrade TypeScript SDK

### Directory Structure

```
gsps/
├── app/                          # Next.js app directory
│   ├── (app)/                    # Protected routes group
│   │   ├── dashboard/            # Trading dashboard
│   │   ├── scanner/              # Market scan interface
│   │   ├── portfolio/            # Portfolio management
│   │   ├── ticker/[symbol]/      # Stock detail view
│   │   ├── settings/             # User preferences
│   │   ├── glossary/             # Educational content
│   │   └── layout.tsx            # App layout wrapper
│   ├── (auth)/                   # Auth routes group
│   │   ├── login/                # Login page
│   │   └── signup/               # Registration page
│   ├── api/                      # API endpoints
│   │   ├── scan/                 # Core scanning engine
│   │   ├── batch-scan/           # Batch scanning
│   │   ├── market-scan/          # Daily market scan
│   │   ├── bars/                 # OHLC data
│   │   ├── quote/                # Price quotes
│   │   ├── orders/               # Order management
│   │   ├── portfolio/            # Portfolio data
│   │   └── snaptrade/            # SnapTrade integration
│   ├── auth/                     # Auth callbacks
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Home page
│   └── favicon.ico               # Site icon
├── components/                   # React components
│   ├── app/                      # App-specific components
│   ├── auth/                     # Auth components
│   ├── chart/                    # Chart components
│   ├── scan/                     # Scan result components
│   ├── trade/                    # Trading components
│   └── ui/                       # Reusable UI components
├── lib/                          # Utility libraries
│   ├── analysis/                 # Technical analysis
│   ├── brokers/                  # Broker integrations
│   ├── crypto.ts                 # Encryption utilities
│   ├── data/                     # Data providers
│   ├── gann/                     # Gann analysis engine
│   ├── strat/                    # Pattern recognition
│   ├── supabase/                 # Database queries
│   ├── types.ts                  # TypeScript types
│   ├── utils.ts                  # Helpers
│   ├── scoring/                  # Signal scoring
│   ├── sectors.ts                # Sector data
│   ├── marketScan.ts             # Market scan orchestration
│   └── scanTicker.ts             # Ticker scanning
├── lib/__tests__/                # Unit tests
│   ├── gann.test.ts              # Gann tests
│   └── strat.test.ts             # Pattern tests
├── supabase/                     # Database migrations
│   └── migrations/               # SQL migrations
├── public/                       # Static assets
├── next.config.ts                # Next.js configuration
├── tsconfig.json                 # TypeScript config
├── package.json                  # Dependencies
└── vercel.json                   # Vercel deployment config
```

## Data Flow

### Market Scanning Flow
1. **Initiation**: User requests market scan from scanner page or cron trigger
2. **Market Scan API** (`/api/market-scan`):
   - Retrieves watchlist tickers
   - Calls batch scan for sector analysis
   - Aggregates results by pattern type
3. **Batch Scan API** (`/api/batch-scan`):
   - Processes multiple tickers in parallel
   - Calls scan endpoint for each ticker
   - Returns aggregated results
4. **Scan API** (`/api/scan`):
   - Fetches current bar data via Alpaca
   - Fetches historical bars (1m, 5m, timeframes)
   - Runs Gann analysis (fans, square of 9, time cycles)
   - Runs strat analysis (patterns, levels)
   - Scores patterns (0-100 scale)
   - Returns signal with score and details
5. **Database Storage**:
   - Scan results stored in Supabase
   - User portfolio updated
   - Trade history maintained
6. **Frontend Display**:
   - Results shown in scanner table
   - Score badges indicate strength
   - Cards show high-probability signals

### Trading Flow
1. **Order Ticket Component**:
   - User selects ticker and quantity
   - Chooses order type (market/limit)
   - Sets price targets (for limit orders)
2. **Order Submission** (`/api/orders`):
   - Validates order parameters with Zod
   - Connects to broker (Alpaca/SnapTrade)
   - Submits order and receives order ID
3. **Broker Execution**:
   - For paper trading: Simulates execution
   - For live trading: Sends to broker
   - Returns execution details
4. **Portfolio Update** (`/api/portfolio`):
   - Fetches positions from broker
   - Updates Supabase with trade details
   - Calculates P&L
5. **Dashboard Display**:
   - Shows open positions
   - Displays P&L and metrics
   - Shows pending orders

### Chart Update Flow
1. **Chart Component** (`components/chart/candles.tsx`):
   - Initializes Lightweight Charts instance
   - Renders current bar on load
2. **Live Updates**:
   - Polls `/api/bars` endpoint every 30 seconds
   - Receives latest OHLC data
   - Updates chart candlesticks
3. **User Interactions**:
   - Legend toggle shows/hides price
   - Gann fan overlay displays on request
   - Timeframe switching re-fetches data

## Key Algorithms

### Gann Analysis

**Square of 9** (`lib/gann/squareOf9.ts`):
- Spiral arrangement of numbers starting from 1
- Calculates support/resistance levels
- Used for price projections
- Implementation: Spiral lookup table with mathematical calculations

**Gann Fans** (`lib/gann/fans.ts`):
- Geometric angles drawn from pivot points
- Standard angles: 45°, 63.75°, 26.25°, etc.
- Projects future support/resistance
- Implementation: Angle calculations with point projection

**Time Cycles** (`lib/gann/timeCycles.ts`):
- Important time periods based on Gann principles
- Predicts turning points in market
- Uses date mathematics for cycle calculation
- Implementation: Timestamp math with cycle intervals

### Pattern Recognition (Strat)

**Pattern Classification** (`lib/strat/classify.ts`):
- Identifies chart patterns (triangles, wedges, etc.)
- Analyzes candle formations
- Detects reversal vs continuation patterns
- Returns pattern type and confidence

**Support/Resistance Levels** (`lib/strat/levels.ts`):
- Finds price levels from historical data
- Identifies bounces and breaks
- Calculates cluster zones
- Implementation: Price level grouping and clustering

**Pattern Matching** (`lib/strat/patterns.ts`):
- Compares current patterns to known patterns
- Calculates pattern similarity
- Weights pattern confidence
- Returns matching patterns with scores

### Trend Analysis

**Trend Classification** (`lib/analysis/trend.ts`):
- Determines up, down, or sideways trends
- Uses multiple timeframe analysis
- Calculates trend strength
- Implementation: High/low comparisons over windows

**Pivot Points** (`lib/analysis/pivots.ts`):
- Standard pivot (R3, R2, R1, P, S1, S2, S3)
- Camarilla pivots
- Fibonacci pivots
- Implementation: OHLC-based mathematical formulas

### Scoring System

**Signal Scoring** (`lib/scoring/score.ts`):
- Scores patterns from 0-100
- Weights by pattern type
- Adjusts for trend alignment
- Calculates risk/reward ratio
- Factors: pattern score (40%), trend (30%), level proximity (20%), timeframe (10%)

## API Endpoints Reference

### Market Data
- `GET /api/quote?symbol=SPY` - Current price quote
- `GET /api/bars?symbol=SPY&timeframe=5m` - OHLC bars
- `GET /api/market-scan` - Daily market scan

### Trading
- `GET /api/scan?symbol=SPY` - Single ticker scan
- `POST /api/batch-scan` - Batch scan multiple tickers
- `POST /api/orders` - Create/submit order
- `GET /api/portfolio` - User portfolio

### Integrations
- `POST /api/snaptrade/connect` - Link SnapTrade account
- `GET /api/snaptrade/accounts` - List SnapTrade accounts

### Authentication
- `POST /api/auth/callback` - OAuth callback

## Database Schema Overview

### Tables
- `users` - User accounts and preferences
- `user_portfolios` - Portfolio snapshots
- `trades` - Trade history
- `scan_results` - Market scan results
- `user_watchlists` - Saved watchlists
- `snaptrade_links` - Linked SnapTrade accounts

### Key Relationships
- Users → Portfolios (1:many)
- Users → Trades (1:many)
- Users → Scan Results (1:many)
- Users → SnapTrade Links (1:many)

## Authentication & Security

### User Sessions
1. User logs in via `/login` page
2. Supabase auth creates JWT token
3. Token stored in secure HTTP-only cookie
4. Middleware validates token on each request
5. Server-side queries use Supabase client with token
6. Protected routes redirect to login if no valid session

### API Key Security
- Alpaca/SnapTrade keys stored encrypted in database
- Keys retrieved only when needed
- Encrypted in transit (HTTPS)
- Never exposed to frontend
- Environment variables for test/demo accounts

### Rate Limiting
- Alpaca API: 200 requests/minute
- Implemented with request deduplication
- Batch endpoints optimize batch calls
- Error handling for rate limit hits

## Deployment Configuration

### Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL - Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY - Supabase public key
SUPABASE_SERVICE_ROLE_KEY - Supabase admin key
ALPACA_API_KEY - Alpaca market data key
ALPACA_API_SECRET - Alpaca secret key
ALPACA_BASE_URL - Alpaca API endpoint
SNAPTRADE_CLIENT_ID - SnapTrade client ID
SNAPTRADE_CLIENT_SECRET - SnapTrade secret
SNAPTRADE_CONSUMER_KEY - SnapTrade consumer key
```

### Build Process
1. TypeScript compilation
2. ESLint validation
3. Tailwind CSS build
4. Next.js production build
5. Asset optimization
6. Ready for Vercel deployment

## Performance Considerations

### Data Fetching
- Batch requests to reduce API calls
- Server-side data fetching in components
- Response caching strategies
- Concurrent request deduplication

### Chart Rendering
- Lightweight Charts handles heavy lifting
- Limits rendered points for performance
- Virtual scrolling for large datasets
- Debounced resize handlers

### UI Rendering
- React Server Components where possible
- Suspense boundaries for async data
- Code splitting per route
- Image optimization with Next.js

## Testing Strategy

### Unit Tests
- Gann calculations (`lib/__tests__/gann.test.ts`)
- Pattern recognition (`lib/__tests__/strat.test.ts`)
- Scoring algorithms
- Utility functions

### Integration Tests
- API endpoint tests
- Database operation tests
- Broker integration tests

### E2E Tests (Future)
- User flow testing
- Dashboard interaction
- Trading execution
- Authentication flows

## Error Handling

### API Error Responses
- Standard JSON error format
- HTTP status codes
- Error message and code
- Request ID for debugging

### User-Facing Errors
- Graceful error messages
- Retry suggestions
- Status indicators
- Error recovery options

### Logging
- Server-side error logging
- API request/response logging
- User action tracking
- Performance metrics

## Scalability Considerations

### Current Bottlenecks
- Alpaca API rate limits
- Database query performance on large datasets
- Real-time update latency

### Improvement Opportunities
- Redis cache layer for frequently accessed data
- Database indexing optimization
- WebSocket for real-time updates
- Horizontal scaling architecture
- Message queue for async processing
- CDN for static assets

## Monitoring & Observability

### Metrics to Track
- API response times
- Error rates by endpoint
- Active user count
- Scan execution times
- Trade execution times
- Database query performance

### Alerts
- High error rate (> 5%)
- API timeout (> 5s)
- Database connection failures
- Broker API failures
- Deployment issues

## Future Improvements

### Phase 1 (Next)
- Advanced stop/profit orders
- Notification system
- Portfolio analytics

### Phase 2
- Strategy backtesting
- Machine learning signals
- Mobile app

### Phase 3
- Multi-broker dashboard
- Algorithmic trading
- Enterprise features
