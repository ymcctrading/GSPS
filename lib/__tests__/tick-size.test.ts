import { describe, it, expect } from "vitest";
import {
  conservativeMode,
  isOnTick,
  snapToTick,
  tickSizeFor,
  validateLimitPrice,
} from "@/lib/trade/tick-size";

const EQUITY = { assetType: "EQUITY" as const };
const OPTION = { assetType: "OPTION" as const };

describe("tickSizeFor", () => {
  it("puts dollar-and-up shares on whole cents", () => {
    const tick = tickSizeFor(EQUITY, 49.755);
    expect(tick.size).toBe(0.01);
    expect(tick.source).toBe("regulatory");
  });

  it("puts sub-dollar shares on hundredths of a cent", () => {
    expect(tickSizeFor(EQUITY, 0.42).size).toBe(0.0001);
  });

  it("switches at exactly $1.00, not below it", () => {
    expect(tickSizeFor(EQUITY, 1).size).toBe(0.01);
    expect(tickSizeFor(EQUITY, 0.9999).size).toBe(0.0001);
  });

  it("uses the wider standard option increment when penny-class membership is unknown", () => {
    const tick = tickSizeFor(OPTION, 2.5);
    expect(tick.size).toBe(0.05);
    expect(tick.source).toBe("regulatory");
  });

  it("uses pennies below $3 only when the broker confirms the class", () => {
    const tick = tickSizeFor({ ...OPTION, pennyProgram: true }, 2.5);
    expect(tick.size).toBe(0.01);
    expect(tick.source).toBe("broker");
  });

  it("uses dimes at or above $3 even for a penny-program class", () => {
    expect(tickSizeFor({ ...OPTION, pennyProgram: true }, 3).size).toBe(0.1);
  });

  it("prefers a broker-published increment over the regulatory default", () => {
    const tick = tickSizeFor({ ...EQUITY, brokerTickSize: 0.05 }, 49.755);
    expect(tick.size).toBe(0.05);
    expect(tick.source).toBe("broker");
  });
});

describe("isOnTick", () => {
  it("accepts a price that lands exactly on an increment", () => {
    expect(isOnTick(49.75, 0.01)).toBe(true);
    expect(isOnTick(49.76, 0.01)).toBe(true);
  });

  it("rejects a sub-penny price", () => {
    expect(isOnTick(49.755, 0.01)).toBe(false);
  });

  // 0.1 + 0.2 !== 0.3 in binary floating point; the check works in integer
  // ten-thousandths precisely so prices like these don't false-negative.
  it("is not fooled by binary floating point", () => {
    expect(isOnTick(0.3, 0.1)).toBe(true);
    expect(isOnTick(70.7, 0.1)).toBe(true);
    expect(isOnTick(1.15, 0.05)).toBe(true);
  });
});

describe("snapToTick", () => {
  it("rounds 49.755 each of the three ways", () => {
    expect(snapToTick(49.755, 0.01, "down")).toBe(49.75);
    expect(snapToTick(49.755, 0.01, "nearest")).toBe(49.76);
    expect(snapToTick(49.755, 0.01, "up")).toBe(49.76);
  });

  it("leaves an already-valid price alone in every mode", () => {
    for (const mode of ["down", "nearest", "up"] as const) {
      expect(snapToTick(49.75, 0.01, mode)).toBe(49.75);
    }
  });

  it("snaps an option premium to the 5-cent grid", () => {
    expect(snapToTick(2.53, 0.05, "down")).toBe(2.5);
    expect(snapToTick(2.53, 0.05, "up")).toBe(2.55);
    expect(snapToTick(2.53, 0.05, "nearest")).toBe(2.55);
  });
});

describe("conservativeMode", () => {
  it("rounds buys down and sells up so the correction never moves against the user", () => {
    expect(conservativeMode("buy")).toBe("down");
    expect(conservativeMode("sell")).toBe("up");
  });
});

