// Feature engineering for learning model training
import type { ScanEvent, ModelFeatures, Timeframe, Tier } from './types';

// Timeframe ordering for multi-TF analysis
const TIMEFRAME_HIERARCHY: Timeframe[] = ['1m', '5m', '15m', '1h', '2h', '4h', '1d', '1w', '1mo', '1y'];

export function getTimeframeIndex(tf: Timeframe): number {
  return TIMEFRAME_HIERARCHY.indexOf(tf);
}

export function getHigherTimeframes(tf: Timeframe): Timeframe[] {
  const idx = getTimeframeIndex(tf);
  return TIMEFRAME_HIERARCHY.slice(idx + 1);
}

// Distance to Gann root nodes (3, 6, 9)
export function distanceToGannRoot(price: number, root: number): number {
  // Gann believed in harmonic relationships at 3, 6, 9 ratios
  // Simplified: calculate deviation as percentage from nearest node
  const nodes = [3, 6, 9];
  let minDistance = Infinity;

  for (const node of nodes) {
    const nodePrice = price * (node / 9);
    const distance = Math.abs(price - nodePrice) / price;
    minDistance = Math.min(minDistance, distance);
  }

  return minDistance;
}

// Extended-hours gap analysis
export function calculateExtendedHoursGap(
  rtPrice: number,
  ehOpenPrice: number,
  previousClose: number
): number {
  if (previousClose === 0) return 0;
  const gap = (ehOpenPrice - previousClose) / previousClose;
  const gapmagnitude = Math.abs(gap);
  return gapmagnitude;
}

// Bias alignment: does signal align with higher-TF trend?
export function calculateBiasAlignment(
  signalBias: 'bull' | 'bear' | 'neutral',
  higherTfBias: 'bull' | 'bear' | 'neutral'
): number {
  if (signalBias === 'neutral' || higherTfBias === 'neutral') return 0;
  if (signalBias === higherTfBias) return 1; // aligned
  return -1; // conflict
}

// Validity bar countdown: how many bars remain before signal expires?
export function calculateValidityCountdown(
  originTimeframe: Timeframe,
  ageMs: number
): number {
  const TIMEFRAME_MS: Record<Timeframe, number> = {
    '1m': 60_000,
    '5m': 300_000,
    '15m': 900_000,
    '1h': 3_600_000,
    '2h': 7_200_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
    '1w': 604_800_000,
    '1mo': 2_592_000_000, // 30 days
    '1y': 31_536_000_000, // 365 days
  };

  const tfDuration = TIMEFRAME_MS[originTimeframe];
  const barsElapsed = Math.floor(ageMs / tfDuration);
  // Signal valid for 2–3 bars by default (conservative)
  return Math.max(0, 3 - barsElapsed);
}

// Higher-TF conflict detection
export function detectHigherTfConflict(
  originScore: number,
  higherTfContext: Array<{ timeframe: Timeframe; bias: 'bull' | 'bear' | 'neutral'; score?: number }>
): boolean {
  // Entries without a score cannot answer this question. Treating a missing
  // score as zero would report a conflict on every scan from a producer that
  // does not score each timeframe — a fabricated feature, and a confident one.
  const scored = higherTfContext.filter(
    (ctx): ctx is { timeframe: Timeframe; bias: 'bull' | 'bear' | 'neutral'; score: number } =>
      typeof ctx.score === 'number',
  );
  if (scored.length === 0) return false;

  // Conflict = origin score high but higher-TF score low, or vice versa
  const avgHigherScore = scored.reduce((sum, ctx) => sum + ctx.score, 0) / scored.length;
  const scoreGap = Math.abs(originScore - avgHigherScore);
  const conflictThreshold = 3; // 3+ point gap = conflict

  return scoreGap >= conflictThreshold;
}

