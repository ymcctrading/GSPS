-- GSPS — 0092: keep the graduation exam's answer key off the public API
--
-- Review finding R-027 (2026-10-21). 0084 gave members SELECT on their own
-- `graduation_exam_attempts` rows. Each row's `scenarios` holds the scenario
-- the member sees (`view`) and its answer key (`key`: the trend, the
-- decision, the entry and stop choice ids). With the publishable key and
-- their own session, a member could read the key of the attempt they were
-- taking and pass the exam, which clears the curriculum path to Pro and to
-- Expert. Every reader is the server (`lib/school/examService.ts`, service
-- role), so the policy goes and the table keeps RLS with no policy, as the
-- learning tables do.
--
-- Forward-only: 0084 is not edited. Not applied to production by the session
-- that wrote it. Production held 0 attempts when this was written.

drop policy if exists "own graduation exam attempts (read only)" on public.graduation_exam_attempts;
revoke all on table public.graduation_exam_attempts from anon, authenticated;
