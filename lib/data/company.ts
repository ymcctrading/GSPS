/**
 * Company/fundamentals snapshot — analyst coverage, short interest,
 * institutional ownership, capital flow, margin terms.
 *
 * Analyst rating and price target are real when `FINNHUB_API_KEY` is set
 * (see lib/data/finnhub.ts) — everything else has no vendor wired up, so it
 * follows the seam the options chain and Level II book use: a deterministic,
 * seeded generator anchored on the real price, so the same symbol always
 * produces the same numbers. `CompanySnapshot.sources` tells the UI which
 * sections are real per request, and it can differ per section on the same
 * response — the point is the *shape* (what a company tab needs to say) and
 * the synthesis in components/chart/company-panel.tsx that reads GSPS's own
 * structural score alongside this fundamental/flow read.
 */

import { sectorForSymbol } from "@/lib/sectors";

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CompanyProfile {
  name: string;
  sector: string;
  industry: string;
  marketCapM: number; // millions USD
  exchange?: string;
  description: string;
}

export interface AnalystRating {
  totalAnalysts: number;
  strongBuyPct: number;
  buyPct: number;
  holdPct: number;
  underperformPct: number;
  sellPct: number;
  consensus: "Strong Buy" | "Buy" | "Hold" | "Underperform" | "Sell";
  /** A 0–1 read of how bullish the panel is, for blending into the conviction verdict. */
  bullishness: number;
}

export interface PriceTarget {
  avg: number;
  high: number;
  low: number;
  upsidePct: number;
}

export interface ShortInterestPoint {
  date: string;
  shortInterestShares: number;
  daysToCover: number;
}

export interface InstitutionalOwnership {
  institutions: number;
  sharesOwned: number;
  heldPercent: number;
  buyPercent: number;
  sellPercent: number;
}

export interface CapitalFlow {
  inflowM: number;
  outflowM: number;
  large: { inM: number; outM: number };
  medium: { inM: number; outM: number };
  small: { inM: number; outM: number };
}

export interface MarginTerms {
  marginRatePct: number;
  maxLongLeverage: number;
  shortLoanRatePct: number;
  maxShortLeverage: number;
}

/** Per-section provenance, so the UI can label real vs. simulated independently. */
export interface CompanySnapshotSources {
  analystRating: "finnhub" | "simulated";
  priceTarget: "finnhub" | "simulated";
  profile: "finnhub" | "simulated";
}

export interface CompanySnapshot {
  symbol: string;
  /** True only when every section is simulated — kept for the blanket disclaimer. */
  simulated: boolean;
  sources: CompanySnapshotSources;
  profile: CompanyProfile;
  price: number;
  margin: MarginTerms;
  analystRating: AnalystRating;
  priceTarget: PriceTarget;
  shortInterest: ShortInterestPoint[]; // last 12 biweekly settlements, oldest first
  institutionalOwnership: InstitutionalOwnership;
  capitalFlow: CapitalFlow;
  impliedVolatilityPct: number;
  ivPercentile: number;
  historicalVolatilityPct: number;
  hvPercentile: number;
}

const CONSENSUS_BANDS: { min: number; label: AnalystRating["consensus"] }[] = [
  { min: 0.8, label: "Strong Buy" },
  { min: 0.6, label: "Buy" },
  { min: 0.4, label: "Hold" },
  { min: 0.2, label: "Underperform" },
  { min: 0, label: "Sell" },
];

/** Shared by the simulated generator and the real Finnhub mapping (lib/data/finnhub.ts). */
export function consensusFromBullishness(bullishness: number): AnalystRating["consensus"] {
  return CONSENSUS_BANDS.find((b) => bullishness >= b.min)?.label ?? "Sell";
}

