import { describe, it, expect } from "vitest";
import {
  acceptedAt,
  byNewestAccepted,
  fillProgress,
  isWorking,
  normalizeOrderStatus,
  reconcileOrders,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  type BrokerOrder,
  type LocalOrder,
} from "@/lib/portfolio/order-status";

function local(overrides: Partial<LocalOrder> = {}): LocalOrder {
  return {
    id: "row-1",
    broker_order_id: "brk-1",
    status: "new",
    filled_qty: null,
    filled_avg_price: null,
    created_at: "2026-08-07T14:30:00.000Z",
    ...overrides,
  };
}

function broker(overrides: Partial<BrokerOrder> = {}): BrokerOrder {
  return { id: "brk-1", status: "filled", ...overrides };
}

describe("normalizeOrderStatus", () => {
  it("maps every working broker state onto pending", () => {
    for (const s of [
      "new",
      "accepted",
      "accepted_for_bidding",
      "calculated",
      "held",
      "pending_new",
      "pending_cancel",
      "pending_replace",
      "pending_review",
      "stopped",
      "suspended",
    ]) {
      expect(normalizeOrderStatus(s)).toBe("pending");
    }
  });

  it("keeps partially filled distinct from pending so fill progress can render", () => {
    expect(normalizeOrderStatus("partially_filled")).toBe("partially_filled");
  });

  it("maps the terminal non-fill states onto cancelled", () => {
    for (const s of ["canceled", "cancelled", "expired", "replaced", "done_for_day"]) {
      expect(normalizeOrderStatus(s)).toBe("canceled");
    }
  });

  it("keeps rejected separate from cancelled — a refusal is not a withdrawal", () => {
    expect(normalizeOrderStatus("rejected")).toBe("rejected");
  });

  it("normalizes casing and whitespace", () => {
    expect(normalizeOrderStatus("  FILLED ")).toBe("filled");
  });

  it("flags an unreadable status as a sync error rather than assuming it is live", () => {
    expect(normalizeOrderStatus("something_new_from_the_broker")).toBe("unknown");
    expect(normalizeOrderStatus(null)).toBe("unknown");
    expect(normalizeOrderStatus("")).toBe("unknown");
  });

  it("treats only pending and partially filled as working", () => {
    expect(isWorking("pending")).toBe(true);
    expect(isWorking("partially_filled")).toBe(true);
    expect(isWorking("filled")).toBe(false);
    expect(isWorking("rejected")).toBe(false);
    expect(isWorking("canceled")).toBe(false);
    expect(isWorking("unknown")).toBe(false);
  });

  it("gives every state a label and a plain-language description", () => {
    for (const state of [
      "pending",
      "partially_filled",
      "filled",
      "rejected",
      "canceled",
      "unknown",
    ] as const) {
      expect(STATUS_LABELS[state]).toBeTruthy();
      expect(STATUS_DESCRIPTIONS[state].length).toBeGreaterThan(20);
    }
  });
});

describe("fillProgress", () => {
  it("reports filled, remaining and percentage", () => {
    const p = fillProgress(30, 100);
    expect(p).toMatchObject({ filledQty: 30, remainingQty: 70, pct: 30 });
    expect(p.label).toBe("30 of 100 filled · 70 left");
  });

  it("never reports more filled than ordered", () => {
    expect(fillProgress(150, 100).filledQty).toBe(100);
  });

  it("handles a missing fill quantity as nothing filled", () => {
    expect(fillProgress(null, 100)).toMatchObject({ filledQty: 0, remainingQty: 100, pct: 0 });
  });

  it("does not divide by a zero total", () => {
    expect(fillProgress(5, 0).pct).toBe(0);
  });
});

