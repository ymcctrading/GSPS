-- GSPS — 0124: how early a member is told that price is nearing a plan's entry
--
-- Owner, 2026-10-28: the intraday scan should alert "as price is moving towards
-- that entry level", early enough to sign in, open the chart and place the
-- order, "so it may be five minutes and maybe 15 minutes". The heads-up
-- (`entry_approach`, lib/scanner/intraday.ts) carries the minutes left at the
-- current pace; push sends it once that is within the member's lead
-- plus one scan (lib/scanner/entryApproach.ts). 15 minutes is the default, the
-- owner's own figure; the other choices are engineering, labelled.
--
-- Additive, with a default, so code that does not read it is unaffected.
--
-- Rollback:
--   alter table public.notification_preferences drop column if exists entry_lead_minutes;

alter table public.notification_preferences
  add column if not exists entry_lead_minutes integer not null default 15
  check (entry_lead_minutes in (5, 10, 15, 30, 60));
