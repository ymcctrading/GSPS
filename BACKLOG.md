# GSPS Development Backlog

> **This is an idea pool, not a plan.** `ROADMAP.md` is the governing roadmap —
> it decides what gets built and in what order. Items below are candidates:
> they become work only when a roadmap phase picks them up. Where the two
> disagree, `ROADMAP.md` wins. The "Priority N" headings here indicate rough
> appetite, not scheduling.

## Priority 1: Critical Features (Production Ready)

### High-Probability Signal Alerts
- [ ] Email/SMS notifications for high-score patterns
- [ ] Browser push notifications for trading alerts
- [ ] Notification scheduling and quiet hours
- [ ] Alert history and statistics

### Advanced Portfolio Analytics
- [ ] Win/loss ratio calculations
- [ ] Profit factor and Sharpe ratio
- [ ] Drawdown analysis
- [ ] Performance attribution by pattern type
- [ ] Monthly/quarterly performance summaries

### Enhanced Order Management
- [ ] Conditional orders (stop-loss, take-profit)
- [ ] Bracket orders (stop + profit target)
- [ ] Trailing stops
- [ ] Order history and analytics
- [ ] Order modification and cancellation

### Short-Side Recommendations in Guided Mode
- [x] ~~Enforce a stop on short entries~~ — done in #72.
- [x] ~~Enable short recommendations in Guided Mode~~ — done: side-aware sizing,
      a borrow check that fails closed, per-side copy, and a `sell` side on the
      recommendation ledger. See `docs/GUIDED_DECISION_MODE.md`.
- [ ] Revisit the deployed-capital cap now that it is a short's *only* exposure
      ceiling. 25% of equity was chosen when every guided position also had to
      be paid for in cash; a short does not consume cash, so the same percentage
      permits more total exposure than it used to. Worth re-deriving rather than
      inheriting.

### Risk Management
- [ ] Position sizing based on account equity
- [ ] Maximum daily loss limits
- [ ] Maximum open position limits
- [ ] Correlation-based position limits
- [ ] Risk exposure dashboard

## Priority 2: Feature Enhancements (Next Release)

### Expanded Technical Analysis
- [ ] Moving averages (SMA, EMA, WMA)
- [ ] RSI (Relative Strength Index)
- [ ] MACD (Moving Average Convergence Divergence)
- [ ] Bollinger Bands
- [ ] Volume analysis and OBV
- [ ] ATR (Average True Range)
- [ ] Stochastic oscillator
- [ ] Ichimoku Cloud

### Advanced Structural Analysis
- [ ] Structural boxes calculation and visualization
- [ ] Structural angles and ray predictions
- [ ] Structural arcs implementation
- [ ] Harmonic pattern recognition
- [ ] Fibonacci retracement levels
- [ ] Fibonacci time cycles

### Strategy Backtesting
- [ ] Backtest engine for historical analysis
- [ ] Walk-forward testing
- [ ] Monte Carlo simulation
- [ ] Optimization of entry/exit criteria
- [ ] Strategy comparison reports
- [ ] Parameter sensitivity analysis

### Sector & Market Analysis
- [ ] Sector rotation strategies
- [ ] Market breadth indicators
- [ ] Put/call ratio analysis
- [ ] Volatility index (VIX) tracking
- [ ] Macro-economic indicator correlation
- [ ] Market heat map visualization

## Priority 3: User Experience Improvements

### Dashboard Customization
- [ ] Drag-and-drop widget arrangement
- [ ] Custom dashboard layouts
- [ ] Saved dashboard templates
- [ ] Dark/light theme toggle (currently default only)
- [ ] Customizable chart themes

### Advanced Search & Filtering
- [ ] Advanced scan filters (price range, volume, volatility)
- [x] ~~Saved scan criteria/watchlists~~ — done: `scan_criteria_presets`
      (migration 0075, RLS owner-only, same shape as `saved_setups`/0058),
      `/api/scan-criteria`, `components/scan/saved-searches.tsx` on the
      Scanner page's Universe tab. See `ROADMAP.md`'s Q1 "Scan history" note.
- [ ] Scan scheduling (daily, weekly, intraday)
- [ ] Scan result exports (CSV, Excel, PDF)
- [ ] Scan result comparisons

### Mobile Application
- [ ] React Native mobile app
- [ ] Push notifications
- [ ] Quick order entry
- [ ] Mobile-optimized charts
- [ ] Offline mode with sync

### Enhanced Glossary
- [ ] Interactive examples with live data
- [ ] Video tutorials
- [ ] Pattern comparison tool
- [ ] Signal strength explanations
- [ ] Risk/reward teaching module

## Priority 4: Integration & Partnerships

### Additional Broker Support
- [ ] Interactive Brokers integration
- [ ] TD Ameritrade/Charles Schwab
- [ ] Robinhood API (if available)
- [ ] Crypto exchange integration (Binance, Coinbase)
- [ ] Forex broker integration

### Social & Community Features
- [ ] Trade ideas community sharing
- [ ] Follow expert traders
- [ ] Shared watchlists and strategies
- [ ] Leaderboards and competitions
- [ ] Trade journal with comments

### Data & Analytics Providers
- [ ] Polygon.io integration for enhanced data
- [ ] IQFeed integration for real-time data
- [ ] Yahoo Finance data supplement
- [ ] Alternative data providers (sentiment, news)
- [ ] News feed integration

## Priority 5: Advanced Features (Future)

