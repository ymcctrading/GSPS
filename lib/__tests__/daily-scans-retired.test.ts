import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { isRetiredByScan } from "@/lib/dailyScans";

describe("isRetiredByScan", () => {
  it("reads the scan's own stop-breach hold off the stored breakdown", () => {
    const retired = { detail: { breakdown: [{ key: "historicalSR", passed: true }, { key: "stopBreach", passed: false }] } };
    expect(isRetiredByScan(retired)).toBe(true);
  });

  it("reads the retired flag rows have stored since the breakdown left the table", () => {
    expect(isRetiredByScan({ detail: { retired: true } })).toBe(true);
    expect(isRetiredByScan({ detail: { retired: false } })).toBe(false);
  });

  it("keeps a row with no stop-breach entry, or none stored", () => {
    expect(isRetiredByScan({ detail: { breakdown: [{ key: "historicalSR", passed: false }] } })).toBe(false);
    expect(isRetiredByScan({ detail: null })).toBe(false);
    expect(isRetiredByScan({ detail: { breakdown: null } })).toBe(false);
  });
});
