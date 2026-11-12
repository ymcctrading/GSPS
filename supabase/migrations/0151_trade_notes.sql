-- GSPS: a member's own note on a closed trade (Q3 plan item 2, docs/Q3_PLAN.md).
--
-- One note per trade_logs row, written by the member who owns the trade. A
-- separate table, not a column on trade_logs, because trade_logs is the
-- ledger: since migration 0095 members may only read it, and every write goes
-- through the server's ledgerWriter (lib/supabase/ledger.ts, R-029). A note is
-- the member's words about the trade, not part of the ledger, so the member
-- writes it on their own session under row security. A note never changes the
-- trade it sits on, and deleting a note never touches the trade.
--
-- The method's rule behind it: keep a record of your trades and read it back
-- to find your own good and bad runs (ref: SRC-003 pp. 34-38).
--
-- Rollback
-- --------
-- `drop table if exists public.trade_notes;`
-- Additive; no existing table or column is touched.

create table if not exists public.trade_notes (
  id uuid primary key default gen_random_uuid (),
  trade_log_id uuid not null unique references public.trade_logs (id) on delete cascade,
  -- Denormalized from trade_logs.user_id so the policy reads one column; the
  -- insert check below proves the trade is the member's own.
  user_id uuid not null references auth.users (id) on delete cascade,
  note text not null check (char_length(note) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trade_notes_user_idx on public.trade_notes (user_id, updated_at desc);

alter table public.trade_notes enable row level security;

create policy "read own trade notes" on public.trade_notes
  for select to authenticated using ((select auth.uid()) = user_id);

-- A member may note only a trade that is theirs.
create policy "write own trade notes" on public.trade_notes
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.trade_logs t
      where t.id = trade_log_id and t.user_id = (select auth.uid())
    )
  );

create policy "edit own trade notes" on public.trade_notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.trade_logs t
      where t.id = trade_log_id and t.user_id = (select auth.uid())
    )
  );

create policy "delete own trade notes" on public.trade_notes
  for delete to authenticated using ((select auth.uid()) = user_id);
