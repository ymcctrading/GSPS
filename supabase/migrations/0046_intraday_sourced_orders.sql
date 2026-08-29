-- Tags an order as opened from the intraday alerts panel's "Trade this"
-- action (see components/scan/intraday-alerts.tsx and
-- lib/trade/place-order.ts), as opposed to a manual ticket opened any other
-- way. This is the missing piece the intraday tier-promotion gates
-- (lib/promotion/pro-intraday.ts) need: nothing else in the app previously
-- recorded *why* an order was placed, so the entry/day, concurrent-position,
-- consecutive-loss, and daily-loss-lock gates had no signal to evaluate.
--
-- Deliberately a single boolean on `orders` rather than a copy on
-- `trade_logs` too: `trade_logs.order_id` already references the order that
-- opened the trade, so a join is enough to trace a closed trade back to
-- whether it was intraday-sourced (see lib/promotion/intraday-gate-query.ts).

alter table public.orders
  add column intraday_sourced boolean not null default false;

-- Gate queries filter to one user's intraday-sourced orders within a trading
-- day, so the composite index leads with the columns that narrow the most.
create index orders_intraday_sourced_idx
  on public.orders (user_id, intraday_sourced, created_at desc)
  where intraday_sourced = true;
