# GSPS Product Roadmap & PRD

**Status:** Active — this is the governing roadmap for GSPS.
**Horizon:** 12 months from August 2026.
**Last updated:** 2026-08-29.

This document decides *what we build next and in what order*. Proposals and
implementation work should trace back to a phase below. See
"[Using this document](#using-this-document)" at the end for how it interacts
with `BACKLOG.md` and how to change it.

---

## Vision

**Become the trusted platform for traders who combine structural analysis with
disciplined risk management.** GSPS differentiates on pattern accuracy,
real-time scanning, and multi-broker flexibility — a tool traders depend on for
both signal discovery and execution.

| | |
|---|---|
| Core differentiator | Structural analysis |
| Primary revenue driver | Premium alerts |
| Initial market | US equities |
| Horizon | 12 months |

---

## Current State Assessment

### What's built

- **Core engine (production)** — Structural analysis engine (Gann fans,
  geometric price levels, time cycles), pattern recognition, multi-timeframe
  support (1m–1y), real-time charting via Lightweight Charts.
- **Trading infrastructure (production)** — Per-user simulated paper trading
  (`lib/brokers/simulator.ts`; fills against live quotes, own cash ledger),
  staged protocol exits, portfolio tracking with position grouping, option
  Greeks, price-increment validation, a versioned trade-plan lifecycle
  state machine with audit trail and post-close structured review
  (`lib/lifecycle/`, formalizing what `lib/trade/protocol-exit.ts` already
  executes). Live trading is **not** enabled: it needs per-user brokerage
  credentials, which is unscheduled work.
- **Data pipeline (mature)** — Multi-provider architecture (Alpaca, Binance,
  Oanda, Twelve Data, Polygon), intraday momentum scanner, daily market scans,
  per-symbol audit trail for non-alerts, explained alerts with invalidation
  levels.
- **Platform (beta)** — Supabase auth and storage, Vercel hosting (Hobby tier,
  2 crons/day cap), SnapTrade multi-broker linking, settings and watchlists.

### Strengths to build on

- Accurate signal engine with explainable logic and tuned scoring
- Risk-first design across order management and position tracking
- Multi-broker foundation (Alpaca + SnapTrade)
- Real-time capability and charting parity with professional tools
- Documentation depth, which sustains feature velocity

### Critical gaps

| Gap | Consequence |
|---|---|
| Notification system | Alerts exist but cannot reach users |
| Performance analytics | No win rate, Sharpe, or drawdown tracking |
| Advanced order types | No stop-loss, take-profit, or bracket orders |
| Backtesting | Signals cannot be validated against history |
| Mobile presence | Desktop-only; no trading on the go |

---

## North Star Metrics

| Metric | Target | Definition |
|---|---|---|
| User retention | 80% | Monthly active: returned within the past 30 days |
| Pattern accuracy | 65%+ | Win rate on signals within 5 days of alert (baseline ~55%) |
| Feature adoption | 60% | Active users executing ≥1 trade per month |
| System uptime | 99.5% | Measured at the data-pipeline level; broker downtime excluded |
| Signal latency | <2s | Alert trigger to delivery, across all channels |
| NPS | 45+ | Quarterly survey |

---

## Q1 — Months 0–3: Monetization & Retention Foundation

**Aug 2026 – Oct 2026**

### Strategic goals

- **Enable real-time alerts** — notifications are the primary conversion lever
  from free to paying.
- **Prove signal quality** — performance analytics shows historical accuracy
  and builds trust.
- **Reduce friction** — improve onboarding, broker linking, and execution UX.

### Initiatives

