-- Guided Decision Mode: the recommendation ledger, and an honest set of
-- protocol defaults.
--
-- Why this exists
-- ---------------
-- Guided Mode shows one recommended action per symbol, sized for the user, and
-- asks them to confirm it with a single tap. The user no longer sees the score
-- or the levels, which means the only way to ever answer "is the simplified
-- flow steering novices toward good outcomes" is to record what was put in
-- front of them — every recommendation *shown*, not only the ones acted on.
-- A ledger of acted-on trades alone cannot distinguish "Guided Mode recommends
-- good trades" from "users happened to tap the good ones".
--
-- So one row is written the moment a recommendation is rendered, carrying the
-- verdict and the exact plan it was rendered from, and that row is later
-- resolved to executed / dismissed / expired. The columns deliberately mirror
-- what `daily_scans` and `orders` already store, so the existing Backtest-style
-- expectancy analysis can be pointed at this stream without a translation layer.
--
-- `agreed_*` levels are the ones the card showed. Submission re-scans the
-- symbol and refuses if the plan has moved (see lib/guided/eligibility.ts), and
-- these are what that comparison is made against — the user agreed to the trade
-- they read, not to whatever the symbol is doing at submission time.
--
-- Rollback
-- --------
-- `drop table if exists public.guided_recommendations;` and re-apply the old
-- `settings` defaults (2 and 3). Both are additive/metadata-only: no existing
-- row is rewritten, and dropping the table loses only the audit stream.

-- ============ guided_recommendations ============
create table if not exists public.guided_recommendations (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,

  symbol text not null,
  asset_class text not null default 'us_equity' check (asset_class in ('us_equity', 'crypto')),
  -- Long only at launch: short entries are not bracketed at the broker, so a
  -- recommended short would carry no enforced stop. The constraint is here so
  -- the database says so too, not only the application.
  side text not null default 'buy' check (side = 'buy'),

  -- The verdict at the moment of surfacing, kept even after the setup changes.
  score numeric not null,
  verdict text not null,
  setup_kind text check (setup_kind in ('reversion', 'continuation')),
  pattern_name text,

  -- The plan the card was rendered from, and agreed to.
  agreed_entry numeric not null,
  agreed_stop_loss numeric not null,
  agreed_take_profit_1 numeric not null,
  agreed_master_profit numeric not null,

  -- The size Guided Mode computed, and what it means in dollars. Stored rather
  -- than recomputed: equity moves, and the figure the user was shown is the one
  -- the audit has to be able to reproduce.
  qty int not null check (qty > 0),
  risk_usd numeric not null,
  reward_usd numeric not null,
  notional_usd numeric not null,
  equity_at_surface numeric not null,
  risk_pct numeric not null,

  -- The plain-English line shown on the card.
  reason text,

  shown_at timestamptz not null default now(),
  -- A recommendation is single-use and short-lived; nothing here is a standing
  -- authorization to trade.
  expires_at timestamptz not null,

  status text not null default 'shown'
    check (status in ('shown', 'executed', 'dismissed', 'expired')),
  resolved_at timestamptz,
  -- Set when the tap was refused at submission (de-armed, re-priced, cap hit).
  resolution_note text,
  order_id uuid references public.orders (id) on delete set null,

  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists guided_recs_user_idx
  on public.guided_recommendations (user_id, shown_at desc);
create index if not exists guided_recs_status_idx
  on public.guided_recommendations (user_id, status, shown_at desc);
create index if not exists guided_recs_symbol_idx
  on public.guided_recommendations (symbol, shown_at desc);

alter table public.guided_recommendations enable row level security;

-- Dropped first so the whole migration is re-runnable: every other statement
-- here is `if not exists`, and a bare `create policy` would be the one line
-- that fails on a second application.
drop policy if exists "own guided recommendations" on public.guided_recommendations;
create policy "own guided recommendations" on public.guided_recommendations
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ settings: protocol defaults that match the engine ============
-- `tp1_r_multiple` defaulted to 2 and `master_r_multiple` to 3. The engine has
-- never priced either at those numbers: `computeTradeLevels` uses 1.5R for TP1
-- and the asset class's runner multiple (2.5R equities, 3R crypto) for the
-- master target, stepped out to a structural level when one is in range. The
-- defaults are corrected here so a column nobody has customised stops
-- describing a protocol that does not exist. Existing rows are left alone —
-- a user who has set a value has set it.
alter table public.settings
  alter column tp1_r_multiple set default 1.5,
  alter column master_r_multiple set default 2.5;

comment on column public.settings.stop_pct_min is
  'Lower bound of the option-premium stop band, in percent of premium. Share entries use a structural stop capped at a multiple of the execution-timeframe ATR instead — see lib/strat/levels.ts.';
comment on column public.settings.stop_pct_max is
  'Upper bound of the option-premium stop band, in percent of premium.';
