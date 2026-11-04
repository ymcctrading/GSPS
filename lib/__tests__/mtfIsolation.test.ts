import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MTF-R0.1 is owner-private research (lib/research/mtfCandidate.ts): nothing
 * on the verdict, scan, plan, order or member-facing path may import it.
 */
const root = path.resolve(__dirname, "../..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return f === "node_modules" || f === "__tests__" ? [] : files(p);
    return /\.(ts|tsx|mjs|js)$/.test(f) ? [p] : [];
  });
}

describe("MTF-R0.1 isolation", () => {
  it("is imported only by research modules, their tests and the runner script", () => {
    const offenders = ["app", "components", "lib"]
      .flatMap((d) => files(path.join(root, d)))
      .filter((f) => !f.includes(`${path.sep}lib${path.sep}research${path.sep}`))
      .filter((f) => /research\/mtf/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});
