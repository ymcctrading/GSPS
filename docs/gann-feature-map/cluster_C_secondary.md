# Cluster C: rules attributed to Gann in the secondary and vendor works (tier C)

Compiled 2026-10-15. The input was the reading notes only: `works/W###/summary.md`, `detailed-notes.md` and `visuals*.md`, plus `collection-synthesis.md` and `unresolved-items.md`, all read-only. The source PDFs were not reopened. Page numbers are PDF pages as the notes give them. W049 pages are printed pages, with the PDF page added where the notes give one.

**Read this before using any row.** Every rule below is *attributed* to Gann, or is a Gann-family technique as a third party states it. None is Gann's own text. Under AGENTS.md's "Gann-derived AND measured" rule, a row reaches gate 1 only after it is traced to a tier-A source (`docs/GANN_HISTORICAL_SOURCES.md`).

**Column key**

- **author.** Who states the rule:
  - **Anon-W003/W034:** the anonymous compiler of *A Summary of W.D. Gann's Techniques of Analysis and Trading*. W034 is the same text as W003 pp.15–23 (word match 0.949). Cite W003 for page numbers; the W034 page is given where it helps.
- **claims_gann_source.** Which Gann book or lesson the secondary work names as the origin. W003 pp.23–25 cites no lesson for any rule. It says only that the courses are compilations of lessons and letters from 1931–1955, sold in differing editions by Cowan, Lambert-Gann and Sacred Science. So "none (uncited)" is the normal entry for every W003/W034 row.
- **implementable.** Whether the rule is stated precisely enough to code:
  - **yes:** precise enough to code.
  - **partial:** needs a free parameter that the source does not give.
  - **no:** too vague, withheld, or not about markets.
- **blocked_origin (in notes).** Where the rule *probably* comes from, if the source is one of the blocked books:
  - **TST:** *Truth of the Stock Tape* (W015)
  - **45Y:** *45 Years in Wall Street* (W005)
  - **HTMPC:** *How to Make Profits in Commodities* (W008, W019)
  - **MSMC:** *Master Stock Market Course* / *Method in Detail* (W037)
  - **TMG:** *Trading Methodologies of W.D. Gann* (W014)
  - **SMU2:** *Scientific Methods Unveiled* Vol. 2 (W004)
  - **TGFA:** *Trader's Guide to Financial Astrology* (W002)

  These attributions are **my outside knowledge, not stated by any source read**, so every row marked this way is **UNVERIFIABLE** until the blocked book is opened.

---

## A. Anonymous Gann checklist (W003 pp.15–23 = W034 pp.1–6)