describe("validateLimitPrice", () => {
  // The rejection that motivated this module:
  //   Invalid limit_price 49.755. sub-penny increment does not fulfill
  //   minimum pricing criteria.
  it("corrects the DRAM sub-penny rejection on a buy", () => {
    const v = validateLimitPrice({ price: 49.755, side: "buy", instrument: EQUITY });
    expect(v.ok).toBe(true);
    expect(v.price).toBe(49.75);
    expect(v.adjusted).toBe(true);
    expect(v.direction).toBe("down");
    expect(v.explanation).toContain("$49.75");
    expect(v.fillProbabilityNote).toContain("never pay more");
  });

  it("corrects the same price upward on a sell", () => {
    const v = validateLimitPrice({ price: 49.755, side: "sell", instrument: EQUITY });
    expect(v.price).toBe(49.76);
    expect(v.direction).toBe("up");
    expect(v.fillProbabilityNote).toContain("never receive less");
  });

  it("honours an explicit rounding mode over the side default", () => {
    const v = validateLimitPrice({
      price: 49.755,
      side: "buy",
      instrument: EQUITY,
      mode: "up",
    });
    expect(v.price).toBe(49.76);
    expect(v.direction).toBe("up");
    expect(v.fillProbabilityNote).toContain("raises the most you could pay");
  });

  it("passes a valid price through untouched and says so", () => {
    const v = validateLimitPrice({ price: 49.75, side: "buy", instrument: EQUITY });
    expect(v.ok).toBe(true);
    expect(v.price).toBe(49.75);
    expect(v.adjusted).toBe(false);
    expect(v.fillProbabilityNote).toBeNull();
  });

  it("blocks the order when instrument metadata is unavailable", () => {
    const v = validateLimitPrice({
      price: 49.75,
      side: "buy",
      instrument: EQUITY,
      metadataAvailable: false,
    });
    expect(v.ok).toBe(false);
    expect(v.price).toBeNull();
    expect(v.blockedReason).toContain("minimum price increment");
  });

  it("blocks rather than repricing to zero when rounding down out of the first increment", () => {
    const v = validateLimitPrice({ price: 0.03, side: "buy", instrument: OPTION });
    expect(v.ok).toBe(false);
    expect(v.price).toBeNull();
    expect(v.blockedReason).toContain("below the smallest valid price");
  });

  it("blocks a non-positive price", () => {
    expect(validateLimitPrice({ price: 0, side: "buy", instrument: EQUITY }).ok).toBe(false);
    expect(validateLimitPrice({ price: NaN, side: "buy", instrument: EQUITY }).ok).toBe(false);
  });

  it("corrects an option premium against the OPRA grid, not the equity one", () => {
    const v = validateLimitPrice({ price: 2.53, side: "buy", instrument: OPTION });
    expect(v.tick?.size).toBe(0.05);
    expect(v.price).toBe(2.5);
  });
});

describe("validateLimitPrice — float normalization", () => {
  // Trade levels are arithmetic on bar prices, and that arithmetic produces
  // values whose decimal form is on-tick but whose binary form is not:
  // 1.12 + 0.01 === 1.1300000000000001. Returning the caller's float untouched
  // sent String(1.1300000000000001) to the broker, which is the exact
  // sub-penny rejection this module exists to prevent.
  it("normalizes a price that is on-tick as a decimal but not as a float", () => {
    const dirty = 1.12 + 0.01;
    expect(String(dirty)).toBe("1.1300000000000001");

    const v = validateLimitPrice({ price: dirty, side: "buy", instrument: EQUITY });
    expect(v.ok).toBe(true);
    expect(v.adjusted).toBe(false); // the decimal value did not change
    expect(String(v.price)).toBe("1.13"); // but the float is now clean
  });

  it("keeps the requested value as the caller supplied it", () => {
    const dirty = 1.12 + 0.01;
    const v = validateLimitPrice({ price: dirty, side: "buy", instrument: EQUITY });
    expect(v.requested).toBe(dirty);
  });

  it("normalizes a dirty option premium against the OPRA grid", () => {
    const dirty = 2.5 + 0.05;
    const v = validateLimitPrice({ price: dirty, side: "buy", instrument: OPTION });
    expect(v.adjusted).toBe(false);
    expect(String(v.price)).toBe("2.55");
  });

  it("still reports a genuine sub-penny price as adjusted", () => {
    const v = validateLimitPrice({ price: 49.755, side: "buy", instrument: EQUITY });
    expect(v.adjusted).toBe(true);
    expect(String(v.price)).toBe("49.75");
  });
});
