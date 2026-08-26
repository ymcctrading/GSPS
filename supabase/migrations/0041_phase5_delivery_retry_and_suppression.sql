-- Phase 5 hardening. Additive only; does not touch migration 0036 or any
-- historical migration.
--
-- notification_deliveries:
--   payload jsonb       -- the EntitledAlertPayload recorded at evaluation
--                           time (lib/entitlements/delivery.ts). A retry
--                           sweep with no scan context of its own dispatches
--                           using exactly this, never a payload rebuilt from
--                           current (possibly since-changed) data.
--   attempt_count int    -- how many times dispatchNotificationDelivery has
--                           attempted a send for this row. Bounds the retry
--                           sweep (MAX_DISPATCH_ATTEMPTS in delivery.ts) so
--                           a permanently-failing delivery doesn't retry
--                           forever.
--
-- active_monitors:
--   last_suppressed_reason text        -- 'cooldown' | 'stale_evaluation',
--   last_suppressed_at timestamptz        the most recent
--   set by lib/entitlements/monitor-store.ts whenever decideTransition()
--   (monitor.ts) declines to apply a candidate transition. Closes "record
--   suppression reason rather than silently duplicating notifications"
--   (Phase 5 spec) -- previously the reason was only returned to the
--   caller in-process and never persisted anywhere inspectable.
--
-- Rollback: `alter table public.notification_deliveries drop column if
-- exists payload, drop column if exists attempt_count;
-- alter table public.active_monitors drop column if exists
-- last_suppressed_reason, drop column if exists last_suppressed_at;`

alter table public.notification_deliveries
  add column payload jsonb,
  add column attempt_count int not null default 0;

alter table public.active_monitors
  add column last_suppressed_reason text,
  add column last_suppressed_at timestamptz;
