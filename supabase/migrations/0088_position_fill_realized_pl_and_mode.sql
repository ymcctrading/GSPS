-- Forward fix to execute_position_fill (0012). Two defects (review R-017):
--
-- 1. realized_pl recorded only the final closing fill. A position reduced in
--    steps (a partial sell, then the rest) kept the P&L of the last step
--    alone, and a fill that flipped the position re-used the row as the
--    opposite side, so the side it closed never reached a closed row at all.
--    The only reader is the promotion track record (lib/promotion/readiness.ts),
--    which sums realized_pl and divides it by qty × risk. Now each reducing
--    fill adds to realized_pl, and a flip closes the old row and opens a new
--    one for the remainder at the fill price. The closed row keeps the
--    quantity it held before its last reduction, as before; the R-multiple
--    in readiness.ts reads the per-share figure, so it is unchanged for a
--    position closed in one fill.
-- 2. The open-position lookup had no mode filter, so a paper fill could
--    reduce or blend into a live position row for the same symbol (the live
--    sync writes mode = 'live' rows, lib/portfolio/reconcile.ts). This RPC
--    writes paper rows only, so it now reads paper rows only.
--
-- No closed paper position existed in production when this was written
-- (2026-10-21), so nothing needs back-filling.
--
-- Rollback: re-run the function body from 0012_atomic_position_fill.sql.
create or replace function public.execute_position_fill(
  p_user_id uuid,
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
  v_existing record;
  v_fill_direction text := case when p_side = 'buy' then 'long' else 'short' end;
  v_position_id uuid;
  v_closed jsonb;
  v_new_qty numeric;
  v_new_avg numeric;
  v_remaining numeric;
  v_per_share numeric;
  v_closing_qty numeric;
  v_step_pl numeric;
begin
  select * into v_existing
  from public.positions
  where user_id = p_user_id and symbol = upper(p_symbol) and closed = false and mode = 'paper'
  order by opened_at desc
  limit 1
  for update;

  if not found then
    insert into public.positions (
      user_id, mode, symbol, asset_class, side, qty, avg_entry_price,
      stop_loss, take_profit, master_profit, scan_result_id, closed, opened_at
    ) values (
      p_user_id, 'paper', upper(p_symbol), p_asset_class, v_fill_direction, p_qty, p_price,
      p_stop_loss, p_take_profit, p_master_profit, p_scan_result_id, false, now()
    )
    returning id into v_position_id;

    return jsonb_build_object('positionId', v_position_id, 'closed', null);
  end if;

  if v_existing.side = v_fill_direction then
    v_new_qty := v_existing.qty + p_qty;
    v_new_avg := (v_existing.avg_entry_price * v_existing.qty + p_price * p_qty) / v_new_qty;

    update public.positions
    set qty = v_new_qty, avg_entry_price = v_new_avg, updated_at = now()
    where id = v_existing.id;

    return jsonb_build_object('positionId', v_existing.id, 'closed', null);
  end if;

  -- Opposing fill: reduces, flattens, or flips the existing position.
  v_closing_qty := least(v_existing.qty, p_qty);
  v_per_share := case
    when v_existing.side = 'long' then p_price - v_existing.avg_entry_price
    else v_existing.avg_entry_price - p_price
  end;
  v_step_pl := v_per_share * v_closing_qty;
  v_closed := jsonb_build_object(
    'qty', v_closing_qty,
    'entryPrice', v_existing.avg_entry_price,
    'exitPrice', p_price,
    'realizedPl', v_step_pl,
    'openedAt', v_existing.opened_at
  );

  v_remaining := v_existing.qty - p_qty;

  if v_remaining > 1e-9 then
    update public.positions
    set qty = v_remaining, realized_pl = coalesce(realized_pl, 0) + v_step_pl, updated_at = now()
    where id = v_existing.id;
    v_position_id := v_existing.id;
  elsif v_remaining < -1e-9 then
    -- The fill overshot what was held: the old side closes on its own row,
    -- and the leftover opens a new position on the fill's side at its price.
    update public.positions
    set closed = true, closed_at = now(), realized_pl = coalesce(realized_pl, 0) + v_step_pl, updated_at = now()
    where id = v_existing.id;

    insert into public.positions (
      user_id, mode, symbol, asset_class, side, qty, avg_entry_price,
      stop_loss, take_profit, master_profit, scan_result_id, closed, opened_at
    ) values (
      p_user_id, 'paper', upper(p_symbol), p_asset_class, v_fill_direction, -v_remaining, p_price,
      p_stop_loss, p_take_profit, p_master_profit, p_scan_result_id, false, now()
    )
    returning id into v_position_id;
  else
    update public.positions
    set closed = true, closed_at = now(), realized_pl = coalesce(realized_pl, 0) + v_step_pl, updated_at = now()
    where id = v_existing.id;
    v_position_id := v_existing.id;
  end if;

  return jsonb_build_object('positionId', v_position_id, 'closed', v_closed);
end;
$$;
