# Market Universe, Data Quality & Account Constraints

Source: "Market Universe, Data Quality & Account Constraints" implementation
spec, prepared for Claude Code, August 28, 2026 — draft implementation
directives; **requires securities/compliance counsel review before use in
live personalized recommendations or execution.**

This is a new, standalone pure-logic engine (`lib/universe/`), landed the
same way the Signal and Regime Engine (`docs/SIGNAL_REGIME_ENGINE.md`) and
the Novice Risk, Account & Cooldown Engine (`lib/risk/`) were: implemented
directly against the spec pack, out-of-phase relative to `ROADMAP.md`'s Q1
focus, and **not wired into the live scan pipeline in this change** — see
"What's not wired" below for exactly why and what wiring it in would take.

## What this is

The spec's own formulas, verbatim:

```
novice_eligible = market_cap_pass AND liquidity_pass AND price_or_fractional_pass
                   AND spread_pass AND event_risk_pass AND volatility_pass
                   AND data_quality_pass

trade_qualified = novice_eligible AND regime_pass AND confirmation_pass
                   AND target_path_pass AND account_risk_pass
```

`lib/universe/eligibility.ts`'s `assessNoviceEligibility` and
`assessTradeQualification` are exactly these two ANDs — nothing more. Every
component filter lives in its own file and is independently testable
(`lib/__tests__/universe-eligibility.test.ts`):

| Filter | Module | Rule |
|---|---|---|
| `market_cap_pass` | `marketCap.ts` | Absolute floor $10B; unknown cap fails closed. |
| `liquidity_pass` | `liquidity.ts` | $250M average daily dollar volume (Novice tier — see below). |
| `price_or_fractional_pass` | `priceAccessibility.ts` | $10–$125, or confirmed fractional support. |
| `spread_pass` | `spread.ts` | Max spread as % of price and as a fraction of stop distance. |
| `event_risk_pass` | `eventRisk.ts` | No binary event in the hold window; unknown blocks. |
| `volatility_pass` | `volatility.ts` | ATR% band, engineering-chosen (spec names the filter, not the band). |
| `data_quality_pass` | `dataQuality.ts` | Quote/corporate-action/earnings/fundamentals freshness and consistency. |

`prohibited.ts` is a zeroth gate ahead of the seven above — a
leveraged/inverse ETF short-circuits the rest, per "No penny, thin,
promotional, leveraged/inverse ETF, low-float, or binary biotech defaults."

`trade_qualified`'s four downstream gates (`regime_pass`, `confirmation_pass`,
`target_path_pass`, `account_risk_pass`) are **not recomputed here** —
`assessTradeQualification` takes them as already-evaluated booleans from the
engines that already own them: the Signal and Regime Engine
(`lib/signals/regime.ts` and its state modules) and `lib/risk`. This module's
only job is the final AND, so it cannot drift into a second copy of logic
those engines already maintain.

## Small-account mechanics (`lib/universe/smallAccount.ts`)

Everything in the spec's "Small-account mechanics" section, as pure
functions a caller applies to an already-sized plan — this module never
loosens a filter to make a small account's share count look larger, per the
spec's own instruction:

- `exitMechanics(qty, fractionalSupported)` — whether the staged TP1/TP2/
  runner exit is feasible, or the all-in/all-out fallback applies (below 4
  whole-share-equivalent units without confirmed fractional support).
- `assessAccountFeasibility(...)` — settled funds, buying power, cash-vs-
  margin, T+1 reliance, broker restrictions, and allocation-vs-risk as five
  independent gates. Allocation is checked separately from risk on purpose:
  "Flag account plans whose position allocation is too large even if planned
  stop risk is within budget."
- `accountDataProvenanceLabel` / `riskAutomationAllowed` — the
  broker-verified/manual/delayed/unavailable vocabulary the spec requires be
  recorded, and the rule that risk automation is disabled on anything but a
  verified read. Mirrors the narrower verified/estimate distinction
  `lib/risk/account.ts`'s `ESTIMATE_LABEL` already makes for net liquidation
  value, generalized to the four-way provenance this spec asks for.

## Data contracts and freshness

