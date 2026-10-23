import { describe, expect, it } from "vitest";
import {
  loadInstrumentReferenceHistory,
  loadSnapshotHistory,
  splitAdjustedSharesAsOf,
  type ReferenceSnapshot,
} from "../instrumentReference";

describe("instrument reference snapshot", () => {
  it("reads a snapshot row as the tables' row would read", async () => {
    const snapshot = {
        symbols: {
          ABC: {
            name: "Abc Corp",
            sharesOutstanding: "1000",
            sharesAsOf: "2026-01-01",
            inceptionDate: "1990-05-01",
            inceptionPrecision: "month",
            history: [["2025-12-31", "2026-01-20", 1000]],
          },
          NOP: { name: null, sharesOutstanding: null, sharesAsOf: null, inceptionDate: null, inceptionPrecision: null, history: [] },
        },
    } as const;
    const out = await loadSnapshotHistory(["abc", "NOP", "MISSING"], snapshot as unknown as ReferenceSnapshot);
    expect(out.get("ABC")).toEqual({
      reference: {
        symbol: "ABC",
        sharesOutstanding: 1000,
        sharesAsOf: "2026-01-01",
        inception: { date: "1990-05-01", precision: "month" },
        name: "Abc Corp",
      },
      history: [{ asOf: "2025-12-31", filed: "2026-01-20", shares: 1000 }],
    });
    expect(out.get("NOP")?.reference).toMatchObject({ sharesOutstanding: null, inception: null, name: null });
    expect(out.has("MISSING")).toBe(false);
  });

  it("gives an empty map when the snapshot is malformed", async () => {
    expect((await loadSnapshotHistory(["ABC"], {} as ReferenceSnapshot)).size).toBe(0);
  });

  it("is what the backtest reads without a service key", async () => {
    const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, a: process.env.SUPABASE_SECRET_KEY, b: process.env.SUPABASE_SERVICE_ROLE_KEY };
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const out = await loadInstrumentReferenceHistory(["AAPL"]);
      const aapl = out.get("AAPL");
      expect(aapl?.reference.inception?.date).toBe("1976-04-01");
      expect(aapl?.history.length).toBeGreaterThan(0);
      expect(splitAdjustedSharesAsOf(aapl!.history, "2024-01-02")).toBeGreaterThan(1e10);
    } finally {
      if (saved.a !== undefined) process.env.SUPABASE_SECRET_KEY = saved.a;
      if (saved.b !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.b;
    }
  });
});
