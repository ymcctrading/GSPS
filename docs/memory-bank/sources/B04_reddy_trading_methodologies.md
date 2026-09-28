# B04 — Hima Reddy, *The Trading Methodologies of W.D. Gann* (FT Press, 2013)

| Field | Value |
|---|---|
| Tier | B (modern secondary, CMT author). Quotes Tier-A text (A8 pp. 39–41, 43; A1 1909). |
| Copyright | © 2013. Synthesis only. |
| Read status | **Read in full, all 200 pages** (2026-09-27). The first pass (preface to Ch. 4, BP/SP #9) was via the Drive connector; the rest (Ch. 4 trading ranges, Chs. 5–8, Appendices A–E, notes) came from a direct download. |

## Content read (synthesis)
- **Ch. 1:** recaps the 1909 Wyckoff/Gilley record (286 trades, 264 winners). The **testimony is not a GSPS claim** (banned terms).
  - Lists Gann's books and the 1950 course prices.
  - Splits Gann's work into *trading* methods (how) and *forecasting* methods (when: angles, squares). Focuses on A8.
  - Rewrites the 28 rules in "affirmative" form (Appendix B, not read).
- **Ch. 2:** 3–4-section campaigns; "price is king" (price discounts everything); patterns repeat across unrelated securities and across timeframes (weekly ↔ daily ↔ 60-minute); price and time share a source (Earth's motion).
- **Ch. 3:**
  - An exercise deriving **eighths** of a move A→B, with 50% as the "radius of action" (the point of no return).
  - Two **projection** methods: the A→B eighths projected beyond B, or projected from the retracement low C. These are Reddy's techniques, illustrated on INTC and AUDUSD; she does not cite them to Gann.
- **Ch. 4:** eight trade phases (trend → signal → risk → order → initiation → management → exit → review). Gann's buying and selling points (A8 pp. 39–41) ranked by Reddy's judgment of importance:
  1. **exceeding moves in time** (BP/SP #4, #5, #6)
  2. triple bottoms/tops (#8)
  3. double bottoms/tops
  4. **exceeding moves in price** (BP/SP #3, the "safest")
  5. old tops/bottoms (#1), in three variants (holds above, holds at, dips slightly below)
  6. rapid moves (#9: 2-day reactions, trailing stop under the prior day's low; runs of 10–30 days without breaking a prior-day low)
  - Her observations: triple tops resolve faster than triple bottoms ("fear builds faster than greed"; her claim). Entry tiers run aggressive, then safer, then safest as successive swing levels break.

## Rest of the book (Ch. 4 end – Appendix E)

- **Trading ranges (Ch. 4 end).**
  - Accumulation, distribution and continuation ranges. The longer the range, the bigger the breakout, which matches A8 p. 51.
  - Reddy's own observation: continuation ranges slant *against* the trend.
- **Ch. 5, "favourite numbers" (Reddy's extensions; not Gann-sourced unless noted).**
  - 100% and 50% of the extreme range (Gann's BP/SP #7).
  - **50% of *time*:** project half the duration of the prior move forward.
    - This is a Reddy extension. It is consistent with Gann's time-division rules (A2.1 Ch. 13 divides time like price) but is not a quoted Gann rule.
  - 50% of a consolidation range, and 50% of a single major reversal bar (Reddy).
  - **"A level tested three times is more likely to break on the 4th"** — Reddy states this as Gann's own tenet, consistent with A8 p. 43.
  - He applies Gann buying/selling points to RSI and Williams %R. **Non-Gann; excluded.** Oscillators are a user tool under AGENTS.md's charting-indicator exception and must never feed a verdict.
  - **"Test failure":** a probe past a level that fails to *close* beyond it within about 2 bars warns that the signal is failing. Reddy's (from his father), not Gann's. Structurally close to Gann's "fails to go 3 points through" (A05) and "lost motion" (A8).
  - **Retracements anchored on extreme *closes*** as well as highs/lows (Reddy).
- **Ch. 6, capital management (Gann's rules restated).**
  - Risk at most 1/10 of capital; Reddy uses 2%.
  - **Recalculate risk from remaining capital after 3 losses in a row** (Rule 27 and A8 p. 29).
  - Raise risk only after capital doubles, banking half the profit (Rules 11 and 24).
  - Stop 1–3¢ (5¢ max) / 3–5 stock points.
  - **Move the stop to breakeven once profit equals the initial risk** (Rule 4; Gann's text says "a profit of 3 cents or more").
  - **Runaway (final-stage) markets:** trail under the prior bar's low; Reddy prefers a **two-bar** break as the first warning. Gann's BP/SP #9 uses 1–2¢ under *each day's* low.
  - Scale-out of the trailing stop by quarter retracements (Reddy's).
- **Ch. 7.** Re-creates Gann's 1940–41 May soybean trade (A8 p. 134: $1,000 capital, triple bottom at 69–70¢, stops raised under each higher bottom) as a scatter chart.
- **Ch. 8.**
  - "Looking to the left": tabulate a market's historical highs and lows by calendar month (Google example). **Recurrent-event data with n≈22 over 8 years; no base rate.** Treat it as an illustration, not evidence (Dewey C05).
  - Reading-style notes: Gann's capitals flag priority; Reddy reads the "45" in *45 Years* as ⅛ of 360°/365 days (Reddy's speculation).
- **Appendix A:** the 28 rules. **Appendix C:** the 9 buying and 9 selling points (both are Gann's text via A8).

## Additions to GSPS relevance (from the full read)
- **Break-even stop rule (Gann Rule 4).** Check `lib/lifecycle/` exits for a move-to-breakeven once open profit ≥ initial risk. The A09 notes already flagged this check.
- **Loss-streak sizing (Rule 27; A8 p. 29).** Reinforces G16: resize from *remaining* capital after 3 consecutive losses.
- **Final-stage trailing stop (BP/SP #9).** Reinforces G18. The exact Gann form is 1–2¢ beyond the previous day's extreme. Reddy's 2-bar variant is not Gann's.

## GSPS relevance
- **Confirms that Gann's time- and price-overbalance rules are primary, disclosed buying/selling points (A8 #3–#6).** Reddy ranks the time rules first. GSPS implements neither (see A2.1, A08, A09 notes: the over-balance gap).
- **BP/SP #9** (a 2-day counter-move, then trail the stop under/over the prior day's extreme in final fast stages) is a literal Gann exit/trailing rule. Candidate for `lib/lifecycle/` trailing logic in "boiling" conditions (`boilingPoint.ts`). Owner decision.
- **Eighths projections beyond B or from C are *not* Gann-attributed.** Don't treat them as Gann-sourced levels.
- Reddy also uses RSI, Fibonacci and moving averages (author bio). **Those are not Gann** and carry no weight here.

## Three-question notes
1. Tier B; cite only for the A8 quotes (and cite A8).
2. Dewey: anecdotal chart examples; no repetition counts or tests.
3. Hermetic: **Correspondence** (the same structures on every timeframe), **Polarity** (paired buying and selling points).
