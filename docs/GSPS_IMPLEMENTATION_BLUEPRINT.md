# GSPS Implementation Blueprint

Gann-Centered Scanner System With Sara Sniper Strategy, Vortex/Digital-Root
Coordinates, and Evidence-Gated Signals

**Version:** 1.0
**Prepared:** September 8, 2026
**Primary product name:** Guided Stock Precision Scanner (GSPS)
**Former name:** Gann Sniper Protocol Scanner
**Audience:** Claude implementation agent, engineers, product architects, quant
researchers, and QA reviewers

> Added 2026-09-10 as a plain-text mirror of `docs/doctrine/
> GSPS_Claude_Implementation_Blueprint_Gann_Centered.pdf` — the actual source
> PDF, already committed by PR #198 (merged 2026-09-09) — so section text is
> grep-able and diffable instead of requiring a PDF reader. An earlier version
> of this note wrongly claimed the document had never been committed anywhere
> and existed only as a prior chat upload; that was this session's own local
> checkout being 61 commits behind `origin/main` at the time, not a real gap —
> PR #198 had already added it before this session started. Code comments
> elsewhere in this repo cite this document's section numbers (e.g.
> `lib/gann/digitalRoot.ts`, `lib/signals/confluence/gann.ts`); this file and
> the PDF it mirrors are the source those citations refer to. Transcribed from
> the source PDF; formatting (headings, code fences) adapted for Markdown,
> content unchanged.

## 1. Mission and governing doctrine

### 1.1 The Gann Sun model

Build GSPS as a market-scanning and trade-planning system whose organizing
principle is the practical, documented body of W. D. Gann's market
methodology.

Gann is the sun of GSPS. All other modules orbit it. The system must not
become a random indicator bundle and must not reduce Gann to a decorative
"3/6/9" label.

GSPS must operationalize the parts of Gann's work that are observable,
reproducible, and testable:

1. Price structure and trend.
2. Supply and demand expressed through price and volume.
3. Accumulation and distribution over time.
4. Market position relative to prior highs, lows, ranges, and
   resistance/support.
5. Time elapsed within a swing, range, or trend.
6. Instrument-specific behavior ("habits of stocks").
7. Confirmation before entry.
8. Patience and no-trade conditions when evidence is unclear.
9. Defined stop loss, risk limitation, and post-trade review.

Gann's "vibration," harmony, natural law, periodicity, and cyclic language
must be represented as researchable hypotheses and market-state features, not
as guaranteed causal laws.

### 1.2 Supporting orbiting modules

The following modules support the Gann core:

- **Sara Sniper Strategy**: named GSPS execution strategy; its precise
  existing rules must be preserved, inventoried, and integrated into the
  confirmation/execution layer.
- **Digital Root (DR)**: mandatory whenever Gann is mentioned in GSPS
  outputs.
- **Vortex map**: 1-2-4-8-7-5 flow loop, 3-6 polarity relationship, 9
  completion node, and 1 renewal node.
- **Conventional technical features** only where measurable and validated:
  ATR, relative volume, anchored VWAP, moving-average trend state, prior
  swing levels, price range, relative strength, breadth/sector confirmation,
  volatility percentile, and optional volume-at-price.
- **Risk engine**: hard stops, position sizing, loss guardrails, trade
  eligibility, and tier-specific permissions.

### 1.3 Product promise

GSPS is a transparent market-state scanner and decision-support system. It
identifies:

- Confirmed pullbacks within trends.
- Potential mean reversions after rejected or climactic moves.
- Momentum continuations after accepted, high-participation moves.
- Sideways/range opportunities where rule conditions are met.
- No-trade states where the market lacks sufficient evidence.

GSPS must never claim that a number, Gann coordinate, Vortex state, or
indicator guarantees an outcome.

## 2. Non-negotiable terminology

### 2.1 Digital-root convention: active values only

GSPS operates with digital roots 1 through 9 only.

- 0 means absence, non-manifestation, missing, invalid, or unusable input.
- A valid positive number divisible by 9 has active root 9, not root 0.
- Never display 0 as a Gann node, harmonic node, signal root, or market
  state.
- Never convert missing/null/invalid data to root 9.

Mathematical formula for a positive integer `n`:

```python
def digital_root_1_to_9(n: int) -> int:
    if n <= 0:
        raise ValueError("GSPS digital roots require a positive integer")
    return 1 + ((n - 1) % 9)
```

Compatibility version for a valid numeric value that must be decimal-stripped
per the legacy Gann Protocol:

