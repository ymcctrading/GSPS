-- Saved scan criteria: a user's named Universe-tab search (which industries,
-- which custom symbols) they can re-run later with one click. Distinct from
-- `watchlists` (bare symbols to watch) and `saved_setups`/`setup_folders`
-- (0058 — a scored trade-plan snapshot at save time): this saves the *scan
-- configuration* itself, not a result. BACKLOG.md's "Saved scan
-- criteria/watchlists" item, confirmed still open in ROADMAP.md's Q1 "Scan
-- history" note.

create table public.scan_criteria_presets (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  sector_keys text[] not null default '{}',
  custom_symbols text not null default '',
  created_at timestamptz not null default now()
);

create index scan_criteria_presets_user_id_idx on public.scan_criteria_presets (user_id);

alter table public.scan_criteria_presets enable row level security;

create policy "own scan criteria presets" on public.scan_criteria_presets
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);
