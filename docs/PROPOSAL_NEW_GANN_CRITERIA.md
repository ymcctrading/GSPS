# Proposal: three new Gann-principle scored criteria

Handoff document for a new session. Not implemented here — this is the brief
to work from. Written after closing out the harmonicProximity stale-anchor
investigation (PRs #202/#203) and confirming, via `lib/backtest/attribution.ts`
runs committed under `docs/replay-runs/2026-09-09-*`/`2026-09-10-*`, that no
further code-level bugs of that kind remain for the other two quarantined
criteria.

## Where the score actually stands right now

`lib/scoring/weights.ts`'s nine `CRITERION_KEYS` each carry one point by
default, summing to the `TOTAL_POINTS` the Execute (≥7) / Watch (≥4) cutoffs
are expressed in. `lib/validation/criteria-registry.ts` is the ledger of what
each point is actually worth, evidence-wise:

| Criterion | Evidence | What the real data (post-fix) says |
|---|---|---|
| `macroTrend` | quarantined | ±0.1R noise band both on 15Min (n=1029) and 1Hour Execute (n=122) |
| `hourlyTrend` | hypothesis | positive both runs, but the failing arm is 1 trade — unread |
| `fanProximity` | hypothesis | positive, below the per-arm floor everywhere it's been checked |
| `harmonicProximity` | quarantined | ±0.1R noise band, same populations as macroTrend |
| `historicalSR` | hypothesis | the most consistently positive of the nine, still below the floor |
| `patternArmed` | unmeasured | constant by construction inside any triggered sample |
| `stopRoom` | — | not yet audited in this pass |
| `timeCycle` | quarantined | ±0.1R noise band, same populations |
| `masterStructural` | hypothesis | sign disagrees by timeframe |

Three of nine points (`macroTrend`, `harmonicProximity`, `timeCycle`) are
quarantined — measured, and not trusted. None of the *code* defects behind
them are still open (see "What was already checked" below); what's left is
that the underlying premises, now correctly implemented, simply haven't shown
an edge yet on live data. A `hypothesis` label on most of the rest means
"nobody has broken it, but nobody has proven it either" — the 9-point score
is honest about carrying maybe two or three criteria with any real backing
right now.

**The ask this document is scoping:** rather than keep tuning the same nine,
design three *new* candidate criteria grounded in Gann's original, public
public-domain principles — as candidates to eventually replace whichever of
the three quarantined ones keep failing to clear quarantine, not as bolt-ons
that push the score past nine points.

## Governing constraint: no new numerology without an authorized spec

`docs/GANN_SARA_CONFLUENCE.md` records a hard rule from the "GSPS Gann & Sara
Cross-Market Integration Addendum": only "independently designed public
concepts" with provenance may be implemented, and inferring personally
sourced numerical logic without an authorized written specification is
explicitly forbidden. That's why `materialNumberClassification` is hard-typed
to `"notImplemented"` — there's no authorized spec for it yet.

This matters for scoping the three candidates below: two of them wrap
techniques the codebase has *already* built and had authorized (Gann angles
via `lib/gann/normalizedSlope.ts`, digital root/vortex via
`lib/gann/digitalRoot.ts`, both citing the "GSPS Implementation Blueprint" —
`docs/GSPS_IMPLEMENTATION_BLUEPRINT.md`). The third (percentage retracement)
is genuinely new code but is Gann's most textbook, public-domain technique —
same tier as the fan angles and Square of 9 already shipped — not
proprietary numerology. Confirm that reading with the project owner before
building it if there's any doubt.

## Candidate 1 — Gann angle (1×1) trend-holding

**Gann's principle:** the classic Gann angle rule — as long as price holds
above its rising 1×1 angle from a confirmed low (or below a falling 1×1 from
a high), the trend is structurally intact; a close through it is the first
warning the move is over.

**What already exists:** `lib/gann/normalizedSlope.ts`'s `normalizedSlope()`
and `nearestGannAngle()` compute exactly this — ATR-normalized realized slope
since the anchor pivot, and which of the five fixed ratios (1×4 … 4×1) it's
nearest to. It's already wired into `lib/signals/confluence/gann.ts` as
`angleSlope`, but purely as display/confluence context — never scored, never
read by `computeScore()`.

**Candidate rule:** something like "price sits on the trend side of its own
1×1 angle" — `nearestGannAngle(slope).direction` agreeing with the setup's
direction, or the realized slope's sign agreeing with direction at minimum
1×1 magnitude. Needs a concrete pass/fail definition before implementation —
that's this session's first job.

**Why this one first:** zero new numerical logic to author or get authorized;
it's a scoring wrapper around code and a blueprint citation that already
exist (§8.5). Lowest-risk of the three to build and measure.

## Candidate 2 — Digital root / vortex price-time confluence

**Gann's principle:** Gann's "Law of Vibration" — numerological alignment
between a move's price displacement and its time displacement (both reduced
to a 1–9 digital root) is read as a confluence signal, distinct from and
additive to purely geometric structure (angles, Square of 9).