```python
def calculate_gann_dr(value) -> int | None:
    clean = "".join(ch for ch in str(value) if ch.isdigit())
    if not clean:
        return None
    integer_value = int(clean)
    if integer_value == 0:
        return None
    return digital_root_1_to_9(integer_value)
```

### 2.2 Data integrity rule

Do **not** use raw formatted display prices as the primary predictive input.
A root derived from $123.45 can change if quote precision changes, even
without meaningful economics.

Use normalized integer measures. Preserve the legacy decimal-strip method as
a separately labeled `display_price_dr` feature if desired, but do not let it
alone determine a trade.

Every DR field must include:

```
raw_value
normalization_method
integer_value
mod9_residue
active_digital_root
input_timestamp
source_timeframe
feature_version
```

### 2.3 Gann labels

Use this consistent language in UI, reports, API, and logs:

```
Gann Digital Root: 1–9 only
Root 9: Completion / Culmination Node
Root 1: Renewal / Initiation Node
Complementary Root: Root that resolves with another active root to 9
Polarity Pair: One of 1–8, 2–7, 3–6, 4–5, or 9–9
Gann Coordinate: A transparent calculated price/time/volume state, not a forecast guarantee
Experimental: Feature not yet promoted by out-of-sample validation
Validated: Feature that passed the configured promotion criteria
No Trade: Valid output state, not an error
```

## 3. What Gann documented: requirements translation

The attached source material must be treated as the project's historical
foundation.

### 3.1 Direct Gann-derived operating requirements

| Gann principle | GSPS requirement |
|---|---|
| Price movements depend on supply and demand | Require price and volume/participation data in every trade-eligible signal |
| Major moves require time for accumulation or distribution | Measure time in range, bars since pivot, and range/volume structure |
| Volume needed to move an issue depends on shares/float | Include liquidity, dollar volume, float/market-cap context when available |
| Trend must be distinguished from minor reactions | Build multi-timeframe trend and swing structure engine |
| News is often discounted, while surprise matters | Add event-aware state and require price reaction confirmation rather than narrative-only signals |
| Traders are harmed by hope, fear, and overtrading | Include no-trade output, cooldowns, fixed invalidation, and coaching explanations |
| Stops must be placed when the trade is made | No live/paper trade plan can exist without a deterministic stop/invalidation |
| Focus on selected instruments and their habits | Build instrument behavior profiles and watchlist specialization |
| Be out of the market when no trend is clear | Neutral/no-trade is mandatory; never fabricate directional certainty |

### 3.2 Historical boundary

Do not claim that Gann disclosed the GSPS decimal-strip modulo-9 formula, a
mandatory 3/6/9 target formula, or a universal fixed "vibration" calculation.
The historical source uses language of cycles, vibration, individual stock
characteristics, support/resistance, and time but does not disclose a
complete reproducible calculation.

Implement Gann-related numeric elements as explicit GSPS hypotheses with
formulas, versioning, and tests.

## 4. The GSPS winning formula

### 4.1 Formula statement

A GSPS trade candidate becomes actionable only when a Gann-centered market
state has measurable confluence:

```
GSPS Actionable Setup
= Market Regime
+ Higher-Timeframe Trend
+ Price Structure and Location
+ Supply/Demand Confirmation
+ Time-in-Structure Context
+ Volatility Regime
+ Gann/Vortex/DR Coordinate Confluence
+ Sara Sniper Execution Trigger
+ Deterministic Risk Plan
+ Liquidity and Event Filters
```

Every factor must be present in the signal record. Missing factors lower
confidence or produce `NO_TRADE`.

### 4.2 Mandatory condition hierarchy

The hierarchy is intentionally ordered. Lower-priority elements may not
override higher-priority invalidation.

1. Data integrity and tradability.
2. Risk gate and user eligibility.
3. Market regime and higher-timeframe trend.
4. Price structure and location.
5. Supply/demand, volume, and volatility behavior.
6. Time and cycle context.
7. Gann/Vortex/DR coordinate context.
8. Sara Sniper trigger and entry mechanics.
9. Position management, targets, stop, and expiry.

Example: A digital-root completion node cannot override a bearish breakdown
with increasing downside volume. It may create a reversion alert, but no long
entry is allowed without the defined reclaim/confirmation trigger.

### 4.3 Strategy families

GSPS must classify signals into one mutually exclusive primary type:

```
MOMENTUM_CONTINUATION
MEAN_REVERSION
PULLBACK_CONTINUATION
RANGE_ROTATION
NO_TRADE
```

A signal can list secondary tags, but must not simultaneously report
contradictory primary strategies.

