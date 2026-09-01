-- GSPS School — curriculum expansion (8 academies / 4 entitlement-aware
-- programs, per the "Philosopher's Stone" product spec, 2026-09-01).
--
-- The pilot program (0056_gsps_school_lesson_progress.sql,
-- lib/school/content.ts) stays completely unchanged and keeps its own
-- program_id — this migration only *adds* rows other programs can use
-- through the same generic `school_lesson_progress` table. That table's
-- shape (user_id, program_id, lesson_id, status, attempt_count, score,
-- completed_at) already generalizes across every academy/course/lesson in
-- the new curriculum: a lesson's `lesson_id` is a fully-qualified slug
-- (e.g. "academy-1/orientation/what-markets-do") and `program_id` is the
-- new curriculum's program id ("gsps-school-curriculum"), so it is reused
-- rather than duplicated per hierarchy level — see lib/school/curriculum.ts.
--
-- New tables:
--   school_learning_labs — one row per Bull/Bear/Operator's-Decision
--   activity (trade-plan, research memo, chart annotation, portfolio
--   exercise, market-regime checkpoint). Same own-row RLS as 0056.
--
--   school_trader_operating_system — one row per learner: private baseline
--   + recurring self-audit fields ("Trader Operating System" in the spec).
--   Strictly a process/discipline tool, never diagnostic — enforced in
--   application code (lib/school/trader-os.ts), not in this schema.
--
-- Column addition:
--   live_trading_restrictions.wall_street_school_completed_at — pre-purchase
--   Wall Street (SYSTEM_MASTERY) readiness, written only after the new
--   Wall Street capstone (Academy 8, non-W2 courses). Deliberately separate
--   from the existing `school_completed_at` (0052), which stays scoped to
--   the live-capital restriction-lift workflow only — see
--   lib/risk/live-trade-loss.ts and lib/school/service.ts, both unchanged.
--
-- Rollback:
--   alter table public.live_trading_restrictions drop column if exists wall_street_school_completed_at;
--   drop table if exists public.school_learning_labs;
--   drop table if exists public.school_trader_operating_system;

alter table public.live_trading_restrictions
  add column if not exists wall_street_school_completed_at timestamptz;

create table if not exists public.school_learning_labs (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id text not null,
  lab_id text not null,
  lab_type text not null check (
    lab_type in (
      'trade_plan',
      'research_memo',
      'chart_annotation',
      'portfolio_exercise',
      'market_regime_checkpoint',
      'risk_constitution',
      'trading_playbook',
      'system_review',
      'capstone_dossier'
    )
  ),
  -- Three-Element Method payload (Signal / Bull / Bear / Operator's
  -- Decision) plus regime-checkpoint fields, stored as one jsonb document
  -- per attempt so the schema doesn't need to grow with every new lab
  -- shape — validated server-side by lib/school/bull-bear.ts before any
  -- write, never trusted as-is from the client.
  signal jsonb not null default '{}'::jsonb,
  bull_case jsonb not null default '{}'::jsonb,
  bear_case jsonb not null default '{}'::jsonb,
  operator_decision jsonb not null default '{}'::jsonb,
  regime_checkpoint jsonb,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'passed', 'needs_revision')),
  score numeric,
  score_breakdown jsonb,
  attempt_count integer not null default 1,
  curriculum_version text not null,
  post_trade_review jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, program_id, lab_id)
);

create index if not exists school_learning_labs_user_program_idx
  on public.school_learning_labs (user_id, program_id);

alter table public.school_learning_labs enable row level security;

create policy "own school learning labs" on public.school_learning_labs
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

create table if not exists public.school_trader_operating_system (
  user_id uuid primary key references auth.users (id) on delete cascade,
  objective text,
  allowed_timeframes text[] not null default '{}',
  risk_limits jsonb not null default '{}'::jsonb,
  cognitive_risks text[] not null default '{}',
  pause_conditions text[] not null default '{}',
  pre_trade_falsification_prompt text,
  last_post_trade_classification text
    check (
      last_post_trade_classification is null
      or last_post_trade_classification in ('followed_plan', 'deviated', 'no_trade', 'review_required')
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.school_trader_operating_system enable row level security;

create policy "own trader operating system" on public.school_trader_operating_system
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);
