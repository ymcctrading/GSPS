-- Web Push subscriptions -- one row per browser/device a member has opted in
-- on, so an alert can reach a phone's own notification tray the way any
-- other app's does.
--
-- Closes the gap ROADMAP.md recorded as backlog rather than built: "there is
-- no push channel today (`dispatchNotificationDelivery` in
-- lib/entitlements/delivery.ts explicitly rejects every channel but
-- "email", and there is no service worker, manifest, or push SDK anywhere in
-- the repo)". Browser push is a named Q1 initiative ("Notification system --
-- email, SMS, and browser push for high-confidence alerts"), so this is
-- in-phase work, not a deviation.
--
-- Why a table per subscription rather than a column on
-- notification_preferences: the W3C Push API issues one endpoint per
-- (browser, device, origin) triple, and a member on a phone and a laptop has
-- two. `notification_preferences.push_enabled` stays what it already is --
-- the member's intent -- and these rows are the transport addresses that
-- intent resolves to. One without the other delivers nothing: intent with no
-- subscription has nowhere to send, a subscription with the toggle off must
-- not be sent to.
--
-- `endpoint` is the natural key. A re-subscribe on the same device returns
-- the same endpoint with rotated keys, so the unique constraint plus an
-- upsert is what keeps that from accumulating duplicate rows that would each
-- deliver the same notification to one tray.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid (),
  profile_id uuid not null references auth.users (id) on delete cascade,

  -- The push service's own URL for this device (FCM, Mozilla autopush, Apple).
  endpoint text not null unique,
  -- The two client-generated encryption keys from PushSubscription.toJSON().
  -- Payloads are encrypted to these; they are useless to anyone else, but they
  -- are still per-member data and RLS keeps them owner-scoped.
  p256dh text not null,
  auth text not null,

  -- Diagnostics only: which device a member is looking at in Settings when
  -- several are listed, and a hint when one stops delivering.
  user_agent text,

  created_at timestamptz not null default now(),
  -- Set on a successful send; a push service that reports the subscription
  -- gone (404/410) gets its row deleted rather than stamped, so a stale row
  -- is pruned at the point it is observed dead instead of lingering as a
  -- permanent failure the dispatcher keeps retrying.
  last_success_at timestamptz
);

create index push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

-- A member may read and delete their own device registrations (Settings
-- lists them and can revoke one). Inserts and updates go through the server
-- routes on the service-role client, which verify the caller's identity
-- themselves -- same rule migrations 0036 and 0067 state for the tables
-- this pairs with: clients must not write delivery state directly.
create policy "own push subscriptions (read)" on public.push_subscriptions
  for select using (auth.uid () = profile_id);

create policy "own push subscriptions (delete)" on public.push_subscriptions
  for delete using (auth.uid () = profile_id);

-- Rollback: `drop table if exists public.push_subscriptions;`
