/**
 * The checked-in map (SEC SIC codes) puts Gann's own groups together: the
 * Oils, the Motors, the Banks (Truth of the Stock Tape Ch. XVI-XIX).
 */
import { describe, expect, it } from "vitest";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { INDUSTRY_GROUPS, MIN_GROUP_MEMBERS, groupOf } from "@/lib/gann/industryGroups";

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

  it("holds no group smaller than the minimum, and labels each by its key", () => {
    const sizes = new Map<string, number>();
    const labels = new Map<string, Set<string>>();
    for (const { key, label } of INDUSTRY_GROUPS.values()) {
      sizes.set(key, (sizes.get(key) ?? 0) + 1);
      labels.set(key, (labels.get(key) ?? new Set()).add(label));
    }
    for (const [key, n] of sizes) expect(n, key).toBeGreaterThanOrEqual(MIN_GROUP_MEMBERS);
    for (const [key, l] of labels) {
      expect(l.size, key).toBe(1);
      expect([...l][0].startsWith(`SIC ${key}`)).toBe(true);
    }
  });
});
