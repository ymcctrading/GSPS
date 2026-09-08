-- Supports the Automated Portfolio Manager's opt-in "pivot on stop-out"
-- behavior: when an automated position it placed is stopped out, and this
-- dial is on, the engine seeds a fresh trade plan from that instrument's
-- Pivot Plan (the opposite-direction contingency, lib/strat/levels.ts /
-- lib/scanner/intraday.ts) instead of just closing out and doing nothing.
-- See lib/automation/stop-out.ts.
--
-- Two additions:
--
-- 1. `user_automation_profiles.pivot_on_stop_out` -- the opt-in itself,
--    default false so nothing changes for anyone until they turn it on
--    (same pattern as 0060's execution_mode: pre-existing table, no
--    `create table` for it in this repo -- see supabase/AGENTS.md's table
--    list "as of migration 0018").
--
-- 2. `orders.source_plan_id` -- traces an automated order back to the
--    `trade_plans` row that produced it (set only by
--    lib/automation/service.ts's `deriveOrderInputFromPlan`, never by a
--    manual ticket). Without this, the exit managers
--    (lib/trade/exit-manager-sim.ts, lib/trade/exit-manager.ts) have no way
--    to know, once a stop actually fires, which plan to invalidate or seed
--    a pivot plan from -- protocol_exits.entry_order_id already points back
--    to this row (see place-order.ts), but nothing on `orders` pointed
--    onward to the plan until now. Nullable and unreferenced by any manual
--    order: a plain ticket, or a plan-scoped GSPS Automation activation
--    (lib/automation/service.ts is shared by both, so this column is set
--    for that path too, which is intentional -- both automated paths get
--    the same stop-out handling).
--
-- Rollback:
--   alter table public.user_automation_profiles drop column if exists pivot_on_stop_out;
--   alter table public.orders drop column if exists source_plan_id;

alter table public.user_automation_profiles
  add column if not exists pivot_on_stop_out boolean not null default false;

alter table public.orders
  add column if not exists source_plan_id uuid references public.trade_plans (plan_id) on delete set null;
