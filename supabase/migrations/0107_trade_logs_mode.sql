-- GSPS — 0107: which account a trade log belongs to (review finding R-002)
--
-- trade_logs had no mode, so the paper account's profit peak (A-RISK-07,
-- *Tunnel Thru the Air* pp.198-199, `lib/risk/profitPeak.ts`) summed paper,
-- live and journal closes alike. Gann reads the tenth of the profits on the
-- capital of the account that made them, so the paper peak now reads paper
-- closes only. The series of losses and the winning run stay pooled: they are
-- rules about the trader's judgment, whichever account it showed in.
--
-- 'paper' and 'live' are written by the fill and exit paths, 'journal' by a
-- trade a person records through POST /api/trade-log. Backfill: every row
-- before this is paper. Production has never had a live order, position,
-- exit plan or equity snapshot (checked 2026-10-22), and nothing in the app
-- has ever posted a journal entry.
--
-- Forward-only. Rollback:
--   alter table public.trade_logs drop column if exists mode;

alter table public.trade_logs
  add column if not exists mode text check (mode in ('paper', 'live', 'journal'));

update public.trade_logs set mode = 'paper' where mode is null;

create index if not exists trade_logs_user_mode_exit_idx
  on public.trade_logs (user_id, mode, exit_timestamp)
  where exit_timestamp is not null;
