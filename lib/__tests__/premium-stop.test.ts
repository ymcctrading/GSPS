import { describe, expect, it } from "vitest";
import { TYPICAL_HOLDING_DAYS, readPremiumStop } from "@/lib/trade/premium-stop";

describe("readPremiumStop", () => {
  it("assumes point-for-point movement when no delta is known", () => {
    // $1 of stop against $6.50 of premium = 15.4%.
    const reading = readPremiumStop({ risk: 1, premium: 6.5 })!;
    expect(reading.pctOfPremium).toBeCloseTo(15.38, 2);
    expect(reading.exact).toBe(false);
  });

  it("scales by delta when the contract is known, and says so", () => {
    // The same trade on a 0.55-delta contract only risks 8.5% of the premium,
    // because the option gives up 55c for each dollar the underlying moves.
    const reading = readPremiumStop({ risk: 1, premium: 6.5, delta: 0.55 })!;
    expect(reading.pctOfPremium).toBeCloseTo(8.46, 2);
    expect(reading.exact).toBe(true);
  });

  it("reads the contract's delta where the approximation would overstate it", () => {
    // Assuming delta 1 this reads 20%; at the contract's real delta of 0.6 it is 12%.
    const approximate = readPremiumStop({ risk: 1, premium: 5 })!;
    const exact = readPremiumStop({ risk: 1, premium: 5, delta: 0.6 })!;
    expect(approximate.pctOfPremium).toBeCloseTo(20, 6);
    expect(exact.pctOfPremium).toBeCloseTo(12, 6);
  });

  it("treats a put's negative delta as exposure, not a discount", () => {
    const put = readPremiumStop({ risk: 1, premium: 6.5, delta: -0.55 })!;
    const call = readPremiumStop({ risk: 1, premium: 6.5, delta: 0.55 })!;
    expect(put.pctOfPremium).toBeCloseTo(call.pctOfPremium, 10);
  });

  it("judges nothing and advises no size: the premium is the risk (R-006)", () => {
    // Gann, Master Course Ch. 19A: the option is the stop. The 12-18% band and
    // its "increase size" / "reduce size" advice had no source.
    const reading = readPremiumStop({ risk: 1, premium: 100 })! as unknown as Record<string, unknown>;
    expect(reading).not.toHaveProperty("verdict");
    expect(reading).not.toHaveProperty("warning");
  });

  it("declines to read what the inputs cannot support", () => {
    expect(readPremiumStop({ risk: 0, premium: 6.5 })).toBeNull();
    expect(readPremiumStop({ risk: 1, premium: 0 })).toBeNull();
    // A contract with no directional exposure has no premium to lose this way.
    expect(readPremiumStop({ risk: 1, premium: 6.5, delta: 0 })).toBeNull();
  });

  it("charges no decay when theta is unknown", () => {
    const reading = readPremiumStop({ risk: 1, premium: 6.5, delta: 0.55 })!;
    expect(reading.decayCost).toBe(0);
    expect(reading.stopCost).toBeCloseTo(0.55, 10);
  });

  it("charges decay over the assumed hold when theta is known", () => {
    const reading = readPremiumStop({
      risk: 1,
      premium: 6.5,
      delta: 0.55,
      theta: -0.2,
    })!;
    expect(reading.holdingDays).toBe(TYPICAL_HOLDING_DAYS);
    expect(reading.decayCost).toBeCloseTo(0.2 * TYPICAL_HOLDING_DAYS, 10);
    // Stop alone would read 8.5%; decay lifts it.
    expect(reading.pctOfPremium).toBeCloseTo(((0.55 + 0.2 * TYPICAL_HOLDING_DAYS) / 6.5) * 100, 6);
  });

  it("takes an explicit hold for a position carried longer", () => {
    const overnight = readPremiumStop({
      risk: 1,
      premium: 6.5,
      delta: 0.55,
      theta: -0.2,
      holdingDays: 3,
    })!;
    expect(overnight.decayCost).toBeCloseTo(0.6, 10);
    expect(overnight.holdingDays).toBe(3);
  });

  it("charges decay on a near-dated contract — the NVDA 210 call", () => {
    // Live chain: $3.53 ask, delta 0.424, theta -0.134/day, against the scan's
    // $0.83 structural stop. The stop alone reads 10.0% of the premium;
    // charging the swing's typical hold of decay adds to it.
    const stopOnly = readPremiumStop({ risk: 0.83, premium: 3.5341, delta: 0.4241 })!;
    const withDecay = readPremiumStop({
      risk: 0.83,
      premium: 3.5341,
      delta: 0.4241,
      theta: -0.1342,
    })!;
    expect(stopOnly.pctOfPremium).toBeCloseTo(9.96, 1);
    expect(withDecay.pctOfPremium).toBeCloseTo(47.93, 1);
    // Decay is most of the total risk on this contract over a swing, not a rounding error.
    expect(withDecay.decayCost / (withDecay.stopCost + withDecay.decayCost)).toBeGreaterThan(0.15);
  });

  it("never lets a bad hold or theta understate the risk", () => {
    // Each of these would otherwise subtract decay or produce NaN — and NaN
    // compares false everywhere, so it would read as a silent small figure.
    for (const holdingDays of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const reading = readPremiumStop({
        risk: 1,
        premium: 6.5,
        delta: 0.55,
        theta: -0.2,
        holdingDays,
      })!;
      expect(Number.isFinite(reading.pctOfPremium)).toBe(true);
      expect(reading.decayCost).toBeGreaterThanOrEqual(0);
      expect(reading.pctOfPremium).toBeGreaterThanOrEqual(
        (reading.stopCost / 6.5) * 100 - 1e-9,
      );
    }
    for (const theta of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const reading = readPremiumStop({ risk: 1, premium: 6.5, delta: 0.55, theta })!;
      expect(Number.isFinite(reading.pctOfPremium)).toBe(true);
      expect(reading.decayCost).toBe(0);
    }
  });

  it("treats a positive theta quote as decay all the same", () => {
    // Sign conventions vary by feed; magnitude is what is charged.
    const negative = readPremiumStop({ risk: 1, premium: 6.5, theta: -0.2 })!;
    const positive = readPremiumStop({ risk: 1, premium: 6.5, theta: 0.2 })!;
    expect(positive.pctOfPremium).toBeCloseTo(negative.pctOfPremium, 10);
  });

  it("is unaffected by the 100-share contract multiplier", () => {
    // Premium and delta are both quoted per share, so the multiplier cancels;
    // a reading must not change if someone reasons in contract terms.
    const perShare = readPremiumStop({ risk: 1, premium: 6.5, delta: 0.55 })!;
    const perContract = readPremiumStop({ risk: 100, premium: 650, delta: 0.55 })!;
    expect(perShare.pctOfPremium).toBeCloseTo(perContract.pctOfPremium, 10);
  });

  it("never reads more than the whole premium: a bought option loses only what was paid (review of #515)", () => {
    // $1 premium, $0.80 stop on a 0.6 delta, 0.10 decay a day for ten days:
    // 0.48 + 1.00 = 148% uncapped.
    const reading = readPremiumStop({ risk: 0.8, premium: 1, delta: 0.6, theta: -0.1 })!;
    expect(reading.pctOfPremium).toBe(100);
    expect(reading.capped).toBe(true);
    expect(reading.stopCost).toBeCloseTo(0.48, 10);
    expect(reading.decayCost).toBeCloseTo(1, 10);
    const within = readPremiumStop({ risk: 1, premium: 6.5, delta: 0.55 })!;
    expect(within.capped).toBe(false);
    for (const risk of [0.5, 5, 50, 1e6]) {
      const r = readPremiumStop({ risk, premium: 2, theta: -0.3, holdingDays: 1e6 })!;
      expect(r.pctOfPremium).toBeLessThanOrEqual(100);
    }
  });
});
