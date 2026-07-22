# Correction 03 — Default Asset List

**Type:** Correction (code changed) + Decision to confirm
**Priority:** HIGH (wrong assets scanned by default)
**Status:** ✅ Applied to `batch-route.ts`

## Problem
The code's default watchlist does not match the newest spec.

- **Code (`batch-route.ts`, before):**
  `SPY, AAPL, AMD, TSLA, MSFT, META, NVDA, AMZN, GOOGL, TTWO`
  → 10 assets, includes **AMD** and **TTWO**, and **has no BTC**.
- **Spec (*Updates for code 7-21-26*):** the canonical default scan is **9 assets**:
  `SPY` (broad-market anchor), `BTC` (crypto macro indicator), and the
  **Magnificent 7**: `AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA`.

The code predates the spec — it's missing BTC and carries two assets (AMD, TTWO)
that aren't part of the canonical list.

## Fix applied
`batch-route.ts` `DEFAULT_WATCHLIST` now reads:

```ts
const DEFAULT_WATCHLIST = [
  "SPY",  // broad-market anchor
  "BTC",  // crypto macro indicator
  // Magnificent 7
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
];
```

## Open question
- **BTC symbol format:** the engine must accept `BTC` and know it's crypto (24/7
  data, different symbol conventions like `BTC-USD` / `BTC/USD`). See Insight 09.
- Were **AMD** and **TTWO** intentionally dropped, or do you want them kept as an
  extended list? (They're easy to re-add if you want an 11- or 12-asset default.)

## Action
- [x] Correct `DEFAULT_WATCHLIST` to the canonical 9.
- [ ] Confirm AMD/TTWO removal is intended.
- [ ] Confirm the BTC symbol string the engine expects.
