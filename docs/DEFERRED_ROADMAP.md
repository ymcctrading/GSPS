# Deferred Roadmap (Phase 2+)

This document explicitly defers non-core features to avoid scope creep while maintaining architectural readiness for future implementation.

**Strategy**: Define interfaces and data models now; implement features only when core scanner + execution + learning loop are stable and audited.

## Phase 1 (Current): Core MVP

**Focus**: Scanner, execution, learning instrumentation.

### Completed (§1–§6)
- Trading invariants and risk management
- Portfolio split and trade logging
- Stop-loss alerts
- Deployment SOP
- Learning brain instrumentation (§7)
- Chart decluttering & UX (§8)
- Broker hardening (§9)

### In Progress
- None (MVP feature set complete)

---

## Phase 2: Market Intelligence & Fundamentals

### Market News Integration (Deferred)

**What**: Real-time news headlines, sentiment scoring, news-driven alerts.

**Why Defer**:
- Adds significant data-integration complexity
- Requires low-latency news API (cost + rate limits)
- Not required for core Gann/Sara signal logic
- Can bias traders into reactive trading

**Future Hook**:
- Define `NewsFeed` interface in `lib/deferred/types.ts`
- Design data provider abstraction
- Reserve UI space for news panel (optional toggle)

**Implementation Criteria**:
- Core scanner + execution stable for 3+ months
- Learning brain validated with 6+ months of trade data
- News provider API selected and costs modeled
- Sentiment scoring algorithm finalized

**Estimated Effort**: High (data pipeline + API + UI)

**Design Notes**:
- Use news provider like NewsAPI, Finnhub, or IEX Cloud
- Integrate via streaming API for real-time delivery
- Add sentiment scoring layer (proprietary or third-party)
- Separate "news-aware" scan mode from baseline scanner
- Allow users to journal "news-driven" trades for learning analysis

---

### Earnings Calendar & Risk Filtering (Deferred)

**What**: Earnings dates, EPS estimates, surprises, guidance; automated avoidance near earnings.

**Why Defer**:
- Valuable for fundamental filters
- Orthogonal to current price-action/Gann geometry focus
- Can be implemented as pre-trade validation layer

**Future Hook**:
- Add `earnings_date` and `earnings_proximity_flag` to `InstrumentMetadata`
- Define `EarningsRiskFilter` in user settings
- Pre-check orders against earnings dates before submission

**Implementation Criteria**:
- Instrument metadata schema finalized (partial: add earnings fields)
- Risk filter framework in order validation layer
- Earnings data provider selected (EDGAR, Bloomberg, IEX Cloud, etc.)
- Backtest shows earnings filters improve win rate

**Estimated Effort**: Medium (metadata + data provider + validation)

**Design Notes**:
- Start with binary flags: `avoid_days_before`, `avoid_days_after`
- Default: avoid 3 days before, 1 day after (user-configurable)
- Show upcoming earnings in ticker detail view
- Journal tag: "pre_earnings" or "post_earnings" for trade analysis

---

## Phase 3: Macro Regime & Market Conditioning

### Macro Features (Deferred)

**What**: Economic calendar (CPI, FOMC, jobs), rates, yield curves, macro regime indicators.

**Why Defer**:
- Macro regime modeling is a separate layer
- Adds complexity to feature engineering
- Current priority: micro (instrument-level) Gann/Sara execution
- Useful for conditioned learning, not baseline signals

**Future Hook**:
- Add `macro_regime` field to `ScanContextWithMacro`
- Design macro regime classifier (VIX, yield slope, etc.)
- Prepare learning model to accept (micro_features, macro_regime) tuples

**Implementation Criteria**:
- Core learning brain working well on per-symbol basis (6+ months data)
- Macro regime classification algorithm designed + tested
- Economic calendar data provider integrated
- Multi-scale learning model ready for macro conditioning

**Estimated Effort**: High (data pipeline + classification + model retrain)

**Design Notes**:
- Macro regimes: `risk_on` | `risk_off` | `neutral` | `high_vol` | `low_vol`
- Use technical signals: VIX > 25 (risk_off), yield curve inverted, etc.
- Condition learning model: different score adjustments per regime
- Example: score adjustment = base * (1 + regime_factor)
- Allow per-user macro awareness toggle in settings

---

## Phase 4: Advanced Integrations

Future deferred features (low priority):
- Multi-broker coordination (A/B testing)
- Strategy backtesting engine
- Performance attribution by macro regime
- SnapTrade multi-account portfolio consolidation
- Tax-loss harvesting suggestions

---

## Deferred Feature Status Tracking

See `lib/deferred/types.ts` for the `DEFERRED_FEATURES` registry — a machine-readable list of all deferred items with:
- Implementation criteria
- Target phase
- Estimated complexity
- Architect notes

---

## Decision Framework

**Before implementing a Phase 2+ feature**, ask:

1. **Is core MVP stable?** Has the scanner + execution loop been running for 3+ months without major bugs?
2. **Does learning brain validate?** Have we collected 6+ months of trade data showing the learning brain improves scores?
3. **Is the feature orthogonal?** Won't it break or over-complicate existing code?
4. **Do users need it?** Is this a blocker for retention, or a "nice to have"?
5. **Can we defer it gracefully?** Is the interface already defined? Can we ship without this feature?

**If all answers are "yes"**, start a new Blueprint section and implement iteratively.

---

## Architecture Readiness

Current state of interfaces for future features:

| Feature | Interface Defined | Data Model | Validation | Learning Hook |
|---------|-------------------|------------|------------|---------------|
| News | ✅ `NewsFeed`, `NewsProvider` | ✅ Defined | ❌ Not yet | ✅ Tagged trades |
| Earnings | ✅ `EarningsEvent`, `InstrumentMetadata` | ⚠️ Partial | ⚠️ Partial | ✅ Tagged trades |
| Macro | ✅ `MacroRegime`, `ScanContextWithMacro` | ✅ Defined | ❌ Not yet | ⚠️ Needs model update |

---

## Architect Notes

### News Integration Risk

Including news headlines increases the risk of **reactive trading** and **loss of discipline**. The learning brain could become biased toward "news as signal" rather than pattern-based analysis.

**Mitigation**: Keep news as *informational only*. Scan results remain pattern-based. News alerts trigger "manual review" mode, not automatic execution.

### Earnings Surprise Risk

Trading through earnings is high-variance. Even high-probability signals can gap through stops on surprising guidance.

**Mitigation**: Filter entries near earnings, but allow *management* of existing positions (scaled exits, stop moves). This gives users agency without creating gap risk.

### Macro Regime Feedback Loop

Conditioning the learning brain on macro regimes is powerful, but creates a feedback loop: if regimes shift unexpectedly, the model's learned coefficients may become stale.

**Mitigation**: Version all macro-conditioned models with explicit regime labels. If regime shifts dramatically, flag for manual review. Consider periodic model retraining on regime-specific data.

---

## Questions to Revisit

- (Q3 2025) Should we add news sentiment to the learning model?
- (Q4 2025) Is earnings filtering sufficient, or do we need directional guidance?
- (Q1 2026) Do macro regimes improve win rate enough to justify complexity?
