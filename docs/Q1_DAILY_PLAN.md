# Q1 Day-to-Day Plan (Aug 17 – Oct 30, 2026)

**Phase:** Q1 — Monetization & Retention Foundation (see `ROADMAP.md`).
**Team:** Founder (core product) + 1 contractor (backend/notifications), per
the Q1 team model in `ROADMAP.md`.
**Cadence:** Two-week sprints, weekly sync, sprint demo every other Friday.
**Window:** 11 weeks, Mon Aug 17 → Fri Oct 30 2026.
**Decision gate:** Fri Oct 30 — continue/pivot on 70%+ first-cohort retention
and 25+ paying users (per `ROADMAP.md` decision gates).

This breaks the Q1 initiatives (notifications, portfolio analytics,
conditional orders, onboarding, mobile-responsive dashboard, indicators
phase 1) and Q1 platform/security items into a day-by-day schedule for two
parallel tracks. Effort estimates are drawn from the Feature Priority Matrix
in `ROADMAP.md`. Adjust as reality lands — this plan is a working schedule,
not a commitment ledger; if a day slips, absorb it in that sprint's Friday
buffer before pushing into the next sprint.

---

## Sprint 1 — Aug 17–28: Notification foundation + analytics data model

**Goal:** Notification pipeline can send a test alert end-to-end; portfolio
analytics has a data model and query layer to build UI against.

| Date | Founder (core product) | Contractor (backend/notifications) |
|---|---|---|
| Mon Aug 17 | Audit historical trade/alert data available for analytics (trade_logs, positions) | SendGrid account + API key setup; Vercel Pro upgrade (removes 2-cron/day cap per Platform roadmap) |
| Tue Aug 18 | Design portfolio analytics schema: win/loss, P&L rollups per user | Notification schema: `notification_preferences`, `notification_log` tables + migration |
| Wed Aug 19 | Write Supabase queries for win/loss ratio and monthly/quarterly P&L | Sentry setup (structured error logging, per Platform & reliability roadmap) |
| Thu Aug 20 | Query for drawdown calc (peak-to-trough on equity curve) | Wire notification trigger into existing alert-generation path (email only, no UI yet) |
| Fri Aug 21 | Perf-check analytics queries against real data volume; sync + demo prep | Send first end-to-end test email alert; fix delivery bugs |

---

## Sprint 2 — Aug 31–Sep 11: Portfolio analytics UI + multi-channel notifications

**Goal:** Portfolio analytics dashboard ships; notifications support quiet
hours and SMS/push in addition to email.

| Date | Founder (core product) | Contractor (backend/notifications) |
|---|---|---|
| Mon Aug 31 | Portfolio analytics UI: win/loss ratio + P&L chart components | Twilio account setup; SMS alert channel |
| Tue Sep 1 | Sharpe ratio calc + display | Quiet hours logic (per-user schedule, respected at send time) |
| Wed Sep 2 | Drawdown chart + max-drawdown callout | Browser push notifications (service worker registration) |
| Thu Sep 3 | Performance-by-pattern-type breakdown table | Alert history dashboard (past alerts sent, channel, status) |
| Fri Sep 4 | QA analytics dashboard against known trade history; fix discrepancies | Notification settings UI (channel toggles, quiet hours picker) |
| — | *(Mon Sep 7 is Labor Day — no scheduled work)* | |
| Tue Sep 8 | Polish analytics dashboard responsiveness/empty states | Notification QA: verify quiet hours + multi-channel across timezones |
| Wed Sep 9 | Bug fixes from analytics QA | Load-check notification send at current alert volume |
| Thu Sep 10 | Ship portfolio analytics | Ship notification system (email + SMS + push, quiet hours, history) |
| Fri Sep 11 | **Sprint demo:** analytics dashboard + notifications live | **Sprint demo:** same; retro |

---

## Sprint 3 — Sep 14–25: Conditional orders

**Goal:** Stop-loss and take-profit attachable to any order, foundation for
Q2 bracket orders.

| Date | Founder (core product) | Contractor (backend/notifications) |
|---|---|---|
| Mon Sep 14 | Start onboarding: glossary integration (term tooltips/links) | Research Alpaca conditional-order API (stop, limit, OTO); design order state machine |
| Tue Sep 15 | Onboarding: pattern education content pass | Implement stop-loss attach at order submission |
| Wed Sep 16 | Onboarding: pattern education UI | Implement take-profit attach at order submission |
| Thu Sep 17 | Guided paper-trade walkthrough — step 1-3 (setup, signal, entry) | Order state handling: track conditional legs, cancellation on fill |
| Fri Sep 18 | Guided paper-trade walkthrough — step 4-5 (exit, review); sync | Conditional-order unit tests |
| Mon Sep 21 | Finish onboarding walkthrough; internal dogfood | Conditional orders: edge cases (partial fills, broker rejection) |
| Tue Sep 22 | Start technical indicators phase 1: SMA/EMA overlay | Conditional orders: UI wiring in order ticket |
| Wed Sep 23 | Indicators: RSI overlay | Conditional-order QA against paper trading |
| Thu Sep 24 | Indicators: MACD overlay + toggle panel | Fix conditional-order bugs from QA |
| Fri Sep 25 | **Sprint demo:** onboarding + indicators phase 1 | **Sprint demo:** conditional orders live; retro |

