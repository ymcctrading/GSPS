# A12 — The Master Calculator (Square of 144, 1953), the circle of 360°, GA-32, and the March 20, 1954 letter's COE and MOF

| Field | Value |
|---|---|
| Tier | **A** for Gann's text: the lesson "Mathematical Formula for Market Predictions / The Master Mathematical Price, Time and Trend Calculator" signed **September 29, 1953** (Master Course Ch. 13); the Master Formula and Calculators course and its 1953-54 brochure; GA-32 (Nov 1935, Ch. 4); his letter to students of **March 20, 1954**. **B** for Myles Wilson Walker, "WD Gann's Letters to Students Explained" Part 3 (2004), Ganntrader 3.0 screenshots, and a studyofgann.blogspot article (Traders World). |
| Copyright | Paraphrase and numbers only. No passage stored. The owner supplied the material on 2026-09-30 (a 35-page PDF, *Collected Writings of W. D. Gann* Vol. 3, and 18 screenshots) and directed that its equations be implemented, not quoted or taught. |
| Read status | All 35 PDF pages (OCR plus every plate viewed) and all 18 screenshots, read line by line on 2026-09-30. Every number was checked against Gann's own arithmetic; misprints are listed below. |
| Built from it | `lib/gann/masterCalculator.ts`, `lib/gann/circleOf360.ts`, `lib/gann/planetaryAverages.ts`, `lib/gann/masterLevels.ts`, the Gann point in `lib/gann/pointScale.ts` |

## 1. The Master Calculator (Square of 144), September 29, 1953

- A transparent overlay laid on a daily, weekly or monthly chart. It reads price and time as positions in a square of 144 × 144, ruled in sections of 9.
- **Why 144.** The square of 12, "the great square", contains every square from 1 to 144.
  - Nine spaces are 9 days, weeks or months, and 9 points on stocks.
  - One column of 144 is 144 points on stocks.
- **The Great Cycle** is 144² = 20,736 days, weeks or months. In days, its halvings are 10,368, 5,184, 2,592, 1,296, 648, 324, 162 and 81 (81 = 9²).
  - In weeks the cycle is 2,962 weeks 2 days. In months it is 681 months 23 days, which the text also calls 56 years 9 months 23 days.
  - A 14-year cycle is two 7-year periods: 168 months, next to 169 = 13².
- **The master numbers** are 3, 5, 7, 9 and 12.
  - He singles out 49–50, 63–64, 84, 90, 108 and the twelves (12 … 144) as important in time and price.
  - Gann's reasons are partly scriptural. Only the arithmetic is used.
- **144 against 360.**
  - 360 = 2½ × 144, and 180 = 1¼ × 144.
  - As fractions of 144: 9 = 1/16, 18 = ⅛, 27 = 3/16, 36 = ¼, 45 = 5/16, 48 = ⅓, 54 = ⅜, 63 = 7/16, 72 = ½, 81 = 9/16, 90 = ⅝, 99 = 11/16, 108 = ¾, 117 = 13/16, 126 = ⅞, 135 = 15/16.
- **Chart order.** The daily chart gives the first indication, the weekly (7-day) chart is next, and the monthly chart matters most for the main trend.
- **Price factors.** Three factors: price; time and volume; and pitch (the angle). Four factors: price, time, volume and velocity. Time comes first, because when time is up volume and velocity increase.
- **Five factors of a bar:** high, low, half-way point, open and close.
  - A close above the half-way point, or near the high, means the trend is up, especially in an active market. Below it means down, at least temporarily.
  - Already built as `disclosedRules.ts#readBarMidpoint`.
- **The strongest points** are ¼, ⅓, ⅜, ½, ⅝, ⅔, ¾, ⅞ and the complete square (36, 48, 54, 72, 90, 96, 108, 126, 144). The more angles cross at a point, the stronger it is.
  - Triangle points: 36, 48, 72, 96, 108 and 144.
  - Squares in the square: 36, 45, 54, 63, 72, 90 and 108, plus the top and bottom.
- **Time and price square.** Price at 36 when time is at 36 means time and price are square, so watch for a change in trend. At 72 the two balance on the 45° line at the half-way point.
- **Where trend changes come:**
  - when time is at ½ of the square, at its end, or at ⅓, ⅔, ¼ and ¾
  - in the square in time of the highest price, the minor highs and lows, the lowest price, and the second or third higher bottom
  - in the time needed to square the range
