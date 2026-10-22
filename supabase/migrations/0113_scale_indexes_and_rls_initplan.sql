-- Q2 item 7, "Scale safely": the index and query audit (2026-10-22).
--
-- Read from production's pg_stat_statements, pg_stat_user_tables and the
-- Supabase performance advisor. The baselines and the reasoning for each
-- line are in docs/SCALE_AUDIT.md.
--
-- 1. Indexes for the lookups the scan fan-out and the notification retry
--    sweep make on every pass. Each one is now a filter over a member's
--    whole history.
-- 2. Covering indexes for the foreign keys a member's account deletion
--    cascades through (auth.users -> ...), and for the parent tables whose
--    deletes check them. Without these, each cascade scans the whole child
--    table.
-- 3. Row-level security policies call auth.uid(), auth.role() and auth.jwt()
--    once per row. Wrapped in a sub-select, each is evaluated once per
--    statement (Supabase advisor 0003, auth_rls_initplan; 170 policies). The
--    expressions keep the same meaning and only the evaluation plan changes.

-- 1. Hot lookups --------------------------------------------------------------

-- recordInAppNotification's duplicate check (13,121 calls, mean 2.76 ms). It
-- reads (transition_id, profile_id) and was served by the profile index plus
-- a filter.
create index if not exists in_app_notifications_transition_profile_idx
  on public.in_app_notifications (transition_id, profile_id);

-- sweepStuckDeliveries: status in (pending, failed), attempt_count < 5,
-- created_at < cutoff. There was no index on status, so every 30-minute
-- sweep read the whole table.
create index if not exists notification_deliveries_retryable_idx
  on public.notification_deliveries (created_at)
  where status in ('pending', 'failed');

-- The intraday dedupe (lib/notifications/intradayDelivery.ts#alreadySent):
-- user_id, channel, signal_hash and triggered_at. The older
-- (user_id, signal_hash, created_at) index carried neither channel nor
-- triggered_at.
create index if not exists notification_log_dedupe_idx
  on public.notification_log (user_id, signal_hash, channel, triggered_at desc);

-- 2. Foreign keys without a covering index -------------------------------------

create index if not exists notification_deliveries_transition_idx on public.notification_deliveries (transition_id);
create index if not exists monitor_transitions_profile_idx on public.monitor_transitions (profile_id);
create index if not exists watchlists_user_idx on public.watchlists (user_id);
create index if not exists trade_plan_audit_user_idx on public.trade_plan_audit (user_id);
create index if not exists automation_events_user_idx on public.automation_events (user_id);
create index if not exists order_intents_user_idx on public.order_intents (user_id);
create index if not exists order_intents_plan_idx on public.order_intents (plan_id);
create index if not exists automation_profiles_plan_idx on public.automation_profiles (plan_id);
create index if not exists risk_trade_loss_state_user_idx on public.risk_trade_loss_state (user_id);
create index if not exists live_stop_overrides_user_idx on public.live_stop_overrides (user_id);
create index if not exists setup_folders_user_idx on public.setup_folders (user_id);
create index if not exists orders_source_plan_idx on public.orders (source_plan_id);
create index if not exists orders_connection_idx on public.orders (connection_id);
create index if not exists positions_connection_idx on public.positions (connection_id);
create index if not exists trade_logs_order_idx on public.trade_logs (order_id);
create index if not exists trade_logs_position_idx on public.trade_logs (position_id);
create index if not exists guided_recommendations_order_idx on public.guided_recommendations (order_id);

-- 3. auth_rls_initplan ------------------------------------------------------------

do $$
declare
  p record;
  q text;
  c text;
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') || coalesce(with_check, '') ~ 'auth\.(uid|role|jwt)\(\)'
  loop
    -- Production has no wrapped call yet, so a plain replace never nests.
    -- Already-wrapped text is guarded anyway, so a rerun leaves it alone.
    q := p.qual;
    c := p.with_check;
    if q is not null and q !~* '\(\s*select\s+auth\.' then
      q := regexp_replace(q, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
    end if;
    if c is not null and c !~* '\(\s*select\s+auth\.' then
      c := regexp_replace(c, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
    end if;
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if q is not null then stmt := stmt || format(' using (%s)', q); end if;
    if c is not null then stmt := stmt || format(' with check (%s)', c); end if;
    execute stmt;
  end loop;
end
$$;
