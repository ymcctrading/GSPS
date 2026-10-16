-- Widen `in_app_notifications.verdict` to admit 'Watch'.
--
-- Migration 0067 created this table for the monitor-transition fan-out, whose
-- only two notify-worthy outcomes are a confirmed WATCH -> EXECUTE and a
-- tracked setup breaking -- so the check constraint admitted exactly
-- ('Execute', 'INVALIDATED'). Its own header anticipated this: "an in-app
-- notification is meant to generalize past monitor transitions eventually
-- (this migration's caller is the first, not the only, consumer)."
--
-- The second consumer is the intraday system scan's alert fan-out
-- (app/api/intraday-scan/route.ts#notifySubscribedUsers), which until now
-- reached a member through email alone. That is the cross-platform
-- consistency defect AGENTS.md names: the in-app channel existed, the
-- intraday alerts did not use it, and with Resend still on its sandbox
-- sender every one of those emails fails for every recipient but the
-- account owner -- so a real alert (SPY bearish, score 6, 2026-10-16
-- 17:12 UTC) reached nobody at all.
--
-- 'Watch', not 'Execute', is the honest label for these rows.
-- `applyMonitorsForUser` in that same route already states the rule and the
-- bug behind it: "An intraday alert is not a scored Execute verdict, so it
-- only ever opens a WATCH monitor ... Marking alert symbols EXECUTE put
-- Watch/Reject setups on Home's tracked Execute card with no score (project
-- owner, 2026-09-28)." Writing these bell rows as 'Execute' would restate
-- that same misrepresentation one surface over.
--
-- Rollback (only safe once no 'Watch' rows remain):
--   delete from public.in_app_notifications where verdict = 'Watch';
--   alter table public.in_app_notifications
--     drop constraint in_app_notifications_verdict_check,
--     add constraint in_app_notifications_verdict_check
--       check (verdict in ('Execute', 'INVALIDATED'));

alter table public.in_app_notifications
  drop constraint if exists in_app_notifications_verdict_check;

alter table public.in_app_notifications
  add constraint in_app_notifications_verdict_check
    check (verdict in ('Execute', 'Watch', 'INVALIDATED'));
