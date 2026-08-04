import { describe, it, expect } from "vitest";
import {
  classifyOrder,
  countOpenLegs,
  dispositionOf,
  groupByDisposition,
  heldSymbols,
  sectionOrders,
  DISPOSITION_ORDER,
  type SectionableOrder,
} from "@/lib/portfolio/sections";
import { buildBlendedPositions, type BlendedPosition, type RawPosition } from "@/lib/portfolio/blend";

function order(overrides: Partial<SectionableOrder> & { id?: string } = {}) {
  return {
    id: "o1",
    symbol: "AAPL",
    status: "filled",
    created_at: "2026-08-01T14:30:00.000Z",
    ...overrides,
  };
}

function rawEquity(overrides: Partial<RawPosition> = {}): RawPosition {
  return {
    symbol: "AAPL",
    qty: 10,
    side: "long",
    avgEntry: 200,
    currentPrice: 220,
    marketValue: 2200,
    unrealizedPl: 200,
    unrealizedPlPct: 10,
    todayPlPct: 1.2,
    assetClassHint: "us_equity",
    ...overrides,
  };
}

function rawOption(overrides: Partial<RawPosition> = {}): RawPosition {
  return {
    symbol: "AAPL250117C00220000",
    qty: 2,
    side: "long",
    avgEntry: 5,
    currentPrice: 6,
    marketValue: 1200,
    unrealizedPl: 200,
    unrealizedPlPct: 20,
    todayPlPct: 3,
    assetClassHint: "us_option",
    ...overrides,
  };
}

/** The live position list the page hands sectioning, built the way the API does. */
function live(positions: RawPosition[]): BlendedPosition[] {
  return buildBlendedPositions(positions, () => 220);
}

describe("heldSymbols", () => {
  it("collects every leg symbol — shares and each option contract", () => {
    const held = heldSymbols(live([rawEquity(), rawOption()]));
    expect(held).toEqual(new Set(["AAPL", "AAPL250117C00220000"]));
  });

  it("is empty when nothing is held", () => {
    expect(heldSymbols([])).toEqual(new Set());
  });
});

describe("countOpenLegs", () => {
  it("counts the shares leg and every option leg across groups", () => {
    const groups = live([rawEquity(), rawOption(), rawEquity({ symbol: "MSFT" })]);
    expect(countOpenLegs(groups)).toBe(3);
  });

  it("is zero with no positions", () => {
    expect(countOpenLegs([])).toBe(0);
  });
});

describe("classifyOrder", () => {
  const held = new Set(["AAPL"]);

  it("puts a filled order for a still-held symbol under open", () => {
    expect(classifyOrder(order({ status: "filled", symbol: "AAPL" }), held)).toBe("open");
  });

  it("puts a filled order for a symbol no longer held under closed", () => {
    expect(classifyOrder(order({ status: "filled", symbol: "TSLA" }), held)).toBe("closed");
  });

  it("matches held symbols case-insensitively", () => {
    expect(classifyOrder(order({ status: "filled", symbol: "aapl" }), held)).toBe("open");
  });

  it.each([
    "new",
    "accepted",
    "pending_new",
    "held",
    "partially_filled",
    "pending_cancel",
    // A trade is guaranteed but hasn't happened yet — still working, not done.
    "stopped",
  ])("treats %s as pending", (status) => {
    expect(classifyOrder(order({ status }), held)).toBe("pending");
  });

  it.each(["canceled", "cancelled", "expired", "rejected", "replaced", "done_for_day"])(
    "treats %s as unfilled, not closed — it never became a position",
    (status) => {
      expect(classifyOrder(order({ status }), held)).toBe("unfilled");
    },
  );

  it("reserves closed for a position that was actually filled and then exited", () => {
    expect(classifyOrder(order({ status: "filled", symbol: "TSLA" }), held)).toBe("closed");
  });

  it("normalizes casing and whitespace in the status", () => {
    expect(classifyOrder(order({ status: " CANCELED " }), held)).toBe("unfilled");
    expect(classifyOrder(order({ status: "New" }), held)).toBe("pending");
  });

  it("falls back to pending on an unrecognized status, so the row stays visible", () => {
    expect(classifyOrder(order({ status: "some_new_broker_state" }), held)).toBe("pending");
    expect(classifyOrder(order({ status: "" }), held)).toBe("pending");
  });
});

describe("dispositionOf", () => {
  it("keeps a cancellation and a rejection apart", () => {
    expect(dispositionOf("canceled")).toBe("canceled");
    expect(dispositionOf("rejected")).toBe("rejected");
  });

  it("accepts the double-L spelling of canceled", () => {
    expect(dispositionOf("cancelled")).toBe("canceled");
  });

  it("returns null for a status that isn't an unfilled ending", () => {
    expect(dispositionOf("filled")).toBeNull();
    expect(dispositionOf("new")).toBeNull();
    expect(dispositionOf("")).toBeNull();
  });

  it("names every disposition in the display order", () => {
    for (const disposition of DISPOSITION_ORDER) {
      expect(dispositionOf(disposition)).toBe(disposition);
    }
  });
});

