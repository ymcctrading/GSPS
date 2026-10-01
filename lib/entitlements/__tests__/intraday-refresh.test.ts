import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeIntradayRefreshBudget,
  countIntradayRefreshes,
  describeRefreshBlock,
  recordIntradayRefresh,
} from "@/lib/entitlements/intraday-refresh";

const pro = { perDay: 3, perWeek: 10 } as const;

describe("computeIntradayRefreshBudget", () => {
  it("counts down what is left on each budget", () => {
    const b = computeIntradayRefreshBudget(pro, { today: 1, week: 4 });
    expect(b.remainingToday).toBe(2);
    expect(b.remainingThisWeek).toBe(6);
    expect(b.allowed).toBe(true);
    expect(b.blockedBy).toBeNull();
    expect(b.automatic).toBe(false);
  });

  it("blocks when the day's refreshes are used, even with the week's to spare", () => {
    const b = computeIntradayRefreshBudget(pro, { today: 3, week: 3 });
    expect(b.allowed).toBe(false);
    expect(b.blockedBy).toBe("day");
    expect(b.remainingToday).toBe(0);
    expect(b.remainingThisWeek).toBe(7);
  });

  it("blocks when the week's refreshes are used, even on a fresh day", () => {
    const b = computeIntradayRefreshBudget(pro, { today: 0, week: 10 });
    expect(b.allowed).toBe(false);
    expect(b.blockedBy).toBe("week");
  });

  it("never reports a negative remainder", () => {
    const b = computeIntradayRefreshBudget(pro, { today: 7, week: 40 });
    expect(b.remainingToday).toBe(0);
    expect(b.remainingThisWeek).toBe(0);
  });

  it("never allows a refresh where the plan has none (Novice)", () => {
    const b = computeIntradayRefreshBudget({ perDay: 0, perWeek: 0 }, { today: 0, week: 0 });
    expect(b.allowed).toBe(false);
    expect(b.blockedBy).toBe("day");
  });

  it("is automatic only where both budgets are unlimited", () => {
    const unlimited = computeIntradayRefreshBudget({ perDay: "unlimited", perWeek: "unlimited" }, { today: 500, week: 900 });
    expect(unlimited.automatic).toBe(true);
    expect(unlimited.allowed).toBe(true);
    expect(unlimited.remainingToday).toBe("unlimited");
    expect(computeIntradayRefreshBudget({ perDay: "unlimited", perWeek: 5 }, { today: 0, week: 0 }).automatic).toBe(false);
  });
});

describe("describeRefreshBlock", () => {
  it("says which budget ran out", () => {
    const day = computeIntradayRefreshBudget(pro, { today: 3, week: 3 });
    const week = computeIntradayRefreshBudget(pro, { today: 0, week: 10 });
    expect(describeRefreshBlock(day)).toMatch(/all 3 of today's intraday refreshes/);
    expect(describeRefreshBlock(week)).toMatch(/all 10 intraday refreshes for the past seven days/);
    expect(describeRefreshBlock(computeIntradayRefreshBudget(pro, { today: 0, week: 0 }))).toBe("");
  });
});

function fakeClient(result: { data?: unknown; error?: { message: string } | null }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "limit", "insert"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.single = () => Promise.resolve(result);
  chain.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => Promise.resolve(result).then(f, r);
  return { client: { from: () => chain } as unknown as SupabaseClient, calls };
}

describe("countIntradayRefreshes", () => {
  // 2026-09-30 15:00 UTC is 11:00 ET on the 30th.
  const now = new Date("2026-09-30T15:00:00.000Z");

  it("splits the trailing week into today (by ET day) and the rest", async () => {
    const { client, calls } = fakeClient({
      data: [
        { started_at: "2026-09-30T14:30:00.000Z" }, // today 10:30 ET
        { started_at: "2026-09-30T04:30:00.000Z" }, // 00:30 ET today
        { started_at: "2026-09-30T03:30:00.000Z" }, // 23:30 ET on the 29th — yesterday
        { started_at: "2026-09-27T15:00:00.000Z" },
      ],
    });
    expect(await countIntradayRefreshes(client, "u1", now)).toEqual({ today: 2, week: 4 });
    expect(calls).toContainEqual({ method: "eq", args: ["profile_id", "u1"] });
    expect(calls).toContainEqual({ method: "eq", args: ["source", "intraday"] });
    expect(calls).toContainEqual({ method: "gte", args: ["started_at", "2026-09-23T15:00:00.000Z"] });
  });

  it("counts none used when the read fails, rather than blocking a scan on a bookkeeping error", async () => {
    const { client } = fakeClient({ data: null, error: { message: "down" } });
    expect(await countIntradayRefreshes(client, "u1", now)).toEqual({ today: 0, week: 0 });
  });
});

describe("recordIntradayRefresh", () => {
  const now = new Date("2026-09-30T15:00:00.000Z");

  it("writes an intraday scan_executions row for the profile and returns its id", async () => {
    const { client, calls } = fakeClient({ data: { id: "exec-1" } });
    expect(await recordIntradayRefresh(client, "u1", { eligible: 0, visible: 0 }, now)).toBe("exec-1");
    expect(calls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
      profile_id: "u1",
      source: "intraday",
      eligible_count: 0,
      visible_count: 0,
    });
  });

  it("returns null rather than throwing when the write fails", async () => {
    const { client } = fakeClient({ data: null, error: { message: "nope" } });
    expect(await recordIntradayRefresh(client, "u1", { eligible: 1, visible: 1 }, now)).toBeNull();
  });
});
