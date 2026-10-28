import { describe, expect, it } from "vitest";
import { capSelection, chunk, parseSymbols, resolveSelection, type PickerSector } from "@/lib/universe/selection";

const tree: PickerSector[] = [
  {
    key: "technology",
    label: "Technology",
    industries: [
      { key: "semis", label: "Semis", symbols: ["NVDA", "AVGO", "AMD"] },
      { key: "software", label: "Software", symbols: ["MSFT", "ORCL"] },
    ],
  },
];
const lists = [{ key: "mag7", label: "Magnificent 7", symbols: ["AAPL", "MSFT", "NVDA"] }];

describe("industry selection", () => {
  it("parses typed symbols, deduplicated", () => {
    expect(parseSymbols(" spy, aapl  btc/usd,,SPY")).toEqual(["SPY", "AAPL", "BTC/USD"]);
  });

  it("puts typed symbols first, then each pick's, once each, and skips unknown keys", () => {
    expect(resolveSelection(["software", "mag7", "gone"], "tsla, msft", tree, lists)).toEqual([
      "TSLA",
      "MSFT",
      "ORCL",
      "AAPL",
      "NVDA",
    ]);
  });

  it("caps a test at the limit, typed symbols first, then a name from each industry in turn", () => {
    const { symbols, total } = capSelection(["semis", "software"], "spy", tree, 4);
    expect(symbols).toEqual(["SPY", "NVDA", "MSFT", "AVGO"]);
    expect(total).toBe(6);
  });

  it("returns everything when it fits", () => {
    expect(capSelection(["software"], "", tree, 12)).toEqual({ symbols: ["MSFT", "ORCL"], total: 2 });
  });

  it("splits a list into requests", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 25)).toEqual([]);
  });
});

describe("quotes-only markets", () => {
  it("refuses futures and forex by name, and passes stocks and crypto", async () => {
    const { isQuotesOnly, quotesOnlyRefusal } = await import("@/lib/universe/selection");
    expect(isQuotesOnly("/ES")).toBe(true);
    expect(isQuotesOnly("EURUSD")).toBe(true);
    expect(isQuotesOnly("ES")).toBe(false);
    expect(isQuotesOnly("BTC/USD")).toBe(false);
    expect(quotesOnlyRefusal(["AAPL", "BTC/USD"])).toBeNull();
    expect(quotesOnlyRefusal(["AAPL", "/ES", "EURUSD"])).toMatch(/^\/ES, EURUSD can't be scanned/);
  });
});
