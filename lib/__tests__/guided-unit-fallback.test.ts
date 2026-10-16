import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const winningRun = vi.hoisted(() => ({ value: null as null | { consecutiveWins: number; streakProfitUsd: number } }));
vi.mock("@/lib/brokers/simulator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/brokers/simulator")>("@/lib/brokers/simulator");
  return {
    ...actual,
    getOrCreateAccount: async () => ({ cash: 250_000 }),
    listOpenPositions: async () => [],
    quotePrice: async () => null,
  };
});
vi.mock("@/lib/risk/dynamic-risk", async () => {
  const actual = await vi.importActual<typeof import("@/lib/risk/dynamic-risk")>("@/lib/risk/dynamic-risk");
  return { ...actual, readWinningRun: async () => winningRun.value };
});

import { readGuidedAccount } from "@/lib/guided/service";
import { STARTING_CASH } from "@/lib/brokers/simulator";

describe("Guided sizing capital when the run of wins can't be read", () => {
  it("takes no step-up: sizes off the starting capital, not the grown equity", async () => {
    winningRun.value = null;
    const a = await readGuidedAccount({} as SupabaseClient, "u1");
    expect(a.equity).toBe(250_000);
    expect(a.riskCapital).toBe(STARTING_CASH);
  });
  it("with the run readable, doubles the unit once profits equal the starting capital", async () => {
    winningRun.value = { consecutiveWins: 0, streakProfitUsd: 0 };
    const a = await readGuidedAccount({} as SupabaseClient, "u1");
    expect(a.riskCapital).toBe(2 * STARTING_CASH);
  });
});
