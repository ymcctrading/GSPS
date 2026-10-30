-- GSPS — 0139: the bell carries a member's own trade notices and the evening
-- summary (2026-10-29, email capacity).
--
-- Email is budgeted (0126) and the free plan takes 100 a day. Until now an
-- order cancelled for a broken plan, a live position crossing a loss
-- threshold, or an evening digest over the budget reached the member by
-- email or not at all. They are now written to the bell, and pushed, whatever
-- the email does (lib/notifications/keyNotice.ts), so a skipped or failed
-- email never drops one silently. 'Your trade' and 'Summary' join the
-- verdicts the bell accepts.
--
-- Rollback:
--   delete from public.in_app_notifications where verdict in ('Your trade', 'Summary');
--   alter table public.in_app_notifications drop constraint in_app_notifications_verdict_check;
--   alter table public.in_app_notifications add constraint in_app_notifications_verdict_check
--     check (verdict in ('Execute', 'INVALIDATED', 'Intraday', 'Price alert'));

alter table public.in_app_notifications drop constraint if exists in_app_notifications_verdict_check;

alter table public.in_app_notifications add constraint in_app_notifications_verdict_check
  check (verdict in ('Execute', 'INVALIDATED', 'Intraday', 'Price alert', 'Your trade', 'Summary'));
