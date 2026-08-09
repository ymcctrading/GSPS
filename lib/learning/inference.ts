// Model inference: apply learned adjustment factors to scanner output
import type { LearningCoefficient, ModelFeatures } from './types';

export interface AdjustmentFactors {
  score_drift: number;
  target_envelope_widen_factor: number;
  entry_confidence_boost: number;
  applied_coefficients: number;
}

// Match coefficients to feature context (timeframe, instrument, gann root, tier)
function matchCoefficients(
  coefficients: LearningCoefficient[],
  features: ModelFeatures
): LearningCoefficient[] {
  return coefficients.filter((coeff) => {
    const timeframeMatch = !coeff.timeframe || coeff.timeframe === 'all' || coeff.timeframe === features.timeframe;
    const classMatch =
      !coeff.instrument_class ||
      coeff.instrument_class === 'all' ||
      coeff.instrument_class === features.instrument_class;
    const rootMatch =
      !coeff.gann_root || coeff.gann_root === features.gann_root;
    const tierMatch =
      !coeff.tier || coeff.tier === 'all' || coeff.tier === features.tier;

    return timeframeMatch && classMatch && rootMatch && tierMatch;
  });
}

// Aggregate matched coefficients (weighted by specificity)
function aggregateCoefficients(matched: LearningCoefficient[]): Partial<AdjustmentFactors> {
  if (matched.length === 0) {
    return { score_drift: 0, target_envelope_widen_factor: 1, entry_confidence_boost: 0 };
  }

  // Weight by specificity: more specific = higher weight
  const weighted = matched.map((coeff) => {
    let specificity = 0;
    if (coeff.timeframe && coeff.timeframe !== 'all') specificity += 1;
    if (coeff.instrument_class && coeff.instrument_class !== 'all') specificity += 1;
    if (coeff.gann_root) specificity += 1;
    if (coeff.tier && coeff.tier !== 'all') specificity += 1;

    const weight = Math.exp(specificity) / (1 + matched.length);
    return { coeff, weight };
  });

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const normalization = totalWeight > 0 ? 1 / totalWeight : 0;

  let scoreDrift = 0;
  let targetEnvelopeWiden = 1;
  let entryConfidenceBoost = 0;

  for (const { coeff, weight } of weighted) {
    const normalized = weight * normalization;
    scoreDrift += (coeff.score_drift || 0) * normalized;
    targetEnvelopeWiden += ((coeff.target_envelope_widen_factor || 1) - 1) * normalized;
    entryConfidenceBoost += (coeff.entry_confidence_boost || 0) * normalized;
  }

  return {
    score_drift: scoreDrift,
    target_envelope_widen_factor: Math.max(0.8, Math.min(1.5, targetEnvelopeWiden)), // clamp [0.8, 1.5]
    entry_confidence_boost: Math.max(-0.5, Math.min(0.5, entryConfidenceBoost)), // clamp [-0.5, 0.5]
  };
}

// Apply learned adjustments to scanner output (immutable; returns new values)
export function applyLearningAdjustments(
  baseScore: number,
  baseEntry: number,
  baseStop: number,
  baseTp1: number,
  baseMtp: number,
  features: ModelFeatures,
  coefficients: LearningCoefficient[]
): {
  adjustedScore: number;
  adjustedEntry: number;
  adjustedStop: number;
  adjustedTp1: number;
  adjustedMtp: number;
  adjustments: AdjustmentFactors;
} {
  // Match and aggregate
  const matched = matchCoefficients(coefficients, features);
  const aggregated = aggregateCoefficients(matched);

  // Apply adjustments
  const adjustedScore = Math.max(0, Math.min(9, baseScore + (aggregated.score_drift || 0)));

  const envelopeWiden = aggregated.target_envelope_widen_factor || 1;
  const adjustedEntry = baseEntry; // entry rarely adjusted

  // Stop loss widens on poor confidence, tightens on high confidence
  const stopRange = Math.abs(baseEntry - baseStop);
  const adjustedStop = baseStop - stopRange * (envelopeWiden - 1) * 0.5;

  // TP envelopes expand/contract
  const tp1Range = baseTp1 - baseEntry;
  const adjustedTp1 = baseEntry + tp1Range * envelopeWiden;

  const mtpRange = baseMtp - baseEntry;
  const adjustedMtp = baseEntry + mtpRange * envelopeWiden;

  return {
    adjustedScore,
    adjustedEntry,
    adjustedStop,
    adjustedTp1,
    adjustedMtp,
    adjustments: {
      score_drift: aggregated.score_drift || 0,
      target_envelope_widen_factor: envelopeWiden,
      entry_confidence_boost: aggregated.entry_confidence_boost || 0,
      applied_coefficients: matched.length,
    },
  };
}

