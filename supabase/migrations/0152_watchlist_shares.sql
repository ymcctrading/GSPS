-- GSPS: shared watchlists (Q3 plan item 7, docs/Q3_PLAN.md; lib/watchlist/share.ts).
--
-- A member shares their Dashboard list by an unguessable link. The owner picks
-- who may open it (owner, 2026-11-09, "Both"): 'link' (anyone with the link)
-- or 'members' (only members the owner approves). One share per list. What is
-- shared is the list's symbols, read live, never trades or calls.
--
-- Row security: the owner reads and changes their own share and decides its
-- requests; a requester reads only their own request row. Requests are written
-- by the server (service role) after it has checked the share, since a
-- requester can't read the share's row to name it.
--
-- Rollback
-- --------
-- `drop table if exists public.watchlist_share_members; drop table if exists public.watchlist_shares;`
-- Additive; no existing table or column is touched.

create table if not exists public.watchlist_shares (
  id uuid primary key default gen_random_uuid (),
  watchlist_id uuid not null unique references public.watchlists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{32,64}$'),
  access text not null check (access in ('link', 'members')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists watchlist_shares_user_idx on public.watchlist_shares (user_id);

alter table public.watchlist_shares enable row level security;

create policy "read own watchlist shares" on public.watchlist_shares
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "create own watchlist shares" on public.watchlist_shares
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid()))
  );

create policy "change own watchlist shares" on public.watchlist_shares
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid()))
  );

create policy "remove own watchlist shares" on public.watchlist_shares
  for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.watchlist_share_members (
  share_id uuid not null references public.watchlist_shares (id) on delete cascade,
  member_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (share_id, member_id)
);

create index if not exists watchlist_share_members_member_idx on public.watchlist_share_members (member_id);

alter table public.watchlist_share_members enable row level security;

create policy "read own requests or own share's requests" on public.watchlist_share_members
  for select to authenticated using (
    (select auth.uid()) = member_id
    or exists (select 1 from public.watchlist_shares s where s.id = share_id and s.user_id = (select auth.uid()))
  );

create policy "owner decides requests" on public.watchlist_share_members
  for update to authenticated
  using (exists (select 1 from public.watchlist_shares s where s.id = share_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from public.watchlist_shares s where s.id = share_id and s.user_id = (select auth.uid())));

create policy "owner removes requests" on public.watchlist_share_members
  for delete to authenticated using (
    exists (select 1 from public.watchlist_shares s where s.id = share_id and s.user_id = (select auth.uid()))
  );