- **Notification system** — email, SMS, and browser push for high-confidence
  alerts. Quiet hours, scheduling, alert history dashboard. *(Gap fixed
  2026-08-21, out-of-phase/direct report: a live ~6% BTC intraday move went
  unflagged and un-emailed. Root cause was two-fold — `WATCHLIST` in
  `lib/scanner/intraday.ts`, the universe the system scan and email fan-out
  actually cover, had no crypto symbol in it despite the scanner engine
  already supporting `kind: "crypto"`; and once BTC/USD and ETH/USD were
  added, the session-volume liquidity gate — tuned in share counts — would
  have filtered every crypto alert anyway, since a session's coin volume is
  single/double digits, not tens of thousands. Both fixed: the two symbols
  added to `WATCHLIST`, and that gate skipped for crypto in favor of the
  dollar-turnover floor `lib/scan/liquidity.ts` already applies correctly.
  This is deliberately narrower than the Q2 "Crypto scanner" item below — it
  wires two large-cap pairs into the existing equity-hours intraday engine,
  not a separate scan queue or Binance data. *(Follow-up, 2026-08-21, same
  day: the weekend/overnight gap above is now closed. A second, always-on
  schedule in `.github/workflows/intraday-scan.yml` covers weekday overnight
  and the whole weekend, scanning crypto only — the equity side of the
  watchlist can't move while its market is shut, so scanning it there would
  be wasted runs, not just budget. The equity-hours schedule still scans the
  full watchlist, and a manual `workflow_dispatch` run always does too,
  whatever hour it's kicked off at — `?universe=crypto` is only ever set by
  the off-hours cron itself. Direct request; accepted knowingly as roughly
  4x this workflow's prior GitHub Actions run count, noted in
  `docs/THIRD_PARTY_LIMITS.md`.)*
- **Portfolio analytics dashboard** — win/loss ratio, Sharpe ratio, drawdown
  analysis, monthly/quarterly P&L, performance by pattern type.
- **Scan history** *(shipped 2026-08-27, direct request)* — a "History" tab
  on the Scanner page (alongside Universe and Intraday, which gained a tab
  switcher to make room) showing every past manual scan's symbols next to
  their current tracked status, so a user who scanned a batch can come back
  later and see what's moved between Execute/Watch/Reject. Built on schema
  that already existed but was never wired up: `public.scan_results`
  (migration 0001) now actually gets written to from `/api/batch-scan`, and
  "current status" is read live off `public.active_monitors` (migration
  0036) — the entitlement notification system's own WATCH/EXECUTE/
  INVALIDATED tracker, which was already being kept current by every scan
  for a profile but had no user-facing view. No new scan is run to answer
  "has this changed"; a symbol with no monitor history (most often a Reject
  that hasn't since become a real setup) is shown as untracked rather than
  guessed at. New route `/api/scan-history`; new module `lib/scanner/history.ts`.
  Distinct from BACKLOG.md's unchecked "Saved scan criteria/watchlists" item,
  which is about re-running a saved *configuration*, not reviewing past
  *results* — that item is still open.
- **Push (phone) notifications — noted as backlog, not built.** Requested
  alongside the above; investigated and confirmed there is no push channel
  today (`dispatchNotificationDelivery` in `lib/entitlements/delivery.ts`
  explicitly rejects every channel but `"email"`, and there is no service
  worker, manifest, or push SDK anywhere in the repo). Reaching a phone for
  real needs either a PWA web-push pipeline (service worker + VAPID keys +
  a subscription table + a real `"push"` branch in `dispatchNotificationDelivery`)
  or the Q3 native mobile app already on this roadmap (line ~232) — both
  meaningfully larger than this PR's scope, so left for a dedicated
  follow-up rather than built partially here.
- **Conditional orders** — stop-loss and take-profit on any order; the
  foundation for Q2 bracket orders.
- **Improved onboarding** — glossary integration, pattern education,
  guided paper-trade walkthrough. *(First-run tour shipped 2026-08-19: a
  spotlight walkthrough that auto-launches once per account and covers every
  destination in plain English, plus `/welcome` as a permanent, re-readable
  version of the same content. Illustrated throughout by a frozen after-hours
  SPY snapshot, labelled as saved rather than live on every figure. Glossary
  integration and pattern education remain open.)*
- **Guided Decision Mode** *(shipped 2026-08-17)* — one recommended action per
  symbol, sized from a per-trade risk cap, executed through a single
  confirmation. Paper-only, long-only, Execute-verdict only, with daily/weekly
  trade caps and a deployed-capital ceiling. Every recommendation shown is
  logged so its expectancy can later be measured against the Backtest tool.
  See `docs/GUIDED_DECISION_MODE.md`. Shipped alongside a platform-wide
  liquidity floor on every scan (price ≥ $5, average volume ≥ 500k shares, or
  the dollar-turnover equivalent for crypto). *(Per-trade dollar budget added
  2026-08-21: the risk/portfolio ceilings are percentages of the $100k paper
  account, which sized recommendations correctly but in dollar amounts no one
  trading real money in the low hundreds could act on. A flat notional cap —
  $250 default, editable down to $50 or off — now applies alongside them, on
  by default. Direct response to a novice-friction report against the shipped
  UI; no separate low-capital tool was built, since the fix is a fifth sizing
  ceiling on the existing engine, not a different one.)* *(2026-08-19)*
  Followed up with a core-engine change (not Guided-Mode-only): large-cap
  stocks now get a wider stop-loss leeway and ceiling (`lib/strat/large-cap.ts`,
  `lib/strat/levels.ts`), so an ordinary swing on a mega-cap name doesn't clip
  the stop before the setup can move, and the wider risk-per-share also
  shrinks the share count needed at a given risk budget — compounding with
  the dollar budget above. This touches every scan and the score, not only
  Guided Mode, and is unmeasured against the backtest replay as of this
  writing — see `docs/BACKTESTING.md`.
- **Novice Risk, Account & Cooldown Engine** *(2026-08-28, out-of-phase,
  direct request)* — a pure-logic risk engine, independent of Guided Mode's
  own fixed caps (`lib/guided/config.ts`): bounded dynamic-risk sizing across a
  four-band Novice risk ladder (base/A-tier/A+/exceptional A+, 1.00%-1.75%,
  absolute 2.00% ceiling), a weighted user execution score, an eight-state
  circuit breaker (normal → entry pause → warning → soft/hard cooldown →
  critical/emergency lock → severe override) driven by three independent
  loss metrics (48h loss, start-of-day loss, 30-day rolling high-water
  drawdown), cooldown action-gating that never blocks a stop/TP/reduce/
  close/cancel and cannot be overridden by a paid tier, and a reset checklist
  gate before new entries resume — see `lib/risk/*` and
  `supabase/migrations/0042_novice_risk_cooldown_engine.sql`. This is the
  engine this roadmap's Q2 "Risk dashboard" item (line ~320) was scheduled
  to build; it landed now because it was asked for directly, not as a
  reprioritization, and Q2 planning should treat sizing/circuit-breaker logic
  as done and scope that item down to the UI and correlation-detection work
  still open. *(Same day, follow-up: confirmed by direct request that this
  engine's rules must never apply to paper trading, so it is deliberately
  NOT wired into Guided Mode or any other simulated-account path. The one
  seam it is wired to is `lib/trade/place-order.ts`'s `mode: "live"` branch —
  which still hard-refuses every live order today, since GSPS has no live
  execution path yet — reading real net liquidation value from a linked
  SnapTrade account (`lib/risk/live-account.ts`; `alpaca_live` has no
  per-user balance reader yet and fails closed rather than guessing) and
  persisting circuit-breaker state against real equity history
  (`lib/risk/service.ts`, `supabase/migrations/0043_risk_live_equity_snapshots.sql`).
  No live account is actually gated today because no live order can be
  placed at all yet, but the gate is real, tested, and will take effect the
  moment live execution replaces that placeholder refusal.)*
- **Novice → Pro tier promotion** *(2026-08-29)* — behavioral eligibility
  gate for the Novice-to-Pro (`PRACTICE`→`STANDARD`) tier step, per the
  "Tier Access, Promotion & User Experience" spec pack (draft implementation
  directives; still requires securities/compliance counsel review before
  live personalized recommendations or execution — this PR is server-side
  policy plumbing, not that review). Directly serves this phase's paid-tier
  launch: Pro/Standard has no Stripe price (see
  `docs/GSPS_TIER_ENTITLEMENT_SPEC.md`), so this is the actual gate on who
  gets there. Built:
  - `lib/promotion/config.ts` + `supabase/migrations/0045_tier_promotion_policy.sql`
    (`promotion_policy_values` / `promotion_policy_change_log`) — every
    threshold from the spec's "Promotion readiness model" table is a
    remotely configurable value with an auditable change log, per the pack's
    explicit instruction not to hard-code them into UI components.
  - `lib/promotion/eligibility.ts` (pure) and `lib/promotion/readiness.ts`
    (aggregates real paper-trading history — `positions` where
    `mode = 'paper'` — into the eligibility inputs; reuses
    `lib/risk/execution-score.ts` for the process score). Two inputs are
    documented approximations rather than precise: stop adherence reads
    whether a stop was set at open (GSPS does not yet record whether an
    exit was the stop firing vs. a coincidental manual close), and the
    severe-risk-event check is realized closed-trade loss against the fixed
    paper starting balance, not a true equity-curve drawdown — paper
    accounts have no snapshot history the way `risk_live_equity_snapshots`
    gives live accounts. Both are flagged inline for whoever tightens them
    next.
  - `lib/promotion/promote.ts` — a promotion never applies immediately: per
    the spec's "not retroactively to defeat an entry cap," a request
    schedules `effective_at` at the next market open and only takes effect
    then. Applied lazily from `/api/promotion/status` on each read rather
    than a cron, since both of this project's Vercel Hobby cron slots are
    already spent (`docs/THIRD_PARTY_LIMITS.md`).
  - `lib/promotion/copy.ts` — the spec's required/forbidden wording as
    constants plus a targeted test, not a `scripts/check-banned-terms.mjs`
    entry (several forbidden phrases, e.g. "safe," are ordinary words
    outside this context).
  - `components/settings/promotion-settings.tsx` — a Settings-page readiness
    checklist and upgrade request, shown only to Novice accounts, using the
    neutral "you may be eligible" wording the spec requires and never
    appearing in response to a loss, cooldown, or lock.
  - **Follow-up (2026-08-29, same day):** built the two items originally
    deferred above.
    - The Novice-homepage summary (`components/dashboard/novice-home-summary.tsx`,
      shown on `/dashboard` only for `PRACTICE` accounts, above the existing
      scanner output rather than replacing it): market regime (a direct
      `lib/signals/regime.ts` read on SPY daily bars —
      `lib/promotion/market-regime.ts` — cheaper than running the full
      `scanTicker` pipeline for a benchmark the homepage doesn't trade),
      one best-qualified-plan-or-"No qualified setup" card (the
      highest-scored row already present in the dashboard's own bullish/
      bearish scan results — no new scan), an education card linking
      `/welcome` and `/glossary`, existing-position protection status, and
      cooldown status (`lib/promotion/novice-home.ts` plus
      `lib/risk/status.ts`, a new read-only accessor for
      `risk_circuit_state` — reads the *real* circuit-breaker row rather
      than inventing a parallel paper-trading cooldown concept; nearly
      every account reads "No active cooldown" today only because live
      trading has no execution path yet, per this same entry's earlier
      live-account gating).
    - The Pro intraday module's bounded gating logic
      (`lib/promotion/pro-intraday.ts`, fully tested): setups-displayed
      ceiling, new-entry/concurrent-position/consecutive-loss-pause/
      daily-loss-lock gating, and closed-bar (5/15/30-minute) entry
      confirmation — a genuinely separate module from
      `lib/scanner/intraday.ts`, not a shortened Novice swing timeframe,
      matching the spec pack's explicit instruction.
    - **Wired (2026-08-29, same day, by direct request):** confirmed with the
      user before reversing Phase 3F, then shipped. `lib/entitlements/policy.ts`
      gained `proIntradayModuleEnabled`, `true` only for `STANDARD` and
      deliberately not the same flag as `intradayScansEnabled` (which stays
      `false` for Pro, preserving Expert+'s original unrestricted-access
      decision). `app/api/intraday-scan/route.ts` now admits a Pro-bounded
      caller and applies the module's scan-side bounds: entry confirmation
      restricted to the module's allowed closed-bar lengths (5/15/30 minutes
      — in practice today only the scanner's 5-minute-bar alerts qualify,
      since it has no native 15/30-minute path), and a setups-displayed
      ceiling read from the user's own `intraday_alerts` history (no new
      table). `docs/GSPS_TIER_ENTITLEMENT_SPEC.md` got a matching correction
      note, same precedent as the automation-gate correction.
    - **Still not wired, on purpose:** the entry/day, concurrent-position,
      consecutive-loss-pause, and daily-loss-lock gates in
      `lib/promotion/pro-intraday.ts` have no live caller. Enforcing them
      needs an order to be identifiable as "intraday-sourced" at
      placement time, and nothing in this codebase tags an order that way
      today — for any tier, not just Pro. Building that (a schema column, a
      UI touchpoint from the intraday-alerts panel through the order
      ticket, and a gate in `lib/trade/place-order.ts`, the shared path
      every order in the app goes through) is a distinct, larger change
      than extending the already-tested module, and wasn't rushed into the
      universal order-placement path without being called out on its own.
- **Referral program (minimal)** *(2026-08-19, out-of-phase)* — a per-user
  referral link (`/r/<username>`), click counter, and signup attribution,
  surfaced in Settings. Not named in this roadmap's Q1 initiatives — it was
  built ahead of schedule at explicit request, in service of this phase's
  retention goal (a reason to bring a friend back in) rather than as a
  reprioritization. No commission or payout model yet: that needs a
  compliance and payments decision this document doesn't make for it. If a
  paid referral program becomes a real initiative, it belongs here explicitly
  rather than continuing to live as a deviation note.
- **Protective actions exempted from the trading kill switch** *(2026-08-28,
  out-of-phase, forward-looking)* — the global `TRADING_DISABLED` switch
  (`lib/trade/kill-switch.ts`) previously refused every order-placing *and*
  position-closing request while set, including the dedicated "Close
  position" action. Every order this switch guards today is a paper trade, so
  this was not a live violation of the GSPS Product Constitution's
  "exits/reductions always available" principle — that principle governs live
  trading, which isn't enabled yet. Fixed anyway, ahead of live trading
  landing: `/api/positions/close` no longer calls the kill switch at all, and
  `placeSimulatedOrder` (`lib/trade/place-order.ts`) skips the halt for a
  sell that reduces/closes an existing long or a buy that covers an existing
  short, via the new `isProtectiveOrder` helper. New-entry orders are still
  blocked as before. Not named in this roadmap — small hardening ahead of an
  unscheduled dependency (live trading), not a reprioritization.
- **Mobile-responsive dashboard** — not a native app yet, but positions and
  alerts must be usable on phones and tablets.
- **Technical indicators (phase 1)** — SMA, EMA, RSI, MACD as chart overlays.
  Visible for analysis; not yet alert factors.

### Dependencies

Notification provider (SendGrid; Twilio for SMS/push). Backtest framework
(local history replay). Supabase performance-query optimization.

### Outcome

Paid tier launches on an alert-based pricing model. First 20–30 paying users.
Portfolio analytics drives retention and trust.

---

## Q2 — Months 3–6: Differentiation & Scale Foundation

**Nov 2026 – Jan 2027**

### Strategic goals

- **Prove backtesting accuracy** — validate signals against history and improve
  scoring from the data.
- **Expand market coverage** — crypto, forex, and futures as separate scanners.
- **Scale safely** — infrastructure hardening, caching, and query optimization
  for 100+ concurrent users.
- **Deepen engagement** — advanced order types, strategy templates, and the
  risk dashboard drive feature adoption.

### Initiatives

- **Backtesting engine** — walk-forward testing, Monte Carlo simulation,
  parameter sensitivity. Replay the scanner against 2 years of history; surface
  win rate and expectancy per pattern.
- **Advanced order types** — bracket orders (entry + stop + target), trailing
  stops, one-cancels-other (OCO), with live paper-trading support.
- **Crypto scanner** — separate scan queue for BTC, ETH, and major alts.
  Adapted timeframes (4h, 1d focus) on Binance data.
- **Forex scanner** — major pairs (EURUSD, GBPUSD, …) with structural analysis
  on Oanda data.
- **Risk dashboard** — position-sizing calculator, max daily loss enforcement,
  correlation-based position warnings, VIX tracking.
- **Performance replay UI** — replay past scans, compare alerts across dates,
  see what would have been caught.
- **Database optimization** — indexing for scan queries, caching for frequent
  chart requests, query-plan review.

### Dependencies

**Hard:** working backtesting engine (needed to understand signal quality);
crypto/forex data feeds; Redis cache on the Vercel Pro tier.
**Soft:** backtest results should feed back into alert scoring.

### Outcome

Backtest data supports public accuracy claims. Crypto/forex scanners broaden
the audience. Risk dashboard becomes a differentiator. 50–80 paying users.

---

## Q3 — Months 6–9: Mobile & Community

**Feb 2027 – Apr 2027**

### Strategic goals

- **Mobile-first users** — a native app captures on-the-go traders; push
  notifications drive engagement.
- **Community engagement** — shared watchlists, leaderboards, and trade
  journals build network effects.
- **Expand broker support** — Interactive Brokers and Schwab open access to
  larger accounts.

### Initiatives

- **React Native mobile app** — iOS and Android. Alerts, quick order entry,
  position viewing, chart browsing, notifications.
- **Trade journal & social** — notes on closed trades, shared watchlists,
  follow expert traders, opt-in public leaderboards.
- **Interactive Brokers API** — account linking, order execution, portfolio
  sync.
- **Sector & market breadth scanning** — sector rotation signals, put/call
  ratio analysis, market heat map.
- **Dashboard customization** — drag-and-drop widgets, saved layouts, custom
  themes (dark/light).
- **Alternative data** — news feed, sentiment indicators, macro calendars
  linked to alerts.
- **Email & in-app analytics** — weekly digest of top signals, performance
  summary, personalized recommendations.

### Dependencies

**Hard:** mobile framework choice (React Native vs. Flutter); App Store and
Google Play developer accounts.
**Soft:** community features need moderation and anti-spam guardrails.

### Outcome

Mobile drives a 2–3x increase in daily active users. Community features create
stickiness and word-of-mouth. 150–200 paying users.

---

## Q4 — Months 9–12: Enterprise & Scale

**May 2027 – Jul 2027**

### Strategic goals

- **Enterprise readiness** — multi-user teams, audit logging, and compliance
  reporting for small asset managers.
- **Automated trading** — execute strategies without manual intervention.
- **Data products** — API access for third-party integrations and white-label
  partnerships.

### Initiatives

- **Team & collaboration** — multiple users per account, role-based permissions
  (viewer/trader/admin), shared alerts and watchlists.
- **Compliance & audit logging** — complete trade audit trail, compliance
  reporting, tax reporting helpers.
- **Automated trading (algo)** — simple rules (e.g. high-confidence alert → buy
  100 shares with a $1k stop), in both paper and live modes.
- **API & webhooks** — third-party alert delivery, custom integrations, data
  export; enables white-label.
- **Enterprise deployment option** — self-hosted guide for institutions; VPC
  peering for large brokers.
- **Performance optimization** — CDN for static assets, horizontal scaling,
  multi-region deployment.
- **Data & analytics marketplace** — anonymized aggregated signal data for
  quants and researchers.

### Dependencies

**Hard:** regulatory review (compliance, best execution); API design and
documentation.
**Soft:** traction from Q1–Q3 to justify the enterprise investment.

### Outcome

Enterprise tier launches (annual contracts, $5–50k). API enables a third-party
ecosystem. 300+ paying users, $50k+ MRR.

---

## Feature Priority Matrix

| Feature | Phase | Priority | Retention impact | Effort | Dependencies |
|---|---|---|---|---|---|
| Notification system | Q1 | Critical | Very high | 3 weeks | SendGrid, Twilio setup |
| Portfolio analytics | Q1 | Critical | Very high | 2 weeks | Historical trade data |
| Conditional orders | Q1 | Critical | High | 2 weeks | Alpaca API updates |
| Backtesting engine | Q2 | Critical | Very high | 4 weeks | Historical bars, scoring refactor |
| Crypto scanner | Q2 | High | High | 2 weeks | Binance integration |
| Risk dashboard | Q2 | High | High | 2 weeks | Position-sizing algorithms |
| Advanced order types | Q2 | High | Medium | 2 weeks | Alpaca API, order state machine |
| Mobile app (MVP) | Q3 | High | Very high | 6 weeks | React Native, stable backend APIs |
| Trade journal & social | Q3 | Medium | High | 3 weeks | Database schema extensions |
| IB integration | Q3 | Medium | Medium | 3 weeks | IB credentials, account linking |
| Automated trading (algo) | Q4 | Medium | Medium | 4 weeks | Order validation, risk controls |
| Team & RBAC | Q4 | Medium | Low | 3 weeks | Auth refactor, Supabase RLS |
| API & webhooks | Q4 | Low | Low | 3 weeks | API design, rate limiting, docs |

---

## Technical & Infrastructure Roadmap

### Data & analytics

- **Q1** — Historical performance query optimization; caching for scan results
  and portfolio snapshots.
- **Q2** — Backtest framework; event replay with configurable slippage and
  commissions; pattern-accuracy analytics pipeline.
- **Q3** — Distributed scanning (5000+ tickers/day); real-time tick ingestion.
- **Q4** — Data lake for aggregation; ML training pipeline; sentiment and news.

### Platform & reliability

- **Q1** — Upgrade Vercel to Pro (removes the 2-cron/day cap); structured error
  logging (Sentry).
- **Q2** — Database indexing audit; query performance baselines; Redis cache
  for order and portfolio data.
- **Q3** — Horizontal scaling investigation; load-balancing design.
- **Q4** — Multi-region active-active; disaster recovery playbook; immutable
  compliance audit ledger.

### Security & compliance

- **Q1** — API key encryption rotation; rate-limit hardening.
- **Q2** — Penetration testing; SOC 2 Type I kickoff.
- **Q3** — SOC 2 Type I completion; compliance dashboard and audit log exports.
- **Q4** — SOC 2 Type II; GDPR and privacy controls; best-execution docs.

### Developer experience & testing

- **Q1** — E2E framework (Playwright) covering login, trade execution, alert
  delivery.
- **Q2** — Integration tests for all data providers; broker API mocking.
- **Q3** — Load testing and capacity planning; performance benchmarking in CI.
- **Q4** — Chaos engineering; disaster recovery drills.

---

## Revenue & Growth Model

### Q1–Q2: foundation

Freemium. Free tier: 5 daily scans, no alerts. Premium ($29–49/mo): unlimited
scans, email/SMS alerts, portfolio analytics, advanced order types.

- Q1: 20–30 paying users (beta launch, early adopters)
- Q2: 50–80 paying users (backtesting builds trust)

### Q3–Q4: scale

| Tier | Price | Includes |
|---|---|---|
| Free | $0 | 5 daily scans, basic charts, paper trading |
| Premium | $49/mo | Unlimited scans, all order types, analytics, notifications |
| Professional | $149/mo | Crypto/forex/futures, API access, custom alerts, priority support |
| Team | $499/mo | Multiple users, audit logging, compliance reporting, white-label |

- Q3: 150–200 paying users (mobile launch)
- Q4: 300–400 paying users (enterprise tier, API partners)

### Secondary revenue (Q4+)

Data products ($5–10k/mo projected), API licensing ($2–5k/mo), broker affiliate
commissions ($1–3k/mo).

### Unit economics

12-month lean cost estimate: Vercel Pro $240, Supabase Pro $1,440, data
providers $3,600, notifications $2,400, monitoring $1,200, developer time
(founder + 1 contractor) ~$80,000. **Total ~$90k. Break-even at 150–200 paying
users on the premium tier.**

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Low product-market fit | Paying-user targets missed | Continuous user research; track NPS and retention cohorts; pivot to institutional/research tier if retail fails |
| Signal accuracy degrades at scale | More tickers, more false positives; backtest doesn't match live | Rigorous backtesting (Q2); per-pattern accuracy metrics; throttle alerts if false-positive rate >40% |
| Broker API changes or terms | Alpaca/SnapTrade/IB restrict access | Multi-broker strategy; monitor broker news; abstraction layer over broker APIs |
| Incumbents add similar features | TradingView/ToS add structural analysis | Compete on accuracy and ease of use, not feature count; community moat; deeper broker integrations |
| Vercel or Supabase outage | Users cannot trade during downtime | Monitoring and alerts; fallback DNS; Q3–Q4 multi-region; public status page |
| Funding needed before break-even | Runway ends short of 200 users | Lean spend discipline; break even on current infra by Q2; seek seed after Q1 traction |

---

## Execution Approach

### Cadence

Two-week sprints aligned to phases. Weekly stakeholder syncs. Bi-weekly user
research. Monthly review against the North Star metrics.

### Team model

- **Q1** — Founder (core product) + 1 contractor (backend/notifications).
- **Q2** — Founder + 2 contractors (backend, mobile); hire first full-time
  engineer if Q1 targets are met.
- **Q3** — Founder + 2–3 engineers (mobile push); consider part-time design.
- **Q4** — Founder + 3–4 engineers; add customer success for enterprise.

### Critical path

Notifications → unlocks paid conversion. Portfolio analytics → builds
retention. Backtesting → validates accuracy claims. Mobile → drives DAU.
Break-even gross margin by end of Q2.

### Decision gates

- **After Q1** — continue or pivot, on retention and revenue. Target: 70%+
  retention, 25+ paying users.
- **After Q2** — hire first full-time engineer, or bootstrap longer. Target:
  60+ paying users, 65%+ signal accuracy.
- **After Q3** — fundraise for the enterprise push, or stay independent.
  Target: 180+ paying users.

---

## Success Milestones

| Quarter | Done means |
|---|---|
| Q1 | Notifications deployed · portfolio analytics live · 25+ paying users · first-cohort retention 70%+ |
| Q2 | Backtesting live · crypto scanner operational · 60+ paying users · signal accuracy 62%+ |
| Q3 | Mobile app shipped (iOS/Android) · trade journal & social · 180+ paying users · 2–3x DAU from mobile |
| Q4 | Algo trading live · team features & RBAC · 350+ paying users · $50k+ MRR |

---

## Competitive Landscape

**Incumbents:** TradingView (charting and some alerts, weak on structural
analysis), Think or Swim (complex UI, no mobile parity), Finviz (screener, not
a scanner with alerts).

**Why GSPS wins:**

1. **Accuracy first** — 65%+ win rate backed by backtesting, vs. generic
   oscillators.
2. **Trader-centric risk** — position sizing, correlation warnings, max daily
   loss; rare in retail tools.
3. **Multi-broker** — Alpaca + SnapTrade + IB + Schwab; traders keep their
   broker.
4. **Transparency** — every alert carries an invalidation level and a next-move
   plan.
5. **Community** — shared watchlists, leaderboards, and journals create network
   effects that are hard to copy.

---

## Glossary

- **Backtesting** — Event replay simulating alert generation against historical
  OHLC data. Produces win rate, expectancy, and Sharpe ratio.
- **Pattern accuracy** — Share of alerts where price moved the expected
  direction by at least the minimum move size within 5 trading days.
- **Conditional orders** — Stop-loss and take-profit levels set at submission,
  executed by the broker when touched.
- **Bracket orders** — Entry plus simultaneous stop-loss and take-profit, with
  one-cancels-other logic.
- **Trailing stops** — A stop that moves favorably with price to lock in gains.
- **Walk-forward testing** — Train to date X, test X→X+N, advance the windows.
  Guards against overfitting.
- **Sharpe ratio** — (Average return − risk-free rate) / standard deviation of
  returns. S&P 500 benchmark ~0.5.
- **Drawdown** — Peak-to-trough decline; max drawdown is the largest such fall.
- **Expectancy** — (Win % × avg win) − (Loss % × avg loss). Must be positive.
- **Data lake** — Central store of historical market data, trades, and alerts,
  enabling analytics without hitting live APIs.
- **RBAC** — Role-based access control: viewer, trader, admin.
- **SOC 2 Type I / II** — Security certification; Type I is point-in-time,
  Type II covers 6+ months of continuous monitoring.

---

## Using this document

**Precedence.** This roadmap governs *sequencing and priority*. `BACKLOG.md` is
the unscheduled idea pool — items there are candidates, not commitments, and do
not become work until a phase here picks them up. Where the two disagree, this
document wins.

**Proposing work.** New suggestions should name the phase they belong to. Work
that fits no phase is either out of scope or a reason to amend the roadmap —
say which, rather than quietly building it.

**Out-of-phase work is allowed** when there's a reason: a production bug, a
security issue, a blocked dependency, or an explicit request. Note the
deviation; don't pretend it was planned.

**Amending.** Phases shift as reality lands. Update this file in the same PR as
the work that invalidated it, and move the "Last updated" date. Decision gates
after each quarter are the natural checkpoints for a larger revision.
