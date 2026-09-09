import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { findPivots } from "../pivots";

function bar(t: string, h: number, l: number): Bar {
  return { t, o: (h + l) / 2, h, l, c: (h + l) / 2, v: 1000 };
}

describe("findPivots", () => {
  it("carries occurrence/confirmation timestamps for the blueprint's audit fields", () => {
    // A clean V: lows descend to bar 3, then rise. Bar 3 is a pivot low with strength 2.
    const bars: Bar[] = [
      bar("2026-01-01", 105, 100),
      bar("2026-01-02", 104, 99),
      bar("2026-01-03", 103, 98),
      bar("2026-01-04", 102, 90), // pivot low
      bar("2026-01-05", 103, 98),
      bar("2026-01-06", 104, 99),
      bar("2026-01-07", 105, 100),
    ];
    const pivots = findPivots(bars, 2);
    const low = pivots.find((p) => p.kind === "low");
    expect(low).toBeDefined();
    expect(low!.occurrenceTimestamp).toBe("2026-01-04");
    // Confirmed by the bar `strength` positions after the pivot bar (index 3 + 2 = 5).
    expect(low!.confirmationTimestamp).toBe("2026-01-06");
  });

  it("never returns a pivot without both timestamps populated", () => {
    const bars: Bar[] = Array.from({ length: 10 }, (_, i) =>
      bar(`2026-01-${String(i + 1).padStart(2, "0")}`, 100 + Math.sin(i) * 5, 95 + Math.sin(i) * 5),
    );
    const pivots = findPivots(bars, 2);
    for (const p of pivots) {
      expect(p.occurrenceTimestamp).toBeTruthy();
      expect(p.confirmationTimestamp).toBeTruthy();
    }
  });
});
