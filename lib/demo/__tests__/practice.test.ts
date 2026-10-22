import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isPrefetchRequest,
  PRACTICE_TIERS,
  practiceTierFrom,
  practiceTierOfUser,
  practiceWriteRefused,
} from "@/lib/demo/practice";
import { TIER_ORDER } from "@/lib/tiers";

describe("practice tiers", () => {
  it("has one practice account per tier, in tier order", () => {
    expect(PRACTICE_TIERS.map((t) => t.tier)).toEqual(TIER_ORDER);
    expect(new Set(PRACTICE_TIERS.map((t) => t.email)).size).toBe(4);
    for (const t of PRACTICE_TIERS) expect(t.email.endsWith(".invalid")).toBe(true);
  });

  it("reads a slug or the enum, and nothing else", () => {
    expect(practiceTierFrom("novice")?.tier).toBe("PRACTICE");
    expect(practiceTierFrom("Wall-Street")?.tier).toBe("SYSTEM_MASTERY");
    expect(practiceTierFrom("INVESTOR_MODE")?.slug).toBe("expert");
    expect(practiceTierFrom("standard")?.slug).toBe("pro");
    expect(practiceTierFrom("platinum")).toBeNull();
    expect(practiceTierFrom("")).toBeNull();
    expect(practiceTierFrom(null)).toBeNull();
  });

  it("knows a practice session only from app_metadata", () => {
    expect(practiceTierOfUser({ app_metadata: { practice_tier: "STANDARD" } })?.label).toBe("Pro");
    expect(practiceTierOfUser({ app_metadata: { provider: "email" } })).toBeNull();
    expect(practiceTierOfUser({ app_metadata: { practice_tier: "pro" } })).toBeNull();
    expect(practiceTierOfUser(null)).toBeNull();
  });
});

describe("practiceWriteRefused", () => {
  it("lets a practice session read anything", () => {
    expect(practiceWriteRefused("/api/orders", "GET")).toBe(false);
    expect(practiceWriteRefused("/api/guided", "GET")).toBe(false);
  });

  it("refuses orders, settings, billing, promotion, brokers and account changes", () => {
    for (const path of [
      "/api/orders",
      "/api/orders/abc/cancel",
      "/api/positions/close-all",
      "/api/guided/execute",
      "/api/guided",
      "/api/settings/guided",
      "/api/billing/checkout",
      "/api/promotion/paths/upgrade",
      "/api/alpaca/connect-live",
      "/api/automation/profiles",
      "/api/school/lessons/x/complete",
      "/api/dashboard-watchlist",
    ]) {
      expect(practiceWriteRefused(path, "POST"), path).toBe(true);
    }
    expect(practiceWriteRefused("/api/price-alerts/1", "DELETE")).toBe(true);
    expect(practiceWriteRefused("/api/saved-setups/1", "PATCH")).toBe(true);
  });

  it("allows a scan, the tour, reading a notice and switching tiers", () => {
    expect(practiceWriteRefused("/api/market-scan", "POST")).toBe(false);
    expect(practiceWriteRefused("/api/onboarding", "POST")).toBe(false);
    expect(practiceWriteRefused("/api/notifications/inbox/123/read", "POST")).toBe(false);
    expect(practiceWriteRefused("/api/notifications/inbox/read-all", "POST")).toBe(false);
    expect(practiceWriteRefused("/api/demo/open", "POST")).toBe(false);
    expect(practiceWriteRefused("/api/market-scan/extra", "POST")).toBe(true);
  });
});

describe("prefetches never end a practice session", () => {
  const h = (entries: Record<string, string>) => new Headers(entries);
  it("reads Next's router prefetch and the browser's purpose header", () => {
    expect(isPrefetchRequest(h({ "next-router-prefetch": "1", rsc: "1" }))).toBe(true);
    expect(isPrefetchRequest(h({ "sec-purpose": "prefetch;prerender" }))).toBe(true);
    expect(isPrefetchRequest(h({ purpose: "prefetch" }))).toBe(true);
  });
  it("a visit, including a client navigation, is not a prefetch", () => {
    expect(isPrefetchRequest(h({}))).toBe(false);
    expect(isPrefetchRequest(h({ rsc: "1" }))).toBe(false);
  });
  it("the proxy checks it before signing a practice visitor out", () => {
    const proxy = readFileSync("proxy.ts", "utf8");
    expect(proxy).toMatch(/practice && \(path === "\/login" \|\| path === "\/signup"\) && !isPrefetchRequest\(request\.headers\)/);
  });
});