- **The wheat example.**
  - Low 28¢ (Mar 1852): every 28 months squares it.
  - High of the May option 325 (May 11, 1917): 325 months.
  - May low 44: 44 months.
  - Range 281: 281 months, weeks or days. 2 × 144 = 288, so watch 281–288.
  - 6½ × 44 = 286, within two points of 288.
  - At time 36, the 45° line down from 72 (the inner square) crosses the price line from 36.
- **Hourly.** In very active, wide-range markets an hourly chart gives the first change in trend.
  - At 24 hours a day, 144 hours takes 6 days, and the Great Cycle takes 864 days.
  - At 5 hours a day, 144 hours takes 28 days 4 hours.
- **The angles on the overlay.**
  - Red angles are drawn on the squares of 9, and the inner square is drawn from 72.
  - Green straight lines run at ⅓ of 144 (48, 96).
  - Green 2×1 angles move 2 points per period, and 1×2 angles ½ a point per period. The gap between the green and red angles shows how far price can go.
  - Entering the inner square matters for a change in trend. Breaking a 45° line there shows weakness in proportion to the time from the high or low.
- **Placement.**
  - 0 on the chart's bottom or on the low price; the top on the high price.
  - Or the centre, 72 (the "gravity center"), on a half-way point: half the range, or half the highest price.
  - Place it on all previous highs and lows. Start a new square every 144 units.
  - When prices pass out of one square into another, a change in trend usually takes place.
  - Count leap days. Keep the time from every important top and bottom in days, weeks and months.
- **The May soy beans instructions** (Collected Writings Vol. 3, pp. 16–17).
  - The scale runs 0–144; subtract whole squares.
  - 436¾ is 3 × 144 + 4¾, in the fourth square.
  - 436¾ − 67 = 369¾, which is 81¾ in the third square (81 = 9²).
  - The decline of 235½ is 91½ in the second square; 90 there is strong resistance.
  - The advance of 143½ is at the top of the first square, a selling level.
  - Half-way points: 218⅜, 240⅜ and 319⅛.

## 2. Time Periods and Price Resistance (the circle of 360°), same lesson

- **Gann's order of the divisions:** ÷2 (180, most important), ÷3 (120, 240), ÷4 (90, 180, 270, 360), ÷8 (the 45s), ÷16 (22½), ÷32 (11¼), ÷64 (5⅝).
- **He adds:**
  - ÷6 (60, 300)
  - ÷12 (30, 150, 210, 330), which "works out accurately for time periods"
  - ÷24 (15° steps, about 15 days)
  - the squares 1 to 361 (19²)
- **The table of 64ths:** n × 5⅝ for n = 1 to 64.
- **The method.**
  - Read the points price is up from the extreme and minor lows, down from the extreme and minor highs, and above or below the main and minor half-way points (gravity centers). They form close to the natural degrees.
  - Do the same with time, in weeks and months.
- **Soy beans.**
  - Half-way 251⅞ against 253⅛ (the 45th 64th).
  - ½ of 436¾ = 218⅜ against 219⅜ (the 39th).
  - 44 to 436¾ half-way is 240⅜. 240 is ⅔ of the circle, and 241⅞ is the 43rd 64th.
  - The 44 low is 1 from 45. The 67 low is within ½ of 67½ (12/64, ¾ of 90).
  - A triple bottom formed at 67–69 in three different years.
- **Time.** Dec 28, 1932 to Dec 28, 1947 is 15 years, or 180 months, half the circle. The extreme high came 18 days later, on Jan 15, 1948.

## 3. GA-32 (November 1935): price on the degree of its time angle

- Figuring par ($100) as the circle: $12½ = 45°, $25 = 90°, $37½ = 135°, $50 = 180°, $62½ = 225°, $75 = 270°, $87½ = 315°, $100 = 360°.
- A stock at 50 on the 180th day, week or month is "on the degree of its time angle".
- **U.S. Steel.**
  - At 168 months old (Feb 1915) its low of $38 was near $37½ = 135°: behind time, but in a strong position.
  - The balance price is 168 × 100/360 = $46⅔, so Steel was $8⅝ behind time.
  - $200 is two circles. $261¾ is about $262½, the 225° of the third hundred.
- The Square of 52 course (Ch. 14, 1955) adds that within the circle forms the square, with inner and outer squares and circles proving "the Fourth Dimension". The blog's derivation of solstice and midseason squares from this is Tier B and is not built.

## 4. The letter of March 20, 1954 (the COE average and the MOF formula)

- **Gann's words (Tier A):**
  - The average of the six major planets, heliocentric and geocentric, gives the most powerful points for time and price resistance.
  - The five with Mars left out are of great importance too.
  - Also average the eight planets that move around the Sun: "the first most important odd square" (1 + 8 = 9 = 3²).
  - Students who keep the rules secret will later receive "the very important **COE** AVERAGE, and the **MOF** FORMULA".
