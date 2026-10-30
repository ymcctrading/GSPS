## Three-path tier promotion (2026-09-25, project owner direction)

Every tier transition on the Novice → Pro → Expert → Wall Street ladder can
now be cleared through any one of three independent paths: **Curriculum**
completion (GSPS School), a demonstrated **Track Record**, or **Pay Your
Way**. See `lib/promotion/transitions.ts`, `trackRecordPolicy.ts`,
`curriculumPolicy.ts`, `paths.ts`, and `lib/billing/promotionPricing.ts`.

**Three-question mandate, applied before this was designed:**

1. **Gann sourcing**: N/A. This is a governance/access-tier ladder, not a
   market technique — there is no Gann source to cite for it, and none of
   the three paths' thresholds claim to be.
2. **Dewey/cycle theory**: the Track Record path is a rolling evaluation
   window, which is a periodicity claim. Dewey's seven-item checklist is
   run explicitly in `trackRecordPolicy.ts`'s own header — two items
   clear as genuine periodicity claims (regularity of timing, phase-
   resumption after distortion), three clear by policy construction rather
   than measured evidence (repetition count, constancy of period — and the
   window lengths themselves), and two don't apply to a single trader's
   evaluation (wave-shape identity, cross-series clustering). Stated
   honestly there rather than claiming a clean sweep.
3. **Hermetic principles**: **Polarity** is the load-bearing one — three
   genuinely different poles of qualification (discipline/study,
   demonstrated performance, capital), each a real path on its own, not one
   "real" path with two lesser substitutes. **Cause and Effect**: each path
   is a different kind of evidence offered as the cause a promotion is
   earned from. **Rhythm**: the Track Record path is a recurring, rolling
   measurement (per "Cycles as architecture" above) — a profile that later
   falls below the bar can fall back out of eligibility on the next read,
   this is not a one-time exam that stays passed forever once cleared.

**The project owner's own framing for the promotion moment itself**
(2026-09-23, carried into this build): tier promotion should read as a
genuine graduation out of the constraints appropriate to a lower stage —
"unshackled from their current binds," ascending the ladder — not merely
"more features unlocked." `app/(app)/promotion/page.tsx`'s copy is written
to that framing within `lib/promotion/copy.ts`'s existing forbidden-phrase
rule (no "guaranteed", "best trade", "safe", etc.) — the ascension is
expressed through what a tier's actual constraints were and now aren't,
never through a performance claim.

