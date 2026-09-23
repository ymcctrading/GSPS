/**
 * Guards the live-weights path, which is the surface
 * `lib/__tests__/default-weights.test.ts` cannot see.
 *
 * That test proves the *code* default is uniform. It says nothing about what
 * production scores with, because `getActiveCriterionWeights` prefers a row
 * promoted to `live` in `learning_models` over the constant entirely. On
 * 2026-09-17 that gap was not theoretical: the repo had committed to uniform
 * weights, the guard test passed, and the live scan was still scoring with a
 * hand-set distribution promoted the day before — including a weight for
 * `adxTrendStrength`, a criterion that had since been discarded.
 *
 * So this file guards the thing that actually bit: a stored weight set
 * addressed to a different criteria set must not be reshaped into one that
 * looks addressed to this one.
 */

import { describe, expect, it } from "vitest";
import { isWeightSetAddressedToCurrentCriteria } from "@/lib/scoring/active-weights";
import { CRITERION_KEYS, parseCriterionWeights, TOTAL_POINTS } from "@/lib/scoring/weights";

const uniform = Object.fromEntries(CRITERION_KEYS.map((k) => [k, 1]));

/**
 * The real v1 `score_adjustment` row promoted 2026-09-16, verbatim. Ten keys,
 * because `adxTrendStrength` was still a criterion when it was proposed.
 */
const PROMOTED_2026_09_16 = {
  stopRoom: 1.67,
  ruleOfThree: 0.94,
  historicalSR: 1.97,
  patternArmed: 0.94,
  volumeClimax: 1.21,
  gannAngleSlope: 0.5,
  swingChartTrend: 1.21,
  timePriceSquare: 0.56,
  adxTrendStrength: 0.5,
  gannRetracementConfluence: 0.5,
};

describe("isWeightSetAddressedToCurrentCriteria", () => {
  it("accepts a set whose keys are exactly the current criteria", () => {
    expect(isWeightSetAddressedToCurrentCriteria(uniform)).toBe(true);
  });

  it("rejects the real stale row that shipped fractional scores to production", () => {
    expect(isWeightSetAddressedToCurrentCriteria(PROMOTED_2026_09_16)).toBe(false);
  });

  it("rejects a set carrying a retired criterion", () => {
    expect(isWeightSetAddressedToCurrentCriteria({ ...uniform, adxTrendStrength: 0.5 })).toBe(false);
  });

  it("rejects a set missing a current criterion", () => {
    const { [CRITERION_KEYS[0]]: _dropped, ...missing } = uniform;
    expect(isWeightSetAddressedToCurrentCriteria(missing)).toBe(false);
  });

  it("rejects non-objects rather than throwing on them", () => {
    for (const bad of [null, undefined, 1, "x", [], true]) {
      expect(isWeightSetAddressedToCurrentCriteria(bad)).toBe(false);
    }
  });
});

describe("why the guard is needed at all", () => {
  it("parseCriterionWeights cannot tell a stale set apart — it reshapes it silently", () => {
    const reshaped = parseCriterionWeights(PROMOTED_2026_09_16);

    // It drops the retired key, renormalises the rest, and returns something
    // structurally indistinguishable from a set somebody actually approved.
    expect(Object.keys(reshaped).sort()).toEqual([...CRITERION_KEYS].sort());
    expect(CRITERION_KEYS.reduce((s, k) => s + reshaped[k], 0)).toBeCloseTo(TOTAL_POINTS, 1);

    // And it is not uniform, so adopting it overrides the repo's decision.
    expect(CRITERION_KEYS.every((k) => reshaped[k] === 1)).toBe(false);
  });
});
