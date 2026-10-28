/**
 * A long base counts for a side only once price has left it that way and
 * stands outside it (`readBaseLeft`, 2026-10-28; *Commodities* p. 62, Master
 * Course, W006 Rule 3(c) p.47).
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { BASE_LEFT_SESSIONS, readAccumulation, readBaseLeft } from "@/lib/gann/accumulation";
import { threePoints } from "@/lib/gann/pointScale";

const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString();
const bar = (i: number, c: number): Bar => ({ t: day(i), o: c, h: c + 0.5, l: c - 0.5, c, v: 1000 });

/** 80 calendar days inside 99.5-100.5 (well over 10 weeks), then `tail` closes. */
function base(tail: number[]): Bar[] {
  const bars = Array.from({ length: 80 }, (_, i) => bar(i, i % 2 === 0 ? 100 : 100.2));
  tail.forEach((c, j) => bars.push(bar(80 + j, c)));
  return bars;
}

const out = 100.5 + threePoints(100.5) + 1;
const under = 99.5 - threePoints(99.5) - 1;

describe("readBaseLeft", () => {
  it("reads nothing while price is still inside the base", () => {
    const bars = base([100.1]);
    expect(readAccumulation(bars)?.long).toBe(true);
    expect(readBaseLeft(bars)).toBeNull();
  });

  it("reads a long base left upward and held", () => {
    const left = readBaseLeft(base([out, out + 1, out + 0.5]));
    expect(left?.direction).toBe("up");
    expect(left?.sessionsAgo).toBe(2);
    expect(left?.weeks).toBeGreaterThanOrEqual(10);
  });

  it("drops it once a close comes back 3 points inside the crossed top", () => {
    expect(readBaseLeft(base([out, 100.5 - threePoints(100.5) - 0.1]))).toBeNull();
    // Back inside, but not by 3 points: still standing.
    expect(readBaseLeft(base([out, 100.4]))?.direction).toBe("up");
  });

  it("mirrors for a base broken downward", () => {
    expect(readBaseLeft(base([under, under - 1]))?.direction).toBe("down");
    expect(readBaseLeft(base([under, 99.5 + threePoints(99.5) + 0.1]))).toBeNull();
  });

  it("forgets a break more than the search window ago", () => {
    const tail = Array.from({ length: BASE_LEFT_SESSIONS + 1 }, (_, j) => out + 2 + j);
    expect(readBaseLeft(base(tail))).toBeNull();
  });

  it("reads nothing on a short history", () => {
    expect(readBaseLeft(base([]).slice(0, 15))).toBeNull();
  });
});
