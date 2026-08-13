-- Staged protocol exits, and the state the exit manager needs to advance them.
--
-- Why this exists
-- ---------------
-- "Attach protocol levels" placed one bracket: the whole position left at TP1,
-- or the whole position left at the stop. The protocol does neither. It takes
-- 60% off at TP1, half of what is left at the master target, and runs the rest
-- behind a stop that ratchets to break-even and then trails.
--
-- Two of those rules can rest at the broker as orders, so they work while the
-- app is closed. The other two are *state-dependent* — where the trailing stop
-- belongs, and whether price has already pushed through the master target and
-- come back, depend on where the trade has been, not on where it is. That needs
-- durable state, which is what `protocol_exits` holds: one row per entry,
-- carrying the levels, the tranche sizes and their broker order ids, the best
-- price seen, and the protective stop currently resting.
--
-- The exit orders are attached *after* the entry fills rather than as a bracket
-- at submit time. Alpaca refuses a buy while a sell is working on the same
-- symbol ("potential wash trade detected"), so three bracketed entries for one
-- position would see the second and third rejected. The entry therefore carries
-- a single full-size stop, and the profit tranches are placed as sell-side
-- OCO orders once there is a position to attach them to.
--
-- Two more things guard against `GET /api/orders` running twice at once — a
-- second browser tab, or a request that outlives the polling interval:
--
--   * `attach_claimed_at` lets one pass claim the right to place a plan's exit
--     orders before it cancels the entry's stop, so a concurrent pass sees the
--     claim and skips the plan instead of placing two full sets of tranches.
--   * `trade_logs.exit_plan_id`, unique where not null, means the database —
--     not a check-then-insert race in application code — is what stops two
--     passes from logging the same finished trade twice.
--
-- Rollback
-- --------
-- `drop table if exists public.protocol_exits;` and
-- `alter table public.orders drop column if exists exit_plan_id;` and
-- `alter table public.trade_logs drop column if exists exit_plan_id;`. All
-- additive — no existing column is altered and no data is rewritten, so a
-- rollback loses the staged-exit state and leaves both ledgers untouched.
-- Resting broker orders are unaffected either way: they live at Alpaca, not
-- here, and a rollback strands them rather than cancelling them.

alter table public.orders
  -- The staged exit this entry belongs to. Null on orders placed without
  -- protocol levels.
  add column if not exists exit_plan_id uuid;

create table if not exists public.protocol_exits (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('long', 'short')),
  mode text not null default 'paper' check (mode in ('paper', 'live')),

  -- What was bought, and at what price the protocol's arithmetic was done
  -- against. `entry_price` starts as the submitted price and is corrected to
  -- the broker's average fill once one exists — break-even means the price the
  -- user actually paid, not the price they asked for.
  qty numeric not null,
  entry_price numeric not null,
  entry_order_id text,

  -- The levels this plan is executing.
  stop_loss numeric not null,
  take_profit_1 numeric not null,
  master_profit numeric,

  -- Tranche sizes, and the sell-side orders carrying them once the entry has
  -- filled and the exits have been attached. Null until then — `exits_attached_at`
  -- is what says the difference between "not yet" and "failed".
  scale_out_qty numeric not null default 0,
  master_qty numeric not null default 0,
  runner_qty numeric not null default 0,
  scale_out_order_id text,
  master_order_id text,
  runner_order_id text,
  exits_attached_at timestamptz,
  -- Set the moment a pass decides to attach this plan's exits, before it
  -- cancels the entry's stop or places anything — the claim a concurrent pass
  -- checks so it doesn't attach the same plan a second time. Cleared back to
  -- null if the attach fails outright, so a genuinely stuck claim (the process
  -- died mid-attach) is retried rather than parked forever; `manageProtocolExits`
  -- also re-claims a claim older than a couple of minutes for the same reason.
  attach_claimed_at timestamptz,

  -- Live state the stop rules read.
  -- `high_water` is the best price seen *as far as we have sampled it*: it is
  -- extended on every manage pass from the broker's mark. A sampled high can
  -- lag the true high, which can only ever leave the stop looser than the trade
  -- earned — never tighter than the rules allow.
  high_water numeric,
  applied_stop numeric,
  applied_stop_reason text
    check (applied_stop_reason is null or applied_stop_reason in
      ('protocol', 'break_even', 'trailing', 'master_reversal')),
  last_managed_at timestamptz,

  status text not null default 'working' check (status in ('working', 'closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The manage pass's read pattern: this user's working plans.
create index if not exists protocol_exits_working_idx
  on public.protocol_exits (user_id, status, created_at desc);

create index if not exists protocol_exits_symbol_idx
  on public.protocol_exits (user_id, symbol)
  where status = 'working';

alter table public.protocol_exits enable row level security;

create policy "own protocol exits" on public.protocol_exits
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- Settlement's read pattern: this user's trade logs still waiting on an exit
-- price. Partial, so the index stays small however long the log gets.
create index if not exists trade_logs_pending_idx
  on public.trade_logs (user_id, created_at)
  where outcome = 'pending';

alter table public.trade_logs
  -- The plan this row closes out, when one was involved. Not a foreign key to
  -- `orders` (a plan can outlive the specific entry order id it started from)
  -- — it points at the plan itself.
  add column if not exists exit_plan_id uuid references public.protocol_exits (id) on delete set null;

-- One trade log per finished plan. Two racing passes that both decide a plan
-- is done — a poll's `finish` and a manual close's `logClose` landing at
-- nearly the same moment — both attempt this insert; the loser gets a unique-
-- violation instead of a second row, and treats it as "already logged" rather
-- than retrying into a duplicate. Partial so it says nothing about the manual
-- closes that never had a plan (`exit_plan_id is null`), which are allowed to
-- repeat — a plain position can be closed, reopened and closed again.
create unique index if not exists trade_logs_exit_plan_unique_idx
  on public.trade_logs (exit_plan_id)
  where exit_plan_id is not null;