## 5. System architecture

### 5.1 Module map

```
Market Data Layer
  -> Data Normalization Layer
  -> Pivot / Trend / Structure Engine
  -> Supply-Demand / Volume / Liquidity Engine
  -> Time and Cycle Engine
  -> Gann Coordinate Engine
  -> Vortex and Digital Root Engine
  -> Indicator Ensemble
  -> Sara Sniper Strategy Engine
  -> Strategy Classifier
  -> Risk and Position-Sizing Engine
  -> Signal Ranking / Tier Entitlements
  -> Explainability and Audit Ledger
  -> Backtest / Walk-Forward Validation Platform
```

### 5.2 Data model

Create normalized tables or equivalent domain entities:

```
instrument
bar
corporate_action
instrument_profile
pivot
trend_state
volume_state
volatility_state
market_regime
gann_coordinate
vortex_state
digital_root_feature
strategy_signal
trade_plan
risk_plan
signal_outcome
backtest_run
feature_registry
experiment_registry
model_version
audit_event
```

### 5.3 Required audit fields

Every generated signal must be reproducible from stored data. Persist:

```
signal_id
instrument_id
timeframe
bar_close_timestamp
data_vendor
all OHLCV inputs used
market regime inputs
selected pivots and pivot confirmation timestamps
feature values and formulas
parameter-set version
strategy version
entry rule
entry price or trigger
stop price and invalidation reason
target rules and levels
time stop
estimated fees/spread/slippage
liquidity score
risk amount and size rule
user tier / paper-live mode
why_actionable[]
why_not_actionable[]
```

## 6. Data normalization

### 6.1 Canonical price measures

Implement these as positive integer measures where possible:

```
price_displacement_ticks = round(abs(last_price - anchor_price) / tick_size)
time_displacement_bars = max(1, current_bar_index - anchor_bar_index)
bar_range_ticks = max(1, round((high - low) / tick_size))
atr_ticks = max(1, round(atr_n / tick_size))
level_distance_ticks = max(1, round(abs(last_price - key_level) / tick_size))
relative_volume_index = max(1, round(100 * volume / avg_volume_n))
dollar_volume_index = max(1, round(dollar_volume / dollar_volume_unit))
```

For negative directional measures, store direction separately. Do not
compute a digital root over a negative string.

```
direction: UP / DOWN / FLAT
magnitude_integer: positive normalized integer
active_digital_root: 1–9
```

### 6.2 Asset-class adapters

| Asset class | Primary normalization |
|---|---|
| Equities / ETFs | Tick size, adjusted OHLCV, dollar volume, float/market-cap profile |
| Futures | Tick value, contract multiplier, roll-adjusted or contract-specific history, session calendar |
| Forex | Pip/pipette scale, session boundaries, spread/rollover assumptions |
| Crypto | Exchange-specific tick size, 24/7 session model, spot/perpetual distinction, funding rates |
| Options | Underlying-state signal plus option strike/expiry/Greeks/liquidity adapter; never root-only option selection |

## 7. Vortex and digital-root engine

### 7.1 Mathematical state mapping

Implement the active 1–9 root convention.

```python
VORTEX_FLOW = [1, 2, 4, 8, 7, 5]
POLARITY_PAIRS = {
    1: 8,
    8: 1,
    2: 7,
    7: 2,
    3: 6,
    6: 3,
    4: 5,
    5: 4,
    9: 9,
}

def gann_complement(root: int) -> int:
    if root not in range(1, 10):
        raise ValueError("root must be 1 through 9")
    return POLARITY_PAIRS[root]

def resolves_to_completion(root_a: int, root_b: int) -> bool:
    return digital_root_1_to_9(root_a + root_b) == 9

def vortex_class(root: int) -> str:
    if root in VORTEX_FLOW:
        return "VORTEX_FLOW"
    if root in (3, 6):
        return "POLARITY_AXIS"
    if root == 9:
        return "COMPLETION_NODE"
    raise ValueError("root must be 1 through 9")
```

### 7.2 Required root features

Calculate and persist at minimum:

```
price_displacement_dr
time_displacement_dr
swing_range_dr
bar_range_dr
atr_dr
relative_volume_dr
level_distance_dr
display_price_dr (legacy/context-only)
```

### 7.3 Confluence types

```
NO_CONFLUENCE
COMPLEMENTARY_PAIR
COMPLETION_PAIR
THREE_SIX_POLARITY
NINE_COMPLETION
VORTEX_FLOW_TRANSITION
ONE_RENEWAL_TRANSITION
MULTI_FACTOR_CONFLUENCE
```

