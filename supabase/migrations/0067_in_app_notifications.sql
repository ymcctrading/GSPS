-- In-app notification inbox -- the "on the platform itself" channel the
-- project owner asked for alongside email when a scan comes back Execute.
--
-- Deliberately NOT added as a fourth value on notification_channel
-- (0022_notifications.sql's email/sms/push enum) or a new row shape in
-- notification_deliveries (0036_entitlement_usage_and_monitors.sql): that
-- ledger's whole shape -- attempt_count, provider_ref, MAX_DISPATCH_ATTEMPTS,
-- a retry sweep -- exists to manage a real external provider's send/fail/
-- retry lifecycle (lib/entitlements/delivery.ts). An in-app row has none of
-- that: it either gets written or it doesn't, there is no provider to fail,
-- and nothing ever retries it. Forcing it through that ledger's shape would
-- mean a channel whose every column is either "sent" (there is no other
-- terminal state) or unused. A separate, purpose-built table is the honest
-- shape, and it sidesteps the unresolved question of whether Postgres will
-- let a freshly-added enum value be used later in the same migration
-- transaction.
--
-- Written directly by the same evaluateMonitorsAndNotify pass
-- (lib/entitlements/scan-fanout.ts) that records/dispatches the email
-- delivery, for every notify-worthy transition -- unlike email/sms/push,
-- this channel is not opt-in per profile (see
-- lib/entitlements/delivery.ts#getEnabledChannels): it has no send cost and
-- no risk of spamming an inbox, so it is always written, and a member's own
-- notification_preferences only ever controls email/sms/push.
create table public.in_app_notifications (
  id uuid primary key default gen_random_uuid (),
  profile_id uuid not null references auth.users (id) on delete cascade,

  -- Nullable: an in-app notification is meant to generalize past monitor
  -- transitions eventually (this migration's caller is the first, not the
  -- only, consumer), so the row doesn't hard-require one.
  transition_id uuid references public.monitor_transitions (id) on delete set null,

  symbol text not null,
  -- Mirrors EntitledAlertPayload/EntitledInvalidationPayload's `verdict`
  -- (lib/entitlements/delivery.ts) rather than restating a parallel enum.
  verdict text not null check (verdict in ('Execute', 'INVALIDATED')),
  title text not null,
  body text not null,

  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index in_app_notifications_profile_unread_idx
  on public.in_app_notifications (profile_id, created_at desc)
  where read_at is null;

create index in_app_notifications_profile_created_idx
  on public.in_app_notifications (profile_id, created_at desc);

alter table public.in_app_notifications enable row level security;

-- Read-only for the owning member -- same "clients must not insert/update"
-- rule 0036's own header states for the entitlement tables this pairs with.
-- Marking a notification read and inserting a new one both go through
-- server routes using the service-role client, which bypasses RLS after
-- verifying the caller's identity itself (app/api/notifications/route.ts).
create policy "own in-app notifications (read only)" on public.in_app_notifications
  for select using (auth.uid () = profile_id);

-- Rollback: `drop table if exists public.in_app_notifications;`
