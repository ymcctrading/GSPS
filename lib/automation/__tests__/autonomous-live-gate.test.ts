import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  autonomousLiveTradingHalted,
  checkAutonomousLiveTradingAuthorized,
} from "@/lib/automation/autonomous-live-gate";

function fakeSignoffClient(row: { id: string } | null) {
  const client = {
    from(_table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                is() {
                  return {
                    limit() {
                      return { maybeSingle: () => Promise.resolve({ data: row, error: null }) };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return client;
}

const ORIGINAL_ENV = process.env.AUTONOMOUS_LIVE_TRADING_HALTED;
afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.AUTONOMOUS_LIVE_TRADING_HALTED;
  else process.env.AUTONOMOUS_LIVE_TRADING_HALTED = ORIGINAL_ENV;
});

describe("autonomousLiveTradingHalted", () => {
  it("defaults to halted when unset", () => {
    delete process.env.AUTONOMOUS_LIVE_TRADING_HALTED;
    expect(autonomousLiveTradingHalted()).toBe(true);
  });

  it("stays halted on anything other than exactly \"false\"", () => {
    process.env.AUTONOMOUS_LIVE_TRADING_HALTED = "FALSE-ish";
    expect(autonomousLiveTradingHalted()).toBe(true);
  });

  it("is only cleared by an explicit \"false\"", () => {
    process.env.AUTONOMOUS_LIVE_TRADING_HALTED = "false";
    expect(autonomousLiveTradingHalted()).toBe(false);
  });
});

describe("checkAutonomousLiveTradingAuthorized", () => {
  it("refuses when the kill switch is engaged, without even checking sign-off", () => {
    process.env.AUTONOMOUS_LIVE_TRADING_HALTED = "true";
    return checkAutonomousLiveTradingAuthorized(fakeSignoffClient({ id: "s1" })).then((r) => {
      expect(r.authorized).toBe(false);
      expect(r.reason).toMatch(/kill switch|halted/i);
    });
  });

  it("refuses when the kill switch is clear but no sign-off is recorded", async () => {
    process.env.AUTONOMOUS_LIVE_TRADING_HALTED = "false";
    const r = await checkAutonomousLiveTradingAuthorized(fakeSignoffClient(null));
    expect(r.authorized).toBe(false);
    expect(r.reason).toMatch(/sign-off/i);
  });

  it("authorizes only when both the kill switch is clear and a sign-off is recorded", async () => {
    process.env.AUTONOMOUS_LIVE_TRADING_HALTED = "false";
    const r = await checkAutonomousLiveTradingAuthorized(fakeSignoffClient({ id: "s1" }));
    expect(r.authorized).toBe(true);
  });
});
