## Hermetic principles & cycle theory — standing background lens

Per the project owner's explicit, standing direction (2026-09-16): the
seven Hermetic principles (Mentalism, Correspondence, Vibration, Polarity,
Rhythm, Cause and Effect, Gender) and the general cycle-theory material in
`docs/GANN_HISTORICAL_SOURCES.md` Part C (Dewey's Foundation for the Study
of Cycles, Tomes' harmonic-resonance cycle theory) are a standing design
lens for this codebase going forward — considered by default in every
session's Gann-adjacent work, not opted into case by case.

**Elevated 2026-09-17 from passive lens to active design input, by project-
owner direction.** These are not background reading to be noted and set
aside. Every Gann-adjacent piece of work — a new criterion, a rebuilt module,
an entry rule, a chart overlay — is to be *designed through* them, and the
design is to say so. Concretely, before building, answer all three in writing
(a module header is the right place, and `lib/gann/entryTrigger.ts` is the
worked example):

1. **Which Gann source discloses this, and at which tier** (`docs/GANN_HISTORICAL_SOURCES.md`).
2. **What the cycle-theory literature says about it** — Part C, Dewey's
   Foundation for the Study of Cycles and Tomes' harmonic-resonance work. Where
   the component makes any claim about periodicity or recurrence, run **Dewey's
   seven-item checklist** explicitly: dominance, regularity of timing,
   repetition count, constancy of period, phase-resumption after distortion,
   wave-shape identity, cross-series clustering. `lib/gann/spectralCycle.ts`
   evaluates three of the seven and says which — that is the standard: state
   which you cleared and which you did not. (Source note, 2026-09-27: these
   seven are a working subset. Dewey's own list in *The Case for Cycles*
   (1967) has 18 criteria. When a cycle claim is actually being *validated*
   rather than designed, also answer three that the seven omit: persistence
   through changed conditions, persistence after discovery (out-of-sample),
   and a mathematical significance test. See
   `docs/memory-bank/sources/C06_dewey_case_for_cycles.md`.)
3. **Which Hermetic principle it expresses** — Mentalism, Correspondence,
   Vibration, Polarity, Rhythm, Cause and Effect, Gender. Correspondence ("as
   above, so below") is why a technique proven on one timeframe or asset class
   is expected to hold on another, and is the reasoning behind the
   cross-platform consistency principle at the top of this file. Rhythm and
   Vibration are why cycle and swing work is load-bearing rather than
   decorative. Polarity is why every rule here has a symmetric short form —
   see `computeGannEntryTrigger`'s mirror.

**What this elevation does NOT change: the citation discipline.** Framing a
design through these principles is required; using them as *evidence* is still
not allowed. They shape what gets built and how it is reasoned about. They
cannot, on their own, move a threshold, a weight, or an architectural
decision — only a citable Gann source or a measured result can do that. A
belief with no citable source, or one that has not cleared Dewey's checklist,
stays where `lib/gann/digitalRoot.ts` sits: real, running, labelled a
hypothesis, confluence-only, never independently gating. Infusing the
literature means reasoning with it, not promoting it to proof. The load-bearing distinction, carried over
unchanged from the "WD Gann precedence" section above: a technique
citably tied to Gann's own methodology (or to the cycle-theory literature's
own rigorous validation standard) gets built and takes precedence over
GSPS's prior, more conservative treatment. A belief about numbers, cycles,
or vibration with no citable source, or that hasn't cleared **Dewey's own
cycle-validation checklist** — dominance, regularity of timing, repetition
count, constancy of period, phase-resumption after distortion, wave-shape
identity, cross-series clustering — stays exactly where `lib/gann/
digitalRoot.ts` already sits today: real, running, clearly labeled as a
hypothesis, confluence-only, never able to independently gate a live
verdict. Building this out is real work for future sessions
(`docs/GANN_METHODOLOGY_FULL_REPORT.md` §18.4 sequences it explicitly:
cheapest/most literal Gann rules first, the astrology/numerology module
family last, after the rest of the system is re-tested) — this section
establishes the mindset and the citation discipline, not a mandate to
build the whole layer in one session.

**Two things this section does NOT do, stated precisely so neither drifts
into becoming assumed history:**

- It does not establish, and no document in this repo establishes, that
  any existing GSPS constant (`TOTAL_POINTS`'s historical value of 9
  scored criteria included) was chosen for Hermetic, vibrational, or
  numerological reasons. That was a live question raised in this session;
  the honest answer, checked against `lib/scoring/weights.ts`'s own doc
  comments and every commit history available, is that it wasn't — the
  criteria count changed repeatedly over time as checks were added,
  retired, and replaced, tracking `CRITERION_KEYS.length` mechanically,
  not a numerological target. Going forward, a Hermetic/cycle-theory
  framing may legitimately *shape new design decisions* (per this
  section); it does not retroactively become the reason past ones were
  made.
- It does not resolve, in either direction, the specific tension between
  `GANN_HISTORICAL_SOURCES.md` B2 (digital-root reduction — "casting out
  nines" — is arithmetic mod 9, true of any multiple of 9 by construction,
  not a market discovery) and Part C's Tomes material (cycle *lengths*
  settling into small integer ratios, a physical-resonance claim). These
  are different claims about different things; Part C provides real,
  separately-testable evidence for the second claim, and doesn't overturn
  the first one's narrower arithmetic point. Cite each for what it actually
  says, not for a combined claim neither source makes on its own.