| proposed_id | rule | source | author | claims_gann_source | implementable | notes |
|---|---|---|---|---|---|---|
| C-OTHER-01 | Classify the market into one of four situations: bull, bull top, bear, or bear-to-bull reversal. Each needs a different strategy. | W003 p.15; W034 p.1 | Anon-W003/W034 | none (uncited) | partial | The four-state regime label maps onto GSPS regime states. No rule is given for telling the states apart. UNVERIFIABLE; likely MSMC or 45Y. |
| C-TIME-01 | Most moves last three units (3 days, 3 weeks or 3 months). | W003 p.15; W034 p.1 | Anon-W003/W034 | none | yes | Compare `ruleOfThree.ts` (WSSS 1930, tier A). UNVERIFIABLE as a separate rule; likely 45Y or TST. |
| C-ENTRY-01 | Never enter in the direction of the trend on its third day. Restated on p.17 as "do not enter on the third day". | W003 pp.15, 17; W034 pp.1–2 | Anon-W003/W034 | none | yes | An entry filter: block a with-trend entry on day 3 of a run. It is in tension with Gann's rule-of-three continuation. UNVERIFIABLE; likely MSMC. |
| C-TREND-01 | Tops take more time to form than bottoms. Spike (V) bottoms are more common than spike tops. | W003 p.15 | Anon-W003/W034 | none | partial | An asymmetry claim with no thresholds. UNVERIFIABLE; likely 45Y or HTMPC. |
| C-TREND-02 | Blow-off moves of up to 20% a day happen in small stocks at climaxes. | W003 p.15 | Anon-W003/W034 | none | partial | The 20%/day figure is a magnitude, not a trigger. |
| C-TIME-02 | Divergences do not time a turn; time cycles do. | W003 p.16 | Anon-W003/W034 | none | no | Principle only. The A/D-line remark nearby is the compiler's own, not Gann's. |
| C-TREND-03 | In a bull market, the first warning is a correction larger in price **and** time than every earlier correction in the move. | W003 pp.15–16 | Anon-W003/W034 | none | yes | "Overbalance". Compare C-TREND-06. UNVERIFIABLE; likely HTMPC or 45Y (overbalancing of price and time). |
| C-SWING-01 | Corrections within an uptrend tend to be nearly equal in size. | W003 p.16 | Anon-W003/W034 | none | partial | Needs an equality tolerance, which the source does not give. |
| C-PRICE-01 | Swing objective: add the prior swing's range to the new swing's start (measured move). | W003 p.16 | Anon-W003/W034 | none | yes | Compare GSPS C4 targets. UNVERIFIABLE; likely 45Y. |
| C-LEVELS-01 | Squares of numbers, and the 50% point between consecutive squares, act as support and resistance. They are **not tradable alone**. | W003 p.16 | Anon-W003/W034 | none | yes | Confluence-only by the source's own wording. |
| C-LEVELS-02 | Proof 1 of the nine mathematical proofs of resistance: angles drawn from tops and bottoms. | W003 p.16; W034 p.2 | Anon-W003/W034 | none | partial | UNVERIFIABLE; likely MSMC or HTMPC ("mathematical points of resistance"). The repo notes say the nine proofs appear in Gann's own lessons. |
| C-LEVELS-03 | Proof 2: horizontal angles, meaning the levels of old tops and bottoms. | W003 p.16 | Anon-W003/W034 | none | yes | Already GSPS S/R (`historicalSR`). UNVERIFIABLE as a nine-proofs item. |
| C-TIME-03 | Proof 3: time cycles act as vertical angles. Short-sale setup: after 3–4 sideways days, a high-volume down day that breaks the range at the expiry of a time cycle. | W003 p.16 | Anon-W003/W034 | none | yes | A concrete entry: range 3–4 days, volume spike, break, cycle date. UNVERIFIABLE; MSMC. |
| C-LEVELS-04 | Proof 4: crossings of angles drawn from zero. | W003 p.16 | Anon-W003/W034 | none | partial | Needs a price-per-bar scale. |
| C-LEVELS-05 | Proof 5: crossings of angles drawn from double and triple tops or bottoms. | W003 p.16 | Anon-W003/W034 | none | partial | Needs a scale. Compare Jensen's converging double/triple-bottom lines (C-LEVELS-24). |
| C-LEVELS-06 | Proof 6: price crossing double and triple tops or bottoms. | W003 p.16 | Anon-W003/W034 | none | yes | A breakout of a multiple top or bottom. |
| C-LEVELS-07 | Proof 7: past support and resistance. | W003 p.16 | Anon-W003/W034 | none | yes | Duplicates C-LEVELS-03 in substance. |
| C-VOLUME-01 | Proof 8: volume. | W003 p.16 | Anon-W003/W034 | none | no | Named only; no rule is given. Compare GSPS D1 (W006 tier A). |
| C-TIME-04 | Proof 9: the squaring of time and price. | W003 p.16 | Anon-W003/W034 | none | partial | Compare `timePriceSquare.ts`. Needs a scale. |
| C-SWING-02 | In a consolidation, the **third** attempt at a range edge is the important one. If it fails, a fast reverse move follows. | W003 pp.16–17; W034 p.2 | Anon-W003/W034 | none | yes | Count touches of the range edge; act on touch 3. UNVERIFIABLE; likely 45Y or MSMC. |
| C-STOP-01 | False breakout: a move outside a range that fails the **following week**, without exceeding the top by more than **3 points**. | W003 p.17; W034 p.2 | Anon-W003/W034 | none | yes | Agrees with Gann's 3-point allowance (W006 tier A) and `stopBreach.ts`. "3 points" should be price-scaled (`pointScale.ts`). UNVERIFIABLE; likely TST or 45Y. |
| C-ENTRY-02 | A 3–4-day narrow range breaks into a sharp **three-day** move. | W003 p.17 | Anon-W003/W034 | none | partial | "Narrow" is undefined. |
| C-ENTRY-03 | Fast up-moves start from a **third or fourth** higher bottom. | W003 p.17 | Anon-W003/W034 | none | yes | Count successive higher swing lows. UNVERIFIABLE; likely 45Y or TST (3rd/4th higher bottom). |
| C-TREND-04 | Late in a trend, reactions get smaller until a sharp reversal comes. | W003 p.17 | Anon-W003/W034 | none | partial | A shrinking-reaction detector; needs a tolerance. |
| C-TREND-05 | From a bear-market bottom, a fast move runs about **3 weeks up**, then **3–5 weeks sideways**, then accelerates. | W003 p.17 | Anon-W003/W034 | none | yes | A dated template. UNVERIFIABLE; likely HTMPC or 45Y. |
| C-TREND-06 | The first sign of a trend change is "overbalance": a reaction larger than any earlier one. | W003 p.17; W034 p.2 | Anon-W003/W034 | none | yes | Same as C-TREND-03, stated for price. UNVERIFIABLE; HTMPC. |
| C-TREND-07 | A rising market should spend **more time rising than falling**. When that inverts, it is a warning. | W003 p.17; W034 p.2 | Anon-W003/W034 | none | yes | Ratio of up-swing to down-swing durations. |
| C-OTHER-02 | Ignore the financial press. | W003 p.17 | Anon-W003/W034 | none | no | Discipline only. |
| C-TIME-05 | Seasonal turn dates are 21–22 Dec, 21 Mar, 22 Jun and 21–23 Sep, plus the dates about 15 days later: 5–6 Jan, 5 Feb, 6 May, 7 Jul and 8 Aug. | W003 p.17; W034 p.3 | Anon-W003/W034 | none | yes | Fixed calendar windows. The repo's F4 test found no calendar window set beats random placement. UNVERIFIABLE; likely 45Y or MSMC ("seasonal changes"). The list is irregular: it includes 5 Feb, 6 May, 7 Jul and 8 Aug, but omits early Nov and early Oct. |
| C-TIME-06 | Calendar-day counts from a pivot: 30, 45, 60, 90, 135, 150, 180, 210, 225, 315, 330 and 360. | W003 pp.17–18; W034 p.3 | Anon-W003/W034 | none | yes | 120, 240 and 270 are absent from this list but appear as angles in C-TIME-10. UNVERIFIABLE; MSMC. |
| C-TIME-07 | Trading-day equivalents: 11, 22, 33, 45, 56, 67, 78, 90, 101, 112, 123, 135, 146, 157, 168 and 180. | W003 p.18; W034 p.3 | Anon-W003/W034 | none | yes | The step is 11.25 (= 45/4); that is the notes' arithmetic. The source adds that "true understanding of cycles comes from calendar days". |
| C-TIME-08 | Week counts: 13, 26, 39, 45, 52 and 78. The **7th week** is a "death zone". | W003 p.18; W034 p.3 | Anon-W003/W034 | none | yes | The 7th-week rule also appears in W035 p.2, derived from 1/8 year = 6½ weeks. UNVERIFIABLE; likely MSMC ("How to Divide the Yearly Time Period"). |
| C-TIME-09 | Month counts of 6, 12 and 144. | W003 p.18 | Anon-W003/W034 | none | yes | |
| C-TIME-10 | One day = one degree. Key angles: 45, 90, 120, 135, 180, 225, 240, 270, 315 and 360. | W003 p.18; W034 p.3 | Anon-W003/W034 | none | yes | Compare W022 p.371 (tier A: a "time" = 360). |
| C-TIME-11 | There are two kinds of cycle: **natural** time cycles, and cycles derived from significant **prices**. | W003 p.18 | Anon-W003/W034 | none | no | A taxonomy. See C-TIME-20 for the price-derived kind. |
| C-TIME-12 | Divide any cycle into 1/8, 1/4, 1/3, 3/8, 1/2, 5/8, 2/3, 3/4 and 7/8. For example, a 30-year cycle gives 3.75, 7.5 and 10 years. | W003 p.18; W034 p.3 | Anon-W003/W034 | none | yes | |
| C-TIME-13 | Square of 52 on weekly charts, with two-year squares and inner and outer squares. | W003 p.18 | Anon-W003/W034 | none | partial | "Inner/outer squares" is undefined. UNVERIFIABLE; MSMC. |
| C-TIME-14 | Square of 90 on weekly and monthly charts. | W003 p.18 | Anon-W003/W034 | none | partial | Compare Jensen's square of 90 (W049; C-LEVELS-21). |
| C-TIME-15 | Square of 12, and multiples of 9. | W003 pp.18–19 | Anon-W003/W034 | none | partial | |
| C-TIME-16 | Square of 144 is "the most important" on monthly charts. It is also an absolute price move of 144 points. | W003 pp.18–19; W034 p.3 | Anon-W003/W034 | none | yes | UNVERIFIABLE; MSMC (the 1953 Square of 144 lesson). Also stated by W011 (C-NUMEROLOGY-03). |
| C-TIME-17 | 144 × 144 = 20,736 units, divided by 1, 1/2 … 1/64. In days, weeks, months and years: 1 = 20,736 days = 2,962 weeks = 682 months = 56.8 years; 1/2 = 28.4 years; 1/4 = 14.2; 1/8 = 7.10; 1/16 = 3.55; 1/32 = 1.77; 1/64 = 0.89 years. | W003 p.19; W034 p.4 | Anon-W003/W034 | none | yes | **Errata:** W034 gives 1/64 = **41 weeks**; W003 gives **46**. 2,962/64 = 46.3, so 46 is correct. W003 prints the Days column with misplaced separators ("20.736" for 20,736). |
| C-TIME-18 | Short-term counts: watch the 3rd–4th day from a top or bottom. Reactions run 2–3 weeks. Watch days **7, 14 (most significant) and 21**. | W003 p.19; W034 p.4 | Anon-W003/W034 | none | yes | Already GSPS F1 (7/14-day turns). The Fibonacci aside about 21 is the compiler's. |
| C-TIME-19 | 1/16 of a year = 23 days. 49 days (7²) is "very important". A 42-day move may change at 45–46 days. | W003 p.19; W034 p.4 | Anon-W003/W034 | none | yes | 365/16 = 22.8 days. |
| C-TIME-20 | Yearly cycles of 90, 60, 30, 20, 10, 7 and 5 years and their multiples. Combine 1/3 of a year with 1/2 or 1/4 of a year from another pivot. 1/2 year is "very important". **Anniversaries are the most important.** | W003 pp.19–20; W034 p.4 | Anon-W003/W034 | none | yes | Awodele (W007 p.61) says these fixed look-backs are usually not the dominant cycles "if you do the math". That claim is untested. UNVERIFIABLE; likely MSMC or 45Y. |
| C-TIME-21 | Further week counts: 39, 17 and 35 weeks. | W003 p.20 | Anon-W003/W034 | none | yes | 17⅓ weeks = 1/3 year (W035 p.2). |
| C-TIME-22 | Price-derived cycle: read a high, low or range as time units. A high at 60 gives a 60-day, 60-week or 60-month cycle. "The most powerful is the **square of the range**." | W003 p.20; W034 p.4 | Anon-W003/W034 | none | yes | Compare `timePriceSquare.ts` (range squared in time). UNVERIFIABLE; MSMC or HTMPC. |
| C-LEVELS-08 | Geometric square of price: draw it down from a high or up from a low, with time units equal to price units. A 1x1 falling from a high of 60 reaches zero on day 60 ("squaring off"). | W003 p.20; W034 pp.4–5 | Anon-W003/W034 | none | yes | W003 writes "45%" where it means 45 degrees. |
| C-LEVELS-09 | The 2x1, 1x1 and 1x2 are the most significant angles. Draw them from the square's corners and midpoints. Where angles cross are turning points. | W003 p.20; W034 p.5 | Anon-W003/W034 | none | partial | Needs a scale. UNVERIFIABLE; MSMC or HTMPC. |
| C-LEVELS-10 | Also draw angles from the 50% mark of the range. | W003 p.20 | Anon-W003/W034 | none | partial | |
| C-STOP-02 | Breaking the 1x1 signals weakness down to the next angle. | W003 p.20 | Anon-W003/W034 | none | partial | **Conflict:** Sidney (W031 p.1) calls "break one angle, go to the next" a misunderstanding. |
| C-LEVELS-11 | 50% is "the most important level", the "centre of gravity". | W003 pp.20–21; W034 p.5 | Anon-W003/W034 | none | yes | Already GSPS `rangeMidpoint`. The repo notes say it is in Gann's own lessons. UNVERIFIABLE here; likely 45Y or MSMC. |
| C-ENTRY-04 | The first return to the 50% level after price has broken below it is a short sale. | W003 pp.20–21 | Anon-W003/W034 | none | yes | A retest-of-midpoint short; the mirror applies for longs (Polarity). |
| C-TIME-23 | When price reaches 50% of the range at 50% of the time, a three-month fast move may follow. | W003 p.21 | Anon-W003/W034 | none | partial | Needs a time tolerance. |
| C-SWING-03 | The third test of a zone is "the dangerous time". | W003 p.21; W034 p.5 | Anon-W003/W034 | none | yes | Same family as C-SWING-02. |
| C-PRICE-02 | Squares of lows: project resistance at 1, 2, 3, 4, 7, 9 and 12 times the low. | W003 p.21; W034 p.5 | Anon-W003/W034 | none | yes | W034 drops the "1". Compare Sidney's doubling of the low (C-PRICE-03). |
| C-TIME-24 | Decade pattern, by the last digit of the year: 1 a bear ends and a bull begins; 2 a minor bull or bear rally; 3 a bear starts, and the rally may last to Mar–Apr; 4 a bear year that ends the bear cycle; 5 a bull, the "year of ascension"; 6 a bull ending in the fall; 7 a bear (1927 an exception); 8 a bull, with the 90th month of the decade; 9 "the strongest bull", topping then declining from Sep–Nov; 10 (0) a bear, with a rally to Mar–Apr then a severe decline to Nov–Dec. | W003 pp.21–22; W034 p.5 | Anon-W003/W034 | none | yes | Compare GSPS `decadeCycle.ts` (confluence only). "Look for such cycles in the Indian indices" is the compiler's remark. The repo notes say the pattern is in Gann's lessons. UNVERIFIABLE here; likely MSMC ("Forecasting by Time Cycles"). |
| C-TIME-25 | Counter-trend moves last 3–4 days on indices and 3–5 days on stocks. A move past the 4th day signals consolidation or reversal. The next counter-move lasts 7–10 days. | W003 p.22; W034 p.5 | Anon-W003/W034 | none | yes | Compare GSPS F1 7–10 Day Rule. |
| C-TIME-26 | The smallest complete cycle is 5 years; the minor cycles are 3 and 6 years. Watch the **59th month**. | W003 p.22; W034 p.6 | Anon-W003/W034 | none | yes | UNVERIFIABLE; MSMC or 45Y. |
| C-TIME-27 | Campaigns rarely run past 3–3.5 years without a 3–6-month counter-move, except at the end of a major cycle (1869, 1929). Many culminate in the **23rd month**. | W003 p.22; W034 p.6 | Anon-W003/W034 | none | yes | Compare W006 campaign durations (tier A). |
| C-RISK-01 | The purpose is to make money. Trade from a plan; do not overtrade; ask whether a trade rests on hope or on logic. | W003 pp.15, 22–23 | Anon-W003/W034 | none | no | Discipline only. |
| C-ASTRO-01 | Planetary sidereal periods for cycle work: Mercury 88.97 d, Venus 224.70, Earth 365.26, Mars 686.98, Jupiter 4,331.98 (11.86 y), Saturn 10,760.60 (29.46 y), Uranus 30,685.50 (84.01 y), Neptune 61,285.25 (167.69 y), Pluto 90,465.38 (247.69 y). | W003 p.23; W034 p.6 | Anon-W003/W034 | none | yes (data) | **Errata (outside knowledge):** Mercury should be about 87.97 d; Neptune about 164.8 y (60,190 d). This is reference data, not a rule. UNVERIFIABLE; likely TGFA or SMU2. |

