# B18 — James Flanagan, *W. D. Gann's Master Time Factor Revealed* (three pages, read 2026-10-28)

| Field | Value |
|---|---|
| Filed under | Gann sources, **secondary** (B). One researcher's reading of Gann's Master Time Factor. |
| Source | Three page images the owner sent on 2026-10-28 in the "Feed 15-minute scans to intraday scanner" thread, read there after enlarging. |
| Tier | B, interpretive. Gann never disclosed the Master Time Factor (A13); this is a reconstruction. |
| Copyright | Paraphrase only. |

## What it claims

1. The Master Time Factor is the annual forecast built from yearly cycles, the first of Gann's "twelve things to look up before you make a trade" (his own list says the annual forecast fixes the year of the time cycles, bull or bear).
2. Lay the same decade years back over the current one, find the cycle whose past tops and bottoms line up best (the "dominant cycle"), and forecast from it.
3. Major cycles: 150, 120, 100, 90, 82-84, 60, 50, 40, 30, 20, 15 and 10 years. Lesser cycles: 14, 13, 9, 7, 5, 3, 2 and 1 year.

## Checked against Gann's own text (2026-10-28)

Read against `/mnt/project-files/literature-reading-output/` (the Master Course is W023 in `external/checkpoint_v7/`) and this folder's A-notes.

| Cycle | Gann's own page | Verdict |
|---|---|---|
| 9 years | January 1955 list, Master Course Ch. 14, PDF 387 | Gann's. Carried into P1. |
| 13 years | None. His 13 is the square of 13 in months (169) beside the 14-year cycle (1953 Square of 144 lesson, Ch. 13) | Flanagan's. Not built. |
| 14 years | 1955 list; "always very important because it is 2 seven-year periods" (Ch. 13) | Gann's. Carried into P1. |
| 40 years | 1955 list; "why the children of Israel were 40 years in the wilderness" (Ch. 14) | Gann's. Carried into P1. |
| 82-84 years | 84 in the November 1935 lesson (Ch. 7, PDF 219) and the 1955 list | Gann's (84). Read on the market's record. |
| 90 years | 1955 list, "the Great Cycle" | Gann's. Read on the market's record. |
| 100 years | *Commodities* p. 224 (1841-1850 expected to repeat in 1941-1950); *Face Facts* (1940); *Tunnel* pp. 79-81 | Gann's. Read on the market's record. Dewey's repetition count fails (one repetition, F4 1c). |
| 120 years | None (his 120 is months, the 10-year cycle) | Flanagan's. Not built. |
| 150 years | None (his "150-year research job" is a calculator advertisement, not a cycle) | Flanagan's. Not built. |
| Dominant cycle | Gann laid the decades back and named the one he expected to repeat ("I expect the 1896 cycle to repeat in 1936", Ch. 7, PDF 227-228) | Gann's step; the choosing measure is Flanagan's idea and GSPS's engineering. Built as a measured factor only (`lib/gann/dominantCycle.ts`). |

The rest of Flanagan's list (1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 60) was already GSPS's, from the 1935 lesson.

## What GSPS built from it

- P1's yearly counts read every lesson's list, the 1955 list's 9, 14 and 40 years among them (`timeCycles.ts#pillarYearCycleConvergence`), on the stock's 61-year monthly record, live and replay alike.
- The market's 84-, 90- and 100-year counts on the long record (`eightyFourYear.ts#marketCountHits`) count in P1's cycle check for a stock.
- The dominant decade (`dominantCycle.ts`) is context and the factor `dominantCycleWithTrade`. On the record (1945-2025) it called the month right 53.4% of the time against 57.3% for the decades' average, so P1 keeps the average.
- Nothing here is user-facing.
