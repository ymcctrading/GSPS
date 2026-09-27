# A2.2 — *Annual Forecasts 1919–1922* (reproduced from an early edition of *Truth of the Stock Tape*; Gann Study Group booklet)

| Field | Value |
|---|---|
| Tier | A (Gann's own forecasts as sent to subscribers, with his after-the-fact annotations) |
| Copyright | 1918–1922 texts, public domain in the US; booklet is a free reprint |
| Source file | Drive scan, 24 pp.; text recognised 2026-09 (some digits garbled: r = 1, x = 1, z = 2, g = 9, s = 5) |
| Read status | **Read in full** (2026-09-27): stocks 1919, 1920, 1921, 1922; cotton 1922; grain 1922 |

## What the documents show about Gann's working method
- **1919 forecast** (dated Dec 16 1918):
  - "History repeats itself… My study of the measurement of **time cycles** indicates that 1919 falls in the cycle of advancing prices."
  - **"A Bull campaign always begins in gloom and ends in glory"** is the earliest dated appearance of the maxim repeated in Ch. 11A and 12 (1939).
  - Accumulation Jan 9 – Feb 4; the rise starts end of February. Gann's note: bottom Feb 10, advance Feb 14.
- **1920 forecast** (Dec 10 1919):
  - "My mathematical calculations, based upon a **Cycle Theory which I discovered**, indicate **two Bull and two Bear campaigns**." Tops ≈ Apr 22–24 and Aug 23–25. Panics in Sep and late Nov – Dec, with a temporary bottom about Dec 19. (Actual low Dec 22 1920.)
  - The forecast mixes geopolitical and social predictions with dates (war with Mexico/Japan, strikes). Gann's methods for those are undisclosed. They are **not** operational content.
- **1921 forecast** (Dec 14 1920):
  - Rails and Industrials get separate time forecasts ("the time factor in this cycle at times indicating advances in Railroad stocks while Industrials are declining").
  - A predicted **narrow, dull year** ("dull and inactive after advances… holding for some time around the tops… around the bottoms").
  - **Dates-to-watch list:** alternating high/low dates **roughly every 6–8 days (about 4 per month)** all year.
  - **Inversion rule, verbatim substance:** "If low prices are made on the date indicated [as a high], you may expect high prices at the next date… if prices are high on a low date, then expect them to be low on the next high date… **the dates given will not always mark extreme high and low prices, but some kind of a rally or decline may be expected around these dates.**"

  ⇒ **Gann's time dates are turn dates, direction-agnostic.** The polarity is corrected in real time by what price actually does. This is the same logic as `timeCycles.ts`'s directional correction, and it supports it: a turn window says *when*, and price action says *which way*.
- **1922 stocks forecast** (Nov 30 1921):
  - A projected **curve** (chart) for 20 Industrials and 20 Rails. "The swings… are **based upon a Time factor** and my calculations are based upon the **commodity curve, money curve and curve of stocks**. Sometimes one of these curves will cause a change of trend." ⇒ Gann combined **three separate cycle curves** (commodities, money/interest, stocks).
  - **X-marked dates about every 14 days** (e.g. Jan 13–14 X, Jan 26–27 X; Feb 12–13 X, Feb 26–27 X; …), with unmarked lows between them. ⇒ an alternating structure of roughly **7-day minor and 14-day major** turns, consistent with Ch. 14 ("14 days most important, 21 next").
  - "**It requires time at both bottoms and tops to accumulate and distribute stocks.**"
  - Three tops forecast (Apr, Aug, Oct 8–15). The actual final high was **Oct 14 1922**.
  - Gann's own scoring: "**with two corrections [monthly supplements], the Forecast was 90 per cent correct.**" ⇒ Forecasts were **revised monthly by supplement** when the market diverged: a projection plus ongoing correction, not a fixed prophecy.
- **1922 cotton** (Apr 25 1922): the top forecast Jul 27 – Aug 3 came Aug 1; the Nov 8 top (from a supplement) came Nov 9; Dec 6 low vs the Dec 3–5 forecast. Crop-news narratives are attached.
- **1922 grain** (Jan 31 1922):
  - A curve with **cents-per-bushel magnitudes** for each swing.
  - **"You must not depend too much on the number of cents… The main thing to watch is the dates for tops or bottoms, and if the market comes out pretty close to these, you should buy or sell regardless of the price."** ⇒ **Gann ranks time above price in forecasting.**
  - **Major change dates: Mar 20–24, Jun 21–23, Sep 20–24** ⇒ equinoxes and solstices, the seasonal points of Ch. 14/17/18.
  - A conditional price trigger ("If May Wheat sells at 1.08 after January 25th… much lower") and a supplement reversal level ("if May Wheat rallied to 116, the trend would reverse").
- **Closing (p.24):** "**The big money… is made on the long swings and not by day to day trading.** The major moves… recur as regular as the sap rises in the trees in the springtime and the leaves fall in the autumn."

## What's new vs prior catalog
- The **turn-date inversion rule** (direction set by price, not by the date).
- **Three-curve composition** (commodity, money and stock curves).
- **Time over price** in forecasting, stated explicitly.
- The weekly/biweekly alternation of turn dates.
- Monthly supplements, i.e. **forecast revision** as part of the method.

## GSPS cross-reference
| Idea | GSPS | Note |
|---|---|---|
| Turn dates are direction-agnostic; price sets direction | `timeCycles.ts` (pivot-polarity projection) | Consistent. An "active window" should inform timing, not direction |
| Equinox/solstice major dates | `timeCycles.ts` fixed annual calendar | Check that Mar 20–24 / Jun 21–23 / Sep 20–24 / Dec 21 are covered |
| ~7/14-day alternating minor/major turns | none | Candidate confluence field (Ch. 14 corroborates 14/21-day counts) |
| Money/commodity curves | none | Out of scope (macro data); record only |
| "Long swings, not day-to-day" | 15Min execution timeframe | A tension to note in education copy, not a code change |
| Accuracy claims (90%, "no other man…") | — | **Self-reported. Never usable as a performance claim** (banned-terms rule) |

## Three-question notes
1. Tier A (Gann's own dated forecasts). The *generation* method is undisclosed ("a Cycle Theory which I discovered"). Only the output format and the annotations are primary evidence.
2. Dewey: these are **ex-ante published forecasts**, stronger than hindsight, but self-scored and selectively annotated. No independent repetition count or significance test exists. Treat them as evidence of *what Gann believed*, not a validation of the cycle.
3. Hermetic: **Rhythm** ("regular as the sap rises… leaves fall"), **Polarity** (the inversion rule: a high date becomes a low date), **Cause and Effect** (time is the cause, price the effect; the price magnitude is secondary).