## B. Cycle and economic-cycle rules in W003 (not Gann; the cycle literature)

| proposed_id | rule | source | author | claims_gann_source | implementable | notes |
|---|---|---|---|---|---|---|
| C-TIME-28 | Kitchin stock cycle of about 40 months: Kitchin 40, Crum 39–41, Mogey 40.68 months in US stock prices. | W003 p.1 | Kitchin, Crum and Mogey, compiled anonymously | not Gann | yes | Not independent: the sources cite each other (synthesis §3.5). Test as a hypothesis only. |
| C-TIME-29 | Juglar cycle of 9–11 years, in four phases: prosperity, crisis, liquidation, recession. | W003 pp.2–3 | Juglar | not Gann | partial | |
| C-TIME-30 | Kondratieff cycle of about 53–54 years: Dewey 53.25 = 3 × 17.75, Tomes 53.38. Schumpeter's nest is K 54 = 3 Kuznets 18 = 6 Juglars 9, with Kitchin 4. | W003 pp.4–6 | Kondratieff, Dewey, Tomes, Schumpeter | not Gann | partial | Context only. Tomes' forecast (best about 2014, next trough about 2040) is not a rule. |
| C-TIME-31 | Kuznets real-estate cycle of 16.5–18 years. | W003 pp.11–12 | Kuznets | not Gann | partial | |