### 7.4 Safety rule

DR/Vortex features are initially `EXPERIMENTAL`. They may:

- Add tags.
- Rank research candidates.
- Highlight candidate price/time windows.
- Contribute to a confidence score.

They may not by themselves:

- Create a live-trade entry.
- Override a stop.
- Override trend or risk gates.
- Create exact price targets without a separate deterministic price-level
  formula.

## 8. Gann coordinate engine

### 8.1 Purpose

The Gann Coordinate Engine must turn price, time, volume, range, and
DR/Vortex state into transparent, inspectable candidate zones.

### 8.2 Anchor selection

Use objective, configurable pivot rules. Initial implementation:

```
Pivot low:
A low that is lower than N bars before and N bars after.
It becomes usable only after the N future confirmation bars close.

Pivot high:
A high that is higher than N bars before and N bars after.
It becomes usable only after the N future confirmation bars close.
```

Persist both:

```
pivot_occurrence_timestamp
pivot_confirmation_timestamp
```

Never allow the system to trade using a pivot before it was confirmed.

### 8.3 Candidate price coordinates

Generate and label candidate levels from:

- Confirmed swing high and low.
- Prior daily/weekly/monthly high and low.
- Range midpoint and range fractions.
- Measured move from confirmed swing range.
- Anchored VWAP from major pivot/event.
- Optional Square-of-Nine module only after formula and testing
  specification are approved.
- Volatility-based bands using ATR.

Every coordinate must store:

```
coordinate_type
anchor_id
formula_description
parameter_values
price_level
side: SUPPORT / RESISTANCE / NEUTRAL
confidence_basis
research_status
```

### 8.4 Time coordinates

Initial time coordinates must be simple and testable:

- Bars since confirmed pivot.
- Trading days since confirmed pivot.
- Time spent in a range.
- Duration of current trend leg.
- Time symmetry ratio: current swing duration / prior swing duration.
- Predefined event windows.

Do not claim universal cycle length. Store candidate time windows as alerts
and test them by asset, timeframe, and regime.

### 8.5 Gann angle design

Do not use chart-screen pixels. Define normalized slopes such as:

```
price change per bar in ATR units
percent price change per bar
log-price change per bar
```

A 1x1-type reference needs a declared unit. Initial normalized version:

```
normalized_slope = (price_t - anchor_price) / (atr_at_anchor * bars_since_anchor)
```

Only expose Gann-angle labels when the scale and anchor are explicitly
stored.

## 9. Supply-demand, volume, and volatility engine

### 9.1 Required calculations

```
relative_volume = current_volume / rolling_average_volume
relative_dollar_volume
ATR
ATR percentile
true-range percentile
rolling realized volatility
close_location_value
up-volume/down-volume proxies
volume persistence: elevated volume count in recent bars
range compression/expansion state
liquidity score
spread estimate or observed spread where available
```

### 9.2 State classification

Implement these states:

```
QUIET_ACCUMULATION
QUIET_DISTRIBUTION
ACCEPTED_UPSIDE_EXPANSION
ACCEPTED_DOWNSIDE_EXPANSION
REJECTED_UPSIDE_EXPANSION
REJECTED_DOWNSIDE_EXPANSION
LOW_PARTICIPATION_RANGE
UNCLASSIFIED
```

### 9.3 Initial deterministic definitions

Use configuration rather than hard-coded constants. Starting defaults may be:

```
relative volume elevated: >= 1.5x 20-bar average
relative volume climactic: >= 2.0x 20-bar average
range expansion: true range >= 75th percentile of trailing 60 bars
range climax: true range >= 90th percentile of trailing 60 bars
bullish acceptance: close location >= 0.75
bearish acceptance: close location <= 0.25
```

Do not promote these defaults as universal truths. Backtest them by
instrument and timeframe.

## 10. Strategy engines

### 10.1 Mean-reversion engine

Purpose: identify exhausted or rejected moves, not merely "oversold" or
"overbought" conditions.

**Long mean-reversion candidate**

1. Price is at/near a mapped support coordinate or materially extended below
   a defined level.
2. Downside volatility is expanded or climactic.
3. Selling volume is elevated/climactic or shows exhaustion/rejection
   pattern.
4. Price structure shows failed breakdown, reclaim, reversal, or higher low.
5. Gann/DR/Vortex completion or polarity condition exists as an experimental
   confluence tag.
6. Sara Sniper long trigger confirms.
7. Stop/invalidation is defined below the exhaustion low or invalidation
   coordinate.
