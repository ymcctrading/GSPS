import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The checked-in snapshot must keep the shape
 * `scripts/export-instrument-reference-snapshot.mjs` writes, so the script's
 * first real run only refreshes the data and never changes the format the
 * backtest's fallback reads (`loadSnapshotHistory`).
 */

interface Row {
  name: string | null;
  sharesOutstanding: number | string | null;
  sharesAsOf: string | null;
  inceptionDate: string | null;
  inceptionPrecision: string | null;
  history: [string, string, number][];
}

const RAW = readFileSync(join(process.cwd(), "lib/data/instrumentReferenceSnapshot.json"), "utf8");
const snapshot = JSON.parse(RAW) as { exportedAt: string; source: string; symbols: Record<string, Row> };

describe("checked-in instrument reference snapshot", () => {
  it("has the script's top-level keys and source line", () => {
    expect(Object.keys(snapshot).sort()).toEqual(["exportedAt", "source", "symbols"]);
    expect(Number.isNaN(Date.parse(snapshot.exportedAt))).toBe(false);
    expect(snapshot.source).toBe("instrument, instrument_profile, instrument_shares_outstanding (us_equity)");
  });

  it("is compact JSON, as the script writes it", () => {
    expect(RAW.trim()).not.toContain("\n");
  });

  it("keys upper-case symbols in sorted order", () => {
    const symbols = Object.keys(snapshot.symbols);
    expect(symbols.length).toBeGreaterThan(0);
    expect(symbols.every((s) => s === s.toUpperCase())).toBe(true);
    expect(symbols).toEqual([...symbols].sort());
  });

  it("gives every symbol the script's row fields", () => {
    const fields = ["history", "inceptionDate", "inceptionPrecision", "name", "sharesAsOf", "sharesOutstanding"];
    for (const [symbol, row] of Object.entries(snapshot.symbols)) {
      expect(Object.keys(row).sort(), symbol).toEqual(fields);
    }
  });

  it("lists each history as [as_of, filed, shares], ordered by filed then as_of", () => {
    for (const [symbol, row] of Object.entries(snapshot.symbols)) {
      for (const point of row.history) {
        expect(point, symbol).toHaveLength(3);
        expect(typeof point[0], symbol).toBe("string");
        expect(typeof point[1], symbol).toBe("string");
        expect(Number.isFinite(point[2]), symbol).toBe(true);
      }
      const order = row.history.map(([asOf, filed]) => `${filed}|${asOf}`);
      expect(order, symbol).toEqual([...order].sort());
    }
  });
});
