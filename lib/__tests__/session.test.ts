import { describe, expect, it } from "vitest";
import { equitySession, marketSession, isExtended, barSession } from "@/lib/market/session";

// Helper: build a Date at a given America/New_York wall-clock time by picking a
// UTC instant. EDT is UTC−4 (summer). These dates are all in July (EDT).
function etDate(day: number, hour: number, minute = 0): Date {
  // July 2026: EDT (UTC-4). 2026-07-06 is a Monday.
  const utcHour = hour + 4;
  return new Date(Date.UTC(2026, 6, day, utcHour, minute));
}

describe("equitySession (EDT)", () => {
  it("regular session mid-morning on a weekday", () => {
    expect(equitySession(etDate(6, 10, 0))).toBe("regular");
  });
  it("pre-market before the open", () => {
    expect(equitySession(etDate(6, 7, 0))).toBe("pre");
  });
  it("after-hours after the close", () => {
    expect(equitySession(etDate(6, 17, 0))).toBe("post");
  });
  it("closed overnight", () => {
    expect(equitySession(etDate(6, 2, 0))).toBe("closed");
  });
  it("closed on the weekend", () => {
    // 2026-07-04 is a Saturday
    expect(equitySession(etDate(4, 12, 0))).toBe("closed");
  });
  it("boundary: 09:30 is regular, 16:00 is post", () => {
    expect(equitySession(etDate(6, 9, 30))).toBe("regular");
    expect(equitySession(etDate(6, 16, 0))).toBe("post");
  });
});

describe("marketSession", () => {
  it("crypto is always regular", () => {
    expect(marketSession("crypto", etDate(4, 2, 0))).toBe("regular");
  });
  it("equity delegates to equitySession", () => {
    expect(marketSession("us_equity", etDate(6, 10, 0))).toBe("regular");
  });
});

describe("isExtended / barSession", () => {
  it("pre and post are extended, regular/closed are not", () => {
    expect(isExtended("pre")).toBe(true);
    expect(isExtended("post")).toBe(true);
    expect(isExtended("regular")).toBe(false);
    expect(isExtended("closed")).toBe(false);
  });
  it("classifies a pre-market bar timestamp as extended", () => {
    expect(isExtended(barSession(etDate(6, 7, 0).toISOString(), "us_equity"))).toBe(true);
  });
  it("crypto bars are never extended", () => {
    expect(isExtended(barSession(etDate(6, 7, 0).toISOString(), "crypto"))).toBe(false);
  });
});
