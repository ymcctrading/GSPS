-- GSPS — 0155: the mirror's live account beside its paper one
--
-- Owner, 2026-11-12: a $30 live Alpaca account as a real-money test of the
-- system from Nov 13 (lib/brokers/paper-mirror.ts, runLiveMirror). The live
-- mirror keeps its lines and its order log in the same tables as the paper
-- mirror, told apart by `mode`, and takes its own run lease (lock row 2).
--
-- DEPLOY ORDER: apply before the code that reads and writes it is deployed.
-- Additive: existing rows become mode 'paper'.
--
-- Server-only, as 0154: RLS on, no policy. No public record is kept.
--
-- Rollback:
--   delete from public.paper_mirror_lock where id = 2;
--   alter table public.paper_mirror_lock drop constraint paper_mirror_lock_id_check,
--     add constraint paper_mirror_lock_id_check check (id = 1);
--   delete from public.paper_mirror_lines where mode = 'live';
--   alter table public.paper_mirror_lines drop constraint paper_mirror_lines_pkey,
--     add primary key (position_id);
--   alter table public.paper_mirror_lines drop column mode, drop column scale;
--   alter table public.paper_mirror_events drop column mode;

alter table public.paper_mirror_lines
  add column if not exists mode text not null default 'paper' check (mode in ('paper', 'live')),
  -- a live line's opening size as a fraction of the simulator's
  add column if not exists scale numeric;

alter table public.paper_mirror_lines drop constraint if exists paper_mirror_lines_pkey;
alter table public.paper_mirror_lines add constraint paper_mirror_lines_pkey primary key (position_id, mode);

alter table public.paper_mirror_events
  add column if not exists mode text not null default 'paper' check (mode in ('paper', 'live'));

create index if not exists paper_mirror_events_mode_created_idx
  on public.paper_mirror_events (mode, created_at desc);

alter table public.paper_mirror_lock drop constraint if exists paper_mirror_lock_id_check;
alter table public.paper_mirror_lock add constraint paper_mirror_lock_id_check check (id in (1, 2));
insert into public.paper_mirror_lock (id) values (2) on conflict (id) do nothing;
