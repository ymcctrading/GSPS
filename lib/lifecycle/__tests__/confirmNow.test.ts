import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { closedSessionBars, confirmationFromBars } from "../confirmNow";

const Q = 15 * 60 * 1000;
function bar(t: string, o: number, h: number, l: number, c: number): Bar {
  return { t, o, h, l, c, v: 1000 };
}

describe("closedSessionBars", () => {
  it("keeps only the latest session's closed bars", () => {
    const bars = [
      bar("2026-09-24T19:45:00Z", 1, 1, 1, 1),
      bar("2026-09-25T13:30:00Z", 1, 1, 1, 1),
      bar("2026-09-25T13:45:00Z", 1, 1, 1, 1),
      bar("2026-09-25T14:00:00Z", 1, 1, 1, 1), // still forming at 14:10
    ];
    const out = closedSessionBars(bars, new Date("2026-09-25T14:10:00Z"), Q);
    expect(out.map((b) => b.t)).toEqual(["2026-09-25T13:30:00Z", "2026-09-25T13:45:00Z"]);
  });
});

describe("confirmationFromBars", () => {
  const T = 100;
  it("reports the stage reached and is ready only after the full sequence", () => {
    const touch = bar("2026-09-25T13:30:00Z", 99, 100.1, 98.8, 99.5);
    const brk = bar("2026-09-25T13:45:00Z", 99.5, 101, 99.4, 100.8);
    const retest = bar("2026-09-25T14:00:00Z", 100.8, 100.9, 99.9, 100.3);
    const hold = bar("2026-09-25T14:15:00Z", 100.3, 101.5, 100.2, 101.4);
    expect(confirmationFromBars([touch], "bullish", T).stage).toBe("touched");
    expect(confirmationFromBars([touch, brk], "bullish", T).stage).toBe("broken");
    expect(confirmationFromBars([touch, brk, retest], "bullish", T).stage).toBe("retested");
    const done = confirmationFromBars([touch, brk, retest, hold], "bullish", T);
    expect(done.ready).toBe(true);
    expect(done.stage).toBe("confirmed");
  });

  it("is not ready when price never reached the level", () => {
    const r = confirmationFromBars([bar("2026-09-25T13:30:00Z", 95, 96, 94, 95)], "bullish", T);
    expect(r).toMatchObject({ ready: false, stage: "not_touched" });
  });
});
