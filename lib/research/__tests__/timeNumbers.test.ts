/**
 * A-OTHER-07 (Economic Forecaster, 1954, W001; research-only and
 * confluence-only): the number seven is mentioned in the Bible more than any
 * other, which "proves the importance of 7 in time periods, also 3, 9 and 12".
 * The text ranks 7 first and gives no order among 3, 9 and 12.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RANKED_TIME_NUMBERS, timeNumberRank } from "@/lib/research/timeNumbers";

describe("the ranked time numbers (A-OTHER-07)", () => {
  it("puts 7 first, then 3, 9 and 12 together", () => {
    expect(RANKED_TIME_NUMBERS).toEqual([
      { n: 7, rank: 1 },
      { n: 3, rank: 2 },
      { n: 9, rank: 2 },
      { n: 12, rank: 2 },
    ]);
    expect(timeNumberRank(7)).toBe(1);
    expect(timeNumberRank(12)).toBe(2);
    expect(timeNumberRank(5)).toBeNull();
  });

  it("is read by nothing outside research", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "node_modules" && e.name !== "__tests__") walk(p);
        } else if (/\.tsx?$/.test(p) && /timeNumbers|RANKED_TIME_NUMBERS/.test(readFileSync(p, "utf8"))) hits.push(path.relative(process.cwd(), p));
      }
    };
    for (const d of ["lib", "app", "components"]) walk(path.join(process.cwd(), d));
    expect(hits).toEqual(["lib/research/timeNumbers.ts"]);
  });
});
