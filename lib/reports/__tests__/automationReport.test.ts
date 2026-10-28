import { describe, expect, it } from "vitest";
import { automationReportEmail, buildAccountSections, type AccountSettings } from "@/lib/reports/automationReport";

const acct = (userId: string, o: Partial<AccountSettings> = {}): AccountSettings => ({
  userId,
  email: `${userId}@example.com`,
  riskProfile: "MODERATE",
  directionalBias: "BOTH",
  executionMode: "paper",
  enabledSince: "2026-10-28T22:16:00Z",
  ...o,
});

describe("portfolio manager daily report", () => {
  const day = "2026-10-29";
  const sections = buildAccountSections({
    day,
    accounts: [acct("a"), acct("b", { riskProfile: "AGGRESSIVE", directionalBias: "BULLISH_ONLY" })],
    cash: new Map([["a", 99_500]]),
    orders: [
      { user_id: "a", symbol: "AAA", side: "buy", status: "filled", qty: 10, filled_avg_price: 50, created_at: "2026-10-29T14:00:00Z", mode: "paper" },
      { user_id: "a", symbol: "BBB", side: "buy", status: "new", qty: 5, filled_avg_price: null, created_at: "2026-10-29T15:00:00Z", mode: "paper" },
      { user_id: "a", symbol: "OLD", side: "buy", status: "filled", qty: 5, filled_avg_price: 1, created_at: "2026-10-28T15:00:00Z", mode: "paper" },
    ],
    trades: [
      { user_id: "a", symbol: "AAA", direction: "buy", outcome: "loss", profit_loss_dollars: -120.5, exit_timestamp: "2026-10-29T18:00:00Z", mode: "paper" },
      { user_id: "a", symbol: "CCC", direction: "sell", outcome: "win", profit_loss_dollars: "80", exit_timestamp: "2026-10-29T19:00:00Z", mode: "paper" },
      // before the switch: not counted since start
      { user_id: "a", symbol: "PRE", direction: "buy", outcome: "win", profit_loss_dollars: 1000, exit_timestamp: "2026-10-27T19:00:00Z", mode: "paper" },
    ],
    positions: [{ user_id: "b", symbol: "DDD", side: "long", qty: 3, avg_entry_price: 20, stop_loss: 19 }],
    activations: [{ user_id: "a", activated_at: "2026-10-29T13:30:00Z" }],
  });

  it("counts each account's day and its record since switched on, losses included", () => {
    const [a, b] = sections;
    expect(a.today).toMatchObject({ activations: 1, ordersPlaced: 2, ordersFilled: 1, closed: 2, won: 1, lost: 1 });
    expect(a.today.pl).toBeCloseTo(-40.5);
    expect(a.today.trades).toEqual(["AAA long -$120.50", "CCC short +$80.00"]);
    expect(a.sinceStart).toMatchObject({ closed: 2, won: 1, lost: 1, winRate: 0.5 });
    expect(a.cash).toBe(99_500);
    expect(b.open).toHaveLength(1);
    expect(b.cash).toBeNull();
  });

  it("writes one line block per account with its settings", () => {
    const mail = automationReportEmail(day, sections);
    expect(mail.subject).toContain(day);
    expect(mail.text).toContain("a@example.com (moderate, bias both, paper)");
    expect(mail.text).toContain("b@example.com (aggressive, bias bullish_only, paper)");
    expect(mail.text).toContain("Open: DDD long 3 @ 20.00");
    expect(mail.html).not.toContain("<script");
  });

  it("says so when no account has it on", () => {
    expect(automationReportEmail(day, []).text).toContain("No account has the portfolio manager switched on.");
  });
});
