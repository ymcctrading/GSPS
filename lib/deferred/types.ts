// §11: Deferred feature interfaces (Phase 2+)
// These are architectural hooks defined for future implementation.
// DO NOT implement these features yet — focus on core scanner, execution, learning.

// ============ MARKET NEWS (Deferred) ============
// Real-time news headlines, sentiment scoring, news-driven alerts
// Rationale: Adds significant data-integration complexity and latency;
// not required for core Gann/Sara signal logic.
// Implementation timeline: Post-MVP, after core scanner is stable and audited.

export interface NewsFeed {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  published_at: Date;
  sentiment_score?: number; // -1 to 1: negative to positive
  relevance_score?: number; // 0 to 1: how relevant to this symbol
  url?: string;
  category?: 'earnings' | 'regulatory' | 'product' | 'market' | 'macro';
}

export interface NewsAlert {
  id: string;
  user_id: string;
  symbol: string;
  trigger_type: 'high_impact' | 'sentiment_shift' | 'earnings_related';
  enabled: boolean;
  created_at: Date;
}

// Placeholder data provider interface
export interface NewsProvider {
  fetchNews(symbol: string, limit?: number): Promise<NewsFeed[]>;
  streamNews(symbol: string, callback: (news: NewsFeed) => void): () => void;
  getSentiment(symbol: string): Promise<number>;
}

// ============ EARNINGS CALENDAR (Deferred) ============
// Earnings dates, EPS estimates, surprises, guidance
// Rationale: Valuable for fundamental filters, but orthogonal to current
// price-action/Gann geometry focus.
// Implementation timeline: Phase 2, after core execution loop is stable.
// Hook: Store `earnings_date` and `earnings_proximity_flag` in instrument metadata.

export interface EarningsEvent {
  symbol: string;
  report_date: Date;
  fiscal_period: string; // Q1 2024, etc.
  eps_estimate?: number;
  eps_actual?: number;
  eps_surprise?: number; // percentage
  revenue_estimate?: number;
  revenue_actual?: number;
  guidance?: string;
  market_cap?: number;
  exchange?: string;
}

export interface InstrumentMetadata {
  symbol: string;
  name: string;
  exchange: string;
  asset_class: string;
  sector?: string;
  industry?: string;
  // Deferred fields (reserved for future use)
  earnings_date?: Date;
  earnings_proximity_flag?: 'approaching' | 'post' | 'clear'; // avoid entries near earnings
  dividend_yield?: number;
  beta?: number;
  market_cap?: number;
  shares_outstanding?: number;
  pe_ratio?: number;
  // ... more fields as needed
}

export interface EarningsRiskFilter {
  enabled: boolean;
  avoid_days_before: number; // e.g., don't enter within 3 days of earnings
  avoid_days_after: number; // e.g., don't enter within 1 day after
  allow_on_earnings_day: boolean;
}

// ============ MACRO FEATURES (Deferred) ============
// Economic calendar (CPI, FOMC, jobs), rates, yield curves, macro regime indicators
// Rationale: Macro regime modeling is a separate layer; current priority is micro
// (instrument-level) Gann/Sara execution.
// Implementation timeline: Phase 3, after core learning loop validated on single-symbol basis.
// Hook: Add `macro_regime` field to scan context for later model conditioning.

export interface MacroEvent {
  id: string;
  event_name: string; // "CPI", "FOMC", "Non-Farm Payroll", etc.
  country: string; // "US", "EU", etc.
  scheduled_at: Date;
  impact: 'low' | 'medium' | 'high'; // market impact
  forecast?: number;
  previous?: number;
  actual?: number;
  calendar_url?: string;
}

export interface MacroRegime {
  regime: 'risk_on' | 'risk_off' | 'neutral' | 'high_vol' | 'low_vol';
  confidence: number; // 0 to 1
  primary_indicator: string; // e.g., "VIX > 25"
  secondary_indicators: string[];
  last_updated: Date;
}

export interface YieldCurve {
  timestamp: Date;
  rates: Record<string, number>; // tenor (1M, 3M, 6M, 1Y, 2Y, etc.) -> rate
  slope: number; // 10Y - 2Y, can be negative (inverted)
  is_inverted: boolean;
}

export interface ScanContextWithMacro {
  symbol: string;
  timeframe: string;
  price: number;
  // ... standard scan fields ...
  macro_regime?: MacroRegime; // deferred: add for model conditioning
  upcoming_macro_events?: MacroEvent[];
  yield_curve?: YieldCurve;
  vix?: number; // volatility index
}

// ============ DEFERRED ROADMAP METADATA ============
// Used to mark features as intentionally deferred, with clear implementation criteria.

export interface DeferredFeature {
  id: string;
  name: string;
  description: string;
  reason_deferred: string;
  target_phase: 'Phase 2' | 'Phase 3' | 'Phase 4' | 'Post-MVP';
  implementation_criteria: string[]; // conditions that must be met before implementing
  estimated_complexity: 'low' | 'medium' | 'high'; // implementation effort
  architect_notes?: string;
  related_docs?: string[]; // links to relevant design docs
}

// Deferred features registry (for documentation/transparency)
export const DEFERRED_FEATURES: DeferredFeature[] = [
  {
    id: 'market_news',
    name: 'Market News Integration',
    description: 'Real-time news headlines, sentiment scoring, news-driven alerts',
    reason_deferred:
      'Adds significant data-integration complexity and latency; not required for core Gann/Sara signal logic',
    target_phase: 'Phase 2',
    implementation_criteria: [
      'Core scanner + execution loop stable and audited',
      'Learning brain validated with 6+ months of trade data',
      'News provider API selected and rate limits understood',
    ],
    estimated_complexity: 'high',
    architect_notes:
      'Use provider like NewsAPI or Finnhub. Integrate via streaming API for real-time delivery. Add sentiment scoring layer.',
  },
  {
    id: 'earnings_calendar',
    name: 'Earnings Calendar & Risk Filtering',
    description: 'Earnings dates, EPS estimates, surprises, guidance; avoid entries near earnings',
    reason_deferred:
      'Valuable for fundamental filters, but orthogonal to current price-action/Gann geometry focus',
    target_phase: 'Phase 2',
    implementation_criteria: [
      'Instrument metadata schema finalized',
      'Risk filter framework implemented in order validation layer',
      'Earnings data provider selected (EDGAR, Bloomberg, IEX Cloud, etc.)',
    ],
    estimated_complexity: 'medium',
    architect_notes:
      'Start with earnings_date and earnings_proximity_flag in instrument metadata. Use via order pre-check to block/warn on entries near earnings.',
  },
  {
    id: 'macro_features',
    name: 'Macro Regime Indicators & Economic Calendar',
    description:
      'Economic calendar (CPI, FOMC, jobs), rates, yield curves, macro regime indicators',
    reason_deferred:
      'Macro regime modeling is a separate layer; current priority is micro (instrument-level) Gann/Sara execution',
    target_phase: 'Phase 3',
    implementation_criteria: [
      'Core learning brain working well on per-symbol basis',
      'Macro regime classification algorithm designed and tested',
      'Economic calendar data provider integrated',
      'Multi-scale learning model ready to accept macro features',
    ],
    estimated_complexity: 'high',
    architect_notes:
      'Add macro_regime to ScanContextWithMacro. Condition learning model on (micro_features, macro_regime) tuples. Use regime shifts to adjust scoring envelopes.',
  },
];
