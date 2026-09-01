# GSPS School — curriculum establishment status

Tracks the "GSPS School Curriculum Handoff" (Claude Code handoff document,
prepared 2026-08-31) and the follow-on "Philosopher's Stone" product spec
(2026-09-01) against what actually exists in this repository.

## Status: the broader product now exists (2026-09-01)

The pilot's own "Not yet verified" table below described what a first pass
deliberately declined to answer. A second pass (this update) built the
broader eight-academy product the handoff sequenced ahead of: a full
curriculum content model, the Three-Element Method (Signal / Bull / Bear /
Operator's Decision), learner routes, and gate wiring into promotion and
Wall Street checkout. What follows records what exists now and what
remains deliberately out of scope.

### What exists now

| Deliverable | Where |
|---|---|
| 8-academy / 4-program curriculum content (typed, versioned as code) | `lib/school/curriculum.ts` |
| Three-Element Method type + server-side validation/scoring rubric | `lib/school/bull-bear.ts` |
| Progress, prerequisite locking, quiz grading, lab submission, gate writes | `lib/school/curriculum-service.ts` |
| Cadence Engine reference content (in-app only, no cron jobs) | `lib/school/cadence.ts` |
| Published resources (versioned code, no CMS) | `lib/school/resources.ts` |
| Migration: `school_learning_labs`, `school_trader_operating_system`, `wall_street_school_completed_at` | `supabase/migrations/0057_gsps_school_curriculum.sql` |
| Routes: dashboard, academy, course, lesson player, progress, labs, resources | `app/(app)/school/*` |
| API: curriculum map/course/lesson/labs/progress, Trader Operating System | `app/api/school/curriculum/*`, `app/api/school/trader-os` |
| Wall Street checkout gate (server-side, unbypassable from the client) | `app/api/billing/checkout/route.ts` |
| Nav: "School" tab between Scan and Portfolio | `components/app/nav.tsx` |
| Tests | `lib/school/__tests__/*` |

### Gate behavior (exact fields, exact consequence)

- **Foundations (Academies 1-3, Novice tier, required):** passing every
  Academy 1-3 lesson except the paper-validation lesson writes
  `promotion_progress.education_completed_at`. Passing the paper-validation
  lesson separately writes `promotion_progress.practice_validation_completed_at`.
  Both are additive inputs to `lib/promotion/eligibility.ts` — they never
  replace trade count, account age, execution score, stop adherence, or
  position-size compliance, and each write is idempotent (never overwrites
  an existing timestamp).
- **Sharpening the Edge / Professional Toolkit (Academies 4-7, Pro/Expert
  tiers, advisory):** progress and lab submissions persist. Nothing here
  ever blocks a purchase, grants an entitlement, or alters promotion logic.
- **Systemization & Capital Stewardship (Academy 8 capstone course, not
  Course W2, Wall Street tier, required):** passing every capstone lesson
  and the capstone dossier lab writes
  `live_trading_restrictions.wall_street_school_completed_at`. The Wall
  Street (`SYSTEM_MASTERY`) checkout route refuses server-side without it.
- **Course W2 (the original pilot, unchanged):** still writes
  `live_trading_restrictions.school_completed_at`, still scoped only to
  lifting a live-trading restriction after a 50% live-loss event, still
  never read as proof of pre-purchase Wall Street readiness. Its own
  content (`lib/school/content.ts`), grading, and service layer
  (`lib/school/service.ts`) are untouched.

### Metric provenance

Every metric surfaced in School is labeled Measured, Learner-reported, or
Planned (`components/school/provenance-badge.tsx`). The execution-score
literacy lesson (`academy-5/research/execution-score-literacy`) discloses,
by name, which `lib/risk/execution-score.ts` factors are currently measured
from recorded paper-trading history (stop discipline, position sizing) and
which are given full credit by default because GSPS does not yet record
the underlying data (entry discipline, exit-plan adherence, frequency
discipline, correlation discipline, journal completion) — matching
`lib/promotion/readiness.ts`'s own documented posture.

### Explicitly out of scope in this pass (deferred, not fabricated)

- **Analytics events.** The spec names a set of privacy-respecting School
  events (`school_opened`, `lesson_completed`, etc.), conditioned on "if
  compatible with existing analytics conventions." This repo has no
  generic event-tracking library to plug into — building one would be a
  new pattern, not reuse of an existing one. Not implemented; a real
  analytics layer (if the product later adds one) should wire these in.
- **CMS/authoring pipeline.** Curriculum content stays versioned code, per
  both this pass and the pilot's own precedent.
- **Full 60+ lesson literal-spec coverage.** The product spec names dozens
  of granular topics per academy (e.g. every individual order-type nuance,
  every macro factor). This pass authored 2-4 real, substantive lessons per
  academy — enough to make every gate, prerequisite, and Three-Element
  Method path real and testable — rather than one lesson per named topic
  bullet. Extending lesson depth within an existing academy is additive
  work, not a schema change.
- **Bookmarks/save-for-review.** Not built, per the spec's own "only if
  fully implemented" instruction.
- **Course/module-level progress rows beyond lesson-level.** Academy/course
  completion is derived from lesson-level `school_lesson_progress` rows
  (all lessons in scope passed) rather than a separate summary table —
  simpler, and correct as long as the lesson list per course doesn't
  change shape without a version bump.

## What the pilot pass found and built (2026-09-01, first pass — unchanged by the above)

The only prior GSPS School references found before the pilot:

- `docs/GSPS_TIER_ENTITLEMENT_SPEC.md` / `GSPS_PHASE1_CLAUDE_CODE_IMPLEMENTATION_INSTRUCTIONS.md`
  — "GSPS School: Included" listed as an entitlement for every membership
  tier. No content, structure, or delivery model attached to that line.
- `supabase/migrations/0052_live_trade_loss_policy.sql` /
  `lib/risk/live-trade-loss.ts` — `live_trading_restrictions.school_completed_at`,
  a column with a reader (`isLiveTradingRestricted`) and, until that pass,
  no writer anywhere in the codebase.
- `lib/education/patterns.ts` — plain-language pattern explanations,
  related in spirit but kept structurally separate.

One pilot program, scoped to the one requirement above: **Live-Trading
Risk Re-Certification** — four lessons covering the loss-notification
cascade, the 50% force-close/restriction trigger, and live stop-override
friction, with a quiz per lesson as the mastery check. Completing every
lesson calls `completeSchoolReverification` (`lib/school/service.ts`),
which writes `school_completed_at` via a service-role client. This program
now lives at `/school/recertification` (moved from `/school`, which is now
the curriculum dashboard) and is presented as "Course W2" inside Academy 8
— its own behavior, scope, and service layer are unchanged.

*Last updated: 2026-09-01.*
