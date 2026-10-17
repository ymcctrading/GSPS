import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { describeWeeklyOneBar, walkWeeklyOneBar } from "../weeklyOneBar";
import { contextFactorsFor } from "../contextFactors";
import { describeDisclosedRules, readDisclosedRules } from "../disclosedRules";

/** One bar per week from Monday 2026-01-05, as [low, high]. */
function weeks(ranges: [number, number][]): Bar[] {
  return ranges.map(([l, h], i) => ({ t: new Date(Date.UTC(2026, 0, 5) + i * 7 * 86_400_000).toISOString(), o: l, h, l, c: (l + h) / 2, v: 1000 }));
}

describe("walkWeeklyOneBar (M-R8)", () => {
  it("turns red on the first week that breaks the prior week's low, even with a higher top", () => {
    const r = walkWeeklyOneBar(weeks([[10, 12], [11, 13], [10.5, 14]]));
    expect(r.turns.map((t) => t.to)).toEqual(["green", "red"]);
    expect(r.colour).toBe("red");
    expect(r.line).toBe(10.5);
    expect(r.turnedThisWeek).toBe(true);
  });

  it("stays red on a higher bottom without a higher top, and turns green only on both", () => {
    const red = weeks([[10, 12], [9, 11], [8, 10]]);
    expect(walkWeeklyOneBar(red).colour).toBe("red");
    expect(walkWeeklyOneBar(red).line).toBe(8);
    // A higher bottom inside the prior range: still red.
    const inside = walkWeeklyOneBar(weeks([[10, 12], [9, 11], [8, 10], [8.5, 9.5]]));
    expect(inside.colour).toBe("red");
    expect(inside.line).toBe(8);
    // A higher top on an equal bottom: still red.
    expect(walkWeeklyOneBar(weeks([[10, 12], [9, 11], [8, 10], [8, 10.5]])).colour).toBe("red");
    // A higher top and a higher bottom: green, at that week's high.
    const green = walkWeeklyOneBar(weeks([[10, 12], [9, 11], [8, 10], [8.5, 10.5]]));
    expect(green.colour).toBe("green");
    expect(green.line).toBe(10.5);
    expect(green.turns[green.turns.length - 1]).toMatchObject({ index: 3, to: "green" });
  });

  it("moves a green line up to each week's top and a red one down to each week's low", () => {
    const up = walkWeeklyOneBar(weeks([[10, 12], [11, 13], [12, 15], [12.5, 14]]));
    expect(up.colour).toBe("green");
    expect(up.line).toBe(15);
    expect(up.turnedThisWeek).toBe(false);
    const down = walkWeeklyOneBar(weeks([[10, 12], [9, 11], [7, 10]]));
    expect(down.line).toBe(7);
  });

  it("has no colour before the first turn", () => {
    expect(walkWeeklyOneBar(weeks([[10, 12], [10.5, 11.5]])).colour).toBeNull();
  });

  it("reaches the card and the context factor from daily bars", () => {
    // Ten weeks of a steady daily rise, then a week under the prior week's low.
    const daily: Bar[] = [];
    const start = Date.UTC(2026, 0, 5);
    for (let d = 0; d < 75; d++) {
      const t = start + d * 86_400_000;
      if ([0, 6].includes(new Date(t).getUTCDay())) continue;
      const c = d < 70 ? 100 + d * 0.5 : 120;
      daily.push({ t: new Date(t).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1000 });
    }
    const ctx = readDisclosedRules(daily, 120, null, new Date(daily[daily.length - 1].t));
    expect(ctx.weeklyOneBar?.colour).toBe("red");
    expect(describeDisclosedRules(ctx).some((l) => /^Weekly trend line: red/.test(l))).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 120).weeklyOneBarWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 120).weeklyOneBarWithTrade).toBe(false);
    expect(describeWeeklyOneBar(ctx.weeklyOneBar!)).toContain("sell signal");
  });
});
