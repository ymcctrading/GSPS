# GSPS — Google Docs Review & Gap Analysis

**Reviewer:** Claude Code
**Date:** 2026-07-21
**Branch:** `claude/google-docs-review-a7x064`
**Scope:** Reconcile the GSPS specification documents in Google Drive against
each other and against the code currently in this repository
(`route.ts`, `batch-route.ts`).

---

## 1. Executive summary

The GSPS concept is coherent and ambitious, but the written specs are spread
across ~7 documents that were authored at different times and **contradict each
other on load-bearing details** — the product name, the pricing tiers, and the
default asset list all differ document-to-document. Before more code is written,
these need to be reconciled into a single source of truth, because the current
code already disagrees with the newest docs.

The code in this repo is only a thin API surface (two Next.js route handlers).
The engine they depend on — `@/lib/scanTicker` — **is not present in the
repository**, so the scoring, decision, and Gann/Sniper logic described in the
docs cannot be verified here.

**Top items needing a decision from you are collected in §5.**

---

## 2. Documents reviewed

| Doc | Owner | Purpose | Notes |
|-----|-------|---------|-------|
| **Ideally (GSPS)** | icharles.coleman | Original product vision (voice-note style) | Score out of 9; TP 2:1, master 3:1; SL 12–18% |
| **GSPS v1.5.1.docx** | ymcctrading | Gann-Sniper protocol / scanner spec | The most complete *trading-logic* spec |
| **7-21-26 prompt Claude code** | icharles.coleman | Architect prompt | Defines **4-tier** pricing + first tasks |
| **7-21-26 for Claude code** | icharles.coleman | Technical requirements | Charting bugs, OHLCV, lookbacks; **2-tier** pricing |
| **Updates for code 7-21-26** | icharles.coleman | Frontend chassis handover + TODO | **9-asset** default scan list |
| **GSPS pricing options ideas** | icharles.coleman | Two monetization strategies | Cuban (free + cost-plus data) vs Robbins (tiered) |
| **Convo w/Gemini 7.21.26** | icharles.coleman | Architecture log | Scan waterfall + scoring gates; sample Python |

---

## 3. Cross-document contradictions

These are the conflicts that will cause churn if not resolved first.

### 3.1 What does "GSPS" stand for?
Three different expansions are in active use:
- **"Global Scanner & Charting Platform System"** — *7-21-26 prompt*, *7-21-26 for Claude*
- **"Gann Strategy & Protocol System"** — *Updates for code 7-21-26*
- **"Gann-Sniper Protocol/Scanner"** — *v1.5.1*

➡️ *Pick one canonical name.* This affects marketing copy, package names, and
UI headers.

### 3.2 Pricing / tier structure — three incompatible models
- **4-tier** (*7-21-26 prompt*): Practice $0 · Standard $0 + per-trade fee ·
  Investor $99/mo ($990/yr) · System Mastery $299/mo.
- **2-tier** (*7-21-26 for Claude*): Standard (free "less is more") · Premium
  ("Investor Mode").
- **Two alternate strategies** (*pricing options ideas*): Cuban plan (give
  software away free, charge *raw data cost + 15%*, later pivot to broker-dealer)
  vs. Robbins plan (Standard free/low · Investor $99 · System Mastery $299).

