-- A plain read-then-write cash update races: two fills landing close together
-- (a market order from POST /api/orders and a resting-order fill picked up on
-- the same poll, say) can both read the same starting balance and one write
-- clobbers the other. This does the increment inside a single statement
-- instead, so concurrent fills for the same user serialize on the row rather
-- than racing in application code.
--
-- Rollback: `drop function if exists public.increment_paper_cash(uuid, numeric);`
create or replace function public.increment_paper_cash(p_user_id uuid, p_delta numeric)
returns numeric
language sql
security invoker
set search_path = public
as $$
  update public.paper_accounts
  set cash = cash + p_delta, updated_at = now()
  where user_id = p_user_id
  returning cash;
$$;
