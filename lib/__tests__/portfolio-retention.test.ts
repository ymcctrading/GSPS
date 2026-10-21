import { describe, expect, it } from "vitest";
import { agedOffOrderIds } from "@/lib/portfolio/prune";

// 17:00 ET on 2026-10-21: three hours back is before that day's close, so the
// cutoff is 2026-10-20's close.
const now = new Date("2026-10-21T21:00:00Z");
const old = "2026-10-19T18:00:00Z";
const recent = "2026-10-21T18:00:00Z";

describe("agedOffOrderIds (review finding S-07: hidden, never deleted)", () => {
  it("hides a filled order once its symbol is no longer held, and a stale terminal order", () => {
    const ids = agedOffOrderIds(
      [
        { id: "a", symbol: "AAPL", status: "filled", updated_at: old },
        { id: "b", symbol: "MSFT", status: "filled", updated_at: old },
        { id: "c", symbol: "NEE", status: "canceled", updated_at: old },
        { id: "d", symbol: "NEE", status: "canceled", updated_at: recent },
        { id: "e", symbol: "PLTR", status: "new", updated_at: old },
      ],
      new Set(["MSFT"]),
      now,
    );
    expect([...ids].sort()).toEqual(["a", "c"]);
  });
});
