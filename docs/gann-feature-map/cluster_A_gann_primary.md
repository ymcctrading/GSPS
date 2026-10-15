# Cluster A: Gann primary-source rules (W006, W022, W036, W046, W001, W030, W010)

Extracted 2026-10-15 from `/mnt/project-files/literature-reading-output/works/<W###>/{summary,detailed-notes,visuals*}.md`, `collection-synthesis.md` and `unresolved-items.md`. No original PDF was read; every rule rests on the reading notes. Rules are paraphrased.

**Page conventions (from the notes):**
- **W006** (*New Stock Trend Detector*, 1936): the transcription carries no printed page numbers, so pages are **PDF pages**.
- **W022** (*Tunnel Thru the Air*, 1927): **printed page = PDF − 5**. Citations give the printed page and then the PDF page, as "p.198 (PDF 203)".
- **W030** (*The Magic Word*, 1950): cited "PDF/printed", e.g. p.111/96.
- **W036**, **W046**, **W001** and **W010**: PDF pages. W001's notes map spreads to printed pages and use the printed numbers. The W001 page numbers below are printed pages.

**Tiers:** A means Gann's own text. B means press or publisher reports about Gann (per `collection-synthesis.md`). W001 is a booklet Gann issued, so it is A. Its 1909 *Ticker* extract (Wyckoff) is reported speech, so those rows are B. W010 is B.

**Implementable values:**
- **yes**: the rule is specific enough to code.
- **yes-example**: the number comes only from a worked trade, not a stated rule.
- **named-only-not-disclosed**: the technique is named but not explained.
- **philosophy-no-method**: a belief or principle with no mechanism.
- **research-only**: the rule can be coded, but it was chosen after the fact or is numerology/astrology. Under AGENTS.md it can only ever be confluence or context.

---

## 1. Rules table