## C. Awodele, harmonic analysis (W007)

| proposed_id | rule | source | author | claims_gann_source | implementable | notes |
|---|---|---|---|---|---|---|
| C-TIME-32 | Harmonic (Fourier) analysis: set A0 to the mean. For each integer trial period T, compute a = (2/N)Σx·cos(2πt/T) and b = (2/N)Σx·sin(2πt/T), with N trimmed to whole cycles. Rank periods by a²+b². Test periods from 3 up to half the record. | W007 pp.25–28 | Awodele (after H. L. Moore 1914) | Gann's 1 Apr 1926 letter to Spohn ("Schuster and Fourier theories"); *NY Sun* 28 Dec 1921 ("simplified from" Moore); *Tunnel* pp.77, 205 ("harmonic analysis") | yes | Already in `spectralCycle.ts`, with Schuster p, hold-out and artefact guards. The letter is quoted secondhand and has not been seen. |
| C-TIME-33 | Sum the hand-picked dominant periods' sine waves, then extend t to project the composite forward. | W007 pp.30–34, 39, 46, 49 | Awodele | *Tunnel* pp.76–77 (find the cycle; the future repeats it) | partial | Periods are chosen by eye. There is no significance test: Schuster is named on p.18 but never applied. One hold-out "speaks for itself" (p.50). Fails Dewey's standard. |
| C-TIME-34 | For stocks, use the weekly (high+low)/2 midpoint as the input series. | W007 p.37 | Awodele | none | yes | An engineering choice. |
| C-TIME-35 | Choose the analysis window between heliocentric Jupiter–Saturn conjunctions (e.g. 16 Apr 1981 – 22 Jun 2000). | W007 p.44 | Awodele | "begin right" (Gann phrase, unsourced) | yes | An astro-anchored window. Research only. |
| C-ASTRO-02 | The 30-year cycle is caused by Saturn, and Saturn rules products of the earth. | W007 p.60 | Awodele, quoting an unidentified course "How to Forecast" | Gann course (unidentified); compare the 1931 lesson in the repo | partial | Already noted in AGENTS.md (Saturn 30-year). UNVERIFIABLE until the course passage is located; likely MSMC or HTMPC. |
| C-NUMEROLOGY-01 | "The square of odd and even numbers" gives the proof of market movements and their cause. | W007 p.62 | Awodele, quoting Gann commodity courses | Gann commodity courses (not specified) | no | Has no operational content. Compare the Even Squares chart (C-LEVELS-12). UNVERIFIABLE; HTMPC or MSMC. |
| C-LEVELS-12 | Gann's "Even Squares for Cotton & Eggs": a 16×16 square counted outward from the centre. Each cell steps the price by 30 points, with compass and degree labels (0° E, 90° N, 180° W, 270° S) and 1/16 fractions on the edges. | W007 p.65 (visuals re-inspection) | Gann chart reproduced by Awodele | Gann chart (course material) | yes | The 30-point step is a reader inference; no digit was filled in from it. W050 image 5 shows an eggs square stepping 70 points. The per-cell step is market-specific, which is a free parameter. |
| C-LEVELS-13 | Every stopping price is a mathematical point: a division of 360°, the square of 12, the square of 20, or the square or halfway point of another number. | W007 p.67 | Awodele, quoting Gann (source not specified) | Gann (uncited quote) | partial | Square of 20 is research-only in GSPS (`squareOf20.ts`). UNVERIFIABLE; MSMC. |
| C-ASTRO-03 | Pair found cycles with planetary periods: 8 y with Venus, 33 y with Mercury, 159 months ≈ 7 Mars periods, 19.875 y ≈ Jupiter–Saturn synodic. | W007 pp.28, 61 | Awodele | none | no | Numerical coincidence, untested. |
| C-NUMEROLOGY-02 | The planetary magic-square table (n = 3…9 assigned to Saturn … Moon; Kircher 1665, then Liharzik, Hellenbach, Hartmann). | W007 pp.62–67, 71 | Awodele | none (a lead only) | no | Not Gann; speculative. |

