import { describe, expect, it } from "vitest";
import { classifyDigitalRoot, digitalRoot } from "../digitalRoot";

describe("digitalRoot", () => {
  it("computes DR(n) = 1 + ((n - 1) mod 9) for the canonical sequence", () => {
    expect(digitalRoot(1)).toBe(1);
    expect(digitalRoot(9)).toBe(9);
    expect(digitalRoot(10)).toBe(1);
    expect(digitalRoot(17)).toBe(8);
    expect(digitalRoot(18)).toBe(9);
  });

  it("treats zero, negative, non-integer, and non-finite input as absence", () => {
    expect(digitalRoot(0)).toBeNull();
    expect(digitalRoot(-5)).toBeNull();
    expect(digitalRoot(4.5)).toBeNull();
    expect(digitalRoot(NaN)).toBeNull();
    expect(digitalRoot(Infinity)).toBeNull();
  });

  it("classifies a value divisible by 9 as the completion node", () => {
    expect(classifyDigitalRoot(9)?.rootClass).toBe("completion");
    expect(classifyDigitalRoot(18)?.rootClass).toBe("completion");
    expect(classifyDigitalRoot(9)?.root).toBe(9);
  });

  it("classifies root 1 as initiation", () => {
    expect(classifyDigitalRoot(1)?.rootClass).toBe("initiation");
    expect(classifyDigitalRoot(10)?.rootClass).toBe("initiation");
  });

  it("classifies roots 3 and 6 as the polarity axis", () => {
    expect(classifyDigitalRoot(3)?.rootClass).toBe("polarity");
    expect(classifyDigitalRoot(6)?.rootClass).toBe("polarity");
  });

  it("classifies roots 2, 4, 5, 7, 8 as the vortexFlow loop", () => {
    for (const n of [2, 4, 5, 7, 8]) {
      expect(classifyDigitalRoot(n)?.rootClass).toBe("vortexFlow");
    }
  });

  it("returns null (absence) for invalid input rather than a guessed class", () => {
    expect(classifyDigitalRoot(0)).toBeNull();
    expect(classifyDigitalRoot(-1)).toBeNull();
  });
});
