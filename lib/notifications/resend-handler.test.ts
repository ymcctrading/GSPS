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

import { appUrl, parseSenderAddress, sandboxBlockReason, sendAlertEmail, sendTestEmail, sendOrderInvalidatedEmail, sendPriceAlertEmail, type AlertEmailData } from "./resend-handler";
import { SCORE_MAX } from "@/lib/scoring/display";

const BASE: AlertEmailData = {
  userEmail: "user@example.com",
  symbol: "AAPL",
  direction: "bullish",
  score: 8,
  exactScoreDisplayEnabled: true,
  entry: 100,
  stopLoss: 95,
  takeProfit: 110,
  verdict: "Execute",
  confidence: 0.89,
};

describe("sendAlertEmail", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    // sendAlertEmail's sandbox guard (Resend's onboarding@resend.dev sender
    // can only deliver to this account's verified address) would otherwise
    // skip BASE's userEmail before these tests ever reach sendMock.
    process.env.RESEND_SANDBOX_RECIPIENTS = BASE.userEmail;
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_SANDBOX_RECIPIENTS;
  });

  it("includes the Signal and Regime Engine rollup when the payload carries one", async () => {
    await sendAlertEmail({
      ...BASE,
      signal: { state: "trendPullback", regime: "trend", direction: "bullish", tier: "aTier", tradeable: true, accountContextAssumed: true },
    });

    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).toContain("Signal &amp; Regime Engine");
    expect(html).toContain("Trend Pullback");
    expect(html).toContain("Tradeable");
    // Only Gann's score is graded (review of #393): the engine's tier never prints.
    expect(html).not.toContain("A-tier");
  });

  it("omits the section entirely when there is no signal rollup", async () => {
    await sendAlertEmail(BASE);

    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).not.toContain("Signal &amp; Regime Engine");
  });

  it("never lets the rollup override the protocol verdict or score shown above it", async () => {
    await sendAlertEmail({
      ...BASE,
      signal: { state: "rangeReversion", regime: "range", direction: "sideways", tier: "watchlistOnly", tradeable: false, accountContextAssumed: false },
    });

    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).toContain(`${BASE.score}/${SCORE_MAX}`);
    expect(html).toContain(BASE.verdict);
    expect(html).toContain("Not tradeable");
    expect(html).not.toContain("Watchlist only");
  });
});

describe("the sender (review finding S-04)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
  });

  it("skips a member the sandbox sender cannot reach, and marks it skipped", async () => {
    const result = await sendAlertEmail(BASE);
    expect(result).toMatchObject({ success: false, skipped: true });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends to any member from the verified address once RESEND_FROM is set", async () => {
    process.env.RESEND_FROM = "alerts@example.com";
    const result = await sendAlertEmail(BASE);
    expect(result).toMatchObject({ success: true, id: "email-1" });
    expect(sendMock.mock.calls[0][0].from).toBe("GSPS Alerts <alerts@example.com>");
  });

  it("reads RESEND_FROM set with its own display name, without nesting brackets", async () => {
    process.env.RESEND_FROM = "GSPS <alerts@example.com>";
    const result = await sendAlertEmail(BASE);
    expect(result).toMatchObject({ success: true });
    expect(sendMock.mock.calls[0][0].from).toBe("GSPS Alerts <alerts@example.com>");
  });

  it("treats a RESEND_FROM that is no address as unset, so the send is skipped, not failed", async () => {
    process.env.RESEND_FROM = "gsps.world";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendAlertEmail(BASE);
    expect(result).toMatchObject({ success: false, skipped: true });
    expect(sendMock).not.toHaveBeenCalled();
    expect(sandboxBlockReason(BASE.userEmail)).toMatch(/RESEND_FROM is set but is not an email address/);
    errorSpy.mockRestore();
  });

  it("reads the sandbox sender whatever its case", () => {
    process.env.RESEND_FROM = "GSPS <Onboarding@resend.dev>";
    expect(sandboxBlockReason(BASE.userEmail)).toMatch(/sandbox sender/);
  });
});

