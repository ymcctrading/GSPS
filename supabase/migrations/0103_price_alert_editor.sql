-- GSPS — 0103: the alert editor
--
-- Owner request, 2026-10-22: alerts beyond one price line, patterned on a
-- broker's alert editor. A member picks the field watched (last, bid, ask,
-- mark, the last completed close, net or % change, the day's high or low,
-- volume), the comparison (>=, <=, >, <) and the threshold, optionally taken
-- from a level on the chart (lib/alerts/rules.ts), with a note and an expiry.
--
-- `target_price` stays the threshold column, so the chart line's rows read as
-- before; net and % change may be zero or negative, so its "above zero" check
-- is narrowed to the price fields. `direction` stays and is written from the
-- comparison (>=, > are "above"), so the old readers keep working.
-- `comparator` is backfilled from `direction` and left nullable, so the chart
-- code deployed before this migration can still insert its rows (readers take
-- a null comparator from `direction`).
-- `origin` keeps the chart's one draggable line ("chart") apart from the
-- editor's alerts, so moving the line no longer replaces them.
-- The bell takes fired alerts as verdict 'Price alert'.
--
-- Apply BEFORE the code that reads these columns is deployed: until then the
-- sweep's select fails and no alert fires.
--
-- Forward-only: no earlier migration is edited.
--
-- Rollback:
--   delete from public.in_app_notifications where verdict = 'Price alert';
--   alter table public.in_app_notifications drop constraint in_app_notifications_verdict_check;
--   alter table public.in_app_notifications add constraint in_app_notifications_verdict_check
--     check (verdict in ('Execute', 'INVALIDATED', 'Intraday'));
--   delete from public.custom_price_alerts where origin = 'editor';
--   alter table public.custom_price_alerts drop constraint custom_price_alerts_threshold_check;
--   alter table public.custom_price_alerts add constraint custom_price_alerts_target_price_check check (target_price > 0);
--   alter table public.custom_price_alerts drop column field, drop column comparator, drop column origin,
--     drop column level_source, drop column note, drop column expires_at, drop column triggered_value;

alter table public.custom_price_alerts
  add column field text not null default 'last'
    check (field in ('last', 'bid', 'ask', 'mark', 'close', 'net_change', 'pct_change', 'day_high', 'day_low', 'volume')),
  add column comparator text check (comparator in ('>=', '<=', '>', '<')),
  add column origin text not null default 'chart' check (origin in ('chart', 'editor')),
  add column level_source text check (char_length(level_source) <= 80),
  add column note text check (char_length(note) <= 140),
  add column expires_at timestamptz,
  add column triggered_value numeric;

update public.custom_price_alerts
  set comparator = case when direction = 'above' then '>=' else '<=' end
  where comparator is null;

alter table public.custom_price_alerts drop constraint if exists custom_price_alerts_target_price_check;

alter table public.custom_price_alerts add constraint custom_price_alerts_threshold_check
  check (field in ('net_change', 'pct_change') or (field = 'volume' and target_price >= 0) or target_price > 0);

alter table public.in_app_notifications drop constraint if exists in_app_notifications_verdict_check;

alter table public.in_app_notifications add constraint in_app_notifications_verdict_check
  check (verdict in ('Execute', 'INVALIDATED', 'Intraday', 'Price alert'));
