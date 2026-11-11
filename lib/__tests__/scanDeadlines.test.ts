import { describe, expect, it } from "vitest";
import { RENDER_SCAN_DEADLINE_SCALE, scanDeadlines } from "@/lib/marketScan";

describe("scanDeadlines", () => {
  it("keeps the 60-second product budget's deadlines on Vercel and Cloud Run", () => {
    for (const host of ["vercel", "cloud_run"] as const) {
      expect(scanDeadlines(host)).toEqual({ fullPassFetch: 40_000, continuation: 42_000, continuationFetch: 48_000 });
    }
  });

  it("stretches every deadline on the temporary Render host only, keeping their order", () => {
    const d = scanDeadlines("render");
    expect(d.fullPassFetch).toBe(40_000 * RENDER_SCAN_DEADLINE_SCALE);
    expect(d.continuation).toBe(42_000 * RENDER_SCAN_DEADLINE_SCALE);
    expect(d.continuationFetch).toBe(48_000 * RENDER_SCAN_DEADLINE_SCALE);
    expect(d.fullPassFetch).toBeLessThan(d.continuation);
    expect(d.continuation).toBeLessThan(d.continuationFetch);
  });
});

describe("edgeComputeDeadlineMs", () => {
  it("keeps 48 s inside the 60-second budget off Render", async () => {
    const { edgeComputeDeadlineMs } = await import("@/lib/cards/edgeCard");
    expect(edgeComputeDeadlineMs("vercel")).toBe(48_000);
    expect(edgeComputeDeadlineMs("cloud_run")).toBe(48_000);
  });

  it("ends a Render part before the next part starts 4 minutes later", async () => {
    const { edgeComputeDeadlineMs } = await import("@/lib/cards/edgeCard");
    expect(edgeComputeDeadlineMs("render")).toBeGreaterThan(48_000);
    expect(edgeComputeDeadlineMs("render")).toBeLessThan(4 * 60_000);
  });
});
