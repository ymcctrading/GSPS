# Change 04 — Scoring Waterfall & Payload Shape

**Type:** Change (design — needs the engine to implement)
**Priority:** HIGH (core product logic missing from the API)

## Problem
The *Convo w/Gemini* architecture log defines a precise selection waterfall, but
`batch-route.ts` implements none of it. The route just runs every ticker and
buckets raw results into `execute / watch / reject` by `decision.outputState`.

## The spec'd waterfall (from the Gemini doc)
1. **Strat Sniper Gate** — every symbol must pass the Strat sniper/snapper
   structural check, or it's discarded immediately.
2. **Tier 1 (Pristine):** keep setups scoring **8/9 or 9/9** on the rule checklist.
3. **Tier 2 (Velocity fallback):** if fewer than 15 assets clear Tier 1, admit
   setups scoring **exactly 7/9** — but only if they show high volatility
   (Relative Volume ≥ 2.0 or active ATR expansion).
4. **Payload:** sort by score descending (RVOL as tiebreaker), truncate to the
   **top 15**, and return them as `bullishReversions` and `bearishReversions`
   dashboard blocks.

## Gap
| Spec requirement | In `batch-route.ts`? |
|------------------|----------------------|
| Strat Sniper Gate | ❌ |
| 8/9–9/9 Tier 1 filter | ❌ |
| 7/9 + RVOL≥2.0 Tier 2 fallback | ❌ |
| Sort by score, RVOL tiebreak | ❌ |
| Truncate to top 15 | ❌ |
| `bullishReversions` / `bearishReversions` output | ❌ (returns `execute/watch/reject`) |

## What the result object must expose
For any of this to work, `scanTicker` must return at least:
```ts
type ScanResult = {
  ticker: string;
  score: number;              // 0–9
  passedSniperGate: boolean;
  direction: "bullish" | "bearish";
  rvol: number;               // relative volume
  atrExpanding: boolean;
  decision: { outputState: "Execute" | "Watch" | "Reject" };
  entry: number; sl: number; tp1: number; master: number;
};
```
(The current engine is missing — see Insight 06 — so this contract is inferred.)

## Recommendation
Implement the waterfall as a pure function that takes `ScanResult[]` and returns
the two top-15 blocks. I've prototyped exactly this in
`sandbox/scanEngine.mjs` (`selectReversions()`), used by the test scan, so the
logic is proven even though the real engine isn't wired yet.

## Action
- [ ] Confirm the score is 0–9 and the gate/tier thresholds above are correct.
- [ ] Implement `selectReversions()` in the real batch route once the engine exists.
- [ ] Change the payload from `execute/watch/reject` to
      `bullishReversions/bearishReversions` (top 15 each).
