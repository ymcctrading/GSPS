# GSPS — Documentation Review & Integration Log

**Reviewer:** Claude Code
**Started:** 2026-07-21
**Branch:** `claude/gsps-doc-review-spem8d`
**Status:** 🟡 Review complete — **awaiting owner decisions before implementation** (see §5 Objections & §7 Open Questions)

This log tracks the review of the four Google Docs provided, everything I intend
to "infuse" into the GSPS project, every suggestion/improvement I've identified,
and my current position in the process — so you can be kept abreast at any point.

---

## 1. Current State of the Repository (Ground Truth)

Before infusing anything, here is what actually exists in the repo today:

| Item | Reality |
| --- | --- |
| Tracked files | **Two** only: `route.ts`, `batch-route.ts` |
| App framework | **None** — no `package.json`, `tsconfig.json`, `next.config`, or `node_modules` |
| Frontend | **None** — no `.tsx`, no Tailwind, no components |
| `lib/scanTicker` | **Missing** — both route files `import { scanTicker } from "@/lib/scanTicker"`, but that module does not exist. The code as-is cannot compile or run. |
| Database | **None** |
| Screenshots (10–20 chart images referenced in docs) | **Not provided** |

**Implication:** The docs describe a full, multi-asset, live-trading brokerage
platform. The repo is a 2-file stub that does not build. "Infusing the docs
accordingly" is therefore a *green-field build*, not an edit of existing
features. This gap is the single most important thing to align on before I write
production code. (See Objection O-2.)

---

## 2. The Four Documents — What Each Is

The four docs are **not four independent specs**. Doc 4 is the master transcript;
Docs 1–3 are formalized excerpts generated from the same source notes (via a
Gemini session). Understanding this prevents me from treating contradictory
"formalizations" as four separate mandates.

| # | Title | Role | Key contents |
| --- | --- | --- | --- |
| 1 | *Technical Requirements Update & Business Model Architecture* | Formalized spec | Charting fixes (candles, OHLCV, micro-timeframes, live/tick), lookback windows, aesthetic direction, **2-tier** model (Standard / Premium), server-side cron scanner |
| 2 | *Principal Software Architect prompt* | Build prompt | **4-tier** model (Practice / Standard / Investor $99 / System Mastery $299), multi-asset automation matrix, broker-dealer roadmap, first tasks (DB schema, cron pseudocode, execution controller) |
| 3 | *Formal System Handover Documentation* | Frontend spec | Visual design system (colors, typography), a described mobile Tailwind frontend, 3 immediate tasks (default 9-asset scan, order-ticket interaction, HUD tab routing) |
| 4 | *GSPS Development Transcript & Architecture Log* | **Master source** | Raw owner notes + all formalizations + full source-code stubs (PostgreSQL DDL, Node cron `MeanReversionScanner`, `MultiAssetAutomationController`, `OptionsChainParser`, `RiskPositionSizer`, state machine, transaction ledger, `MarketDataIngestor`), Mark Cuban vs. Tony Robbins business plans, staged rollout plan |

---

## 3. Consolidated Requirements (De-duplicated across all 4 docs)