8. Liquidity/event/risk gates pass.

**Short mean-reversion candidate**

Mirror the long logic around mapped resistance, upside extension, climactic
buying, failed breakout, rejection, and a bearish Sara Sniper trigger.

### 10.2 Momentum-continuation engine

Purpose: identify accepted, persistent moves with sustained participation; do
not confuse intensity with exhaustion.

**Long continuation candidate**

1. Higher timeframe trend is bullish.
2. Price breaks or reclaims a defined resistance/support coordinate.
3. Relative volume is elevated and persists.
4. Range expands while bars close near their highs.
5. Price remains accepted above breakout level or passes retest.
6. Gann/DR/Vortex state supports ranked confluence but does not independently
   cause entry.
7. Sara Sniper continuation trigger confirms.
8. Stop lies below retest low / higher low / volatility invalidation.

**Short continuation candidate**

Mirror the logic for bearish trend, breakdown acceptance, lower-range closes,
failed reclaim, and bearish trigger.

### 10.3 Pullback-continuation engine

Purpose: identify controlled pullbacks within an established trend.

1. Higher-timeframe trend is established.
2. Pullback returns to a mapped level, trend reference, or anchored VWAP
   zone.
3. Pullback volume contracts relative to impulse volume or rejection occurs
   at the support/resistance zone.
4. Trend resumes through a defined trigger.
5. DR/Vortex/time coordinate is logged and scored.
6. Stop is structural and deterministic.

### 10.4 Range-rotation engine

Purpose: identify rule-compliant trades between established range support
and resistance.

1. Market regime is range/neutral, not strong directional trend.
2. Defined support and resistance exist with adequate historical touches.
3. Entry occurs only on confirmation at a boundary.
4. Stop is beyond range invalidation.
5. Target is range midpoint or opposing boundary depending on risk plan.
6. Avoid entries during abnormal event volatility or confirmed breakout
   acceptance.

### 10.5 No-trade engine

Return `NO_TRADE` when any of these applies:

```
No confirmed trend/structure.
Insufficient liquidity.
Excessively wide spread.
Earnings/event risk conflicts with user rules.
No deterministic stop.
Signal conflicts across required layers.
Risk/reward or expected value gate fails.
User tier cannot trade the strategy/timeframe.
Data missing, stale, or invalid.
Numeric confluence exists without price/volume confirmation.
```

## 11. Sara Sniper Strategy integration

### 11.1 Immediate engineering task

The Sara Sniper Strategy is a named GSPS strategy and must be an
independently versioned module.

Search the repository, prompt records, strategy documents, database, and
prior implementation for all rules associated with:

```
Sara Sniper Strat
Sara Sniper Strategy
Sara Sniper
```

Create:

```
/docs/strategy-registry/sara-sniper.md
/src/strategies/sara_sniper/
/tests/strategies/test_sara_sniper_*.py
```

Do not invent rules if they are not present. If exact legacy rules cannot be
found, create a `SARASniperSpecRequired` state and list the unresolved
fields.

### 11.2 Required strategy interface

```python
class StrategyResult:
    strategy_id: str
    strategy_version: str
    signal_type: str
    direction: str
    status: str  # WATCH / DEVELOPING / ACTIONABLE / NO_TRADE
    entry_trigger: float | None
    stop_loss: float | None
    targets: list[float]
    time_stop_bars: int | None
    confidence_score: float
    conditions_met: list[str]
    conditions_failed: list[str]
    feature_snapshot_id: str
```

Sara Sniper should consume the Gann core state rather than bypass it:

```
Gann coordinates define context and attention zones.
Volume/volatility classify acceptance or rejection.
Sara Sniper defines the exact tactical confirmation and trade-plan construction.
Risk engine approves or rejects execution.
```

## 12. Indicator ensemble policy

Indicators are supporting instruments, not the sun.

### 12.1 Approved initial candidates

| Indicator / measure | Purpose |
|---|---|
| ATR | Volatility normalization, stops, extension, position sizing |
| Relative volume | Participation and supply/demand confirmation |
| Anchored VWAP | Acceptance/rejection and institutional reference zone |
| Moving averages | Trend/regime context, not stand-alone entries |
| Prior swing levels | Support/resistance and structural invalidation |
| Price range / true range | Expansion, compression, climax detection |
| Relative strength vs SPY/sector | Context and leadership/lagging confirmation |
| Volume-at-price | Optional acceptance/rejection zones when data available |
| RSI | Optional secondary exhaustion condition only; never sole signal |
| MACD | Optional trend/momentum corroboration only; never sole signal |

