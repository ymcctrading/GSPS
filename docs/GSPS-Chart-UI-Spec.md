# GSPS Charting UI — Spec derived from the reference screenshots

**Source:** 20 screenshots of the existing GSPS app (SPY chart screen), provided
2026-07-23. **Author:** Claude Code. This is the reference I'm building Phase A
against.

## Screen layout (top → bottom)

1. **Status/header row** — back chevron, `SPY` + full name ("State Street SPDR
   S&P 500…"), an alerts count badge, bell, star (watchlist toggle), search.
2. **Price bar** — large last price (`742.09`), change (`+x (x%)`), and an orange
   `MMM ±2.95` implied-move chip; a left `>` expander.
3. **Bid/Ask execution blocks** — dark-crimson **Sell** (bid price + Bid Size),
   dark-emerald **Buy** (ask price + Ask Size). The number color flips
   green/red with tick direction.
4. **Tab bar** — `Chart` · `Research` · `Options` · `Level II` (gold/blue active
   underline on Chart).
5. **Timeframe selector** — a `T` glyph + a dotted-underline label in the exact
   format `"{lookback}:{interval}"` (e.g. `15Days:1m`, `180Days:4h`, `5Yr:Day`,
   `15Yr:Week`, `MAX:Mon`). Tapping opens:
   - a **left tool rail**: candle/bar type, studies (flask), visibility (eye),
     crosshair, overlays (layers), draw (pencil);
   - a **scrolling interval menu**: `1 Min, 5 MIN, 15 MIN, 30 Min, 1 HR Line,
     1HR, 2 HR, 4hr, Daily, Weekly, Monthly`, then the **Extended** set:
     `Weekly/Daily/4HR/2HR/1HR/30 MINS/15Mins/5MIN/1 Min Extended`, then
     `Edit Styles` (gear).
6. **Price pane** — candlesticks, right-hand price axis, faint horizontal grid,
   a **draggable dashed price/alert line** with a `+` bug and the price tag, a
   crosshair with a **time bubble** on the x-axis and an **OHLCV tooltip**:
   `Open / High / Low / Close / Range / Volume`. `Hi:`/`Lo:` labels mark the
   window extremes. Volume histogram sits at the base of this pane.
7. **MACD pane** — green & purple lines + red/green histogram; legend row
   `Value / Avg / Diff / ZeroLine / UpSignal / DownSignal`.
8. **RSI pane** — magenta line with overbought/oversold band lines (70/30);
   legend `RSI / OverSold / OverBought / UpSignal`.
9. **Bottom nav** — `Overview · Watchlist · Trade · Positions · More`.

## Timeframe ladder (lookback auto-scales with interval)

| Interval | Regular label | Extended label |
| --- | --- | --- |
| 1 min | `15Days:1m` | `1 Min Extended` |
| 5 min | `15Days:5m` | `5MIN Extended` |
| 15 min | `30Days:15m` | `15Mins Extended` |
| 30 min | `30Days:30m` | `30 MINS Extended` |
| 1 hour | `180Days:1h` | `1HR Extended` |
| 2 hour | `180Days:2h` | `2HR Extended` |
| 4 hour | `180Days:4h` | `4HR Extended` |
| Daily | `5Yr:Day` | `Daily Extended` |
| Weekly | `15Yr:Week` | `Weekly Extended` |
| Monthly | `MAX:Mon` | — |

There's also a `1 HR Line` (line chart, not candles).

## Extended Trading Hours rendering

The **Extended** interval variants are the same interval with pre/post-market
included; they render with **dark vertical shaded bands** over the overnight/ETH
sessions so gaps and overnight moves are visible. Regular variants show RTH only
(no shading). This maps directly to our `includeExtendedHours` flag and the
RTH/ETH session logic already built in Phase 0.

## Palette confirmation (matches our Phase 0 tokens)

Obsidian canvas, crimson down / emerald up candles, magenta RSI, green+purple
MACD, gold/amber accents, Inter type. No changes needed to the design tokens.

## Phase A build status

Implementing the Chart screen against the `/api/candles` mock endpoint:
candles + volume + OHLCV crosshair tooltip + MACD + RSI + the timeframe ladder +
price/bid-ask header + tabs + bottom nav + ETH session shading. The other tabs
(Research / Options / Level II) and drawing tools are stubbed for later.
