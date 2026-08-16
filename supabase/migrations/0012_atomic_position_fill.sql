-- Closes the position-write race documented in lib/brokers/simulator.ts:
-- executeFill previously read the open position, computed the new state in
-- application code, then wrote it back — two fills for the same user+symbol
-- landing close together (a resting order filling on one poll while a fresh
-- order for it is submitted on another) could both read the same starting
-- quantity and one write would clobber the other's. Cash was already fixed
-- this way in migration 0011; this does the same for the position row,
-- using `for update` to lock it for the duration of the fill so a second
-- concurrent call waits and then sees the first call's result rather than
-- racing it.
--
-- Mirrors lib/brokers/simulator.ts's `applyFill` exactly — same-direction
-- fills blend into the average entry, opposing fills reduce/flatten/flip.
--
-- Rollback: `drop function if exists public.execute_position_fill(uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, uuid);`
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
begin
  select * into v_existing
  from public.positions
  where user_id = p_user_id and symbol = upper(p_symbol) and closed = false
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
  v_closed := jsonb_build_object(
    'qty', v_closing_qty,
    'entryPrice', v_existing.avg_entry_price,
    'exitPrice', p_price,
    'realizedPl', v_per_share * v_closing_qty,
    'openedAt', v_existing.opened_at
  );

  v_remaining := v_existing.qty - p_qty;

  if v_remaining > 1e-9 then
    update public.positions
    set qty = v_remaining, updated_at = now()
    where id = v_existing.id;
  elsif v_remaining < -1e-9 then
    -- The fill overshot what was held — flat, then flipped to the opposite
    -- side for the leftover quantity, priced at this fill.
    update public.positions
    set side = v_fill_direction, qty = -v_remaining, avg_entry_price = p_price, updated_at = now()
    where id = v_existing.id;
  else
    update public.positions
    set closed = true, closed_at = now(), realized_pl = v_per_share * v_closing_qty
    where id = v_existing.id;
  end if;

  return jsonb_build_object('positionId', v_existing.id, 'closed', v_closed);
end;
$$;