## D. Numeric tables and calculators (W009, W011, W023, W050)

| proposed_id | rule | source | author | claims_gann_source | implementable | notes |
|---|---|---|---|---|---|---|
| C-LEVELS-14 | Square-of-Nine 45° levels: for row n, the levels are (n + k/8)², k = 0…8. Equivalently, the next 45° level from P is (√P ± 1/8)². | W009 pp.1–15 | anonymous (table, no prose) | none | yes | All 4,239 cells were recomputed with 0 mismatches. Already in GSPS SQ9 code; a cross-check only. |
| C-NUMEROLOGY-03 | Watch price at multiples of 144 (144, 288, 432 …) and at its subdivisions 18, 36, 54 and 72. Add 144 to a price to find the next support or resistance. | W011 pp.1–2 | "Brett" (forum post) | claims *45 Years in Wall Street* praises the percentage divisions (unchecked) | yes | The useful part is the 144 step, which needs a primary source (Square of 144). UNVERIFIABLE; 45Y or MSMC. |
| C-NUMEROLOGY-04 | Digital-root "vibration": 30° steps reduce to 3-6-9; the 1/32 percentage steps reduce to 2,4,6,8,1,3,5,7,9; multiples of 9 reduce to 9 and mark a "change". | W011 pp.1–3 | "Brett" | none | no | Holds **by construction** (arithmetic mod 9). Says nothing about markets; see GANN_HISTORICAL_SOURCES B2 and `digitalRoot.ts`. W011 also calls the 45° points "trine", which is wrong (a trine is 120°). |
| C-LEVELS-15 | Square of Nine price wheel: a 33×33 spiral, cell = Price × CF + Step × (n−1). The 16 rays (every 22.5°) carry the levels. | W023 sheets SQ9 Price-1/2 | Utaro Hayashi (2004) | none | yes | CF and Step are user inputs, not disclosed constants. |
| C-TIME-36 | Square of Nine time wheel: the same spiral fed a start date, so each cell is a calendar date. | W023 sheets SQ9 Time-1/2 | Hayashi | none | yes | |
| C-TIME-37 | Seasonal degree calendar: 21 Mar 06:00 = 0°, 21 Jun = 90°, 22 Sep = 180°, 21 Dec = 270°. Each 22.5° step adds 1h30m (e.g. 12 Apr 07:30 = 22.5°). | W023; W035 p.3 figure; W050 image 5 | Hayashi; Ferrera-family figure; unknown hand-drawn chart | none | yes | A sun-longitude calendar. Shared across three tier-C sources, so treat it as one lineage, not three confirmations. |
| C-LEVELS-16 | Hexagon chart: 1 to 1,518 in six-sided rings, angles every 30°, cell = previous + Step. | W023 Hexagon sheets | Hayashi | none | yes | Compare `hexagonChart.ts`, which is research-only because the placement cannot be checked against Gann's lost figure. |
| C-TIME-38 | "Square of Four" chart: seasonal labels in **15°** steps (24 divisions: 21 Mar 0°, 6 May 45°, 21 Jun 90°, 23 Sep 180°, 21 Dec 270°). | W050 image 7 | Lambert-Gann print, "By W.D. Gann" (title tentative) | Gann chart (unverified) | partial | Thumbnail only; needs a full-size copy. Conflicts with the 22.5° step of the SQ9 calendar (C-TIME-37). |

## E. Sidney, *Analyst Insight* (W031–W033)

