import { describe, expect, it } from "vitest";
import {
  applyDashboardLayout,
  DASHBOARD_SECTION_IDS,
  DASHBOARD_SECTIONS,
  DashboardLayoutSchema,
  DEFAULT_DASHBOARD_LAYOUT,
  moveDashboardSection,
  normalizeDashboardLayout,
  readDashboardLayout,
  visibleDashboardSections,
} from "@/lib/dashboard/sections";

describe("Dashboard sections", () => {
  it("lists every section once, in the default order, with the Novice summary first", () => {
    expect(DASHBOARD_SECTIONS.map((s) => s.id)).toEqual([...DASHBOARD_SECTION_IDS]);
    expect(DEFAULT_DASHBOARD_LAYOUT.order[0]).toBe("summary");
    expect(DEFAULT_DASHBOARD_LAYOUT.hidden).toEqual([]);
  });

  it("reads nothing stored as the default layout", () => {
    expect(readDashboardLayout(null)).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    expect(readDashboardLayout({})).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    expect(readDashboardLayout({ dashboard: "junk" })).toEqual(DEFAULT_DASHBOARD_LAYOUT);
  });

  it("keeps the member's order and drops unknown or repeated ids", () => {
    const order = ["setups", "bogus", "setups", ...DASHBOARD_SECTION_IDS];
    const layout = normalizeDashboardLayout({ order, hidden: ["calendar", "calendar", 7] });
    expect(layout.order[0]).toBe("setups");
    expect(layout.order).toHaveLength(DASHBOARD_SECTION_IDS.length);
    expect(new Set(layout.order).size).toBe(DASHBOARD_SECTION_IDS.length);
    expect(layout.hidden).toEqual(["calendar"]);
  });

  it("puts a section the stored order doesn't name just after its default predecessor, shown", () => {
    // Saved before "intraday" existed, with setups moved to the top.
    const stored = DASHBOARD_SECTION_IDS.filter((id) => id !== "intraday" && id !== "setups");
    const layout = normalizeDashboardLayout({ order: ["setups", ...stored], hidden: [] });
    expect(layout.order.indexOf("intraday")).toBe(layout.order.indexOf("setups") + 1);
    expect(layout.order).toHaveLength(DASHBOARD_SECTION_IDS.length);

    // A missing first section goes to the top.
    const noSummary = normalizeDashboardLayout({ order: DASHBOARD_SECTION_IDS.slice(1), hidden: [] });
    expect(noSummary.order).toEqual([...DASHBOARD_SECTION_IDS]);
  });

  it("renders only the shown sections, in order", () => {
    const layout = { order: [...DASHBOARD_SECTION_IDS].reverse(), hidden: ["calendar" as const, "summary" as const] };
    const visible = visibleDashboardSections(layout);
    expect(visible[0]).toBe("intraday");
    expect(visible).not.toContain("calendar");
    expect(visible).not.toContain("summary");
    expect(visible).toHaveLength(DASHBOARD_SECTION_IDS.length - 2);
  });

  it("moves a section one place and leaves the ends alone", () => {
    const order = [...DASHBOARD_SECTION_IDS];
    expect(moveDashboardSection(order, "school", -1).slice(0, 2)).toEqual(["school", "summary"]);
    expect(moveDashboardSection(order, "summary", -1)).toEqual(order);
    expect(moveDashboardSection(order, "calendar", 1)).toEqual(order);
    expect(order).toEqual([...DASHBOARD_SECTION_IDS]);
  });

  it("merges into the prefs it read, keeping every other key", () => {
    const { prefs, layout } = applyDashboardLayout(
      { schoolPicks: { symbols: [] }, gannRules: { restReminder: true } },
      { order: ["setups", ...DASHBOARD_SECTION_IDS.filter((id) => id !== "setups")], hidden: ["walkthrough"] },
    );
    expect(prefs.schoolPicks).toEqual({ symbols: [] });
    expect(prefs.gannRules).toEqual({ restReminder: true });
    expect(prefs.dashboard).toEqual(layout);
    expect(layout.order[0]).toBe("setups");
    expect(layout.order).toHaveLength(DASHBOARD_SECTION_IDS.length);
  });

  it("refuses a body with unknown ids, repeats or the wrong shape", () => {
    expect(DashboardLayoutSchema.safeParse({ order: ["setups"], hidden: [] }).success).toBe(true);
    expect(DashboardLayoutSchema.safeParse({ order: ["nope"], hidden: [] }).success).toBe(false);
    expect(DashboardLayoutSchema.safeParse({ order: ["setups", "setups"], hidden: [] }).success).toBe(false);
    expect(DashboardLayoutSchema.safeParse({ order: [], hidden: ["saved", "saved"] }).success).toBe(false);
    expect(DashboardLayoutSchema.safeParse(null).success).toBe(false);
  });
});
