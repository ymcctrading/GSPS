import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimal in-memory fake covering exactly the query shapes
 * lib/school/curriculum-service.ts issues — select/eq/maybeSingle, and
 * upsert with onConflict treated as an update-or-insert on the given
 * column list. Same shape as lib/lifecycle/__tests__/store.test.ts's
 * fakeSupabase, generalized to multiple named tables for this module's
 * cross-table gate writes (school_lesson_progress, school_learning_labs,
 * promotion_progress, live_trading_restrictions).
 */
export function fakeSupabase(seed: Record<string, Record<string, unknown>[]> = {}) {
  const tables: Record<string, Record<string, unknown>[]> = { ...seed };

  function rowsFor(name: string): Record<string, unknown>[] {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  function table(name: string) {
    const rows = rowsFor(name);
    return {
      select() {
        const filters: ((row: Record<string, unknown>) => boolean)[] = [];
        const chain = {
          eq(col: string, val: unknown) {
            filters.push((r) => r[col] === val);
            return chain;
          },
          maybeSingle() {
            const matched = rows.filter((r) => filters.every((f) => f(r)));
            return Promise.resolve({ data: matched[0] ?? null, error: null });
          },
          single() {
            const matched = rows.filter((r) => filters.every((f) => f(r)));
            return Promise.resolve({ data: matched[0] ?? null, error: matched[0] ? null : { message: "not found" } });
          },
          then(resolve: (v: { data: Record<string, unknown>[]; error: null }) => void) {
            resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null });
          },
        };
        return chain;
      },
      upsert(row: Record<string, unknown>, opts?: { onConflict?: string }) {
        const conflictCols = opts?.onConflict?.split(",") ?? ["id"];
        const existingIdx = rows.findIndex((r) => conflictCols.every((c) => r[c] === row[c]));
        const withId = { id: row.id ?? randomUUID(), ...row };
        if (existingIdx >= 0) {
          rows[existingIdx] = { ...rows[existingIdx], ...withId };
        } else {
          rows.push(withId);
        }
        return Promise.resolve({ error: null });
      },
    };
  }

  const client = {
    from(name: string) {
      return table(name);
    },
  } as unknown as SupabaseClient;

  return { client, tables };
}
