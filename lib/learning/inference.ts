// Model inference: apply learned adjustment factors to scanner output
import type { LearningCoefficient, ModelFeatures, Timeframe, AssetClass, GannRoot, Tier } from './types';

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
  const entryRange = baseEntry * 0.01; // 1% buffer
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

// Confidence score: higher = more confident we should use these adjustments
export function modelConfidenceScore(
  matched: LearningCoefficient[],
  features: ModelFeatures
): number {
  if (matched.length === 0) return 0;

  // Base confidence on specificity and sample count
  let confidence = 0;
  for (const coeff of matched) {
    const trained = isModelTrained(coeff, 50); // lower bar for individual coefficients
    if (!trained) continue;

    let specificity = 0;
    if (coeff.timeframe && coeff.timeframe !== 'all') specificity += 0.25;
    if (coeff.instrument_class && coeff.instrument_class !== 'all') specificity += 0.25;
    if (coeff.gann_root) specificity += 0.25;
    if (coeff.tier && coeff.tier !== 'all') specificity += 0.25;

    const sampleBoost = Math.min(1, (coeff.sample_count || 0) / 500);
    confidence += specificity + sampleBoost * 0.5;
  }

  return Math.min(1, confidence / matched.length);
}
