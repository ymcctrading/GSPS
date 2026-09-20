/**
 * Guards the "one point each" decision so it cannot be undone silently.
 *
 * The live default was a hand-set distribution between 2026-09-14 and
 * 2026-09-16 and was restored to uniform on principle, not because those
 * numbers measured badly — see AGENTS.md's "Gann-derived AND measured" and
 * "The scorecard's role", plus `DEFAULT_CRITERION_WEIGHTS`'s own doc comment.
 *
 * The scorecard counts how many of Gann's confirming conditions a setup
 * satisfies. A non-equal weight asserts that one of those conditions outranks
 * another, which nothing in `docs/GANN_HISTORICAL_SOURCES.md` supports: every
 * "most important" in that catalog sits *within* a technique, never across
 * them. So a weighted default is a substantive claim, and this test exists to
 * make sure re-introducing one is a decision somebody makes on purpose rather
 * than a drift nobody notices.
 *
 * **If this test fails, it is probably doing its job.** Do not "fix" it by
 * updating the expectation. Either restore uniform weights, or — if the
 * weighting is genuinely intended — record what justifies it (a citable
 * cross-criterion ranking from Gann, or a `propose-weights.ts` in/out-of-sample
 * result correcting a translation) in AGENTS.md first, then change this test
 * deliberately with that reasoning attached.
 */

import { describe, expect, it } from "vitest";
import {
  CRITERION_KEYS,
  DEFAULT_CRITERION_WEIGHTS,
  MAX_WEIGHT,
  MIN_WEIGHT,
  TOTAL_POINTS,
  normalizeWeights,
} from "@/lib/scoring/weights";

describe("DEFAULT_CRITERION_WEIGHTS", () => {
  it("is one point per criterion — a count of Gann's conditions, not a ranking of them", () => {
    for (const key of CRITERION_KEYS) {
      expect(DEFAULT_CRITERION_WEIGHTS[key]).toBe(1);
    }
  });

  it("covers every scored criterion, so none is silently unweighted", () => {
    expect(Object.keys(DEFAULT_CRITERION_WEIGHTS).sort()).toEqual([...CRITERION_KEYS].sort());
  });

  it("sums to TOTAL_POINTS, the unit both cutoffs are expressed in", () => {
    const sum = CRITERION_KEYS.reduce((s, k) => s + DEFAULT_CRITERION_WEIGHTS[k], 0);
    expect(sum).toBeCloseTo(TOTAL_POINTS, 10);
  });

  it("stays inside the weight clamp", () => {
    for (const key of CRITERION_KEYS) {
      expect(DEFAULT_CRITERION_WEIGHTS[key]).toBeGreaterThanOrEqual(MIN_WEIGHT);
      expect(DEFAULT_CRITERION_WEIGHTS[key]).toBeLessThanOrEqual(MAX_WEIGHT);
    }
  });

  it("is a fixed point of normalizeWeights — normalizing it again changes nothing", () => {
    expect(normalizeWeights(DEFAULT_CRITERION_WEIGHTS)).toEqual(DEFAULT_CRITERION_WEIGHTS);
  });
});
