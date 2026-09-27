# B12 — "Gann Master Chart.xls" (Utaro Hayashi, Chicago; Excel workbook inside a .rar)

| Field | Value |
|---|---|
| Tier | B (modern reconstruction tool, not a Gann artifact) |
| Read status | **All six sheets inspected** (2026-09-27): SQ9 Price-1/2, SQ9 Time-1/2, Hexagon-Price, Hexagon-Time |

## Content
- **Square of Nine sheets:** a numbered spiral (…993 at the outer ring) with inputs Price, CF (conversion factor) and Step. Angle labels (45°, 67.5° …) are attached to cells, and date labels (e.g. "05/05 09:00AM 45.0°", "05/27 10:30AM 67.5°") map cells to calendar time. ⇒ The price ↔ time wheel convention (1 cell = 1 unit of price or of time, with a user-chosen step).
- **Hexagon sheets:** a centred hexagonal spiral out to about 1,490, labelled at 60/90/120/150/180/210/240/270/300°.

## Checks against Gann's own text and GSPS code
- **Ring completions:** 1, 7, 19, 37, 61, 91, 127, 169 lie on one straight radial line from the centre (0°) in Hayashi's layout. This matches Gann (Master Course Ch. 15A/B) and `lib/gann/hexagonChart.ts` (3n² + 3n + 1). **Confirmed.**
- **Gann's second series 2, 9, 22, 41, 66, 97, 134…** ("all on the same angle of 90°, or an angle of 60° and 240° as measured by the Hexagon Chart"): in Hayashi's layout they fall on a **straight lattice line offset from the centre**. Their bearing from the centre drifts: 2 at 180°, 9 at 120°, 22 at 90°, then 79°, 74°, 71°, 69°. So they do **not** share a single radial angle.
  - ⇒ Whether "66 is on an angle of 180° on the Hexagon Chart" (Gann's cross-construction claim) holds **depends on the unrecoverable layout of Gann's lost plate**. Hayashi's reconstruction does not reproduce it.
  - **This supports keeping `hexagonChart.ts` research-only** (its current exception). No change recommended.
- **Square of Nine:** consistent with `squareOf9.ts` (see the B03b note on the 180° = +1-root convention).

## Three-question notes
1. Tier B tool. It cannot substitute for the lost Gann illustrations.
2. Dewey: none.
3. Hermetic: **Correspondence** (price ↔ time on one wheel).
