/**
 * The replay's rule ladder reads the two-sided doubt hold (`twoSidedDoubt`,
 * `applyTwoSidedDoubtHold`) for a session in doubt, and not otherwise. The
 * doubt itself is forced here; `withTrend.test.ts` covers when it is read.
 */
import { describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

const doubt = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/scan/entrySelection", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scan/entrySelection")>("@/lib/scan/entrySelection");
  return { ...actual, twoSidedDoubt: () => doubt.on };
});

import { readSessionRules } from "@/lib/backtest/replay";

function daily(count: number): Bar[] {
  const out: Bar[] = [];
  const d = new Date("2023-01-02T00:00:00Z");
  while (out.length < count) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const i = out.length;
      const c = 50 + i * 0.05 + (i % 16 < 8 ? i % 8 : 8 - (i % 8)) * 0.8;
      out.push({ t: `${d.toISOString().slice(0, 10)}T00:00:00Z`, o: c - 0.2, h: c + 0.6, l: c - 0.6, c, v: 1_000_000 + (i % 5) * 50_000 });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("the two-sided doubt hold on the rule ladder", () => {
  const bars = daily(320);
  const date = bars[300].t.slice(0, 10);

  it("fires for a session in doubt and not for one out of it", () => {
    doubt.on = true;
    const inDoubt = readSessionRules("AAA", date, "bullish", { dailyBars: bars });
    doubt.on = false;
    const clear = readSessionRules("AAA", date, "bullish", { dailyBars: bars });
    expect(inDoubt.plan).toBe(true);
    expect(inDoubt.holdsFired).toContain("twoSidedDoubt");
    expect(clear.holdsFired).not.toContain("twoSidedDoubt");
  });
});
