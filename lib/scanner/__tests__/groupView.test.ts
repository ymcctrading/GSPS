/** The Groups tab reads the same standing the score's rank reads. */

import { describe, it, expect } from "vitest";
import { readGroupView } from "@/lib/scanner/groupView";
import { readUniverseRank, type UniverseStrength } from "@/lib/gann/universeStrength";
import type { IndustryGroup } from "@/lib/gann/industryGroups";

const AS_OF = new Date("2026-10-15T16:00:00Z");

/** 120 stocks: three groups of 10 (strong, middling, weak) and 90 ungrouped peers. */
function fixture() {
  const bySymbol = new Map<string, number>();
  const groups = new Map<string, IndustryGroup>();
  for (let i = 0; i < 10; i++) {
    bySymbol.set(`HI${i}`, 0.8 + i * 0.02);
    groups.set(`HI${i}`, { key: "strong", label: "Strong group" });
    bySymbol.set(`MD${i}`, 0.4 + i * 0.02);
    groups.set(`MD${i}`, { key: "mid", label: "Middle group" });
    bySymbol.set(`LO${i}`, 0.05 + i * 0.01);
    groups.set(`LO${i}`, { key: "weak", label: "Weak group" });
  }
  for (let i = 0; i < 90; i++) bySymbol.set(`P${i}`, i / 90);
  const universe: UniverseStrength = new Map([
    ["2026-10", { sorted: [...bySymbol.values()].sort((a, b) => a - b), bySymbol }],
  ]);
  return { universe, groups };
}

describe("readGroupView", () => {
  it("ranks groups strongest first, with the score's own group standing", () => {
    const { universe, groups } = fixture();
    const view = readGroupView(universe, AS_OF, groups)!;
    expect(view.month).toBe("2026-10");
    expect(view.groups.map((g) => g.key)).toEqual(["strong", "mid", "weak"]);
    for (const g of view.groups) {
      const r = readUniverseRank(g.members[0].symbol, null, AS_OF, universe, groups)!;
      expect(g.standing).toBe(r.group!.groupPercentile);
      expect(g.members[0].universePercentile).toBe(r.percentile);
    }
  });

  it("lists each group's stocks strongest first", () => {
    const { universe, groups } = fixture();
    const strong = readGroupView(universe, AS_OF, groups)!.groups[0];
    expect(strong.members.map((m) => m.symbol)).toEqual(["HI9", "HI8", "HI7", "HI6", "HI5", "HI4", "HI3", "HI2", "HI1", "HI0"]);
    expect(strong.members.map((m) => m.groupRank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("counts breadth against the half of each range", () => {
    const { universe, groups } = fixture();
    const { breadth } = readGroupView(universe, AS_OF, groups)!;
    // Every stock read, grouped or not. Strong: all 10; middle: 0.50 to 0.58,
    // 5 of 10 (0.50 itself counts as the upper half); weak: none; the 90
    // ungrouped peers i/90: 45 of them from 0.5 up.
    expect(breadth).toEqual({ stocks: 120, stocksUpperHalf: 60, groups: 3, groupsUpperHalf: 1 });
  });

  it("lists a second share class once, as the rank counts it", () => {
    const { universe, groups } = fixture();
    universe.get("2026-10")!.bySymbol.set("GOOGL", 0.9);
    groups.set("GOOGL", { key: "strong", label: "Strong group" });
    groups.set("GOOG", { key: "strong", label: "Strong group" });
    const strong = readGroupView(universe, AS_OF, groups)!.groups.find((g) => g.key === "strong")!;
    expect(strong.members.filter((m) => m.symbol.startsWith("GOOG")).map((m) => m.symbol)).toEqual(["GOOGL"]);
  });

  it("gives equal positions the same rank in their group", () => {
    const { universe, groups } = fixture();
    universe.get("2026-10")!.bySymbol.set("HI8", 0.98);
    const strong = readGroupView(universe, AS_OF, groups)!.groups[0];
    expect(strong.members.slice(0, 3).map((m) => [m.symbol, m.groupRank])).toEqual([
      ["HI8", 1],
      ["HI9", 1],
      ["HI7", 3],
    ]);
  });

  it("matches the median the rank reads, with a group whose members partly read", () => {
    const { universe, groups } = fixture();
    // Five of the middle group's members missing from the month: 5 still read, enough to rank.
    for (let i = 0; i < 5; i++) universe.get("2026-10")!.bySymbol.delete(`MD${i}`);
    const mid = readGroupView(universe, AS_OF, groups)!.groups.find((g) => g.key === "mid")!;
    expect(mid.members).toHaveLength(5);
    expect(mid.standing).toBe(readUniverseRank("MD7", null, AS_OF, universe, groups)!.group!.groupPercentile);
    expect(mid.medianPosition).toBeCloseTo(0.54);
  });

  it("reads the New York month", () => {
    const { universe, groups } = fixture();
    // 23:30 UTC on Oct 31 is still October in New York.
    expect(readGroupView(universe, new Date("2026-10-31T23:30:00Z"), groups)?.month).toBe("2026-10");
    expect(readGroupView(universe, new Date("2026-11-01T05:00:00Z"), groups)).toBeNull();
  });

  it("reads nothing from a month too thin to rank", () => {
    const bySymbol = new Map([["HI0", 0.9]]);
    const thin: UniverseStrength = new Map([["2026-10", { sorted: [0.9], bySymbol }]]);
    expect(readGroupView(thin, AS_OF, new Map([["HI0", { key: "strong", label: "Strong group" }]]))).toBeNull();
  });

  it("puts a group too thin to rank last, and reads nothing without the month", () => {
    const { universe, groups } = fixture();
    universe.get("2026-10")!.bySymbol.set("T0", 0.99);
    groups.set("T0", { key: "thin", label: "Thin group" });
    const view = readGroupView(universe, AS_OF, groups)!;
    expect(view.groups.at(-1)).toMatchObject({ key: "thin", standing: null });
    expect(readGroupView(universe, new Date("2026-12-15T16:00:00Z"), groups)).toBeNull();
    expect(readGroupView(null, AS_OF, groups)).toBeNull();
  });
});
