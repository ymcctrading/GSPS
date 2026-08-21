# GSPS Brand & Naming Guide

This is the canonical reference for how GSPS is named and described anywhere a
user, prospect, or public script/document can see it. It exists so that
naming decisions don't have to be re-derived from scratch in every PR, and so
`scripts/check-banned-terms.mjs` has a human-readable counterpart to point to
when it fails a build.

## Name

- **Full name:** GSPS — Guided Stock Projection System
- **Short name:** GSPS
- **Description:** GSPS is a guided trade-planning system that helps traders
  turn market movement into clear, risk-defined trade scenarios.

When GSPS grows beyond the core scanner into multiple connected tools
(scanner, workbooks, TradingView indicators, alerts, dashboard, education,
API), the expansion becomes **GSPS = Guided Stock Projection Suite**. The
acronym never changes; only "System" becomes "Suite". Until that expansion
actually ships, use "System".

## What must never be public

The product's internal methodology — its origin in W.D. Gann-style
market geometry — is proprietary and must not be named, described, or
implied anywhere a customer, script viewer, or public document can read it:

- Gann Sniper Protocol Scanner / System, Gann Protocol, Gann-based scanner,
  Gann calculation engine
- Decimal stripping, modulo-9 reduction, harmonic roots, 3/6/9 nodes, or any
  other description of the internal calculation method

These terms may remain in private/internal source (server-side lib code,
code comments, tests, migrations, and `lib/confluence-scanner`, the
standalone internal research module) but must never appear in public-facing
UI, public documentation, user-facing alerts, marketing copy, exported
reports, TradingView script titles/descriptions, or workbook tabs.
`scripts/check-banned-terms.mjs` enforces the user-facing half of this at
build time; it does not scan private/internal directories by design.

## Customer positioning

**Audience:** novice and developing retail traders, and anyone who wants
structure and risk-defined scenarios before entering a position.

**GSPS must feel:** clear, calm, helpful, structured, educational,
risk-aware, beginner-friendly, professional without being overly technical.

**GSPS must not feel:** aggressive, overly complex, secretive, academic, like
a get-rich-quick product, like a signal-selling service, or like it
guarantees profitability or accuracy.

**Core promise:** GSPS helps traders see the setup, plan the trade, and
manage risk before entering a position.

**Approved taglines:**
- See the setup. Plan the trade. Manage the risk.
- Turn market movement into a clear trade plan.
- Know the setup before you take the trade.
- Clear scenarios. Defined risk. Better trade planning.
- Plan the trade before the market moves.
- A clearer way to prepare for the next move.

**Never claim:** guaranteed profits, high-win-rate signals, perfect entries,
sniper entries, "never miss a trade", predicting or beating the market,
risk-free trading, guaranteed targets, easy money, or instant profits.

## Approved user-facing labels

See `lib/constants/gspsTerminology.ts` for the machine-readable version of
this table — import from there rather than hardcoding these strings.

| Avoid | Use instead |
|---|---|
| Gann Root | Setup Signal |
| Harmonic Vector | Price Path |
| Harmonic Node | Key Price Level |
| Material Number | Major Price Level |
| Invalidation Vector | Risk Level |
| Master Target | Final Target |
| Minor Node | First Target |
| Decimal-Strip Modulo-9 Reduction | GSPS Signal Calculation |
| Bullish Momentum | Upward Setup |
| Bearish Mean Reversion | Downward Setup |
| Reversal Vector | Pivot Scenario |
| Coordinate Execution Matrix | GSPS Trade Map |

General terms to avoid in UI copy even outside that table: Harmonic,
Geometric, Modulo, Algorithmic, Sniper, Root, Node, Vector, Fractal, and
other esoteric technical terminology. Prefer plain language: Market Outlook,
Trade Map, Entry Zone, First Target, Final Target, Risk Level, Pivot Plan,
Setup Strength, Trend Check, Watchlist, Opportunity List, Daily Plan, Price
Path, Key Level, Confirmation.

