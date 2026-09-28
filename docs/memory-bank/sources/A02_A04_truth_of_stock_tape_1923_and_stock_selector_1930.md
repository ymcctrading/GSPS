# A02 + A04 — W. D. Gann, *Truth of the Stock Tape* (1923) and *Wall Street Stock Selector* (1930)

| Field | Value |
|---|---|
| Tier | **A** (Gann's own published books). TOST dated January 1923; the Stock Selector's text is dated March–April 1930, and its back matter reprints Gann's **1929 Annual Stock Forecast** (dated November 23, 1928). |
| Copyright | Treated as in copyright. Synthesis only, no book text stored. The scan stays in the scratchpad. |
| Source file | One combined, image-only Drive scan (488 PDF pages, no text layer). OCR'd page by page on 2026-09-27 with tesseract at 200 dpi. TOST book page ≈ PDF − 21. The Stock Selector begins at PDF 205, and its p. 1 = PDF 213. |
| Read status | **Both books read in full (2026-09-27).** TOST pp. 1–185. Stock Selector Chs. I–IX, the Afterword, the monthly high/low appendix (read as data tables, not transcribed) and the whole back matter: Answers to Inquiries, "What fits a man to write as an authority", **the 1929 Annual Stock Forecast (full)**, "Time Factor and Forecasting Method", "How I forecast", and the service and price pages. Not captured: the chart plates (images; OCR returns noise) and a handful of blank or cover pages (PDF 1–10, 15, 47, 204, 208, 210, 418, 482–487). |

## Why these two books matter to GSPS
- They are **the primary source of the Rule of Three** (`lib/gann/ruleOfThree.ts`). Its catalogue citation was second-hand until now.
- The 1929 forecast pages give **the exact dates of Gann's "permanent cycle which does not change."** `lib/gann/timeCycles.ts` currently approximates them wrongly (correction C-A4-1 below).
- They settle, together with A8 (1951) and A9 (1949), how the swing chart is meant to be built: **on time, not on space** (X3 in the master report).
- They contain **no astrology, no planets and no eclipses** anywhere in the text (full-text search of the OCR, 2026-09-27). The master report's AS5 attributed an eclipse technique to these books "per B05". That attribution is not supported by the books themselves (correction C-A4-2).

---

## A02 — *Truth of the Stock Tape* (1923)

### Book I — the trader (pp. 1–~20)
- Preparation first: study, capital and patience. The **weak points** are hope, fear, over-trading and trading without stops.
- **Close out every trade twice a year and rest.** A trader's judgment degrades with continuous exposure. (Compare `lib/risk/cooldown.ts`; this is a scheduled pause, not a loss-triggered one.)
- Cause and effect is stated as a premise: "every effect is the result of a cause" (p. 18). "There is a time for everything" (p. 19).

### Book II — rules (the money-management core)
- **Capital scaled to the price level of the stock.**
- **Stop about 3 points, never more than 5.** Move the stop to **break-even after 3–4 points of profit**.
- **Never average a loss.** When in doubt, get out.
- Trade **active** stocks, and **spread risk equally over 4–5 stocks**.
- **Never fix a target price.** Exit on the stop or a trend-change signal.
- Build a surplus and don't risk it all.
- In active high-priced stocks, **don't accept a loss larger than about two days' normal fluctuation**.
- **Pyramid every 10 points with decreasing lots**: an illustrative 100 / 50 / 30 / 20 / 10.
- No scale buying and no hedging.

### Chart hierarchy and time
- **Long swings average about 2 years** (~600 market days).
- Keep the **monthly chart as far back as possible**, the **weekly for 6–12 months** and the **daily for 30–60 days**.
- "Keep a chart showing moves of from three days to one week and the amount of volume" (p. 82). This is the time-based swing chart in 1923. It is an early form of what A9 calls the 3-Day Chart.
- **"The most important thing … is the Time factor"** (p. 116). He explicitly declines to disclose the time method in this book.

### Structure, volume and zones
- **Volume relative to capital stock and float.** Heavy volume with no price gain means supply exceeds demand.
- **Seven Zones of Activity** (Ch. XI): one normal zone, three above it (increasing extremes) and three below. This is a regime/lifecycle framing of where a stock sits relative to its normal range.
- **Tops:** leaders make **flat tops** (distribution over time); late movers make **sharp tops**, with distribution happening *on the way down*. **Bottoms** mirror this: accumulation happens above sharp bottoms.
- Bull and bear markets run in **3–4 sections**, "according to their Time factor and individual vibrations". *Vibration* is used here as a term without a definition.
- A stock usually gets **support the first time it reacts back to an old top**.
- **A new high that falls back below the old top is a failure signal.**
- **Crossing into new high ground the second time is safer than the first.**
- **Stops 3 points beyond old tops or bottoms.**
- **Relative strength:** stocks making higher bottoms in depression years lead the next bull market. Stocks crossing their 1921 highs led in 1922.
- **Reactions:** 5–7 points normally (2–3 for low-priced stocks). In active markets stocks rarely react more than 2 days, so buy the second day's reaction with a 3-point stop.

### Point (space) charts
- Box size is **scaled to price**: 3 points for $25–60 stocks, 5–10 for $100–300 and 5–10 for active leaders.
- A range crossed **10–20 times by 5-point moves** marks accumulation or distribution.
- An inside-day range traversed 5–6 times means heavy volume.

### Commodities (Book II's closing chapters)
- **Cotton:** stop 20 points (40 in wild markets); pyramid after 60 points. Use a 10-point chart in narrow markets and 30–40 points in active ones.
- **After 2–3 consecutive losing trades, quit for a while.** This is the series-of-losses rule (compare gap G16).
- **Wheat and corn:** stop 2–3¢, maximum 5¢.

---

## A04 — *Wall Street Stock Selector* (1930)

### Ch. I — "New Era" and changed cycles
- The 1920s "the business cycle is dead" claim is rejected by history. **Cycles repeat** because human nature doesn't change.
- Panics 1814–1929 are reviewed, and the underlying cause is **the money market** (money rates).
- The 1861–69 bull market (8 years 4 months) is the **analog** of 1921–29 (8 years).
- Bull campaigns run in **4 sections**.
- **Even figures (100, 200, 300)** attract selling orders.

### Ch. II — the 24 rules (reprised in A9 as "Never-Failing Rules")
- **Risk no more than 1/10 of capital** on a trade. Stops 3–5 points. **Break-even stop after 3 points of profit** (4–5 in high-priced stocks).
- The rest mirror TOST's Book II (above).
- **Rule 21:** buy stocks with a **small float** for the long side; sell short those with a **large float**.
- **Rule 24:** **don't increase your trading after a long run of success.** That is when a trader overtrades.
- **Reward/risk:** don't trade for a 3–5-point target unless the stop can be 1–2 points.
- **Pyramid on reactions measured in points *and* in time** (e.g. GM's reactions of about 3 weeks). The stop may widen to the greatest prior reaction.

### Ch. III — the trader's own cycle
- "When a man's trend changes": after a long winning run (the example is 200 trades) followed by losses, **quit after 2–3 losses and restart small**. A trader has "good and bad cycles" and a "seasonal trend" of his own (PDF 246–247). Keep a record of your trades to find yours.

### Ch. IV — **time charts over space charts** (the X3 evidence)
- **Space charts (2-, 3- or 5-point moves) fool traders the most because they ignore time.** Daily charts come next. **Weekly, monthly and yearly charts are the most reliable.** He gives time multipliers of 7×, 30× and 365× for their relative weight.
- **20 days, 20 weeks, 20 months, 20 years** of range give increasing power to the breakout from them (the U.S. Cast Iron Pipe example).
- The 1st to 4th moves of a campaign: **the 3rd or 4th is the culmination**.
- **Daily rule:** a **2–3-day halt** at a top or bottom, then stop 3 points beyond it.
- **Weekly rule:** buy **2–3-week reactions**; active stocks rarely react more than 3–4 weeks. Watch the **3rd week**. Fast moves culminate in the **6th–7th week**.
- **Monthly rule:** strong stocks **seldom react into a 2nd month**. Keep the stop under the prior month's low, and watch the 3rd–4th month next.
  - Worked in Ch. VII: "never sell short a stock that will not react more than one month from a top" (GM 1924–29, where no reaction ran more than a month, or went 3 points under the prior month's low).
  - Jewel Tea 1925–28 and Montgomery Ward 1927–28 rose 164 and 380 points without breaking the prior month's low. The worked management is to **buy every 10 points and trail the stop 5 points under the prior month's low**.
- **Weekdays:** Monday's first hour; Wednesday afternoon / Thursday morning; Friday.
- **Dates in the month:** the 1st–3rd, the 10th, the 15th and the 20th–23rd.
- **Watch the 3rd, 6th, 9th and 12th months from a pivot, and the anniversary of the pivot** (not the calendar year).
- **Month-of-year habits** per stock: U.S. Steel tends to turn in Jan/Feb, May/Jun and Oct/Nov. GM has its own.

### Ch. V — trend rules
- Normal vs abnormal average moves; higher bottoms and lower tops.
- A **narrow range on small volume** near a top or bottom precedes the move. (Ch. VII: Montgomery Ward had a 1-point range for all of May 1924, and "great activity nearly always follows" a range that narrow.)
- **Popular trading prices and even figures:** buy or sell just *before* them.
- Stocks move faster at high levels.
- An old top of 100 crossed means a stop at 97.
- **The first reaction sets the gauge:** 5–7 points (10–12 for high-priced stocks). A 10-point reaction is a danger signal.
- **"How to balance a stock"**: keep a closing ledger. Closes near the same level for 3+ days mark balance.
- **THE RULE OF THREE (p. 72).** A stock in a strong uptrend will not close lower three days in a row. **The third consecutive lower close reverses the trend, at least temporarily.** The mirror applies in a downtrend.
  - He applies it to the **weekly and monthly** charts as well as the daily.
  - Worked example (Ch. VI, p. 125): U.S. Steel's 1929 final grand rush "at no time closed 3 consecutive days with losses" until the top.
  - **This is the primary source of `lib/gann/ruleOfThree.ts`.**
- **Volume:** U.S. Steel 1929 worked through. Equal share volume on a decline and the preceding advance marks a bottom.
- A stock crossing highs from years before is often "so strong it can't react".
- **Watch for a top after 85–100 points in a short time.**
- **The final grand rush lasts 6–7 weeks** (up to 10). Same as A8.
- Sideways movements: wait for **3 points beyond** the old top or bottom.
- Time limit to hold a trade that isn't working: about **3 weeks** (2–3 months for investment issues).
- **"Volcanic eruptions"** (investors' panics) come about **20 years** apart.
- The lead sequence is **money rates → bonds → stocks**. Ch. VI: bond prices in 1928 foreshadowed the 1929 decline and the depression.

### Ch. VI — how investors should trade
- After the final grand rush, **trail the stop by the size of the last reaction**. For U.S. Steel 1929: a stop 10 points from every top would have held all the way to 261¾.
- After a final grand rush, it is **a long time before that level is seen again** (American Smelting's 1906 top wasn't crossed until 1926–29).
- **Old stocks working against the general trend** mean something is wrong: get out (American Woolen).
- Study what stocks do at **10, 20–30 and 40–50 years of age**. U.S. Steel's 1929 final rush came in "its 29th year".
- **Safety of investments:** a bond yielding more than ~6% has crossed the danger line.

### Ch. VII — early and late leaders (Ch. VII is almost entirely worked case studies by group)
- Campaigns rotate leadership by section. **Stocks that bottom first top first.** Late movers bottom late and top late, with sharp tops and fast collapses.
- **The first-year-high rule:** a stock must cross the high of **the first year of the bull campaign** (with Jewel Tea, **3 points above the first- or second-year high**) before it can lead a later section. This is used repeatedly as the selection filter.
- **Stops 3 points under the first extreme low** held for years on stocks like Davison Chemical ("somebody knew it was worth $20").
- **After a split, the old stock's pivot levels still act as support and resistance** in the new stock.
- **Buy on the first or second reaction after new all-time highs.** Crossing tops that stood for many years signals a large move (Baldwin 156, Westinghouse 116, American Smelting 174).
- **"The more time consumed in accumulation, the bigger the advance."** Jewel Tea had 6 years of accumulation and then gained 164 points in 3 years; International Nickel held 11–12 for five years. **The same rule applies to distribution.** This is a time-for-price proportion, stated as a rule.
- **Measure the greatest reaction, in points *and in days*.** Vanadium 1929–30: the first reaction was 17 points and later ones 7–8 points, each taking 7–10 days. A reaction exceeding the greatest prior one (here 17 points) points to the next level (22–25 points). A 10½-point one-day break on record volume, when reactions had been 7–8, was the warning.
- Watch **the daily chart for the first sign of a trend change** and **the weekly chart to confirm it**.
- **Never buy one stock in a group to follow another.** Judge each stock on its own chart (Punta Alegre vs South Porto Rico; White vs GM).
- "Every dog has his day": **the last campaign's leader rarely leads the next one.**
- **Stocks are never too high to buy or too low to sell short** if the trend says so.
- **Volume at extremes:** two-thirds of a small float changing hands in one week means distribution (Vanadium, Feb 1929). **Shrinking volume on a lower or equal low means liquidation has run its course** (U.S. Steel and GM, Nov–Dec 1929; Montgomery Ward, Jan–Mar 1930).

### Chs. VIII–IX — stocks of the future; future facts
- Chemicals, aviation, radio, electrical equipment, talking pictures and natural gas are named as future leaders. The 1923 book had called chemicals and aviation, and he claims that was fulfilled.
- **Overbought groups** (autos, utilities) will lead the next bear market.
- **Production vs consumption:** booms end in overproduction.
- Investment trusts, mergers and the "investors' panic" (about every 20 years: 1837–39, 1857, 1873, 1893, 1896, 1914, 1920–21). **1929 was "a gamblers' panic", not an investors' panic.**

### Back matter — the 1929 Annual Stock Forecast and the time-factor pages (PDF 445–481)
The Stock Selector reprints the forecast issued in November 1928 for 1929. This is **a primary artifact of Gann's time method in use**, not a description of it.

- **Stated basis:** "my **Master Time Factor** and mathematical interpretation of the **return of cycles**", not judgment. He also mentions the **"Great Cycle"**.
- **Method as described (PDF 473–477):**
  - Each stock moves by its own time limit, "because the **vibration and wave length** varies on the different stocks".
  - He claims he can determine the **wave length** of a stock, meaning how far it will run when it enters new territory or breaks out of distribution.
  - "I do not depend on space charts… I use **volume combined with the proper time charts**."
  - "The price makes little difference so long as you know about when bottom or top prices will be reached."
  - **Individual stocks, not averages;** each group is studied separately.
  - The method itself is **withheld** and offered only as a private course.
- **Form of the forecast.**
  - A projected curve for the Dow 30 (Curve No. 1) and for "stocks in strong position" (Curve No. 2).
  - Month-by-month minor moves, with change dates marked **XX (major)** and **X (minor)**.
  - A minimum and maximum yearly range: 50–100 points on the Industrials, 20–35 on the Rails.
  - Advice to trade the dates, not the prices: buy around a forecast low with a stop 3–5 points away (10 on $200–300 stocks), and **reverse if the stock hesitates for a few days and fails to make a new extreme around a forecast date**.
  - "The graph is only a guide to when big swings and activity are indicated", not to their size.
- **THE PERMANENT CYCLE (PDF 458).** Dates "based upon a permanent cycle which does not change". Important tops and bottoms are made in many stocks every year around them:
  - **Feb 8–10, Mar 21–23, May 3–7, Jun 20–24, Aug 3–8, Sep 21–24, Nov 8–11, Dec 20–24.**
  - *Observation (ours, not Gann's words):* four of these windows sit on the **equinoxes and solstices** (Mar 21, Jun 21, Sep 22, Dec 21). The other four sit on the **cross-quarter points** midway between them (early Feb, May, Aug, Nov). That is the **Sun's annual cycle divided into eighths.** It is a seasonal/solar calendar fact, not a planetary-aspect claim, and Gann does not say it in these words here.
  - It matches A9's (1949) seasonal change windows, which keep the same eight anchors and add others.
- **Outcome as Gann reports it:** the forecast called for a March decline and bottom, an advance into August, **September 3 as the last day of top**, and a "Black Friday" decline in September. The Dow 30's all-time high was in fact on September 3, 1929.
  - *Caution:* this is a self-reported hit in a sales section. Its dates can be checked against the record, but it is **one year, chosen by the author, with no out-of-sample record** (Dewey's persistence-after-discovery test fails by construction).
- **Narrative content.** Weather (storms, a tidal wave on the Gulf, electric storms, fires), earthquakes, war and foreign-trouble calls sit alongside the market dates.
  - This mundane-event style resembles astrological forecasting, but **the text never names astrology, a planet or an aspect.** Treat any astrological reading of it as inference, not disclosure.
  - It is still a relevant data point for the astrology question (see "Astrology" below).

---

## Corrections and findings for the project owner (added to master report Part V)

**C-A4-1 — `lib/gann/timeCycles.ts`'s fixed calendar cycle uses the wrong dates.**
- **What the code does:** `FIXED_CALENDAR_MONTHS = [2, 3, 5, 6, 8, 9, 11, 12]` with `FIXED_CALENDAR_DAY = 5`. The header reads the source as "early February/March/…", i.e. "the first ten days of each named month, since Gann's text names the month without a specific day."
- **What the primary text gives:** specific day ranges (above).
  - The code's month *list* is right.
  - The day is right for **Feb, May, Aug and Nov** (within a few days).
  - It is **16–19 days early for Mar, Jun, Sep and Dec**, whose windows are the 20th–24th.
- The error cannot be caught from the month list alone. It is a porting defect of the `harmonicProximity` kind: right rule, wrong anchor.
- **Fixed 2026-09-27 with the owner's go-ahead** (`FIXED_CALENDAR_WINDOWS`). The fix as proposed: replace the single day with the eight disclosed windows, e.g. `[[2,8,10],[3,21,23],[5,3,7],[6,20,24],[8,3,8],[9,21,24],[11,8,11],[12,20,24]]`. Cite A4 (1930, PDF 458) and A9 (1949) for the same anchors.
- **Blast radius:** low. `fixedCalendarActive` is display-only and not scored, per its own header. Still, it is a user-visible Gann claim, and it is currently wrong for half the year.

**C-A4-2 — the master report's AS5 ("eclipse longitude crossed by a planet — *Truth of the Stock Tape*, *Stock Selector*, per B05") is not supported by either book.**
- A full-text search of both OCR'd books finds no eclipse, planet, zodiac or astrology reference.
- If Mikula (B05) attributes the technique to Gann, it comes from elsewhere: the courses, the letters, or Mikula's own reconstruction.
- Re-cite AS5 to its actual source or mark it as B05's attribution only.

**Confirmed, not new:**
- The Rule of Three is primary-sourced (p. 72).
- The 3-point penetration rule is used throughout both books (TOST and SS, many worked cases). It confirms the "3-point rule" buffer in `lib/lifecycle/entryConfirmation.ts` in its disclosed form. Note that the magnitude is in *points* on 1920s share prices, the same literal-magnitude caveat as `combineNearbyLevels`.
- Crossing old tops and bottoms is the entry signal throughout. This confirms `lib/gann/entryTrigger.ts`'s grounding (A8's Buying Points restate it).

## GSPS cross-reference

| Book rule | GSPS today | Status |
|---|---|---|
| Rule of Three: 3 consecutive lower closes reverse an uptrend (daily, weekly, monthly) | `lib/gann/ruleOfThree.ts` | **Primary source confirmed** (SS p. 72). Check whether GSPS applies it on the weekly/monthly as Gann does. |
| Permanent cycle: 8 fixed windows (solstices, equinoxes, cross-quarters) | `lib/gann/timeCycles.ts` fixed calendar (day 5 of each month) | **Fixed 2026-09-27** (C-A4-1) |
| Time charts over space charts; daily/weekly/monthly time rules | Swing charts (`lib/gann/swingChart.ts`) count consecutive closes | Supports X3: Gann builds swings on *time* (days/weeks), and a pure consecutive-close counter is a translation choice |
| Cross an old top or bottom + 3 points = entry; stop 3 points beyond | `lib/gann/entryTrigger.ts`, entry-confirmation buffer | Aligned (the magnitude is price-scaled in GSPS) |
| Break-even stop after 3–4 points of profit | Not implemented as a rule | **New gap G23** |
| Strong stocks don't react into a 2nd month; trail the stop under the prior month's low; pyramid every 10 points | Not implemented | **New gap G24**: monthly-reaction rule and trailing stop |
| Greatest reaction, in points *and* days, as the gauge; exceeding it signals a trend change | Partly: A8's "over-balance" (G22) | Folds into **G22** (same rule, stocks) |
| First-year-high filter for leadership | Not implemented | **New gap G25**: a campaign-relative leadership filter for the scanner |
| Accumulation time ∝ size of the advance | Not implemented | Part of G22 / time-price balance |
| Risk ≤ 1/10 of capital; 4–5 positions with equal risk; don't increase size after a winning run | `lib/risk/*` (position limits, % of account) | Aligned in structure (see AGENTS.md orphan audit item 1). "Don't size up after a winning streak" isn't enforced: note for `lib/risk` |
| Close all trades twice a year and rest; quit after 2–3 losses | `lib/risk/cooldown.ts` (loss-triggered) | G16 (series of losses). The scheduled semi-annual rest is new; it is informational for education copy |
| Seven Zones of Activity | None | Education/regime-display candidate; low priority |
| Volume: shrinking volume at a retest = liquidation over; ⅔ of float in a week = distribution | `volumeClimax` criterion | Partly aligned; the float-relative rule needs float data GSPS lacks |
| Small float for longs, large float for shorts (Rule 21) | None | Needs float data; note only |
| Old pivot levels carry through a split | Split-adjusted bars erase this | Note: GSPS's adjusted data hides a level Gann watched. Informational |

## Astrology
- **Neither book discloses astrology.** What they disclose is a **time factor**, a **Master Time Factor / Great Cycle**, a **permanent cycle** of fixed annual dates, and the words **"vibration" and "wave length"**, all undefined here and deliberately withheld as a paid course.
- The permanent-cycle dates are the Sun's annual eighths. That is the one concrete, checkable link to a celestial cycle in these books, and it is **solar/seasonal, not planetary**.
- It supports treating the annual solar calendar as Gann-disclosed (already in the code, with wrong dates; C-A4-1). It **does not by itself** authorize planetary-aspect work. For that, the citable source remains A2.3 (the 1954 coffee letter) and the course material, per AGENTS.md's astrology decision.

## Three-question notes
1. **Gann:** Tier A primary, for the Rule of Three, the permanent cycle, the time-chart rules and the money-management rules.
2. **Dewey:** the permanent cycle is a **periodicity claim** (annual, 8 phases).
   - *Regularity of timing* and *constancy of period* hold by construction, since it is the solar year.
   - *Dominance*, *repetition count*, *wave-shape identity* and *cross-series clustering* are **not tested anywhere in these books**. The evidence is anecdotal ("many stocks every year").
   - *Persistence after discovery* has never been measured.
   - So it belongs where GSPS has it (display, not scored) until measured. The forecast's single-year hit clears nothing on Dewey's list.
3. **Hermetic:** **Rhythm** (the permanent cycle as the solar year's return; the rule that accumulation time sets the size of the advance). **Cause and Effect** (stated outright on TOST p. 18; the money-rate → bonds → stocks sequence). **Correspondence** (the Rule of Three and the reaction rules applied identically on daily, weekly and monthly charts, i.e. the same law at each scale). **Polarity** (every rule is stated with its short-side mirror, and the investors'-panic vs gamblers'-panic distinction).
