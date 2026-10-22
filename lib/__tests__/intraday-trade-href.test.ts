import { describe, expect, it } from "vitest";
import { intradayPlanFromQuery, intradayTradeHref } from "@/lib/routes";

describe("intraday Trade this link", () => {
  it("carries the alert's stop, first target and MTP, and reads them back", () => {
    const href = intradayTradeHref("AAPL", "buy", { stop: 99, target: 103, master: 106 });
    expect(href).toBe("/ticker/AAPL?intraday=1&side=buy&stop=99&tp1=103&mtp=106");
    const q = new URL(href, "https://x").searchParams;
    expect(intradayPlanFromQuery(q.get("stop"), q.get("tp1"), q.get("mtp"))).toEqual({ stop: 99, target: 103, master: 106 });
  });

  it("leaves the MTP out when the alert has none, and the plan still stands", () => {
    const href = intradayTradeHref("AAPL", "sell", { stop: 101, target: 97, master: null });
    expect(href).not.toContain("mtp=");
    expect(intradayPlanFromQuery("101", "97", null)).toEqual({ stop: 101, target: 97, master: null });
    expect(intradayPlanFromQuery("101", "97", "abc")).toEqual({ stop: 101, target: 97, master: null });
  });
});