## Module naming

| Internal purpose | Approved customer-facing name |
|---|---|
| Market scanning | GSPS Scanner or GSPS Setup Finder |
| Setup ranking | GSPS Opportunity List |
| Entry calculations | GSPS Entry Zone |
| Profit-target calculations | GSPS Target Zone |
| Stop-loss calculations | GSPS Risk Level |
| Trade-plan summary | GSPS Trade Map |
| Bullish/bearish bias | GSPS Market Outlook |
| Opposite-direction contingency | GSPS Pivot Plan |
| Multi-timeframe confirmation | GSPS Trend Check |
| Alerts | GSPS Alerts |
| Daily report | GSPS Daily Market Plan |
| Excel decision matrix | GSPS Trade Planning Workbook |
| Performance journal | GSPS Trade Journal |
| Advanced/internal engine | GSPS Core Engine |

## Public identifiers

In public repositories, script metadata, visible comments, documentation,
user-facing config, filenames, UI keys, and API responses, use only GSPS
naming — no internal-methodology terms, even as abbreviations.

Approved: `gspsTradeMap`, `gspsMarketOutlook`, `gspsEntryZone`,
`gspsFirstTarget`, `gspsFinalTarget`, `gspsRiskLevel`, `gspsPivotPlan`,
`gspsSetupStrength`, `gspsTrendCheck`, `gspsSignalScore`, `gspsPricePath`.

Prohibited: `gannRoot`, `gannVector`, `harmonicNode`, `modulo9`,
`decimalStrip`, `sniperSignal`, `protocolEngine`, `materialNumber`,
`executionMatrix`.

Private/internal code (server-only, not client-bundled, not a public API
response shape) is exempt — keep the internal method behind a clear
module boundary and expose only neutral GSPS-named fields to the UI and
public APIs.

## Standard trade-plan format

```text
GSPS Trade Map — [Ticker]

Market Outlook: [Upward / Downward / Neutral]
Setup Status: [Watch / Ready / Active / Invalidated]

Entry Zone: $[price or range]
First Target: $[price]
Final Target: $[price]
Risk Level: $[price]

If Price Moves Higher:
[Brief action-based scenario]

If Price Moves Lower:
[Brief pivot or invalidation scenario]

Risk Reminder:
Only take trades that fit your personal risk limits. GSPS provides planning
tools and market-analysis support; it does not guarantee results.
```

Use action-oriented, non-commanding language ("wait for confirmation",
"consider taking partial profits near the First Target") rather than
imperatives ("buy now", "this cannot fail", "you must enter here").

## Required disclosures

Every customer-facing report, export, and educational surface should make
clear, in substance:

- GSPS is a planning and educational tool.
- GSPS does not guarantee profitable trades.
- Projected price levels are scenarios, not certainties.
- Users are responsible for their own decisions and should use position
  sizing and risk management, and verify market conditions independently.
- A Risk Level does not eliminate losses — gaps, liquidity, and execution
  conditions can affect results.

The standard disclaimer string:

> GSPS provides market-analysis and trade-planning tools for educational and
> informational purposes only. It is not financial advice, investment
> advice, or a recommendation to buy or sell any security. Trading involves
> risk, including possible loss of principal. Past performance and projected
> levels do not guarantee future results.

## Status labels

**Use:** Watch, Building, Ready for Confirmation, Active, Target Reached,
Risk Level Reached, Reassess, No Clear Setup.

**Avoid:** Fire, Guaranteed Winner, Moon, Explosive, Sniper Shot, Kill Zone,
Can't Miss, Easy Trade.

## Enforcement

`scripts/check-banned-terms.mjs` (`npm run check:terms`) statically bans
Tier A product names everywhere in source and public docs, and Tier B
user-facing vocabulary in rendered copy (source/comments/imports exempted
where noted in that file). `lib/__tests__/user-copy.test.ts` asserts the
same at runtime for strings that are generated rather than literal. This
guide is the rationale and the full table; the script and test are the
gate.
