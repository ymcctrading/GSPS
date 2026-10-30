## Polarity audit: a genuine second pole for Novice/Pro, not a subtracted one (2026-09-23, project owner direction)

The novice/expert interface worked example in the Three-question mandate
section above names **Polarity** — two poles of the same spectrum held
together in one coherent design, neither diluting the other. The project
owner's own correction, from personal experience: a shorter feature list is
not a second pole. Expert/Wall Street having real depth (Strategy Modes,
exact score precision, backtesting) and Novice/Pro having a capped version
of the same list is subtraction, not design. This section records a
platform-wide audit for that pattern and what came of it.

**Three-question mandate, applied to this audit itself** (not retrofitted —
this is what shaped which findings below got built vs. flagged):

1. **Gann sourcing:** N/A for the audit itself — this is an access/UX design
   question, not a market-technique one. Individual findings below cite Gann
   sourcing where relevant (none did).
2. **Dewey/cycle theory:** N/A — no periodicity or recurrence claim.
3. **Hermetic principle:** **Polarity**, per the worked example above, read
   together with **Cause and Effect** for the specific fix this audit built
   (see "Trade Reviews" below) — pairing a trade's own criteria (cause) with
   its own outcome (effect) is a direct expression of that second principle,
   not just Polarity's "give the low tier its own thing."

**Findings, surface by surface** (full survey conducted 2026-09-23):

1. **Backtest attribution (`lib/backtest/attribution.ts`) — real gap,
   fixed.** Per-factor attribution is reachable only through backtesting,
   `backtestingEnabled: true` for Wall Street alone (`lib/entitlements/policy.ts`).
   No comment anywhere acknowledged a Novice/Pro/Expert equivalent — it was
   simply absent for three of four tiers. **Fixed**: `lib/lifecycle/review.ts`'s
   `buildPostCloseReview` (which already existed, already had an API route at
   `/api/trade-plans/[planId]/review`, and had **no UI consumer anywhere** —
   itself a "not existing everywhere it applies is equal to not existing
   anywhere" case) now also carries the plan's Rules Alignment breakdown
   (`lib/signals/scoring.ts`'s per-criterion evidence, already persisted on
   every `trade_plans` row via the `alignment` evidence field — no migration
   needed). A new list endpoint (`/api/trade-plans/reviews`) and UI panel
   (`components/portfolio/trade-reviews.tsx`, "Trade Reviews" on the
   Portfolio page) render it for every tier. This is deliberately **not** a
   diluted copy of backtest attribution: one trade's own cause and effect,
   no cross-symbol win rate, expectancy, or profit factor — those claims
   stay backtesting's own, still gated as before. The distinction is the
   point, not a compromise.
2. **Order ticket Strategy Mode area — real gap, fixed.** Pro's four-mode
   subset already carried a stated rationale (`lib/entitlements/policy.ts`);
   Novice's `[]` (no modes at all) had none beyond "consistent with every
   other advanced capability being withheld" — a bare exclusion where a
   selector renders for every other tier. **Fixed**: `components/trade/order-ticket.tsx`
   now renders a short explainer in that exact space for Novice/Pro without
   modes, naming what GSPS prices every plan from instead, rather than
   leaving a blank space where a control used to be.
3. **Chart complexity (`components/chart/candles.tsx`) — not yet a gap,
   flagged for whoever gates it.** Overlays are currently ungated for every
   tier, by explicit standing project-owner direction recorded in that
   file's own comment. Nothing to fix today, but the recorded *intent* is to
   eventually withhold PSAR/Supertrend from lower tiers with no companion
   plan for what Novice/Pro's chart should look like instead. Flagged here
   so that future gating work doesn't repeat the subtraction pattern this
   audit exists to catch — design the simplified counterpart in the same
   change that adds the gate, not after.
4. **Dashboard/setup-card display — investigated, no gap found.** The plain
   results table (`components/scan/results-table.tsx`) is the same shape at
   every tier (row count and score precision differ, nothing else) — but
   Guided Mode (`components/guided/guided-card.tsx`, `/guided`) is already
   the real teaching-oriented counterpart, already nav-prominent as "the
   novice's primary path" (`components/app/nav.tsx`'s own comment). This is
   Polarity done correctly, already in place — no action needed.
5. **Scoring precision (`lib/scoring/display.ts`) — investigated, no gap
   found.** Already a deliberately-designed second pole with its own
   in-code rationale (rounding to the half-point rather than a raw decimal
   for Novice/Pro), not a subtraction. Recorded here as the positive
   precedent this audit's other fixes followed.
6. **GSPS School curriculum (`lib/school/curriculum.ts`) — investigated, no
   gap found.** Genuinely tier-differentiated content (Foundations for
   Novice, advisory-only Academies 4-7 for Pro/Expert, a required capstone
   for Wall Street) rather than one curriculum stripped down. No new
   curriculum content was written for this pass — see the note below on
   what would be reused if it ever is.
7. **Watch → Execute alerts / monitoring — investigated, accepted as
   quantitative-only.** No qualitative depth difference exists between
   tiers here, only capacity numbers (`maxActiveWatchMonitors`, etc.). Not
   flagged as a gap: a monitor slot is a resource ceiling, not a taught
   skill, so there is no "shallow-but-designed" counterpart for it to be
   missing in the way there was for attribution or the order ticket.

**Content-reuse constraint that applies to any future curriculum work
building on this audit** (project owner direction, 2026-09-23): if new
GSPS School content is ever written to plug a Polarity gap, it must teach
the underlying premise of a technique without reproducing another
practitioner's specific words, methods, or published observations verbatim
— consistent with the numerology/astrology citation discipline elsewhere in
this file (a technique's *rule* can be taught; someone else's specific
proprietary expression of it cannot be lifted). No new curriculum content
was written in this pass, so this constraint did not need to be exercised
here — it's recorded for the session that first does.

