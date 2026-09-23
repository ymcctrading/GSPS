-- Durable, cross-device custom price alerts. Closes the gap ROADMAP.md's
-- "Dashboard welcome banner, saved setups, chart pane glossary, typed price
-- alerts" note names explicitly: the chart's drag-to-set price alert
-- (components/chart/candles.tsx) was client-side/localStorage only — gone
-- the moment the tab closed or the same account was opened on another
-- device — and lib/entitlements/policy.ts's maxCustomAlertRules entitlement
-- limit was already reserved with no table or UI behind it.
--
-- `direction` is resolved once at creation time from the live price then
-- ("above" if the target sits above the current price, "below" otherwise)
-- rather than re-derived at check time, so the sweep (app/api/price-alerts/
-- sweep) has a stable crossing rule to test against regardless of how the
-- price has since moved around before finally crossing it.

create table public.custom_price_alerts (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  target_price numeric not null check (target_price > 0),
  direction text not null check (direction in ('above', 'below')),
  triggered boolean not null default false,
  triggered_at timestamptz,
  created_at timestamptz not null default now()
);

create index custom_price_alerts_user_id_idx on public.custom_price_alerts (user_id);

-- The sweep's own read pattern: every untriggered row, grouped by symbol.
create index custom_price_alerts_untriggered_symbol_idx
  on public.custom_price_alerts (symbol)
  where not triggered;

alter table public.custom_price_alerts enable row level security;

create policy "own custom price alerts" on public.custom_price_alerts
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);