### 12.2 Indicators excluded as automatic authority

Do not allow any one indicator, oscillator, number root, or visual chart
angle to independently generate a live signal.

All new indicators require:

```
feature specification
reason for inclusion
baseline comparison
out-of-sample evaluation
cost-adjusted performance test
ablation result
promotion/rejection decision
```

## 13. Risk, targets, and trade management

### 13.1 Non-negotiable risk rules

```
No trade plan without entry, stop, invalidation explanation, target rule, and time stop.
Stop must be created when the plan is created.
Root/Vortex state cannot widen or remove a stop.
Signal is invalid if the structural premise fails.
```

### 13.2 Position sizing

```
risk_per_share = abs(entry_price - stop_price)
max_dollar_risk = account_equity * user_risk_fraction
position_size = floor(max_dollar_risk / (risk_per_share + estimated_slippage_per_share))
```

### 13.3 Existing GSPS guardrails to preserve

- Novice users: swing trading only, up to three trades per trading day.
- Novice cooldown: activate when the user reaches three trades in a trading
  day or loses more than 18% of total funds within 48 hours.
- Loss notifications: notify when a single trade depletes 6%, 9%, or 15% of
  total funds.
- Hard warning: at 30% loss of total funds in a trade.
- Automatic close: at 50% loss of total funds in that trade, for live
  trading.
- Paper trading is exempt from live-execution restrictions.
- Stop-loss expansion/removal is Wall Street tier only, only after mandatory
  warning, and only after verified email and phone notification enrollment.
- Automation/live execution is restricted to Wall Street members within the
  dedicated Automation tab; paper trading is exempt.

### 13.4 Target philosophy

Targets must be derived from deterministic market structures, not only
numeric labels.

Candidate target sources:

```
1R partial target
2R or marker-specific percentage target
Prior swing high/low
Mapped Gann price coordinate
Anchored VWAP / range midpoint
Measured move
Validated volatility projection
Trailing stop after target 1
```

Preserve the user's requirement for marker-specific percentage take-profit
and stop-loss levels rather than a rigid universal 2:1 risk/reward rule.
Target/stop percentages must be explicit per strategy marker and tested by
asset class.

## 14. Signal scoring and tiers

### 14.1 Score by evidence, not mystique

Build a configurable score with contribution disclosure.

Example components:

```
trend_alignment_score
price_structure_score
level_quality_score
volume_confirmation_score
volatility_regime_score
time_context_score
gann_coordinate_score
digital_root_vortex_score
sara_sniper_trigger_score
liquidity_score
market_benchmark_score
event_risk_penalty
conflict_penalty
```

### 14.2 Score output

```
0–24: NO_TRADE
25–49: WATCH
50–69: DEVELOPING
70–84: ACTIONABLE
85–100: HIGH_CONFLUENCE
```

Thresholds are placeholders and must be calibrated through research. Store
configuration by version.

### 14.3 Tier allocation

Honor existing scan output limits:

| User tier | Maximum total setups per scan | Manual dashboard scans/day |
|---|---|---|
| Novice | 6, ideally 3 long and 3 short | 1 |
| Pro | 12 | 3 |
| Expert | 20 | 6 |
| Wall Street | 30 | Unlimited |

Rank primarily by eligibility, confidence, liquidity, risk quality, and
diversification—not by numeric root alone.

## 15. Backtesting and research platform

### 15.1 Research question

Every DR/Vortex/Gann feature is a falsifiable hypothesis:

```
Does this feature improve a specified strategy's post-cost performance
relative to the identical strategy without the feature?
```

### 15.2 Required baselines

For each strategy and asset/timeframe, compare:

```
Buy-and-hold or cash benchmark where appropriate.
Simple trend-following baseline.
Simple breakout baseline.
Simple mean-reversion baseline.
Same GSPS strategy with Gann/DR/Vortex feature removed.
Random-time matched control signals.
Prior-swing support/resistance strategy without DR/Vortex feature.
```

### 15.3 Required metrics

```
Trade count
Win rate
Average win
Average loss
Expectancy in R
Profit factor
Net return after costs
Maximum drawdown
Sharpe ratio
Sortino ratio
Calmar ratio
Turnover
Capacity/liquidity feasibility
Performance by regime
Performance by asset
Performance by timeframe
Stability under parameter perturbation
```

### 15.4 Bias controls

Must implement or document controls for:

```
Look-ahead bias
Survivorship bias
Delisting bias
Corporate-action bias
Data-snooping bias
Curve fitting
Multiple testing
Cherry-picking
Selection bias
Regime selection bias
Unrealistic fill assumptions
Ignored transaction costs
Ignored market impact
Future-known pivots
```