| proposed_id | rule | source | author | claims_gann_source | implementable | notes |
|---|---|---|---|---|---|---|
| C-LEVELS-17 | Gann retracements are in eighths and thirds. 50% is "the" Gann retracement; 3/8 and 5/8 are the Gann equivalents of the Fibonacci and Elliott levels. | W031 p.1 | Jason Sidney | none | yes | Already `retracement.ts`. The Fibonacci framing is the author's. |
| C-LEVELS-18 | Pair each retracement fraction with a fan angle: 1/8 with 1x8, 1/4 with 1x4, 1/3 with 1x3, 3/8 with 1x2, 1/2 with 1x1, 5/8 with 2x1, 2/3 with 3x1, 3/4 with 4x1, 7/8 with 8x1. | W031 p.2 | Sidney | none | partial | **CONFLICT with W033:** W033 ties 1x2 to 50% of *time*, while W031 ties it to 37.5% of *price*. The pairing is not derived, and needs a stated price-per-bar scale. |
| C-TIME-39 | Squaring: when a retracement level is hit at the time the matching angle gives (e.g. 50% on the 1x1), the chance of a turn is stronger. | W031 p.3 | Sidney | none | partial | One unlabelled example. Compare `timePriceSquare.ts`. |
| C-LEVELS-19 | Breaking one angle does **not** mean price must go to the next angle. | W031 p.1 | Sidney | none | no | Conflicts with C-STOP-02 (W003). |
| C-TIME-40 | Fan as time calculator: from a low, the time each angle takes to reach a target price is a fixed fraction of the square. 1x8 = 12.5%, 1x4 = 25%, 1x3 = 33.3%, 1x2 = 50%, 1x1 = 100%, 2x1 = 200%, 3x1 = 300%, 4x1 = 400%, 8x1 = 800%. Here 1xN rises N points per period. | W033 pp.1–3 | Sidney | none | yes | **CONFLICT with W031** (C-LEVELS-18). Sidney's angle notation is the reverse of the common reading. There is also a text slip: 2x1 is said to "fall" where "rise" is meant. |
| C-PRICE-03 | Doubling a major low gives a price target (SPI 1184 × 2 = 2368, the Feb 1994 high). | W033 p.3 | Sidney | none | yes | Agrees with C-PRICE-02 (multiples of a low). One hand-picked hit. |
| C-TIME-41 | The anniversary of a major low (same calendar date each year) is a time to watch. | W033 p.4 | Sidney | none | yes | Agrees with C-TIME-20 ("anniversaries most important"). |
| C-TIME-42 | Time balance: compare swing durations (high to low, low to high, high to high, low to low). Near-equal spans point to a turn (17 vs 18 weeks; 43 vs 44 weeks). | W032 pp.1–5 | Sidney | none | partial | No tolerance is set beforehand; the swing points were picked afterwards. Week counts recomputed correctly. |
| C-STOP-03 | Time alone is not enough. Confirm with a false break: the bar trades below the prior low but closes back above it. | W032 pp.5–6 | Sidney | none | yes | Agrees with GSPS failed-break logic (`stopBreach.ts`). Sidney's other confirmation, a 26-period RSI divergence, is non-Gann and excluded. |
| C-OTHER-03 | Market-geometry dates forecast historical events (Gulf War repeat, May 2003). | W033 pp.4–5 | Sidney | none | no | Out of scope under the forward-claims rule. Missed by about 7 weeks (outside knowledge). |

## F. Ferrera Square-of-Nine timing (W035)

| proposed_id | rule | source | author | claims_gann_source | implementable | notes |
|---|---|---|---|---|---|---|
| C-TIME-43 | Measure market time on the 360° circle, counting days, weeks or months from **extreme highs and lows**, "not from exact seasonal or calendar time periods". | W035 p.1 | "Vera" applying Daniel Ferrera; quoted passage | "W.D. Gann Master Egg Course" (sic), no page | yes | Conflicts with the fixed seasonal dates in C-TIME-05 and C-TIME-37. UNVERIFIABLE; MSMC or HTMPC course text. |
| C-TIME-44 | Circle divisions to count: 45, 90, 112½, 120, 135, 150, 157½, 165, 180 ("very important"), 202½, 225, 240, 247½, 270, 292½, 315, 337½ and 360. | W035 p.1 | quoted Gann passage via Vera/Ferrera | same "Master Egg Course" | yes | |
| C-TIME-45 | Cluster method: from every swing pivot (close-only chart, 2% minimum swing), project offsets of 46, 61, 91, 121, 137, 182, 227, 242, 272, 317, 333 and 365 days. Dates where several projections cluster are change-of-trend candidates. | W035 pp.1–2 | Vera / Ferrera | Ferrera says the method is Gann's | yes | The offsets are inconsistently scaled (some are degrees × 365/360, others not). The Oct 2003 cluster cannot be reproduced from the post's own table, and 7–8 dates in one month gives no base rate. |
| C-TIME-46 | Divide the year: 1/2 = 26 weeks (180°); 1/4 = 13 weeks; 1/3 = 17⅓ weeks (120°); 1/8 = 6½ weeks, "why the 7th week is always so important"; 1/16 = 22½ days (about 3 weeks), which accounts for 3-week moves. | W035 pp.2–3 | unattributed typed passage | none given (reads like a Gann lesson) | yes | Agrees with C-TIME-08 and C-TIME-18. UNVERIFIABLE; likely MSMC. |
| C-TREND-08 | A stock that closes higher for a **4th consecutive week** will go higher. The 5th week is important; the 5th day, week, month or year is "of Ascension". | W035 p.3 | unattributed typed passage | none given | yes | Compare `ruleOfThree.ts` (WSSS). Echoes W003's "year 5 = ascension". UNVERIFIABLE; MSMC or 45Y. |

## G. Meadors vendor articles (W027–W029)

