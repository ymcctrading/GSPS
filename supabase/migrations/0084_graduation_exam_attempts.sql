-- Graduation exams for Novice -> Pro and Pro -> Expert (project owner,
-- 2026-09-28): a practical test in each tier's sandbox that a student must pass
-- to show they can apply what they learned, required on every promotion path
-- for those two transitions (curriculum, track record and pay your way alike),
-- the same way Academy 8's capstone is required for Wall Street.
--
-- One row per attempt. The scenarios (symbol, as-of date and the answer key
-- computed from the bars up to that date) are fixed when the attempt starts,
-- so grading reads the same questions the student saw. Graded on the server
-- against the platform's rules, never on whether the trade would have made
-- money. See lib/school/graduationExam.ts.
--
-- Owner-readable, written only by the service role: a pass gates promotion, so
-- a client must not be able to write one.
--
-- Rollback: `drop table if exists public.graduation_exam_attempts;`. Nothing
-- else references it; promotion reads it and treats a missing table as "not
-- passed" (fail closed).

create table if not exists public.graduation_exam_attempts (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  transition text not null check (transition in ('novice_to_pro', 'pro_to_expert')),
  scenarios jsonb not null,
  answers jsonb,
  score numeric check (score is null or (score >= 0 and score <= 1)),
  passed boolean,
  started_at timestamptz not null default now(),
  graded_at timestamptz
);

create index if not exists graduation_exam_attempts_user_idx
  on public.graduation_exam_attempts (user_id, transition, started_at desc);

alter table public.graduation_exam_attempts enable row level security;

create policy "own graduation exam attempts (read only)" on public.graduation_exam_attempts
  for select using (auth.uid () = user_id);
