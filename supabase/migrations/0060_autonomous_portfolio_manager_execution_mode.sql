-- Adds the paper/live execution-mode field to `user_automation_profiles`
-- (pre-existing table, no migration for it in this repo — see
-- supabase/AGENTS.md's table list "as of migration 0018").
--
-- Pre-establishes the route rather than gating the feature behind it: the
-- Automated Portfolio Manager loop (lib/automation/portfolio-manager.ts)
-- can now honor a member's paper/live choice the same way the plan-scoped
-- GSPS Automation already does, so the option is simply *there* once a
-- member has a live broker connection and the loop's own kill switch
-- (AUTONOMOUS_LIVE_TRADING_HALTED, lib/automation/autonomous-live-gate.ts)
-- is turned off for them, rather than needing a schema change at that
-- point. Defaults every existing and new row to 'paper' -- nothing changes
-- for anyone until they deliberately pick 'live'.
--
-- Rollback: alter table public.user_automation_profiles drop column if exists execution_mode;

alter table public.user_automation_profiles
  add column if not exists execution_mode text not null default 'paper'
    check (execution_mode in ('paper', 'live'));