➡️ These are not just different numbers — the **Cuban "cost-plus data" model is
architecturally different** from the SaaS-tier model (it changes billing,
data-metering, and what gets gated). This must be settled before the feature-flag
schema (First Task #1) is designed.

### 3.3 Default scan universe — code vs. spec mismatch
- **Current code** (`batch-route.ts` `DEFAULT_WATCHLIST`): `SPY, AAPL, AMD,
  TSLA, MSFT, META, NVDA, AMZN, GOOGL, TTWO` — **10 assets, includes AMD & TTWO,
  no BTC.**
- **Newest doc** (*Updates for code 7-21-26*): **9 assets** = `SPY, BTC` + the
  Magnificent 7 (`AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA`).

➡️ The code predates the spec: it's missing **BTC** and carries **AMD** and
**TTWO**, which are not in the canonical 9. See §4.1 for the concrete fix.

### 3.4 Scoring / scan-tiering not reflected in code
The *Gemini convo* defines a precise waterfall:
1. **Strat Sniper Gate** — every symbol must pass or is discarded.
2. **Tier 1 (Pristine):** setups scoring **8/9 or 9/9**.
3. **Tier 2 (Velocity fallback):** exactly **7/9**, *only if* RVOL ≥ 2.0 or
   active ATR expansion, and *only if* fewer than 15 assets cleared Tier 1.
4. **Payload:** sort by score desc (RVOL tiebreak), **truncate to top 15** into
   `bullishReversions` / `bearishReversions`.

The current `batch-route.ts` does none of this. It filters raw results into
`execute / watch / reject` by `decision.outputState` with **no score gate, no
RVOL tiebreak, and no top-15 truncation.** (The scoring itself presumably lives
in the missing `scanTicker` lib — see §4.3.)

### 3.5 Stop-loss sizing — conflicting rules
- *Ideally*: "keep stop losses between **12 and 18%** of the price paid."
- *v1.5.1*: stock stop = opposite side of trigger candle **or fixed 2.0%**
  (SSS50%), or **1.5%–5.0%** for Gann breakout variants; options stop = convert
  underlying stop into an equivalent premium-decay threshold.

➡️ The 12–18% figure most likely refers to **option-premium** risk, while the
2%/1.5–5% figures refer to **underlying** risk. The docs never state this
explicitly. Confirm the mapping so the risk engine doesn't apply an equity-stop
percentage to a premium (or vice-versa). TP targets are consistent across docs
(**TP1 2:1, master 3:1**).

---

## 4. Code vs. spec gap analysis

### 4.1 `batch-route.ts`
- **Default watchlist is stale** (§3.3). To match the canonical 9-asset spec:
  ```ts
  const DEFAULT_WATCHLIST = [
    "SPY", "BTC",                                   // anchors
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", // Magnificent 7
  ];
  ```
- **No score-based selection / top-15 truncation** (§3.4). The output shape
  (`execute / watch / reject`) does not match the doc's
  `bullishReversions / bearishReversions` dashboard blocks.
- **BTC is a crypto symbol** — running it through the same `scanTicker` path as
  equities assumes the engine already handles 24/7 crypto data and symbol
  formatting (e.g. `BTC` vs `BTC/USD` vs `BTC-USD`). Unverifiable here because
  `scanTicker` is missing.
- **No caching / cron entanglement.** *7-21-26 for Claude* §4 requires the 15
  setups to be computed **server-side at market close and cached**, not computed
  on-request. This route computes live on every GET, which contradicts the
  "cron-populated dashboard" design.

### 4.2 `route.ts`
- Clean and correct for what it does: `GET /api/scan?ticker=&optionPremium=`.
- `optionPremium` is parsed with `Number(...)` but **not validated** — a
  non-numeric value yields `NaN` and is passed straight into `scanTicker`.
  Consider rejecting `NaN`/negative premiums with a 400, consistent with the
  existing missing-ticker guard.
- No ticker normalization (case, whitespace) — `batch-route.ts` trims/filters
  its list but `route.ts` forwards the raw param.

### 4.3 Missing core engine — `@/lib/scanTicker`
Both routes import `scanTicker` from `@/lib/scanTicker`, but **that file is not
in this repository.** The review therefore cannot verify any of the substantive
protocol logic:
- the 9-point score,
- the Strat Sniper Gate,
- Gann structural layer (X_Base, X_Cusp, modulo-9 harmonic reduction, angles),
- Sara Sniper trigger/candle-state logic (inside/directional/outside bars),
- TP1/master/stop computation,
- the `decision.outputState` field the batch route depends on.

The implied result contract, inferred from the routes, is:
```ts
type ScanResult = {
  decision: { outputState: "Execute" | "Watch" | "Reject"; /* ...score? */ };
  // ...entry / sl / tp1 / master, per the docs
};
```
➡️ **This is the single biggest gap.** Whatever session produced these route
files did not commit the engine they call. Confirm where `scanTicker` lives.

### 4.4 "First Tasks" (from *7-21-26 prompt*) — status
| First task | In repo? |
|-----------|----------|
| 1. DB schema for 4-tier access + automation params | ❌ Not present |
| 2. Cron engine pseudo-code for 15 mean-reversion setups | ❌ Not present |
| 3. Multi-asset execution controller stubs (Stocks/Options/Futures/Crypto/Forex/Commodities) | ❌ Not present (sample only lives in the Gemini doc, not the repo) |

The frontend chassis described in *Updates for code 7-21-26* (header bar, asset
selector, price bar, volatility matrix, bid/ask blocks, HUD nav) is **also not in
this repo** — only the two API routes are here.

---

## 5. Open decisions needed from you

1. **Canonical product name** — which expansion of "GSPS" is official? (§3.1)
2. **Monetization model** — the 4-tier SaaS model *or* the Cuban cost-plus-data
   model? They can't both drive the schema. (§3.2)
3. **Default asset list** — confirm the 9-asset list (SPY + BTC + Mag 7) and
   whether AMD/TTWO are intentionally dropped. (§3.3)
4. **Stop-loss semantics** — confirm 12–18% = option premium, 2%/1.5–5% =
   underlying. (§3.5)
5. **Where is `scanTicker`?** — is the engine in another repo/branch that should
   be added to this session, or does it still need to be written? (§4.3)
6. **Scan execution model** — on-request (current code) vs. market-close cron +
   cache (spec). (§4.1)

---

## 6. Suggested next steps (once §5 is resolved)

1. Merge the 7 docs into **one authoritative `SPEC.md`** (name, tiers, asset
   list, risk rules, scan waterfall) so future sessions stop diverging.
2. Bring `scanTicker` into the repo (or point this session at its source).
3. Align `batch-route.ts` to the canonical asset list + score-gated top-15
   payload shape.
4. Then tackle First Tasks 1–3 (schema, cron engine, multi-asset controller).

*This review makes no code changes — it only documents findings so the specs can
be reconciled before implementation continues.*