describe("groupByDisposition", () => {
  it("splits an unfilled section into labeled groups, canceled before rejected", () => {
    const groups = groupByDisposition([
      order({ id: "r1", status: "rejected" }),
      order({ id: "c1", status: "canceled" }),
      order({ id: "c2", status: "cancelled" }),
      order({ id: "e1", status: "expired" }),
    ]);

    expect(groups.map((g) => g.label)).toEqual(["Canceled", "Rejected", "Expired"]);
    expect(groups[0].orders.map((o) => o.id)).toEqual(["c1", "c2"]);
    expect(groups[1].orders.map((o) => o.id)).toEqual(["r1"]);
    expect(groups[2].orders.map((o) => o.id)).toEqual(["e1"]);
  });

  it("gives every group a distinct description of how the order ended", () => {
    const groups = groupByDisposition([
      order({ id: "c", status: "canceled" }),
      order({ id: "r", status: "rejected" }),
    ]);
    expect(groups[0].description).not.toBe(groups[1].description);
    expect(groups.every((g) => g.description.length > 0)).toBe(true);
  });

  it("omits dispositions with nothing in them", () => {
    const groups = groupByDisposition([order({ id: "r", status: "rejected" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].disposition).toBe("rejected");
  });

  it("preserves the order rows arrive in, which sectionOrders left newest first", () => {
    const groups = groupByDisposition([
      order({ id: "newer", status: "canceled", created_at: "2026-08-01T10:00:00Z" }),
      order({ id: "older", status: "canceled", created_at: "2026-07-01T10:00:00Z" }),
    ]);
    expect(groups[0].orders.map((o) => o.id)).toEqual(["newer", "older"]);
  });

  it("returns nothing for an empty section", () => {
    expect(groupByDisposition([])).toEqual([]);
  });

  it("ignores a row that isn't an unfilled order", () => {
    expect(groupByDisposition([order({ id: "f", status: "filled" })])).toEqual([]);
  });
});

describe("sectionOrders", () => {
  it("populates all four sections from mixed data", () => {
    const positions = live([rawEquity(), rawOption()]); // AAPL shares + AAPL call held
    const orders = [
      order({ id: "open-equity", symbol: "AAPL", status: "filled" }),
      order({ id: "open-option", symbol: "AAPL250117C00220000", status: "filled" }),
      order({ id: "pending-limit", symbol: "MSFT", status: "new" }),
      order({ id: "pending-partial", symbol: "NVDA", status: "partially_filled" }),
      order({ id: "closed-exited", symbol: "TSLA", status: "filled" }),
      order({ id: "unfilled-canceled", symbol: "AMD", status: "canceled" }),
      order({ id: "unfilled-rejected", symbol: "GME", status: "rejected" }),
    ];

    const sections = sectionOrders(orders, positions);

    expect(sections.open.map((o) => o.id)).toEqual(["open-equity", "open-option"]);
    expect(sections.pending.map((o) => o.id)).toEqual(["pending-limit", "pending-partial"]);
    expect(sections.closed.map((o) => o.id)).toEqual(["closed-exited"]);
    expect(sections.unfilled.map((o) => o.id)).toEqual(["unfilled-canceled", "unfilled-rejected"]);
  });

  it("assigns every order to exactly one section", () => {
    const positions = live([rawEquity()]);
    const orders = [
      order({ id: "a", symbol: "AAPL", status: "filled" }),
      order({ id: "b", symbol: "MSFT", status: "new" }),
      order({ id: "c", symbol: "TSLA", status: "filled" }),
      order({ id: "d", symbol: "AMD", status: "rejected" }),
    ];

    const sections = sectionOrders(orders, positions);
    const total =
      sections.open.length + sections.pending.length + sections.closed.length + sections.unfilled.length;
    expect(total).toBe(orders.length);
  });

  it("sorts each section newest first regardless of input order", () => {
    const positions = live([rawEquity()]);
    const orders = [
      order({ id: "old", symbol: "TSLA", status: "canceled", created_at: "2026-07-01T10:00:00Z" }),
      order({ id: "new", symbol: "AMD", status: "canceled", created_at: "2026-08-01T10:00:00Z" }),
      order({ id: "mid", symbol: "GME", status: "canceled", created_at: "2026-07-15T10:00:00Z" }),
    ];

    expect(sectionOrders(orders, positions).unfilled.map((o) => o.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("sorts an unparseable placement date last rather than dropping the row", () => {
    const orders = [
      order({ id: "bad", symbol: "AMD", status: "canceled", created_at: "not-a-date" }),
      order({ id: "good", symbol: "GME", status: "canceled", created_at: "2026-07-15T10:00:00Z" }),
    ];

    expect(sectionOrders(orders, []).unfilled.map((o) => o.id)).toEqual(["good", "bad"]);
  });

  it("returns four empty buckets when there are no orders at all", () => {
    expect(sectionOrders([], [])).toEqual({ open: [], pending: [], closed: [], unfilled: [] });
  });

  it("leaves the other buckets empty when every order is pending", () => {
    const sections = sectionOrders(
      [order({ id: "p1", status: "new" }), order({ id: "p2", status: "accepted" })],
      [],
    );
    expect(sections.pending).toHaveLength(2);
    expect(sections.open).toEqual([]);
    expect(sections.closed).toEqual([]);
    expect(sections.unfilled).toEqual([]);
  });

  it("leaves open empty when the broker reports no live positions", () => {
    // Same filled orders as the mixed case, but nothing is held any more —
    // every one of them has been exited.
    const sections = sectionOrders(
      [
        order({ id: "a", symbol: "AAPL", status: "filled" }),
        order({ id: "b", symbol: "AAPL250117C00220000", status: "filled" }),
      ],
      [],
    );
    expect(sections.open).toEqual([]);
    expect(sections.closed).toHaveLength(2);
  });

  it("keeps unrelated fields on the rows it sorts into sections", () => {
    const rows = [{ ...order({ id: "x", status: "new" }), qty: 7, delta: 0.42 }];
    const [pending] = sectionOrders(rows, []).pending;
    expect(pending.qty).toBe(7);
    expect(pending.delta).toBe(0.42);
  });
});
