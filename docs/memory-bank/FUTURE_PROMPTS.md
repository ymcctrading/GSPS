# Future prompts

Research prompts the project owner has written and deliberately deferred. Each one says when it may start. Don't run a prompt here before its start condition is met. When one is run, record the outcome in the master report or the parity roadmap and mark the prompt done here.

---

## Deferred: cycles and calendar research

**Status:** deferred, saved 2026-09-27.

**Start condition:** don't start until Stages A–E of `GANN_PARITY_ROADMAP.md` are complete. It belongs to Stage F (timing refinements and research).

**Why it waits:** it is research into how Gann's time counts are anchored, and its test design depends on the rebuilt trend engine and the measurement items (M4, M7) being in place. Running it earlier would test the calendar against a platform whose swing charts and exits are still changing.

### The prompt (as written by the project owner, with the owner's 2026-09-27 constraint edits)

Context: GSPS is a trading platform built to faithfully copy W. D. Gann's method. A previous session read every Gann, Observation of Cycles and Hermetic source and saved synthesis notes (no book text) in docs/memory-bank/. Start by reading:
- docs/memory-bank/GANN_CYCLES_HERMETIC_MASTER_REPORT.md (Parts I, II and V, especially M4–M7)
- docs/memory-bank/GANN_PARITY_ROADMAP.md
- docs/memory-bank/sources/C01–C07 (Tomes, Dewey, Halberg)
- docs/memory-bank/sources/A02_A04_truth_of_stock_tape_1923_and_stock_selector_1930.md
- docs/memory-bank/sources/A07_face_facts_america_1940.md
- docs/memory-bank/sources/A09_45_years_in_wall_street_1949.md
- docs/memory-bank/sources/A08_how_to_make_profits_in_commodities.md
- lib/gann/timeCycles.ts (FIXED_CALENDAR_WINDOWS, MAJOR_CYCLE_YEARS)

Background already established:
- Gann counted his seasonal time from the spring equinox (Mar 20/21), not Jan 1.
- His "permanent cycle which does not change" (Stock Selector, 1930) is eight windows: Feb 8–10, Mar 21–23, May 3–7, Jun 20–24, Aug 3–8, Sep 21–24, Nov 8–11, Dec 20–24. That is the solar year in eighths: the equinoxes, the solstices and the points midway between them. The early-February window also matches the Chinese solar term Lichun (~Feb 4).
- His dated forecasts by his undisclosed "Master Time cycles" were mixed. The 1929 forecast was a hit he chose to reprint. The 1940 forecast in Face Facts America! mostly missed: war over by May 1941, post-war deflation and a US bankruptcy.
- No source read so far shows Gann using a 13-month, 28-day calendar.

Questions:
1. Using the Observation of Cycles notes (Dewey, Tomes, Halberg), with page references from the notes, answer three things:
   a. Do they explain why the solar year, and specifically the equinox, is a sound anchor for Gann's time counts?
   b. Do they explain why Gann's dated forecasts could miss even if the underlying cycles are real (distortion, phase shifts, inversion, repetition count, persistence after discovery)?
   c. Do they support or undermine his 100-year and 20-year cycles?
   Separate what the sources actually say from inference.
2. Do Tomes' harmonic-ratio findings support Gann's division of the year into ½, ¼ and ⅛ (anniversary > ½ year > ¼, ¾ > ⅓, ⅔ > ⅛s)?
3. Design, but do not run unless I approve, a pre-registered test.
   - Rescore every dated window in Gann's 1929 and 1940 forecasts, and the eight permanent-cycle windows, under three year conventions:
     - calendar year from Jan 1
     - solar year from the Mar 20/21 equinox
     - a 364-day (13×28) year
   - Score each against historical turning points with a base rate and a multiple-comparisons correction.
   - Fix the rules before testing.
   - State Dewey's checklist items the test would clear.
4. Say whether any of this should change the parity roadmap (for example the M4 and M7 measurement items, or G8 "seasonal counts from Mar 20/21"), and propose the exact edits.

Constraints:
- Follow AGENTS.md: the three-question mandate (Gann source / Dewey–Tomes / Hermetic principle), and "WD Gann precedence".
- Cycle theory and Hermetic framing shape design but are never evidence on their own. Nothing gates a verdict without measurement.
- Astrology stays research-only and is not used for charting.
- No copyrighted book text in the repo. Synthesis only.
- Do not change production code. Documentation updates only, on a feature branch with a PR marked Roadmap phase N/A.
- Report findings plainly, including where the sources don't support an idea.