// Check minimum sample threshold before applying model
export function isModelTrained(coefficient: LearningCoefficient, minSamples = 100): boolean {
  return (coefficient.sample_count || 0) >= minSamples;
}

/**
 * How much a coefficient's scope actually pins down the setup in front of us.
 *
 * A coefficient earns credit for a dimension only when it *names* that
 * dimension and the name is the one this setup has. `'all'` is a wildcard: it
 * matches everything, which is exactly why it is evidence of nothing. The
 * difference matters because `matchCoefficients` has already accepted every row
 * that reaches here — including the all-wildcard row that matches every setup
 * ever scanned — so scope is the only thing left that separates "trained on
 * setups like this one" from "trained on setups".
 */
function scopeMatchScore(coeff: LearningCoefficient, features: ModelFeatures): number {
  let score = 0;
  if (coeff.timeframe && coeff.timeframe !== 'all' && coeff.timeframe === features.timeframe) {
    score += 0.25;
  }
  if (
    coeff.instrument_class &&
    coeff.instrument_class !== 'all' &&
    coeff.instrument_class === features.instrument_class
  ) {
    score += 0.25;
  }
  if (coeff.gann_root && coeff.gann_root === features.gann_root) score += 0.25;
  if (coeff.tier && coeff.tier !== 'all' && coeff.tier === features.tier) score += 0.25;
  return score;
}

/**
 * Confidence score: higher = more confident we should use these adjustments.
 *
 * This used to take `features` and never read it, so confidence was computed
 * purely from coefficient metadata — how specific a row *claimed* to be and how
 * many samples it had. How well the current setup matched that row had no
 * effect on how much it was trusted, which meant a wildcard row trained on
 * everything and a row trained on this exact timeframe and instrument scored
 * identically.
 *
 * Two things now scale it down, both properties of the setup rather than of the
 * model:
 *
 *   - **Scope match** (above): coefficients that name this setup's dimensions
 *     count for more than coefficients that name nothing.
 *   - **Setup conditions the model has no read on.** A conflict between
 *     timeframes, or a signal already past its validity window, is precisely
 *     when a learned adjustment is least reliable — so confidence is discounted
 *     rather than left flat.
 */
export function modelConfidenceScore(
  matched: LearningCoefficient[],
  features: ModelFeatures
): number {
  if (matched.length === 0) return 0;

  // Base confidence on how well each coefficient's scope fits this setup, and
  // on how much data stands behind it.
  let confidence = 0;
  for (const coeff of matched) {
    const trained = isModelTrained(coeff, 50); // lower bar for individual coefficients
    if (!trained) continue;

    const sampleBoost = Math.min(1, (coeff.sample_count || 0) / 500);
    confidence += scopeMatchScore(coeff, features) + sampleBoost * 0.5;
  }

  if (confidence === 0) return 0;

  // Setup-level discounts. A model asked about a setup its training data cannot
  // speak to should say so by being less sure, not by being equally sure.
  let discount = 1;
  if (features.higher_tf_conflict_flag) discount *= 0.75;
  if (features.validity_bar_countdown <= 0) discount *= 0.5;
  if (features.extended_hours_flag) discount *= 0.75;

  return Math.min(1, (confidence / matched.length) * discount);
}