| proposed_id | rule | source | tier | implementable | notes |
|---|---|---|---|---|---|
| **TREND** | | | | | |
| A-TREND-01 | Read the main trend from a monthly high-low chart. The weekly chart is next best. Use the daily chart only when the stock is fast and active. | W006 p.19 | A | yes | Ch. VII (p.46) instead names the weekly chart "the best chart for trading purposes", and the daily for very active, high-priced stocks. So monthly sets the trend and weekly times the trade. |
| A-TREND-02 | Higher bottoms with higher tops mean strength (an uptrend). Lower tops with lower bottoms mean weakness (a downtrend). | W006 pp.19-20 | A | yes | Same structure as `lib/gann/trendStrength.ts`, but here it is read off monthly/weekly high-low bars, not a 3-day or 7-day swing chart. |
| A-TREND-03 | Breaking the point from which the last run-up started turns the main trend down. The mirror case for an upturn is implied. | W006 pp.19-20 | A | yes | Gann states only the bearish form; the bullish mirror is inferred by Polarity. |
| A-TREND-04 | Trade each stock's own trend, not the averages. The Dow Theory has been obsolete since 1916 because rails stopped confirming industrials. | W006 pp.16-18 | A | yes | Per-symbol trend. A strong argument against any index-confirmation gate. |
| A-TREND-05 | A secondary rally (or reaction) that is shorter and smaller than the one before it shows the main trend is unchanged. Example: 41 points in 69 days after 99 points in 155 days means still down. | W006 pp.13-14 | A | yes | Compare successive counter-swings on both amplitude and duration. |
| A-TREND-06 | A reaction that holds above the previous campaign's top means the trend is still up. Example: the Oct 1933 low of 82½ held above the Sep 1932 top of 81. | W006 p.14 | A | yes | Overlaps LEVELS-01 (old tops become bottoms). |
| A-TREND-07 | A stock that tops in the first or second year of a bull market and then fails for two years to exceed that top is weak. | W006 pp.25, 27 | A | yes | Example: Corn Products 1933 top, 12 points short in Jul 1935. |
| A-TREND-08 | In a bull market, a stock that rallies only 2-3 months at the start and never exceeds that first rally is weak. | W006 p.35 | A | yes | American Home Products example. |
| A-TREND-09 | A stock is never too high to buy while its trend is up (with a stop), and never too low to short while its trend is down. "A buy at 400 while rising, a short at 40 while falling." | W006 pp.22, 38-39 | A | yes | Rules out "cheapness" or extension filters as a reason to skip a trend trade. |
| A-TREND-10 | After a late-bear break to new lows, a rally back to 3 points above the old bottom means the decline is over. Example: AT&T is a buy at 91. | W006 p.30 | A | yes | This is Gann's failed-break test, the same rule as GSPS's `stopBreach.ts` reclaim. Late breaks into new lows also run less far. |
| A-TREND-11 | In the monthly chart, the first break of a prior month's low after a long advance is a warning of a trend turn. Examples: Oct 1929 was the first since May 1929; May 1930 broke April's low. | W006 p.41 | A | yes | Monthly-bar rule taken from the volume chapter's narrative, not numbered as a rule. |
| A-TREND-12 | A monthly bar that crosses the previous month's high after a long decline (late Jul 1932 over June's high) shows the trend turning up. | W006 pp.42-43 | A | yes | Mirror of TREND-11. Narrative, not a numbered rule. |
| A-TREND-13 | Follow a stock's trend regardless of what you think about it. | W006 p.32 | A | philosophy-no-method | Supports confirmation over opinion. |
| A-TREND-14 | Once a cycle has turned and prices are due to fall, nothing (not even government buying) stops them until the cycle has run its course. The same holds for advances. | W006 p.50 | A | philosophy-no-method | |
| **SWING / TIME** | | | | | |
| A-TIME-01 | In a bull market a rising stock reacts no more than 2-3 months and resumes in the third. A falling stock keeps falling in the third month. | W006 p.38 | A | yes | Monthly counter-swing duration cap. |
| A-TIME-02 | In a bear market, a rally lasting only 6-7 weeks, or no more than two months, is a sign of weakness. A bear rally that cannot go into its third month is weak. | W006 p.38 | A | yes | Example: from Feb 1931, rails never rallied more than one month. |
| A-TIME-03 | A first rally out of a bear market that cannot go higher in its third month, on large volume, is only a first rally, not the bull campaign. A real bull market rises three full months or more after a run of rallies no longer than two months. | W006 pp.14, 43 | A | yes | |
| A-TIME-04 | Watch for a change in trend one, two and three years from any important top or bottom. | W006 pp.14, 44 | A | yes | Anniversary windows from pivots. Gann calls it "my rule". Under AGENTS.md calendar windows are context only (the F4 test found no edge). |
| A-TIME-05 | Count months from each major top and bottom to find periods to watch. Example for 1936: 42 months from the 1932 low, 37 from Feb 1933, 36 from the 1933 top, 48 from 1932. | W006 p.15 | A | yes | The method of counting is clear; which counts matter is not stated. |
| A-TIME-06 | Bear markets have lasted 12 to 43 months, with culminations near months 27, 30, 34 and 36-43. From a top, watch for a bottom at months 30-36, then at 40-43. | W006 p.13 | A | yes | A historical distribution, not a mechanism. Bear durations: 53, 30, 36 and 43 months. Note the 53-month 1869-73 bear contradicts "never more than 43" on the same page. |
| A-TIME-07 | Bull campaign lengths repeat: 1921-29 lasted 97 months against 99 months for 1861-69. History repeats as time. | W006 pp.9-12 | A | research-only | Two cases, after the fact. |
| A-TIME-08 | Late tops make late bottoms and early tops make early bottoms. Each stock keeps its own time period ("the time was not yet up for this late mover"). | W006 pp.31, 35-37 | A | yes | Per-symbol time count from that symbol's own pivots, not the index's. Examples: Chrysler topped early (Oct 1928); Coca-Cola topped late (Jun 1930) and bottomed late (Dec 1932). |
| A-TIME-09 | Accumulation takes time at bottoms and distribution takes time at tops. Wait for a definite buying signal and do not anticipate the exact top or bottom eighth. | W006 p.39; W036 p.12 | A | yes | Supports entry confirmation over anticipation. |
| A-TIME-10 | The "Master Time Factor" tells months and years ahead when cycles repeat and cause extremes. | W006 p.50; W001 p.5 | A | named-only-not-disclosed | Not explained anywhere read. |
| A-TIME-11 | An investors' panic or severe depression comes about every 20 years. | W006 pp.49-50 (quoting *Wall Street Stock Selector* pp.203-204) | A | research-only | Gann's list (1837-39, 1857, 1873, 1893, 1896, 1914, 1920-21) does not space at 20. |
| A-TIME-12 | Hold time: a loss at the first close suggests you are wrong. After three successive closes against you, you are wrong "nine times out of ten", so get out. A profit at the first close that is still there after three days means you are with the main trend. | W006 p.23 | A | yes | Time stop (see EXIT-01). Summary paraphrases it as "a loss for three successive days". |
| A-TIME-13 | The swings rest on a time factor calculated from three curves: the commodity curve, the money curve and the curve of stocks. Sometimes one curve alone causes a change of trend. | W036 p.13 | A | named-only-not-disclosed | The 1922 method statement. |
| A-TIME-14 | Forecasts come from "measurement of time cycles" (1919) and "a Cycle Theory which I discovered" (1920). The 1920 cycle gave two bull and two bear campaigns in the year. | W036 pp.2, 4 | A | named-only-not-disclosed | |
| A-TIME-15 | Trade the dates, not the price. When the market turns close to a forecast date, buy or sell regardless of the price; do not depend much on the number of cents. | W036 p.22 | A | yes | **Conflicts with GSPS**: calendar windows never gate (AGENTS.md, F4). Record as Gann's rule, context only. |
| A-TIME-16 | Polarity rule for change-date lists: if a low comes on a "high" date, expect a high at the next date. A listed date marks some rally or decline, not always the extreme. | W036 pp.7, 22 | A | yes | The dates alternate high and low about every 6-8 days. With this rule, almost any turn scores as a hit (base-rate problem). Research only. |
| A-TIME-17 | Rank change dates: dates marked X are the most important to watch. | W036 p.13 | A | yes | The basis for the X marks is not disclosed. |
| A-TIME-18 | The major grain dates are Mar 20-24, Jun 21-23 and Sep 20-24, with minor dates between. | W036 p.22 | A | yes | The reading notes identify these as the equinoxes and June solstice; Gann does not name them. They match the seasonal dates in W034/W003. |
| A-TIME-19 | Keep separate change-date calendars for rails and industrials, because the time factor can move one group up while the other falls. | W036 p.7 | A | yes | Supports per-group or per-symbol timing (compare A-TIME-08). |
| A-TIME-20 | Each year falls in a cycle of advancing or declining prices; a year can hold two bull and two bear campaigns. | W036 pp.2, 4 | A | named-only-not-disclosed | Requires the undisclosed cycle theory. |
| A-TIME-21 | Count the months from each prior pivot to the current turn. Example: the 19 Mar 1954 coffee high came 9 months from the 19 Jun 1953 low, 2 from the 19 Jan low, 6 from the 15 Sep low and 5 from the 19 Oct high. | W046 p.2 | A | yes | Repo note A2.3 already lists this as transferable. |
| A-TIME-22 | Each market can have recurring important dates each month. For coffee: the 1st, 15th, 18th and 19th. | W046 p.2 | A | yes | Contract-specific. How the days were chosen is not stated. |
| A-TIME-23 | Time is the most important factor ("the essential element"). Time cycles reach back 100 years or more and can be projected 100 years ahead. | W001 pp.11, 13 | A | philosophy-no-method | |
| A-TIME-24 | Master Time Cycle and Great Time Cycles recur at certain intervals. The greatest opportunities come at the end of great time cycles. | W001 pp.7, 11, 13-14 | A | named-only-not-disclosed | |
| A-TIME-25 | Transition periods in time and price, with rules for how long price and time stay in a transition period. | W001 p.11 | A | named-only-not-disclosed | |
| A-TIME-26 | Master Calculator: shows major and minor time periods; divisions of time and price; where Master Time Cycles end and new ones begin; and "5 divisions of time from one center". | W001 pp.14-15 | A | named-only-not-disclosed | A plastic overlay; never shown. |
| A-TIME-27 | Cycles nest: every natural law has a major and a minor, and positive, negative and neutral. So there are lesser, greater and intermediate cycles, "wheel within a wheel". | W022 p.78 (PDF 83) | A | philosophy-no-method | Supports multi-timeframe design (Correspondence). |
| A-TIME-28 | Cycle hierarchy: 4 minutes (the earth turns 1° every 4 minutes), 24 hours and one year are the minor cycles. 100, 1,000 and 5,000 years are major. Go back at least 1,000 years to prove a major cycle. | W022 pp.78-81 (PDF 83-86) | A | philosophy-no-method | 4 min = 1° is a real equivalence for intraday time-degree scaling, but no market rule is given. |
| A-TIME-29 | Forecasting method: get the past history and a correct starting point, find which cycle you are in, then project the future curve as a repetition of past movements. | W022 pp.75-77 (PDF 80-82) | A | named-only-not-disclosed | "Cycle theory, or harmonic analysis" (p.77). Harriman "conformed closely to the law of harmonic analysis" (p.205). |
| A-TIME-30 | A "time" is 360 days, 360 years or 360 degrees, and half a time is 180. | W022 p.371 (PDF 376) | A | yes | **Contradicted on p.372, where a "time" is a score (20 years).** The book never reconciles the two. |
| A-TIME-31 | A day counts for a year. | W022 pp.371, 373 (PDF 376, 378) | A | research-only | Biblical (Ezekiel 4:5-6). |
| A-TIME-32 | Count 7, 14, 42 months, 49, 343 and 490, the score (20), 70 and 140 from founding or event dates to find troubled years. Examples: 1492+440=1932; 1585+343=1928; 1614+294+24½=1932; 1776+140=1916; 1783+147=1930; 1914+14=1928. | W022 pp.371-374 (PDF 376-379) | A | research-only | The arithmetic is correct. The base date and multiplier change case by case and are chosen after the fact, so it fails Dewey's pre-registration test. |
| A-TIME-33 | Daniel's 1,290 and 1,335 days, and 70 weeks: 1,290 days from the 1928 outbreak, 1,335 is 45 days more; March 1931 to end-June 1932 is troublesome. | W022 pp.213, 370-372 (PDF 218, 375-377) | A | research-only | Biblical day counts. |
| A-TIME-34 | Anniversary of a company's founding is a time factor: Major Motors was forecast to top on 16 Sep 1927, when the company turned 19. | W022 p.197 (PDF 202) | A | named-only-not-disclosed | Why age 19 mattered is not given. The inception dates GSPS stored under D3 (migration 0083) could test this. |
| A-TIME-35 | Stocks make fast moves up or down at certain ages ("his great discovery of what stocks would do at a certain age"). | W022 p.199 (PDF 204) | A | named-only-not-disclosed | Which ages is not given. |
| A-TIME-36 | Turns come on scheduled government crop-report dates (Aug 8, Sep 8, Oct 8 cotton reports). | W022 pp.195-197, 217 (PDF 200-202, 222) | A | yes-example | Fiction. Today's analogue would be a scheduled-event calendar. |
| A-TIME-37 | Fixed swing duration from a low: "about thirty days" up from 25 Jun to 25 Jul. A wheat up-cycle of ten days. | W022 pp.145, 195 (PDF 150, 200) | A | yes-example | No calculation shown. |
| A-TIME-38 | "There is a time and a season for everything." Know when to stop and wait for the next season. | W022 p.204 (PDF 209); W030 pp.106-107/91-92 | A | philosophy-no-method | |
| A-TIME-39 | Recurrence is law: "what has been will be". It is Gann's scriptural premise for time cycles (Eccl. 1:9, 3:1). | W030 pp.106-107/91-92; W022 p.76; W001 p.13 | A | philosophy-no-method | W001 p.13: cycles repeat because human nature does not change. |
| A-TIME-40 | The relative position of price to time tells the time cycles. | W001 p.7 | A | named-only-not-disclosed | |
| A-TIME-41 | The big money is made on the long swings, not in day-to-day trading. Major moves recur as regularly as the seasons. | W036 p.24 | A | philosophy-no-method | Relevant to the intraday-vs-swing question: Gann sides with swings. |
| A-TIME-42 | Wars come every twenty or thirty years. | W030 p.70/55 | A | philosophy-no-method | Not measured. |
| **ENTRY (buying points; Rule 3 and Ch. V)** | | | | | |
| A-ENTRY-01 | Single bottom: after a reaction, wait until the stock holds a level for 2-3 weeks, then buy with a stop 3 points under the lowest week. In active markets use 2-3 days and the lowest day. | W006 pp.20, 46-47 | A | yes | Rule 3 (p.46) says "holding 1-3+ weeks"; Ch. V (p.20) says 2-3 weeks. Small inconsistency. |
| A-ENTRY-02 | Double and triple bottoms: the same level reached weeks, months or a year or more apart. Buy with a stop 1-3 points (never more than 3) below. | W006 pp.20, 46 | A | yes | No tolerance band for "same level" is given. |
| A-ENTRY-03 | When a level holds a third time (triple bottom), an advance should follow as long as the third bottom is not broken. | W006 p.11 | A | yes | Mirror at tops: see LEVELS-04. |
| A-ENTRY-04 | Crossing an old top by 3 points: if the stock is going higher it should not react 3 points below the old top. Buy a 1-2 point reaction (or reactions back to just under the old top) with a stop 3 points under the old top. Worked example: old top 50, advance to 53, buy 51 down to 48, stop 47. | W006 pp.20, 46-47 | A | yes | p.20 says "buy a 1-2 point reaction"; Rule 3's example buys down to 48, 2 points *below* the old top. Both put the stop 3 under the old top. Crossing by 1-3 points is allowed; 3 is "safest". |
| A-ENTRY-05 | After a stock crosses the top of a previous year by 3 points, buy any small reaction. | W006 pp.20, 47 | A | yes | |
| A-ENTRY-06 | New all-time highs are usually safe buys. | W006 p.47 | A | yes | |
| A-ENTRY-07 | In a bull market, buy reactions with a stop 3 points under the previous support. | W006 p.20 | A | yes | |
| A-ENTRY-08 | In bull markets reactions last 2-3 weeks. Buy after a 2-3 week reaction once the stock holds for 2-3 days. | W006 pp.46-47 | A | yes | Weekly-chart pullback timing. |
| A-ENTRY-09 | The further back an old top is, the more important it is when crossed by 3 points. | W006 p.24 | A | yes | Weight crossings by the age of the level. Westinghouse example: 1915 and 1902 tops crossed, then pyramided. |
| A-ENTRY-10 | A stock that holds its all-time low for weeks or months without a 3-point break is a buy with a stop 3 points under. | W006 p.24 | A | yes | |
| A-ENTRY-11 | Buy in strength after an advance signal, not on "cheapness". Buyers in 1929-32 thought stocks cheap 100-300 points off the top, but the trend had not changed and the time period had not run out. | W006 pp.15-16 | A | philosophy-no-method | |
| A-ENTRY-12 | When the news is worst it is time to buy: a bull market begins in gloom and ends in glory. | W006 p.14; W036 p.2 | A | philosophy-no-method | Stated in 1919 and 1936. |
| A-ENTRY-13 | Wait for a definite buying signal at the bottom. Do not hang over the tape for the top or bottom eighth. | W006 p.39 | A | philosophy-no-method | Example: Johns-Manville held near 10 for about 4 months, then crossed tops. |
| **ENTRY (selling points; Rule 4)** | | | | | |
| A-ENTRY-14 | Sell short against single, double or triple tops with a stop 3 points above. | W006 pp.22, 47 | A | yes | Mirror of ENTRY-01/02. |
| A-ENTRY-15 | Sell short after distribution and a 3-point break of the last important bottom. A break of old bottoms is safest at 3 points under. | W006 pp.22, 47 | A | yes | |
| A-ENTRY-16 | After a stock breaks an old bottom by 3 or more points, it should not rally 3 points above that bottom if it is going lower. Sell a small rally with a stop 3 points above the old bottom. | W006 p.22 | A | yes | United Fruit example: broke 81, never rallied back 3 points until it reached 60½. |
| A-ENTRY-17 | Breaking the bottom of a previous year by 3 points is a short. | W006 pp.22, 47 | A | yes | |
| A-ENTRY-18 | Bear-market rallies last 2-3 weeks. Sell at the end of the second or third week with a stop 3 points above the previous week's high. | W006 p.47 | A | yes | |
| A-ENTRY-19 | A narrow week followed by a sharp drop on large volume turns the trend down. Short even while the averages are rising. | W006 p.27 | A | yes | Corn Products, week ended 20 Jul 1935. |
| A-ENTRY-20 | Double top with an earlier high on heavy volume: sell and go short, stop 3 points above the old high. | W006 p.28 | A | yes | American Commercial Alcohol, 90 in 1929 and 1933. |
| **STOP** | | | | | |
| A-STOP-01 | Use a stop-loss order on every trade, placed 1, 2 or 3 points away. Stops also protect you when you are out of reach. | W006 pp.7, 46; W022 p.198 (PDF 203); W001 pp.12-13 | A | yes | Every primary source agrees. W022 pp.103-104 shows stops on new grain positions. |
| A-STOP-02 | Never risk more than 5 points (or $500 per 100 shares) on a trade. | W006 p.46 | A | yes | A literal 1936 magnitude. `lib/gann/pointScale.ts` already scales Gann's "points" by price. |
| A-STOP-03 | A 3-point stop is the safest, because it is caught less often than any other. | W006 p.46 | A | yes | The source of GSPS's 3-point rule. |
| A-STOP-04 | In fast advances at high levels, trail the stop 5 points under each day's high, or 1-3 points under the day's low or close. At very high levels, trail 10 points under the daily high. | W006 p.46 | A | yes | No price thresholds for "high" and "very high" are given. Compare PRICE-01 (50/100/150/200). |
| A-STOP-05 | Trail the stop 1, 2, 3 or 5 points under each week's bottom (above each week's top when short). | W006 p.46 | A | yes | Rule 4 says trail shorts 1 point above the previous week's high, a tighter figure for shorts. |
| A-STOP-06 | Raise the stop on the whole line to 10 points under as the pyramid grows (e.g. at 253, stop to 243). Stop 10 points above a new short (138 short, stop 147). | W022 p.198 (PDF 203) | A | yes-example | Fixed 10-point steps in fiction; consistent with W006's 10-point steps for $80-200 stocks. |
| A-STOP-07 | Margin as the risk limit: the $1,000 of margin defines the loss point (12.80), and Robert is "sure" July cotton will not fall to 13.25. | W022 p.70 (PDF 75) | A | yes-example | |
| **EXIT** | | | | | |
| A-EXIT-01 | Exit after three successive closes against the position (time stop). | W006 p.23 | A | yes | Same rule as TIME-12. GSPS's `exitRules.ts` hold tests may already overlap; check. |
| A-EXIT-02 | Reverse at a change in trend: sell longs and go short. Example: near an old top of 75 holding 1-2 weeks, short with a stop at 78. If stopped out, reverse again. "Keep with the trend all the time." | W006 p.48 (Rule 6) | A | yes | W022 practises reversal at each forecast turn (pp.112, 195-197). |
| A-EXIT-03 | Patience: wait for a change in trend before taking profits. | W006 p.8 | A | philosophy-no-method | Supports trailing exits over fixed targets ("never fix a target price", parity X4). |
| A-EXIT-04 | Cover shorts on bad news ("This was the time to cash in"). | W022 p.223 (PDF 228) | A | yes-example | Contrarian exit; fiction. |
| A-EXIT-05 | Go flat before you will be away from the market. | W022 p.113 (PDF 118) | A | yes-example | |
| A-EXIT-06 | Stop when the tide turns. The failed speculators kept trying to recoup instead of stopping. | W022 pp.203-204 (PDF 208-209) | A | philosophy-no-method | Pairs with GSPS's series-of-losses pause (`lib/risk/lossSeries.ts`). |
| **PYRAMID** | | | | | |
| A-PYRAMID-01 | For stocks priced 20-50, add a lot every 5 points of profit. For 80-200, every 10 points. Place stops so the combined position cannot lose. | W006 p.47 (Rule 5) | A | yes | **Gap: 50-80 and above 200 are not covered.** Summary paraphrases this as "pyramid every 5 points (20-50) or 10 points (80-200)". |
| A-PYRAMID-02 | After the fourth or fifth lot, cut the unit in half. | W006 p.47 | A | yes | |
| A-PYRAMID-03 | Never buy a second or third lot unless the first trade has moved in your favour. | W006 p.47 | A | yes | |
| A-PYRAMID-04 | Never average a loss; average your profits. | W006 pp.15-16, 47 | A | yes | Hard rule: no adds to a losing position. |
| A-PYRAMID-05 | Buy or sell the largest amount first, then add gradually smaller amounts on the way up or down, always with a stop. | W022 p.198 (PDF 203) | A | yes | **Tension with W006 Rule 5** (equal lots, halved only after the 4th-5th). W022's cotton adds shrink at once (500, 500, 500, 300). |
| A-PYRAMID-06 | Add at fixed steps: 10 points for stocks; 1 cent for cotton. | W022 pp.196-199 (PDF 201-204) | A | yes-example | Example magnitudes only; the book states no rule about step size. |
| A-PYRAMID-07 | After an expected 12-15 point reaction, re-buy with a stop about 6 points away. | W022 p.198 (PDF 203) | A | yes-example | Example: 12 Aug at 218, stop 212. |
| A-PYRAMID-08 | Add to a short on each further decline (sold more at 400½, 395½, 390½); cover partly; re-short the rally. | W001 p.7 | A | yes-example | Gann's own 1954 soybean trade. |
| **RISK / MONEY MANAGEMENT** | | | | | |
| A-RISK-01 | Hold at least $3,000 capital per 100 shares ($300 per 10 shares). | W006 p.46 (Rule 1) | A | yes | 1936 magnitude. The structure, capital per unit, transfers. |
| A-RISK-02 | Never risk more than 10% of capital on any one trade. | W006 p.46 | A | yes | The source of the 10% ceiling in AGENTS.md's risk row. |
| A-RISK-03 | After two or three losses, reduce the unit. | W006 p.46 | A | yes | **The rest of this sentence is missing from the transcription ("[text skipped]").** Compare GSPS's 3-loss pause. |
| A-RISK-04 | Double the unit to 200 shares only once profits equal the original capital. | W006 p.46 | A | yes | |
| A-RISK-05 | Safety first: keep large capital behind each trade and put a reserve into savings, first mortgages or gilt-edged investments. | W006 p.46 | A | philosophy-no-method | |
| A-RISK-06 | Buying outright (no margin) does not pay except at about $10 a share or lower. Always know what you will do if wrong. | W006 p.23 | A | philosophy-no-method | |
| A-RISK-07 | After large profits, never risk more than 10% of the profits on the first new deal. After a loss, cut size so the next loss is only 10% of the remaining profits. The market must then beat you ten times in a row to take all your profits. | W022 pp.198-199 (PDF 203-204) | A | yes | Profit-based ceiling, distinct from W006's capital-based 10%. |
| A-RISK-08 | Specialise in two or three markets and do not diversify. Stay out of commodities during a stock campaign. | W022 pp.203-204, 226 (PDF 208-209, 231) | A | yes | A limit on concurrent instruments. **Tension with modern correlation-based diversification and GSPS's multi-symbol scans.** |
| A-RISK-09 | The failed speculators sold their winners and kept their losers. Do the opposite. | W022 pp.203-204 (PDF 208-209) | A | philosophy-no-method | |
| A-RISK-10 | Hope is the speculator's greatest enemy; "facts are stubborn things". | W022 p.205 (PDF 210) | A | philosophy-no-method | |
| A-RISK-11 | Never trade on inside information. Use stop-loss orders and take small losses. | W001 p.12 | A | philosophy-no-method | Gann lost all his money in 1913 and 1919 through brokerage failures. |
| A-RISK-12 | Do not try to make money too fast. Overtrading out of greed lost a million made by following rules. | W030 p.63/48 | A | philosophy-no-method | |
| A-RISK-13 | Example reward-to-risk framing: a 4¢ stop on a 412 soybean short, 26½¢ gained, stated as "6½ times the risk". The coffee short is stated as "1,000% on the risk". | W001 pp.7-8 | A | yes-example | The page prints "485½" for the cover, a misprint for 385½. W001's notes put the coffee trade on p.8, but the re-inspection reads it on p.7. |
| A-RISK-14 | Five qualifications for success: knowledge (30-60 minutes a day for five years), patience, nerve, good health and capital. | W006 pp.8-9 | A | philosophy-no-method | Already taught in GSPS School (Stage E). |
| A-RISK-15 | Have a definite plan and rule, and prove the rules to yourself first. Losses come from hope, tips, guessing and having no rule. | W006 pp.6-8; W001 p.1 | A | philosophy-no-method | |
| A-RISK-16 | The "Twenty-four Never-failing Rules" in *Wall Street Stock Selector* pp.18-19. | W006 p.9 (cited) | A | named-only-not-disclosed | Referenced, not reproduced. The book is not in this cluster. |
| **VOLUME** | | | | | |
| A-VOLUME-01 | Volume is the real driving power behind the market and shows whether supply or demand is increasing. | W006 p.39; W001 p.11 | A | philosophy-no-method | |
| A-VOLUME-02 | Rule 1: a large increase in volume ends a prolonged advance, at least temporarily. After a sharp decline on heavy volume, a secondary rally on decreasing volume marks the final top. | W006 pp.39-40 | A | yes | |
| A-VOLUME-03 | Rule 2: after a second, lower top, a dull, narrow sideways spell that breaks out on increased volume signals a further decline. | W006 pp.39-40 | A | yes | |
| A-VOLUME-04 | Rule 3: at the end of a long decline, volume should decrease and the range narrow, showing liquidation running its course. | W006 p.40 | A | yes | GSPS parity X1 (volume at bottoms). |
| A-VOLUME-05 | Rule 4: after the first sharp advance out of a bear market, a secondary reaction on decreasing volume followed by an advance on heavier volume signals higher prices. | W006 p.40 | A | yes | **Erratum: the text then refers to a "Rule 5" that is not printed, a slip for Rule 4.** The rules apply to total exchange volume and to single stocks. |
| A-VOLUME-06 | Volume rises near tops and falls near bottoms, except in abnormal markets. A panic can bottom on large volume, rally on fair volume, then make a secondary decline on much less volume. | W006 pp.40, 48 (Rule 7) | A | yes | The panic exception is a branch condition. |
| A-VOLUME-07 | Rapid advances to high levels come on rising volume. A secondary rally after the first sharp reaction on smaller volume means the trend is turning down. | W006 p.48 (Rule 7) | A | yes | Restates VOLUME-02. |
| A-VOLUME-08 | Judge volume against shares outstanding. A small float moves over a wider range. Example: GM's 44 million shares against Chrysler's 4½ million. | W006 pp.38-39, 48 | A | yes | GSPS D2 already stores shares outstanding (read with `splitAdjustedSharesAsOf`). |
| A-VOLUME-09 | The smallest volume in years is "a sure sign of bottom". | W006 pp.43-44 | A | yes | Feb 1933 and Sep 1934 examples. The lookback ("in years") is loose. |
| A-VOLUME-10 | Avoid stocks in long, narrow ranges until they break out on volume. | W006 p.20 | A | yes | Consistent with GSPS's breakaway hold. |
| A-VOLUME-11 | Compare total volume and points gained across campaigns. Much more volume for fewer points warns of a top. Examples: 422M shares for 60 points in 1933 vs 350M for 96 in 1929; 407M for 65 points in 1934-35. | W006 pp.43-45 | A | yes | Effort-vs-result per campaign. Thresholds not stated. |
| A-VOLUME-12 | The largest weekly volume since a prior top warns to watch for a top. | W006 p.44 | A | yes | |
| A-VOLUME-13 | A double top on two-thirds of the first top's volume, and a third test of the same level, signal a top. | W006 pp.43-44 | A | yes | |
| **PRICE** | | | | | |
| A-PRICE-01 | Moves speed up above 50, faster above 100 and very wide above 150 and 200. On declines the first 50-100 points from an extreme high fall fastest. Below 100 and 50, moves and rallies shrink. | W006 pp.22-23 | A | yes | Price-zone volatility. Supports the price-scaled points in `pointScale.ts`. |
| A-PRICE-02 | Speed is a movement in price during a unit of time. | W001 p.11 | A | yes | A definition, so velocity can be computed. The rules for using it are not disclosed. |
| A-PRICE-03 | Rules for when prices are in balance or out of balance with time. | W001 p.11 | A | named-only-not-disclosed | |
| A-PRICE-04 | True Trend Line vs Relatively True Trend Line, for advancing and declining markets, with indexes showing whether prices culminate on those lines. | W001 pp.11, 14 | A | named-only-not-disclosed | |
| A-PRICE-05 | Time-price angle: from a major low, draw a 45° line at a fixed number of points per month. Coffee: 435 + 30 pts/month × 276 months = 8715 on 19 Mar 1954, within 14 of the 8729 high. | W046 p.1 | A | yes | **Gann printed "50 points per month"; only 30 reproduces 8715.** The second case (300 + 40/month × 210 = 8700) is consistent. The pts/month scale is chosen per market with no derivation. |
| A-PRICE-06 | Expected annual price range: 9-12 points on the averages, 20-30 on active stocks; wheat 30-35¢. | W036 pp.12, 22 | A | yes-example | Forecast-specific. |
| A-PRICE-07 | Conditional price trigger in a forecast: if May wheat sells at 1.08 after Jan 25, expect about 95-92¢. A later supplement says a rally to 116 reverses the trend. | W036 pp.22-23 | A | yes | A pre-stated invalidation or confirmation price. Agrees with GSPS's breach/retire rule. |
| **LEVELS** | | | | | |
| A-LEVELS-01 | Old tops become bottoms, and old bottoms later become tops. | W006 pp.13, 24, 40-41 | A | yes | Called "My rule". Examples: the Jun 1931 low at 120 matched the Nov 1919 top; the Feb 1931 rally failed just under the Nov 1929 lows. |
| A-LEVELS-02 | The top of a secondary rally is always an important point to watch. | W006 p.13 | A | yes | |
| A-LEVELS-03 | When a stock breaks the previous bear-campaign bottom by 3 points, look to the next older campaign's bottom for support. Then the next: from 1929, the 1923-24, 1921, 1917, 1914, 1907, 1903-04 and 1896 lows. | W006 pp.23-24 | A | yes | A historical S/R ladder. Needs long history; GSPS's feed reaches about 2019. |
| A-LEVELS-04 | Failing to pass an old top (a double top), especially a third test of the same level, is a top. | W006 pp.14-15, 44 | A | yes | Mirror of ENTRY-03. |
| A-LEVELS-05 | In bear markets, old tops act as support. A rally that fails just below an old top (119 against the 120 top) means the bear market is still on. | W006 p.24 | A | yes | |
| A-LEVELS-06 | A low that is not 3 points under the old lows shows good support. Examples: Aug 1921 at 64 against 66; Jul 1932 at 40½ against the 1903 low of 43. | W006 pp.11-12, 24 | A | yes | |
| A-LEVELS-07 | Price resistance levels as a price-and-time balance; the Corner Stone, Key Stone and Cap Stone for price and time trend. | W001 pp.14-15 | A | named-only-not-disclosed | Master Calculator features. |
| A-LEVELS-08 | Round-number resistance: Major Motors "would not advance much above 200", and not above 205½, before a big decline. | W022 pp.146, 161 (PDF 151, 166) | A | named-only-not-disclosed | Reading this as a round-number rule is the notes' inference; the book does not say so. |
| **ASTRO** | | | | | |
| A-ASTRO-01 | Place price on the 360° circle at several scales and read the zodiac position: 1 point = 1°, 30 points per degree, a "Jupiter scale" of 12 points per degree, 1¢ per degree, and the contract's dollar value ($100 per degree). | W046 p.1 | A | research-only | Several scales are tried at once with no derivation: a multiple-comparisons pattern and an "invented conversion constant" under AGENTS.md. |
| A-ASTRO-02 | Compare the price-degree with heliocentric planet longitudes, looking for aspects. Examples: 8663 is "60° from heliocentric Jupiter"; the 21° Capricorn price is opposite heliocentric Uranus at 21°52′ Cancer. | W046 p.1 | A | research-only | **Erratum: 8663 mod 360 = 23° Aries, not 28°.** |
| A-ASTRO-03 | Add the Sun's travel since a major low (in degrees) to that low's price to get a "resistance angle". Example: 8253° + 435 = 8688. | W046 p.1 | A | research-only | Arithmetic checks. |
| A-ASTRO-04 | Convert a planet's travel since each major low into price, at 30 points per degree plus the low (and alternatively at 45 points per degree), using both geocentric and heliocentric Saturn. | W046 p.1 | A | research-only | The base used for the 1940 cases is not stated, so those cannot be verified. |
| A-ASTRO-05 | Take averages and midpoints of planetary longitudes: the averages of 6 heliocentric and 6 geocentric planets, the Jupiter-Saturn half, the Jupiter-Uranus half, and the 4-planet average and its half. | W046 pp.1-2 | A | research-only | Matches the "six major planets average" listed in AGENTS.md. Only three heliocentric and three geocentric values are printed, and the six printed values average about 164 (the heliocentric figure), so the geocentric 173.26 cannot be reconstructed. |
| A-ASTRO-06 | List the coming aspects (60°, 120°, 135°, 180°, including heliocentric and Sun aspects). A cluster makes the month "very important", with great activity and wide swings. | W046 p.2 | A | research-only | April 1954 list. "Sun 130 of Saturn" is not a standard aspect, possibly a typo. |
| A-ASTRO-07 | Count geocentric Mars's complete round trips from each major low. The half-cycle (Mars opposite its own place at the low) is a change date. When retrograde motion brings the third opposition to its own place, it is "very important". | W046 p.2 | A | research-only | A planetary-return rule, clear enough to pre-register. |
| A-ASTRO-08 | Conditional astro forecast: if the decline starts in the Mar 22-24 window, it runs to the completion of the adverse aspects (about Apr 15), then a quick rally to Apr 16, then a sharp decline. | W046 pp.2-3 | A | research-only | |
| A-ASTRO-09 | Apply the same planetary rules to grains or any other commodity. | W046 p.3 | A | philosophy-no-method | |
| A-ASTRO-10 | "CE AVERAGE" and "MOF FORMULA", held back for top-course students under a secrecy agreement. | W046 p.3 | A | named-only-not-disclosed | |
| A-ASTRO-11 | "Malefic" and "depressing" cycles in annual forecasts. | W036 pp.4-6 | A | named-only-not-disclosed | Astrological vocabulary; no method. |
| A-ASTRO-12 | The novel's astrology is character material only: natal charts, transits, city rulerships (New York = Cancer, Paris = Neptune), and Gemini as the U.S. ascendant. There is no planetary rule for prices. | W022 pp.66-67, 177-179, 213-215, 247-249, 326 | A | philosophy-no-method | |
| A-ASTRO-13 | Gann cast horoscopes for callers (1923 interview). | W010 p.3 | B | philosophy-no-method | Reporter's account. |
| A-ASTRO-14 | Gann's private 1940-50 Raphael ephemerides: Jupiter and Mars lines cross at the 1 Dec 1948 soybean high (a conjunction), and he was short into Jan 1949. His notes reportedly hold midpoints, declinations, heliocentric transits and lunar nodes. | W010 pp.11-12 | B | research-only | Publisher's and reviewer's description, not seen. Listed in unresolved §5 as needing the original. |
| **SELECTION** | | | | | |
| A-SELECTION-01 | Trade active stocks that follow the rules. Leave "queer-acting" and dead, inactive stocks alone. | W006 pp.20, 34-35 | A | yes | Liquidity/behaviour filter. |
| A-SELECTION-02 | Early leaders in a bull market bottom and accumulate first, or cross previous years' tops first: buy them. | W006 pp.27-29 | A | yes | Relative-strength-by-structure: cross-sectional ranking on Gann criteria. |
| A-SELECTION-03 | Early leaders in a bear market top and distribute first, or break previous years' bottoms first: short them. | W006 pp.24-25 | A | yes | Example: Chrysler topped 11 months before the averages. |
| A-SELECTION-04 | Buy stocks in strong position and leave the weak alone. You can be long the strongest and short the weakest at once (Chrysler long, United Fruit short, 1935). | W006 pp.32-34, 37-38; W022 pp.90, 146 | A | yes | Pair trade. W022: long the new industry (Right Aeroplane), short the old (Major Motors). |
| A-SELECTION-05 | Change with the times: old leaders go and new ones come. Favour new industries (airplanes in 1936). | W006 pp.18-19, 23 | A | philosophy-no-method | |
| A-SELECTION-06 | Independent movers keep their own time periods and can move against their group. | W006 pp.35-37 | A | yes | Same as TIME-08. |
| A-SELECTION-07 | Small-float stocks (130,000-166,000 shares) can be sold short for the widest declines. | W006 pp.38-39 | A | yes | Uses shares outstanding (D2). |
| A-SELECTION-08 | Choose which contract month to trade by season. Wheat: May until May 10, then July, then September and December. Cotton: October and July in spring, December and January after September, March in Nov-Dec. | W036 pp.19-20, 22 | A | yes-example | Futures-only. |
| A-SELECTION-09 | Real estate stocks are "one of the last things to move up". | W006 pp.34-35 | A | philosophy-no-method | Sector-lag remark. |
| **OTHER (psychology, discipline, framing)** | | | | | |
| A-OTHER-01 | When everybody is convinced an event will happen, it has usually already happened or been discounted. | W006 pp.50-51 | A | philosophy-no-method | |
| A-OTHER-02 | The public is always wrong because it follows no well-defined rule. The human element, not the market, beats traders, so eliminate judgment and guesswork. | W006 pp.48, 50; W001 p.1 | A | philosophy-no-method | |
| A-OTHER-03 | History repeats as "the balancing of time and price": action in one direction, reaction in the other. | W006 p.9; W022 p.265 | A | philosophy-no-method | |
| A-OTHER-04 | Forecasting factors: TIME, PRICE, VOLUME and SPEED, supplemented by a fifth, MASS PRESSURE. | W001 p.11 | A | named-only-not-disclosed | |
| A-OTHER-05 | Mass Pressure: public over-optimism or pessimism after a cycle, as a curve that can be calculated 100 years ahead with minor corrections at fixed intervals. | W001 pp.11-12, 16 | A | named-only-not-disclosed | |
| A-OTHER-06 | The Master Three-Dimension Chart shows the relative position of time, price and volume, and velocity/speed. Other named products: Master Calculators 9 and 12, the Dollar Trend chart, the New Time Trend Indicator, the Mechanical Method. | W001 pp.7, 14-16 | A | named-only-not-disclosed | |
| A-OTHER-07 | The number 7 matters most in time periods, then 3, 9 and 12. Other numbers in the books: 3 and 7, 10 "perfect", 12 breaths, 21 days, seven circles around one, the 7th as a sacred day. | W001 p.14; W030 pp.108-110/93-95; W022 p.152 | A | research-only | Numerology with no market specification: inadmissible as a criterion under AGENTS.md. |
| A-OTHER-08 | Name-letter and "fortunate number" numerology for elections. | W022 pp.218-221; W010 p.3 | A/B | research-only | W022's own 1928 call ("a Republican will not be elected") was **wrong** (Hoover won). |
| A-OTHER-09 | One law has three applications: spiritual, physical and "the law of finance". Breaking the financial one brings losses. | W030 p.111/96 | A | philosophy-no-method | Correspondence / Cause and Effect lens. |
| A-OTHER-10 | Deal with causes; everything rests on "exact proportion and perfect relationship". Forecasting uses algebra, geometry and the theory of cycles. | W010 pp.2-3; W022 p.75 | B (W010) / A (W022) | philosophy-no-method | |
| A-OTHER-11 | An angry man has bad judgment. You cannot do two things at once. Time is your most valuable possession. | W030 pp.65/50, 66-67/51-52, 87/72 | A | philosophy-no-method | Trader psychology. |
| A-OTHER-12 | Gann works the trend out in advance, from the top or bottom of a swing to the exact turning point. He orders at the top or bottom eighth of a swing. | W001 pp.1-2 (Wyckoff, *Ticker* 1909) | B | named-only-not-disclosed | Reported, not Gann's text. |
| A-OTHER-13 | Supplements revise a forecast during the year when the market strays from the projected curve. | W036 pp.16-17, 23 | A | yes | A forecast with scheduled revision. Gann scored his forecasts only after these revisions. |
| A-OTHER-14 | Wheat prices forecast coming wars. Gann determined the "major and minor time factors" that repeat in nations, men and markets. | W022 p.70 (PDF 75) | A | named-only-not-disclosed | |

