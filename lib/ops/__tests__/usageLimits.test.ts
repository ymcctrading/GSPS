import { describe, expect, it } from "vitest";
import {
  USAGE_METERS,
  USAGE_THRESHOLDS,
  alertsDue,
  crossedThresholds,
  formatEt,
  holdDecision,
  inExemptWindow,
  periodOf,
  renderAlert,
} from "@/lib/ops/usageLimits";

const gh = USAGE_METERS.github_actions;
const vercel = USAGE_METERS.vercel_deployments;
const emailDay = USAGE_METERS.email_daily;
const db = USAGE_METERS.supabase_db;

describe("thresholds", () => {
  it("are the owner's: 25, 50, 60 to 90 by 5, by 2 to 96, by 1 to 99", () => {
    expect(USAGE_THRESHOLDS).toEqual([25, 50, 60, 65, 70, 75, 80, 85, 90, 92, 94, 96, 97, 98, 99]);
  });

  it("names every threshold at or below the reading", () => {
    expect(crossedThresholds(24.9)).toEqual([]);
    expect(crossedThresholds(56)).toEqual([25, 50]);
    expect(crossedThresholds(99)).toEqual(USAGE_THRESHOLDS);
  });
});

describe("periods", () => {
  it("a monthly limit's month is the UTC calendar month", () => {
    const p = periodOf(gh, new Date("2026-10-28T22:00:00Z"));
    expect(p.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(p.end!.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(p.key).toBe("2026-10");
  });

  it("the last two days of a month lift the hold; a day or a rolling window never does", () => {
    expect(inExemptWindow(gh, new Date("2026-10-29T23:59:00Z"))).toBe(false);
    expect(inExemptWindow(gh, new Date("2026-10-30T00:00:00Z"))).toBe(true);
    expect(inExemptWindow(gh, new Date("2026-10-31T23:00:00Z"))).toBe(true);
    expect(inExemptWindow(vercel, new Date("2026-10-31T23:00:00Z"))).toBe(false);
    expect(inExemptWindow(emailDay, new Date("2026-10-31T23:00:00Z"))).toBe(false);
  });

  it("handles a February and a year end", () => {
    expect(inExemptWindow(gh, new Date("2027-02-26T23:00:00Z"))).toBe(false);
    expect(inExemptWindow(gh, new Date("2027-02-27T00:00:00Z"))).toBe(true);
    expect(periodOf(gh, new Date("2026-12-31T12:00:00Z")).end!.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("hold", () => {
  const mid = new Date("2026-10-28T22:00:00Z");

  it("holds at 99%, not below", () => {
    expect(holdDecision(gh, 1979, mid, null).hold).toBe(false);
    expect(holdDecision(gh, 1980, mid, null).hold).toBe(true);
    expect(holdDecision(vercel, 99, mid, null).hold).toBe(true);
    expect(holdDecision(vercel, 98, mid, null).hold).toBe(false);
  });

  it("lets the rest be used in the month's last two days", () => {
    expect(holdDecision(gh, 1995, new Date("2026-10-30T12:00:00Z"), null).hold).toBe(false);
  });

  it("an approved urgent fix passes until its time runs out", () => {
    const override = { until: new Date("2026-10-28T23:00:00Z"), reason: "stop-loss fix" };
    expect(holdDecision(gh, 1990, mid, override).hold).toBe(false);
    expect(holdDecision(gh, 1990, new Date("2026-10-28T23:30:00Z"), override).hold).toBe(true);
  });

  it("the database's size never holds", () => {
    expect(holdDecision(db, 499, mid, null).hold).toBe(false);
  });

  it("says when the room comes back, in ET", () => {
    expect(holdDecision(gh, 1990, mid, null).reason).toContain("8:00 PM ET, Oct 29");
  });
});

describe("alerts due", () => {
  const now = new Date("2026-10-28T22:00:00Z");

  it("sends each crossed threshold once a period", () => {
    expect(alertsDue(56, [], gh, now)).toEqual([25, 50]);
    expect(alertsDue(61, [{ threshold: 25, sentAt: now }, { threshold: 50, sentAt: now }], gh, now)).toEqual([60]);
  });

  it("a rolling window re-arms a threshold a day after it was sent", () => {
    const sent = [{ threshold: 25, sentAt: new Date("2026-10-27T21:00:00Z") }];
    expect(alertsDue(30, sent, vercel, now)).toEqual([25]);
    expect(alertsDue(30, [{ threshold: 25, sentAt: new Date("2026-10-28T10:00:00Z") }], vercel, now)).toEqual([]);
  });
});

describe("words", () => {
  it("gives times in New York time", () => {
    expect(formatEt(new Date("2026-10-28T22:20:00Z"))).toBe("6:20 PM ET, Oct 28");
    expect(formatEt(new Date("2026-11-02T13:00:00Z"))).toBe("8:00 AM ET, Nov 2");
  });

  it("the alert names the threshold, the reading and the hold", () => {
    const mail = renderAlert({ meter: gh, used: 1121, now: new Date("2026-10-28T22:20:00Z") }, 50, holdDecision(gh, 1121, new Date(), null));
    expect(mail.subject).toBe("GSPS usage: GitHub Actions minutes at 50%");
    expect(mail.text).toContain("passed 50% at 6:20 PM ET, Oct 28");
    expect(mail.text).toContain("1121 of 2000 minutes (56.0%)");
  });
});

describe("alert-only limits", () => {
  const mid = new Date("2026-10-28T22:00:00Z");

  it("Supabase's connections, storage and users and Alpaca's minute never hold", () => {
    for (const id of ["supabase_connections", "supabase_storage", "supabase_mau", "alpaca_rate"] as const) {
      const meter = USAGE_METERS[id];
      expect(holdDecision(meter, meter.limit, mid, null).hold).toBe(false);
    }
  });

  it("the busiest minute and the connections alert once a month, not every day", () => {
    for (const id of ["alpaca_rate", "supabase_connections"] as const) {
      const meter = USAGE_METERS[id];
      expect(periodOf(meter, mid).key).toBe("2026-10");
      expect(alertsDue(60, [], meter, mid)).toEqual([25, 50, 60]);
      // Sent yesterday in the same month: nothing new the next day.
      const yesterday = new Date("2026-10-27T22:00:00Z");
      const sent = [25, 50, 60].map((threshold) => ({ threshold, sentAt: yesterday }));
      expect(alertsDue(60, sent, meter, mid)).toEqual([]);
    }
  });
});
