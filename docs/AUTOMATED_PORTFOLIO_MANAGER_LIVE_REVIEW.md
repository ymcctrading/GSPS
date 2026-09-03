# Automated Portfolio Manager — Live Execution Route

## What this is

The Automated Portfolio Manager loop (`lib/automation/portfolio-manager.ts`)
now has a fully pre-established route to live execution: a member can pick
`execution_mode: "live"` on `/automation`'s control panel
(`user_automation_profiles.execution_mode`,
`supabase/migrations/0060_autonomous_portfolio_manager_execution_mode.sql`)
the same way they already choose paper/live on the plan-scoped GSPS
Automation flow. The loop reads that choice and, once authorized, submits
real orders through the exact same path the plan-scoped flow's live mode
already uses (`activateAutomationProfile`, `lib/automation/service.ts` →
`lib/brokers/alpaca.ts`).

This is not a compliance review, and it doesn't try to be one — it's the
plumbing so the option is simply *there* once a member has a live broker
connection, rather than requiring a schema change and a UI rebuild at that
point. What follows is what's built, what's still off by default, and how
to turn it on.

## What's built

- **Schema**: `user_automation_profiles.execution_mode` (`'paper'` /
  `'live'`, defaults to `'paper'` for every existing and new row).
- **UI**: a Paper/Live selector on `/automation`
  (`components/automation/control-panel.tsx`), with a plain note that Live
  is stored as a preference but the engine keeps trading paper until it's
  actually authorized.
- **Loop logic** (`lib/automation/portfolio-manager.ts`): reads
  `profile.execution_mode`. For `'paper'`, behavior is unchanged. For
  `'live'`, it calls `checkAutonomousLiveTradingAuthorized`
  (`lib/automation/autonomous-live-gate.ts`) before touching anything —
  if that returns unauthorized, the member's candidates are skipped for
  that run with a logged reason, never silently downgraded to paper.
- **Two independent off-by-default gates**, both must clear before a live
  order is ever placed by this loop:
  1. `AUTONOMOUS_LIVE_TRADING_HALTED` — an env var, defaults to halted.
     A dedicated kill switch for this loop specifically, independent of
     the global `TRADING_DISABLED` switch (`lib/trade/kill-switch.ts`),
     so this loop can be stopped without affecting manual orders, Guided
     Decision Mode, or the plan-scoped flow.
  2. An active row in `compliance_signoffs`
     (`supabase/migrations/0059_compliance_signoffs.sql`,
     `lib/compliance/signoff.ts`) for `feature = 'autonomous_live_trading'`.
     No code path anywhere inserts this row — it's written by hand, once,
     by whoever is authorizing the loop to go live, via `recordSignoff`.
- **Sizing caps specific to this loop's live orders**
  (`lib/automation/autonomous-live-gate.ts`): $500 per trade, $1,500 per
  member per rolling 24h — both well below the plan-scoped flow's
  member-supplied $50,000 ceiling, since a human never reviews this
  specific trade before it goes out. Enforced in
  `portfolio-manager.ts` via `sumLiveDollarRiskActivatedSince`, which sums
  this loop's own live activations in the last 24h before sizing the next
  one.
- **Audit trail**: every activation attempt, block, and order outcome is
  already recorded in `automation_events` via the shared
  `activateAutomationProfile` path — nothing new needed here.

## What's still required before this actually places a live order

1. **A live broker connection** for the member (`lib/brokers/live-creds.ts`)
   — already required by, and shared with, the plan-scoped flow's live
   mode. Nothing new to build there.
2. **`AUTONOMOUS_LIVE_TRADING_HALTED=false`** set in the deployment
   environment.
3. **One row in `compliance_signoffs`** for
   `feature: 'autonomous_live_trading'`, written by hand via
   `recordSignoff(supabase, { feature, approvedBy, reviewReference })` —
   not from a UI action, not from a deploy, not from this document.

Until all three are true, a member can select "Live" on the control panel
today and nothing about their real account changes — the loop keeps
trading paper on their behalf and says why in its run logs. That's the
deliberate shape of "pre-established, not pre-enabled."