### 15.5 Validation requirements

```
Development sample -> validation sample -> locked out-of-sample sample.
Walk-forward test across multiple eras.
Post-cost test.
Block bootstrap or appropriate dependent-data resampling.
Permutation tests for root labels/conditions.
Confidence intervals.
Multiple-testing correction when testing feature grids.
Ablation: same model minus the candidate root/Vortex/Gann feature.
Paper-trading reconciliation before live automation.
```

### 15.6 Promotion rule

A feature can move from `EXPERIMENTAL` to `VALIDATED` only if it:

```
Improves a predeclared post-cost metric over a relevant baseline.
Passes locked out-of-sample testing.
Remains directionally stable across reasonable parameter changes.
Does not depend on one instrument, one era, or one volatility regime.
Does not materially worsen maximum drawdown/tail risk.
Has adequate sample size.
Has reproducible code and an audit trail.
```

Otherwise label it `EXPERIMENTAL`, `INCONCLUSIVE`, or `REJECTED`.

## 16. Asset-class and execution constraints

### 16.1 Equities and ETFs

Account for:

```
Bid/ask spread
Commissions/fees
Slippage
Market impact
Short locate/borrow cost
Corporate actions
Delistings
Earnings gaps
Liquidity screens
Point-in-time constituent membership
```

### 16.2 Futures

Account for:

```
Contract specifications
Tick value
Contract multiplier
Margin
Roll construction and roll costs
Session/calendar definition
Limit moves
Overnight liquidity
```

### 16.3 Forex

Account for:

```
Pip convention
Bid/ask spread
Rollover/swap
Session-specific liquidity
Leverage
Central-bank event exposure
```

### 16.4 Crypto

Account for:

```
Exchange-specific liquidity
24/7 bar/session convention
Maker/taker fees
Funding rates
Liquidation mechanics
Perpetual vs spot distinction
Custody/exchange risk
```

### 16.5 Options

Do not turn an underlying root condition directly into an option
recommendation. Add:

```
Underlying trade thesis
Expiration selection rule
Strike selection rule
Delta/Gamma/Theta/Vega at entry
Implied-volatility state and event risk
Bid/ask spread and open interest
Maximum loss
Assignment/exercise handling
Theta decay and IV crush analysis
Comparison to underlying-only trade
```

## 17. User experience requirements

### 17.1 Required signal explanation

Each surfaced setup must answer in plain English:

```
What is price doing?
What is volume doing?
What is volatility doing?
What is the higher-timeframe trend?
Where is price relative to the mapped Gann coordinates?
What are the digital roots and Vortex classifications?
Is the root feature experimental or validated?
Why is this a reversion, continuation, pullback, range rotation, or no-trade state?
What exact event triggers entry?
What invalidates the thesis?
What are targets and their formulas?
What risks exist?
```

### 17.2 Required warning language

Use clear language:

```
"Digital-root and Vortex features are contextual classifications. They do not guarantee outcomes."
"This setup is not trade-eligible until price confirms the trigger."
"High volume can mean acceptance/continuation or exhaustion/reversal. The scanner distinguishes by follow-through."
"No Trade is an intentional protective outcome."
```

### 17.3 Educational integration

The GSPS School tab must teach the user why a setup appears, using Mrs. Bear
and Mr. Bull as instructional guides. Lessons must explain trend,
support/resistance, volume, volatility, stop placement, reversion versus
continuation, and experimental numeric features without promising certainty.

## 18. API contract example

```json
{
  "ticker": "AAPL",
  "timeframe": "1h",
  "as_of": "2026-09-08T18:00:00-04:00",
  "primary_strategy": "MOMENTUM_CONTINUATION",
  "status": "ACTIONABLE",
  "direction": "LONG",
  "market_state": {
    "trend": "BULLISH",
    "structure": "ACCEPTED_UPSIDE_EXPANSION",
    "relative_volume": 1.82,
    "atr_percentile": 79,
    "liquidity_score": 96
  },
  "gann_context": {
    "anchor": {"type": "CONFIRMED_SWING_LOW", "price": 0.0, "timestamp": "..."},
    "price_displacement_ticks": 0,
    "price_dr": 8,
    "time_displacement_bars": 0,
    "time_dr": 1,
    "relationship": "COMPLETION_PAIR",
    "vortex_class": "VORTEX_FLOW",
    "research_status": "EXPERIMENTAL"
  },
  "plan": {
    "entry_trigger": 0.0,
    "stop_loss": 0.0,
    "stop_reason": "Break below confirmed retest low",
    "targets": [0.0, 0.0],
    "time_stop_bars": 10,
    "position_size_rule": "Account risk / all-in cost-adjusted risk per share"
  },
  "explanation": {
    "conditions_met": [],
    "conditions_failed": [],
    "no_trade_conditions": [],
    "disclaimer": "Gann/DR/Vortex features are contextual and do not guarantee outcomes."
  },
  "audit": {
    "strategy_version": "...",
    "feature_version": "...",
    "parameter_set_id": "...",
    "data_snapshot_id": "..."
  }
}
```