| proposed_id | rule | source | author | claims_gann_source | implementable | notes |
|---|---|---|---|---|---|---|
| C-ASTRO-04 | Gann's astro work was empirical: find by research which cosmic cycles correlate with each market. Heliocentric cycles are regular; geocentric ones are irregular. | W027 pp.1–2 | G. L. Meadors | 1909 *Ticker* interview ("these vibratory forces can only be known by the movements they generate") | no | A per-market search is a multiple-comparisons pattern, excluded by AGENTS.md. |
| C-ASTRO-05 | The 84-year Uranus return times major lows (19 Oct 1987 vs 9 Nov 1903). | W027 | Meadors | none | partial | One anecdote; Uranus period ~84.0 y vs 83.9 y elapsed. |
| C-ASTRO-06 | DJIA monthly changes 1897–1961 correspond to geocentric conjunctions and oppositions, depending on sky segment: up 92% of the time near the Galactic Centre; a 30-day pre-event advance before Mars–Jupiter and Mercury conjunctions. | W028 | Meadors, reporting Dewey, "Stock Prices and Space", *Cycles* Oct 1969 | not Gann (Dewey) | tested | Secondhand; needs the original article. Tested 2026-10-22 as one pre-registered rule (`lib/research/skySegments.ts`: the three pairs' conjunctions and oppositions with a planet within 15° of the Galactic Centre, the month's rise on Shiller's S&P): 1897–1961 26 of 40 (65%) against 57.9%, p 0.23; hold-out 1962–2026 23 of 37 against 62.2%, p 0.57. Does not replicate; research only. |
| C-ASTRO-07 | The day before and the day after a solar eclipse matter. | W029 | Meadors | none | yes | The author concedes "usually a Solar Eclipse date is not a turning point date". Anecdotal. |
| C-OTHER-04 | All of Gann's methods are subservient to the Law of Vibration. Every original impulse resolves into periodic or rhythmical motion. | W029 (quoting 1909 *Ticker*) | Meadors | 1909 *Ticker* interview (quoted) | no | A principle; Rhythm in the Hermetic lens. |

## H. Bucholtz financial astrology (W013). Not Gann; cites no Gann source.

| proposed_id | rule | source | author | claims_gann_source | implementable | notes |
|---|---|---|---|---|---|---|
| C-ASTRO-08 | Aspects and orbs: conjunction and opposition ±10°; square, sextile and trine ±5°; semi-sextile and semi-square ±3°. Aspects used: 0, 30, 45, 60, 90, 120, 150 and 180. | W013 pp.19, 94 | M. G. Bucholtz | none | yes | Orbs are parameters; fix them before testing. |
| C-ASTRO-09 | First-trade-chart method: cast a chart for the first trade date (exchange city, 9:30 am); list its aspects; keep the ones that "most often align" with past swings; project them forward. | W013 pp.96–99, 103 | Bucholtz | none | partial | Selection after the outcome is seen. Excluded unless the rule is fixed before testing. |
| C-ASTRO-10 | The Moon matters most for stocks whose first trade date fell on a New or Full Moon. Watch New and Full Moons, apogee and perigee, North Node sign changes (every ~1.55 y) and eclipses (seasons ~173.3 d apart). | W013 pp.29–92 | Bucholtz | none | yes | No base rate. |
| C-ASTRO-11 | Jupiter–Saturn synodic cycle of 19.85 years, with heliocentric 0/90/180° episodes against the Dow. Subdivisions /4 … /9 = 59.6, 47.7, 39.7, 34, 29.8 and 26.5 months, projected from major pivots. | W013 pp.113–117 | Bucholtz | none | yes | Table 3-2 is mislabelled "synodic" but lists orbital periods. No base rate. Compare Gann's own Jupiter–Saturn references (AGENTS.md, A2.3). |
| C-ASTRO-12 | Synodic period S = s1·s2/(s2−s1). Pairs given: Earth–Mercury 116 d, Earth–Venus 584 d, Earth–Mars 780 d, Jupiter–Uranus 13.81 y, Saturn–Uranus 45.26 y, Saturn–Neptune 35.68 y, Saturn–Pluto 33.40 y. | W013 p.115 | Bucholtz | none | yes (data) | Standard astronomy. |
| C-ASTRO-13 | Per-contract aspect sets, for example: heliocentric Mercury–Jupiter and Mercury–Saturn at 0/90/180 for grains; heliocentric Venus sign changes for soybeans; Sun–Pluto and Sun–Node for gold; 180 and 360 days from the first trade date for live cattle. | W013 pp.138–163 | Bucholtz (from Long, Pesavento and others) | none | partial | A catalogue of hypotheses only. |
| C-ASTRO-14 | Exaltation degrees (Sun 19° Aries, Saturn 21° Libra, Jupiter 5° Cancer). Mercury, Venus or Mars crossing the first-trade chart's MC (within 1–2°) or Asc (±1 day). | W013 pp.103–112 | Bucholtz | none | partial | Coca-Cola MC dates conflict between p.109 and p.111. |
| C-ASTRO-15 | Use astrology only as a companion to technical analysis and the prevailing trend, never alone. | W013 pp.14–15, 164 | Bucholtz | none | no | Consistent with GSPS's confluence-only policy. |

## I. Jensen, *Astro-Cycles and Speculative Markets*, 1978 (W049); vendor page (W048). Jensen never names Gann; he credits Liggett and Moore.

| proposed_id | rule | source | author | claims_gann_source | implementable | notes |
|---|---|---|---|---|---|---|
| C-LEVELS-20 | Fixed chart scale ("immutable law"): show every calendar day (non-trading days blank). One day's width equals one price unit's height: $1 per point in stocks, 1¢ in grain. | W049 printed pp.~124–125 (PDF 67R); Plate 2 "One point = One day and one dollar" | L. J. Jensen | none (Jensen cites Kepler and Pythagoras) | yes | Removes the free scale parameter that every angle rule above needs. Not Gann-sourced. |
| C-LEVELS-21 | The square of 90 is the base unit. From a major low use one 90° quadrant. Its harmonic points (90, 45, 22½, 11¼, 67½) form squares and mark resistance and reversals. The 120-family points (120, 60, 30, 15, 75) form trines and mark consolidation. 90 and 45 are "doubly strong". | W049 printed pp.107–110 | Jensen | none | yes | Compare W003's Square of 90 (C-TIME-14). Parallel to Gann, not lineage. |
| C-PRICE-04 | Add the points to the starting low (a low at 11 puts the 45 point at 56). Count calendar days, weeks or months from the extreme to the same harmonic points. | W049 printed pp.107–110 | Jensen | none | yes | Compare GSPS "add to the low" levels. |
| C-LEVELS-22 | Plate 1 protractor table: each scale point = 90 × up/over (e.g. 45 = 4 up / 8 over), so the angle can be drawn without the full square. | W049 printed p.110 (PDF 61L) | Jensen | none | yes | **Erratum as printed:** X–G gives 54½° where the complement implies 52½°. The printed angles are rounded to ¼° (X–E true 26.57° vs printed 26¼°). |
| C-LEVELS-23 | Balance a 90-point line from a low with the same line from a top. Copy any line from a bottom in parallel upward from the preceding top; the parallelogram "boxes" the range and times the end of the move. Strongest on weekly charts. | W049 printed p.113 (PDF 62R) | Jensen | none | partial | Jensen asks for "flexibility in entering lines", which is a selection freedom. W048 sells this construction. |
| C-LEVELS-24 | Lines (90, 45, 22½) from double and triple bottoms converge on a major point, where a new base line is set. | W049 printed pp.111–113 | Jensen | none | partial | Compare C-LEVELS-05 (W003 proof 5). |
| C-STOP-04 | One-point rule: a trend line, high or low (not a degree point) is broken only after a full one-point penetration. | W049 printed p.116 (PDF 64L) | Jensen | none | yes | Compare Gann's 3-point rule (W006 tier A) and `pointScale.ts`. Jensen gives 1 point; Gann gives 3. |
| C-ASTRO-16 | Planetary time periods: Moon 4, Mercury 10, Venus 8, Sun 19, Mars 15, Jupiter 12, Saturn 40, Uranus 90, Neptune 180 years. | W049 PDF 35L | Jensen | none | no | Traditional "planetary years", not orbital periods. |
| C-LEVELS-25 | Astral points: from each new high or low, draw a line through a future "astral point", then copy it parallel onto the previous pivot. The copy catches the next turn. The point's location is a per-market "astro-numerological key" taught only in the course. | W048 (screenshots; summary) | anonymous vendor, tradingwdgann.com ("W. D. GANN: MASTER THE MARKETS") | claims Jensen p.111 and "Gann's section on Descartes in *Tunnel*" | no | The key rule is withheld. The *Tunnel* Descartes episode (W022 pp.249–251) has no geometry. The construction itself is Jensen's p.113 (C-LEVELS-23) with his fixed scale replaced by an undisclosed tuning. Fails gate 1. |

## J. Ingram (W012). Not Gann.

| proposed_id | rule | source | author | claims_gann_source | implementable | notes |
|---|---|---|---|---|---|---|
| C-OTHER-05 | Elliott 5-3 shapes arise from summing sine waves in a 4:1 period ratio with halving amplitudes. The corrective should count 3-5-3. | W012 pp.1–3 | Ric Ingram | not Gann | no | Elliott is a non-Gann technique on the AGENTS.md sweep list. Background only. |

---

## Conflicts and errata collected

1. **1/64 row of 144²:** W034 gives 41 weeks; W003 gives 46. 46 is correct (2,962/64 = 46.3). W003 also prints "20.736" for 20,736 and "45%" for 45°.
2. **Angle-to-fraction mapping:** W031 pairs 1x2 with a 3/8 (37.5%) price retracement. W033 pairs 1x2 with 50% of time, and 1x1 with 100%. Both lessons are by the same author, and neither derives its pairing.
3. **Breaking an angle:** W003 says breaking the 1x1 sends price to the next angle. W031 calls that a misunderstanding.
4. **Calendar dates vs counts from pivots:** W003 and W023 use fixed seasonal dates. W035's quoted Gann passage says to count from extremes, "not from exact seasonal or calendar time periods". (Tier A shows the same tension: W022 p.371 vs W036.)
5. **Seasonal step:** 22.5° in the SQ9 calendars (W023, W035, W050 image 5) vs 15° in the "Square of Four" (W050 image 7, tentative).
6. **Penetration allowance:** 3 points (W003 false breakout; Gann W006) vs 1 point (Jensen W049).
7. **Planetary table errors in W003/W034:** Mercury 88.97 d (should be about 87.97); Neptune 167.69 y (should be about 164.8).
8. **W011 digit patterns** are arithmetic mod 9 by construction. W011 also calls the 45° points "trine".
9. **W013 errata:** Table 3-2 is mislabelled synodic; the Coca-Cola MC dates conflict (p.109 vs p.111); HUN is the wrong ticker for Honeywell.
10. **W035:** the offsets are inconsistently scaled, and the October 2003 cluster cannot be reproduced from the post's table.
11. **W049 Plate 1:** X–G 54½° vs the 52½° that the complement implies.
12. **W045-type correction** (Tomes' 2005 note voiding his 1990 harmonics) is outside this cluster's files. No equivalent self-correction appears in these works except Awodele's stated limits (W007 pp.35, 44, 47).

## Likely blocked-book origin of the W003/W034 checklist

My outside knowledge only. **All UNVERIFIABLE** until W015, W005, W008/W019, W037, W014, W004 and W002 are opened.

| Rules | Probable origin |
|---|---|
| C-STOP-01 (3-point false break), C-TIME-01 and C-ENTRY-03 (3rd/4th higher bottom) | TST, 45Y |
| C-TREND-03 and C-TREND-06 (overbalance), C-TREND-05, C-TIME-22 (square of the range) | HTMPC |
| C-LEVELS-02 to C-TIME-04 (nine proofs), C-TIME-13 to C-TIME-17 (squares of 52, 90, 12 and 144), C-TIME-24 (decade pattern), C-TIME-06 to C-TIME-08, C-TIME-46 (dividing the year, 7th week) | MSMC, also summarised in TMG and SMU2 |
| C-TIME-05 (seasonal dates), C-LEVELS-11 (50%), C-TIME-20 (anniversaries, yearly cycles), C-TIME-26 and C-TIME-27 (5-year cycle, campaign length) | 45Y, MSMC |
| C-ASTRO-01, C-ASTRO-02 | TGFA, SMU2, MSMC |
