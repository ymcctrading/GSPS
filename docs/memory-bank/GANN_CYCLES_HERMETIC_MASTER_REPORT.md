# Gann, Cycles & Hermetic Thought — GSPS Master Reference Report

*Compiled 2026-09-27 from the page-by-page source reads in `docs/memory-bank/sources/`; second pass the same day added A08, A09, B04, B05, B07 and B11; third pass (local OCR) completed A08, H01 and B04/B05/B07 and added A02 *Truth of the Stock Tape*, A04 *Wall Street Stock Selector* and A07 *Face Facts America!*
Use this with AGENTS.md's standing principles when a question comes up about Gann's methodology, cycle validation or the Hermetic lens.*

> **What this is.** It synthesises everything read in the project owner's Gann, Observation of Cycles and Hermetic folders. It is written in our own words so no book is reproduced; the public repo carries no copyrighted text.
>
> - Per-source detail, with page references, is in the notes files listed in Appendix A.
> - This report states *what the sources say*, *where GSPS stands against them*, and *what is still open*.
> - It **recommends**; it does not change code. Every item in Part V that would move production behaviour is an owner decision, per AGENTS.md.
>
> **Roadmap phase:** N/A. This is out-of-phase research by direct request, like the 2026-09-16/17 Gann-grounding audit it builds on (ROADMAP Q1, "Gann & Sara Cross-Market Confluence Layers" follow-up note). Any gap in Part V that gets built would be out-of-phase Gann-grounding work and must be recorded as such.

---

## Part 0 — How to use this report