---

## Sprint 4 — Sep 28–Oct 9: Mobile-responsive dashboard + security hardening

**Goal:** Dashboard, portfolio, and alerts usable on phone/tablet; Q1
security items (API key rotation, rate limiting) closed out.

| Date | Founder (core product) | Contractor (backend/notifications) |
|---|---|---|
| Mon Sep 28 | Mobile-responsive: dashboard page breakpoints | API key encryption rotation design (per Security & compliance roadmap) |
| Tue Sep 29 | Mobile-responsive: portfolio page + position cards | Implement key rotation job |
| Wed Sep 30 | Mobile-responsive: chart view (touch interactions) | Rate-limit hardening on public/API routes |
| Thu Oct 1 | Mobile-responsive: alerts + notification settings | Rate-limit QA; abuse-case testing |
| Fri Oct 2 | Mobile-responsive: order ticket + nav; cross-device QA | Security fixes from QA; sync |
| Mon Oct 5 | Fix mobile layout bugs found in QA | Start Playwright E2E: login flow |
| Tue Oct 6 | Fix mobile layout bugs (continued) | Playwright E2E: trade execution flow |
| Wed Oct 7 | Mobile QA on real devices (iOS Safari, Android Chrome) | Playwright E2E: alert delivery flow |
| Thu Oct 8 | Polish + ship mobile-responsive dashboard | Wire Playwright into CI |
| Fri Oct 9 | **Sprint demo:** mobile-responsive dashboard | **Sprint demo:** E2E suite in CI; retro |

---

## Sprint 5 — Oct 12–23: Paid tier + launch readiness

**Goal:** Freemium paywall live (5 free scans/day, $29–49/mo premium);
system ready for first 20–30 paying users.

| Date | Founder (core product) | Contractor (backend/notifications) |
|---|---|---|
| Mon Oct 12 | Design paywall: free-tier scan limit (5/day), premium gate points | Billing provider integration (Stripe) setup |
| Tue Oct 13 | Implement scan-limit enforcement + upgrade prompts | Subscription webhook handling (create/cancel/renew) |
| Wed Oct 14 | Pricing page + upgrade flow UI | Entitlement checks wired to alerts/analytics/order-types |
| Thu Oct 15 | Billing QA: upgrade, downgrade, cancel paths | Billing QA: webhook edge cases, failed payments |
| Fri Oct 16 | Fix billing bugs; sync | Notification deliverability check at projected launch volume |
| Mon Oct 19 | End-to-end dry run: signup → free tier → upgrade → premium features | Monitor Sentry/logs from dry run; fix issues |
| Tue Oct 20 | Fix issues from dry run | Fix issues from dry run |
| Wed Oct 21 | Final onboarding polish for new-user funnel | Final notification/billing polish |
| Thu Oct 22 | Full regression pass (Playwright suite + manual golden paths) | Full regression pass (backend, billing, notifications) |
| Fri Oct 23 | **Sprint demo:** paid tier end-to-end | **Sprint demo:** launch readiness review; retro |

---

## Sprint 6 — Oct 26–30: Beta launch + Q1 decision gate

**Goal:** Ship to first paying users; measure against the Q1 decision-gate
targets (70%+ first-cohort retention, 25+ paying users).

| Date | Founder (core product) | Contractor (backend/notifications) |
|---|---|---|
| Mon Oct 26 | Launch paid tier to waitlist/beta users | Monitor notification delivery + error rates live |
| Tue Oct 27 | Bug bash on live traffic; triage by severity | Bug bash; fix backend/notification issues |
| Wed Oct 28 | User feedback triage; quick UX fixes | Monitor billing webhooks + Sentry for live issues |
| Thu Oct 29 | Retention/revenue tracking dashboard for decision gate | Support fixes; stabilize notification volume |
| Fri Oct 30 | **Q1 decision gate:** review retention, paying-user count, NPS against targets in `ROADMAP.md`; Q2 kickoff planning | Same — joint retro |

---

## Notes

- **Dependencies to unblock early:** SendGrid/Twilio accounts (Sprint 1) and
  Vercel Pro upgrade (Sprint 1, day 1) gate almost everything downstream —
  don't let these slip past week 1.
- **Buffer:** each sprint's Friday is lighter by design (demo + retro) and
  can absorb 0.5–1 day of overflow from earlier in the sprint.
- **Out of phase:** if a production bug or security issue surfaces, it takes
  priority over the day's scheduled item — note the deviation rather than
  silently dropping planned work; push it to the next available slot.
- **Q2 prep:** backtesting engine (Q2's critical-path item) has a hard
  dependency on this phase's data pipeline maturity — worth a short design
  spike in Sprint 6 if time allows, but not at the cost of the decision-gate
  targets above.
