import { describe, expect, it } from "vitest";
import {
  STOP_BAND_MAX_PCT_OF_PREMIUM,
  STOP_BAND_MIN_PCT_OF_PREMIUM,
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

  it("is unaffected by the 100-share contract multiplier", () => {
    // Premium and delta are both quoted per share, so the multiplier cancels;
    // a reading must not change if someone reasons in contract terms.
    const perShare = readPremiumStop({ risk: 1, premium: 6.5, delta: 0.55 })!;
    const perContract = readPremiumStop({ risk: 100, premium: 650, delta: 0.55 })!;
    expect(perShare.pctOfPremium).toBeCloseTo(perContract.pctOfPremium, 10);
  });
});
