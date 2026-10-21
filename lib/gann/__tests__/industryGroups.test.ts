/**
 * The checked-in map (SEC SIC codes) puts Gann's own groups together: the
 * Oils, the Motors, the Banks (Truth of the Stock Tape Ch. XVI-XIX).
 */
import { describe, expect, it } from "vitest";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { INDUSTRY_GROUPS, groupOf } from "@/lib/gann/industryGroups";

describe("industry group map", () => {
  it("groups the oils, the motors and the banks with their own kind", () => {
    expect(groupOf("XOM")?.key).toBe(groupOf("CVX")?.key);
    expect(groupOf("F")?.key).toBe(groupOf("GM")?.key);
    expect(groupOf("JPM")?.key).toBe(groupOf("BAC")?.key);
    expect(groupOf("XOM")?.key).not.toBe(groupOf("JPM")?.key);
  });

  it("covers most of the scan universe", () => {
    const covered = LARGE_CAP_UNIVERSE.filter((s) => INDUSTRY_GROUPS.has(s.toUpperCase())).length;
    expect(covered / LARGE_CAP_UNIVERSE.length).toBeGreaterThan(0.85);
  });
});