`dataQuality.ts` implements the spec's table for the four data elements a
symbol-only universe read can judge without an account in scope (quotes/
OHLCV, corporate actions, earnings/events, fundamentals/market cap). The
other two rows — account/holdings and broker execution — are account-scoped
and live in `smallAccount.ts` / `lib/risk` instead, the same split
`lib/signals/types.ts`'s `SignalGates` already makes between market-only and
account-only gates.

## Market expansion policy

**No code changes accompany this section — it is a policy statement,
recorded here so it is checked against before any future work, not a task
list.** Per the spec: *"Do not export stock thresholds into other markets.
Each asset class requires a separate execution/risk/data engine and
independent validation."*

None of the thresholds in `lib/universe/config.ts` (market cap, ADDV, price
band, spread, ATR%) apply to anything but US equities. This codebase already
has partial infrastructure for options (Greeks in the simulator), forex, and
futures (`lib/sectors.ts` watchlists) and full support for crypto — none of
that infrastructure is novice-universe-gated by this engine, and none of it
should be extended to be, without the asset-class-specific capabilities the
spec's table requires first:

| Market | Required before release | Present in this codebase today |
|---|---|---|
| Options | Underlying-first qualification, strike/expiry, Greeks, IV, bid/ask, open interest, theta, assignment/exercise, spread rules | Greeks computed in the paper simulator only; no underlying-first qualification or assignment/exercise handling. |
| Futures | Contract roll, point/tick value, margin, sessions, expiry, exchange hours, overnight rules | Watchlist symbols only (`lib/sectors.ts`); no contract mechanics. |
| Forex | Pair quote conversion, pip value, lot sizing, rollover, sessions, macro-event rules | Watchlist symbols only; no pip/lot/rollover logic. |
| Crypto | Venue/custody, 24/7 data, funding, leverage/liquidation, exchange fragmentation, counterparty controls | Furthest along — real data, scanning, and Guided-adjacent liquidity handling exist (see `ROADMAP.md`'s crypto notification fix), but funding/leverage/liquidation and venue fragmentation are unhandled. |
| Commodities | Contract specs, delivery/roll, report/event calendars, limit-move/seasonality controls | `COMING_SOON` in `lib/sectors.ts` — not built. |

## What's not wired

- **`lib/signals/scanGates.ts`'s `eligibleUniverse` and `liquiditySpreadPass`
  fields still read only the platform-wide liquidity floor** (`liquidityOk`
  from `lib/scan/liquidity.ts`), not this engine's stricter novice_eligible
  pipeline. Wiring `assessNoviceEligibility` in there needs a market-cap
  read and a fundamentals as-of date at scan time, neither of which
  `scanTicker` fetches today (`lib/data/company.ts`'s `CompanySnapshot` is a
  separate, on-demand fetch for the Company tab, real only when
  `FINNHUB_API_KEY` is set — folding it into the scan hot path is a data-
  pipeline change, not a logic change, and deliberately left for a dedicated
  follow-up rather than risking the existing scan budget here).
- **No real bid/ask spread feed exists.** `spread.ts` accepts one when a
  caller has it and otherwise falls back to the liquidity read, the same
  documented proxy `scanGates.ts` already uses for `liquiditySpreadPass`.
  Once a real feed exists, drop the fallback branch rather than layering a
  third proxy on top of it.
- **`prohibited.ts`'s leveraged/inverse ETF list is a starter, curated list**,
  not an exhaustive registry — the same honesty
  `lib/scan/large-cap-universe.ts` gives its own coverage gaps. Promotional,
  low-float, and binary-biotech status have no data source in this codebase
  at all and are not filtered by symbol; a biotech's binary-catalyst dates
  are still caught by `event_risk_pass` when known, which is a real but
  partial substitute for filtering the whole category.
- **Guided Decision Mode (`lib/guided/eligibility.ts`) is untouched.** Its
  own gates (Execute-only, borrow, priced plan, liquidity floor, live data)
  are a different, narrower question — "may this become a one-tap Buy
  button" — from "does this symbol belong in a novice's universe at all".
  The two should compose (a Guided recommendation ought to also be
  `novice_eligible`), but wiring that in changes what Guided shows today and
  is left for a follow-up that can be measured against the Backtest tool
  first, per this codebase's own precedent for changes that touch what
  Guided recommends.
