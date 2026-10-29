import { beforeEach, describe, expect, it, vi } from "vitest";

const takeRateUse = vi.fn();
const recordUsage = vi.fn();

vi.mock("@/lib/data/http", () => ({ ALPACA_PROVIDER_LABEL: "Alpaca", takeRateUse: (p: string) => takeRateUse(p) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/ops/usageStore", () => ({
  recordUsage: (...args: unknown[]) => recordUsage(...args),
  meterStatus: vi.fn(async () => ({ error: "skip" })),
  saveReading: vi.fn(async () => undefined),
  sendDueAlerts: vi.fn(async () => ({ sent: [], error: null })),
}));

import { reportAlpacaRateUse } from "@/lib/ops/rateUsage";

const now = new Date("2026-10-29T14:00:00Z");

beforeEach(() => {
  takeRateUse.mockReset();
  recordUsage.mockReset();
  recordUsage.mockResolvedValue({ error: null });
});

function recordedUnits(): number {
  return (recordUsage.mock.calls[0][1] as { units: number }).units;
}

describe("reportAlpacaRateUse", () => {
  it("records the busiest minute as read", async () => {
    takeRateUse.mockReturnValue({ peak: 120, limit: 200, throttled: 0 });
    await reportAlpacaRateUse("market-scan", now);
    expect(recordedUnits()).toBe(120);
  });

  it("never records more than the allowance", async () => {
    takeRateUse.mockReturnValue({ peak: 260, limit: 200, throttled: 2 });
    await reportAlpacaRateUse("market-scan", now);
    expect(recordedUnits()).toBe(200);
  });

  it("reads the plan's allowance when the headers gave none, and a non-finite peak as the whole of it", async () => {
    takeRateUse.mockReturnValue({ peak: Number.POSITIVE_INFINITY, limit: null, throttled: 1 });
    await reportAlpacaRateUse("intraday-scan", now);
    expect(recordedUnits()).toBe(200);
  });

  it("records nothing when no response was read", async () => {
    takeRateUse.mockReturnValue(null);
    await reportAlpacaRateUse("market-scan", now);
    expect(recordUsage).not.toHaveBeenCalled();
  });
});
