# GSPS — Next Steps (Plain English, In Order)

This is the recommended order of work. Each step unblocks the next. Steps 1–2
are the real bottlenecks; nothing substantial can be finished until they're done.

---

### Step 1 — Lock the 6 open decisions (you decide, ~30 min)
Before anyone writes more code, pin down the six things the docs disagree on.
Each has its own document in `review/insights/` with my recommendation:
- **What "GSPS" officially stands for** (3 versions exist) → `01`
- **Which pricing model we build** (4-tier SaaS vs. Cuban cost-plus-data) → `02`
- **The official default asset list** (code and docs disagree) → `03`
- **What the stop-loss percentages actually mean** (premium vs. underlying) → `05`
- **Where the `scanTicker` engine lives** (it's not in this repo) → `06`
- **When scans run** (on every request vs. once at market close) → `07`

*Why first:* these choices drive the database schema, the billing system, and the
scanner output shape. Guessing wrong means rework.

### Step 2 — Bring in (or write) the `scanTicker` engine
This is the single biggest blocker. Both API routes call `scanTicker`, but the
file isn't in the repo. Either point me at the repo/branch where it already
lives, or we build it. **Until this exists, the app cannot produce a real scan.**

### Step 3 — Make the project actually runnable
Right now there's no `package.json`, no Next.js app, no TypeScript config — just
three loose files. We need the standard Next.js skeleton so the routes can run,
tests can execute, and a real scan can happen. (I built a temporary mock in
`sandbox/` only to prove the pipeline; it is not the real app.)

### Step 4 — Apply the safe corrections I've already staged
Two fixes are unambiguous and I've made them:
- Corrected the **default watchlist** to the canonical 9 assets (added BTC,
  removed AMD/TTWO). → `03`
- Hardened the **API input validation** (bad `optionPremium`, ticker cleanup). → `08`

### Step 5 — Implement the scoring waterfall + correct payload shape
Make the batch scanner match the spec: Strat Sniper Gate → Tier 1 (8–9/9) →
Tier 2 velocity fallback (7/9 if RVOL ≥ 2.0) → sort → top 15, returned as
`bullishReversions` / `bearishReversions`. → `04`

### Step 6 — Move scanning to a market-close cron + cache
The dashboard is supposed to read pre-computed results, not run a live scan on
every page load. Add the scheduled job + cache layer. → `07`

### Step 7 — Build the three "First Tasks" from the architect prompt
1. Database schema for the tier/feature-flag system + user automation settings.
2. The market-close cron engine that computes the 15 mean-reversion setups.
3. The multi-asset execution controller (Stocks/Options/Futures/Crypto/Forex/Commodities).

### Step 8 — Collapse the 7 Google Docs into one `SPEC.md`
Once the decisions are locked, merge everything into a single source of truth so
future work stops drifting between contradictory documents.

---

**Fastest path to a real, working scan:** Step 1 (asset list + engine location) →
Step 2 (engine) → Step 3 (runnable skeleton). Those three alone get you a live scan.
