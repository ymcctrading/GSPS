# B19 — Myles Wilson Walker, *Super Timing: W. D. Gann's Astrological Method* (1999)

| Field | Value |
|---|---|
| Filed under | Gann sources, **secondary** (B). Walker's reading of Gann's astrology; not Gann's text. |
| Source | Drive `pdfcoffee.com-walker-myles-wilson-super-timing-wdganns-astrological-methodpdf.pdf` (id `1p2F7oxayZIikhsiQG5C6eai699MWT3bz`, 9,812,456 bytes), in "WD Gann (books)", added 2026-10-25. Scanned, 186 pages. |
| Read status | **Read in full from the scan, 2026-10-30** (recorded in `docs/agents/04-gann-research-memory.md` and `docs/PLANETARY_TIMING.md`; this catalogue file added 2026-11-07, when a verification found the work missing from the index). |
| Tier | B, interpretive. Astrology, so it is outside the GSPS 2.0 core test's scope by that handoff. |
| Copyright | Paraphrase; short phrases quoted only where load-bearing. |

## What it claims (as tested)

- **The figure (p.149):** a trine must be present, with a conjunction at one end, or linked by a square or an opposition to another body (one planet in both), the aspects "balanced" (equal orbs; "balanced by 5*", pp.73–76).
- **The Moon as timer (p.159):** "The Moon is often the crucial part of Gann's trades because it acts as the timer"; 1° on the Moon is "insignificant".
- **Jupiter's ingress (p.81):** a potential trigger for a trend change; "things usually don't get moving until the planet changes to 1 degree of a new sign".
- **The "once only cycle" (pp.123, 127):** on a retrograde loop, Jupiter's return to the degree where it stood at a turn marks the next cycle low.
- Price methods (the hexagon chart, the "1908" targets) and the "clock" sequence (p.160, "an idea worth looking at further", no fixed rule) were not built.

## Measured

Four rules fixed before scoring, 28 tests (Gann's 52 published calls, Dow 9-point and 3-day turns 1913–1948, SPY and DIA 2016–2025). **None beats chance** (best p 0.011 against a corrected bar of 0.0018). The figure marks 50–62% of days, so it cannot pick out a turn. Code: `lib/research/superTiming.ts` (research only); run: `docs/replay-runs/2026-10-30-super-timing.json`; table: `docs/PLANETARY_TIMING.md`.
