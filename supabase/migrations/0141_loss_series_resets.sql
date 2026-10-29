-- A reset of the losing-streak pause (lib/risk/lossSeries.ts).
--
-- The pause after three losses in a row reads the member's closed trades.
-- A row here marks where the series is read from: losses that closed at or
-- before `reset_at` no longer count toward it, and a new series after it
-- pauses as before. Nothing is deleted from trade_logs (closed trades are
-- kept indefinitely). Written only by an operator with the service role, on
-- the owner's word, with the reason recorded; a member can read their own.
-- First use 2026-10-29: the owner's three test accounts, for that day's tests.

create table if not exists public.loss_series_resets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reset_at timestamptz not null default now(),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.loss_series_resets enable row level security;

drop policy if exists loss_series_resets_select_own on public.loss_series_resets;
create policy loss_series_resets_select_own on public.loss_series_resets
  for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.loss_series_resets from anon, authenticated;
