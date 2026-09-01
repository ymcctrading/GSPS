import { describe, expect, it } from "vitest";
import { CADENCE_ITEMS } from "@/lib/school/cadence";

describe("cadence engine content", () => {
  it("defines all five required cadences from the product spec", () => {
    expect(CADENCE_ITEMS.map((c) => c.key).sort()).toEqual(
      ["daily", "post_trade", "pre_market", "pre_trade", "weekly"].sort(),
    );
  });

  it("every cadence item has a non-empty focus list, never a trade-count target", () => {
    for (const item of CADENCE_ITEMS) {
      expect(item.focus.length).toBeGreaterThan(0);
      for (const f of item.focus) expect(f.toLowerCase()).not.toMatch(/trade count|number of trades/);
    }
  });
});
