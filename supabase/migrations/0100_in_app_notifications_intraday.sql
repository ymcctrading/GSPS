-- GSPS — 0100: the bell takes intraday signals (numbered 0097 when it was
-- applied to production on 2026-10-21; renumbered when main took 0097)
--
-- Owner decision, 2026-10-21 ("Yes, build and apply it"): a new intraday
-- signal from the scheduled scans puts a bell notice on every member who has
-- the symbol on a watchlist or a tracked (WATCH/EXECUTE) monitor, so a fast
-- move reaches them while email is still held by the sandbox sender. The
-- verdict check allowed only the daily verdicts, so it gains 'Intraday'.
-- Written by app/api/intraday-scan/route.ts (lib/notifications/intradayBell.ts).
--
-- Apply BEFORE the code that writes 'Intraday' is deployed: until then that
-- insert fails the check and the notice is lost (the scan itself is unaffected).
--
-- Forward-only: no earlier migration is edited.
--
-- Rollback:
--   delete from public.in_app_notifications where verdict = 'Intraday';
--   alter table public.in_app_notifications drop constraint in_app_notifications_verdict_check;
--   alter table public.in_app_notifications add constraint in_app_notifications_verdict_check
--     check (verdict in ('Execute', 'INVALIDATED'));

alter table public.in_app_notifications drop constraint if exists in_app_notifications_verdict_check;

alter table public.in_app_notifications add constraint in_app_notifications_verdict_check
  check (verdict in ('Execute', 'INVALIDATED', 'Intraday'));
