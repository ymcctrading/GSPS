-- GSPS: a card's second target and master take profit (owner, 2026-11-11),
-- and the schedule of the engine's card job (/api/cards/edge, 12 parts).
--
-- Owner, 14:50 UTC: "Tp1 closest / Tp2 strongest / Mtp Largest profit". TP1
-- still decides the call (good when reached before the stop); TP2 and MTP are
-- shown on the card for members who hold for more, and are null for a kind
-- that has none (the strategy modes' cards carry TP1 only).
--
-- Additive and nullable: existing rows and the nightly job's current writes
-- are unchanged.
--
-- The engine reads each stock's whole daily history (about 0.2 s a stock), so
-- the 832-stock universe is read in 12 parts (lib/cards/edgeCard.ts
-- EDGE_PARTS), one call every 4 minutes from 22:00 UTC on weekdays (5 PM ET
-- in winter, an hour after the close), each about 25 to 30 s (measured
-- 2026-11-11: 104 stocks took 16 s to read and 22 s to compute). The nightly
-- cards job (22:20 UTC) walks these cards with the rest from the next night.
--
-- Rollback:
--   select cron.unschedule(j) from unnest(array[
--     'gsps-card-edge-0','gsps-card-edge-1','gsps-card-edge-2','gsps-card-edge-3','gsps-card-edge-4','gsps-card-edge-5',
--     'gsps-card-edge-6','gsps-card-edge-7','gsps-card-edge-8','gsps-card-edge-9','gsps-card-edge-10','gsps-card-edge-11']) j;
--   alter table public.card_calls drop column if exists tp2, drop column if exists mtp;

alter table public.card_calls
  add column if not exists tp2 numeric,
  add column if not exists mtp numeric;

select cron.schedule('gsps-card-edge-0', '0 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/cards/edge?part=0')$$);
select cron.schedule('gsps-card-edge-1', '4 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/cards/edge?part=1')$$);
select cron.schedule('gsps-card-edge-2', '8 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/cards/edge?part=2')$$);
select cron.schedule('gsps-card-edge-3', '12 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/cards/edge?part=3')$$);
select cron.schedule('gsps-card-edge-4', '16 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/cards/edge?part=4')$$);
select cron.schedule('gsps-card-edge-5', '20 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/cards/edge?part=5')$$);
select cron.schedule('gsps-card-edge-6', '24 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/cards/edge?part=6')$$);
select cron.schedule('gsps-card-edge-7', '28 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/cards/edge?part=7')$$);
select cron.schedule('gsps-card-edge-8', '32 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/cards/edge?part=8')$$);
select cron.schedule('gsps-card-edge-9', '36 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/cards/edge?part=9')$$);
select cron.schedule('gsps-card-edge-10', '40 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/cards/edge?part=10')$$);
select cron.schedule('gsps-card-edge-11', '44 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/cards/edge?part=11')$$);
