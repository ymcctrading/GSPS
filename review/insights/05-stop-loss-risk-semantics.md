# Correction 05 — Stop-Loss / Risk Semantics

**Type:** Correction / Clarification needed
**Priority:** HIGH (a wrong reading here mis-sizes real-money risk)

## Problem
The docs give stop-loss numbers that look contradictory:
- *Ideally (GSPS)*: "keep stop losses between **12 and 18%** of the price paid."
- *GSPS v1.5.1*: stock stop = opposite side of the trigger candle **or a fixed
  2.0%** (SSS50% variant), or **1.5%–5.0%** for Gann breakout variants. Options
  stop = convert the underlying stop into an equivalent **premium-decay** threshold.

A naive reader could apply a 12–18% stop to a stock position, which is far too
wide and would blow the 2:1 / 3:1 reward math.

## The likely correct reading
These numbers describe **two different instruments**:
- **12–18%** = risk on the **option premium** (options routinely swing 12–18%;
  that's a normal premium stop). This matches *Ideally*'s "price paid," i.e. the
  contract cost.
- **2% / 1.5–5%** = risk on the **underlying** stock/asset price.

So the engine should compute the underlying stop first (candle-based or
1.5–5%), then translate it into the equivalent premium stop (which lands around
12–18%) for the options position — exactly the "convert underlying stop into an
option-premium loss threshold" rule in v1.5.1.

## Why it matters
If the two are conflated, the automated stop logic will either exit far too late
(applying 12–18% to the underlying) or far too early (applying 2% to the premium).
Take-profit targets are consistent everywhere (**TP1 = 2:1, master = 3:1**), so
only the stop needs this disambiguation.

## Action
- [ ] Confirm: 12–18% = option premium risk; 2%/1.5–5% = underlying risk.
- [ ] Encode the underlying→premium stop translation as a single documented
      function so the two are never mixed.
