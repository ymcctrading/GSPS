import { describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";
import { CRITERION_KEYS } from "@/lib/scoring/weights";
import { LADDER_RULE_NAMES, RULE_LADDER, ladderRules, ruleAllows } from "@/lib/backtest/ruleLadder";
import { REPLAY_HOLD_KEYS, readSessionRules, type SessionRuleReading } from "@/lib/backtest/replay";

const reading = (over: Partial<SessionRuleReading> = {}): SessionRuleReading => ({
  plan: true,
  score: 7,
  outputState: "Watch",
  pillars: { marketCycle: true, timeFactors: false },
  holdsFired: ["breakaway"],
  ...over,
});

describe("RULE_LADDER", () => {
  it("names every pillar and hold once, pillars first in the checklist order", () => {
    expect(RULE_LADDER).toHaveLength(CRITERION_KEYS.length + REPLAY_HOLD_KEYS.length);
    expect(RULE_LADDER[0].name).toBe("pillar:marketCycle");
    expect(RULE_LADDER[CRITERION_KEYS.length].name).toBe("hold:breakaway");
    expect(new Set(LADDER_RULE_NAMES).size).toBe(LADDER_RULE_NAMES.length);
  });
});

describe("ruleAllows", () => {
  it("reads pillars, holds and the references", () => {
    const r = reading();
    expect(ruleAllows("pillar:marketCycle", r)).toBe(true);
    expect(ruleAllows("pillar:timeFactors", r)).toBe(false);
    expect(ruleAllows("pillar:activity", r)).toBe(false); // unread fails, as a pillar does
    expect(ruleAllows("hold:breakaway", r)).toBe(false);
    expect(ruleAllows("hold:readyNow", r)).toBe(true);
    expect(ruleAllows("ref:plan", r)).toBe(true);
    expect(ruleAllows("ref:score7", r)).toBe(true);
    expect(ruleAllows("ref:score7", reading({ score: 6 }))).toBe(false);
    expect(ruleAllows("ref:execute", r)).toBe(false);
  });

  it("refuses every pillar and allows every hold when GSPS priced no buying point", () => {
    const none = reading({ plan: false, score: null, outputState: null, pillars: {}, holdsFired: [] });
    for (const rung of RULE_LADDER) expect(ruleAllows(rung.name, none)).toBe(rung.kind === "hold");
  });

  it("throws on a name it does not know", () => {
    expect(() => ruleAllows("pillar:nope", reading())).toThrow();
  });
});

describe("ladderRules", () => {
  it("reads once per session and side, whatever the number of rules", () => {
    const read = vi.fn(() => reading());
    const rules = ladderRules("AAA", { dailyBars: [] }, LADDER_RULE_NAMES, read as unknown as typeof readSessionRules);
    for (const rule of rules) rule.allows({ symbol: "AAA", side: "long", asOf: "2024-03-01" });
    for (const rule of rules) rule.allows({ symbol: "AAA", side: "short", asOf: "2024-03-01" });
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenNthCalledWith(1, "AAA", "2024-03-01", "bullish", { dailyBars: [] });
    expect(read).toHaveBeenNthCalledWith(2, "AAA", "2024-03-01", "bearish", { dailyBars: [] });
  });
});

describe("readSessionRules", () => {
  /** Weekdays from 2023-01-02, oscillating in eight-session runs on a rising line. */
  function daily(count: number): Bar[] {
    const out: Bar[] = [];
    const d = new Date("2023-01-02T00:00:00Z");
    while (out.length < count) {
      const dow = d.getUTCDay();
      if (dow !== 0 && dow !== 6) {
        const i = out.length;
        const c = 50 + i * 0.05 + (i % 16 < 8 ? i % 8 : 8 - (i % 8)) * 0.8;
        out.push({ t: `${d.toISOString().slice(0, 10)}T00:00:00Z`, o: c - 0.2, h: c + 0.6, l: c - 0.6, c, v: 1_000_000 + (i % 5) * 50_000 });
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }

  it("reads nothing before the score's minimum history", () => {
    const bars = daily(10);
    expect(readSessionRules("AAA", "2023-01-20", "bullish", { dailyBars: bars }).plan).toBe(false);
  });

  it("reads only sessions before the date asked", () => {
    const bars = daily(320);
    const date = bars[200].t.slice(0, 10);
    const a = readSessionRules("AAA", date, "bullish", { dailyBars: bars });
    const b = readSessionRules("AAA", date, "bullish", { dailyBars: bars.slice(0, 200) });
    expect(a).toEqual(b);
    expect(a.plan).toBe(true);
    expect(Object.keys(a.pillars).sort()).toEqual([...CRITERION_KEYS].sort());
    for (const k of a.holdsFired) expect(REPLAY_HOLD_KEYS).toContain(k);
  });
});

describe("REPLAY_HOLD_KEYS", () => {
  it("names every hold the replay's verdict chain applies, so a new hold reaches the ladder", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("lib/backtest/replay.ts", "utf8");
    const body = src.slice(src.indexOf("function scoreSetup("), src.indexOf("if (!readHolds)"));
    const chained = new Set([...body.matchAll(/apply(\w+)Hold\(/g)].map((m) => m[1]));
    const named = new Set(REPLAY_HOLD_KEYS.map((k) => k[0].toUpperCase() + k.slice(1)));
    expect(chained).toEqual(named);
  });
});