Do not use zero prices in production payloads; they are placeholders in this
example only.

## 19. Implementation milestones

**Milestone 0: Discovery and inventory**

- Locate the actual GSPS codebase, current branch, database schema,
  deployment configuration, and prior strategy docs.
- Search for all Gann, root, modulo, Vortex, harmonic, Sara Sniper,
  reversion, continuation, volume, volatility, stop, target, tier, and risk
  code.
- Produce a traceability matrix: existing / partial / absent / contradictory.
- Do not overwrite legacy logic until it is documented.

**Milestone 1: Foundation services**

- Implement canonical digital-root 1–9 service.
- Implement data normalization service.
- Implement feature registry and audit schema.
- Add unit tests for roots, complement pairs, zero/null handling, and
  precision invariance.

**Milestone 2: Structure and market-state engines**

- Build pivot confirmation.
- Build multi-timeframe trend state.
- Build support/resistance and anchored VWAP coordinates.
- Build relative volume, ATR, volatility percentile, liquidity, and
  acceptance/rejection states.

**Milestone 3: Gann/Vortex coordinates**

- Build price/time/range/volume DR features.
- Build complement/polarity/completion classification.
- Build transparent Gann coordinate ledger.
- Keep root-driven signals experimental.

**Milestone 4: Strategy engines**

- Implement mean reversion, momentum continuation, pullback continuation,
  range rotation, and no-trade logic.
- Integrate Sara Sniper once exact rules are inventoried.
- Build deterministic entry/stop/target/time-stop plans.

**Milestone 5: Risk, entitlement, and UX**

- Implement risk calculations and existing live/paper tier restrictions.
- Surface clear signal cards and no-trade explanations.
- Add educational explanations in GSPS School.

**Milestone 6: Research platform**

- Build event-driven backtester.
- Add realistic costs.
- Add benchmarks, ablation testing, walk-forward tests, and experiment
  registry.
- Produce validation reports for every promoted feature.

**Milestone 7: Paper trading then controlled live use**

- Reconcile signal records with simulated/paper fills.
- Evaluate realized slippage and adherence.
- Enable live execution only under existing Wall Street Automation tab
  controls.

## 20. Acceptance criteria

A release is not complete unless all of the following are true:

- Digital roots always produce 1–9 for valid positive inputs.
- Zero, null, missing, invalid, and stale values never become root 9.
- Every root is traceable to normalized input and formula.
- Every Gann-referenced output includes DR determination.
- No root/Vortex label can create a live entry by itself.
- Every actionable setup contains entry, stop, invalidation reason, targets,
  time stop, risk calculation, and explanation.
- No-trade output exists and is visible.
- Reversion and continuation classifiers are separately implemented and
  cannot be conflated.
- High volume/volatility is classified as accepted versus rejected using
  follow-through and price-location evidence.
- Sara Sniper rules are sourced and versioned, not guessed.
- Backtests prevent future-known pivots and include costs.
- Every experimental feature is visibly labeled.
- Every validated feature has a stored out-of-sample validation record.
- Existing GSPS tier and live-trading guardrails are enforced.

## 21. Final implementation instruction to Claude

Implement GSPS as a Gann-centered, Vortex-aware, digital-root-coordinate
scanner whose purpose is to identify and explain high-quality market
states—not to issue mystical certainty.

Use this decision law:

```
Gann establishes the operating philosophy:
price + time + volume + supply/demand + market position + discipline.

Vortex and DR establish the 1–9 coordinate language:
flow + polarity + completion + renewal.

Sara Sniper establishes tactical execution:
when a context becomes an exact entry, stop, target, and management plan.

Other indicators support, measure, and verify:
they never replace the Gann core.

Risk controls govern every trade:
no stop, no trade; no confirmation, no trade; no clarity, no trade.
```

Build the audit trail and test harness before promoting numerical or
Gann-related claims into trade-eligible logic.
