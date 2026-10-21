-- GSPS — 0099: browser push subscriptions
--
-- ROADMAP.md Q1 "Notification system" (browser push), docs/SYNTHESIZED_ROADMAP.md
-- Part 5 item 2. One row per browser a member turned push on in. The endpoint
-- and its two keys are what a Web Push send needs (lib/notifications/web-push.ts).
-- `notification_preferences.push_enabled` (0022) stays the on/off switch; this
-- table only says where to send.
--
-- Members read and delete their own rows. Inserts and updates go through
-- /api/notifications/push-subscription on the service role, which names the
-- member from their session, so a member can never file a subscription under
-- another account.
--
-- Forward-only: no earlier migration is edited.
--
-- Rollback: drop table public.push_subscriptions;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);

create index if not exists push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

create policy "members read their own push subscriptions" on public.push_subscriptions
  for select using (auth.uid() = profile_id);

create policy "members delete their own push subscriptions" on public.push_subscriptions
  for delete using (auth.uid() = profile_id);

revoke insert, update on public.push_subscriptions from anon, authenticated;
