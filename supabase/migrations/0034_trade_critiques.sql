-- A short LLM-written critique per closed trade, for accounts whose trades
-- are placed by the app itself rather than by a person tapping Buy/Sell —
-- the showcase demo profile today (lib/demo/auto-trade.ts), and any future
-- paid automated account. One row per finished trade_logs entry: why it was
-- taken, how it played out.
--
-- A separate table, not a column on trade_logs, on purpose: trade_logs is
-- shared by every user's manual trading too, and a critique only exists for
-- the sliver of trades an automated account placed — bolting a nullable
-- column onto the shared table for a feature almost no row will ever use is
-- exactly the "junk drawer" outcome lib/onboarding/status.ts's own comment
-- warns against for settings.prefs. This keeps trade_logs untouched.
--
-- Rollback
-- --------
-- `drop table if exists public.trade_critiques;`
-- Additive; no existing table or column is touched.

create table public.trade_critiques (
  id uuid primary key default gen_random_uuid (),
  trade_log_id uuid not null unique references public.trade_logs (id) on delete cascade,
  -- Denormalized from trade_logs.user_id so RLS here is the same one-line
  -- "own rows" policy every other per-user table in this app uses, without
  -- a join through trade_logs on every read.
  user_id uuid not null references auth.users (id) on delete cascade,
  critique text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index trade_critiques_user_idx on public.trade_critiques (user_id, created_at desc);

alter table public.trade_critiques enable row level security;

create policy "own trade critiques" on public.trade_critiques
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);
