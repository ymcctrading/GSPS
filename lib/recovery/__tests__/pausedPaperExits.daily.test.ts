import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

/**
 * The daily reading, isolated: `readGannExitFromBars` is replaced by a stub
 * that records the sessions it was given and answers from a script, so these
 * tests prove what the walk passes it and how it acts on the answer, not
 * Gann's rules themselves (those are tested in lib/gann).
 */
const calls: { dates: string[]; best: number | null }[] = [];
let answer: (dates: string[]) => { stop: number; stopReason: string; exit: { reason: string; note: string } | null } = () => ({
  stop: 95,
  stopReason: "initial",
  exit: null,
});
vi.mock("@/lib/trade/gann-exit-live", () => ({
  readGannExitFromBars: (input: { best: number | null }, daily: Bar[]) => {
    const dates = daily.map((d) => d.t.slice(0, 10));
    calls.push({ dates, best: input.best });
    return answer(dates);
  },
}));

const { walkPausedExit, firstPassAfterPause } = await import("@/lib/recovery/pausedPaperExits");

const bar = (t: string, o: number, h: number, l: number, c: number): Bar => ({ t, o, h, l, c, v: 1000 });
/** Completed daily sessions, stamped at 05:00 UTC (midnight ET), as the provider stamps them. */
const day = (date: string, o = 100, h = 101, l = 99, c = 100): Bar => bar(`${date}T05:00:00Z`, o, h, l, c);

const dailyThrough = (last: string): Bar[] => {
  const out: Bar[] = [];
  for (let d = new Date("2026-10-01T00:00:00Z"); d.toISOString().slice(0, 10) <= last; d = new Date(d.getTime() + 86_400_000)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(day(d.toISOString().slice(0, 10)));
  }
  return out;
};

const position = {
  side: "long" as const,
  entryPrice: 100,
  initialStop: 95,
  appliedStop: 95,
  highWater: 101,
  openedAt: "2026-10-30T15:00:00Z",
  lastManagedAt: "2026-10-30T19:30:00Z",
  tranches: [{ key: "runner" as const, qty: 4, target: null, done: false }],
};
const end = new Date("2026-11-27T21:00:00Z");

beforeEach(() => {
  calls.length = 0;
  answer = () => ({ stop: 95, stopReason: "initial", exit: null });
});

describe("walkPausedExit's daily reading", () => {
  it("reads only sessions before the bar's own day, so a day's own daily bar cannot act on its first bar", () => {
    // The stub signals an exit only when it is shown Nov 4's own session.
    answer = (dates) => ({ stop: 95, stopReason: "initial", exit: dates.includes("2026-11-04") ? { reason: "signal", note: "" } : null });
    const daily = dailyThrough("2026-11-26");
    const bars = [bar("2026-11-04T14:30:00Z", 100, 100.5, 99.5, 100)];
    const walk = walkPausedExit({ position, bars, daily, end });
    expect(calls).toHaveLength(1);
    expect(calls[0].dates.at(-1)).toBe("2026-11-03");
    expect(walk.state).toBe("open");
    expect(walk.fills).toEqual([]);
  });

  it("leaves at the open of the first bar of the session after the signal", () => {
    answer = (dates) => ({ stop: 95, stopReason: "initial", exit: dates.includes("2026-11-04") ? { reason: "signal", note: "" } : null });
    const daily = dailyThrough("2026-11-26");
    const bars = [bar("2026-11-04T14:30:00Z", 100, 100.5, 99.5, 100), bar("2026-11-05T14:30:00Z", 103, 104, 102, 103)];
    const walk = walkPausedExit({ position, bars, daily, end });
    expect(walk.fills).toEqual([{ key: "runner", qty: 4, price: 103, at: "2026-11-05T14:30:00Z", reason: "exit signal: signal" }]);
  });

  it("adopts a tightened stop and closes when a later bar breaks it, never loosening it after", () => {
    // Nov 4's reading tightens to 99; Nov 5's reading offers a looser 96, which is ignored.
    answer = (dates) => (dates.at(-1) === "2026-11-03" ? { stop: 99, stopReason: "last_reaction", exit: null } : { stop: 96, stopReason: "initial", exit: null });
    const daily = dailyThrough("2026-11-26");
    const bars = [
      bar("2026-11-04T14:30:00Z", 101, 102, 100, 101),
      bar("2026-11-05T14:30:00Z", 100, 100.5, 98.5, 99), // breaks 99, not 96
    ];
    const walk = walkPausedExit({ position, bars, daily, end });
    expect(walk.fills).toEqual([{ key: "runner", qty: 4, price: 99, at: "2026-11-05T14:30:00Z", reason: "stop (last_reaction)" }]);
    expect(walk.rMultiple).toBeCloseTo(-0.2);
    // The best price handed to each reading is the walk's best so far, in bar order.
    expect(calls.map((c) => c.best)).toEqual([101, 102]);
  });

  it("takes no reading with fewer than 10 completed sessions, as the live manager does", () => {
    answer = () => ({ stop: 99, stopReason: "last_reaction", exit: null });
    const daily = dailyThrough("2026-10-09").slice(-5);
    const bars = [bar("2026-11-04T14:30:00Z", 100, 100.5, 98.5, 99)];
    const walk = walkPausedExit({ position, bars, daily, end });
    expect(calls).toHaveLength(0);
    expect(walk.state).toBe("open");
  });
});

describe("firstPassAfterPause's reading", () => {
  it("reads every session before the end's day with the month's best, and closes only on the last price", () => {
    answer = () => ({ stop: 99, stopReason: "last_reaction", exit: null });
    const daily = dailyThrough("2026-11-27");
    const bars = [bar("2026-11-05T14:30:00Z", 100, 100.5, 90, 99), bar("2026-11-20T15:00:00Z", 110, 115, 109, 112)];
    const kept = firstPassAfterPause({ position, bars, daily, end, lastPrice: 112 });
    expect(calls).toHaveLength(1);
    expect(calls[0].dates.at(-1)).toBe("2026-11-26");
    expect(calls[0].best).toBe(115);
    expect(kept.fills).toEqual([]); // the Nov 5 break of 95 is never seen
    expect(kept.stop).toBe(99);

    calls.length = 0;
    const closed = firstPassAfterPause({ position, bars, daily, end, lastPrice: 98 });
    expect(closed.fills).toEqual([{ key: "runner", qty: 4, price: 98, reason: "stop" }]);
  });
});
