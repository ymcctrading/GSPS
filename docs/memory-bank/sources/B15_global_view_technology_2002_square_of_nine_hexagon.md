# B15 — Global View Technology online help, "Square of Nine" and "Gann Hexagon Chart" (2002)

| Field | Value |
|---|---|
| Filed under | Gann sources, **secondary** (B). Sent by the owner as phone screenshots on 2026-10-01, alongside a link to a sacredtraders.com article on Gann's cube and the Hexagon Chart. That site is blocked by this container's network policy, so the article itself was not read. |
| What it is | Two help pages from a charting-software vendor, © 2002 Global View Technology. Page one shows a Square of Nine (1 to 361, then 1 to 1,089) with worked price and time examples on the S&P 500. Page two shows a Hexagon Chart drawing and reprints Gann's January 1931 Hexagon Chart lesson. |
| Tier | **A** for the reprinted January 1931 lesson, which is Gann's text and already on file as Master Course Ch. 15A/15B (A2.1). **B** for the vendor's own examples and drawings. |
| Copyright | Paraphrase and numbers only. |
| Read status | Every line of the seven screenshots, 2026-10-01. Every example was checked by hand against `lib/gann/squareOf9.ts`'s rule, (√anchor + degrees/180)². |

## Bottom line

- **Gann's lesson:** nothing new. The reprinted January 1931 text matches A2.1 Ch. 15A/15B point for point (§3).
- **The hexagon drawing is not Gann's lost plate.** Its layout matches the Cycles Research Institute workbook (B12) line for line. So `hexagonChart.ts` stays research-only, as recorded in AGENTS.md (orphan audit item 7).
- **The Square of Nine examples are the relative method** GSPS already runs. Its price levels agree with `squareOf9.ts` to within a cell. Two of its listed values are misprints.

## 1. The Square of Nine page

- **Layout.**
  - 1 at the centre with 2 to its right, so the odd squares (9, 25, 49 … 361) run down the lower-right diagonal.
  - Gann's plate has 2 on the left and the odd squares on the lower left (B12). This is the plate's mirror image.
  - Angles are read from the anchor number, so the numbers that come out are the same.