| If the question is… | Go to |
|---|---|
| "What did Gann actually teach about X?" | Part I (by technique), then the source note it cites |
| "Is this cycle claim real, or does it just look real?" | Part II §2 (Dewey's full 18 criteria) and §4 (how to test a Gann time claim) |
| "Which Hermetic principle applies, and what does the source really say?" | Part III |
| "Is GSPS already doing this? Is anything wrong?" | Part IV (alignment) and Part V (gaps, conflicts, corrections) |
| "Can we build this astrology/numerology idea?" | Part I §9, then AGENTS.md "Astrology" and the numerology rule |
| "What wasn't read?" | Part VI |

**Source tiers** (as in `docs/GANN_HISTORICAL_SOURCES.md`):
- **A** — Gann's own writing, public books or private course/letters
- **B** — secondary or interpretive
- **C** — cycle-theory literature (Dewey, Tomes, Halberg)
- **H** — the Hermetic lens (Hauck; see Part III on the Kybalion)

Cite Gann's course **by lesson and year**. His wording changed across 1931–1955 (Part I §1.6).

---

## Part I — Gann's methodology, synthesised by technique

### 1. Time: Gann's first factor

1.1 **Time outranks price.**
- "When time is up, price will reverse" is the course's recurring theme (A2.1).
- The 1954 *Economic Forecaster* makes **time the dominant** of five factors: time, price, volume, speed and "mass pressure." Prices "conform to time when the cycle completes" and can run **ahead of or behind** time (A11).
- The 1919–22 annual forecasts show **turn dates are direction-agnostic**. A projected high date can arrive as a low (the "inversion" rule), so **time says when, price says which way** (A2.2).

1.2 **Count from the right starting point.**
- Every time count starts at a **specific important top or bottom**, never at an arbitrary calendar origin. *Tunnel*: "get a correct base or starting point" (A03, Ch. VII).
- Gann's criticism of H. L. Moore's whole-series cycle work was that it "failed to get the right time factor" (A2 quotes via B01).
- The Master Course counts days, weeks, months and years **from every prior pivot** and looks for where they **converge** (A2.1 Ch. 13).

1.3 **The cycle hierarchy (Master Course Ch. 7 and later).**
- Great Cycle, then 30/20/15/10/7/5-year cycles, minor 3- and 2-year cycles, and the 1-year cycle ("the smallest").
- The **10-year cycle** is the most important for forecasting (Ch. 10A).
- **Campaign statistics**: tops most often **35–49 months** apart, and "more bottoms 3–4 years apart than any other" (Ch. 10B).
- `timeCycles.ts` already carries this hierarchy (`MAJOR_CYCLE_YEARS`).

1.4 **Divisions of time mirror divisions of price** (Ch. 13–14; Square of 52).
- The year and the circle are divided into ½, ⅓, ¼, ⅛ and their multiples.
- Ranked change dates: **anniversary > ½ year > ¼ and ¾ > ⅓ and ⅔ > ⅛s**.
- Day counts 30, 45, 60, 90, 120, 135, 180, 225, 270, 315, 360.
- **Seasonal time counts from March 20/21** (not Jan 1), with the midseason points.
- **1 time = 360°**, and one day stands for one degree (*Tunnel*: 1° = 4 minutes of rotation, and the day-for-a-year analogy).

1.5 **Counter-trend duration prior.** This is Gann's most concrete time rule and is **not implemented** (A2.1 Ch. 11B, 14, 17; A05 Ch. III).
- Reactions in a bull market (and rallies in a bear) typically last **2–5 weeks**: bull reactions and bear rallies **3–4 weeks**, with **14 and 21 days** the most common.
- They sometimes run **6–8 weeks**, and rarely **11–14** (six times in 42 years).
- In a strong bull no reaction lasts beyond **2 months** (sometimes 3).
- A counter-move that reaches its **third month** signals a change of trend.
- A new bull needs **three full months** of advance.

1.6 **The "Great Cycle" / "Master Time Period" varies with the year Gann wrote it:**
- **20 years** (1931)
- **60 years** (1935)
- **56¾ years**, the Square of 144 = 20,736 days (1953)
- **90 years** (1955)

B13's historian's note explains why: Gann issued lessons as letters over 1931–1955, and the "single Master Course" is a later compilation. **Never cite "the Master Time Period" without the lesson and year.** (See Part V, correction C1.)

1.7 **Other time anchors in Gann's own text.**
- The **incorporation / company-age anniversary**: *Tunnel*'s "Major Motors … when the Company would be 19 years old," plus the Master Course's incorporation-date calendar.
- **Fixed annual windows**, the "permanent cycle which does not change" (*Wall Street Stock Selector*, 1930, back matter): Feb 8–10, Mar 21–23, May 3–7, Jun 20–24, Aug 3–8, Sep 21–24, Nov 8–11, Dec 20–24. That is the solar year in eighths. Implemented with the disclosed days since 2026-09-27 (C-A4-1).
- **Daily, weekly and monthly time rules** (A04 Ch. IV):
  - a 2–3-day halt at an extreme
  - buy 2–3-week reactions; watch the 3rd week; fast moves end in the 6th–7th week
  - strong stocks seldom react into a 2nd month
  - watch the 3rd, 6th, 9th and 12th months and the pivot's anniversary
  - favoured weekdays and dates in the month
- **The Rule of Three on daily, weekly and monthly charts** (A04 p. 72, the primary source of `ruleOfThree.ts`).
- **7/14-day alternation** of minor and major turns in the 1919–22 forecasts.
- **Monthly recurring dates** within one contract's history (1954 coffee letter).
- The **Dow 1889–1951 month counts** (Ch. 17): December has the most lows and the fewest highs.

1.8 **Gann named his method "harmonic analysis."**
- *Tunnel* (1927): "the cycle theory, or harmonic analysis, is the only thing we can rely upon."
- A **1926 letter** tells a client that Schuster's and Fourier's theories will help (B01).
- *The Sun*, Dec 28 1921: his system was "simplified from" Moore's *Economic Cycles*.
- This is the textual bridge between Gann and the cycle literature in Part II. It makes periodogram work (`spectralCycle.ts`) **citably Gann's own recommended tool**.

### 2. Price: levels, divisions and squares

2.1 **Range divisions.** ½ is first (the most important retracement), then ¼, ¾, ⅓ and ⅔, then ⅛s. Ch. 13 lists ¼, ⅓, ⅜, ½, ⅝, ⅔, ¾ and ⅞ as the strongest points (A2.1). Aligned in `retracement.ts`.

2.2 **Old tops become bottoms, and bottoms become tops.**
- Double and triple tops and bottoms: **the third test of a level is decisive**, and a third bottom that holds means an advance (A05 Ch. III).
- **Tolerance ≈ 3 points**: "not 3 points under" the prior lows (1921).

2.3 **Clustered levels are averaged into one** (Ch. 9). This is the primary text for `combineNearbyLevels`.

2.4 **Squares and wheels** (Ch. 13, 15A/B):
- Square of Nine, Square of 12 / Master 12 (144, 288, 432, 576), Square of 52 (weekly), Square of 144 (20,736), Square of 20 (NYSE, origin May 17 1792), Master 360° chart, Hexagon chart.
- **The hexagon and Square-of-20 plates are lost.** B12's check shows Gann's non-radial series (2, 9, 22, 41, 66…) doesn't fall on one angle in a modern reconstruction, which supports keeping `hexagonChart.ts` research-only.
- `squareOf9.ts` uses the geometrically correct **180° = +1 in the square root**. The B03b "D-levels" table's "45°" steps are really **22.5°**; don't "fix" the code to the table.

2.4a **Percentages of the extreme *price*, not only of the range** (A8 pp. 32–34, 1942/51; A09 1949).
- Divide the **low** price by 8 (12½ … 100%), and also divide the **highest selling price** by 8 and by 3.
- **50% and 100% of a bottom are "the two most important"** (A8 p. 32). Use 10% multiples for cotton-type markets.
- Importance order (A8 p. 34): all-time range, then divisions of the highest price, then each campaign, then 3rd/4th lower tops.
- `retracement.ts` uses **range** fractions only. See Part V, G13.

2.4b **The 4th test goes through** (A8 p. 43; A09). Triple tops and bottoms years apart are the most important. A 4th test usually breaks the level, and if it holds a big reversal follows. See G15.

2.5 **Price in motion: speed.** Points per unit of time.
- A rally "very feeble … for the time required" means liquidation isn't finished.
- **Equal-points and equal-time legs** flag culminations (A05).
- `normalizedSlope.ts` covers speed conceptually.

### 3. Trend

3.1 **Swing charts.**
- GSPS's 3-day and 9-day charts count closing runs (implemented, `swingChart.ts` / `trendStrength.ts`).
- **Gann's own definitions differ** (*45 Years in Wall Street*, 1949, Ch. VII; A09). See Part V, conflict X3.
  - His **3-Day Chart** is built from **highs and lows**: three days of higher tops *and* higher bottoms. The signal is crossing the last 3-day top or bottom.
  - His second chart is a **9-point** swing chart: a reversal on a counter-move of at least 9 points in the Dow. No 9-*day* chart appears there.
- The Master Course Ch. 18 also defines a **weekly 1-bar swing chart**: reversal on a higher top and higher bottom (lower for down). **Not implemented.**

3.2 **Close vs the bar's midpoint** (Ch. 13). A close above (H+L)/2 means the trend is up, and below means down, "at least temporarily." It is Gann's own per-bar trend read, cheap and literal. **Not implemented.** Gann's "moving average" is likewise the per-period midpoint (B01).

3.3 **The three-stage Space Rule** (Ch. 7, 10A, 11A). A trend is judged changed in stages:
1. the last counter-move is exceeded
2. the cluster of recent weekly bottoms (tops) is broken
3. the **greatest counter-trend move of the campaign** is exceeded

Confirmation rules:
- **+1 point** past the level confirms; allow **3 points** at high prices
- a reaction under an old top shouldn't exceed about 5 points

**Not implemented.** No module measures "greatest counter-trend move of the campaign."

3.3a **Over-balance: time before space** (A8 BP/SP #3–#6 and p. 51; A09 Rule 8; Master Course Ch. 11). Reddy (B04) ranks these first among the disclosed buying and selling points.
- The first counter-move whose **time** exceeds the greatest counter-move of the prior campaign changes the trend (e.g. a reaction longer than 4 weeks in a bull market).
- So does the first whose **space** (points) exceeds it.
- "TIME … will overbalance both Space and Volume. When TIME is up, space movement will start and large volume will begin" (A8 p. 56).
- The signal carries more weight after the 3rd or 4th section of a campaign than after the 2nd.
- **Not implemented.** See G14.

3.4 **Monthly-low break.** The first break under a prior month's low since the top signals a turn (A05).

3.5 **Individual stocks vs averages.**
- Gann **explicitly rejected Dow-Theory index confirmation** (A05 Ch. IV; Master Course Ch. 5–6).
- Each stock has its own time period and its own "vibration" (A01).

### 4. Entries, stops and trade management

4.1 **Buy and sell points.** Cross an old swing top or bottom by a small allowance: **"lost motion" averages 1⅞ points and never reaches 3 full points** (Ch. 9; A8). Implemented in `entryTrigger.ts`, and the Ch. 9 citation should be added.

4.2 **The 3-point rule family** (A05). Partly implemented in `entryConfirmation.ts`.
- Single, double and triple-bottom stops.
- A 3-point breakout confirms.
- "Should not react 3 points back under a crossed old top." This is a **hold test and is not implemented**.
- "3 points back above a broken low = bottom." This is a **reversal test and is not implemented**.

4.3 **Stops always, placed at entry**, 1–3 points away (A05 Ch. II). A tight stop against a level is the method's shape from 1909 on (A01).

4.4 **Post-entry validation.** Exit if the trade **closes against you three successive days** (A05 p. 23). **Not implemented.**

4.5 **Pyramiding.**
- *Tunnel*: largest amount first, then **decreasing**, with a stop on every add.
- A05 gives spacing by price level (5 points at 20–50, 10 points at 80–200) and shrinking units after the 4th or 5th lot.
- GSPS does not pyramid, so this is an education point.

### 5. Volume (Master Course Ch. 12; A05 Ch. VI)

- **Normal bottoms form on *decreasing* volume and narrowing range.** Tops come on *increasing* volume. **Climax volume at a low is the exception** (fast panics such as Oct–Nov 1929).
- **Peak volume precedes the price high.**
- **Shares-per-point efficiency** falls at tops; it doubled at the 1937 top.
- **Volume relative to the float** in a distribution range.
- Volume drying up to multi-year lows marks a bottom.
- Volume is "the driving power" (Cause and Effect in Gann's words).

- **Confirmed in three separate texts:** Master Course Ch. 12, *45 Years* Ch. X (1949: heavy volume at tops, volume drying up at bottoms), and *Commodities* p. 63 (1939–40 wheat, where the public bought heavily at the top).

⇒ This conflicts with `volumeClimax.ts`'s premise; see Part V, conflict X1.

### 6. Risk and money management

- **Risk ≤ 10% of capital**, restated in *Tunnel* as **10% of current profits, shrinking after each loss**, "the market would have to beat him ten consecutive times."
- **Reduce the unit after 2–3 losses**, double only once profits equal capital, and keep a reserve fund (A05).
- **Don't over-diversify**: "too many irons in the fire," and people keep losers while cutting winners (*Tunnel*, Watson's lessons).
- **Series-of-losses rule** (A8 pp. 12, 17, 29; Rule 27):
  - After 1–3 losing trades, "something is wrong with you and not with the market." Get out, wait and study.
  - After 3 consecutive losses, cut the unit to **10% of *remaining* capital**. Reduce after the first loss and never increase.
  - This is direct Gann grounding for `lib/risk/cooldown.ts`. See G16.
- **Never trade in bad health**: stop when your own state is impaired (A05 Ch. II). This is the conceptual parallel to `lib/risk/cooldown.ts`.
- GSPS `lib/risk/*` is aligned in structure (percentage ceilings), as `GANN_HISTORICAL_SOURCES.md` already records.

### 7. The trader: psychology and discipline

- Losses come from hope, tips, opinions and guessing; **"hope is the enemy"** (*Tunnel*); fear first, then greed after success (*Magic Word*).
- The **five qualifications**: knowledge (study daily for years), patience, nerve, health, capital (A05).
- **Prove the rules to yourself, then follow them.** This is Gann's own validation-before-trust principle and aligns with GSPS's "measured" gate.
- **Rules are versioned against market structure.** After the SEC-era changes Gann wrote new rules because "a wise man changes his mind" (A05 Ch. I). This is precedent for re-deriving thresholds when regime or data changes, not for abandoning rules.
- "Cycles repeat because human nature does not change" (A11): the market cycle as a mental and psychological cycle.

### 8. Worked cases in Gann's own text

- The **1929–1932 bear market in four sections** (A05): the 71-day crash; the secondary rally of 155 days on falling volume; each later leg shorter, on less volume. The low of Jul 8 1932 came **34 months** from the top, inside the 30–36-month window he forecast from past campaign lengths.
- **Auburn Motors, 1931** (Ch. 16): a daily angle walkthrough.
- **Cotton and "Major Motors," 1927** (*Tunnel*): turns dated from report dates and the company's age.
- **Coffee, 1954** (A2.3): month counts from each prior pivot (9, 6, 5, 2), a 45° time angle, and astrology.

These show the **method's shape**. The accuracy figures attached to them (92% in 1909, and so on) are testimony, **never usable as performance claims** (banned-terms rule).

### 9. What Gann did that GSPS will not build

- **Astrology** is real and his own (A2.3 1954 letter; B03 ephemeris diary: Jupiter conjunct Mars on Dec 1 1948 marked at the soybean top). **Policy is unchanged: never gating.**
  - A labelled confluence field would be admissible only from a real ephemeris calculation traceable to Gann.
  - The only traceable candidates: **Jupiter–Saturn heliocentric conjunction/square**, **Saturn return**, **Mars half-return from a pivot**.
  - Gann's per-market **price→degree scales** (1, 12, 30, 45, 46, 50 pts/degree) are chosen with no derivation and several are tried at once. That is a multiple-comparisons pattern and **not admissible**.
- **Numerology.**
  - Name and letter-count squares (Master Course Ch. 15A; *Tunnel* Ch. XVIII) are citably Gann's but carry no validatable rule. **Excluded.**
  - The sacred numbers 3, 7, 9, 10, 12, 21 and the 1+6 hexagon (*Magic Word*) are authorised as *Gann's* numbers but give no market rule. They stay **confluence-only**, as `digitalRoot.ts` is.
  - Jubilee/49-year Bible arithmetic (*Tunnel*): **not recommended**.
- **Bucholtz-style planetary "bull/bear" tables** (B06): non-Gann and unvalidated. They are the counter-example that shows why Dewey's checklist exists.

---

## Part II — Cycle theory: what the literature says and how to use it

### 1. Gann ↔ cycle literature: the bridge in the sources themselves
- Gann called his method "harmonic analysis" and pointed to Fourier and Schuster (Part I §1.8).
- Dewey and Tomes use exactly those tools.
- So the cycle literature is **not an outside graft on Gann**: it is the discipline Gann himself pointed to, with the rigour he didn't publish.

### 2. Dewey's checklist: the full version (C06, *The Case for Cycles*, 1967)

AGENTS.md cites "Dewey's seven-item checklist." **Dewey's own text lists 18 criteria plus common sense.** The seven are a working subset.

The Foundation's order of assumption, which Dewey credits to Feynman:
1. **assume chance first**
2. then an **internal** cause
3. only then an **external** one

**Single-series criteria (1–10):**
1. **Dominance**, measured on detrended data
2. **Regularity of timing**
3. **Number of repetitions**
4. **Constancy of period**
5. **Phase re-established after distortion**
6. **Persistence through changed conditions** *(not in the AGENTS.md seven)*
7. **Persistence after discovery, or a period postulated in advance** (out-of-sample) *(not in the seven)*
8. **Cycles fitted on part of the data describe data found later** *(not in the seven)*
9. **Wave shape** (non-random; asymmetry allowed)
10. **Mathematical significance tests** (e.g. Bartels; Schuster) *(not in the seven)*

**Comparative criteria (11–18):**
11. Identity of period across series
12. **Synchrony** of phase; tests assuming *identical* turning dates are invalid
13. Weaker members gain credibility from a significant member of the group
14. Identity of wave shape
15. Geographic pattern (latitudinal passage)
16. Magnetic/landmass distortion
17. **Periods cluster** at certain lengths
18. **Families of cycles** in ×2 and ×3 progressions

**Diagnostics GSPS can use directly:**
- **Only criteria 5 and 6 separate a *forced* (external) cycle from a *free* (internal) one.** A stopped pendulum restarts *out of* phase; a forced cycle resumes *in* phase.
- **Gann's own causal claim** ("human nature does not change") describes an *internal* cycle, which by Dewey's diagnostic **would not be expected to keep its phase through a major dislocation**. So phase continuity of Gann time counts after a shock is **a thing to test, not assume**.
- **Out-of-sample (criterion 7).** With ~50 candidate periods searched in-sample, confirming one predetermined period on new data cuts the chance explanation ~50-fold.
  - Benner's 1874 pig-iron rule traded at 50:1 gain/loss for decades. It then drifted because the true period was **9.2 years** and he used whole years.
  - Lesson: count in days or bars where Gann gives day counts, and treat any searched period as unconfirmed until it holds forward.

### 3. Tomes and Dewey: the harmonic lattice (C01–C04, B13)

**The empirical pattern.**
- Dewey (1967) found common cycles at ×2 and ×3 steps from **17.75 years**.
- Tomes found 4.45/5.9/7.15/9.0 years as ÷8/6/5/4 of **~35.7 years**, with the ultimate fundamental near **108 years**.
- Dewey's five conclusions:
  1. everything has cycles
  2. common periods recur across fields
  3. they show synchrony
  4. they stand in ratios of 2 and 3
  5. some are extraterrestrial

**Tomes's proposed mechanism.**
- A sine wave passed through a **non-linear response function** yields only **integer harmonics**.
- The fundamental harmonic stays in phase with its input, which is why synchrony survives chains of cause and effect.
- In a complex network, harmonic *H*'s strength grows with the **number of ordered factorisations of H**.
- The strongest "main line" runs **1, 2, 4, 12, 24, 48, 144, 288, 1440, 2880, 8640…**, with roughly one ratio of 3 per two to three ratios of 2.

**The Gann bridge (our interpretation, not a citation).**
- Gann's number system is built of 2s and 3s:
  - divisions ½, ⅓, ¼, ⅛
  - master numbers 9, 12, 36, 72, 144
  - the Square of 144 = 20,736 days
  - 360 = 2³·3²·5
- **144 and 288 sit on Tomes's strongest main line.**
- Gann's ranking of time divisions (anniversary > ½ > ¼/¾ > ⅓/⅔ > ⅛) follows the order a 2×3 lattice predicts.
- ⇒ Gann supplies the **rule**, the cycle literature the **mechanism and the validation standard**.
- This **does not** license divisions Gann never used (⅕, ⅐) or any numerology.

**Independent corroboration of Gann's periods (supportive, not proof):**

| Gann period | Independent cycle | Match |
|---|---|---|
| Campaigns 35–49 months | **40.68 months** (Mogey/Dewey, all US stock history), the 41-month cycle (Lane 1950, phase-modulated by 22 years), 1238 days in Tomes's solar-harmonic table (C03) | ~3½-year stock rhythm |
| 10-year cycle | Juglar 9–11 years; Dewey's **9.2-year** stock cycle (1834–1966, Bartels significance ≤ 1 in 5,000) | ~9–10 years |
| 20-year cycle | Kuznets ~18 years; Dewey 17.75 | ~18–20 years |
| 56¾ / 60-year Great Cycle | Kondratieff 53–54 years (Tomes 53.38; demographic cause) | ~54–60 years |

Under Dewey this is **cross-series clustering** (criterion 11/17). None of it establishes phase, significance or out-of-sample persistence *for GSPS's instruments*.

**Tomes's methodological cautions worth keeping:**
- **Average cycle vs specific occurrence** (C01): a cycle can be real on average while no single interval equals the average (e.g. 11.07 years on average, but actual intervals of 10.38 and 12.00). So treat Gann time counts as **windows**, not points.
- **Period from symmetric pairs of peaks, phase by averaging projections from *every* past peak** (C02, oil 5.54 ± 0.03 years). This is a robust form of Gann's "count from every important top and bottom," and it gives a natural **dispersion/confidence** measure for a projected window.
- **Decline claims with too few repetitions** (C02, the 30–36-year oil idea). That is the standard to hold GSPS to.

### 4. Halberg's chronobiology: measurement methods (C07)
- **Phase confounding.** Comparing two groups at one fixed clock time gave a large difference, then none, then the *opposite* difference as their phases drifted. **Fixing the time does not remove a rhythm's effect.**
  - Trading form: attribution deltas pooled across market phases can flip sign by phase. Read them split by regime where possible.
- **Cosinor.** Report a fitted cycle's **amplitude and phase with confidence intervals**, and validate a rhythm with a **zero-amplitude test** (the error ellipse must exclude zero), not a phase alone.
- **"Circa."** A period is an estimate with uncertainty, and near-periods **beat**: a component can be prominent, vanish, then return.
- **Gliding spectral windows.** Dominance comes and goes, so map the spectrum over time.
- **Feedsidewards.** The *same* input stimulates, does nothing or inhibits depending on the phase at which it arrives. This gives Gann's "time over price" a concrete mechanism: the same price event means different things at different points of the time cycle.
- **No master oscillator.** The body is a network of co-equal oscillators, which matches GSPS's uniform cross-criterion weights.
- Halberg's cosmic/solar-wind material falls under the astrology boundary. **Excluded.**

### 5. Dewey's definitions (C05): vocabulary discipline
- Hierarchy: order → pattern → **pattern in time** → cyclic → repetitive → ordered/random → **rhythmic** → **periodic**.
- **"Ordered" refers to the regularity of the period, not serial correlation.** Prices are autocorrelated, and that is not evidence of cycles.
- **Recurrent events** (discrete yes/no dates) need **different statistics** from repetitive cycles.
- ⇒ Gann's anniversary and seasonal dates are *recurrent events*: validate them by **hit-rate against a base rate**. Swing and wave periods are *repetitive cycles*: validate them spectrally. Most Gann time rules are **rhythmic windows**, not periodicities, and code headers should say so.

---

## Part III — The Hermetic lens

### 1. Where the seven principles come from
- The seven named in AGENTS.md (Mentalism, Correspondence, Vibration, Polarity, Rhythm, Cause and Effect, Gender) are ***The Kybalion*'s** framework (1908, "Three Initiates"; US public domain). **They are not Hauck's.**
- `GANN_HISTORICAL_SOURCES.md` words this correctly; the Kybalion itself is not in the catalogue (Part VI).
- **Hauck** frames the Emerald Tablet as rubrics: **One Mind / One Thing**, **Above / Below**, **four elements**, **seven operations**.

### 2. Gann's own Hermetic vocabulary (primary evidence that the lens fits)

| Principle | Gann's own statement (paraphrased) | Source |
|---|---|---|
| Vibration | Each stock has its own rate of vibration, like wireless telegraphy; "the great law of vibration… like produces like" | A01 1909; A03 Ch. VII; B01 quotes |
| Correspondence | One law across spiritual, physical and financial planes; wheel within a wheel; 1° = 1 day = 1 year | A10; A03 |
| Rhythm | "A time to every purpose"; action and reaction; cycles within cycles | A10; A05 Ch. III; A03 |
| Cause and Effect | Sowing and reaping; "every effect must have an adequate cause"; volume is the driving power | A10; A01; A2.1 Ch. 12 |
| Mentalism | Visualise, then plan, then build; "cycles repeat because human nature does not change" | A10; A11 |
| Polarity | Positive, negative, neutral; every rule has its "reverse the rules" mirror | A03; A05 |
| Gender | Weakest. Only the positive/negative/neutral triad | A03 |

### 3. Hauck's Emerald Tablet (H01, complete for this edition)
- **Correspondence runs both ways.** "As below, so above; as above, so below." Hauck calls the popular one-way reading half the equation and says **work begins in the Below**.
  - GSPS already practises this: trade outcomes (Below) correct our translation of Gann's rules (Above) through the measurement gate. The cross-platform consistency rule is the other direction.
- **Four elements from the One Thing, each with an operation:**
  - Sun/Fire → Calcination
  - Moon/Water → Dissolution
  - Wind/Air → **Separation**, which "must occur at the proper moment or all is lost"
  - Earth → Conjunction
  - Then Fermentation, Distillation, Coagulation (chapters not read)
- **One element becomes another by changing one quality** (Aristotle's hot/cold × dry/moist). A metaphor for legible **state machines**: transition on one changed condition.
- **The overlooked First Matter.** "Found everywhere, prized by no one" is the right attitude to Gann's plainest tools: the 50% point, the swing extreme, the anniversary date. This matches the full report's §18.4 "cheapest, most literal rules first."
- **The operations as a returning cycle** (Ouroboros), not a pipeline that halts. This matches AGENTS.md "Cycles as architecture."

### 4. Discipline (unchanged)
The lens shapes design and reasoning. It **cannot move a threshold, weight or gate**; only a citable Gann source or a measured result can (AGENTS.md "Hermetic principles & cycle theory"). Hauck's register (paranormal, devotional) and Gann's astrology are **belief records, never evidence**.

---

## Part IV — Where GSPS already aligns (verified against `lib/` on 2026-09-27)

| Gann rule | GSPS | Source |
|---|---|---|
| Entry on crossing an old swing extreme, plus lost motion | `lib/gann/entryTrigger.ts` | A2.1 Ch. 9; A8 |
| Clustered levels combined | `lib/strat/levels.ts#combineNearbyLevels` | A2.1 Ch. 9 |
| ½ first, then ¼/¾, ⅓/⅔ retracements | `lib/gann/retracement.ts` | A2.1 Ch. 2, 13 |
| Pivot-anchored cycle-year hierarchy and wheel counts | `lib/gann/timeCycles.ts` (`MAJOR_CYCLE_YEARS`, `WHEEL_COUNTS`) | A2.1 Ch. 7 |
| Direction from price, time as the window | `timeCycles.ts` pivot polarity | A2.2 |
| 3-day/9-day swing charts; trend = 9-day, confirmed by 3-day structure | `swingChart.ts`, `trendStrength.ts` | **Aligned in intent only.** A09 Ch. VII defines a high/low 3-day chart and a 9-point chart; see conflict X3 |
| Rule of three closes | `ruleOfThree.ts` | A4 |
| Square of Nine geometry (180° = +1 root) | `squareOf9.ts` | Checked against B03b/B12 |
| Spectral cycle, detrended, confluence-only | `spectralCycle.ts` | Now **citably Gann's tool** (1926 letter) |
| Percentage risk ceilings | `lib/risk/*`, `checkPositionLimits` | A3/A5; *Tunnel* |
| Monthly, weekly, daily hierarchy | `lib/analysis/trend.ts#readTrend` | A05 |
| Uniform cross-criterion weights | `DEFAULT_CRITERION_WEIGHTS` | No source ranks Gann's conditions across techniques; Halberg's "no master oscillator" is consistent |

---

## Part V — Gaps, conflicts and corrections (owner decisions)

Every item below is an **open recommendation**. Items that touch scoring, gating, plans, orders or risk are **held for the project owner** under AGENTS.md. Anything built must pass gate 1 (cited here) and gate 2 (measured), and anything cyclical must state its Dewey items.

**Build plan:** `GANN_PARITY_ROADMAP.md` (and PDF) turns this Part into a rule-by-rule parity matrix (74 rules) with owner decisions and a staged build order.

### Conflicts to review
- **X4 — "Never fix a target price" vs GSPS's fixed TP1 and master target** (found 2026-09-27).
  - Gann exits on the stop or on a trend-change signal, and sells at resistance levels his rules identify (A02 Book II; A04 rules).
  - `lib/trade/protocol-exit.ts` takes 60% off at TP1 and 20% at the master target.
  - See the roadmap, Part 4, decision 2. **Owner decision.**
- **X1 — `volumeClimax.ts` vs Gann's volume rules.**
  - The module's header says a genuine turn "prints on climax volume." The Master Course Ch. 12 (Rule 3) and A05 say **normal bottoms form on *decreasing* volume and narrowing range**, and climax volume at a low is the **exception** (fast panics).
  - The criterion measures positive (Δ+0.645R, 2026-09-23 run). That is a translation-fidelity question for the owner, not an automatic change.
  - Options: (a) keep it and document it as Gann's *panic-bottom* case; (b) add the normal-bottom rule (volume drying up) alongside; (c) replace it. Gann precedence argues for at least (b).
- **X3 — `swingChart.ts` vs Gann's own chart definitions** (A09 Ch. VII, 1949). This is the most consequential finding of the second pass.
  - **Gann's 3-Day Chart** runs on highs and lows: three days of higher tops *and* higher bottoms, with the signal on crossing the last 3-day top or bottom. The code flips on three consecutive *closes*.
  - **Gann's second chart is a 9-point swing chart** (a reversal on a counter-move of at least 9 Dow points), not a 9-day chart.
  - **Who depends on it.** `swingChartTrend` (a scored criterion), `trendStrength.ts` (the regime engine) and `readGannTrend` (macro trend reads) all sit on the 9-day chart. So this reaches the core verdict.
  - **Settled on the source side (2026-09-27).** Four texts agree that Gann builds swing charts on *time*, meaning the duration of counter-moves, and turns the trend on **breaking the last swing extreme**:
    - A8's 1951 New Rules (pp. 316–317): daily counter-moves of 2–3 days, and a weekly chart of 7 calendar days or more
    - A09 Ch. VII: a 3-day chart on highs and lows
    - A04 Ch. IV (1930): "space charts fool traders the most because they ignore time"; daily, weekly and monthly time rules
    - A02 p. 82 (1923): "moves of from three days to one week"

    None of them defines a "9-day" chart or a consecutive-close counter. The closest literal port is a 2–3-day swing chart plus a 7-calendar-day chart. Full reading: `sources/A08_…md` "X3 — what the 1951 New Rules settle", and `sources/A02_A04_…md`.
  - **Porting the point threshold.** A 9-point move was about 5–9% of the Dow at 100–200. Porting it needs a price-scaled or ATR-scaled threshold (the literal-magnitude carve-out AGENTS.md documents for `combineNearbyLevels`).
  - Under "WD Gann precedence" the code should match Gann's definition or record why not. **Owner decision; do not change silently.**
- **X1 status:** now confirmed by A09 Ch. X and A8 p. 63 as well as A2.1 Ch. 12.
- **X2 — withdrawn after checking the code.**
  - The source notes had flagged `macroBreadthAgrees` against Gann's rejection of Dow-Theory index confirmation.
  - The function (`lib/scan/entrySelection.ts`) requires **the stock's own** monthly, weekly and daily trends to agree. That is Gann's own chart hierarchy (A05; Part IV), not confirmation from an index or group.
  - **No conflict.** The live Gann rule to keep in mind: never gate a stock's setup on an *index's* or *sector's* trend.

- **C-A4-1 — `timeCycles.ts`'s fixed calendar cycle uses the wrong days** (a porting defect, found 2026-09-27).
  - *Wall Street Stock Selector*'s back matter (the 1929 Annual Forecast, PDF 458) gives the "permanent cycle which does not change" as **Feb 8–10, Mar 21–23, May 3–7, Jun 20–24, Aug 3–8, Sep 21–24, Nov 8–11, Dec 20–24.**
    - That is the solar year in eighths: the equinoxes and solstices, plus the cross-quarter points.
    - A09 (1949) repeats the same anchors.
  - The code uses **day 5** of each of those eight months. That is right for Feb, May, Aug and Nov, but **16–19 days early for Mar, Jun, Sep and Dec.**
  - The month list was right, which hid the error: the anchor was wrong, the same shape as `harmonicProximity`.
  - The field is display-only, so the blast radius is low. **Fixed 2026-09-27 with owner go-ahead:** `FIXED_CALENDAR_WINDOWS` now holds the eight disclosed windows, each widened by ±`windowDays`, with tests.

### Gaps: Gann rules with no implementation (candidates, in rough order of literalness and cost)
1. **G1 — Close vs bar midpoint** (Ch. 13). A per-bar trend read. Cheapest and most literal.
2. **G2 — Counter-trend duration prior** (Ch. 11B, 14, 17; A05). Count the current counter-move in weeks; ≥ 3rd month means trend change. A context or confluence field first.
3. **G3 — Three-stage Space Rule / "greatest reaction of the campaign exceeded"** (Ch. 7, 10A, 11A). A trend-change rule.
4. **G4 — Post-entry tests** (A05). "No 3-point reaction back under a crossed old top" (hold test); three successive adverse closes means exit. Natural `lib/lifecycle/` invalidations; they touch exits, so owner sign-off is needed.
5. **G5 — Weekly 1-bar swing chart** (Ch. 18).
6. **G6 — Monthly-low/high break** as the trend-turn signal (A05).
7. **G7 — Volume efficiency and float** (Ch. 12). Shares-per-point at tops; volume relative to float (needs a shares-outstanding data source).
8. **G8 — Seasonal counts from Mar 20/21 with midseason points, and ranked change dates** (Ch. 14, 17, 18). Check `timeCycles.ts`' calendar against the Ch. 18 day counts.
9. **G9 — 7/14-day alternation** (A2.2), corroborated by Ch. 14's 14/21-day counts. Confluence.
10. **G10 — Incorporation-date anniversary** (*Tunnel*; Ch. 7). Needs per-symbol incorporation dates.
11. **G11 — Square of 144 fraction and convergence rules** (Ch. 13). `masterTwelve.ts` has the spiral but not the convergence of independent squarings into one window.
12. **G12 — Time-projection dispersion** (Tomes C02 method applied to Gann's "count from every pivot"). Report how tightly projections from multiple past pivots cluster. A confidence annotation, not a gate.
13. **G13 — Percentage-of-price levels** (A8 pp. 32–34; A09). 50% and 100% of the low; ⅛s and ⅓s of the highest price. Verify first that no module computes them (a grep found none).
14. **G14 — Time and space over-balance** (A8 BP/SP #3–#6, p. 51; A09 Rule 8; A2.1 Ch. 11). The first counter-move longer, in time or points, than the greatest counter-move of the prior campaign. Pairs with G2 and G3; may share one "campaign counter-move ledger."
15. **G15 — 4th-test rule** (A8 p. 43; A09). A small confluence or invalidation field on repeated tests of a level.
16. **G16 — Series-of-losses rule** (A8 pp. 12, 17, 29). Cite it in `lib/risk/cooldown.ts`; check whether the cooldown thresholds (loss count, unit reduction to 10% of remaining capital) match. Risk change, so owner sign-off.
17. **G17 — Day-count bands** (A8 p. 57–58; A09 Rule 8): 49–52 (7×7), 42–45, 90–98, 120–135, 330 days, and the short A09 bands (7–12, 18–21, 28–31, 42–49, 57–65, 85–92, 112–120, 150–157). `WHEEL_COUNTS` has only 45/90/120/180/270/360. Also the monthly change days and the January-range rule (A8 p. 58).
18. **G18 — Final-stage trailing stop** (A8 BP/SP #9 via B04). In a fast final stage, trail the stop under or over the previous day's extreme after a 2-day counter-move. A candidate for `lib/lifecycle/` with `boilingPoint.ts`. Exit rule, so owner sign-off.
20. **G20 — Reverse signal day and the 7–10 Day Rule** (A8 1951, pp. 311, 317–318). A literal daily-bar rule.
21. **G21 — Gap rules** (A8 1951, pp. 318–325): the exhaust gap, gap counts, and "a filled gap reverses the minor trend". Confluence first.
22. **G22 — Time balancing and percentages of time** (A8 pp. 97–99, 293; A04 Ch. VII).
    - Project prior swing durations forward, and fractions of them.
    - "The more time consumed in accumulation, the bigger the advance."
    - Use the campaign's greatest reaction, in points *and* days, as the gauge. Shrinking reactions in the last section signal exhaustion (A8 p. 52).
    - Pairs with G3 and G14.
23. **G23 — Break-even stop after 3–4 points of profit** (A02 Book II; A04 Rule 3). A lifecycle rule. It changes exits, so it needs owner sign-off. The literal point magnitude needs price scaling.
24. **G24 — The monthly reaction rule and trailing stop** (A04 Ch. IV and VII):
    - Strong stocks seldom react into a 2nd month.
    - Never short a stock whose reactions last no more than a month.
    - Pyramid every 10 points, with the stop trailed under the prior month's low.
25. **G25 — First-year-high leadership filter** (A04 Ch. VII). A stock must cross the high of the campaign's first year (or 3 points above it) before it can lead a later section. A scanner ranking and context field.
19. **G19 — Wheel angle from prior extremes** (Master Egg Course, quoted in B05). Place each prior high and low on a 360-unit price wheel and treat prices at 0/90/120/180 from them as levels. Research and confluence only, since the illustrations are lost (same caveat as `squareOf20.ts`).

### Measurement-method enhancements (cycle literature; confluence and diagnostics only)
- **M1 — `spectralCycle.ts`:**
  - add a **Schuster probability test** (B01; P ≈ e^(−κ) × the number of independent frequencies) as the dominance check
  - add a **cosinor amplitude CI / zero-amplitude test** (C07)
  - guard against **window/k artifacts** (B01)
  - consider **log-price detrending** (currently a linear detrend of closes, C03 note)
  - Covers Dewey items 1 and 10.
- **M2 — Out-of-sample confirmation for any searched period** (Dewey 7). The existing split-half check is a start; a forward hold-out is the full test.
- **M3 — Regime-split attribution** (Halberg phase confounding; Dewey 6). Read `attribution.ts` deltas by regime or phase where the sample allows, as the 766-symbol run's halves already do.
- **M5 — Repetition-count caution on the longest cycles** (Dewey 3; B07 Ch. 7 makes the same point from the other side). `MAJOR_CYCLE_YEARS`' 30/50/60-year entries have 1–4 repetitions in any US equity history. Label them as Gann's disclosed hierarchy, not as validated periodicities.
- **M6 — Base rate before hit rate.** B07's "efficiency tests" report 56% hits without the market's own up-day base rate. GSPS's attribution already compares each criterion with the unconditioned population. Keep it that way for any new calendar field.
- **M4 — Validate calendar/anniversary windows as recurrent events** (Dewey C05): hit-rate vs base rate, not spectra.
- **M7 — Gann's own out-of-sample record.** *Face Facts America!* (A07, May 1940) is a dated, public forecast by his undisclosed "Master Time cycles," written before the events. Most of its calls missed:
  - the war was supposed to end by May 1941 at the latest
  - post-war deflation and US bankruptcy were expected
  - it did get "turn for the better in 1945" roughly right

  The 1929 forecast (A04) is a single success Gann chose to reprint. Together they are the argument for measuring any calendar or anniversary field before it can mean anything. This concerns only the *undisclosed* forecasting method, not the disclosed rules GSPS implements.

### Astrology research track (priority clarified 2026-09-27, owner direction; see AGENTS.md "Astrology")
Not low priority, and not first. Where Gann himself names the technique and our files corroborate it, it ranks alongside his other techniques. Each needs an ephemeris calculation, a rule fixed in advance, and Dewey's test (base rate, significance with a multiple-comparisons correction, out-of-sample). A proven technique enters as confluence only.
- **AS1 — Planetary averages** (1954 soybean letter, quoted in B05): the heliocentric and geocentric averages of Mars through Pluto, and of Jupiter through Pluto (Mars left out), as time/price resistance. Open question to fix *before* testing: smooth the 360°→0° wrap or not (Gann doesn't say).
  - **Built 2026-09-30 on owner direction, with the COE and MOF** (`lib/gann/planetaryAverages.ts`, source note A12). The letter of March 20, 1954 names the "COE AVERAGE" (not "CE") and the "MOF FORMULA"; Walker and Ganntrader (Tier B) decode them as the circle of eight (Mercury to Pluto) and the mean of five (Mars left out), which match the letter's own paragraphs.
  - The wrap question is settled: a mean of N longitudes is defined only to within 360/N, so the resistance points are the family A + k × 360/N (60°, 72°, 45°), identical however the wrap is taken. Ganntrader draws those spacings.
  - One price unit (the Gann point, one to a degree), fixed in advance. The Tier A averages' nearest points join the S/R list; all are measured context factors.
- **AS2 — Active angles** (1954 letter): a transiting planet's longitude, plus its 90/120/180°, read as a price via the Circle Chart. Mikula's first-trade-horoscope reading is interpretive, so test it separately.
- **AS3 — Jupiter–Saturn aspects** (1954 letter; 1948 chart; *Speculation* 1954 per B05): conjunction, square, trine, sesquisquare and opposition dates against pivot dates.
- **AS4 — Returns**: the Saturn return (A2.3; B03) and the Mars half-return from a pivot.
- **AS5 — Eclipse longitude crossed by a planet** (attributed to *Truth of the Stock Tape* and *Stock Selector* by B05): interpretive, lower priority. **Correction C-A4-2 (2026-09-27):** both books were read in full, and neither mentions an eclipse, a planet, a zodiac sign or astrology. The attribution is Mikula's, not Gann's text. Cite AS5 to B05 only unless a Gann source is found.
- **What A02/A04 do add to this track:**
  - The "permanent cycle" dates are the Sun's annual eighths (C-A4-1). That is a solar and seasonal cycle Gann disclosed, **not** a planetary aspect.
  - The 1929 forecast is dated turn by turn and adds storm, earthquake and war calls. It is "based on my Master Time Factor… return of cycles" and **never names astrology.** Treat an astrological reading of it as inference.
- **Pre-requisites:** an ephemeris source in code (a vetted astronomy library, not hand tables); an extraction of the astrology rules from the now-complete B05 note (*Truth of the Stock Tape*, the *Stock Selector* and Pesavento's appendices are read; none adds a Gann astrology source); and the 1954 letter text itself (A2.3 notes).
- **Excluded regardless:** per-market price→degree scales chosen without derivation (Part I §9), and non-Gann astrology (B06, B07, B11) except as test-method reference.

### Documentation corrections
- **C-A12-1 — "CE AVERAGE" is "COE AVERAGE"** in the March 20, 1954 letter (A12 §4). Corrected in A2.3's note and the catalog.
- **C1 — AGENTS.md "20-year Master Time Period among cycles"** (in "The scorecard's role"). Gann's "Great Cycle / Master Time Period" is **20 (1931), 60 (1935), 56¾ (1953) or 90 (1955) years depending on the lesson**. The sentence's point (a ranking exists *within* the cycle technique) stands. Correction: cite the lesson and year, e.g. "the Master Time Period among cycles (20 years in the 1931 lesson; later lessons name 60, 56¾ and 90)."
- **C2 — AGENTS.md "Dewey's seven-item checklist."** Record that Dewey's own list (*The Case for Cycles*, 1967) has 18 criteria. The seven are a working subset, and criteria 6 (changed conditions), 7 (out-of-sample) and 10 (significance) should be answered when a cycle claim is actually being validated.
- **C3 — `GANN_HISTORICAL_SOURCES.md`:**
  - the Puts and Calls text (A6) is also bundled in the Master Course as Ch. 19A (1937)
  - the lost-motion and level-clustering rules have **primary text in Ch. 9**
  - Gann's **1926 Fourier/Schuster letter** and the **1921 Moore connection** (B01) belong in the Part C bridge
- **C4 — Code-header citations** (no behaviour change):
  - `entryTrigger.ts` and `combineNearbyLevels`: add Ch. 9
  - `spectralCycle.ts`: add *Tunnel*'s "harmonic analysis" and the 1926 letter
  - `timeCycles.ts`: note that Gann's windows are rhythmic windows / recurrent events (Dewey C05)
- **C5 — Don't "correct" `squareOf9.ts`** to the D-levels table's 45°-per-⅛-root labelling (B03b). The code's 180° = +1-root convention is the geometric one.

---

## Part VI — Coverage and what remains unread

*Updated after the third pass (2026-09-27): local OCR of the image-only scans, downloaded under the one-rule curl permission.*

**Read in full, page by page:**
- *Tier A:*
  - Ticker 1909 (A01)
  - **Truth of the Stock Tape 1923 (A02)**
  - Master Course (A2.1, all chapters incl. 19A/B, which also carries the *Puts and Calls* text, A6)
  - annual forecasts 1919–22 (A2.2)
  - coffee letter 1954 (A2.3)
  - *Tunnel Thru the Air* (A03)
  - ***Wall Street Stock Selector* 1930 (A04), including its back matter and the 1929 Annual Forecast**
  - *New Stock Trend Detector* (A05)
  - ***How to Make Profits in Commodities* (A08): text pp. 1–328, including the 1951 New Rules; p. 52 from a second scan; plates and appendix tables surveyed**
  - *45 Years in Wall Street* (A09)
  - *The Magic Word* (A10)
  - *Economic Forecaster* 1954 (A11)
- *Tier B:*
  - B01 Awodele; B02; B03/B03b
  - **B04 Reddy (all 200 pp.)**
  - **B05 Mikula Vol. 2 (all 194 pp.)**
  - B06 Bucholtz (text; image-only pages are charts)
  - **B07 Pesavento & Smoleny (all, incl. appendices)**
  - B08; B09; B10a–c; B11 Meadors
  - B12 (the workbook re-uploaded on 2026-09-27 is the same file: same name and 452,608-byte size)
  - B13; B14
- *Tier C:* C01–C07
- *Tier H:* **H01 Hauck, complete for this edition.** Chs. 1 and 3 are absent from the edition's body.

**What OCR cannot recover:** chart plates and rotated statistical tables (A02/A04 chart pages, A08 pp. 329–366 and the rotated appendix tables, A09 plates). They are data and illustrations, and the text states the rules they illustrate.

**A7 *Face Facts America!* (1940):** read in full from the owner's upload (`sources/A07_face_facts_america_1940.md`). Every Gann source in the owner's folders has now been read.

**Recommended addition:** *The Kybalion* (1908, public domain), the actual text of the seven principles AGENTS.md uses.

---

## Appendix A — Source notes index (`docs/memory-bank/sources/`)

| File | Source | Tier |
|---|---|---|
| `A01_ticker_interview_1909.md` | Ticker & Investment Digest interview, 1909 | A |
| `A02_A04_truth_of_stock_tape_1923_and_stock_selector_1930.md` | *Truth of the Stock Tape*, 1923, and *Wall Street Stock Selector*, 1930 (incl. the 1929 Annual Forecast) | A |
| `A2_1_master_stock_market_course.md` | Master Stock Market Course (lessons 1931–1955), all chapters | A |
| `A2_2_annual_forecasts_1919_1922.md` | Annual forecasts 1919–1922 | A |
| `A2_3_coffee_letter_1954.md` | Coffee letter 1954 (astrology) | A |
| `A07_face_facts_america_1940.md` | *Face Facts America! Looking Ahead to 1950*, 1940 | A |
| `A03_tunnel_thru_the_air_1927.md` | *The Tunnel Thru the Air*, 1927 | A |
| `A05_new_stock_trend_detector.md` | *New Stock Trend Detector*, 1936 | A |
| `A10_magic_word.md` | *The Magic Word*, 1950 | A |
| `A11_economic_forecaster_1954.md` | *Economic Forecaster*, 1954 | A |
| `B01_awodele_harmonic_analysis.md` | Awodele: Gann/Fourier/Schuster/Moore | B (quoting A) |
| `A08_how_to_make_profits_in_commodities.md` | *How to Make Profits in Commodities*, 1942/51 (full text incl. 1951 New Rules) | A |
| `A09_45_years_in_wall_street_1949.md` | *45 Years in Wall Street*, 1949 | A |
| `B03_wdgann_blog_and_d_levels.md` | wdgann.com posts; D-levels table | B |
| `B04_reddy_trading_methodologies.md` | Reddy, Gann trading methodologies | B |
| `B05_mikula_scientific_methods_vol2.md` | Mikula, *Gann's Scientific Methods Unveiled* Vol. 2 (partial; astrology) | B |
| `B06_bucholtz_bull_bear_planets.md` | Bucholtz planetary tables | B |
| `B07_pesavento_smoleny_financial_astrology.md` | Pesavento & Smoleny 2015 (complete; not Gann) | B |
| `B11_meadors_law_of_price_movement.md` | Meadors, Law of Price Movement | B |
| `B12_gann_master_chart_spreadsheet.md` | Hayashi hexagon/Square-of-9 spreadsheet | B |
| `B13_additional_cycle_findings.md` | Kitchin/Juglar/Kuznets/Kondratieff compilation | B/C |
| `B_minor_secondary_sources.md` | B02, B08, B09, B10a–c, B14 | B |
| `C01_tomes_unified_theory_of_cycles.md` | Tomes 1990 | C |
| `C02_tomes_oil_price_cycle.md` | Tomes 2005, oil 5.54 years | C |
| `C03_tomes_solar_154_day.md` | Tomes 2005, solar 154 days | C |
| `C04_tomes_harmonics_theory.md` | Tomes, Harmonics Theory | C |
| `C05_dewey_definitions_and_concepts.md` | Dewey 1965, definitions | C |
| `C06_dewey_case_for_cycles.md` | Dewey 1967, *The Case for Cycles* (18 criteria) | C |
| `C07_halberg_circadian_chronomics.md` | Halberg et al. 2003 | C |
| `H01_hauck_emerald_tablet.md` | Hauck 1999 (complete for this edition) | H |

Related standing documents: `docs/GANN_HISTORICAL_SOURCES.md`, `docs/GANN_METHOD_COMPLETENESS_AUDIT.md`, `docs/GANN_METHODOLOGY_FULL_REPORT.md`, `AGENTS.md`.

## Appendix B — Three-question mandate applied to this report
1. **Gann sourcing:** every rule in Part I carries its source and tier. Part V items name the chapter that would ground them.
2. **Dewey/cycle theory:** Part II. The full 18-criterion list replaces reliance on the 7-item subset when validating.
3. **Hermetic:**
   - **Correspondence** fits the report's own organising move: mapping the same rule across Gann's text, the cycle literature and the code, in both directions per Hauck.
   - **Cause and Effect** governs Part V: each gap is framed as a cause to be measured before it may have effects on the verdict.
   - Not the others: Rhythm and Vibration are *subjects* of the report, not its method. Polarity, Gender and Mentalism don't describe a documentation synthesis.
