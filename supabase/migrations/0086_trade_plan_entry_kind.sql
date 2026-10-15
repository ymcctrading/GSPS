-- Which of Gann's buying points a trade plan is (PLAN.md item 5, step 2).
--
-- 'crossing': a close 3 points past the old top (bottom) arms it, and the
-- order rests 1 point past the level for the reaction (W006 pp.20, 46-47).
-- 'oldLevel': the order rests at the old bottom (top) itself, the double or
-- triple bottom, with nothing to arm (W006 pp.11, 20, 46).
--
-- Null means a crossing: every plan stored before this column existed is one,
-- and the code writes the column only for 'oldLevel'. The entry and stop alone
-- can't tell the two apart, which is why the kind is stored.
alter table public.trade_plans
  add column if not exists entry_kind text
  check (entry_kind is null or entry_kind in ('crossing', 'oldLevel'));
