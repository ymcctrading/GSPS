-- Which levels a trade was placed on (owner, 2026-10-28: "allow for an option
-- to trade the swing plan, the intraday plan, or use the users own sl, tp1,
-- and mtp levels"). The order ticket's choice, kept with the trade so the
-- position cards, their Edit flow and the notices about a held symbol read the
-- same thing (lib/trade/level-source.ts).
--
-- Null for every existing order, and for an order with no levels attached;
-- readers fall back to intraday_sourced (the intraday plan) and source_plan_id
-- (an automated trade, the swing plan). How a trade is managed is unchanged:
-- the exit managers still read intraday_sourced and the stored levels.

alter table public.orders
  add column level_source text
    check (level_source is null or level_source in ('swing', 'intraday', 'own'));