### AI/ML Enhancements
- [ ] Machine learning pattern recognition
- [ ] Predictive signal scoring
- [ ] Anomaly detection in market data
- [ ] Natural language processing for news
- [ ] Reinforcement learning for trading

### Automated Trading Systems
- [ ] Fully automated trading algorithms
- [ ] Paper trading to live graduation
- [ ] Multi-strategy portfolio management
- [ ] Risk-adjusted position sizing
- [ ] Dynamic strategy adjustment

### Enterprise Features
- [ ] Multi-user team collaboration
- [ ] Permission and role management
- [ ] Audit logging for compliance
- [ ] API for third-party integrations
- [ ] White-label capabilities
- [ ] SaaS hosting options

### Advanced Reporting
- [ ] Tax reporting (1099 data)
- [ ] Performance attribution reports
- [ ] Risk reporting for portfolio review
- [ ] Compliance reporting
- [ ] Custom report builder

## Priority 6: Infrastructure & Operations

### Performance Optimization
- [ ] Database query optimization — partial: `trade_logs_user_exit_idx`
      (migration 0078) closes a real missing-index gap on the portfolio
      analytics queries (`(user_id, entry_timestamp)` existed;
      `(user_id, exit_timestamp)`, what every analytics query actually
      filters/orders by, didn't). Left open as a general item — this was
      one targeted fix, not an exhaustive pass over every table.
- [ ] Cache layer implementation (Redis) — still open; genuinely needs the
      Q2 Redis dependency (`ROADMAP.md`). `GET /api/portfolio/analytics`
      now sends `Cache-Control: private, max-age=30,
      stale-while-revalidate=60` (browser-level, no server infra needed),
      which is a distinct, smaller thing from a shared server-side cache —
      don't read this as satisfying the Redis item.
- [ ] CDN for static assets
- [ ] Code splitting and lazy loading
- [ ] Image optimization
- [ ] API response compression

### Scalability
- [ ] Horizontal scaling architecture
- [ ] Load balancing
- [ ] Message queue for async processing
- [ ] Database replication
- [ ] Multi-region deployment

### Monitoring & Observability
- [ ] Application performance monitoring
- [x] ~~Error tracking and alerting~~ — done: `@sentry/nextjs` was already a
      dependency and `Sentry.init` already ran in both
      `instrumentation.ts` (server, both `nodejs`/`edge` runtimes) and
      `instrumentation-client.ts` (browser), but neither actually caught an
      error — no `onRequestError` export (the file convention's own hook
      for a server-side error; see `instrumentation.ts`'s updated comment)
      and no `app/global-error.tsx` (the client-side root error boundary).
      Both added. Inert until `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` are set
      on the deployment (by design — see each init call's `enabled` flag);
      not verified against a live Sentry project in this pass.
- [ ] User session recording — partially covered as a side effect:
      `instrumentation-client.ts` already runs `Sentry.replayIntegration`
      (10% sampled sessions, 100% on error), which is session replay
      *around an error*, not a general session-recording product. Left
      open rather than checked off.
- [ ] Performance metrics dashboard
- [ ] Log aggregation and analysis
- [ ] Synthetic monitoring

### Testing & Quality
- [x] E2E testing (Playwright) — `e2e/` covers login, a scan run, and a paper
      trade. Not wired into CI (needs a live Supabase project); run locally
      or against a preview with `npm run test:e2e`.
- [ ] Integration tests
- [ ] Performance benchmarks
- [ ] Security scanning
- [ ] Accessibility testing (WCAG)
- [ ] Load testing

## Priority 7: Documentation & Support

### Developer Documentation
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Architecture decision records (ADRs)
- [ ] Component library documentation
- [ ] Database schema documentation
- [ ] Deployment guides
- [ ] Local development setup guide

### User Documentation
- [ ] Getting started guide
- [ ] Video tutorials
- [ ] FAQ section
- [ ] Troubleshooting guide
- [ ] Best practices guide
- [ ] Pattern recognition guide

### Support Systems
- [ ] Help desk / support ticketing
- [ ] Live chat support
- [ ] Community forum
- [ ] Knowledge base
- [ ] Bug reporting system
- [ ] Feature request system

## Technical Debt & Refactoring

- [ ] Extract scanning logic to service layer
- [ ] Consolidate data fetching patterns
- [ ] Improve error handling consistency
- [ ] Add comprehensive logging
- [ ] Reduce API response payload sizes
- [ ] Standardize API response format
- [ ] Improve TypeScript strict mode compliance
- [ ] Component composition refactoring
- [ ] State management optimization
- [ ] Remove hardcoded values

## Performance Targets

- Dashboard load time: < 2 seconds
- Scan results: < 5 seconds for 100 tickers
- Chart updates: < 100ms latency
- API response times: < 500ms (p95)
- Core Web Vitals: All green
- Accessibility score: 95+
- Lighthouse performance: 90+

## Success Metrics

- User retention rate: > 80% monthly
- Feature adoption: > 60% of active users
- Pattern accuracy: > 65% win rate on signals
- Support ticket resolution time: < 24 hours
- System uptime: 99.9%
- Average trade execution: < 1 second

## Notes

- Prioritize features that improve pattern recognition accuracy
- Focus on risk management before additional features
- Gather user feedback before implementing Priority 3+ features
- Consider regulatory requirements for each jurisdiction
- Plan for scalability before launch
- Build comprehensive audit trails for compliance
