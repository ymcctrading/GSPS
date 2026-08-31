# Market Universe, Data Quality & Account Constraints

Source: "Market Universe, Data Quality & Account Constraints" implementation
spec, prepared for Claude Code, August 28, 2026 — draft implementation
directives; **requires securities/compliance counsel review before use in
live personalized recommendations or execution.**

This is a new, standalone pure-logic engine (`lib/universe/`), landed the
same way the Signal and Regime Engine (`docs/SIGNAL_REGIME_ENGINE.md`) and
the Novice Risk, Account & Cooldown Engine (`lib/risk/`) were: implemented
directly against the spec pack, out-of-phase relative to `ROADMAP.md`'s Q1
focus.

**It is wired into the live scan pipeline.** Every `lib/scanTicker.ts` call
now computes `novice_eligible` (`lib/universe/scanGates.ts`'s
`buildScanNoviceEligibility`, from real, already-in-hand scan data — no
extra provider fetch) and attaches it to `ScanResult.noviceUniverse`. It is
**informational, not gating**: by explicit decision, it does not change
`eligibleUniverse`/`liquiditySpreadPass` on `SignalGates`, so it does not
change which symbols the Signal and Regime Engine or the existing Gann/STRAT
verdict already treat as tradeable — see "Why informational, not gating"
below for the reasoning and the data-coverage gap behind it.

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

## How the live wiring reads real data without a new fetch

`lib/universe/scanGates.ts`'s `buildScanNoviceEligibility` is the adapter —
same role `lib/signals/scanGates.ts` plays for `SignalGates` — built
entirely from what `scanTicker` already has in hand per scan, with no new
provider request:

| `novice_eligible` component | Live source | Honesty note |
|---|---|---|
| `market_cap_pass` | `marketCapPassFromLargeCapCoverage`: membership in `lib/scan/large-cap-universe.ts`'s committed list | Real, sourced signal (a $10B-$200B cap screen), not a fabricated number. Non-membership fails closed — the list's coverage stops at rank 500 of 893, so absence isn't evidence of being under the floor, only of being unverifiable today. |
| `liquidity_pass` | `liquidity.avgDollarVolume`, already read off daily bars for the platform-wide floor | Real. |
| `price_or_fractional_pass` | `currentPrice`; `fractionalConfirmed` always `null` (unknown, not assumed false) | No broker in scope for a symbol-only scan. |
| `spread_pass` | Falls back to the liquidity-proxy branch (see below) | No bid/ask feed exists at scan time — see next section. |
| `event_risk_pass` | The same `isBinaryEventInHoldPeriod` tri-state `SignalGates.binaryEventInHoldPeriod` already uses | Real (if narrow) — see `lib/macro/earnings.ts`'s own disclosure: generated from reporting cadence for ~40 mega-caps, `null`/unknown (blocks) for everyone else. |
| `volatility_pass` | ATR(14) off the same daily bars the regime classifier reads | Real. |
| `data_quality_pass` | Quote timestamp/session/latency from the scan itself; corporate actions `null` (absence isn't a failure); earnings from `lib/macro/earnings.ts`'s new `nextKnownEarningsEvent`; fundamentals as-of date is `LARGE_CAP_SOURCE_CAPTURED` when the large-cap list covers the symbol | The earnings and fundamentals sub-checks inherit the same ~40-mega-cap / rank-500 coverage limits as the two rows above — a real gap, not simulated data standing in for it. |

The net effect: `novice_eligible` is real and meaningful, but today it can
only ever be `true` for the intersection of "in the $10B-$200B large-cap
list" and "in the ~40-symbol earnings calendar" — a few dozen names, not the
hundreds the scanner otherwise covers. That gap is exactly the reason for
the next section.

## Why informational, not gating

Folding `assessNoviceEligibility`'s result into `SignalGates.eligibleUniverse`
would have been a two-line change, and was considered and explicitly turned
down (direct request, 2026-08-29). `evaluateDisqualifiers` treats
`!gates.eligibleUniverse` as a hard block on Trend Pullback/Breakout/
Confirmed Reversal, so wiring it in would have narrowed which symbols can
ever get a tradeable verdict from those three states down to the same few
dozen names the coverage table above describes — a large, silent behavior
change to the live scanner and Guided Mode's candidate pool, not something
that belongs in a "wire the new engine in" change without being called out
and decided on its own. `ScanResult.noviceUniverse` is real and live either
way; only its authority over the existing verdict was held back. Revisit
once a real market-cap/earnings feed closes the coverage gap above — at that
point the gating change is a data question, not a product-risk one.

## Guided Decision Mode composition

`lib/guided/eligibility.ts`'s `assessEligibility` — the gate between "the
scanner found something" and "a novice is shown a one-tap Buy button with the
score hidden" — now also requires `result.noviceUniverse?.eligible`
(2026-08-30, direct request). A symbol failing any `novice_eligible` filter
is refused the same way a Watch-tier verdict or an unconfirmed short is:
added to `reasons`, never silently dropped. `ScanResult` built outside
`scanTicker` (`noviceUniverse` absent) fails closed rather than being treated
as passing, matching every other "unknown" case in this engine.

This is a deliberately different call from "Why informational, not gating"
above, not a reversal of it. That section held back gating
`SignalGates.eligibleUniverse` because doing so would have silently narrowed
which symbols the *whole scanner* — every user, every verdict, Watch and
Execute alike — can ever call tradeable, before anyone had decided that
tradeoff on purpose. Guided Mode is a different surface: it already narrows
hard on its own (Execute-only, a priced plan, a liquidity floor, a confirmed
borrow), it already accepts "often nothing to show" as a correct answer on a
quiet day (see `lib/guided/near-miss.ts`), and gating it on `novice_eligible`
is not a side effect of some other change — it is the literal thing "a
novice's eligible universe" was specified for. The same coverage gap applies
here as everywhere else in this engine (`market_cap_pass` via the large-cap
list's top-500-of-893 rank, `data_quality_pass` via the ~40-mega-cap earnings
calendar), so Guided may now recommend nothing on days it previously would
have — that tradeoff was made explicitly, by direct request, rather than
discovered after the fact.

## What's still not wired

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
- **Guided Decision Mode is wired** — see "Guided Decision Mode composition"
  below. Not in this list anymore; kept as a marker of what "wired" means
  for the rest of this section (a real gate on a real surface, not a field
  that merely exists).
