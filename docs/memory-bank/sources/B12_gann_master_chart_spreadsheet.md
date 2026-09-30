# B12 — "Gann Master Chart.xls" (Utaro Hayashi, Chicago; via the Cycles Research Institute)

| Field | Value |
|---|---|
| Filed under | **W.D. Gann sources** (owner, 2026-09-30) |
| Provenance | Obtained from the **Cycles Research Institute**, the same source as the Dewey and Tomes material in Part C, and vouched for by the project owner (2026-09-30). The file's own metadata agrees: created 6 March 2001, last saved 15 April 2001 by "Ray Tomes" (the Institute's founder); author credit in the sheets "Created by Utaro Hayashi, Chicago, Illinois USA"; Japanese code page. |
| Files | Drive: `Gann-Master-Chart.rar` and `Gann-Master-Chart.zip` each hold one file, `Gann Master Chart.xls` (452,608 bytes, dated 2004-10-26). The two copies are byte-identical (SHA-256 `00c0f483…98a`). There is no PDF conversion in Drive; the workbook is the file. |
| Tier | **A for the Square of Nine layout and its date/time labels**, which reproduce Gann's own plate cell for cell (checked against the plate on p. 34 of *Collected Writings of W. D. Gann* Vol. 3, source note A12). **B for the Price/CF/Step inputs and the Hexagon sheets**, which are Hayashi's construction (Gann's hexagon plate is lost). |
| Read status | **Read in full, 2026-09-30**: all six sheets, every value, every label, all 7,392 formulas (decoded from the raw workbook records; LibreOffice could not open the file), the defined names and the cell highlighting. Supersedes the 2026-09-27 inspection. |

## The six sheets

| Sheet | What it is | Size |
|---|---|---|
| SQ9 Price-1 | Gann's Square of Nine, 1 to 1,089 (33 × 33), with the angle lines highlighted | 1,089 cells |
| SQ9 Price-2 | The same square, no highlighting | 1,089 cells |
| SQ9 Time-1 | The same square with a start **date** at the centre, angle lines highlighted | 1,089 cells |
| SQ9 Time-2 | The same, no highlighting | 1,089 cells |
| Hexagon-Price | A hexagonal spiral, 1 to 1,518 | 1,518 cells |
| Hexagon-Time | The same with a start date at the centre | 1,518 cells |

## The Square of Nine sheets

- **The formula.** Every cell is `Price × CF + Step × (n − 1)`, where n is the cell's number on the spiral.
  - The centre holds `Price × CF`. The inputs default to Price = 1, CF = 1, Step = 1, which gives the plain numbered square.
  - On the Time sheets, Price is a start date (entered YYYY/MM/DD), and Step is in days.
- **The layout** is Gann's plate:
  - 1 at the centre, 2 to its left, spiralling so the rings end in 9, 25, 49, 81 … 1,089 (the odd squares) on the lower-left diagonal.
  - Top row 993 → 1,025; bottom row 1,089 → 1,057.
- **Orientation.**
  - East is on the **left** (0°/360°, March 21, 6:00 AM).
  - North is at the top (90°, June 21, noon), West on the right (180°, September 22, 6:00 PM), South at the bottom (270°, December 21, midnight).
  - Angles run from East up through North.
- **The eight main lines** (every 45°) run through these numbers, which match Gann's own spoke lists in the 1931 lesson (A2.1 Ch. 2):

  | Angle | Numbers on the line |
  |---|---|
  | 0° | 2, 11, 28, 53, 86, 127, 176, 233, 298, 371 |
  | 45° | 3, 13, 31, 57, 91, 133, 183, 241, 307, 381 |
  | 90° | 4, 15, 34, 61, 96, 139, 190, 249, 316, 391 |
  | 135° | 5, 17, 37, 65, 101, 145, 197, 257, 325, 401 |
  | 180° | 6, 19, 40, 69, 106, 151, 204, 265, 334, 411 |
  | 225° | 7, 21, 43, 73, 111, 157, 211, 273, 343, 421 |
  | 270° | 8, 23, 46, 77, 116, 163, 218, 281, 352, 431 |
  | 315° | 9, 25, 49, 81, 121, 169, 225, 289, 361, 441 (the odd squares) |

- **The 22.5° lines.** The highlighting (193 cells) marks 16 lines at every 22.5°.
  - On even rings the 22.5° line takes the cell half-way between the 0° and 45° cells. This is an angle measured as a fraction of the way round the ring, not a drawn straight line: a 22.5° line never passes exactly through cell centres.
  - This is the convention for reading the square's intermediate angles.
- **The date and time labels, one every 22.5°** (the plate's own; checked against p. 34 of Vol. 3):

  | Degree | Date | Clock |
  |---|---|---|
  | 0 / 360 | Mar 21 | 6:00 AM |
  | 22.5 | Apr 12 | 7:30 AM |
  | 45 | May 5 | 9:00 AM |
  | 67.5 | May 27 | 10:30 AM |
  | 90 | Jun 21 | 12:00 noon |
  | 112.5 | Jul 14 | 1:30 PM |
  | 135 | Aug 5 | 3:00 PM |
  | 157.5 | Aug 31 | 4:30 PM |
  | 180 | Sep 22 | 6:00 PM |
  | 202.5 | Oct 15 | 7:30 PM |
  | 225 | Nov 8 | 9:00 PM |
  | 247.5 | Nov 30 | 10:30 PM |
  | 270 | Dec 21 | 12:00 midnight |
  | 292.5 | Jan 13 | **1:30 AM** |
  | 315 | Feb 4 | **3:00 AM** |
  | 337.5 | Feb 28 | 4:30 AM |

  - Two conventions sit on one wheel:
    - the solar year in sixteenths, starting at the spring equinox
    - the day as 24 hours at 15° an hour (1.5 hours per 22.5°), starting at 6 AM
  - **Workbook error:** the sheets label 292.5° and 315° "PM". Gann's plate reads **AM** for both, which is also what the 15°-an-hour rule gives. Use the plate.
  - The 45° dates (May 5, Aug 5, Nov 8, Feb 4) are the midseason points of the Master Course (Ch. 14, 17, 18), already in `seasonalCounts.ts`.
  - **The sixteenths (Apr 12, May 27, Jul 14, Aug 31, Oct 15, Nov 30, Jan 13, Feb 28) are not in GSPS.** Gann's 1951 lesson gives 1/16 of a year (≈ 23 days) as why moves often run three weeks to a month.

## The Hexagon sheets

- **The formula.** The centre holds `Price × CF` (`Time × CF` on the time sheet). Every other cell is the previous cell `+ Step`, walking the hexagonal spiral out to 1,518.
  - **Workbook error:** the defined name `Step` points at the Hexagon-Price sheet's step (`'Hexagon-Price'!$B$3`), so the Hexagon-Time sheet ignores its own Step input.
- **Labels** every 30°: 0°/360° on the right, 90° top, 180° left, 270° bottom.
- **Lines from the centre** (cell spacing: two columns across, one row up = one step):

  | Angle | Numbers |
  |---|---|
  | 0° | 7, 19, 37, 61, 91, 127, 169, 217, 271, 331 … (the ring completions, 3n² + 3n + 1) |
  | 60° | 8, 21, 40, 65, 96, 133, 176, 225, 280, 341 |
  | 120° | 9, 23, 43, 69, 101, 139, 183, 233, 289, 351 |
  | 180° | 2, 11, 26, 47, 74, 107, 146, 191, 242, 299 |
  | 240° | 4, 14, 30, 52, 80, 114, 154, 200, 252, 310 |
  | 300° | 6, 17, 34, 57, 86, 121, 162, 209, 262, 321 |
  | 30°, 90°, 150°, 210°, 270°, 330° | every other ring only (e.g. 90°: 22, 67, 136, 229, 346) |

- **Checks against Gann's text** (Master Course Ch. 15A/B):
  - The ring completions 1, 7, 19, 37, 61, 91, 127, 169 on one line from the centre: **confirmed**, and matches `lib/gann/hexagonChart.ts`.
  - Gann's second series 2, 9, 22, 41, 66, 97, 134 "on the same angle": its bearing drifts, at 180°, 120°, 90°, 79.1°, 73.9°, 70.9°, 68.9°. So "66 on 180°" does not hold on this layout.
  - Whether it held on Gann's lost plate cannot be checked. `hexagonChart.ts` stays research-only, as recorded in AGENTS.md (orphan audit item 7).

## What this adds to GSPS (gaps; items 1–3 built 2026-09-30 on the owner's "execute")

Items 1–3 are built: `seasonalCounts.ts` (sixteenths), `squareOfNineTime.ts`
and `dayCircle.ts`. For item 3 the owner's direction was "I always defer to
Gann's method": the clock is used exactly as the plate draws it (0° = 6:00 AM,
15° an hour, New York time), not re-centred on the market's open.

1. **The sixteenths of the seasonal year** as time points: Apr 12, May 27, Jul 14, Aug 31, Oct 15, Nov 30, Jan 13, Feb 28. They are missing from `seasonalCounts.ts`, which stops at the eighths.
2. **The Square of Nine in time.** Put a pivot's date at the centre, step one day (or week) per cell, and the dates on the angle lines are time points.
   - Gann says the square's spokes are "great resistance points and measuring out important time factors" (A2.1 Ch. 2).
   - The plate and the Time sheets are built for it.
   - `squareOf9.ts` has price levels only.
   - With a step of one day, the 45° line gives days 2, 12, 30, 56, 90, 132, 182, 240, 306 from the pivot; the 90° line gives 3, 14, 33, 60, 95, 138, 189, 248, 315.
3. **The day as a circle**, 15° an hour from 6 AM, for intraday time.
   - This is the plate's clock, and Gann's "day quarters" (sunrise, noon, sunset, midnight; Ch. 14).
   - Nothing in GSPS reads intraday time as degrees. It needs an owner decision on which clock applies to a market that opens at 9:30 ET.
4. **Refinement, not a defect: exact cells versus the formula.**
   - `squareOf9.ts` uses the continuous rule (√price + degrees/180)². The plate is the discrete spiral.
   - They agree closely at the price scale GSPS reads in (25–300 Gann points); for example, from 31 one turn on is 57.3 by the formula and 57 on the plate. They drift apart only on the first few rings.
   - An exact cell lookup could replace the formula if the owner wants the plate itself.

## Three-question notes
1. **Gann:** the square's layout, spokes and date/time labels are Gann's plate (Tier A via Vol. 3 p. 34). The inputs and the hexagon are Hayashi's (Tier B). The provenance, the Cycles Research Institute, is trusted by the owner.
2. **Dewey:** the sixteenths and the square-in-time dates are recurrence claims, untested against a base rate; if built, they enter as measured context first.
3. **Hermetic:** **Correspondence**, one wheel read as price, as the year and as the day. The plate states this more literally than anything else in the files.
