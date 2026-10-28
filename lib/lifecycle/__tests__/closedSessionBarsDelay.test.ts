import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { closedSessionBars } from "@/lib/lifecycle/confirmNow";

// 15-minute bars from 9:30 ET on 2026-10-28 (13:30Z).
const bars: Bar[] = [0, 1, 2, 3].map((i) => ({ t: new Date(Date.parse("2026-10-28T13:30:00Z") + i * 900_000).toISOString(), o: 1, h: 1, l: 1, c: 1, v: 1 }));
const Q = 900_000;

describe("closedSessionBars under the feed's delay (DATA-DELAY-001)", () => {
  it("a 15-minute delay holds each bar until 15 minutes after its close", () => {
    // 10:06 ET: the 9:30-9:45 bar closed 9:45 and was usable at 10:00; the 9:45-10:00 bar is usable at 10:15.
    expect(closedSessionBars(bars, new Date("2026-10-28T14:06:00Z"), Q, undefined, Q).map((b) => b.t)).toEqual([bars[0].t]);
    expect(closedSessionBars(bars, new Date("2026-10-28T14:00:00Z"), Q, undefined, Q)).toHaveLength(1);
    expect(closedSessionBars(bars, new Date("2026-10-28T13:59:59Z"), Q, undefined, Q)).toHaveLength(0);
  });

  it("no delay reads every closed bar, as before", () => {
    expect(closedSessionBars(bars, new Date("2026-10-28T14:06:00Z"), Q)).toHaveLength(2);
  });
});