export function engineerFeatures(
  event: ScanEvent,
  tier: Tier,
  ageMs: number
): ModelFeatures {
  const { timeframe, gann_root, bias, score, higher_tf_context, extended_hours_flag, price, ohlcv } = event;

  // Bias alignment with highest higher-TF signal
  let biasAlignment = 0;
  if (higher_tf_context.length > 0) {
    const maxHigherTf = higher_tf_context[0];
    biasAlignment = calculateBiasAlignment(bias, maxHigherTf.bias);
  }

  // Validity countdown
  const validityCountdown = calculateValidityCountdown(timeframe, ageMs);

  // Distance to Gann roots (if applicable)
  const distanceTo3 = gann_root ? distanceToGannRoot(price, 3) : undefined;
  const distanceTo6 = gann_root ? distanceToGannRoot(price, 6) : undefined;
  const distanceTo9 = gann_root ? distanceToGannRoot(price, 9) : undefined;

  // Extended-hours gap
  let extendedHoursGapPct: number | undefined;
  if (extended_hours_flag && ohlcv.close) {
    extendedHoursGapPct = calculateExtendedHoursGap(price, ohlcv.open, ohlcv.close);
  }

  // Higher-TF conflict
  const higherTfConflict = detectHigherTfConflict(score, higher_tf_context);

  // Market volatility (simplified: high/low range as % of close)
  const marketVolatility = ((ohlcv.high - ohlcv.low) / ohlcv.close) * 100;

  return {
    timeframe,
    instrument_class: event.asset_class,
    gann_root,
    distance_to_3: distanceTo3,
    distance_to_6: distanceTo6,
    distance_to_9: distanceTo9,
    extended_hours_gap_pct: extendedHoursGapPct,
    higher_tf_conflict_flag: higherTfConflict,
    validity_bar_countdown: validityCountdown,
    bias_alignment: biasAlignment,
    tier,
    base_score: score,
    extended_hours_flag,
    market_volatility: marketVolatility,
  };
}

// Labeling function: generates target labels from trade outcomes
export function generateOutcomeLabel(
  executionPrice: number,
  entryPrice: number,
  stopLoss: number,
  takeProfit1: number,
  masterProfit: number,
  currentPrice: number,
  timeElapsedMs: number,
  exitCondition?: 'tp1' | 'mtp' | 'sl' | 'manual' | 'pending'
): { target: string; value: number; confidence: number } {
  const pnlDollars = (currentPrice - entryPrice) * 100; // assume 100 shares
  const rMultiple = entryPrice !== 0 ? pnlDollars / Math.abs(entryPrice - stopLoss) : 0;

  // Predefined labels
  if (exitCondition === 'tp1') {
    return {
      target: 'hit_TP1',
      value: 1,
      confidence: 1.0,
    };
  }

  if (exitCondition === 'mtp') {
    return {
      target: 'hit_MTP',
      value: 1,
      confidence: 1.0,
    };
  }

  if (exitCondition === 'sl') {
    return {
      target: 'hit_SL',
      value: 1,
      confidence: 1.0,
    };
  }

  if (exitCondition === 'pending') {
    // For pending trades, soft-label based on current progress
    if (currentPrice >= takeProfit1) {
      return {
        target: 'R_multiple_achieved',
        value: rMultiple,
        confidence: 0.5, // lower confidence since trade still open
      };
    }

    if (currentPrice <= stopLoss) {
      return {
        target: 'hit_SL',
        value: 1,
        confidence: 0.5,
      };
    }

    // Time decay: if holding >2x the timeframe, penalize
    const EXPECTED_HOLD_MS = 3_600_000; // 1 hour baseline
    if (timeElapsedMs > EXPECTED_HOLD_MS * 2) {
      return {
        target: 'time_decay_failure',
        value: 1,
        confidence: 0.3,
      };
    }
  }

  // Default: R-multiple achieved
  return {
    target: 'R_multiple_achieved',
    value: Math.max(0, rMultiple),
    confidence: 0.7,
  };
}