---

## 2. Errata and contradictions

### 2.1 W046 coffee letter: Gann's own arithmetic slips (unresolved-items §3; W046 notes pp.1-2)

1. **"50 points per month" should be 30.** Only 435 + 30 × 276 = 8715 reproduces the 8715 figure; 50 a month would give about 14,235.
2. **30 × 210 + 300 = 6600, not 5600** (March coffee from the 1 Oct 1936 low of 300). The 40-a-month case, 8700, is correct.
3. **8663 mod 360 = 23° Aries, not 28°.** 60° from heliocentric Jupiter at 89°35′ would be 29°35′ Aries.
4. **Heliocentric Jupiter is written two ways:** "20°35′ Gemini" on p.1 and "89°35′ = 29°35′ Gemini" in the planet list. The second agrees with 8729 = 29° Gemini.
5. **The 19 Oct 1953 high is written 5660 in the pivot list and 5860 in the month counts.**
6. **The 15/18 March prices (5625/5465) sit far below January's and the next day's 8729.** They may belong to another contract.
7. **"Sun 130 of Saturn" is not a standard aspect**, possibly a typo.

There is also a printed **"average of these 6 planets" of 164.17 while only three planets are listed** on p.1. The six values on pp.1-2 average about 164, which fits the heliocentric figure. Nothing the letter prints yields the geocentric figure of 173.26.

