import { describe, expect, it } from "vitest";
import { classifyExit, computeRealizedPl } from "@/lib/portfolio/reconcile";

describe("classifyExit", () => {
  it("classifies a filled bracket stop leg as stop_loss", () => {
    expect(classifyExit({ type: "stop", order_class: "bracket" })).toBe("stop_loss");
  });

  it("classifies a filled bracket stop_limit leg as stop_loss", () => {
    expect(classifyExit({ type: "stop_limit", order_class: "bracket" })).toBe("stop_loss");
  });

  it("classifies a filled bracket limit leg as tp1", () => {
    expect(classifyExit({ type: "limit", order_class: "bracket" })).toBe("tp1");
  });

  it("classifies a stop with no order class as stop_loss", () => {
    // The staged exit's runner tranche is a plain stop, no bracket wrapper —
    // it is still a stop being hit, not a discretionary exit.
    expect(classifyExit({ type: "stop", order_class: undefined })).toBe("stop_loss");
    expect(classifyExit({ type: "stop_limit", order_class: undefined })).toBe("stop_loss");
  });

  it("classifies a filled OCO limit leg as tp1", () => {
    // The staged exit's scale-out and master tranches are OCO orders, not
    // brackets — before this they settled as "manual" and recorded no signal
    // adherence at all.
    expect(classifyExit({ type: "limit", order_class: "oco" })).toBe("tp1");
  });

  it("classifies a bare limit sell as manual", () => {
    // No bracket, no OCO — somebody selling, not a protocol level being hit.
    expect(classifyExit({ type: "limit", order_class: undefined })).toBe("manual");
  });

  it("classifies a plain market order as manual", () => {
    expect(classifyExit({ type: "market", order_class: undefined })).toBe("manual");
  });
});

describe("computeRealizedPl", () => {
  it("computes long P/L as (exit - entry) * qty", () => {
    expect(computeRealizedPl(100, 115, 10, "long")).toBeCloseTo(150);
    expect(computeRealizedPl(100, 85, 10, "long")).toBeCloseTo(-150);
  });

  it("computes short P/L as (entry - exit) * qty", () => {
    expect(computeRealizedPl(100, 85, 10, "short")).toBeCloseTo(150);
    expect(computeRealizedPl(100, 115, 10, "short")).toBeCloseTo(-150);
  });
});

describe("reconcilePositions reads live rows only (review finding R-013)", () => {
  it("never closes a paper position the live broker doesn't hold", async () => {
    const { reconcilePositions } = await import("@/lib/portfolio/reconcile");
    const filters: [string, unknown][] = [];
    const updates: unknown[] = [];
    const paperRow = { id: "p1", symbol: "AAPL", mode: "paper", closed: false, side: "long", qty: 10, avg_entry_price: 100, opened_at: "2026-10-01T00:00:00Z" };
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (col: string, val: unknown) => { filters.push([col, val]); return q; };
    q.update = (row: unknown) => { updates.push(row); return q; };
    q.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve({ data: filters.some(([c, v]) => c === "mode" && v === "live") ? [] : [paperRow], error: null }).then(ok);
    const supabase = { from: () => q } as never;
    const r = await reconcilePositions(supabase, { key: "k", secret: "s", mode: "live" }, "u1", []);
    expect(r).toMatchObject({ opened: 0, closed: 0, error: null });
    expect(updates).toHaveLength(0);
  });
});
