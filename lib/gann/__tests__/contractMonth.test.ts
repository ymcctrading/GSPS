import { describe, expect, it } from "vitest";
import { gannContractMonth } from "../contractMonth";
import { futuresContractOf } from "../../instruments/spec";

// Noon New York time on the given day.
const on = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 16));
const front = (root: string, date: Date, side: "long" | "short" = "long") =>
  gannContractMonth(root, date, side)?.front.symbol ?? null;

describe("gannContractMonth (A-SELECTION-08)", () => {
  it("wheat: May until May 10, then July, then September and December (W036 p.22)", () => {
    expect(front("ZW", on(2027, 1, 31))).toBe("ZWK27");
    expect(front("ZW", on(2027, 5, 10))).toBe("ZWK27");
    expect(front("ZW", on(2027, 5, 11))).toBe("ZWN27");
    expect(front("ZW", on(2027, 8, 1))).toBe("ZWU27");
    expect(front("ZW", on(2027, 10, 1))).toBe("ZWZ27");
    expect(front("ZW", on(2027, 12, 20))).toBe("ZWK28");
    expect(front("/ZW", on(2027, 3, 1), "short")).toBe("ZWK27");
  });

  it("cotton: July and October in spring and summer, December after September, March in November-December", () => {
    expect(gannContractMonth("CT", on(2027, 4, 25), "long")?.months.map((m) => m.symbol)).toEqual(["CTN27", "CTV27"]);
    expect(front("CT", on(2027, 8, 15))).toBe("CTV27");
    // January cotton is no longer listed, so October reads December alone.
    expect(gannContractMonth("CT", on(2027, 10, 15), "short")?.months.map((m) => m.symbol)).toEqual(["CTZ27"]);
    expect(front("CT", on(2027, 11, 15))).toBe("CTH28");
    expect(front("CT", on(2028, 2, 1))).toBe("CTH28");
  });

  it("soybeans: May and July for long account only (Commodities p.326)", () => {
    expect(gannContractMonth("ZS", on(2027, 2, 1), "long")?.months.map((m) => m.symbol)).toEqual(["ZSK27", "ZSN27"]);
    expect(front("ZS", on(2027, 6, 1))).toBe("ZSN27");
    expect(front("ZS", on(2027, 9, 1))).toBe("ZSK28");
    expect(gannContractMonth("ZS", on(2027, 2, 1), "short")).toBeNull();
  });

  it("names no month for a market with no named rule", () => {
    for (const root of ["ES", "CL", "GC", "ZC", "KC", "6E", "ZB"]) {
      expect(gannContractMonth(root, on(2027, 3, 1), "long")).toBeNull();
    }
  });

  it("reads the date in New York time", () => {
    // 02:00 UTC on May 11 is still May 10 in New York.
    expect(front("ZW", new Date(Date.UTC(2027, 4, 11, 2)))).toBe("ZWK27");
  });

  it("returns symbols the instrument spec reads as the same contract", () => {
    const choice = gannContractMonth("ZW", on(2027, 6, 1), "long")!;
    expect(futuresContractOf(choice.front.symbol)?.root).toBe("ZW");
    expect(choice.source).toMatch(/W036/);
  });
});
