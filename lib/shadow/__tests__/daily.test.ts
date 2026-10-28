import { describe, expect, it } from "vitest";
import { buildShadowDays, callState, shadowTotals, type ShadowRecordRow } from "@/lib/shadow/daily";

const row = (o: Partial<ShadowRecordRow>): ShadowRecordRow => ({
  symbol: "AAA",
  direction: "bullish",
  strategy_version: "2026-10-28-some-internal-name",
  entry: 100,
  stop_loss: 96,
  score: 7,
  source: "scan",
  scanned_at: "2026-10-27T14:00:00Z",
  session_date: "2026-10-27",
  outcome: null,
  r_multiple: null,
  bars_held: null,
  fill_price: null,
  ...o,
});

describe("forward test daily record", () => {
  it("reads every state, a held trade from its fill", () => {
    expect(callState({ outcome: null, fill_price: null })).toBe("unread");
    expect(callState({ outcome: null, fill_price: "100.2" })).toBe("held");
    expect(callState({ outcome: "expired", fill_price: null })).toBe("expired");
    expect(callState({ outcome: "loss", fill_price: 100 })).toBe("loss");
  });

  it("groups by session newest first, keeps losses and non-fills, and sums R over decided trades only", () => {
    const days = buildShadowDays([
      row({ symbol: "WIN", outcome: "win", r_multiple: "2.5", fill_price: 100, bars_held: 3 }),
      row({ symbol: "LOSS", outcome: "loss", r_multiple: -1, fill_price: 100 }),
      row({ symbol: "TIME", outcome: "timeout", r_multiple: 0.25, fill_price: 100 }),
      row({ symbol: "OPEN", fill_price: 101 }),
      row({ symbol: "NEVER", outcome: "expired", r_multiple: 9 }),
      row({ symbol: "STOP", outcome: "retired" }),
      row({ symbol: "NEXT", session_date: "2026-10-28", scanned_at: "2026-10-27T21:00:00Z" }),
    ]);
    expect(days.map((d) => d.session)).toEqual(["2026-10-28", "2026-10-27"]);
    const d = days[1];
    expect(d).toMatchObject({ calls: 6, filled: 4, wins: 1, losses: 1, timeouts: 1, held: 1, expired: 1, retired: 1, unread: 0 });
    expect(d.totalR).toBeCloseTo(1.75);
    expect(d.averageR).toBeCloseTo(1.75 / 3);
    expect(d.items.find((i) => i.symbol === "NEVER")?.r).toBeNull();
    expect(days[0].averageR).toBeNull();

    const t = shadowTotals(days);
    expect(t).toMatchObject({ calls: 7, plans: 7, decided: 3, wins: 1, losses: 1, timeouts: 1, unread: 1 });
    expect(t.winRate).toBeCloseTo(1 / 3);
  });

  it("counts a plan recorded on several sessions once among the plans", () => {
    const t = shadowTotals(
      buildShadowDays([
        row({ session_date: "2026-10-26", outcome: "expired" }),
        row({ session_date: "2026-10-27", outcome: "expired" }),
        row({ symbol: "BBB", session_date: "2026-10-27" }),
      ]),
    );
    expect(t).toMatchObject({ calls: 3, plans: 2 });
  });

  it("labels the rule version, never its internal name", () => {
    const [day] = buildShadowDays([row({})]);
    expect(day.items[0].version).toMatch(/^2026-10-28 · [0-9a-z]{5}$/);
    expect(JSON.stringify(day)).not.toContain("internal");
  });
});