### 3.1 Charting Engine
- **Candle-count bug (NOK):** daily view plots 8 vs 9 candles inconsistently. Root cause per docs: pre/post-market (ETH) ticks leaking across the day boundary. Fix = aggregate strictly 9:30am–4:00pm ET into one daily candle; route ETH ticks to the ETH layer.
- **OHLCV data layer:** charts show only price + date on hover. Add a responsive hover tooltip **and** a static data banner showing Open/High/Low/Close/Volume.
- **Micro-timeframes:** add 1-minute and 5-minute toggles.
- **Live / Tick chart:** WebSocket-driven real-time view; user plots a range and executes when price fills it.
- **Lookback windows:** 1-min chart retains ≥5 days; monthly chart supports "All-Time" back to IPO/listing date.
- **ETH (extended hours):** fully coded in backend, **hidden by default**, user-toggleable. (Owner undecided whether it's a paid feature — see Q.)

### 3.2 Aesthetic / UX
- Do **not** clone TradingView or Robinhood. Target: Robinhood simplicity + thinkorswim depth. "Less is more" default; complexity progressively revealed.
- Design system (from Doc 3): obsidian/slate dark theme (`#0D0F12`, `#131722`); bearish crimson (`#2A1418`, `#EF4444`, `#FF6B7A`); bullish emerald (`#11241D`, `#10B981`, `#52E3A4`); gold/amber accent (`#F5A623`); **Inter** typeface. Mobile-first, progressive disclosure (portrait = minimal, landscape/desktop = dense).

### 3.3 Scanner (Mean Reversion — 15 setups)
- Runs **server-side automatically at market close** (cron), not manually. Results cached for the next pre-market session.
- **Waterfall filter (from Doc 4):**
  1. **Strat Sniper Gate** — every symbol must pass this structural trend check or is discarded.
  2. **Tier 1 (Pristine):** setups scoring 8/9 or 9/9 on the proprietary checklist.
  3. **Tier 2 (Velocity fallback):** if <15 pass Tier 1, admit 7/9 setups **only** if RVOL ≥ 2.0 or active ATR expansion.
  4. **Payload:** sort by score desc (RVOL tie-break), truncate to top 15 → `bullishReversions` / `bearishReversions` dashboard blocks.
- Replace the developer-facing dashboard string *"The daily market scan has not run yet – results appear here after the first cron run"* with a consumer-friendly loading state.
- **Default scan universe (Doc 3):** SPY, BTC + the Magnificent 7 (AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA) = 9 core assets. *(Note: differs from the current `batch-route.ts` watchlist — see Suggestion S-6.)*

### 3.4 Monetization / Tiers (finalized 4-tier, per Docs 2 & 4)
1. **Practice ($0):** paper/sandbox only, core OHLCV charts, manual scans, standard lookbacks. No live capital.
2. **Standard ($0 + per-trade fee):** live routing, full manual order suite (Market/Limit/Stop-Limit), real-time data, ETH toggle.
3. **Investor Mode ($99/mo or $990/yr + fee):** drawing tools (Trendlines, Bollinger, Fib), oscillators (MACD, RSI), tactical data layers (target entry, take-profit tiers), the 15 daily mean-reversion setups.
4. **System Mastery ($299/mo + fee):** autonomous portfolio manager — tick streams, webhook alerts, automated execution lifecycle (trailing stops, auto-routing, hard stop-losses).

### 3.5 Multi-Asset Automation (System Mastery)
- Equities & Options, Futures & Commodities, Forex (24/5), Crypto (24/7).
- User dials: Risk Profile (Passive/Moderate/Aggressive), Directional Bias (Bullish/Bearish), Volatility triggers ($ or %).
- Staged rollout (Doc 4): **Phase A** Equities + Crypto → **Phase B** Options + Forex → **Phase C** Futures + Commodities.

### 3.6 Business Roadmap
- Broker-agnostic via clean API abstraction now; architected to later become a self-clearing registered broker-dealer.
- Two strategic framings in Doc 4: "Cuban" (low-cost disruption → own the brokerage) and "Robbins" (premium value tiers/ecosystem). Doc 4's synthesis = do Robbins short-term SaaS, Cuban long-term pivot.

### 3.7 Frontend components already envisioned (Doc 3)
- iOS workspace header, asset selector dropdown, high-impact price bar, 4-column volatility metric matrix (IV Index / Implied Move / Open Int / Delta·Size), bilateral BID/ASK execution blocks, HUD bottom-tab nav (Charts Matrix / Options Chain / Order Ticket).
- Tasks: default 9-asset scan; tap BID/ASK → open pre-filled Order Ticket; HUD tab routing with `#F5A623` active-underline state.

---

## 4. What Can Be Built Safely & Immediately (my recommended Phase 0)

None of these touch real money or real brokerage routing; all are high-value and unblock everything else:

- **P0-a** Scaffold the actual project (Next.js + TypeScript + Tailwind) so the two existing routes compile.
- **P0-b** Implement the missing `lib/scanTicker` that both routes already import, returning the `decision.outputState` (`Execute`/`Watch`/`Reject`) shape the routes expect — backed by a **mock/paper data provider** with a clean interface to swap in a real market-data vendor later.
- **P0-c** Candle-aggregation module with correct RTH (9:30–16:00 ET) bucketing + separate ETH layer → fixes the 8-vs-9 candle bug at the source.
- **P0-d** OHLCV tooltip + data-banner spec/component.
- **P0-e** 4-tier feature-flag layer + PostgreSQL schema (from Doc 4's DDL) — pure config/data, no live trading.
- **P0-f** Server-side mean-reversion cron scanner (Strat Gate → Tier1 → Tier2 fallback → top 15) in **simulation mode**, plus the consumer-friendly dashboard loading state.
- **P0-g** Design-system tokens (colors/typography) as Tailwind theme config.

---

## 5. Objections / Concerns (RAISE BEFORE PROCEEDING)

> These are the reasons I have **paused before writing production code**, per your
> instruction to make objections known first.

- **O-1 — Regulatory & financial risk (highest priority).** The docs call for
  *automated execution of real capital* across stocks/options/futures/forex/crypto,
  webhook-triggered live routing, and eventually operating as a registered
  **broker-dealer**. Building software that auto-trades real money is a heavily
  regulated activity (SEC/FINRA, plus futures/forex/crypto regimes) with real
  liability. **I recommend building everything in paper/simulation mode with a
  clean brokerage-abstraction seam, and NOT wiring any real-money automated
  execution until you have (a) a chosen licensed brokerage/execution partner and
  (b) legal/compliance sign-off.** I will not silently wire live-money routing.

- **O-2 — The repo is a non-building 2-file stub.** Doc 3 describes a "current"
  Tailwind mobile frontend and the routes import a `lib/scanTicker` that doesn't
  exist. Either that frontend lives in another repo/branch I should be pointed to,
  or it needs to be built from scratch here. I need to know which before choosing
  a structure. (See Q-3.)

- **O-3 — Scope is multi-month, not one-pass.** The full vision (6 asset classes,
  live WebSocket infra, payments, automation engine, brokerage) cannot responsibly
  be delivered in a single change. I propose the staged Phase 0 → A → B → C plan
  above and want your agreement on sequencing before committing code.

- **O-4 — Mixed/aspirational tech stack in the docs.** Doc 4 ships both **Node/TypeScript**
  (cron scanner, automation controller, options parser, ingestor) *and* **Python**
  (`SystemMasteryController.py`, `RiskPositionSizer.py`, `MarketDataIngestor.py`)
  for overlapping responsibilities. The existing routes are Next.js/TS. I recommend
  **standardizing on TypeScript/Next.js** end-to-end (single language, single deploy)
  unless you specifically want a separate Python automation service. (See Q-4.)

- **O-5 — The doc code is illustrative, not production-ready.** The provided
  snippets use mocked feeds, `random`-walk prices, hard-coded multipliers, and no
  error handling/auth/tests. I'll treat them as reference architecture, not
  drop-in code.

- **O-6 — Real market data + payments need accounts/keys.** Real OHLCV/tick data
  (a vendor like Polygon/Alpaca/Databento), WebSocket feeds, and Stripe billing
  all require paid accounts and secrets. Until those exist I can only build against
  mock providers behind clean interfaces.

---

## 6. Suggestions / Improvements I've Identified (my value-add)

Things the docs don't specify that would make the app better, more efficient, or
more user-friendly. I'll implement the ✅-marked ones as part of Phase 0 unless you
object; the others need your input.

- **S-1 — Fix the candle bug at the data layer, not the chart layer.** Do RTH/ETH
  bucketing once in the aggregation pipeline so *every* consumer (chart, scanner,
  tooltip) is consistent. Prevents the class of bug, not just the NOK symptom. ✅
- **S-2 — Provider-abstraction seam from day one.** A `MarketDataProvider`
  interface (mock today, real vendor later) so we never rewrite consumers when the
  data source changes. Same pattern for `BrokerageProvider` (paper → live). ✅
- **S-3 — Central feature-flag/entitlements module** keyed off tier, so gating is
  declarative and testable rather than sprinkled through the UI. ✅
- **S-4 — Cache scanner results with a freshness timestamp + status enum**
  (`PENDING`/`RUNNING`/`FRESH`/`STALE`) so the dashboard can show the friendly
  loading state deterministically and know when to re-run. ✅
- **S-5 — Timezone correctness.** Anchor all session logic to `America/New_York`
  with DST awareness (not fixed UTC offsets) — this is the actual root of the
  8-vs-9 candle issue and will bite the scanner's "market close" cron too. ✅
- **S-6 — Reconcile the default watchlist.** `batch-route.ts` currently defaults to
  `SPY, AAPL, AMD, TSLA, MSFT, META, NVDA, AMZN, GOOGL, TTWO`, but Doc 3 specifies
  the default scan universe as SPY, BTC + Magnificent 7. Recommend aligning the
  default to the documented 9 and making watchlists user-configurable. ❓(confirm)
- **S-7 — Accessibility of the color system.** The green/red pairing needs a
  colorblind-safe option (e.g., add shape/label cues, not color alone, on P/L and
  candles). Cheap to add now, painful to retrofit. ✅
- **S-8 — "Kill switch" / global auto-trade disable** for System Mastery, plus
  per-asset max-position and daily-loss limits, surfaced prominently. Essential
  safety UX for any automation tier. ❓(recommend)
- **S-9 — Consistent naming.** Settle the project name (see Q-1) and use it
  everywhere to avoid the "GSPS means two different things" problem.
- **S-10 — Audit/event log** for every automated decision (why a trade did/didn't
  fire) — critical for user trust and for any future compliance requirement. ✅

---

## 7. Open Questions for the Owner (blocking)

- **Q-1 — Project name.** Docs 1/2/4 say GSPS = *Global Scanner & Charting Platform
  System*; Doc 3 says *Gann Strategy & Protocol System*. Which is authoritative?
- **Q-2 — Tier model.** Confirm the **4-tier** model (Practice / Standard / Investor
  $99 / System Mastery $299) is final — Doc 1's older 2-tier framing should be
  retired. Is ETH a paid feature or a free toggle?
- **Q-3 — Existing frontend.** Does the Tailwind mobile frontend that Doc 3
  describes as "already built" exist somewhere (another repo/branch)? Or do I build
  it here from scratch?
- **Q-4 — Tech stack.** Standardize on TypeScript/Next.js end-to-end (my
  recommendation), or keep a separate Python automation service as the doc code
  implies?
- **Q-5 — How far do you want me to go now?** Options: (A) this review + log only;
  (B) also scaffold the buildable Phase 0 (paper/sim, no live money); (C) build a
  specific subset first (e.g., just the charting fixes, or just the scanner).
- **Q-6 — The 10–20 chart screenshots** referenced for UI/lookback expectations
  were not uploaded. Your own notes asked me to request them if missing — **please
  upload them** so the charting UI matches your intent.
- **Q-7 — Live execution / brokerage.** Confirm you want live-money automated
  execution **deferred** behind a paper-trading seam until a licensed partner +
  compliance sign-off exist (see O-1).

---

## 8. Process Status / Changelog

| Date | Milestone | Status |
| --- | --- | --- |
| 2026-07-21 | Received 4 doc links (4th arrived mid-session) | ✅ |
| 2026-07-21 | Read all 4 docs (Doc 4 is master transcript) | ✅ |
| 2026-07-21 | Audited repo ground truth (2-file non-building stub) | ✅ |
| 2026-07-21 | Wrote this review log + de-duplicated requirements | ✅ |
| 2026-07-21 | Raised objections & open questions to owner | ⏳ awaiting answers |
| — | Phase 0 scaffold (pending owner go-ahead) | ⬜ not started |
| — | Phase A / B / C build-out | ⬜ not started |

**I have deliberately NOT written any production/application code yet**, per your
instruction to surface objections and questions first. Once you answer §7 (at
minimum Q-4 and Q-5), I'll proceed with the agreed scope and keep updating §6 and
§8 of this log as I go.
