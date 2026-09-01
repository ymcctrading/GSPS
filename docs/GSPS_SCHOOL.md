# GSPS School — curriculum establishment status

Tracks the "GSPS School Curriculum Handoff" (Claude Code handoff document,
prepared 2026-08-31) against what actually exists in this repository. That
document is the authoritative scope record for the broader GSPS School
product; this file is where its own directives — inspect the repo, report
sources, don't fabricate unapproved decisions, ship one pilot module before
anything larger — are worked and logged.

## What was found in the repository (per the handoff's first task)

No authoritative curriculum specification, lesson inventory, learner
profile, or approved technology architecture exists anywhere in this repo.
The only prior GSPS School references found:

- `docs/GSPS_TIER_ENTITLEMENT_SPEC.md` / `GSPS_PHASE1_CLAUDE_CODE_IMPLEMENTATION_INSTRUCTIONS.md`
  — "GSPS School: Included" listed as an entitlement for every membership
  tier. No content, structure, or delivery model attached to that line.
- `supabase/migrations/0052_live_trade_loss_policy.sql` /
  `lib/risk/live-trade-loss.ts` — `live_trading_restrictions.school_completed_at`,
  a column with a reader (`isLiveTradingRestricted`) and, until this pass,
  no writer anywhere in the codebase. This is the one concrete, already-
  specified requirement: a restricted account (50% live-loss event) has no
  path to lift the restriction without it.
- `lib/education/patterns.ts` — plain-language pattern explanations. Related
  in spirit (educational content) but not curriculum infrastructure; naming
  and structure kept separate on purpose (see that file's own header).

Nothing else — no lesson content, no learner-facing school UI, no
enrollment/progress schema — existed before this pass.

## What this pass built (the pilot, per the handoff's sequencing)

One pilot program, scoped to the one requirement above:
**Live-Trading Risk Re-Certification** — four lessons covering the rules
this codebase already enforces (the loss-notification cascade, the 50%
force-close/restriction trigger, live stop-override friction) with a quiz
per lesson as the mastery check.

| Deliverable | Where |
|---|---|
| Content schema + validation (blocks publishing an incomplete lesson) | `lib/school/content.ts` |
| Grading + progress + the restriction-lifting write | `lib/school/service.ts` |
| Progress table (own-row RLS, same pattern as every other per-user table) | `supabase/migrations/0056_gsps_school_lesson_progress.sql` |
| API | `app/api/school/progress`, `app/api/school/lessons/[lessonId]/complete` |
| UI | `/school` (`app/(app)/school/page.tsx`, `components/school/school-flow.tsx`), linked from the top nav |

Completing every lesson calls `completeSchoolReverification`
(`lib/school/service.ts`), which writes `school_completed_at` via a
service-role client — the one write `isLiveTradingRestricted` has been
waiting on since 0052. A future 50% loss event restricts the account again
and requires completing the program again, unchanged from the existing
design.

Content is versioned code (`lib/school/content.ts`), not database rows —
consistent with this repo's existing `lib/education/patterns.ts` precedent
for explanatory content, and consistent with the handoff's own sequencing
("content templates" and "one complete pilot module" before "platform
foundation" with an authoring/admin workflow). A CMS-style authoring schema
for programs/courses/modules/lessons/resources — the handoff's fuller data
model — is not built; it is scoped ahead of any second program.

## Explicitly not decided — do not fabricate these (per the handoff)

The handoff's "Not yet verified" table is unresolved by this pass and
remains unresolved:

- Full identity/mission of "GSPS School" as a product distinct from this
  one risk-recertification use, and its brand voice.
- The broader learner audience beyond "a member whose account was
  restricted, or any member who wants to preview the material."
- Any subject or program beyond this one pilot.
- Instructional model at scale (self-paced is what the pilot uses; not
  chosen as a v1 decision for anything larger).
- Assessment model beyond a pass/fail quiz per lesson.
- Compliance (accreditation, privacy, accessibility beyond what this pilot's
  plain HTML form provides, payment).
- Any credential issuance — this pilot issues none.
- Enrollment, payments, learner analytics, or role-based
  author/reviewer/publisher production access — explicitly deferred by the
  handoff pending owner approval, and not built here.

Additional programs, an authoring/admin workflow, and any of the above
require an owner decision before implementation, per the handoff's own
"Claude Code execution brief."

*Last updated: 2026-09-01.*
