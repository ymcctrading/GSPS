# Insight 02 — Pricing / Tier Model Reconciliation

**Type:** Insight / Decision needed
**Priority:** HIGH (drives the database schema and billing system)

## Problem
Three incompatible monetization models exist in the docs:

1. **4-Tier SaaS** (*7-21-26 prompt*): Practice $0 · Standard $0 + per-trade fee ·
   Investor $99/mo ($990/yr) · System Mastery $299/mo.
2. **2-Tier** (*7-21-26 for Claude*): Standard (free) · Premium ("Investor Mode").
3. **Two strategic plans** (*GSPS pricing options ideas*):
   - **Cuban plan** — give the software away free, charge *raw data cost + 15%*,
     later become a broker-dealer.
   - **Robbins plan** — Standard free/low · Investor $99 · System Mastery $299,
     funneled through seminars.

## Why it matters
These aren't just different prices. The **Cuban "cost-plus-data" model is a
different architecture** — it requires metering each user's real-time data
consumption and billing a markup on it. The SaaS-tier model gates *features*, not
data usage. You cannot build the schema until you know which one is the plan.

## My recommendation
**Build the 4-Tier SaaS model now; keep the Cuban model possible later.**

- The 4-tier model is the most fully specified and maps cleanly to a
  feature-flag table (§7 First Task #1). Build to it.
- The 2-tier model is just a simplified view of the 4-tier one (Standard =
  Practice+Standard, Premium = Investor). Treat it as the *UI grouping*, not a
  separate system.
- Preserve the Cuban option by **metering data usage from day one** (log
  per-user data pulls even if you don't bill on them yet). That keeps a future
  "cost-plus data" pivot cheap without building it now.

## Action
- [ ] Confirm 4-tier SaaS as the build target.
- [ ] Confirm the exact tier names, prices, and per-tier feature list.
- [ ] Decide whether to add data-usage metering now (recommended: yes).
