## Astrology — standing decision (2026-09-16, project owner direction)

> **Superseded in part on 2026-10-01** by the owner's decisions recorded in
> "Every Gann method acts" below: astrology from Gann and from Jensen now
> acts, and the "never gate" and "confluence first" rules here no longer
> bind it. The rest of this section (sourcing, the Dewey discipline) stands.

Real historical evidence says Gann himself used astrology (`docs/
GANN_HISTORICAL_SOURCES.md` A2.3's signed 1954 client letter — worked
planetary-degree conversions, dated aspect-based forecasts). GSPS's policy
is nonetheless settled, not open:

**Astrology must never gate a live verdict.** It is not a scored criterion,
not a pass/fail check, and never independently decides Execute/Watch/Avoid.

**It may exist only as a labeled, non-gating confluence signal** — the same
`confluence/context only` treatment `lib/gann/digitalRoot.ts` and
`lib/gann/decadeCycle.ts` already carry — and only if a legitimate, citable
technique can be encoded without inventing numerology GSPS has no authorized
specification for. The existing "no new numerology without an authorized
spec" rule (`docs/GANN_SARA_CONFLUENCE.md`) applies in full to any astrology
candidate: a real planetary-longitude/aspect calculation traceable to a
cited source is admissible as a confluence field; an invented price-to-degree
conversion constant is not, however Gann-flavored it sounds.

**Until such a technique and its citable specification exist, disregard
astrology entirely** — no code, no confluence field, nothing built. This is
the resolution of `docs/GANN_METHOD_COMPLETENESS_AUDIT.md`'s open item on
whether astrology has any place in GSPS at all; check that document's
"Astrology" addendum section if this ever needs revisiting.

**Priority clarified (2026-09-27, project owner direction): astrology is not
low priority where W.D. Gann himself says it is part of his methodology,
our source files (Gann's own and otherwise) corroborate it, and it can be
implemented in GSPS.** It is not placed first either. It ranks alongside
Gann's other techniques, by the strength of its sourcing and how feasible
it is to implement. It is no longer deferred to last: this supersedes the
"astrology last" sequencing in `docs/GANN_METHODOLOGY_FULL_REPORT.md` §18.4
and in the memory-bank report.
- "Gann himself says it" means a technique in his own text, letters or
  charts. Examples:
  - the 1954 soybean letter's heliocentric and geocentric averages of the six
    major planets, and the five-planet average with Mars left out
  - its "active angles" (a planet's longitude, and its squares, trines and
    oppositions, read as price and time)
  - its price-to-longitude placement on the Circle Chart
  - Jupiter–Saturn aspects
  - the Saturn return
  - the 1931 lesson's "30-year cycle caused by Saturn"
  - the 1948 soybean chart's and "Path of Planets" chart's plotted longitudes
  See `docs/memory-bank/` (A2.3, B03, B05). Interpretive decodings (Mikula's
  "natural"/"wise" key words) are leads, not sources.
- "Proven" means Dewey's full standard (`docs/memory-bank/sources/C06_dewey_case_for_cycles.md`):
  - a hit rate against a base rate
  - a significance test with a multiple-comparisons correction
  - out-of-sample persistence on data the rule never saw
  - the rule fixed **before** testing, with no searching across planets,
    orbs or price scales
- **Unchanged until the owner decides otherwise on measured evidence:** a
  proven technique enters as a labelled confluence field first and does not
  gate a verdict. Promotion beyond confluence is a separate, recorded owner
  decision.

**Owner decision, 2026-09-30: the planetary averages act, including the COE
and MOF.** In the owner's words: "There should be absolutely zero gaps between
Gann and GSPS. The CE average as well as the MOF formula should be
implemented ... The algorithmic/equations/methodology need to be
embedded/infused throughout the platform", then "Execute". This is the
recorded decision the bullet above asks for, and it covers the planetary
averages only (AS1). Built in `lib/gann/planetaryAverages.ts`:
- Gann's letter of March 20, 1954 (Tier A) gives the six major planets and the
  five with Mars left out, heliocentric and geocentric, as "the most powerful
  points for time and price resistance", and names the **COE** average (not
  "CE"; owner confirmed 2026-10-16) and the MOF formula. Their definitions, the circle of eight and the
  mean of five, are Tier B (Walker 2004; Ganntrader) and match the letter.
- They act where Gann says they act, as price resistance: each Tier A
  average's nearest points join the S/R list on the live scan and the replay
  (`lib/gann/masterLevels.ts`), so they reach the historical S/R criterion and
  plan stops and targets. They are also measured context factors.
- The Dewey discipline still holds: the rule was fixed before any test (one
  ephemeris, noon UTC, one price unit, the 360/N family, no scale or orb
  search), and the next full replay measures it. If it inverts, presume a
  translation defect first, per "Gann-derived AND measured".
- Not covered by this decision, so still research-only: active angles,
  aspects and returns (AS2–AS4), and any price-to-degree scale other than the
  Gann point. Name them to the owner before building them to act.
- No School lesson teaches them (owner: "we do NOT need to quote, or teach
  them").

