/**
 * A-TIME-31 (Tunnel Thru the Air pp. 371, 373; research-only and
 * confluence-only): "a day for a year".
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dayCountAsYears, yearCountAsDays } from "@/lib/research/dayForYear";

describe("a day for a year (A-TIME-31)", () => {
  it("reads Ezekiel's 40 days as 40 years, and back", () => {
    expect(dayCountAsYears("1918-11-11", 40)).toBe("1958-11");
    expect(yearCountAsDays("1918-11-11", 40)).toBe("1918-12-21");
    expect(dayCountAsYears("1918-11-11", 0)).toBe("1918-11");
  });

  it("refuses a bad anchor or count", () => {
    expect(dayCountAsYears("not a date", 40)).toBeNull();
    expect(dayCountAsYears("1918-11-11", -1)).toBeNull();
    expect(yearCountAsDays("1918-11-11", 1.5)).toBeNull();
  });

  it("is read by nothing outside research", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "node_modules" && e.name !== "__tests__") walk(p);
        } else if (/\.tsx?$/.test(p) && /dayForYear|dayCountAsYears|yearCountAsDays/.test(readFileSync(p, "utf8"))) hits.push(path.relative(process.cwd(), p));
      }
    };
    for (const d of ["lib", "app", "components"]) walk(path.join(process.cwd(), d));
    expect(hits).toEqual(["lib/research/dayForYear.ts"]);
  });
});
