/**
 * The live scan hands the long monthly series (`LONG_MONTHLY_YEARS`) to the
 * class C long counts and keeps ten years for its own monthly readings (item 7
 * second review M-b).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

const seen = vi.hoisted(() => ({ facts: [] as { monthly?: Bar[] | null; monthlyLong?: Bar[] | null }[] }));
vi.mock("@/lib/gann/disclosedRules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gann/disclosedRules")>("@/lib/gann/disclosedRules");
  return {
    ...actual,
    readDisclosedRules: (...args: Parameters<typeof actual.readDisclosedRules>) => {
      if (args[2]) seen.facts.push(args[2]);
      return actual.readDisclosedRules(...args);
    },
  };
});

const reference = vi.hoisted(() => ({ value: null as null | { sharesOutstanding: number | null; inception: null } }));
vi.mock("@/lib/data/instrumentReference", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/instrumentReference")>("@/lib/data/instrumentReference");
  return { ...actual, getInstrumentReference: async () => reference.value };
});

import { scanTicker } from "@/lib/scanTicker";
import { LONG_MONTHLY_YEARS } from "@/lib/gann/secondaryTime";

describe("the live scan's monthly series", () => {
  const original = process.env.MARKET_DATA_PROVIDER;
  beforeEach(() => {
    process.env.MARKET_DATA_PROVIDER = "synthetic";
    seen.facts.length = 0;
  });
  afterEach(() => {
    process.env.MARKET_DATA_PROVIDER = original;
  });

  it.each([null, { sharesOutstanding: 1e9, inception: null }])("passes the long series for the long counts and ten years for the rest (stored reference: %o)", async (ref) => {
    reference.value = ref;
    await scanTicker("AAPL");
    const facts = seen.facts.find((f) => f.monthlyLong);
    expect(facts).toBeDefined();
    const span = (bars: Bar[]) => (Date.parse(bars[bars.length - 1].t) - Date.parse(bars[0].t)) / (365.25 * 86_400_000);
    expect(span(facts!.monthlyLong!)).toBeGreaterThan(LONG_MONTHLY_YEARS - 1);
    expect(span(facts!.monthly!)).toBeLessThanOrEqual(10);
  }, 30_000);
});
