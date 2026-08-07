-- daily_scans: a published row is a trade plan, or it is not a row.
--
-- The four price columns were nullable, so a scan that produced no armed
-- pattern on the execution timeframe was still ranked and stored with entry,
-- stop_loss, take_profit_1 and master_profit all null. The dashboard rendered
-- those as a scored setup with four em-dashes where the prices belong — a
-- symbol you were told to watch, with nothing to place.
--
-- The scan pipeline now filters those out before ranking and again before
-- insert. This is the backstop: the shape is enforced by the table, so no
-- future writer can reintroduce it.

-- Rows written before the filter existed. Ranks are left as-is afterwards;
-- gaps in the sequence are harmless (the unique key is on the rank, and the
-- lists are read in rank order, not by rank value).
delete from public.daily_scans
where entry is null
   or stop_loss is null
   or take_profit_1 is null
   or master_profit is null;

alter table public.daily_scans
  alter column entry set not null,
  alter column stop_loss set not null,
  alter column take_profit_1 set not null,
  alter column master_profit set not null;
