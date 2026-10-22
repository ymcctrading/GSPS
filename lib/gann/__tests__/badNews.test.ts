import { describe, expect, it } from "vitest";
import { badNewsOffer, readBadNews } from "@/lib/gann/badNews";
import type { Bar } from "@/lib/types";

// A-EXIT-04, Tunnel Thru the Air p.223: cover shorts on bad news. Bad is read
// from the market: the close fell on the news (Commodities p.8).
const bar = (day: string, c: number): Bar => ({ t: `${day}T04:00:00Z`, o: c, h: c + 1, l: c - 1, c, v: 1e6 });
const daily = [bar("2026-10-19", 50), bar("2026-10-20", 48), bar("2026-10-21", 45)];
// New York time in October is UTC-4.
const etStamp = (iso: string) => {
  const d = new Date(Date.parse(iso) - 4 * 3_600_000).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)}`;
};
const news = [{ createdAt: "2026-10-21T13:00:00Z", headline: "Guidance cut" }];

describe("readBadNews", () => {
  it("offers a profitable short the cover when the close fell on the news", () => {
    const r = readBadNews({ side: "short", entryPrice: 52, daily, news, etStamp });
    expect(r).toEqual({ session: "2026-10-21", headline: "Guidance cut", close: 45, priorClose: 48 });
    expect(badNewsOffer("XYZ", r!)).toContain("Nothing was closed.");
  });

  it("counts news after the prior close on the next session, and not news before it", () => {
    const evening = [{ createdAt: "2026-10-20T21:30:00Z", headline: "Late filing" }];
    expect(readBadNews({ side: "short", entryPrice: 52, daily, news: evening, etStamp })?.headline).toBe("Late filing");
    const midday = [{ createdAt: "2026-10-20T16:00:00Z", headline: "Midday" }];
    expect(readBadNews({ side: "short", entryPrice: 52, daily, news: midday, etStamp })).toBeNull();
    const after = [{ createdAt: "2026-10-21T22:00:00Z", headline: "After the last close" }];
    expect(readBadNews({ side: "short", entryPrice: 52, daily, news: after, etStamp })).toBeNull(); // the close came before it
  });

  it("offers nothing to a long, on an up close, to a losing short, or without news in the window", () => {
    expect(readBadNews({ side: "long", entryPrice: 52, daily, news, etStamp })).toBeNull();
    const up = [...daily.slice(0, 2), bar("2026-10-21", 49)];
    expect(readBadNews({ side: "short", entryPrice: 52, daily: up, news, etStamp })).toBeNull();
    expect(readBadNews({ side: "short", entryPrice: 44, daily, news, etStamp })).toBeNull();
    const old = [{ createdAt: "2026-10-19T13:00:00Z", headline: "Old" }];
    expect(readBadNews({ side: "short", entryPrice: 52, daily, news: old, etStamp })).toBeNull();
    expect(readBadNews({ side: "short", entryPrice: 52, daily: daily.slice(0, 1), news, etStamp })).toBeNull();
  });
});