- **Price from 15** (the vendor's example):
  - 17 at 45°, 19 at 90°, 23 at 180°, 28 at 270°, 34 at 360°
  - the rule gives 17.0, 19.1, 23.7, 28.9 and 34.5; the vendor reads the cell at or below each value
- **Angles named as most important:** 45, 90, 120, 180, 240, 270, 315 and 360.
  - The vendor skips 135° and compares the choice to Fibonacci ratios. That is the vendor's framing, not Gann's.
  - On the square, 120° and 240° are not lines. They come from the formula, as thirds of a turn.
  - `circleOf360.ts` already reads thirds on the circle of 360°, where Gann puts them. `squareOf9.ts` keeps the square's eight 45° lines.
- **Time, method 1.** Count the calendar days of a significant swing (high to low, high to high or low to low). Find that number on the square. The numbers on the same angle further out are future swing dates.
  - The worked example is a 39-day swing from low A to low B on the S&P 500 in 2001.
  - The vendor lists 67, 105, 150, 201 and 262 days from the first low.
  - Whole turns, (√39 + 2k)², give 68.0, 105.0, 149.9, 202.9 and 263.9. The listed cells agree to within 2 days.
- **Price, method 2.** From a major low, read the numbers above it on the chosen angles; from a high, read the numbers below.
  - The worked example is the S&P 500 low of 775 on July 24, 2002.
  - Listed: 120° = 815 / 933; 180° = 832 / 952; 240° = 853 / 974; 270° = 861.
  - The rule gives 812.6 / 930.6, 831.7 / 951.0, 851.0 / 971.7 and 860.8. All agree to within 3 points.
  - **Misprints.** The page lists 909 against both 45° and 90°. The rule gives 789.0 / 905.3 at 45° and 803.1 / 920.4 at 90°.

## 2. The Hexagon drawing

- **It is the B12 reconstruction.**
  - The ring completions 7, 19, 37, 61, 91, 127, 169, 217, 271, 331 run in a straight line to the right of 1.
  - 2, 11, 26, 47, 74, 107, 146, 191, 242, 299, 362 run to the left on the same row.
  - Those are the workbook's 0° and 180° lines exactly.
- **Gann's second series bends on it.** The series is 2, 9, 22, 41, 66, 97, 134, 177, 226, 281, 342.
  - On this drawing it sits one cell inside the 60° corner diagonal (8, 21, 40, 65, 96, 133) and drifts toward 60° as the rings grow.
  - Gann's text puts it on "90°, or 60° and 240°", which fits the 60° reading.
  - It does not resolve his statement that 66 falls on 180°, the question that keeps `hexagonChart.ts` research-only.
- **What a check would need.** A Gann-drawn hexagon would settle it. A third modern redraw from the same text cannot.

## 3. The reprinted January 1931 lesson, checked against A2.1 Ch. 15A/15B

Every number agrees with the A2.1 note. In order:

- **Ring completions** 1, 7, 19, 37, 61, 91, 127, 169, 217, 271, 331, 397. Each ring gains 6 more than the last, so the gains are 6, 12, 18 … 66.
- **7** is important as a day, week, month and year count.
- **127 months** is 10 years 7 months, the length of some campaigns.
- **169 months** is 14 years 1 month, double the 7-year cycle.
- **271** sits at the third 90° point (¾ of a circle).
- **66 months.** Campaigns culminate in the 60th month, react, then make a second top or bottom in the 66th month. 66, 67½ and 68 are "doubly strong".
- **360 on the hexagon** is a hard point to pass: one campaign ends and the next begins.
- **Moves get faster the higher price goes.** Above 120, and especially 127, price leaves the first hexagon. The strong angles spread apart, so moves run faster (for example 162 to 169).
- **22½ in price or in time** strikes the 22½° angle. The higher the level at which an angle is struck, the greater the resistance.
- **The cube of the 20-year cycle, 1° a month:**
  - 60° = 5 years (the bottom)
  - 120° = 10 years
  - 180° = 15 years (half built, strongest resistance)
  - 240° = 20 years (completes the 20-year cycle)
  - 300° = 25 years (repeats the first five)
  - 360° = 30 years (completes the top)

One phrase is worth recording against A13. In this lesson Gann calls the 1°-a-month count on the 45° angle **"our Time Factor"**. It is a dated, disclosed use of the words "time factor" for the count of one degree per unit of time. Under A13's terminology caution, it is not evidence that this count is *the* Master Time Factor.

## 4. What GSPS takes from it

- **Nothing to change in code.** `squareOf9.ts` already runs the relative price method, and its eight 45° lines are the square's own.
- **The vendor's "first swing, then whole turns" time method is not built.**
  - It is not in Gann's text. His lesson lists the spoke numbers from the centre as time factors, which is what `squareOfNineTime.ts` reads.
  - Building it would add a technique sourced only to a 2002 vendor. Held for the owner.
- **The hexagon's text-stated time counts are disclosed in Gann's own words and do not depend on the lost plate:**
  - the ring completions
  - the second series
  - 60 and 66 months
  - 127 and 169 months

  None runs on the live scan or the replay today. `hexagonChart.ts` holds them, research-only. Wiring them as time counts, the way the Square of Nine's spoke numbers are wired, is a candidate under the owner's 2026-09-30 direction to put confirmed rules to work. Proposed, not built (GANN_CYCLES_HERMETIC_MASTER_REPORT Part V, gap G26).

## Three-question notes

1. **Gann:** Tier A for the 1931 lesson, already on file. Tier B for the vendor's methods and drawings.
2. **Dewey:** the vendor's two S&P 500 examples are single, hand-picked illustrations. They clear no checklist item.
3. **Hermetic:** Correspondence. The lesson reads one figure as both price and time (22½ points and 22½ days strike the same angle).