describe("sendTestEmail", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "email-9" }, error: null });
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
  });

  it("sends from the verified address and names it", async () => {
    process.env.RESEND_FROM = "GSPS <alerts@example.com>";
    const result = await sendTestEmail("ops@example.org");
    expect(result).toMatchObject({ success: true, id: "email-9", from: "alerts@example.com" });
    expect(sendMock.mock.calls[0][0]).toMatchObject({ from: "GSPS Ops <alerts@example.com>", to: "ops@example.org" });
  });

  it("passes Resend's refusal back", async () => {
    process.env.RESEND_FROM = "alerts@example.com";
    sendMock.mockResolvedValue({ data: null, error: { message: "Invalid `from` field" } });
    expect(await sendTestEmail("ops@example.org")).toMatchObject({ success: false, error: "Invalid `from` field" });
  });

  it("is skipped under the sandbox sender for an address it cannot reach", async () => {
    const result = await sendTestEmail("ops@example.org");
    expect(result).toMatchObject({ success: false, skipped: true });
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("parseSenderAddress", () => {
  it("takes the bare address from either form", () => {
    expect(parseSenderAddress("alerts@gsps.world")).toBe("alerts@gsps.world");
    expect(parseSenderAddress("  GSPS <alerts@gsps.world> ")).toBe("alerts@gsps.world");
    expect(parseSenderAddress('"alerts@gsps.world"')).toBe("alerts@gsps.world");
    expect(parseSenderAddress("")).toBeNull();
    expect(parseSenderAddress(undefined)).toBeNull();
    expect(parseSenderAddress("GSPS")).toBeNull();
    expect(parseSenderAddress("a b@gsps.world")).toBeNull();
  });
});

describe("sub-dollar prices (review: every email printed toFixed(2))", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_SANDBOX_RECIPIENTS = BASE.userEmail;
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_SANDBOX_RECIPIENTS;
  });

  it("prints a coin's entry, stop and target to the places the plan keeps, not two", async () => {
    await sendAlertEmail({ ...BASE, symbol: "DOGE/USD", entry: 0.16123, stopLoss: 0.15478, takeProfit: 0.17412 });
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).toContain("$0.1612");
    expect(html).toContain("$0.1548");
    expect(html).toContain("$0.1741");
    expect(html).not.toContain("$0.16<");
  });

  it("keeps cents at a dollar and above", async () => {
    await sendAlertEmail(BASE);
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).toContain("$100.00");
    expect(html).toContain("$95.00");
  });

  it("prints a sub-dollar price alert in its subject and body", async () => {
    await sendPriceAlertEmail({ userEmail: BASE.userEmail, symbol: "SHIB/USD", targetPrice: 0.00001234, direction: "above", currentPrice: 0.00001251 });
    const { subject, html } = sendMock.mock.calls[0][0] as { subject: string; html: string };
    expect(subject).toBe("SHIB/USD rose above $0.00001234");
    expect(html).toContain("$0.00001251");
  });

  it("prints a canceled sub-dollar order's limit and stop", async () => {
    await sendOrderInvalidatedEmail({ userEmail: BASE.userEmail, symbol: "DOGE/USD", side: "buy", qty: 1000, limitPrice: 0.1612, stopPrice: 0.1548, reason: "test" });
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).toContain("at $0.1612 limit");
    expect(html).toContain("stop $0.1548");
  });
});

describe("appUrl (email links)", () => {
  beforeEach(() => {
    // The default holds whatever the shell exports.
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("points at the live site, never the unused gsps.app", () => {
    expect(appUrl()).toBe("https://www.gsps.world");
    expect(appUrl("/portfolio")).toBe("https://www.gsps.world/portfolio");
  });

  it("follows NEXT_PUBLIC_APP_URL, without a doubled slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", " https://staging.example.com/ ");
    expect(appUrl("/ticker/AAPL")).toBe("https://staging.example.com/ticker/AAPL");
  });

  it("links the alert email's chart to the site", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM", "alerts@example.com");
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "e" }, error: null });
    await sendAlertEmail(BASE);
    const html: string = sendMock.mock.calls[0][0].html;
    expect(html).not.toContain("gsps.app");
    expect(html).toContain("https://www.gsps.world");
  });

  it("links a crypto price alert to the pair's page as the push and bell do", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM", "alerts@example.com");
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "e" }, error: null });
    await sendPriceAlertEmail({ userEmail: BASE.userEmail, symbol: "BTC/USD", targetPrice: 100000, direction: "above", currentPrice: 100100 });
    const html: string = sendMock.mock.calls[0][0].html;
    expect(html).toContain('href="https://www.gsps.world/ticker/BTC/USD"');
  });
});
