/**
 * A weight proposal is a claim about the future, so the tests are mostly about
 * what it refuses to claim: no out-of-sample agreement, no move.
 */

import { describe, expect, it } from "vitest";
import {
  MIN_EFFECT_R,
  proposeWeights,
  splitChronologically,
} from "@/lib/backtest/propose-weights";
import type { ReplayTrade } from "@/lib/backtest/replay";
import { CRITERION_KEYS, TOTAL_POINTS, normalizeWeights } from "@/lib/scoring/weights";

let clock = 0;

/** Trades are stamped in call order, so "later" means later in the split. */
const trade = (over: Partial<ReplayTrade> = {}): ReplayTrade => ({
  symbol: "TEST",
  openedAt: new Date(Date.UTC(2026, 0, 1) + clock++ * 900_000).toISOString(),
  pattern: "2-2",
  direction: "bullish",
  entry: 100,
  stop: 99,
  target: 102,
  barsHeld: 3,
  outcome: "win",
  rMultiple: 2,
  ambiguous: false,
  atrMultiple: 1,
  ...over,
});

const winner = { outcome: "win" as const, rMultiple: 2 };
const loser = { outcome: "loss" as const, rMultiple: -1 };

function block(n: number, criteria: Record<string, boolean>, over: Partial<ReplayTrade>) {
  return Array.from({ length: n }, () => trade({ criteria, ...over }));
}

/**
 * A run where `momentum` separates winners from losers in both halves. Each half
 * carries 30 passing winners and 30 failing losers, clearing every arm floor.
 */
function separatingRun(key = "momentum") {
  clock = 0;
  const half = () => [
    ...block(30, { [key]: true }, winner),
    ...block(30, { [key]: false }, loser),
  ];
  return [...half(), ...half()];
}

describe("splitChronologically", () => {
  it("cuts in time, so the held-out half is strictly later", () => {
    clock = 0;
    const trades = Array.from({ length: 10 }, () => trade());
    const { inSample, outOfSample, splitAt } = splitChronologically(trades, 0.7);

    expect(inSample).toHaveLength(7);
    expect(outOfSample).toHaveLength(3);
    expect(splitAt).toBe(outOfSample[0].openedAt);
    expect(inSample.at(-1)!.openedAt < outOfSample[0].openedAt).toBe(true);
  });

  it("orders trades before splitting, whatever order they arrived in", () => {
    clock = 0;
    const trades = Array.from({ length: 10 }, () => trade()).reverse();
    const { inSample, outOfSample } = splitChronologically(trades, 0.5);
    expect(inSample.at(-1)!.openedAt < outOfSample[0].openedAt).toBe(true);
  });
});

describe("proposeWeights", () => {
  it("refuses to propose anything on too few trades", () => {
    clock = 0;
    const proposal = proposeWeights([...block(20, { momentum: true }, winner)]);

    expect(proposal.weights).toBeNull();
    expect(proposal.changed).toBe(false);
    expect(proposal.refusal).toContain("Not enough trades");
  });

  it("up-weights a criterion that separates winners in both halves", () => {
    const proposal = proposeWeights(separatingRun(), { inSampleFraction: 0.5 });
    const momentum = proposal.proposals.find((p) => p.criterion === "momentum")!;

    expect(momentum.outcome).toBe("adopted");
    expect(momentum.proposedWeight).toBeGreaterThan(1);
    expect(proposal.changed).toBe(true);
  });

  it("down-weights a criterion whose passes lose money in both halves", () => {
    clock = 0;
    const half = () => [
      ...block(30, { momentum: true }, loser),
      ...block(30, { momentum: false }, winner),
    ];
    const proposal = proposeWeights([...half(), ...half()], { inSampleFraction: 0.5 });
    const momentum = proposal.proposals.find((p) => p.criterion === "momentum")!;

    expect(momentum.outcome).toBe("adopted");
    expect(momentum.proposedWeight).toBeLessThan(1);
  });

  it("holds a criterion the two halves disagree about", () => {
    clock = 0;
    const trades = [
      // First half: passing wins.
      ...block(30, { momentum: true }, winner),
      ...block(30, { momentum: false }, loser),
      // Second half: passing loses. Noise wearing a result's clothes.
      ...block(30, { momentum: true }, loser),
      ...block(30, { momentum: false }, winner),
    ];
    const proposal = proposeWeights(trades, { inSampleFraction: 0.5 });
    const momentum = proposal.proposals.find((p) => p.criterion === "momentum")!;

    expect(momentum.outcome).toBe("disagreed");
    expect(momentum.rationale).toContain("disagree");
  });

  it("holds a criterion that never varied", () => {
    clock = 0;
    const trades = [
      ...block(60, { momentum: true }, winner),
      ...block(60, { momentum: true }, winner),
    ];
    const proposal = proposeWeights(trades, { inSampleFraction: 0.5 });
    const momentum = proposal.proposals.find((p) => p.criterion === "momentum")!;

    expect(momentum.outcome).toBe("unreadable");
    expect(momentum.rationale).toContain("never varied");
  });

  it("holds a criterion whose measured edge is inside the noise floor", () => {
    clock = 0;
    const tiny = { outcome: "win" as const, rMultiple: 2 };
    const barelyLess = { outcome: "win" as const, rMultiple: 2 - MIN_EFFECT_R / 2 };
    const half = () => [
      ...block(30, { momentum: true }, tiny),
      ...block(30, { momentum: false }, barelyLess),
    ];
    const proposal = proposeWeights([...half(), ...half()], { inSampleFraction: 0.5 });
    const momentum = proposal.proposals.find((p) => p.criterion === "momentum")!;

    expect(momentum.outcome).toBe("too-small");
  });

  it("keeps the set summing to nine points, so the cutoffs still mean what they meant", () => {
    const proposal = proposeWeights(separatingRun(), { inSampleFraction: 0.5 });
    const total = CRITERION_KEYS.reduce((s, k) => s + proposal.weights![k], 0);
    expect(total).toBeCloseTo(TOTAL_POINTS, 1);
  });

  it("caps how far one round can move a weight", () => {
    // The separating run is about as clean as data gets — a whole R of
    // separation — and it still may not rewrite the score in one step.
    const proposal = proposeWeights(separatingRun(), { inSampleFraction: 0.5 });
    for (const p of proposal.proposals) {
      expect(p.proposedWeight).toBeLessThanOrEqual(2);
      expect(p.proposedWeight).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("reports the criteria it could not evaluate rather than dropping them", () => {
    const proposal = proposeWeights(separatingRun(), { inSampleFraction: 0.5 });
    expect(proposal.proposals).toHaveLength(CRITERION_KEYS.length);
  });
});

describe("normalizeWeights", () => {
  it("holds the total at nine points", () => {
    const w = normalizeWeights({ momentum: 2, macroTrend: 0.5 });
    expect(CRITERION_KEYS.reduce((s, k) => s + w[k], 0)).toBeCloseTo(TOTAL_POINTS, 1);
  });

  it("keeps every weight inside its band", () => {
    const w = normalizeWeights({ momentum: 99, macroTrend: 0.001 });
    for (const k of CRITERION_KEYS) {
      expect(w[k]).toBeLessThanOrEqual(2);
      expect(w[k]).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("treats an unusable value as one point rather than throwing", () => {
    const w = normalizeWeights({ momentum: Number.NaN, macroTrend: -3 });
    expect(w.momentum).toBeGreaterThan(0);
    expect(w.macroTrend).toBeGreaterThan(0);
  });
});
