# GSPS Features Documentation

## Overview
GSPS is a comprehensive trading application built with Next.js, Supabase, and Alpaca/SnapTrade integrations. It provides real-time market scanning with structural analysis, pattern recognition, and automated trading capabilities.

## Core Features

### 1. Authentication & Authorization
- **Supabase Integration**: Secure user authentication with email/password
- **Public Keys Embedded**: Hardened auth form using public Supabase credentials
- **Session Management**: Server-side session handling with secure cookies
- **Auth Callback**: OAuth callback handling for social authentication support

### 2. Market Scanning & Analysis
- **Daily Market Scan**: Automated scan of market sectors and stocks
- **Structural Analysis Engine**:
  - Harmonic level calculations
  - Support line analysis
  - Cyclical turn window detection
- **Pattern Recognition**:
  - Trend classification
  - Support/resistance level identification
  - Reversal pattern matching algorithms
  - Support/resistance level analysis
- **Multi-Timeframe Support**: 1m, 5m, 15m, 1h, 2h, 4h, 1d, 1w, 1mo, 1y candles
  — one candle always covers exactly the interval its label names

### 3. Live Market Data
- **Real-time Price Quotes**: Current bid/ask pricing via Alpaca
- **OHLC Bars**: Open, High, Low, Close data across timeframes
- **Batch Market Scanning**: Efficient scanning of multiple tickers
- **Watchlist Integration**: SPY, BTC, and customizable watchlists

### 4. Portfolio Management
- **Paper Trading**: Risk-free account for strategy testing
- **Real Account Trading**: Live trading with Alpaca or SnapTrade
- **Portfolio Back Office**: Account equity, cash, buying power, and day P/L
- **Four Position Sections**: Open, Pending, Closed, and Canceled & Rejected —
  each with its own count, empty state, and newest-first ordering. Closed and
  Canceled & Rejected start collapsed
- **Blended Open Positions**: Shares and every option contract on the same
  underlying tracked as separate legs under one ticker, with an aggregate
  market value / P&L header, refreshed every 10 seconds
- **Ended-Order Dispositions**: Orders that never became a position group by
  how each one ended — canceled, rejected, expired, replaced, done for day
- **Position Tracking**: Real-time position monitoring

### 5. Trading Interface
- **Order Ticket**: Create and submit market/limit orders
- **Paper Trading Orders**: Execute paper trades for backtesting
- **Live Order Execution**: Submit orders to brokers
- **Order Management**: View pending and filled orders
- **Order Types**: Market, limit, and conditional orders

### 6. Charts & Visualization
- **Lightweight Charts Integration**: Professional candlestick charts
- **10 Timeframes**: 1m → 1y, each candle aligned to its interval boundary
- **Live Chart Updates**: Real-time candlestick updates
- **Legend Toggle**: Show/hide price legend
- **Structural Level Overlays**: Visualize structural analysis on charts
- **Technical Indicators**: Support/resistance levels, trend lines

### 7. SnapTrade Integration
- **Account Linking**: Connect external brokerage accounts
- **Multi-Account Support**: Manage multiple SnapTrade accounts
- **Account Discovery**: Automatic account discovery and listing
- **Linked Account Portfolio**: View positions from linked brokers

### 8. Educational Resources
- **Beginner Glossary**: Educational terms for trading concepts
- **Pattern Explanations**: Learn about structural analysis and reversal patterns
- **Signal Definitions**: Understand scoring and signals

### 9. Dashboard & Analytics
- **Trading Dashboard**: Overview of portfolio and scan results
- **Scan Results Table**: View latest scan signals
- **Score Badges**: Visual display of pattern scores (1-10 scale)
- **Signal Cards**: Quick view of high-probability setups

### 10. Settings & Configuration
- **User Settings**: Customize preferences
- **API Key Management**: Configure Alpaca and SnapTrade keys
- **Notification Settings**: Control alerts and notifications
- **Default Watchlist Configuration**: Set up default scan lists

### 11. Broker Integrations
- **Alpaca Broker**:
  - Market data access
  - Paper and live trading
  - Alternative environment variable names support
- **SnapTrade SDK**:
  - Multi-broker access
  - Account linking
  - Order execution

### 12. Production Deployment
- **Vercel Framework**: Pinned Next.js framework for production
- **Environment Variables**: Secure configuration management
- **Production Build**: Optimized build configuration for deployment
- **Build Hardening**: Enhanced security for deploy pipeline

## Technical Implementation Details

### Architecture Layers

**Backend APIs** (`app/api/`):
- `/api/scan` - Core scanning engine
- `/api/batch-scan` - Batch ticker scanning
- `/api/market-scan` - Daily market scan
- `/api/bars` - OHLC bar data retrieval
- `/api/quote` - Current price quotes
- `/api/orders` - Order management
- `/api/portfolio` - Portfolio data
- `/api/snaptrade/connect` - SnapTrade linking
- `/api/snaptrade/accounts` - SnapTrade account management

**Frontend Pages** (`app/(app)/`):
- `/dashboard` - Main trading dashboard
- `/scanner` - Market scan interface
- `/portfolio` - Portfolio management
- `/ticker/[symbol]` - Individual stock analysis
- `/settings` - User configuration
- `/glossary` - Educational resources

**Core Libraries** (`lib/`):
- `gann/` - Structural analysis calculations
- `strat/` - Pattern recognition algorithms
- `analysis/` - Trend and pivot analysis
- `brokers/` - Broker integrations
- `data/` - Data providers (Alpaca)
- `scoring/` - Pattern scoring system
- `marketScan.ts` - Market scanning orchestration
- `scanTicker.ts` - Individual ticker scanning

### Data Storage
- **Supabase Database**: User data, trades, scan history
- **Initial Schema**: User accounts, portfolios, trade history, scan results

## Performance & Reliability

- **Live Updates**: Real-time chart and data updates
- **Batch Processing**: Efficient scanning of multiple tickers
- **Caching**: Smart caching of market data
- **Error Handling**: Comprehensive error handling with fallbacks
- **Rate Limiting**: Alpaca API rate limit management

## Security Features

- **Encrypted Environment Variables**: Secure credential storage
- **Server-Side Auth**: Secure session validation
- **API Rate Limiting**: Protection against abuse
- **Input Validation**: Zod-based request validation
- **CORS Protection**: Cross-origin security measures

## Data Sources

- **Alpaca API**: Stock market data and trading
- **SnapTrade API**: Multi-broker connectivity
- **Crypto Data**: Bitcoin and cryptocurrency support
- **Real-time Quotes**: Current market pricing

## User Experience Features

- **Responsive Design**: Works on desktop and mobile
- **Tailwind CSS**: Modern, clean interface
- **Lucide Icons**: Professional iconography
- **Score Badges**: Visual pattern strength indicators
- **Signal Cards**: Quick-scan format for setup discovery
- **Data Tables**: Comprehensive result viewing

## Testing & Quality Assurance

- **Structural Analysis Tests**: Unit tests for structural analysis calculations
- **Strat Tests**: Unit tests for pattern recognition
- **Vitest Integration**: Modern test framework
- **ESLint Configuration**: Code quality enforcement
