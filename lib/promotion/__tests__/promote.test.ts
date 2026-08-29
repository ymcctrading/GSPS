import { describe, expect, it } from "vitest";
import { nextMarketOpen } from "@/lib/promotion/promote";
import { equitySession } from "@/lib/market/session";

describe("nextMarketOpen", () => {
  it("returns an instant where the market is regular-session and the moment before it was not", () => {
    const now = new Date("2026-08-31T12:00:00Z"); // Monday, mid-morning ET, already open
    const open = nextMarketOpen(now);
    expect(equitySession(open)).toBe("regular");
    expect(equitySession(new Date(open.getTime() - 60_000))).not.toBe("regular");
  });

  it("skips the weekend to Monday's open", () => {
    const saturday = new Date("2026-09-05T15:00:00Z");
    const open = nextMarketOpen(saturday);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(open);
    expect(weekday).toBe("Mon");
    expect(equitySession(open)).toBe("regular");
  });

  it("finds the same-day open when called before the market opens", () => {
    const earlyMorning = new Date("2026-08-31T09:00:00Z"); // before 09:30 ET on a Monday
    const open = nextMarketOpen(earlyMorning);
    expect(open.getTime()).toBeGreaterThan(earlyMorning.getTime());
    expect(open.getTime() - earlyMorning.getTime()).toBeLessThan(24 * 3600 * 1000);
    expect(equitySession(open)).toBe("regular");
  });
});
