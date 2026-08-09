/**
 * `modelConfidenceScore` took `features` and never read it, so how well a setup
 * matched the model had no effect on how much the model was trusted. These pin
 * the fix: scope has to fit the setup in front of us, and conditions the model
 * cannot speak to have to cost it confidence.
 */

import { describe, expect, it } from "vitest";
import { modelConfidenceScore } from "@/lib/learning/inference";
import type { LearningCoefficient, ModelFeatures } from "@/lib/learning/types";

const coeff = (over: Partial<LearningCoefficient> = {}): LearningCoefficient => ({
  id: "c1",
  model_id: "m1",
  sample_count: 500,
  last_updated: new Date(),
  ...over,
});

const features = (over: Partial<ModelFeatures> = {}): ModelFeatures => ({
  timeframe: "15m",
  instrument_class: "us_equity",
  tier: "Modest",
  higher_tf_conflict_flag: false,
  validity_bar_countdown: 3,
  bias_alignment: 1,
  base_score: 7,
  extended_hours_flag: false,
  ...over,
});

describe("modelConfidenceScore", () => {
  it("trusts a coefficient scoped to this setup more than a wildcard one", () => {
    const scoped = modelConfidenceScore(
      [coeff({ timeframe: "15m", instrument_class: "us_equity", tier: "Modest" })],
      features(),
    );
    const wildcard = modelConfidenceScore(
      [coeff({ timeframe: "all", instrument_class: "all", tier: "all" })],
      features(),
    );

    expect(scoped).toBeGreaterThan(wildcard);
  });

  it("gives no scope credit for a dimension that names a different value", () => {
    // The row reached here because `matchCoefficients` accepted it; a coefficient
    // trained on the daily chart still says nothing specific about a 15-minute
    // setup, so it must not read as though it did.
    const mismatched = modelConfidenceScore(
      [coeff({ timeframe: "1d", instrument_class: "us_equity" })],
      features(),
    );
    const matched = modelConfidenceScore(
      [coeff({ timeframe: "15m", instrument_class: "us_equity" })],
      features(),
    );

    expect(mismatched).toBeLessThan(matched);
  });

  it("discounts a setup whose timeframes disagree", () => {
    const scoped = [coeff({ timeframe: "15m", instrument_class: "us_equity" })];
    expect(modelConfidenceScore(scoped, features({ higher_tf_conflict_flag: true }))).toBeLessThan(
      modelConfidenceScore(scoped, features()),
    );
  });

  it("discounts a signal that has run out of validity", () => {
    const scoped = [coeff({ timeframe: "15m", instrument_class: "us_equity" })];
    expect(modelConfidenceScore(scoped, features({ validity_bar_countdown: 0 }))).toBeLessThan(
      modelConfidenceScore(scoped, features()),
    );
  });

  it("stays at zero with nothing matched or nothing trained", () => {
    expect(modelConfidenceScore([], features())).toBe(0);
    expect(modelConfidenceScore([coeff({ sample_count: 10 })], features())).toBe(0);
  });

  it("never exceeds one", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      coeff({
        id: `c${i}`,
        timeframe: "15m",
        instrument_class: "us_equity",
        tier: "Modest",
        gann_root: 9,
        sample_count: 5000,
      }),
    );
    expect(modelConfidenceScore(many, features({ gann_root: 9 }))).toBeLessThanOrEqual(1);
  });
});
