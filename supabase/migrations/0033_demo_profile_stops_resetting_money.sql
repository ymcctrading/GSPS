-- The showcase demo profile no longer wipes its own trades/cash daily — see
-- lib/demo/reset.ts and lib/demo/auto-trade.ts. It now trades automatically
-- and its balance is meant to compound like any real account's, so
-- `paper_accounts.demo_reset_date` (added in 0032 to track the last daily
-- wipe) has nothing left to record.
--
-- Rollback
-- --------
-- `alter table public.paper_accounts add column if not exists demo_reset_date date;`
-- Additive; no data is recoverable since the column's values were never
-- meaningful outside the wipe logic this removes.

alter table public.paper_accounts
  drop column if exists demo_reset_date;
