# Correction 08 — API Input Hardening

**Type:** Correction (code changed)
**Priority:** Medium (robustness / bad-input safety)
**Status:** ✅ Applied to `route.ts` and `batch-route.ts`

## Problem
The route handlers trust their query params more than they should.

### `route.ts` (before)
```ts
const optionPremium = optionPremiumParam ? Number(optionPremiumParam) : undefined;
```
- A non-numeric `optionPremium` (e.g. `?optionPremium=abc`) becomes `NaN` and is
  passed straight into `scanTicker` — a silent bad value, not a clear error.
- A negative premium (`?optionPremium=-5`) is accepted.
- The `ticker` param is forwarded raw — no trimming, no uppercasing — so
  `?ticker= aapl ` behaves differently from `?ticker=AAPL`.

### `batch-route.ts` (before)
- Trims/filters the ticker list (good) but does **not** uppercase or de-duplicate,
  so `?tickers=aapl,AAPL` scans Apple twice.

## Fixes applied
- **`route.ts`:** normalize the ticker (trim + uppercase); validate
  `optionPremium` — reject `NaN` or `< 0` with a `400`.
- **`batch-route.ts`:** uppercase, trim, and de-duplicate the ticker list.

## Notes
These are defensive hardening changes only; they don't alter the scan logic.
They make bad input fail loudly and predictably instead of silently producing
`NaN`-tainted results.

## Action
- [x] Harden `route.ts` input handling.
- [x] De-duplicate / normalize `batch-route.ts` ticker list.