export function simulateCompanySnapshot(symbol: string, price: number): CompanySnapshot {
  const up = symbol.toUpperCase();
  const rnd = mulberry32(hashStr(`${up}|company`));

  // Profile: sector from the curated watchlists when the symbol appears in
  // one, otherwise a generic label — market cap seeded off price so it's at
  // least in the right ballpark rather than pure noise.
  const sector = sectorForSymbol(up) ?? "Diversified";
  const shareOutstandingM = 50 + rnd() * 4950; // 50M–5B shares, seeded
  const profile: CompanyProfile = {
    name: up,
    sector,
    industry: sector,
    marketCapM: round2(price * shareOutstandingM),
    description: `${up} is a publicly traded company. Sector and industry detail is simulated — set FINNHUB_API_KEY to bring in real company profile data.`,
  };

  // Margin/shortable rates cluster around a broker-typical 8–11%, nudged by a
  // per-symbol offset so they aren't identical across the board.
  const baseRate = 8 + rnd() * 3;
  const margin: MarginTerms = {
    marginRatePct: round2(baseRate),
    maxLongLeverage: 4,
    shortLoanRatePct: round2(baseRate + (rnd() - 0.5) * 0.5),
    maxShortLeverage: 3.33,
  };

  // Analyst panel: skew mildly bullish (matches the real-world base rate for
  // sell-side coverage) with a seeded spread of how bullish.
  const totalAnalysts = 8 + Math.round(rnd() * 32);
  const bullishness = 0.35 + rnd() * 0.6; // 0.35–0.95
  const strongBuyPct = Math.round(bullishness * 90);
  const buyPct = Math.round((1 - bullishness) * 40 * rnd());
  const remainder = Math.max(0, 100 - strongBuyPct - buyPct);
  const holdPct = Math.round(remainder * 0.6);
  const underperformPct = Math.round(remainder * 0.3);
  const sellPct = Math.max(0, 100 - strongBuyPct - buyPct - holdPct - underperformPct);
  const consensus = consensusFromBullishness(bullishness);

  const upsidePct = round2((bullishness - 0.4) * 45 + (rnd() - 0.5) * 8);
  const avg = round2(price * (1 + upsidePct / 100));
  const priceTarget: PriceTarget = {
    avg,
    high: round2(avg * (1.15 + rnd() * 0.15)),
    low: round2(avg * (0.6 + rnd() * 0.15)),
    upsidePct,
  };

  // Short interest: 24 biweekly points, mean-reverting around a per-symbol
  // baseline float percentage so the trend looks like a real series rather
  // than pure noise.
  const shortBase = 3_000_000 + (hashStr(`${up}|si`) % 6_000_000);
  let si = shortBase;
  const shortInterest: ShortInterestPoint[] = [];
  const now = Date.now();
  for (let i = 23; i >= 0; i--) {
    si = si * (0.85 + rnd() * 0.3);
    si = si * 0.3 + shortBase * 0.7; // pull back toward baseline
    const daysToCover = round2(1 + rnd() * 6.5);
    shortInterest.push({
      date: new Date(now - i * 14 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      shortInterestShares: Math.round(si),
      daysToCover,
    });
  }

  const institutions = 200 + Math.round(rnd() * 2000);
  const heldPercent = round2(35 + rnd() * 60);
  const buyPercent = round2(40 + bullishness * 40);
  const institutionalOwnership: InstitutionalOwnership = {
    institutions,
    sharesOwned: Math.round((heldPercent / 100) * (5e7 + rnd() * 5e8)),
    heldPercent,
    buyPercent,
    sellPercent: round2(100 - buyPercent),
  };

  const inflowM = round2(5 + rnd() * 60);
  const outflowM = round2(inflowM * (0.7 + rnd() * 0.5));
  const split = () => {
    const a = 0.2 + rnd() * 0.4;
    const b = 0.3 + rnd() * 0.3;
    const c = Math.max(0.05, 1 - a - b);
    return [a, b, c];
  };
  const [li, mi, si_] = split();
  const [lo, mo, so] = split();
  const capitalFlow: CapitalFlow = {
    inflowM,
    outflowM,
    large: { inM: round2(inflowM * li), outM: round2(outflowM * lo) },
    medium: { inM: round2(inflowM * mi), outM: round2(outflowM * mo) },
    small: { inM: round2(inflowM * si_), outM: round2(outflowM * so) },
  };

  const hv = round2(20 + rnd() * 40);
  const iv = round2(hv * (0.75 + rnd() * 0.4));

  return {
    symbol: up,
    simulated: true,
    sources: { analystRating: "simulated", priceTarget: "simulated", profile: "simulated" },
    profile,
    price,
    margin,
    analystRating: {
      totalAnalysts,
      strongBuyPct,
      buyPct,
      holdPct,
      underperformPct,
      sellPct,
      consensus,
      bullishness: round2(bullishness),
    },
    priceTarget,
    shortInterest,
    institutionalOwnership,
    capitalFlow,
    impliedVolatilityPct: iv,
    ivPercentile: Math.round(rnd() * 100),
    historicalVolatilityPct: hv,
    hvPercentile: Math.round(rnd() * 100),
  };
}