describe("reconcileOrders", () => {
  const now = new Date("2026-08-07T16:00:00.000Z");

  it("updates a locally-pending order that has since filled at the broker", () => {
    const result = reconcileOrders(
      [local()],
      [broker({ status: "filled", filled_qty: "10", filled_avg_price: "49.75" })],
      now,
    );
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]).toMatchObject({
      id: "row-1",
      status: "filled",
      filled_qty: 10,
      filled_avg_price: 49.75,
      last_synced_at: now.toISOString(),
    });
  });

  // The defect that froze the Pending panel: rows were written once at submit
  // time and never chased, so months-old orders still read "new".
  it("clears a stale pending row whose order was cancelled at the broker weeks ago", () => {
    const result = reconcileOrders(
      [local({ created_at: "2026-07-31T13:00:00.000Z", status: "accepted" })],
      [broker({ status: "canceled", canceled_at: "2026-07-31T20:00:00.000Z" })],
      now,
    );
    expect(result.updates[0].status).toBe("canceled");
  });

  it("carries the broker's rejection reason onto the row", () => {
    const result = reconcileOrders(
      [local()],
      [
        broker({
          status: "rejected",
          reject_reason: "Invalid limit_price 49.755. sub-penny increment does not fulfill minimum pricing criteria.",
        }),
      ],
      now,
    );
    expect(result.updates[0].status).toBe("rejected");
    expect(result.updates[0].reject_reason).toContain("sub-penny");
  });

  it("records the broker-accepted timestamp, which is what Pending sorts on", () => {
    const result = reconcileOrders(
      [local({ status: "new" })],
      [broker({ status: "accepted", submitted_at: "2026-08-07T13:30:05.000Z" })],
      now,
    );
    expect(result.updates[0].broker_submitted_at).toBe("2026-08-07T13:30:05.000Z");
  });

  it("leaves a row alone when the broker agrees with it", () => {
    const result = reconcileOrders(
      [local({ status: "accepted", filled_qty: null })],
      [broker({ status: "accepted" })],
      now,
    );
    expect(result.updates).toHaveLength(0);
    expect(result.inSyncCount).toBe(1);
  });

  it("still updates a working order whose fill quantity advanced", () => {
    const result = reconcileOrders(
      [local({ status: "partially_filled", filled_qty: 10 })],
      [broker({ status: "partially_filled", filled_qty: "40" })],
      now,
    );
    expect(result.updates[0].filled_qty).toBe(40);
  });

  it("does not chase orders that already reached a terminal state locally", () => {
    const result = reconcileOrders(
      [local({ status: "filled" }), local({ id: "row-2", status: "rejected" })],
      [broker({ status: "filled" })],
      now,
    );
    expect(result.updates).toHaveLength(0);
    expect(result.orphanedIds).toHaveLength(0);
  });

  it("orphans a working row the broker has no record of", () => {
    const result = reconcileOrders([local({ broker_order_id: "gone" })], [broker()], now);
    expect(result.orphanedIds).toEqual(["row-1"]);
    expect(result.updates).toHaveLength(0);
  });

  it("orphans a working row that was never mirrored to a broker order", () => {
    const result = reconcileOrders([local({ broker_order_id: null })], [], now);
    expect(result.orphanedIds).toEqual(["row-1"]);
  });

  it("returns empty results for an empty ledger", () => {
    expect(reconcileOrders([], [], now)).toEqual({
      updates: [],
      orphanedIds: [],
      inSyncCount: 0,
    });
  });
});

describe("acceptedAt / byNewestAccepted", () => {
  it("prefers the broker-accepted time over the local placement time", () => {
    const t = acceptedAt({
      broker_submitted_at: "2026-08-07T13:30:05.000Z",
      created_at: "2026-08-06T20:00:00.000Z",
    });
    expect(t).toBe(Date.parse("2026-08-07T13:30:05.000Z"));
  });

  it("falls back to placement time when the broker time is missing", () => {
    const t = acceptedAt({ broker_submitted_at: null, created_at: "2026-08-06T20:00:00.000Z" });
    expect(t).toBe(Date.parse("2026-08-06T20:00:00.000Z"));
  });

  it("sorts newest accepted first", () => {
    const rows = [
      { id: "a", created_at: "2026-07-31T13:00:00.000Z" },
      { id: "b", created_at: "2026-08-07T13:30:00.000Z" },
      { id: "c", created_at: "2026-08-01T13:30:00.000Z" },
    ];
    expect([...rows].sort(byNewestAccepted).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks a tie deterministically by id", () => {
    const rows = [
      { id: "z", created_at: "2026-08-07T13:30:00.000Z" },
      { id: "a", created_at: "2026-08-07T13:30:00.000Z" },
    ];
    expect([...rows].sort(byNewestAccepted).map((r) => r.id)).toEqual(["a", "z"]);
    // Same result from the other input order — the sort is not input-dependent.
    expect([...rows].reverse().sort(byNewestAccepted).map((r) => r.id)).toEqual(["a", "z"]);
  });

  it("sorts an unparseable date last instead of dropping the row", () => {
    const rows = [
      { id: "bad", created_at: "not-a-date" },
      { id: "good", created_at: "2026-08-07T13:30:00.000Z" },
    ];
    expect([...rows].sort(byNewestAccepted).map((r) => r.id)).toEqual(["good", "bad"]);
  });
});

describe("reconcileOrders — orphan recovery", () => {
  const now = new Date("2026-08-07T16:00:00.000Z");

  // Marking a row `sync_error` was one-way: it normalizes to `unknown`, and the
  // reconciler skipped anything that wasn't `working`. So a row orphaned by a
  // transient broker outage — the most likely cause — could never come back.
  it("re-checks a row previously marked sync_error", () => {
    const result = reconcileOrders(
      [local({ status: "sync_error" })],
      [broker({ status: "filled", filled_qty: "10", filled_avg_price: "49.75" })],
      now,
    );
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].status).toBe("filled");
  });

  it("restores a row to pending when the broker reports it working again", () => {
    const result = reconcileOrders(
      [local({ status: "sync_error" })],
      [broker({ status: "accepted" })],
      now,
    );
    expect(result.updates[0].status).toBe("accepted");
  });

  it("does not re-flag a sync_error row the broker still has no record of", () => {
    const result = reconcileOrders([local({ status: "sync_error" })], [], now);
    expect(result.orphanedIds).toEqual([]);
    expect(result.updates).toHaveLength(0);
  });

  it("still orphans a working row on its first disappearance", () => {
    const result = reconcileOrders([local({ status: "new" })], [], now);
    expect(result.orphanedIds).toEqual(["row-1"]);
  });
});
