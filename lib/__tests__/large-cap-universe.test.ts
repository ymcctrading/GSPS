/**
 * The scanning universe is data, and data rots differently from code.
 *
 * A wrong ticker in this list does not throw — it produces a scan that fetches
 * bars for a symbol that does not exist, gets nothing back, and drops it
 * silently. Multiply that by a stale list and the universe quietly shrinks
 * while every dashboard still says the market was scanned. These assertions are
 * what stands in for a compiler on a hand-transcribed list.
 */

import { describe, expect, it } from "vitest";
import {
  LARGE_CAP_SOURCE_RANKS,
  LARGE_CAP_UNIVERSE,
} from "@/lib/scan/large-cap-universe";
import { fallbackUniverse } from "@/lib/guided/universe";

describe("the large-cap universe", () => {
  it("holds exactly the ranks it claims to hold", () => {
    // The header documents which slice of the source list is present. If the
    // array and that claim disagree, the comment is the thing people will
    // believe, so they must not be able to disagree.
    const claimed = LARGE_CAP_SOURCE_RANKS.to - LARGE_CAP_SOURCE_RANKS.from + 1;
    expect(LARGE_CAP_UNIVERSE).toHaveLength(claimed);
  });

  it("is honest that it does not yet cover the whole source list", () => {
    // Not a bug being asserted into permanence — a fact being kept visible.
    // When ranks 501-893 are appended this expectation flips, and having to
    // change it is the reminder to update the header comment too.
    expect(LARGE_CAP_SOURCE_RANKS.sourceTotal).toBe(893);
    expect(LARGE_CAP_SOURCE_RANKS.to).toBeLessThan(LARGE_CAP_SOURCE_RANKS.sourceTotal);
  });

  it("contains no duplicates", () => {
    // A duplicate wastes a slot in a budgeted scan and can publish the same
    // symbol twice on one side of the dashboard.
    expect(new Set(LARGE_CAP_UNIVERSE).size).toBe(LARGE_CAP_UNIVERSE.length);
  });

  it("holds only plausible US equity tickers", () => {
    // Uppercase, 1-5 characters, optionally a dotted share class (PBR.A).
    // Anything else is a transcription artefact — a market cap, a fragment of a
    // company name, a page number.
    const bad = LARGE_CAP_UNIVERSE.filter((s) => !/^[A-Z]{1,5}(\.[A-Z])?$/.test(s));
    expect(bad).toEqual([]);
  });

  it("carries no crypto or forex pairs", () => {
    // The market scan filters pairs out downstream, but a pair reaching this
    // list at all means the source parse picked up the wrong column.
    expect(LARGE_CAP_UNIVERSE.filter((s) => s.includes("/"))).toEqual([]);
  });

  it("leads with the largest names", () => {
    // Order is load-bearing: a reduced budget takes from the front, so the
    // front has to be the most liquid end of the list.
    expect(LARGE_CAP_UNIVERSE.slice(0, 5)).toEqual(["TTE", "APH", "TMUS", "ABT", "SCHW"]);
  });
});

describe("what Guided will look at", () => {
  it("reaches far past the sector watchlists", () => {
    // The whole point of the change: Guided used to be able to see about 65
    // symbols and now sees hundreds, without any threshold moving.
    expect(fallbackUniverse().length).toBeGreaterThan(400);
  });

  it("still puts the curated names first", () => {
    // A user who recognises a symbol on the dashboard should meet it in Guided
    // before an unfamiliar large cap, on a day when both qualify.
    expect(fallbackUniverse().slice(0, 7)).toEqual([
      "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
    ]);
  });

  it("keeps crypto in, for the hours the US market is shut", () => {
    expect(fallbackUniverse()).toContain("BTC/USD");
  });

  it("has no duplicates once the lists are merged", () => {
    const u = fallbackUniverse();
    expect(new Set(u).size).toBe(u.length);
  });
});
