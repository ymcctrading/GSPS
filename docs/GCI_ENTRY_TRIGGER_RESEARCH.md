# GCI intraday entry-trigger citation research

**Status:** research note, no code change. Answers the open question left in
the Gann Composite Indicator (GCI) design proposal's Section 5 ("The open
problem for the intraday tier: entry trigger speed"). That proposal was
delivered to the project owner as a PDF on 2026-09-23 and is not committed to
this repo; this note exists so the finding survives independently of that PDF.

## The question

The GCI's Expert/Wall Street (intraday) tier needs a faster entry trigger
than `lib/gann/entryTrigger.ts`'s current swing-crossing rule, which needs
"roughly 10+ bars containing real reversals" per AGENTS.md — too slow for a
15-minute or 5-minute chart. Two options were named: (1) a citable, faster
Gann source, or (2) an explicitly-labelled engineering fallback running the
same construction on faster bars.

## What the source catalog actually says

`docs/GANN_HISTORICAL_SOURCES.md` lines 355–362:

> **The 3-Day Chart and 9-Point Swing Chart methods** (Ch. VII) — plot only
> reversals of ≥3 calendar days (with narrow exceptions near extremes), or,
> separately, only reversals of ≥9 points on the DJIA; crossing the last
> 3-day or 9-point top/bottom is the trend signal. This is the direct,
> literal ancestor of GSPS's already-implemented `lib/gann/swingChart.ts`.

Two things follow directly from this text:

1. **The disclosed threshold is a calendar/point count, not a bar count.**
   Gann's own construction is tied to elapsed calendar days or a fixed DJIA
   point move — not "N candles" on an arbitrary timeframe. Reinterpreting it
   as "N bars" on a faster chart (which is what any intraday version would
   need to do) is already an act of translation, not a literal port, exactly
   the same category of choice `lib/gann/trendStrength.ts`'s header already
   calls out for the daily 3-day/9-day construction it uses today.
2. **No faster-degree variant is cited anywhere in the catalog.** I searched
   `docs/GANN_HISTORICAL_SOURCES.md` for `intraday`, `scalp`, `short swing`,
   `1-day chart`, `hourly`, and `degree` — no result names an intraday or
   sub-daily version of the swing-chart method.

Separately, the same document (lines 268–274) records that the swing-chart
construction chapter itself, across the commodity-specific chapters, is
**"genuinely unreached... a confirmed data-access limit, not an unattempted
gap."** So the honest status is **not found**, not **does not exist** — a
faster-degree citation may be sitting in unextracted source material. This
distinction matters and should not collapse into "no source" in a future
summary.

## Conclusion (per Section 5 of the GCI proposal)

No citable fast-intraday Gann source is currently in hand. The only
defensible path today is **Option 2**: run the existing 3-bar/9-bar swing
construction against faster base bars (e.g., 5-minute or 15-minute), labelled
explicitly as an engineering choice of degree, not a new Gann citation —
matching the precedent already set and documented in
`lib/gann/trendStrength.ts`'s header ("Gann gives the chart construction,
not a lookback or tolerance for reading it").

**This does not authorize building it yet.** Per AGENTS.md's "Gann-derived
AND measured" rule, a criterion built this way still needs to be measured
against real outcome data before it can gate anything live — and per the
"design-through-the-lens" three-question requirement, the actual module
(when built) needs its own header answering source/cycle-theory/Hermetic
questions the way `lib/gann/entryTrigger.ts`'s header already does, not a
copy of this note.

## Open follow-up

If a future session gets access to the unreached commodity-chapter portions
of the 3-Day/9-Point source material (see the data-access-limit note above),
re-check for a disclosed faster degree before assuming Option 2 is final.
