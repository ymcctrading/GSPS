-- GSPS — 0094: one paper fill in one transaction, and the strategy version on
-- every stored verdict, order and trade
--
-- Review findings S-08 and P-02 (2026-10-21).
--
-- S-08. `executeFill` (lib/brokers/simulator.ts) moved the paper cash
-- (`increment_paper_cash`) and then wrote the position
-- (`execute_position_fill`) as two calls. A failed position write left the
-- cash moved with no position behind it. `execute_paper_fill` does both in one
-- function, so they commit or roll back together. It is `security invoker`
-- like the two it calls, so RLS and the callers' grants are unchanged.
--
-- P-02. A stored scan, order or trade did not say which rules produced it, so
-- a result could not be read against the version it came from. Each now
-- carries `strategy_version` (lib/backtest/strategyVersion.ts), written by the
-- app. Nullable, no default: rows before this have no version on record, and
-- saying otherwise would be a guess.
--
-- Additive only. Apply before the code that writes these columns is merged.
-- Forward-only: no earlier migration is edited.
--
-- Rollback:
--   drop function if exists public.execute_paper_fill(uuid, numeric, text, text, text, numeric, numeric, numeric, numeric, numeric, uuid);
--   alter table public.daily_scans drop column if exists strategy_version;
--   alter table public.orders drop column if exists strategy_version;
--   alter table public.trade_logs drop column if exists strategy_version;

alter table public.daily_scans add column if not exists strategy_version text;
alter table public.orders add column if not exists strategy_version text;
alter table public.trade_logs add column if not exists strategy_version text;

create or replace function public.execute_paper_fill(
  p_user_id uuid,
  p_cash_delta numeric,
  p_symbol text,
  p_asset_class text,
  p_side text,
  p_qty numeric,
  p_price numeric,
  p_stop_loss numeric default null,
  p_take_profit numeric default null,
  p_master_profit numeric default null,
  p_scan_result_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cash numeric;
begin
  v_cash := public.increment_paper_cash(p_user_id, p_cash_delta);
  if v_cash is null then
    raise exception 'no paper account for user %', p_user_id;
  end if;
  return public.execute_position_fill(
    p_user_id, p_symbol, p_asset_class, p_side, p_qty, p_price,
    p_stop_loss, p_take_profit, p_master_profit, p_scan_result_id
  );
end;
$$;

revoke execute on function public.execute_paper_fill(uuid, numeric, text, text, text, numeric, numeric, numeric, numeric, numeric, uuid) from public, anon;
grant execute on function public.execute_paper_fill(uuid, numeric, text, text, text, numeric, numeric, numeric, numeric, numeric, uuid) to authenticated, service_role;