### 2.2 Repo note `docs/memory-bank/sources/A2_3_coffee_letter_1954.md` vs the scan (unresolved-items §4)

All five were confirmed by reading the repo file in /home/claude/GSPS. **Not corrected (read-only task).**

1. The repo says March coffee "at 40 pts/month ⇒ **4700**". The scan reads **8700**, and 300 + 40 × 210 = 8700 confirms it.
2. The repo says geocentric Saturn 285°38′ "⇒ **6572**". The scan reads **8572**.
3. The repo gives the May 15, 1940 Saturn as "**181°55′**". The scan reads **181°35′**; the degree digit is partly unclear.
4. The repo repeats "**50 pts/month**" without noting that only 30/month reproduces 8715 (erratum 2.1 #1).
5. The repo lists scales of "**1, 12, 30, 45, 46, 50 pts per degree**". No 46 appears in the letter, and the 50 is per *month*, not per degree.

Two further points in the repo note, not in unresolved §4:
- It repeats Gann's 8663 = "28° Aries" and Jupiter "20°35′ Gemini" without flagging erratum 2.1 #3 and #4.
- It repeats March coffee at 30/month "⇒ 5600" without flagging erratum 2.1 #2.

### 2.3 Other contradictions and ambiguities

- **W022: what a "time" is.** p.371 says 360 days, years or degrees; p.372 says a score (20 years). The book never reconciles them.
- **W022 vs W006: lot sizing in a pyramid.** W022 says the largest lot first, then smaller ones. W006 Rule 5 uses equal lots, halved only after the 4th-5th.
- **W006: pyramid steps cover only two price bands.** 20-50 (5 points) and 80-200 (10 points); nothing is given for 50-80 or above 200.
- **W006: single-bottom hold time.** 2-3 weeks (p.20) vs 1-3+ weeks (Rule 3, p.46).
- **W006: buying after crossing an old top.** A 1-2 point reaction (p.20) vs reactions down to 48 under an old top of 50 (Rule 3's example). Both put the stop 3 under the old top.
- **W006: trailing a short.** Rule 2 trails 1, 2, 3 or 5 points above weekly tops; Rule 4 trails 1 point above the previous week's high.
- **W006: bear-market durations.** p.13 says the greatest lasted "no more than 43 months", yet lists 1869-73 at 53 months.
- **W006 gaps in the transcription.** Rule 1 is truncated ("[text skipped]" after "reduce the unit"). The 10-year Chrysler trade record and the Chrysler volume examples are missing. A "Rule 5" in the volume chapter is cited but not printed (a slip for Rule 4).
- **W006 typos:** "July 8, 1923" for 1932, "1969" for 1869, "93 2/8", "15 2/8", "139 2/8".
- **Pivot counts vs calendar dates.** W036's major dates fall on the equinoxes and solstice (calendar points). W006, W046 and W022 count from pivots. The texts do not reconcile the two (collection-synthesis §3.3).
- **Dates over price (W036 p.22) vs GSPS.** Gann says to act on the date regardless of price. GSPS keeps calendar windows as context only, which the F4 test supports.
- **W036 scoring.** Two credited hits predate their forecasts' issue dates (the Jan 3 wheat low; the Apr 2-5 cotton low). All three 1922 forecasts were revised mid-year before Gann scored them "90 per cent correct". The 1922 overlay chart shows misses in February and December.
- **W022 failed forecasts.** The 1928 election, an England-Russia war in 1928, and the 1930-32 war on the U.S. did not happen. The novel's own market story has no 1929 crash.
- **W001 page placement.** The detailed notes put the 1954 coffee trade on p.8; the re-inspection reads it on p.7. The soybean cover price "485½" is a source misprint for 385½.
- **W001 testimonial attributions** were corrected in the re-inspection (Portland, Apr 1931 = W.P.H. Jr.; Thompson ND = A.O.K.; the 218-wheat letter = G.W.I.B.). This does not affect any rule.

---

## 3. Counts by category

| Category | Rows | yes | yes-example | named-only | philosophy | research-only |
|---|---|---|---|---|---|---|
| TREND | 14 | 12 | 0 | 0 | 2 | 0 |
| TIME | 42 | 17 | 2 | 11 | 7 | 5 |
| ENTRY | 20 | 17 | 0 | 0 | 3 | 0 |
| STOP | 7 | 5 | 2 | 0 | 0 | 0 |
| EXIT | 6 | 2 | 2 | 0 | 2 | 0 |
| PYRAMID | 8 | 5 | 3 | 0 | 0 | 0 |
| RISK | 16 | 6 | 1 | 1 | 8 | 0 |
| VOLUME | 13 | 12 | 0 | 0 | 1 | 0 |
| PRICE | 7 | 4 | 1 | 2 | 0 | 0 |
| LEVELS | 8 | 6 | 0 | 2 | 0 | 0 |
| ASTRO | 14 | 0 | 0 | 2 | 3 | 9 |
| SELECTION | 9 | 6 | 1 | 0 | 2 | 0 |
| OTHER | 14 | 1 | 0 | 5 | 6 | 2 |
| **Total** | **178** | **93** | **12** | **23** | **34** | **16** |

Counted mechanically from the table. Three pairs restate the same rule in two categories: A-TIME-08 and A-SELECTION-06, A-TIME-12 and A-EXIT-01, A-VOLUME-07 and A-VOLUME-02.

Rows by source (a row can cite several): W006 about 95, W022 about 35, W036 about 17, W046 about 14, W001 about 20, W030 about 7, W010 about 4.
