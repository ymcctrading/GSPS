// Learning Brain types for audit-ready ML layer

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '2h' | '4h' | '1d' | '1w' | '1mo' | '1y';
export type AssetClass = 'us_equity' | 'option' | 'crypto' | 'forex' | 'futures' | 'commodities';
export type SignalState = 'armed' | 'active' | 'confirmed' | 'expired' | 'invalidated';
export type Bias = 'bull' | 'bear' | 'neutral';
export type Tier = 'Passive' | 'Modest' | 'Aggressive';
export type GannRoot = 3 | 6 | 9;

export interface ScanEvent {
  id?: string;
  user_id: string;
  scan_id: string;
  timestamp: Date;
  timeframe: Timeframe;
  extended_hours_flag: boolean;
  symbol: string;
  asset_class: AssetClass;
  price: number;
  score: number;
  signal_type: 'bullish' | 'bearish' | 'none';
  gann_root?: GannRoot;
  entry_level?: number;
  stop_loss_level?: number;
  take_profit_1_level?: number;
  master_profit_level?: number;
  bias: Bias;
  ohlcv: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  higher_tf_context: Array<{
    timeframe: Timeframe;
    bias: Bias;
    score: number;
  }>;
  detail: Record<string, unknown>;
}

export interface SignalLifecycleEvent {
  id?: string;
  user_id: string;
  signal_id: string;
  scan_event_id?: string;
  state: SignalState;
  state_transition_reason?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface ExecutionEvent {
  id?: string;
  user_id: string;
  order_id?: string;
  signal_id?: string;
  broker: 'alpaca_paper' | 'alpaca_live' | 'snaptrade';
  symbol: string;
  asset_class: AssetClass;
  order_type: 'market' | 'limit' | 'stop' | 'bracket';
  side: 'buy' | 'sell';
  quantity: number;
  requested_price?: number;
  filled_price?: number;
  filled_qty?: number;
  partial_fill: boolean;
  slippage?: number;
  broker_status: 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected' | 'error';
  broker_error_code?: string;
  broker_error_msg?: string;
  order_idempotency_key?: string;
  retry_count: number;
  timestamp: Date;
  latency_ms?: number;
}

export interface UserAction {
  id?: string;
  user_id: string;
  signal_id: string;
  scan_event_id?: string;
  action: 'accept' | 'ignore' | 'defer' | 'override';
  tier: Tier;
  risk_qty?: number;
  risk_stop_pct?: number;
  risk_r_multiple?: number;
  override_entry?: number;
  override_stop?: number;
  override_tp1?: number;
  override_master?: number;
  journal_tags: string[];
  journal_notes?: string;
  timestamp: Date;
}

export interface LearningModel {
  id: string;
  version: number;
  model_type: 'score_adjustment' | 'target_envelope' | 'entry_confidence';
  training_data_slice: string;
  sample_count: number;
  training_metrics: Record<string, number>;
  coefficients: Record<string, unknown>;
  constraints: Record<string, unknown>;
  created_at: Date;
  created_by?: string;
  change_reason?: string;
  approved_at?: Date;
  approved_by?: string;
  status: 'draft' | 'approved' | 'live' | 'deprecated';
  deprecated_at?: Date;
}

export interface LearningCoefficient {
  id: string;
  model_id: string;
  /**
   * A coefficient row scopes itself to one timeframe / instrument class /
   * tier, or to `'all'` as a wildcard. The wildcard was already the intent —
   * matchCoefficients and the specificity weighting in inference.ts both test
   * for it — but the types omitted it, so those comparisons narrowed to `never`
   * and every wildcard row silently failed to match.
   */
  timeframe?: Timeframe | 'all';
  instrument_class?: AssetClass | 'all';
  gann_root?: GannRoot;
  tier?: Tier | 'all';
  score_drift?: number;
  target_envelope_widen_factor?: number;
  entry_confidence_boost?: number;
  sample_count: number;
  last_updated: Date;
}

export interface OutcomeLabel {
  trade_id: string;
  target: 'R_multiple_achieved' | 'hit_TP1' | 'hit_MTP' | 'hit_SL' | 'time_decay_failure' | 'partial_fill';
  value: number; // 0 or 1 for classification, or continuous value
  confidence: number;
}

export interface ModelFeatures {
  timeframe: Timeframe;
  instrument_class: AssetClass;
  gann_root?: GannRoot;
  distance_to_3?: number;
  distance_to_6?: number;
  distance_to_9?: number;
  extended_hours_gap_pct?: number;
  higher_tf_conflict_flag: boolean;
  validity_bar_countdown: number;
  bias_alignment: number; // -1 (conflict), 0 (neutral), 1 (aligned)
  tier: Tier;
  base_score: number;
  extended_hours_flag: boolean;
  market_volatility?: number;
}
