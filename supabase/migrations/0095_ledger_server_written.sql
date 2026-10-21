-- GSPS — 0095: members read their ledger; only the server writes it
--
-- Review finding R-029 (2026-10-21). Members held every privilege on their own
-- ledger and progress rows, so a member's own session token could, straight
-- through the API:
--   * set their paper cash, fills and realized P&L, which the Track Record
--     promotion path reads;
--   * insert a pending paper order that the resting-order pass then fills,
--     past every rule placement enforces (entry confirmation, Gann's capital
--     and tenth-of-the-unit rules, the position ceilings, the order lock);
--   * mark every lesson passed, the curriculum path and Academy 8's capstone,
--     the one step every path to Wall Street requires;
--   * delete their own order-placement lock.
--
-- The app now writes these tables with the service role (lib/supabase/ledger.ts,
-- `ledgerWriter`), each write naming its user. Members keep SELECT, and row
-- security still limits what they read to their own rows. anon gets nothing.
--
-- `user_automation_profiles` is left as it was: it holds a member's own
-- settings, the control panel writes it from the browser, and the portfolio
-- manager checks the member's entitlement before it acts on any of them.
--
-- ORDER MATTERS: apply only after the code that writes through `ledgerWriter`
-- is deployed. Applied before, every order, fill, exit, plan and lesson write
-- made with a member's session fails.
--
-- Forward-only: no earlier migration is edited.
--
-- Rollback:
--   grant insert, update, delete on public.positions, public.orders, public.paper_accounts,
--     public.trade_logs, public.protocol_exits, public.trade_plans, public.trade_plan_audit,
--     public.school_lesson_progress, public.school_learning_labs, public.order_placement_locks
--     to authenticated;
--   grant execute on function public.increment_paper_cash(uuid, numeric) to authenticated;
--   grant execute on function public.execute_position_fill(uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, uuid) to authenticated;
--   grant execute on function public.try_acquire_order_lock(uuid, uuid, integer) to authenticated;
--   grant execute on function public.release_order_lock(uuid, uuid) to authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.positions,
     public.orders,
     public.paper_accounts,
     public.trade_logs,
     public.protocol_exits,
     public.trade_plans,
     public.trade_plan_audit,
     public.school_lesson_progress,
     public.school_learning_labs,
     public.order_placement_locks
  from anon, authenticated;

revoke select
  on public.positions,
     public.orders,
     public.paper_accounts,
     public.trade_logs,
     public.protocol_exits,
     public.trade_plans,
     public.trade_plan_audit,
     public.school_lesson_progress,
     public.school_learning_labs,
     public.order_placement_locks
  from anon;

-- These four write the ledger as the caller; the server calls them with the
-- service role now.
revoke execute on function public.increment_paper_cash(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.execute_position_fill(uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, uuid) from public, anon, authenticated;
revoke execute on function public.try_acquire_order_lock(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_order_lock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.increment_paper_cash(uuid, numeric) to service_role;
grant execute on function public.execute_position_fill(uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, uuid) to service_role;
grant execute on function public.try_acquire_order_lock(uuid, uuid, integer) to service_role;
grant execute on function public.release_order_lock(uuid, uuid) to service_role;
