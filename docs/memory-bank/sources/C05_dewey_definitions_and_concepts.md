# C05 — Edward R. Dewey, "Definitions and Concepts Used in Cycle Study" (Cycles magazine, May 1965; CRI reprint, 6 pp.)

| Field | Value |
|---|---|
| Tier | C (cycle-theory literature; Dewey, founder of the Foundation for the Study of Cycles). Not Gann. |
| Copyright | In copyright. Synthesis only. |
| Read status | **Read in full** (2026-09-27) |

## Content (synthesis)
- Dewey defines cycle vocabulary **concept-first**, arranged as a hierarchy of narrowing meaning, each with a contrasting concept:
  1. **Order** (vs chaos). Dewey: the universe as "fulfilment of the law."
  2. **Pattern** (vs unpattern). Any arrangement revealing design; one of the prime constituents of the universe.
  3. **Pattern in time** (vs pattern in space). Only this concerns cycle study.
  4. **Cyclic** (returns to its starting state) vs **non-cyclic** (e.g. population growth, which never returns). Popular word: *fluctuation*.
  5. **Repetitive** (many cycles) vs **single** (one wave). No regularity of timing is implied yet.
  6. **Recurrent events** run parallel to repetitive cycles. They are **discrete yes/no events** (eruptions, earthquakes), not sequences.
     - They **need different statistics**.
     - Repetitive cycles may themselves be **triggered by recurrent events**.
  7. **Ordered vs random.** Crucially this concerns the regularity of the **period/interval**, **not serial correlation**. Prices are serially correlated (tomorrow ≈ today), which is *not* evidence of ordered cycles.
  8. **Rhythmic**: reasonably regular spacing, a relative matter measurable as a regularity index (e.g. "80%"). Random series can also show rhythm by chance.
  9. **Periodic**: completely regular, the limiting case.
     - Chance can still produce apparent periodicity. A coin tossed H T H T H T shows three "periods" and means nothing. Longer patterns (5 heads then 5 tails) are much less likely to repeat by chance.
- "Regularity not the result of chance ⇒ predictability. Predictability is what we are all after."

## GSPS relevance
- **Terminology discipline for code and docs.** Most Gann time rules in `lib/gann/` are *rhythmic windows* (e.g. 2–5 weeks, 35–49 months), not *periodicities*. Headers should say "rhythm" or "window" unless a fixed period is actually claimed and tested.
- **Recurrent events vs cycles.** Anniversary and seasonal dates (`timeCycles.ts` fixed annual calendar; Gann's Mar 21 / midseason points) are **recurrent events**: discrete dates, yes/no hits. Swing and wave periods are **repetitive cycles**. These need different validation:
  - hit-rate against a base rate for events
  - spectral or period statistics for cycles
- **Serial correlation ≠ ordered cycles.** This warns against treating autocorrelation in returns or closes as cycle evidence. `spectralCycle.ts` should keep detrending (it does), because trend and autocorrelation create spurious low-frequency power (Awodele's pitfall list, B01).
- **Short-cycle chance caution.** The coin example is Dewey's own argument for the **repetition count** item. Two or three repetitions of a short pattern mean little. This is relevant to any "rule of three" style count (`ruleOfThree.ts`): Gann's 2–3-close runs are *entry rules*, not cycle claims, and should not be described as periodicities.

## Three-question notes
1. **Gann:** not a source. It supplies the vocabulary for describing Gann's time rules precisely.
2. **Dewey checklist:** this is the **conceptual foundation** of the checklist:
   - order vs chance ⇒ dominance / significance
   - rhythm ⇒ regularity of timing
   - periodicity ⇒ constancy of period
   - the coin example ⇒ repetition count
3. **Hermetic:**
   - **Rhythm** is the direct fit, since Dewey's hierarchy formalises "the pendulum swing."
   - **Mentalism** in Dewey's framing of order and pattern as fundamental constituents of the universe ("fulfilment of the law"). Recorded as *framing*, not evidence.
   - **Cause and Effect** in the note that cycles can be triggered by recurrent events.
