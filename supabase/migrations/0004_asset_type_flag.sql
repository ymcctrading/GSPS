-- Strict asset-type flag for the order and position ledgers.
--
-- Both tables already carry `asset_class` ('us_equity' | 'option' / 'us_equity'
-- | 'crypto') as the canonical classification. `asset_type` is a generated
-- column derived from it rather than an independent value: two flags on the
-- same row that could disagree (one written, one forgotten) is a data-
-- integrity bug waiting to happen, and the UI only needs the coarser
-- EQUITY/OPTION split that `asset_class` already implies.

alter table public.orders
  add column if not exists asset_type text
    generated always as (
      case when asset_class = 'option' then 'OPTION' else 'EQUITY' end
    ) stored;

alter table public.positions
  add column if not exists asset_type text
    generated always as (
      case when asset_class = 'option' then 'OPTION' else 'EQUITY' end
    ) stored;

create index if not exists orders_asset_type_idx on public.orders (asset_type);
create index if not exists positions_asset_type_idx on public.positions (asset_type);
