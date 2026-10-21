-- GSPS — 0096: a delivery the sandbox sender cannot make is `skipped`, and a
-- failure keeps its reason
--
-- Review finding S-04 (2026-10-21). Every email went out from Resend's sandbox
-- sender, which delivers only to the account owner, so 12,534 deliveries to
-- members were recorded `failed` with no reason (`provider_ref` is null on a
-- failure). The app now sends from `RESEND_FROM` once a domain is verified,
-- marks a send the sandbox cannot make `skipped` (never retried), and stores
-- the provider's reason on a real failure.
--
-- Apply BEFORE the code that writes `skipped` and `error` is deployed: until
-- then that update fails and the row stays `pending`.
--
-- Forward-only: no earlier migration is edited.
--
-- Rollback: alter table public.notification_deliveries drop column error;
--   (an enum value cannot be dropped; `skipped` stays unused.)

alter type public.notification_status add value if not exists 'skipped';

alter table public.notification_deliveries add column if not exists error text;
