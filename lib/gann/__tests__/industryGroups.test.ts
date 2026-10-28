/**
 * The live map (the platform's industries, from the SEC codes corrected) puts
 * Gann's own groups together: the Oils, the Motors, the Banks (Truth of the
 * Stock Tape Ch. XVI-XIX).
 */
import { describe, expect, it } from "vitest";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { INDUSTRY_GROUPS, MIN_GROUP_MEMBERS, buildIndustryGroupMap, groupOf } from "@/lib/gann/industryGroups";

describe("industry group map", () => {
  it("groups the oils, the motors and the banks with their own kind", () => {
    expect(groupOf("XOM")?.key).toBe(groupOf("CVX")?.key);
    expect(groupOf("F")?.key).toBe(groupOf("GM")?.key);
    expect(groupOf("JPM")?.key).toBe(groupOf("BAC")?.key);
    expect(groupOf("XOM")?.key).not.toBe(groupOf("JPM")?.key);
  });

  it("ranks a misfiled company with the industry it trades in, not its SEC code", () => {
    // SEC files Alphabet as computer programming, ConocoPhillips as a refiner.
    expect(groupOf("GOOGL")?.key).toBe(groupOf("META")?.key);
    expect(groupOf("GOOGL")?.key).not.toBe(groupOf("MSFT")?.key);
    expect(groupOf("COP")?.key).toBe(groupOf("EOG")?.key);
    expect(groupOf("COP")?.key).not.toBe(groupOf("MPC")?.key);
  });

  it("pools a sector's small industries when they reach the minimum together, else leaves them ungrouped", () => {
    const a = (key: string, sector = "energy") => ({ key, label: key, sector, sectorLabel: "Energy" });
    const g = buildIndustryGroupMap({
      A: a("big"), B: a("big"), C: a("big"), D: a("big"), E: a("big"),
      F: a("s1"), G: a("s1"), H: a("s2"), I: a("s3"), J: a("s3"),
      K: a("lone", "utilities"),
    });
    expect(g.get("A")?.key).toBe("big");
    expect(g.get("F")).toEqual({ key: "energy:other", label: "Energy (other)" });
    expect(g.get("J")?.key).toBe("energy:other");
    expect(g.get("K")).toBeUndefined();
  });

  it("covers most of the scan universe", () => {
    const covered = LARGE_CAP_UNIVERSE.filter((s) => INDUSTRY_GROUPS.has(s.toUpperCase())).length;
    expect(covered / LARGE_CAP_UNIVERSE.length).toBeGreaterThan(0.85);
  });

  it("holds no group smaller than the minimum, and labels each group one way", () => {
    const sizes = new Map<string, number>();
    const labels = new Map<string, Set<string>>();
    for (const { key, label } of INDUSTRY_GROUPS.values()) {
      sizes.set(key, (sizes.get(key) ?? 0) + 1);
      labels.set(key, (labels.get(key) ?? new Set()).add(label));
    }
    for (const [key, n] of sizes) expect(n, key).toBeGreaterThanOrEqual(MIN_GROUP_MEMBERS);
    for (const [key, l] of labels) expect(l.size, key).toBe(1);
  });
});
