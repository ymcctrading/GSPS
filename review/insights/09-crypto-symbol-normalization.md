# Insight 09 — Crypto Symbol Handling (BTC)

**Type:** Insight / Risk
**Priority:** Medium (surfaces the moment BTC enters the default list)

## Problem
Correction 03 adds **BTC** to the default watchlist. But the batch route runs
every symbol through the *same* `scanTicker(ticker)` path used for equities:
```ts
Promise.all(tickers.map((ticker) => scanTicker(ticker)));
```
Crypto is not equities:
- **Symbol format** differs by data provider — `BTC` vs `BTC-USD` vs `BTC/USD` vs
  `BTCUSD`. A bare `"BTC"` may not resolve against a stock data feed at all.
- **Trading hours:** crypto is **24/7**; equities are 9:30–4:00 EST. The daily
  candle-aggregation fix in *7-21-26 for Claude* §1.1 (group regular market hours
  into one candle) **does not apply to crypto** and will produce wrong candles if
  applied blindly.
- **No options chain** in the same sense — the `optionPremium` path is
  meaningless for spot BTC.

## Recommendation
The engine needs an **asset-class dispatch** before scanning:
```
resolve assetClass(symbol) -> STOCK | CRYPTO | FUTURE | FOREX | ...
  -> pick the right data source, symbol format, session rules, and candle logic
```
This aligns with First Task #3 (multi-asset execution controller) and the
*Convo w/Gemini* `MultiAssetAutomationController`, which already branches on
`assetClass`. Do the same on the **scanning** side, not just execution.

## Action
- [ ] Add an asset-class resolver in front of `scanTicker`.
- [ ] Confirm the exact BTC symbol string the chosen data provider expects.
- [ ] Ensure the daily-candle session rule is skipped for 24/7 assets.
