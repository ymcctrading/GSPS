import { describe, expect, it } from "vitest";
import { hardToBorrowWarning, liveShortAccountRefusal, opensShort, shortAssetRefusal } from "@/lib/trade/short-eligibility";

describe("opensShort", () => {
  it("is a sell with nothing held, a sell on a short, or a sale larger than the long", () => {
    expect(opensShort(null, 0, "sell", 5)).toBe(true);
    expect(opensShort("short", 5, "sell", 5)).toBe(true);
    expect(opensShort("long", 5, "sell", 6)).toBe(true);
  });
  it("is never a buy, nor a sale within the long held", () => {
    expect(opensShort(null, 0, "buy", 5)).toBe(false);
    expect(opensShort("short", 5, "buy", 9)).toBe(false);
    expect(opensShort("long", 5, "sell", 5)).toBe(false);
    expect(opensShort("long", 5, "sell", 2)).toBe(false);
  });
});

describe("the lending and account checks", () => {
  it("refuses a stock the broker won't lend, and lets a lendable one through", () => {
    expect(shortAssetRefusal("gpus", { shortable: false })?.body.code).toBe("not_shortable");
    expect(shortAssetRefusal("gpus", { shortable: false })?.body.error).toMatch(/^GPUS can't be sold short/);
    expect(shortAssetRefusal("AAPL", { shortable: true })).toBeNull();
  });
  it("warns only on a lendable stock that is hard to borrow", () => {
    expect(hardToBorrowWarning("XYZ", { shortable: true, easy_to_borrow: false })).toMatch(/hard to borrow/);
    expect(hardToBorrowWarning("XYZ", { shortable: true, easy_to_borrow: true })).toBeNull();
    expect(hardToBorrowWarning("XYZ", { shortable: false, easy_to_borrow: false })).toBeNull();
  });
  it("refuses a live account that reports it can't short, and reads a missing flag as allowed", () => {
    expect(liveShortAccountRefusal({ shorting_enabled: false })?.body.code).toBe("short_not_enabled");
    expect(liveShortAccountRefusal({ shorting_enabled: true })).toBeNull();
    expect(liveShortAccountRefusal({})).toBeNull();
  });
});
