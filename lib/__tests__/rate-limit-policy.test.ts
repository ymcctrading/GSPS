import { describe, expect, it } from "vitest";
import { RATE_LIMITS, rateLimitBucket } from "@/lib/rate-limit-policy";

describe("rateLimitBucket", () => {
  it("puts password and broker-key guesses on the credential budget", () => {
    for (const path of ["/api/auth/username-login", "/api/auth/account-status", "/api/alpaca/connect-live"]) {
      expect(rateLimitBucket(path, "POST")).toBe("credential");
    }
    expect(RATE_LIMITS.credential).toBe(5);
  });

  it("leaves the breach check on the default budget, since a refused check lets the password through", () => {
    expect(rateLimitBucket("/api/auth/password-breach", "POST")).toBe("api");
  });

  it("puts sends and Stripe sessions on the outbound budget, but not reading push status", () => {
    expect(rateLimitBucket("/api/notifications/send-test", "POST")).toBe("outbound");
    expect(rateLimitBucket("/api/billing/checkout", "POST")).toBe("outbound");
    expect(rateLimitBucket("/api/notifications/push-subscription", "POST")).toBe("outbound");
    expect(rateLimitBucket("/api/notifications/push-subscription", "GET")).toBe("api");
    expect(rateLimitBucket("/api/promotion/paths/upgrade", "POST")).toBe("outbound");
  });

  it("puts ledger writes on the order budget and leaves their reads on the default", () => {
    expect(rateLimitBucket("/api/orders", "POST")).toBe("order");
    expect(rateLimitBucket("/api/orders/abc/cancel", "POST")).toBe("order");
    expect(rateLimitBucket("/api/positions/close-all", "POST")).toBe("order");
    expect(rateLimitBucket("/api/guided/execute", "POST")).toBe("order");
    expect(rateLimitBucket("/api/orders", "GET")).toBe("api");
    expect(rateLimitBucket("/api/trade-plans/p1/review", "GET")).toBe("api");
  });

  it("puts vendor reads on the scan budget, including a script's evaluate and backtest", () => {
    expect(rateLimitBucket("/api/scan", "GET")).toBe("scan");
    expect(rateLimitBucket("/api/strategy-plugins/s1/backtest", "GET")).toBe("scan");
    expect(rateLimitBucket("/api/strategy-plugins/s1/evaluate", "GET")).toBe("scan");
    expect(rateLimitBucket("/api/strategy-plugins/s1", "GET")).toBe("api");
  });

  it("no longer catches a sibling route that only shares letters with a prefix", () => {
    expect(rateLimitBucket("/api/scan-criteria", "GET")).toBe("api");
    expect(rateLimitBucket("/api/scan-history", "GET")).toBe("api");
  });
});
