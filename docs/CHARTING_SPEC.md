# GSPS Charting Spec (grounded in the Webull reference set)

Source of truth for the charting work in the Next.js app. Derived from the 20
reference screenshots supplied on 2026-07-21. NOK is the **reference example**
in the source document, **not** a default/focus asset — do not hardcode it into
the universe.

## 1. Candle aggregation (fixes the "8 vs 9 daily candles" bug)

- One **regular-hours** daily candle = 09:30–16:00 ET, aggregated in **ET**, not
  UTC. The observed bug (8 vs 9 candles) is pre/post-market ticks leaking across
  the UTC midnight boundary and creating a phantom candle.
- Bucket every intraday tick by its ET session date before rolling up to daily.
- Extended-hours ticks must route to the ETH layer (section 4), never merge into
  the regular daily candle.

## 2. OHLC crosshair tooltip + axis tags  (ref: IMG_0051)

On hover/tap the crosshair shows a data box:

```
Open   746.21
High   746.21
Low    746.19
Close  746.19
Range  0.02      (= High − Low)
Volume 78
```

- Plus a **price tag** pinned on the Y axis and a **time tag** on the X axis at
  the crosshair position.
- Desktop = hover; mobile = tap-and-hold.

## 3. Timeframe ladder + interval→lookback  (ref: IMG_0051-0062)

| Interval    | Default lookback | Title label   |
| ----------- | ---------------- | ------------- |
| 1 Min       | ~15 days (≤5d live focus) | `15Days:1m` |
| 5 MIN       | ~15 days         | `15Days:5m`   |
| 15 MIN      | ~30 days         | `30Days:15m`  |
| 30 Min      | ~30 days         | `30Days:30m`  |
| 1 HR / 1 HR Line | ~180 days   | `180Days:1h`  |
| 2 HR        | ~180 days        | `180Days:2h`  |
| 4hr         | ~180 days        | `180Days:4h`  |
| Daily       | 5 years          | `5Yr:Day`     |
| Weekly      | 15 years         | `15Yr:Week`   |
| Monthly     | **MAX / all-time** back to listing | `MAX:Mon` |

Plus a **Live/Tick** view for real-time price action (draw S/R, wait for price
to enter the user's range before entering).

## 4. Extended Trading Hours (ETH)  (ref: IMG_0061-0069)

- Every interval has a parallel **"… Extended"** variant (e.g. `5MIN Extended`,
  `Daily Extended`, `Weekly Extended`). Selecting an Extended variant is the ETH
  toggle.
- ETH sessions render as **shaded vertical bands** distinct from regular-hours
  bands, so users can see overnight gaps/jumps.
- ETH is **coded into the data layer but hidden by default** ("less is more").
  Persist the toggle in `settings.prefs` (e.g. `{ "eth": true }`).
- Monetization is undecided — keep it a settings toggle, feature-flag-ready so it
  can move behind a tier later without a data-model change.

## 5. Sub-charts & chrome

- **MACD** pane (value/avg/histogram) with legend (Value, Avg, Diff, ZeroLine,
  UpSignal, DownSignal). **Investor Mode** gated (`oscillators`).
- **RSI** pane with 30/70 bands + legend (RSI, OverSold, OverBought). Investor
  Mode gated.
- **Hi / Lo** peak labels on the price pane (`Hi: 760.4`, `Lo: 629.28`).
- Left-edge toolbar: candle-type, indicators, and drawing tools (trendlines,
  Bollinger Bands, Fibonacci) — drawing tools are Investor Mode gated
  (`drawing_tools`).

## 6. Tier gating (see engine/tiers/entitlements.ts)

| Surface                    | Minimum tier   | Feature flag             |
| -------------------------- | -------------- | ------------------------ |
| Core OHLCV chart + tooltip | Standard       | (always on)              |
| Real-time streaming        | Standard       | `real_time_streaming`    |
| ETH toggle                 | Standard       | `extended_trading_hours` |
| Drawing tools              | Investor Mode  | `drawing_tools`          |
| MACD / RSI                 | Investor Mode  | `oscillators`            |
| Mean-reversion scanner     | Investor Mode  | `mean_reversion_scanner` |
| Live high-freq tick / auto | System Mastery | `high_frequency_tick_streams`, `autonomous_portfolio_manager` |

Wrap gated surfaces in `<FeatureGate tier feature>` (ui/FeatureGate.tsx).

## 7. Layout / progressive disclosure

- **Portrait mobile:** clean Robinhood-style line/sparkline + compact asset cards
  with swipe-to-intervene; order ticket slides up as a bottom sheet.
- **Landscape / desktop:** expose the full candlestick engine, OHLCV tooltips,
  indicator sub-charts, and the NinjaTrader pinned position ticket
  (ui/ActivePositionTicket.tsx) as a sticky right column.
- Universe/sector pills use horizontal overflow-scroll on mobile.
