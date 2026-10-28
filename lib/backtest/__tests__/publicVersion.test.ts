import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { publicVersionLabel, STORED_STRATEGY_VERSION } from "@/lib/backtest/publicVersion";
import { STRATEGY_VERSION } from "@/lib/backtest/strategyVersion";

describe("publicVersionLabel", () => {
  it("gives the date and a stable five-letter tag, never the name", () => {
    const label = publicVersionLabel("2026-10-28-plan-at-close-on-plan-expiry");
    expect(label).toMatch(/^2026-10-28 · [0-9a-z]{5}$/);
    expect(publicVersionLabel("2026-10-28-plan-at-close-on-plan-expiry")).toBe(label);
    expect(publicVersionLabel("2026-10-28-gann-p1-long-counts")).not.toBe(label);
  });

  it("returns a label unchanged, so stored rows and names compare", () => {
    const label = publicVersionLabel(STRATEGY_VERSION);
    expect(publicVersionLabel(label)).toBe(label);
    expect(STORED_STRATEGY_VERSION).toBe(label);
    expect(STORED_STRATEGY_VERSION).not.toMatch(/gann/i);
  });

  it("labels a version with no date and passes null through", () => {
    expect(publicVersionLabel("baseline")).toMatch(/^v-[0-9a-z]{5}$/);
    expect(publicVersionLabel(null)).toBeNull();
  });

  // Migration 0128 relabels the old rows with an SQL copy of this function;
  // these are its outputs, checked against production on 2026-10-28.
  it("matches the migration's SQL copy", () => {
    expect(readFileSync("supabase/migrations/0128_neutral_strategy_version_labels.sql", "utf8")).toMatch(/2166136261/);
    const fromSql: Record<string, string> = {
      "2026-08-27-role-aware-proximity": "2026-08-27 · lanjy",
      "2026-09-28-gann-first-days": "2026-09-28 · x6nvi",
      "2026-10-23-gann-final-stage-after-advance": "2026-10-23 · 5gtwu",
      "2026-10-28-plan-at-close-on-plan-expiry": "2026-10-28 · oly33",
      baseline: "v-ps56q",
    };
    for (const [name, label] of Object.entries(fromSql)) expect(publicVersionLabel(name)).toBe(label);
  });
});
