## WD Gann precedence — standing principle

When GSPS's current implementation, a design choice, or a piece of copy
conflicts with something W.D. Gann actually taught (his own published books,
or his private paid-course material and letters per
`docs/GANN_HISTORICAL_SOURCES.md`'s tiers), **default to Gann's own
methodology**, not GSPS's existing approach. This is a direct, standing
instruction from the project owner (2026-09-16), not a case-by-case
judgment call: where a real choice exists between "what GSPS currently
does" and "what Gann's own sources say," the sources win.

**Gann answers the question; don't hold it for the owner (2026-10-21,
owner: "anything that can be answered by a Gann method, should use the Gann
method as an answer. going forward on the GSPS platform").** Before holding
any question, decision or open item for the owner, ask whether a Gann method
answers it, and look in his books (`/mnt/project-files/literature-reading-output/`),
`docs/GANN_HISTORICAL_SOURCES.md` and `docs/memory-bank/`. If one does, that is
the answer: build it, cite the source in the code and the change record, and
tell the owner what was decided and why, rather than asking. This covers
trading rules, thresholds Gann states, entries, exits, stops, sizing, time and
price readings, and how a rule reads on a surface. Only a question no Gann
method answers goes to the owner: security, access, billing, ops, legal,
product copy with no Gann content, or a figure Gann never gave (label that
engineering choice as such). It is the owner's earlier "Determine how WD Gann
would answer these questions, and those are your answers" (2026-10-21) made
standing.

**"This app is WD Gann re-manifested into a trading platform" (owner,
2026-10-21).** That is the approach for every design question in a session:
the first question is how Gann did it, and where he answers, his answer is
the design.

**This covers how the platform runs, not only trading rules (owner,
2026-10-21: "when I say that gann's methodology should be completely infused
into the platform, this is one of those instances").** What to scan, what to
watch, how often to refresh, and which names get the scarce requests are
questions Gann answers too: he chose his active stocks from the daily charts
the night before and timed them in the session. A data-feed or budget limit
is a reason to ask how Gann would choose, never the end of the answer. The
intraday scan's fixed list was reported as "the feed's limit" until the owner
asked; the evening focus list below is the answer the method already gave.

This does not mean bypassing engineering judgment about *how* to translate
a disclosed rule into working code, and it does not mean porting a raw
historical number (a 1930s dollar/cents figure, a commodity-specific unit)
across asset class and era without saying so — see `lib/strat/levels.ts`'s
`combineNearbyLevels` for a worked example of implementing the disclosed
*rule* while declining to port its literal magnitude, documented inline for
exactly this reason. It does mean: when a Gann-derived candidate is ready to
build, build it live rather than leaving it queued behind a validation
process that would otherwise gate it indefinitely, and document the change
in place (what changed, when, and why) so a future reader — human or
another session — can see the decision rather than archaeology it from a
diff. `docs/GANN_PLATFORM_AUDIT.md`'s Part 4 items, wired in live on
2026-09-16 (a new tenth scored criterion, `ruleOfThree`; the "3-point rule"
buffer in `lib/lifecycle/entryConfirmation.ts`; the "resistance points near
same levels" clustering in `lib/strat/levels.ts`; the fixed annual calendar
cycle in `lib/gann/timeCycles.ts`), are the standing worked example of this
principle in practice — each carries an inline comment pointing back here
and to that document's Part 4.

This principle does not override AGENTS.md's other explicit, user-directed
overrides above and below (the 1Hour execution timeframe, and the threshold
half of the Execute-collapse stopgap) — those have their own stated reasons
and revert triggers and are not "GSPS's current approach vs. Gann" conflicts
in the sense this section addresses. The *weight* half of that stopgap is no
longer among them: it was resolved on 2026-09-16 under "Gann-derived AND
measured" below, which supersedes it on principle rather than on a revert
trigger.

**On `GANN_SARA_CONFLUENCE.md`'s numerology rule and `lib/gann/digitalRoot.ts`'s
conservative treatment (updated 2026-09-16, project owner direction):**
both are superseded specifically by principles genuinely tied to Gann and
his methodology — not weakened in general. The "no new numerology without
an authorized specification" rule still holds as the guard against
*inventing* Gann lore nobody ever documented; what changed is what counts
as authorized. `docs/GANN_HISTORICAL_SOURCES.md` (the 25-document catalog)
and `docs/GANN_METHODOLOGY_FULL_REPORT.md` (§18.5, which states this
explicitly: "this report itself is the authorized specification" for the
techniques it documents, each traced to a cited primary source — A2.1,
A2.3 — not an inference) together are that authorization. So: a numerology
or astrology technique with no citable Gann source is still off-limits,
full stop. A technique citably his own — even one GSPS previously treated
as conservatively as `digitalRoot.ts` does today (confluence-only, never
independently gating) — can be built out further when Gann's own
methodology calls for it, per this same precedence rule.

