/**
 * The Signal and Regime Engine's rollup is additional context in the alert
 * email, never the trigger — these tests hold the email template to that:
 * present when the payload carries one, absent when it doesn't, and never
 * confused with the Gann/STRAT verdict/score above it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { sendAlertEmail, type AlertEmailData } from "./resend-handler";

const BASE: AlertEmailData = {
  userEmail: "user@example.com",
  symbol: "AAPL",
  direction: "bullish",
  score: 8,
  entry: 100,
  stopLoss: 95,
  takeProfit: 110,
  verdict: "Execute",
  confidence: 0.89,
};

describe("sendAlertEmail", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("includes the Signal and Regime Engine rollup when the payload carries one", async () => {
    await sendAlertEmail({
      ...BASE,
      signal: { state: "trendPullback", regime: "trend", direction: "bullish", tier: "aTier", tradeable: true, accountContextAssumed: true },
    });

    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).toContain("Signal &amp; Regime Engine");
    expect(html).toContain("Trend Pullback");
    expect(html).toContain("A-tier");
    expect(html).toContain("Tradeable");
  });

  it("omits the section entirely when there is no signal rollup", async () => {
    await sendAlertEmail(BASE);

    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).not.toContain("Signal &amp; Regime Engine");
  });

  it("never lets the rollup override the Gann/STRAT verdict or score shown above it", async () => {
    await sendAlertEmail({
      ...BASE,
      signal: { state: "rangeReversion", regime: "range", direction: "sideways", tier: "watchlistOnly", tradeable: false, accountContextAssumed: false },
    });

    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).toContain(`${BASE.score}/9`);
    expect(html).toContain(BASE.verdict);
  });
});
