import { describe, expect, it } from "vitest";
import {
  STOP_BAND_MAX_PCT_OF_PREMIUM,
  STOP_BAND_MIN_PCT_OF_PREMIUM,
  TYPICAL_HOLDING_DAYS,
  readPremiumStop,
} from "@/lib/trade/premium-stop";

describe("readPremiumStop", () => {
  it("assumes point-for-point movement when no delta is known", () => {
    // $1 of stop against $6.50 of premium = 15.4%, mid-band.
    const reading = readPremiumStop({ risk: 1, premium: 6.5 })!;
    expect(reading.pctOfPremium).toBeCloseTo(15.38, 2);
    expect(reading.verdict).toBe("in-band");
    expect(reading.exact).toBe(false);
    expect(reading.warning).toBeNull();
  });

  it("scales by delta when the contract is known, and says so", () => {
    // The same trade on a 0.55-delta contract only risks 8.5% of the premium,
    // because the option gives up 55c for each dollar the underlying moves.
    const reading = readPremiumStop({ risk: 1, premium: 6.5, delta: 0.55 })!;
    expect(reading.pctOfPremium).toBeCloseTo(8.46, 2);
    expect(reading.verdict).toBe("tight");
    expect(reading.exact).toBe(true);
    expect(reading.warning).toContain("tighter");
  });

  it("changes the verdict where the approximation would have misjudged it", () => {
    // Assuming delta 1 this reads 20% — "wider than the band, reduce size or
    // skip". At the contract's real delta of 0.6 it is 12%, inside the band.
    // This is the case the ticket exists to get right.
    const approximate = readPremiumStop({ risk: 1, premium: 5 })!;
    const exact = readPremiumStop({ risk: 1, premium: 5, delta: 0.6 })!;
    expect(approximate.verdict).toBe("wide");
    expect(exact.verdict).toBe("in-band");
    expect(exact.warning).toBeNull();
  });

  it("treats a put's negative delta as exposure, not a discount", () => {
    const put = readPremiumStop({ risk: 1, premium: 6.5, delta: -0.55 })!;
    const call = readPremiumStop({ risk: 1, premium: 6.5, delta: 0.55 })!;
    expect(put.pctOfPremium).toBeCloseTo(call.pctOfPremium, 10);
  });

  it("counts the band edges as inside it", () => {
    const atFloor = readPremiumStop({ risk: STOP_BAND_MIN_PCT_OF_PREMIUM, premium: 100 })!;
    const atCeiling = readPremiumStop({ risk: STOP_BAND_MAX_PCT_OF_PREMIUM, premium: 100 })!;
    expect(atFloor.verdict).toBe("in-band");
    expect(atCeiling.verdict).toBe("in-band");
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
    expect(reading.pctOfPremium).toBeCloseTo(((0.55 + 0.1) / 6.5) * 100, 6);
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

  it("moves a near-band contract across the line — the NVDA 210 call", () => {
    // Live chain: $3.53 ask, delta 0.424, theta -0.134/day, against the scan's
    // $0.83 structural stop. The stop alone reads 10.0% and is dismissed as
    // over-priced; charging half a session of decay puts it inside the band.
    const stopOnly = readPremiumStop({ risk: 0.83, premium: 3.5341, delta: 0.4241 })!;
    const withDecay = readPremiumStop({
      risk: 0.83,
      premium: 3.5341,
      delta: 0.4241,
      theta: -0.1342,
    })!;
    expect(stopOnly.pctOfPremium).toBeCloseTo(9.96, 1);
    expect(stopOnly.verdict).toBe("tight");
    expect(withDecay.pctOfPremium).toBeCloseTo(11.86, 1);
    expect(withDecay.verdict).toBe("tight");
    // Decay is a fifth of the total risk on this contract, not a rounding error.
    expect(withDecay.decayCost / (withDecay.stopCost + withDecay.decayCost)).toBeGreaterThan(0.15);
  });

  it("never lets a bad hold or theta understate the risk", () => {
    // Each of these would otherwise subtract decay or produce NaN — and NaN
    // compares false against both band edges, so it would read as a silent
    // "in-band, no warning" on a measure the trader sizes against.
    const baseline = readPremiumStop({ risk: 1, premium: 6.5, delta: 0.55, theta: -0.2 })!;
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
    expect(baseline.verdict).toBe("tight");
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
});
