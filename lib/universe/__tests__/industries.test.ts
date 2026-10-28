import { describe, expect, it } from "vitest";
import {
  INDUSTRIES,
  classifiedSymbols,
  industryMembers,
  industryOf,
  industryTree,
  isIndustryKey,
  type IndustryKey,
} from "@/lib/universe/industries";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { CRYPTO_UNIVERSE } from "@/lib/scan/cryptoUniverse";
import { FUND_MARKETS } from "@/lib/market/otherMarkets";
import { FUTURES_CONTRACTS, futuresContractOf, isForexPair } from "@/lib/instruments/spec";
import { MAG7, SECTORS } from "@/lib/sectors";

describe("industry classification", () => {
  it("puts every symbol in the scan universe in an industry", () => {
    const missing = LARGE_CAP_UNIVERSE.filter((s) => !industryOf(s));
    expect(missing).toEqual([]);
  });

  it("covers the funds, crypto pairs, futures and forex the platform lists", () => {
    for (const s of [...FUND_MARKETS, ...CRYPTO_UNIVERSE, ...MAG7, "SPY", "QQQ", "IWM", "DIA"]) {
      expect(industryOf(s), s).not.toBeNull();
    }
    for (const c of FUTURES_CONTRACTS) expect(industryOf(`/${c.root}`)?.sector).toBe("futures");
    for (const s of SECTORS.forex.symbols) expect(industryOf(s)?.sector).toBe("forex");
  });

  it("names futures with the slash and forex as pairs, so neither scans as a stock ticker", () => {
    for (const s of industryTree().find((x) => x.key === "futures")!.industries.flatMap((i) => i.symbols)) {
      expect(futuresContractOf(s), s).not.toBeNull();
    }
    for (const s of industryTree().find((x) => x.key === "forex")!.industries.flatMap((i) => i.symbols)) {
      expect(isForexPair(s), s).toBe(true);
    }
  });

  it("files each symbol once", () => {
    const all = industryTree().flatMap((s) => s.industries.flatMap((i) => i.symbols));
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(classifiedSymbols().length);
  });

  it("leaves no listed industry empty, and every industry has a sector the tree shows", () => {
    for (const s of industryTree()) for (const i of s.industries) expect(i.symbols.length).toBeGreaterThan(0);
    const shown = new Set(industryTree().flatMap((s) => s.industries.map((i) => i.key)));
    const empty = (Object.keys(INDUSTRIES) as IndustryKey[]).filter((k) => !shown.has(k));
    expect(empty).toEqual([]);
  });

  it("corrects the SEC codes that misdescribe a business", () => {
    const cases: [string, IndustryKey][] = [
      ["NVDA", "semiconductors"],
      ["QCOM", "semiconductors"],
      ["ASML", "semiEquipment"],
      ["GOOGL", "interactiveMedia"],
      ["META", "interactiveMedia"],
      ["AMZN", "ecommerce"],
      ["COP", "oilGasProducers"],
      ["XOM", "integratedOil"],
      ["MMM", "conglomerates"],
      ["NKE", "apparel"],
      ["BALL", "packaging"],
      ["JPM", "banksUs"],
      ["HSBC", "banksIntl"],
      ["V", "payments"],
      ["SPGI", "financialData"],
      ["CME", "exchanges"],
      ["AMT", "reitTowers"],
      ["SCI", "businessServices"],
      ["BTC/USD", "cryptoPairs"],
      ["GLD", "commodityFunds"],
      ["/ES", "futuresIndex"],
      ["EURUSD", "forexMajors"],
      ["EURJPY", "forexCrosses"],
    ];
    for (const [symbol, key] of cases) expect(industryOf(symbol)?.key, symbol).toBe(key);
  });

  it("reads a symbol however it is typed, and returns null for one it doesn't list", () => {
    expect(industryOf(" nvda ")?.label).toBe("Semiconductors");
    expect(industryOf("NOTASYMBOL")).toBeNull();
  });

  it("lists an industry's stocks largest first, as the universe orders them", () => {
    const semis = industryMembers("semiconductors");
    const order = semis.map((s) => LARGE_CAP_UNIVERSE.indexOf(s));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("recognises industry keys only", () => {
    expect(isIndustryKey("software")).toBe(true);
    expect(isIndustryKey("mag7")).toBe(false);
    expect(isIndustryKey("toString")).toBe(false);
  });
});