**What already exists:** `lib/gann/digitalRoot.ts` is a full, blueprint-cited
(§2, §7, §18) implementation — `digitalRoot1to9`, `vortexClass`
(`VORTEX_FLOW`/`POLARITY_AXIS`/`COMPLETION_NODE`), `classifyConfluence`.
Wired into `evaluateGannConfluence()` as `vortexContext.relationship`, with
its own doc comment calling it explicitly "a GSPS hypothesis, not a proven
causal law" and forbidding it from creating or overriding a live gate on its
own (blueprint §7.4) — consistent with turning it into one *scored point*
among nine, not a gate.

**Candidate rule:** something like "price_dr and time_dr classify as
`MULTI_FACTOR_CONFLUENCE` (or whichever of `classifyConfluence`'s tiers reads
strongest)" as a pass condition. `previousVortexRoots`/`classifyRootTransition`
exist but need a persisted prior reading to ever fire — likely out of scope
for a first cut; a same-scan confluence read is enough to start.

**Why this one second:** also wraps already-authorized, already-implemented
code, but it's a genuinely less proven premise even by the blueprint's own
framing ("hypothesis," not "law") — expect it to need more attribution
scrutiny before it clears the bar the other criteria are held to.

## Candidate 3 — Gann percentage retracement zones

**Gann's principle:** Gann's percentage retracement rule — a swing's most
significant retracement levels are 1/8ths and thirds of its range (3/8, 1/2,
5/8 most heavily weighted), distinct from and older than the Square of 9 and
angle work already in this codebase. This is the one true gap: nothing in
`lib/gann/` computes a retracement level today.

**What would need building:** a new `lib/gann/retracements.ts` mirroring the
existing modules' shape — anchor off the same "most recent significant
high/low" pivot pair `fans.ts`/`squareOf9.ts` already use (for consistency,
not because retracement classically requires it), project the levels, expose
role (support/resistance) the same way `lib/analysis/levelRole.ts` already
does for the other two proximity criteria. Reuse `lib/scoring/proximity.ts`'s
ATR-relative-band pattern (`proximityBandPct`) rather than a fixed percent,
per the reasoning already on file there.

**Candidate rule:** same shape as `fanProximity`/`harmonicProximity` —
"price within an ATR-relative band of a retracement level on the wanted
role/side."

**Why this one third:** real new code, so it carries implementation risk the
other two don't, and it needs the "is this public-domain enough to build
without an authorized spec" question answered explicitly first (see
governing constraint above) even though the answer is very likely yes.

## What was already checked (context, not part of the remaining work)