**The one mandatory, path-independent component** (direct project-owner
decision, 2026-09-25, made when asked which requirements should hold
"if persons are willing to pay"): Wall Street unlocks autonomous live-money
trading (`autonomous_portfolio_manager`, Wall-Street-only per
`lib/tiers.ts`). The Academy 8 capstone's live-trading risk/settlement/
gaps/slippage/account-type education is treated as a safety prerequisite,
not a monetization lever, and is required for **every** path to Wall
Street — curriculum, track record, or pay-your-way alike
(`lib/promotion/curriculumPolicy.ts`'s `mandatoryComponentMet`). This is
the one place the "three independent paths" model has a shared,
non-optional component. It is deliberate; do not "clean it up" into full
path independence without going back to the project owner first.

**Graduation exams (project owner, 2026-09-28).** Novice -> Pro and Pro ->
Expert each have a graduation exam in the tier's sandbox
(`lib/school/graduationExam.ts`, `/school/exam/[transition]`): real past charts
shown up to a date, graded on the server against the platform's rules (trend,
trade or wait, entry, stop, size), never on P&L. **It belongs to the curriculum
path only** (owner, same day: "if paying for expert tier, or advancing via
earning it through achieving sustained trading success, then they have
permission to advance"): the courses plus the exam clear that path; track
record and pay-your-way need no exam. Stored in `graduation_exam_attempts`
(migration 0084, applied to production with owner sign-off; service-role
writes only). Wall Street keeps the Academy 8 capstone on every path.

**Track Record thresholds — where the numbers come from.** GSPS has no
multi-year proprietary track record yet (`docs/replay-runs/`'s longest run
spans about two months). `lib/promotion/trackRecordPolicy.ts`'s own header
comment states this plainly and records the three real inputs actually
used: the existing, already-shipped Novice→Pro policy as the "easy" anchor;
GSPS's own measured backtest evidence (the Execute bucket's +0.362R
expectancy, 2026-09-23 run) as the ceiling a Wall Street-track-record
candidate must approach; and publicly documented funded-account evaluation-
program conventions (10-30 trading days, 8-10% first-phase profit targets)
used only as a structural analogy for window length and profitability-floor
shape, never as evidence about GSPS's own setups. The resulting ladder is
asymmetric by explicit design: no profitability requirement at all for
Novice→Pro (encourages early engagement), a modest floor for Pro→Expert, and
the hardest bar — approaching GSPS's own measured best bucket — for
Expert→Wall Street (discourages skipping the curriculum at the tier that
trusts an autonomous system with the user's money). These are starting
values, remotely tunable the same way the original Novice→Pro policy
already is; re-derive them once GSPS has its own multi-year data rather than
treating them as permanent.

**A profitability metric distinct from execution scoring, by design.**
`lib/risk/execution-score.ts`'s own header states P&L must never feed
execution scoring — luck can reward poor behavior, and correct execution
can still lose. The Track Record path's `cumulativeReturnPct`/`expectancyR`
(`lib/promotion/readiness.ts#gatherTrackRecordInputs`) are a deliberately
separate computation for a different question ("has this trader actually
made money," relevant to promotion specifically) and are never fed back
into risk sizing.

**Pay Your Way pricing — approved (2026-09-25), not yet a live product.**
Novice→Pro $49 one-time; Pro→Expert $499 one-time + the standard
subscription; Expert→Wall Street $1,499 one-time + the standard
subscription — sized against GSPS's own existing tier subscription prices
so pay-your-way is always the worse deal than earning a tier for free
through curriculum or track record, per the reasoning in
`lib/billing/promotionPricing.ts`'s own header (`APPROVED_PROMOTION_PRICING`).
Approval of the *price* is a separate action from activating billing:
`lib/billing/promotionPricing.ts` still follows the same "not enabled until
real Stripe prices exist" posture as the existing `lib/billing/stripe.ts` —
`isPromotionBillingEnabled()` stays `false` until `STRIPE_PRICE_PROMOTION_*`
env vars are actually set, which requires creating the real Stripe Price
objects first (Stripe dashboard access this session does not have). That
remaining ops step is what's left before checkout can go live, not further
pricing approval.

**Schema**: `supabase/migrations/0080_tier_promotion_three_paths.sql` adds
`tier_promotions_progress`, `tier_promotions_status`, and
`tier_promotion_purchases` — generalized across all three transitions,
including Novice→Pro going forward. The original `promotion_progress`/
`promotion_status` (0046) are left in place, immutable per this repo's
convention, and continue to be read for Novice→Pro's existing Foundations
education/practice-validation flags specifically — they are not migrated or
dropped, since no profile has been promoted through them yet. **Not applied to
production until 2026-09-27**: the migration merged without being run, so
`/promotion`'s three-path tables didn't exist until then (see "Production
verification pass" under Strategy Modes).

**What was generalized vs. left alone.** `lib/promotion/eligibility.ts`'s
original `evaluatePromotionReadiness`/`DEFAULT_PROMOTION_POLICY` are
untouched and still drive the pre-existing `/api/promotion/status` /
`/api/promotion/upgrade` routes and the Settings page's promotion card
exactly as shipped — this build added new, separate functions
(`evaluateTrackRecordEligibility`, `evaluatePromotionPaths`) and new routes
(`/api/promotion/paths/status`, `/api/promotion/paths/upgrade`) alongside
them rather than rewriting what already worked. A future session should
prefer the generalized surface for any new work and can retire the original
Novice→Pro-only routes once the new `/promotion` page is confirmed to be
the intended replacement UI, but that retirement is not done here.