- **Correction C-A12-1.** Our A2.3 note and the reports read this as "CE AVERAGE". The letter says **COE**.
- **Walker (Tier B)** decodes them:
  - MOF = (Jupiter + Saturn + Uranus + Neptune + Pluto) / 5, the "mean of five"
  - COE = (Mercury + Venus + Mars + Jupiter + Saturn + Uranus + Neptune + Pluto) / 8, the "circle of eight"
  - averages become a price directly: 90° and 180° average to 135 "degrees, cents or dollars"
  - Gann also used the heliocentric average of Jupiter, Saturn, Uranus and Neptune
- **Ganntrader 3.0 (Tier B)** plots on the S&P 500 "Geo 60 deg Average of 6", "Geo 72 deg MOF, Mean of Five" and "Geo 45 deg CE, Circle of Eight". Its lines are spaced 360/N, which is the wrap-invariant family of a mean of N longitudes.
- **Ephemeris check.**
  - astronomy-engine reproduces the letter's heliocentric Uranus (21°52′ Cancer = 111.87°) to 0.03°.
  - It also shows geocentric Jupiter conjunct Mars on Dec 1, 1948, the day Gann marked on his soy bean chart (B03).
  - The coffee letter's heliocentric Jupiter, which our A2.3 note has as "20°35′ Gemini", computes to 89.7°, which is 29°43′ Gemini. The note's figure is probably an OCR slip for 29°35′, which is also what the letter's "60° from 28° Aries" needs.

## 5. The brochure (1953-54)

- **His last discovery.** During his 76th year Gann "made a new discovery and completed two MASTER CALCULATORS". In spring 1954 he completed a **Master Three-Dimension Chart** showing the relative position of time, price and volume, which produces velocity, and whether the trend is turning fast or slow.
  - The construction is not disclosed in anything read. **Cannot be copied.**
- **Track records.** The trade records and accuracy percentages are promotional and never usable as claims.

## 6. Misprints found (the code computes the values; none is copied)

| Where | Printed | Correct | Check |
|---|---|---|---|
| 144 fractions | 27 = "3/8" | 3/16 | 27/144 |
| Great Cycle weeks | 1/64 = "41 weeks 2 days" | 46 weeks 2 days | 324/7 |
| Wheat | "2 squares of 144 and 17 over" | 37 over | 325 − 288; his next sentence uses 36 |
| Table of 64ths | row 3 "16 5/8" | 16⅞ | 3 × 5⅝ |
| Table of 64ths | row 15 "84 5/8" | 84⅜ | 15 × 5⅝ |
| Table of 64ths | row 34 "101 1/4" | 191¼ | 34 × 5⅝ |
| ÷24 list | omits 255 | 255 | 17 × 15 |
| GA-32 | "82½ = 315°" | 87½ | 315/360 × 100 |
| Soy beans | high "435 3/4" once | 436¾ | only 436¾ gives the stated half-way 251⅞ |
| Great Cycle months | ½ as "28 y 5 m 23 d", "28 y 9 m 23 d", "28 y 5 m 8 d" | 10,368 days | three prints disagree; the day count is exact |
| Calendar vs market days | "155 market days or 144 calendar days" | unclear | not used |

## 7. What is not built yet (parity roadmap)

- **The Square of 90 and Square of 52 calculator instructions** (Ch. 4 of the course) and the May soy beans **Square of 67** (Ch. 5). They are not in the 35 pages supplied.
- **The semi-weekly chart** (Monday open to Wednesday close, Thursday open to Saturday close; p. 19). It is a different 3-day construction from the 1949/1951 counter-move chart that `swingChart.ts` uses, and needs an owner decision on the five-day week.
- **The grain Price-and-Time Circle Chart plate** (24 spokes at 15°, numbers 1–576, dated from Mar 21) and the 1–1089 dated square (p. 34). Both are legible and could be transcribed as test fixtures for G19 (levels at 0/90/120/180 from a prior extreme).
- **Active angles, Jupiter–Saturn aspects, and the Saturn and Mars returns** (AS2–AS4).
- **Planetary lines on the chart overlay.**

## Three-question notes
1. Gann: Tier A throughout, except where marked B.
2. Dewey: every time reading here is a recurrence claim, and none is tested. The planetary averages are an external-forcing claim. All enter as measured factors, and the next replay is their first base-rate test.
3. Hermetic: **Correspondence** is the calculator's premise (one square for price and time; one circle for both). Gann states it himself for the planets; that is recorded as his belief, not as evidence.
