import { describe, expect, it } from "vitest";
import { evenSquare } from "@/lib/gann/evenSquare";

/**
 * Cells of the p.65 "Even Squares for Cotton & Eggs" chart read with every
 * digit clear (W007 visuals re-inspection), row and column from 1 at the top
 * left, the figure upright.
 */
const READ: [number, number, number][] = [
  [1, 3, 6510], [1, 4, 6480], [1, 16, 6120], [2, 1, 6600], [2, 3, 4890], [2, 16, 6090],
  [3, 5, 3450], [3, 16, 6060], [4, 7, 2250], [4, 8, 2220], [5, 6, 1380], [5, 16, 6000],
  [6, 5, 1440], [6, 6, 720], [6, 10, 600], [7, 6, 750], [7, 7, 270], [7, 8, 240],
  [7, 9, 210], [7, 10, 180], [7, 11, 540], [8, 7, 300], [8, 10, 150], [8, 11, 510],
  [9, 7, 330], [9, 11, 1080], [9, 12, 1920], [9, 13, 3000], [9, 14, 4320], [9, 15, 5880],
  [9, 16, 7680], [10, 7, 360], [10, 8, 390], [10, 9, 420], [10, 10, 450], [10, 11, 1050],
  [11, 7, 900], [11, 11, 1020], [12, 4, 2580], [13, 5, 2640], [14, 16, 7530], [15, 3, 5340],
  [16, 1, 7020], [16, 16, 7470],
];

describe("C-LEVELS-12: the Even Square of 16 at 30 points a cell (research only)", () => {
  const grid = evenSquare(16, 30);

  it("matches every clearly read cell of the chart", () => {
    const misses = READ.filter(([r, c, v]) => grid[r - 1][c - 1] !== v);
    expect(misses).toEqual([]);
  });

  it("puts the even squares 4, 16, 36 ... 256 along the row under the centre", () => {
    expect([9, 10, 11, 12, 13, 14, 15, 16].map((c) => grid[8][c - 1] / 30)).toEqual([4, 16, 36, 64, 100, 144, 196, 256]);
  });

  it("is a research grid with no consumer", async () => {
    const fs = await import("node:fs");
    const { execSync } = await import("node:child_process");
    const hits = execSync("grep -rln evenSquare lib app components --include=*.ts --include=*.tsx || true").toString().trim().split("\n").filter(Boolean);
    expect(hits.filter((f) => !f.includes("__tests__") && f !== "lib/gann/evenSquare.ts")).toEqual([]);
    expect(fs.existsSync("lib/gann/evenSquare.ts")).toBe(true);
  });
});
