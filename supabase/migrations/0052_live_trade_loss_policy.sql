-- Live-only per-trade loss cascade and stop-override friction, per the
-- "GSPS Implementation Brief" single-source-of-truth spec pack (2026-08-31).
-- Applies exclusively when execution_mode = live; never to paper trading.
--
-- risk_trade_loss_state tracks, per open LIVE position (public.positions.id
-- is the stable per-trade identifier), which loss thresholds have already
-- been notified -- "send email and phone/SMS notification once per
-- threshold per trade," not on every poll.
--
-- live_stop_overrides is the widen/remove request/approval record: "Wall
-- Street member may widen or remove [the default stop] only after a
-- high-friction warning, verified email delivery, verified phone/SMS
-- delivery." This repo has no SMS provider today (lib/notifications only
-- wraps Resend email) -- `verified_phone` therefore starts, and stays,
-- false until a real channel exists; `verified_email` is the one this
-- migration's application code can actually satisfy.
--
-- live_trading_restrictions is the account-level "restrict live trading
-- until GSPS School completion/re-completion" gate from the 50% loss
-- event. No GSPS School curriculum exists in this repo -- this is
-- deliberately a policy hook (a restriction flag + a completion
-- timestamp), not fabricated course content. See docs/GSPS_AUTOMATION.md.
--
-- Rollback: drop table if exists public.live_trading_restrictions;
--           drop table if exists public.live_stop_overrides;
--           drop table if exists public.risk_trade_loss_state;

create table if not exists public.risk_trade_loss_state (
  position_id uuid primary key references public.positions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  notified_thresholds integer[] not null default '{}',
  paused_at timestamptz,
  flatten_attempted_at timestamptz,
  flatten_order_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.risk_trade_loss_state enable row level security;

create policy "own trade loss state (read only)" on public.risk_trade_loss_state
  for select using (auth.uid () = user_id);

create table if not exists public.live_stop_overrides (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  action text not null check (action in ('widen', 'remove')),
  requested_new_stop numeric,
  warning_acknowledged boolean not null default false,
  verified_email boolean not null default false,
  -- Always false today -- no SMS/phone provider exists in this repo. See
  -- header note. A future channel flips the default and the gate below.
  verified_phone boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'expired')),
  verification_token text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists live_stop_overrides_position_idx
  on public.live_stop_overrides (position_id, requested_at desc);

alter table public.live_stop_overrides enable row level security;

create policy "own stop overrides (read only)" on public.live_stop_overrides
  for select using (auth.uid () = user_id);

create table if not exists public.live_trading_restrictions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  restricted boolean not null default false,
  reason text,
  restricted_at timestamptz,
  school_completed_at timestamptz,
  lifted_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.live_trading_restrictions enable row level security;

create policy "own live trading restriction (read only)" on public.live_trading_restrictions
  for select using (auth.uid () = user_id);
