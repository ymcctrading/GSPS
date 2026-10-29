import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DELIVERY_MAX_AGE_MS } from "@/lib/entitlements/delivery";
import { NOTIFICATION_DEDUP_HOURS } from "@/lib/notifications/intradayDelivery";
import { NOTIFICATION_RETENTION_DAYS } from "@/lib/ops/retention";

/**
 * The prune (migration 0138) keeps each table as long as lib/ops/retention.ts
 * says, and every window is longer than the longest read of its table.
 */

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/0138_notification_history_retention.sql"), "utf8");
const DAY_MS = 86_400_000;

function prunedDays(table: string): number[] {
  const re = new RegExp(`delete from public\\.${table} where \\w+ < now\\(\\) - interval '(\\d+) days'`, "g");
  return [...migration.matchAll(re)].map((m) => Number(m[1]));
}

describe("notification retention", () => {
  it("prunes each table once, at the figure retention.ts gives", () => {
    for (const [table, days] of Object.entries(NOTIFICATION_RETENTION_DAYS)) {
      expect(prunedDays(table), table).toEqual([days]);
    }
    expect(migration.match(/delete from public\./g)).toHaveLength(Object.keys(NOTIFICATION_RETENTION_DAYS).length);
  });

  it("keeps the bell past its readers: the once-a-move check, the digest and the dispatch window", () => {
    const bellMs = NOTIFICATION_RETENTION_DAYS.in_app_notifications * DAY_MS;
    expect(bellMs).toBeGreaterThan(30 * 3_600_000);
    expect(bellMs).toBeGreaterThan(DELIVERY_MAX_AGE_MS);
    for (const file of ["lib/notifications/intradayBell.ts", "app/api/trade-journal/daily-email/route.ts"]) {
      const windows = [...readFileSync(join(root, file), "utf8").matchAll(/(\d+) \* 3600_000/g)].map((m) => Number(m[1]));
      expect(windows.length, file).toBeGreaterThan(0);
      for (const h of windows) expect(h * 3_600_000, file).toBeLessThan(bellMs);
    }
  });

  it("keeps the push log past its dedupe and the deliveries past the decision gate's 30 days", () => {
    expect(NOTIFICATION_RETENTION_DAYS.notification_log * 24).toBeGreaterThan(NOTIFICATION_DEDUP_HOURS);
    const gate = readFileSync(join(root, "lib/ops/decision-gate.ts"), "utf8");
    const gateDays = [...gate.matchAll(/(\d+) \* DAY/g)].map((m) => Number(m[1]));
    expect(gateDays).toContain(30);
    expect(NOTIFICATION_RETENTION_DAYS.notification_deliveries).toBeGreaterThan(30);
  });

  it("keeps a transition as long as the deliveries that cascade from it", () => {
    expect(NOTIFICATION_RETENTION_DAYS.monitor_transitions).toBeGreaterThanOrEqual(NOTIFICATION_RETENTION_DAYS.notification_deliveries);
  });
});
