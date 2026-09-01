import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Static assertion that every new learner-specific table added for GSPS
 * School enables RLS and carries an own-row policy — the same posture
 * check `npm run check:migrations` performs for filename hygiene, applied
 * here to the RLS shape itself. This is not a live-database RLS test (this
 * repo has no such integration-test convention to extend); it guards
 * against the migration file drifting away from the own-row pattern this
 * repo already uses everywhere else (0052, 0056), without needing a real
 * Postgres instance in CI.
 */
const MIGRATION_PATH = fileURLToPath(new URL("../../../supabase/migrations/0057_gsps_school_curriculum.sql", import.meta.url));
const sql = readFileSync(MIGRATION_PATH, "utf8");

const OWN_ROW_TABLES = ["school_learning_labs", "school_trader_operating_system"];

describe("0057 migration RLS", () => {
  for (const table of OWN_ROW_TABLES) {
    it(`enables RLS on ${table}`, () => {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`));
    });

    it(`${table} has an own-row policy keyed on auth.uid() = user_id`, () => {
      const tableIdx = sql.indexOf(`create table if not exists public.${table}`);
      expect(tableIdx).toBeGreaterThan(-1);
      const nextTableIdx = sql.indexOf("create table if not exists public.", tableIdx + 1);
      const scope = sql.slice(tableIdx, nextTableIdx === -1 ? undefined : nextTableIdx);
      expect(scope).toMatch(/create policy/);
      expect(scope).toMatch(/auth\.uid \(\) = user_id/);
    });

    it(`${table} grants no policy to any role other than the row owner (no public/anon select-all)`, () => {
      const tableIdx = sql.indexOf(`create table if not exists public.${table}`);
      const nextTableIdx = sql.indexOf("create table if not exists public.", tableIdx + 1);
      const scope = sql.slice(tableIdx, nextTableIdx === -1 ? undefined : nextTableIdx);
      expect(scope).not.toMatch(/using \(true\)/);
    });
  }

  it("adds wall_street_school_completed_at to live_trading_restrictions without dropping school_completed_at", () => {
    expect(sql).toMatch(/add column if not exists wall_street_school_completed_at timestamptz/);
    expect(sql).not.toMatch(/drop column[^\n]*(?<!wall_street_)school_completed_at/);
  });
});
