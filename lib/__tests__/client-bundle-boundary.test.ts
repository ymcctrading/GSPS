/**
 * No client component may bundle the Gann engine (review finding R-033,
 * 2026-10-21). A `"use client"` file ships everything it imports at runtime,
 * so one value import of a constant from `lib/backtest/run.ts` sent the
 * replay, every Gann reader and the planetary ephemeris to the browser. This
 * walks the runtime import graph (type-only imports are erased) from every
 * client file and fails on any engine module it reaches. The allowed Gann
 * modules are small display helpers; add to the list only with a reason.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

const ALLOWED = new Set([
  "lib/backtest/scope.ts",
  "lib/gann/disclosedRulesEmpty.ts",
  "lib/gann/entryKind.ts",
  "lib/gann/evenFigures.ts",
  "lib/gann/pointScale.ts",
  "lib/gann/timeRecords.ts",
  "lib/gann/traderPrefs.ts",
]);

const FORBIDDEN = [
  /^lib\/gann\//,
  /^lib\/backtest\//,
  /^lib\/research\//,
  /^lib\/signals\/confluence\//,
  /^lib\/scanTicker\.ts$/,
  /^lib\/marketScan\.ts$/,
  /^lib\/scoring\/(score|pillars)\.ts$/,
  /^lib\/strat\/levels\.ts$/,
  /^lib\/scanner\/intraday\.ts$/,
];

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const p = base + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

const depsCache = new Map<string, string[]>();
function runtimeDeps(file: string): string[] {
  const cached = depsCache.get(file);
  if (cached) return cached;
  const src = fs.readFileSync(file, "utf8");
  const out: string[] = [];
  // `[\s\S]` rather than the `s` flag, which this project's target predates.
  for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:(?!;)[\s\S])*?from\s+["']([^"']+)["']/gm)) {
    const r = resolve(file, m[1]);
    if (r) out.push(r);
  }
  for (const m of src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) {
    const r = resolve(file, m[1]);
    if (r) out.push(r);
  }
  for (const m of src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    const r = resolve(file, m[1]);
    if (r) out.push(r);
  }
  depsCache.set(file, out);
  return out;
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "__tests__") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, acc);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

describe("client bundle boundary", () => {
  it("no client file reaches a Gann engine module through a runtime import", () => {
    const files = ["app", "components", "lib"].flatMap((d) => sourceFiles(path.join(ROOT, d)));
    const clients = files.filter((f) => /^\s*["']use client["']/.test(fs.readFileSync(f, "utf8")));
    expect(clients.length).toBeGreaterThan(20);
    const leaks: string[] = [];
    for (const client of clients) {
      const prev = new Map<string, string | null>([[client, null]]);
      const queue = [client];
      while (queue.length) {
        const f = queue.shift()!;
        for (const d of runtimeDeps(f)) {
          if (prev.has(d)) continue;
          prev.set(d, f);
          const rel = path.relative(ROOT, d).split(path.sep).join("/");
          if (!ALLOWED.has(rel) && FORBIDDEN.some((re) => re.test(rel))) {
            const chain: string[] = [];
            for (let c: string | null = d; c; c = prev.get(c) ?? null) chain.unshift(path.relative(ROOT, c));
            leaks.push(chain.join(" -> "));
            continue;
          }
          queue.push(d);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
