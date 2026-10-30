import { describe, expect, it } from "vitest";
import {
  buildWeeklyDigest,
  isFirstWeekOfMonth,
  isWeeklyDigestDay,
  trackedOutcomes,
  weekStartKey,
  weekTrades,
  weeklyGroups,
  type DigestTrade,
} from "@/lib/notifications/weeklyDigest";
import type { GroupView } from "@/lib/scanner/groupView";

// The cron fires at 22:00 UTC: 6 PM ET on a Friday in October (EDT).
const FRIDAY = new Date("2026-10-30T22:00:00Z");

function view(month: string, labels: string[]): GroupView {
  return {
    month,
    groups: [
      ...labels.map((label, i) => ({
        key: label.toLowerCase(),
        label,
        standing: 1 - i / labels.length,
        medianPosition: 0.5,
        members: [],
      })),
      { key: "unranked", label: "Unranked", standing: null, medianPosition: 0.5, members: [] },
    ],
    breadth: { stocks: 0, stocksUpperHalf: 0, groups: 0, groupsUpperHalf: 0 },
  };
}

describe("weekly digest timing", () => {
  it("goes out on Friday in New York and reads the week from Monday", () => {
    expect(isWeeklyDigestDay(FRIDAY)).toBe(true);
    expect(isWeeklyDigestDay(new Date("2026-10-29T22:00:00Z"))).toBe(false);
    expect(weekStartKey(FRIDAY)).toBe("2026-10-26");
    // A Sunday belongs to the week that began the Monday before it.
    expect(weekStartKey(new Date("2026-11-01T15:00:00Z"))).toBe("2026-10-26");
    // In winter (EST) the cron's 22:00 UTC is 5 PM, still Friday.
    expect(isWeeklyDigestDay(new Date("2026-12-04T22:00:00Z"))).toBe(true);
  });

  it("calls the month's first Friday the first week", () => {
    expect(isFirstWeekOfMonth(new Date("2026-11-06T22:00:00Z"))).toBe(true);
    expect(isFirstWeekOfMonth(FRIDAY)).toBe(false);
  });
});

describe("weekTrades", () => {
  const t = (exit: string | null, pl: number | null, outcome: DigestTrade["outcome"] = "profit"): DigestTrade => ({
    exit_timestamp: exit,
    outcome,
    profit_loss_dollars: pl,
  });

  it("counts the member's own trades closed since Monday, New York time", () => {
    const week = weekTrades(
      [
        t("2026-10-26T14:00:00Z", 120.5),
        t("2026-10-28T19:00:00Z", -40.25, "loss"),
        t("2026-10-30T15:00:00Z", 0),
        // Sunday night ET, the week before: not counted.
        t("2026-10-26T03:30:00Z", 999),
        t(null, 50),
        t("2026-10-29T15:00:00Z", 10, "pending"),
        t("2026-10-29T15:00:00Z", Number.NaN),
      ],
      FRIDAY,
    );
    expect(week).toEqual({ closed: 4, gains: 1, losses: 1, even: 2, net: 80.25 });
  });
});

describe("trackedOutcomes", () => {
  it("counts each symbol once, at its latest state", () => {
    const out = trackedOutcomes([
      { symbol: "AAPL", state: "EXECUTE" },
      { symbol: "AAPL", state: "WATCH" },
      { symbol: "MSFT", state: "INVALIDATED" },
      { symbol: "NVDA", state: "EXPIRED" },
    ]);
    expect(out).toMatchObject({ EXECUTE: 1, WATCH: 0, INVALIDATED: 1, EXPIRED: 1, NO_SETUP: 0, total: 3 });
  });
});

describe("weeklyGroups", () => {
  const now = view("2026-11", ["Banks", "Chips", "Oil", "Retail", "Software", "Utilities", "Autos"]);
  const before = view("2026-10", ["Chips", "Oil", "Banks", "Software", "Retail", "Autos", "Utilities"]);

  it("names the strongest and weakest ranked groups", () => {
    const g = weeklyGroups(now, before, false)!;
    expect(g.strongest).toEqual(["Banks", "Chips", "Oil"]);
    expect(g.weakest).toEqual(["Autos", "Utilities", "Software"]);
    expect(g.movedUp).toEqual([]);
    expect(g.movedDown).toEqual([]);
  });

  it("names the moves since last month in the month's first week only", () => {
    const g = weeklyGroups(now, before, true)!;
    expect(g.movedUp[0]).toEqual({ label: "Banks", places: 2 });
    expect(g.movedDown.map((m) => m.label)).toEqual(["Autos", "Chips", "Oil"]);
    // The same month twice is no move.
    expect(weeklyGroups(now, now, true)!.movedUp).toEqual([]);
  });

  it("reads nothing without a reading", () => {
    expect(weeklyGroups(null, before, true)).toBeNull();
  });
});

describe("buildWeeklyDigest", () => {
  it("writes the week in plain lines with no rate or method", () => {
    const d = buildWeeklyDigest({
      now: FRIDAY,
      trades: [
        { exit_timestamp: "2026-10-27T15:00:00Z", outcome: "profit", profit_loss_dollars: 1250 },
        { exit_timestamp: "2026-10-28T15:00:00Z", outcome: "loss", profit_loss_dollars: -300 },
      ],
      monitors: [
        { symbol: "AAPL", state: "EXECUTE" },
        { symbol: "MSFT", state: "INVALIDATED" },
      ],
      groups: weeklyGroups(view("2026-10", ["Banks", "Chips", "Oil", "Retail"]), null, false),
    });
    expect(d.title).toBe("Your week on GSPS: week of Oct 26");
    expect(d.lines[0]).toBe("You closed 2 trades this week (1 with a gain and 1 with a loss), net +$950.00.");
    expect(d.lines[1]).toBe("Setups you tracked this week: 2. Now 1 at Execute and 1 broke its plan.");
    expect(d.lines[2]).toBe("Industry groups this month, strongest: Banks, Chips and Oil; weakest: Retail.");
    expect(d.pushBody).toBe("2 trades closed, net +$950.00, 2 tracked setups. Your weekly review is in the app.");

    const text = [d.title, ...d.lines, d.pushBody].join(" ");
    expect(text).not.toMatch(/%|rate|expectancy|average/i);
  });

  it("says plainly when the member's week was quiet", () => {
    const d = buildWeeklyDigest({ now: FRIDAY, trades: [], monitors: [], groups: null });
    expect(d.lines).toEqual(["You closed no trades this week.", "No setups you tracked moved this week."]);
    expect(d.pushBody).toBe("No trades closed. Your weekly review is in the app.");
  });
});