- `harmonicProximity`: two live callers (`lib/marketScan.ts`'s
  `coarseReversion()` pre-filter, `lib/signals/confluence/gann.ts`'s
  `evaluateGannConfluence()`) were still spiraling Square-of-9 levels from a
  stale, role-blind anchor after the 2026-09-09 scoring fix. Fixed in PRs
  #202/#203, including the confluence module's digital-root/vortex anchor
  (which had the identical staleness, per blueprint §8.2's generic
  objective-pivot rule — not a vortex-specific exception, contrary to this
  session's own initial, incorrect read of the spec).
- `macroTrend`, `timeCycle`: no analogous duplicate/stale implementation
  found anywhere else in the codebase (`lib/marketScan.ts`,
  `lib/signals/confluence/`, `lib/signals/states/*` all checked) — each has
  exactly one live implementation, already on the fixed logic.
- All three quarantined criteria were re-measured against six fresh
  post-fix live/Alpaca runs (`docs/replay-runs/2026-09-09-*`,
  `-2026-09-10-*`); every one reads inside the ±0.1R noise band now — no
  longer actively harmful, not yet proven helpful. `lib/validation/
  criteria-registry.ts` carries the exact numbers per criterion.

## Validation discipline the new criteria must clear before touching the live score

Do not add these directly to `CRITERION_KEYS`. Build each behind
`evidence: "unmeasured"` in the registry, run it through
`lib/backtest/attribution.ts` the same way the existing nine are audited, and
hold it to the same bar `lib/backtest/propose-weights.ts` already enforces
for promoting a measured effect:

1. Chronological in-sample/out-of-sample split (never random).
2. `informative` verdict (both arms ≥ `MIN_SAMPLES_PER_ARM`) in **both**
   halves.
3. Both halves agree on sign.
4. Effect clears `MIN_EFFECT_R` (0.1R) on the **weaker** half.

A candidate that clears this is a real proposal to replace one of the three
still-quarantined criteria (`macroTrend`, `harmonicProximity`, or
`timeCycle`) — swap it in, keep the total at nine points, and let
`normalizeWeights()` handle the renormalization, per the existing
"weights are proposed, not auto-adopted" discipline in
`lib/scoring/active-weights.ts`. A candidate that doesn't clear it stays
`hypothesis` or gets its own quarantine entry — same standard as everything
else in the registry.

## Roadmap phase

`N/A` — out-of-phase, direct request, same footing as the original Gann/Sara
confluence work (`ROADMAP.md`'s Q1 section already carries that addendum
as out-of-phase). Secondary justification if a phase label is wanted: Q1's
stated goal of "an accurate signal engine with explainable logic and tuned
scoring" (`ROADMAP.md` line ~64) — flag this to the project owner rather than
assuming it.

## Suggested order of work for the new session

1. ~~Pick Candidate 1 (Gann angle) first — lowest implementation risk, code
   already exists.~~ **Done** (2026-09-10): scaffolded, not yet measured.
   `lib/gann/normalizedSlope.ts` gained `angleSlopeFromBars()`, anchored the
   same "most recent significant high/low" way as `fans.ts`/`squareOf9.ts`.
   `GannLevels` carries `angleSlopeBullish`/`angleSlopeBearish` (both
   computed in `lib/scanTicker.ts` and `lib/backtest/replay.ts`'s
   `buildMacroContext`). `computeScore()` collects the pass/fail rule —
   `direction === "bullish" ? slope >= 1 : slope <= -1` (price at or beyond
   its own 1×1 angle, in the setup's direction) — as
   `ScanDecision.candidateCriteria.gannAngleTrendHolding`, deliberately
   **not** in `breakdown`: an unpilared `breakdown` item reads as a
   verdict-capping hold in `lib/scoring/public-summary.ts`'s
   `toPublicScoreSummary`, which this candidate must not trigger.
   `lib/backtest/replay.ts`'s `criteriaOf()` merges `candidateCriteria` into
   each trade's `criteria` map so `lib/backtest/attribution.ts` reads it
   exactly like the nine scored criteria. Registered in
   `lib/validation/criteria-registry.ts` under a new `"candidate"` family
   (exempt from the completeness/staleness checks the same way `scoreHold`
   already is), `evidence: "unmeasured"` — nothing has measured it yet.
2. **Next:** run `lib/backtest/attribution.ts` against a real replay (`npm
   run backtest -- --within all` or similar — see `docs/BACKTESTING.md`) to
   see whether `gannAngleTrendHolding` clears `informative` at all before
   investing further. It will show up in the factor table automatically.
3. Repeat scaffolding + measurement for Candidates 2 and 3.
4. Only after at least one clears the four-point validation bar above,
   propose which quarantined criterion it would replace, and route that
   decision through a human before touching `CRITERION_KEYS`.
