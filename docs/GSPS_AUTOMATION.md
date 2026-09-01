# GSPS Automation — entry confirmation, plan-scoped automation, live-only risk

Implements the "GSPS Implementation Brief" single-source-of-truth spec pack
(2026-08-31), which explicitly supersedes the two earlier automation
implementation briefs uploaded the same day. This document is the map from
that spec to what actually landed, what was deliberately narrowed, and what
was deliberately not built — mirroring `docs/CLAUDE_CODE_ROADMAP_TRACKER.md`'s
own format for a prior spec pack.

## What shipped

| Spec requirement | Code |
|---|---|
| Mandatory entry confirmation (touch/break/sweep alone can't create an entry) | `lib/lifecycle/entryConfirmation.ts` (the versioned break/retest/confirmation-move rule + `entryReady` gate), wired into `trade_plans`' new `awaiting_entry_confirmation` state (`supabase/migrations/0053_entry_confirmation_lifecycle.sql`) |
| Idempotent qualifying-signal → candidate-plan creation | `createOrGetIdempotentTradePlan` (`lib/lifecycle/store.ts`) on a new `signal_fingerprint` unique index; `PLAN_AUTO_CREATED_FROM_QUALIFYING_SIGNAL` → `mark_auto_created` audit kind |
| Plan-scoped, Wall-Street-only Automation, paper/live, immutable mode | `automation_profiles`/`automation_events`/`order_intents` (`0051_gsps_automation_profiles.sql`), `lib/automation/service.ts`, `app/api/automation/profiles/*`, UI section on `/automation` |
| `authorizeAutomatedOrder(profileId)` resolving every order term server-side | `lib/automation/service.ts` — client sends only `profileId`/`planId`/`automationMode`/`executionMode`/`configuration.allocatedDollarRisk`, never raw ticker/side/price/qty |
| Live-only per-trade loss cascade (6/9/15/30/50%) | `lib/risk/live-trade-loss.ts`, `0052_live_trade_loss_policy.sql`, wired into `lib/trade/live-sync.ts`'s existing poll |
| Live stop widen/remove friction | `lib/risk/stop-override.ts`, `app/api/risk/stop-override/*` |
| Backtest/forward-test parity | `lib/backtest/entryConfirmation.ts` calls the identical `lib/lifecycle/entryConfirmation.ts` functions the live pipeline uses |

## Deliberate scope decisions

**Entry confirmation gates the automated pipeline, not manual/guided
tickets.** The brief's opening paragraph frames this as closing the
scan-to-automation loop; retrofitting it onto every existing manual and
Guided Decision Mode order path (built and relied on across many prior PRs)
was judged a separate, much larger and riskier change than this brief's
core ask. `lib/trade/place-order.ts`'s manual/guided paths are untouched.

**PSAR: nothing to inventory.** `rg -i "PSAR|parabolic"` across the whole
repository returns zero matches. There is no PSAR implementation anywhere
to keep as a benchmark, refactor into a module, or migrate away from — the
brief's entire "Indicator modules and PSAR" section describes a codebase
that isn't this one. The five named modules (GSPS Trend Rail, Breakout
Rail, Pullback Continuation, VWAP Momentum, Reversal Confirmation) are not
built under those names either: equivalent, already-versioned, evidence-
gated logic exists as `lib/signals/states/{trendPullback,trendBreakout,
confirmedReversal,rangeReversion}.ts` (see `docs/SIGNAL_REGIME_ENGINE.md`).
Wrapping that existing code in five new files that just re-export it would
satisfy the letter of the spec while adding nothing; actually building five
new independent indicator modules is a multi-week signal-engineering
project, not something this pass invents. Left explicitly open rather than
faked.

**Phone/SMS: no provider in this repo.** `lib/notifications` only wraps
Resend (email). `lib/notifications/live-risk-email.ts`'s `sendLiveRiskSms`
is a stub that reports `not_configured`; `live_stop_overrides.verified_phone`
can never become `true` until a real SMS integration (Twilio or similar)
exists. Every gate that the brief scopes to "verified email AND verified
phone" is implemented here as verified-email-only, documented at each site
(migration header, `lib/risk/stop-override.ts` header) rather than silently
dropping the requirement.

**GSPS School: pilot re-certification module shipped; the broader product
is still undecided.** `live_trading_restrictions.school_completed_at`
(`isLiveTradingRestricted`'s check) now has a writer: `/school`
(`lib/school/`) is a four-lesson, quiz-gated pilot — Live-Trading Risk
Re-Certification — scoped to the one requirement this repo already
specifies, and completing it lifts the restriction. See
`docs/GSPS_SCHOOL.md` for what was and wasn't decided; the wider GSPS
School product (identity, audience beyond a restricted member, additional
subjects, credentials, compliance, enrollment/payments) remains
unestablished and requires an owner decision before it's built.

**Automating a plan still `awaiting_entry_confirmation` isn't supported.**
`activateAutomationProfile` requires the linked plan to already be `armed`
or later — i.e. already past the confirmation gate — and authorizes the
order immediately as part of activation. Queuing automation against a plan
that hasn't confirmed yet, to fire automatically once it does, needs a
poller; the Vercel Hobby 2-cron/day cap means that has to ride the scan
pipeline's own cadence rather than a dedicated schedule. Tracked as a
follow-up, not built here.

**Sizing.** `deriveOrderInputFromPlan` computes
`qty = floor(allocatedDollarRisk / |entryTrigger - invalidation|)` — the one
member-supplied number (`allocatedDollarRisk`) that reaches order sizing.
This is simpler than GSPS's fuller position-sizing engines elsewhere in the
app (`lib/risk/dynamic-risk.ts`, Guided Decision Mode's caps); those are not
wired into this path, which is a narrowing worth revisiting once the
Automation tab needs to interoperate with the Novice Risk & Cooldown
Engine's per-account exposure limits.

**Market scope.** `activateAutomationProfile` refuses any plan whose
`market` isn't `us_equity`. Options/futures/forex/crypto/commodities each
need their own market-specific constraints per the brief's table; none of
that exists here, and this pass doesn't attempt it.

## Non-negotiables verified

- No claim anywhere that Hermetic/Gann framing predicts markets (unrelated
  to this brief's scope; not touched).
- No client-side bypass: `entryReady`/`checkPlanEligibleForAutomation`/
  `authorizeAutomatedOrder` all run server-side; RLS on the three new
  automation tables and three new risk tables grants `select` only, no
  client `insert`/`update`.
- No arbitrary order-entry endpoint: `POST /api/automation/profiles`
  accepts `planId`/mode/configuration, never ticker/side/price/stop/qty.
- No broker credentials added to source control.
- No production deploy, merge, or real order submitted as part of this
  work — everything above is code on a feature branch.
- Live-only enforcement (`risk_trade_loss_state`, stop-override friction,
  `live_trading_restrictions`) never reaches a paper position — every call
  site is inside the live-only sync path or gated on `execution_mode`.
