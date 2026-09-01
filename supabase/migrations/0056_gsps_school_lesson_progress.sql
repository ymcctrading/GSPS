-- GSPS School pilot: per-lesson progress for the one program this repo has
-- an actual consumer for -- live-trading restriction re-certification
-- (live_trading_restrictions.school_completed_at, added in 0052 as a policy
-- hook with no writer). Lesson/quiz content itself is versioned code
-- (lib/school/content.ts), not database rows -- see docs/GSPS_SCHOOL.md for
-- why a full curriculum-authoring schema is out of scope for this pass.
--
-- Rollback: drop table if exists public.school_lesson_progress;

create table if not exists public.school_lesson_progress (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id text not null,
  lesson_id text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'passed')),
  attempt_count integer not null default 0,
  score numeric,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, program_id, lesson_id)
);

create index if not exists school_lesson_progress_user_program_idx
  on public.school_lesson_progress (user_id, program_id);

alter table public.school_lesson_progress enable row level security;

create policy "own school lesson progress" on public.school_lesson_progress
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);
