-- Diagnostic log for the market scan's coarse pre-filter (lib/marketScan.ts).
-- One row per symbol per scan day, recording what the ATR-relative extension
-- and proximity checks measured and whether the symbol went on to a real
-- full-protocol score. Exists to calibrate the ATR-multiple thresholds
-- (EXTENSION_ATR_TIER1/TIER2, TRAVEL_ATR_MULT) against real outcomes instead
-- of the ratio-preserving guess they started as.
create table public.coarse_gate_telemetry (
  id uuid primary key default gen_random_uuid (),
  scan_date date not null,
  symbol text not null,
  direction text check (direction in ('bullish', 'bearish')),
  price numeric,
  atr_pct numeric,
  extension_pct numeric,
  extension_atr numeric,
  cleared_reversion boolean not null default false,
  reversion_score int,
  cleared_continuation boolean not null default false,
  continuation_score int,
  travel_pct numeric,
  travel_atr numeric,
  shortlisted boolean not null default false,
  full_scan_score int check (full_scan_score is null or full_scan_score between 0 and 9),
  full_scan_output_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scan_date, symbol)
);

create index coarse_gate_telemetry_date_idx on public.coarse_gate_telemetry (scan_date desc);

alter table public.coarse_gate_telemetry enable row level security;

-- readable by any signed-in user, same as daily_scans; written only by service role
create policy "coarse gate telemetry readable" on public.coarse_gate_telemetry
  for select using (auth.role () = 'authenticated');
