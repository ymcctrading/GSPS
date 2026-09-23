-- Strategy Modes: a durable, cross-device default for which non-Gann
-- strategy (if any) a user wants entry/stop/target levels generated from,
-- alongside GSPS's own Gann-grounded verdict. See AGENTS.md's "Strategy
-- Modes" section and docs/STRATEGY_MODES.md.
--
-- One row per user, defaulting to 'gann' (i.e. no override — the existing
-- Gann trade plan is what's shown) when absent. `mode` is intentionally not
-- constrained to the current lib/strategies/registry.ts key set via a CHECK
-- (unlike custom_price_alerts' direction) — a mode can be added to the
-- registry without a migration, and an unrecognized stored value already
-- resolves safely to "no override" at the read site
-- (isNonGannStrategyMode()), the same fail-closed pattern
-- lib/scoring/active-weights.ts uses for an unrecognized learning_models row.

create table public.strategy_mode_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mode text not null default 'gann',
  updated_at timestamptz not null default now()
);

alter table public.strategy_mode_preferences enable row level security;

create policy "own strategy mode preference" on public.strategy_mode_preferences
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);
