# Kickoff prompt — full-platform Gann method audit

Paste the block below as the opening message of a fresh Claude Code session (no prior
context needed — it's self-contained). It launches a platform-wide follow-up to the
module-scoped audit in `GANN_METHOD_COMPLETENESS_AUDIT.md`, built from the primary-source
research compiled in `GANN_HISTORICAL_SOURCES.md`.

Written 2026-09-15, after all ten of W.D. Gann's own books had been read (nine in full, one
at ~15% with the remainder an accepted, intentional gap — see that doc's A8 entry).

---

```
This session continues a research project this codebase has been running: a full read of all
ten books W.D. Gann published in his own lifetime (1909-1954), plus seven interpretive
secondary sources, compiled into two memory-bank documents:

- docs/GANN_HISTORICAL_SOURCES.md — source-by-source catalog of what Gann actually disclosed
  in each book vs. what later researchers reconstructed from private letters/course material,
  with a cross-source synthesis table.
- docs/GANN_METHOD_COMPLETENESS_AUDIT.md — a five-part audit (method in plain English / where
  GSPS implements it / where GSPS conflicts with it / where GSPS deviates from it / what's
  still needed) but SCOPED NARROWLY to lib/gann/, lib/scoring/, and lib/signals/confluence/.

Read both documents in full before doing anything else.

Your task: re-run that same five-part audit at the scope of the ENTIRE GSPS platform, not just
the Gann-specific modules. The codebase has grown well beyond lib/gann/ — Gann-derived or
Gann-adjacent concepts (scoring, risk sizing, trade-plan lifecycle, confluence, backtesting,
guided flows, UI copy) now live across lib/signals/, lib/guided/, lib/risk/, lib/backtest/,
lib/lifecycle/, lib/analysis/, lib/scoring/, and their corresponding app/api/* routes. Anchor
this audit on AGENTS.md's "Cross-platform consistency — standing principle" section: a concept
that exists in one place and plausibly applies to another must be checked there too, and "not
existing everywhere it applies is equal to not existing anywhere." That principle is the lens
for this whole exercise, not just a preamble to quote.

Structure the audit as five parts, in this order:

1. SCANNING CRITERIA BASELINE. Start at lib/scoring/weights.ts (CRITERION_KEYS,
   DEFAULT_CRITERION_WEIGHTS, EXECUTE_SCORE_THRESHOLD/WATCH_SCORE_THRESHOLD) and
   lib/scoring/score.ts. For each of the 9 scored criteria, plus any coarse pre-filter logic in
   lib/marketScan.ts, classify it against GANN_HISTORICAL_SOURCES.md: (a) a direct transcription
   of something Gann disclosed in his own books, (b) a documented reconstruction from his private
   papers/later research (e.g. Square of 9, Gann angles — real, but never published by Gann
   himself), or (c) a GSPS-original technique with no Gann lineage at all (e.g. ADX/DMI). Produce
   a clean inventory table. Note interaction with AGENTS.md's two "Temporary overrides" sections
   (the forced 1Hour execution timeframe, and the Execute-collapse threshold/weight stopgap) —
   describe how they interact with your findings, but do not treat them as bugs to silently fix;
   they're deliberate, user-directed, and have their own revert triggers already documented.

2. PLATFORM-WIDE ALIGNMENT. Sweep every surface listed above (not just the three modules the
   prior audit covered) for places GSPS correctly and consistently implements something Gann
   actually disclosed. Cite specific files/functions.

3. PLATFORM-WIDE DEVIATION. The mirror sweep: places where GSPS's implementation, code comments,
   scoring-criterion naming, or user-facing copy misrepresents a reconstruction or GSPS invention
   AS IF it were Gann's disclosed method (without so labeling it), implements a disclosed
   technique incorrectly or incompletely relative to the primary sources, or — this is the
   cross-platform-consistency violation specifically — implements a concept correctly in one
   module while a sibling module/path that should carry the same concept doesn't (the same shape
   of bug AGENTS.md already documents for harmonicProximity and ADX/DMI). Grep broadly; don't
   assume the prior audit's three-module scope was exhaustive.

4. WHAT TO ADD, platform-wide. GANN_METHOD_COMPLETENESS_AUDIT.md's Part 5 already lists several
   disclosed-but-unimplemented candidates (the Rule of Three, the 3-point rule, the "lost motion"
   stop-buffer concept, the fixed annual calendar cycle, the refined percentage-resistance
   hierarchy, Anniversary Dates). Re-evaluate each at full-platform scope — does it belong only
   in scoring, or also in lib/guided/ (sizing/eligibility), lib/risk/ (stop logic), lib/backtest/
   (replay attribution), or user-facing copy/UI? Then scan for anything else the ten-book read
   surfaced that hasn't been scoped into a candidate yet.

5. WHAT TO REMOVE. Anything currently presented, in code, comments, scoring-criterion names, API
   responses, or UI copy, as "Gann's method" that the primary-source research shows has no
   disclosed basis AND isn't clearly labeled as a reconstruction. Be precise about the removal
   bar: absence from Gann's own published books is NOT sufficient grounds by itself (Square of 9
   and Gann angles are legitimate, well-evidenced reconstructions per GANN_HISTORICAL_SOURCES.md
   B5, not myths to purge) — the bar is misrepresentation/mislabeling, not mere reconstruction
   status. Flag mislabeling; don't recommend deleting a working reconstructed technique just
   because Gann himself never wrote it down.

Ground rules:
- This is an analysis and documentation task. Do not change scoring weights, thresholds, or any
  other code as part of this audit — produce written findings only. If you find something that
  clearly looks like a bug (not just a documentation/labeling gap), flag it prominently in the
  findings rather than fixing it inline, and ask before touching it.
- Name the ROADMAP.md phase (Q1/Q2/Q3/Q4/N/A) this work falls under per AGENTS.md's Git/PR
  workflow rules, since this is research/audit work rather than a roadmap-scheduled initiative.
- Propose where the output should live (a new doc, e.g. docs/GANN_PLATFORM_AUDIT.md, vs.
  expanding GANN_METHOD_COMPLETENESS_AUDIT.md's scope in place) and confirm with me before
  writing the full document — the existing audit doc's title and structure currently promise
  module-level scope, so silently expanding it in place vs. superseding it with a new doc is a
  real choice, not a formatting detail.

Read the instructions above in full and confirm your comprehension of the five-part structure,
the cross-platform-consistency lens, and the analysis-only ground rules before starting the
sweep.
```
