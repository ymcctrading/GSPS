import { describe, expect, it } from "vitest";
import { classifyDeployment, type ExitRow, type OrderRow, type PlanRow, type ReasonRow } from "../deployments";

const profile = { profile_id: "p1", plan_id: "plan1", execution_mode: "paper" as const };
const plan = (state: string): PlanRow => ({
  plan_id: "plan1",
  instrument: "FROG",
  direction: "bullish",
  state,
  entry_trigger: "90.67",
  invalidation: "84.47",
  take_profit_1: "98.52",
  master_profit: "104",
  expires_at: null,
});
const reason = (detail: unknown, at: string): ReasonRow => ({ profile_id: "p1", kind: "broker_order_rejected", detail, created_at: at });

describe("automation deployments", () => {
  it("reads an armed plan with no order as waiting, with the latest reason", () => {
    const d = classifyDeployment(profile, plan("armed"), [], [], [
      reason({ reason: "older" }, "2026-10-23T13:00:00Z"),
      reason({ reason: "Waiting for the entry to confirm." }, "2026-10-23T13:09:11Z"),
    ]);
    expect(d).toMatchObject({ status: "waiting", entry: 90.67, stop: 84.47, takeProfit1: 98.52, masterProfit: 104, fillPrice: null });
    expect(d.lastReason).toBe("Waiting for the entry to confirm.");
  });

  it("reads an expired plan that never filled as ended, not active (AAPL, BP, 2026-10-23)", () => {
    const d = classifyDeployment(profile, plan("expired"), [], [], [
      { profile_id: "p1", kind: "order_blocked", detail: { reasons: ["Plan has expired."] }, created_at: "2026-10-21T20:24:00Z" },
    ]);
    expect(d.status).toBe("ended");
    expect(d.lastReason).toBe("Plan has expired.");
  });

  it("reads a filled entry with a working exit as open, on the exit manager's stop", () => {
    const order: OrderRow = { id: "o1", source_plan_id: "plan1", status: "filled", limit_price: null, filled_avg_price: "91", filled_qty: "10", qty: "10", created_at: "2026-10-23T14:00:00Z" };
    const exit: ExitRow = { entry_order_id: "o1", status: "working", qty: "10", entry_price: "91.02", stop_loss: "84.47", applied_stop: "88", take_profit_1: "98.52", master_profit: "104", created_at: "2026-10-23T14:00:01Z" };
    const d = classifyDeployment(profile, plan("entered"), [order], [exit], []);
    expect(d).toMatchObject({ status: "open", fillPrice: 91.02, qty: 10, stop: 88, lastReason: null });
  });

  it("reads a filled entry whose exit closed as closed", () => {
    const order: OrderRow = { id: "o1", source_plan_id: "plan1", status: "filled", limit_price: null, filled_avg_price: "91", filled_qty: "10", qty: "10", created_at: "2026-10-23T14:00:00Z" };
    const exit: ExitRow = { entry_order_id: "o1", status: "closed", qty: "10", entry_price: "91", stop_loss: "84.47", applied_stop: null, take_profit_1: "98.52", master_profit: null, created_at: "2026-10-23T14:00:01Z" };
    expect(classifyDeployment(profile, plan("closed"), [order], [exit], []).status).toBe("closed");
  });

  it("keeps an expired plan with a resting order as waiting, and ignores other plans' orders", () => {
    const resting: OrderRow = { id: "o2", source_plan_id: "plan1", status: "new", limit_price: "91.5", filled_avg_price: null, filled_qty: null, qty: "10", created_at: "2026-10-23T14:00:00Z" };
    const other: OrderRow = { ...resting, id: "o3", source_plan_id: "plan9", status: "filled", filled_qty: "5" };
    const d = classifyDeployment(profile, plan("expired"), [resting, other], [], []);
    expect(d).toMatchObject({ status: "waiting", restingLimit: 91.5, fillPrice: null });
  });

  it("drops a refusal older than the order now resting, and dates a fill from its exit row", () => {
    const resting: OrderRow = { id: "o2", source_plan_id: "plan1", status: "new", limit_price: "91.5", filled_avg_price: null, filled_qty: null, qty: "10", created_at: "2026-10-23T14:00:00Z" };
    const waiting = classifyDeployment(profile, plan("armed"), [resting], [], [reason({ reason: "Waiting for the entry to confirm." }, "2026-10-23T13:00:00Z")]);
    expect(waiting.lastReason).toBeNull();
    const filled: OrderRow = { ...resting, status: "filled", filled_avg_price: "91.5", filled_qty: "10" };
    const exit: ExitRow = { entry_order_id: "o2", status: "working", qty: "10", entry_price: "91.5", stop_loss: "84.47", applied_stop: null, take_profit_1: "98.52", master_profit: null, created_at: "2026-10-27T15:00:00Z" };
    expect(classifyDeployment(profile, plan("entered"), [filled], [exit], []).filledAt).toBe("2026-10-27T15:00:00Z");
  });
});
