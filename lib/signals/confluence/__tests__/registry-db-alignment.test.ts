import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONFLUENCE_MODULES } from "@/lib/signals/confluence/registry";
import { DEFAULT_ENABLED_MARKETS } from "@/lib/signals/confluence/flags";

/**
 * Makes registry.ts's "can never drift between the code that runs it and
 * the row that documents it" claim about `strategy_modules` actually
 * enforced, instead of an unchecked comment (2026-09-17 orphan-module
 * audit). PR #237 / migration 0065 fixed one real drift (banned
 * terminology reintroduced into the seeded rows) by hand and said plainly
 * that "nothing reads this table today, and nothing reads CONFLUENCE_MODULES
 * either" — this test is what makes both of those non-facts go away for the
 * fields a migration can actually assert statically: it parses the
 * `strategy_modules` seed literals straight out of the migration SQL (0048's
 * insert, with 0065's later updates applied on top, in file order) and
 * fails if they disagree with `CONFLUENCE_MODULES`.
 *
 * This cannot see a live database row — no test in this repo can, and that
 * asymmetry is exactly what let the original drift go undetected for weeks
 * (see 0065's own header). What it *can* guarantee is that every migration
 * ever applied to a fresh environment (a new preview branch, a restore, a
 * new project) seeds `strategy_modules` with values that match the code at
 * the moment that migration was written — which is the guarantee
 * registry.ts's comment actually needs to be true.
 */

interface ParsedModuleRow {
  moduleId: string;
  moduleType?: string;
  displayName?: string;
  authorizedSource?: string;
  version?: string;
  enabledByMarket?: string[];
}

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

function sqlUnescape(literal: string): string {
  return literal.replace(/''/g, "'");
}

/** Parses 0048's multi-row `insert into public.strategy_modules (...) values (...), (...)`. */
function parseInsertRows(sql: string): ParsedModuleRow[] {
  const insertMatch = sql.match(
    /insert into public\.strategy_modules[\s\S]*?values\s*([\s\S]*?)\non conflict/,
  );
  if (!insertMatch) return [];
  const valuesBlock = insertMatch[1];
  // Each row is a parenthesized tuple; module_id/module_type/display_name/
  // authorized_source/version appear as the first five positional values in
  // 0048's own column list.
  const rowPattern = /\(\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'((?:[^']|'')*)',\s*'([^']+)',\s*array\[([^\]]*)\]/g;
  const rows: ParsedModuleRow[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowPattern.exec(valuesBlock)) !== null) {
    rows.push({
      moduleId: m[1],
      moduleType: m[2],
      displayName: m[3],
      authorizedSource: sqlUnescape(m[4]),
      version: m[5],
      enabledByMarket: m[6].split(",").map((s) => s.trim().replace(/^'|'$/g, "")),
    });
  }
  return rows;
}

/** Parses 0065's `update ... set display_name = '...', authorized_source = '...' where module_id = '...'`. */
function parseUpdates(sql: string): Array<{ moduleId: string; displayName?: string; authorizedSource?: string }> {
  const updatePattern =
    /update public\.strategy_modules\s*\nset display_name = '([^']*)',\s*\n\s*authorized_source = '((?:[^']|'')*)'\s*\nwhere module_id = '([^']+)'/g;
  const updates: Array<{ moduleId: string; displayName?: string; authorizedSource?: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = updatePattern.exec(sql)) !== null) {
    updates.push({ displayName: m[1], authorizedSource: sqlUnescape(m[2]), moduleId: m[3] });
  }
  return updates;
}

function effectiveSeedRows(): ParsedModuleRow[] {
  const base = parseInsertRows(
    readFileSync(path.join(MIGRATIONS_DIR, "0048_gann_sara_confluence_modules.sql"), "utf8"),
  );
  const updates = parseUpdates(
    readFileSync(path.join(MIGRATIONS_DIR, "0065_strategy_modules_terminology_alignment.sql"), "utf8"),
  );
  for (const update of updates) {
    const row = base.find((r) => r.moduleId === update.moduleId);
    if (row) {
      if (update.displayName !== undefined) row.displayName = update.displayName;
      if (update.authorizedSource !== undefined) row.authorizedSource = update.authorizedSource;
    }
  }
  return base;
}

describe("strategy_modules seed vs. CONFLUENCE_MODULES", () => {
  const seedRows = effectiveSeedRows();

  it("parsed at least one seed row from each migration (parser sanity check)", () => {
    expect(seedRows.length).toBeGreaterThanOrEqual(2);
  });

  it("has exactly one seed row per registered module, and no extra rows", () => {
    const seedIds = seedRows.map((r) => r.moduleId).sort();
    const codeIds = CONFLUENCE_MODULES.map((m) => m.moduleId).sort();
    expect(seedIds).toEqual(codeIds);
  });

  for (const confluenceModule of CONFLUENCE_MODULES) {
    describe(confluenceModule.moduleId, () => {
      const row = seedRows.find((r) => r.moduleId === confluenceModule.moduleId);

      it("has a seed row", () => {
        expect(row).toBeDefined();
      });

      it("module_type matches moduleType", () => {
        expect(row?.moduleType).toBe(confluenceModule.moduleType);
      });

      it("display_name matches displayName (post-0065)", () => {
        expect(row?.displayName).toBe(confluenceModule.displayName);
      });

      it("authorized_source matches authorizedSource (post-0065)", () => {
        expect(row?.authorizedSource).toBe(confluenceModule.authorizedSource);
      });

      it("version matches version", () => {
        expect(row?.version).toBe(confluenceModule.version);
      });

      it("enabled_by_market matches lib/signals/confluence/flags.ts's declared markets", () => {
        const expectedMarkets = [
          ...(DEFAULT_ENABLED_MARKETS[confluenceModule.moduleId as keyof typeof DEFAULT_ENABLED_MARKETS] ?? []),
        ].sort();
        expect((row?.enabledByMarket ?? []).slice().sort()).toEqual(expectedMarkets);
      });
    });
  }
});
