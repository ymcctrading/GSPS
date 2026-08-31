import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bar } from "@/lib/types";

function bar(t: string, o: number, h: number, l: number, c: number): Bar {
  return { t, o, h, l, c, v: 1_000_000 };
}

const { fetchBarsMock } = vi.hoisted(() => ({ fetchBarsMock: vi.fn() }));
vi.mock("@/lib/data/provider", () => ({
  getMarketDataProvider: () => ({ fetchBars: fetchBarsMock }),
}));

import { walkShadowOutcome, evaluatePendingShadowSignals } from "@/lib/shadow/evaluate";

describe("walkShadowOutcome", () => {
  it("is pending when neither level has been touched and the window hasn't elapsed", () => {
    const bars = [bar("2026-08-25", 201, 202, 199, 200)];
    const result = walkShadowOutcome(bars, "bullish", 200, 195, 215, 10);
    expect(result.outcome).toBe("pending");
  });

  it("wins a long when the target is touched before the stop", () => {
    const bars = [bar("2026-08-25", 205, 216, 204, 215)];
    const result = walkShadowOutcome(bars, "bullish", 200, 195, 215, 10);
    expect(result.outcome).toBe("win");
    expect(result.rMultiple).toBeCloseTo(3, 6); // 15 reward / 5 risk
    expect(result.barsHeld).toBe(1);
  });

  it("loses a long when the stop is touched", () => {
    const bars = [bar("2026-08-25", 199, 200, 194, 196)];
    const result = walkShadowOutcome(bars, "bullish", 200, 195, 215, 10);
    expect(result.outcome).toBe("loss");
    expect(result.rMultiple).toBeCloseTo(-1, 6);
  });

  it("counts a same-bar stop-and-target touch as the loss", () => {
    const bars = [bar("2026-08-25", 200, 220, 190, 210)];
    const result = walkShadowOutcome(bars, "bullish", 200, 195, 215, 10);
    expect(result.outcome).toBe("loss");
  });

  it("marks out at the last close as a timeout once the window elapses untouched", () => {
    const bars = Array.from({ length: 3 }, (_, i) => bar(`2026-08-2${5 + i}`, 200, 201, 199, 201));
    const result = walkShadowOutcome(bars, "bullish", 200, 195, 215, 3);
    expect(result.outcome).toBe("timeout");
    expect(result.rMultiple).toBeCloseTo(0.2, 6); // (201-200)/5
    expect(result.barsHeld).toBe(3);
  });

  it("mirrors the arithmetic for a short", () => {
    const bars = [bar("2026-08-25", 194, 196, 184, 185)];
    const result = walkShadowOutcome(bars, "bearish", 200, 205, 185, 10);
    expect(result.outcome).toBe("win");
    expect(result.rMultiple).toBeCloseTo(3, 6);
  });
});

describe("evaluatePendingShadowSignals", () => {
  function makeSupabase(pending: Record<string, unknown>[]) {
    const updates: Record<string, unknown>[] = [];
    const client = {
      from: () => ({
        select: () => ({
          is: () => ({
            lte: () => Promise.resolve({ data: pending, error: null }),
          }),
        }),
        update: (obj: Record<string, unknown>) => {
          updates.push(obj);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      }),
    } as unknown as SupabaseClient;
    return { client, updates };
  }

  beforeEach(() => {
    fetchBarsMock.mockReset();
  });

  it("evaluates a resolvable signal and writes its outcome back", async () => {
    const now = new Date("2026-09-05T00:00:00Z");
    const { client, updates } = makeSupabase([
      {
        id: "s1",
        symbol: "AAPL",
        direction: "bullish",
        entry: 200,
        stop_loss: 195,
        target: 215,
        scanned_at: "2026-08-28T14:30:00Z",
      },
    ]);
    fetchBarsMock.mockResolvedValueOnce([bar("2026-08-31", 205, 216, 204, 215)]);

    const outcome = await evaluatePendingShadowSignals(client, now);
    expect(outcome.evaluated).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ outcome: "win" });
  });

  it("leaves a signal pending when nothing has resolved it yet", async () => {
    const now = new Date("2026-08-29T00:00:00Z");
    const { client } = makeSupabase([
      {
        id: "s1",
        symbol: "AAPL",
        direction: "bullish",
        entry: 200,
        stop_loss: 195,
        target: 215,
        scanned_at: "2026-08-28T14:30:00Z",
      },
    ]);
    fetchBarsMock.mockResolvedValueOnce([bar("2026-08-28", 200, 201, 199, 200)]);

    const outcome = await evaluatePendingShadowSignals(client, now);
    expect(outcome.stillPending).toBe(1);
    expect(outcome.evaluated).toBe(0);
  });

  it("counts a per-symbol provider failure without aborting the pass", async () => {
    const now = new Date("2026-09-05T00:00:00Z");
    const { client } = makeSupabase([
      {
        id: "s1",
        symbol: "AAPL",
        direction: "bullish",
        entry: 200,
        stop_loss: 195,
        target: 215,
        scanned_at: "2026-08-28T14:30:00Z",
      },
    ]);
    fetchBarsMock.mockRejectedValueOnce(new Error("provider timeout"));

    const outcome = await evaluatePendingShadowSignals(client, now);
    expect(outcome.failed).toBe(1);
    expect(outcome.evaluated).toBe(0);
  });
});
