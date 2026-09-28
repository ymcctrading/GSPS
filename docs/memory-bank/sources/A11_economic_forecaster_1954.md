# A11 — *W. D. Gann Economic Forecaster: Why Money Is Lost on Commodities and Stocks and How to Make Profits* (booklet, 1954; Lambert-Gann reprint)

| Field | Value |
|---|---|
| Tier | A (Gann's own promotional booklet; contains third-party letters and accountant statements) |
| Copyright | 1954 booklet; reprint by Lambert-Gann. **Do not reproduce**; synthesis only |
| Source file | Drive scan, 8 pp.; text recognised (heavily garbled in the testimonial columns) |
| Read status | **Read in full** (2026-09-27) |

## Content by section
1. **Opening (p.2):** "you must have a well defined plan and must know the rules that have stood the test of time for 50 years or more… **eliminate guess work, hope and fear and follow rules**."
2. **"W. D. Gann's record for 52 years"** (pp.2–6), a self-written chronology:
   - first commodity trade Aug 15 1902
   - "Aug 8 1908 made one of his greatest mathematical discoveries" (the undisclosed "Master Time Factor")
   - reprint of the 1909 *Ticker* article (A01)
   - forecast claims: 1914 war; 1918 armistice; 1919, 1921, 1922, 1929 ("end of bull market Sep 3 1929… a 'Black Friday'"); 1932 (bottom July 8); **Mar 1 1933 bottom "by the use of his Master Time Factor"**; Jul 17 1933 top; 1937; 1941 soybeans; Oct 15 1946 cotton
   - broker-statement trade records: 1933, 479 trades, 88% winners; 1934, 362 trades, 93% winners. **Self-published; not verifiable here.**
   - 1954 soybean short at 412 with a **stop at 416 (4¢ risk) for a 24½¢ gain, "4½ times the risk"**
   - Apr 2 1954 December coffee high called by the "**MASTER TIME CYCLE and MASTER THREE-DIMENSION CHART**"
   - Selective admission to courses: "we will refuse to teach them" people judged unsuitable.
3. **Testimonials and CPA reports** (pp.6–8): a reader crediting *Tunnel Thru the Air* (written early 1927) with calling **Oct 3 1931** as a bottom (see A03). An accountant calls the method one to follow "without any human-made deviations from the rules."
4. **"Mathematical Prediction Formula"** (p.7–8; testimonial author W.G.T.). This is the only place in the catalog listing **five factors**:
   - **TIME** ("the essential element"): cycles "can be calculated and projected 100 years or more in advance, **subject to minor corrections and variations**"
   - **PRICE**: rules for "what happens when **prices complete a cycle before time expires**"; "**prices are sometimes behind time and sometimes ahead of time**"; a rule for when price is "in balance with time" or out of balance
   - **TRANSITION PERIODS**: "all of the rules prove that TIME is the essential factor and that **prices conform to time when a TIME CYCLE is complete**"
   - **VOLUME**: "the driving power"; rising volume increases the velocity of prices
   - **SPEED**: "a movement in price during a unit of time"
   - **MASS PRESSURE** (the fifth factor): the public's cycle of over-optimism, then pessimism. "**The mass pressure curve can be calculated 100 years or more in the future.**"

   Also a "TRUE TREND LINE" and a "relatively true trend line" (advancing and declining), and "a time variable and price variable." **Method not disclosed** anywhere in the readable catalog.
5. **"About losses"** (p.8):
   - Gann lost $10,000, $20,000, $60,000, and $50,000 "following so-called inside information", plus two brokerage failures (1908, 1919) and bank failures.
   - "**never to believe anything that he heard… but to follow mathematical deductions which he could prove**."
   - "**small losses are about the only expense… protect your capital with stop loss orders… one big profit… will overbalance three or more small losses.**"
   - "Follow all of the rules and not part of them."
6. **"Why time cycles predict trend"** (p.8), Gann's **causal theory of cycles**:
   - "**TIME CYCLES repeat because human nature does not change.**"
   - Wars recur because young men without experience are led into them.
   - Business: after long prosperity, people borrow on hope and get over-extended, then "**people who borrow money on hope have to LIQUIDATE when FEAR overtakes them.**"

## What's new vs prior catalog
- **Gann's own causal explanation of cycles is psychological, not astronomical**: human nature, and the hope/fear sequence. This sits alongside his astrology (A2.3) and should be cited for what it says.
- The **five-factor list** (time, price, volume, speed, mass pressure), "ahead of/behind time", and "prices conform to time when a cycle completes".
- A worked **reward-to-risk statement** (4¢ risk, 24½¢ gain) and the "one big profit overbalances 3+ small losses" payoff asymmetry.

## GSPS cross-reference
| Idea | GSPS | Note |
|---|---|---|
| Time dominant, "prices conform to time when cycle completes" | Time windows are confluence-only (`timeCycles.ts`, `squareOf52.ts`) | Deliberately not gating (AGENTS.md). Gann's own ranking would put time first. Record the tension; measurement decides |
| Price ahead of / behind time | `timePriceSquare.ts` (count-for-count match) | Partial. "Ahead/behind" direction of the mismatch isn't surfaced |
| Speed = price per unit time | `normalizedSlope.ts` (ATR per bar) | Aligned in concept |
| Mass pressure (hope→fear) | none | Sentiment. Out of scope unless sourced data exists |
| Stop-loss discipline; small losses vs big winners | `lib/risk/*`, R-multiples in the backtest | Aligned |
| Ignore tips; follow rules | Education copy | Aligned with GSPS School tone |
| Accuracy percentages | — | **Never usable as claims** (forbidden phrases) |

## Three-question notes
1. Tier A (1954) but promotional. Separate Gann's *statements of method* from *claims of results*.
2. Dewey: "projected 100 years… subject to minor corrections" concedes that **constancy of period is not exact**. Mass pressure is a claimed cycle with no stated period.
3. Hermetic: **Mentalism** ("human nature does not change": the market cycle as a mental and psychological cycle; the clearest Mentalism hook in Gann's own words), **Rhythm** (hope↔fear), **Cause and Effect** (credit expansion leads to liquidation).
