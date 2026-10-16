import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { isRetiredByScan } from "@/lib/dailyScans";

describe("isRetiredByScan", () => {
  it("reads the scan's own stop-breach hold off the stored breakdown", () => {
    const retired = { detail: { breakdown: [{ key: "historicalSR", passed: true }, { key: "stopBreach", passed: false }] } };
    expect(isRetiredByScan(retired)).toBe(true);
  });

  it("keeps a row with no stop-breach entry, or none stored", () => {
    expect(isRetiredByScan({ detail: { breakdown: [{ key: "historicalSR", passed: false }] } })).toBe(false);
    expect(isRetiredByScan({ detail: null })).toBe(false);
    expect(isRetiredByScan({ detail: { breakdown: null } })).toBe(false);
  });
});
