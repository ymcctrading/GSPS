/**
 * sandbox/scanEngine.mjs — SIMULATION ONLY
 * ----------------------------------------
 * A MOCK stand-in for the missing `@/lib/scanTicker` engine.
 *
 *  - `scanTicker(ticker, optionPremium?)` returns a DETERMINISTIC, SYNTHETIC
 *    ScanResult derived from a hash of the ticker string. It is NOT real market
 *    data and NOT the real Gann/Sniper protocol logic.
 *  - `selectReversions(results)` implements the spec'd selection waterfall
 *    (Strat Sniper Gate -> Tier 1 8-9/9 -> Tier 2 7/9 velocity fallback ->
 *    sort -> top 15), returning { bullishReversions, bearishReversions }.
 *
 * Purpose: prove the API/selection pipeline runs end to end. Replace with the
 * real engine and delete this file.
 */

// --- deterministic PRNG so every run is reproducible ---------------------
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round = (n, d = 2) => Number(n.toFixed(d));

// --- asset-class dispatch (see review/insights/09) -----------------------
function assetClassOf(ticker) {
  const crypto = new Set(["BTC", "ETH", "SOL", "BTC-USD", "ETH-USD"]);
  if (crypto.has(ticker)) return "CRYPTO";
  if (ticker.startsWith("/")) return "FUTURE";
  return "STOCK";
}

/**
 * MOCK scan. Produces a synthetic 0-9 score and full trade coordinates.
 * Deterministic per ticker so the test scan is reproducible.
 */
export function scanTicker(ticker, optionPremium) {
  const rng = mulberry32(hashString(ticker));
  const assetClass = assetClassOf(ticker);

  const basePrice = assetClass === "CRYPTO"
    ? round(20000 + rng() * 80000)          // crypto: big numbers
    : round(20 + rng() * 900);              // equities/ETF

  const score = Math.floor(rng() * 10);      // 0..9
  const passedSniperGate = rng() > 0.15;     // ~85% pass the structural gate
  const direction = rng() > 0.5 ? "bullish" : "bearish";
  const rvol = round(0.4 + rng() * 2.8);     // 0.4 .. 3.2
  const atrExpanding = rng() > 0.6;

  // Underlying risk = 2% stop (SSS50% variant); TP1 2:1, master 3:1.
  const stopPct = 0.02;
  const dir = direction === "bullish" ? 1 : -1;
  const entry = basePrice;
  const sl = round(entry * (1 - dir * stopPct));
  const risk = Math.abs(entry - sl);
  const tp1 = round(entry + dir * risk * 2);
  const master = round(entry + dir * risk * 3);

  // Option-premium stop (~12-18% of premium) if a premium was supplied.
  const premiumStop = optionPremium != null
    ? round(optionPremium * (1 - 0.15))
    : undefined;

  // Decision buckets: Execute (>=8 & gate), Watch (6-7 & gate), else Reject.
  let outputState = "Reject";
  if (passedSniperGate && score >= 8) outputState = "Execute";
  else if (passedSniperGate && score >= 6) outputState = "Watch";

  return {
    ticker,
    assetClass,
    score,
    passedSniperGate,
    direction,
    rvol,
    atrExpanding,
    decision: { outputState },
    entry,
    sl,
    tp1,
    master,
    ...(premiumStop != null ? { premiumStop } : {}),
    _simulated: true,
  };
}

/**
 * The selection waterfall from review/insights/04.
 * Input: raw ScanResult[]. Output: two top-15 blocks.
 */
export function selectReversions(results) {
  // 1. Strat Sniper Gate — discard anything that fails the structural check.
  const gated = results.filter((r) => r.passedSniperGate);

  // 2. Tier 1 (Pristine): score 8/9 or 9/9.
  const tier1 = gated.filter((r) => r.score >= 8);

  // 3. Tier 2 (Velocity fallback): only if fewer than 15 in Tier 1, admit
  //    exactly-7/9 setups that show high volatility (RVOL >= 2.0 or ATR exp.).
  let pool = tier1;
  if (tier1.length < 15) {
    const tier2 = gated.filter(
      (r) => r.score === 7 && (r.rvol >= 2.0 || r.atrExpanding),
    );
    pool = [...tier1, ...tier2];
  }

  // 4. Sort by score desc, RVOL as tiebreaker.
  const sorted = [...pool].sort(
    (a, b) => b.score - a.score || b.rvol - a.rvol,
  );

  const bullishReversions = sorted
    .filter((r) => r.direction === "bullish")
    .slice(0, 15);
  const bearishReversions = sorted
    .filter((r) => r.direction === "bearish")
    .slice(0, 15);

  return { bullishReversions, bearishReversions };
}
