import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { buildScenario, gradeExam, pickScenarioSeeds, PASS_MARK, type StoredScenario } from "@/lib/school/graduationExam";

function daily(n: number, f: (i: number) => number, start = "2024-01-01"): Bar[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const c = f(i);
    return { t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.6, l: c - 0.6, c, v: 1e6 };
  });
}

describe("graduation exam", () => {
  it("picks distinct symbols and weekday dates, reproducibly", () => {
    const a = pickScenarioSeeds(42, new Date("2026-09-28T00:00:00Z"));
    const b = pickScenarioSeeds(42, new Date("2026-09-28T00:00:00Z"));
    expect(a).toEqual(b);
    expect(new Set(a.map((x) => x.symbol)).size).toBe(a.length);
    for (const s of a) expect([0, 6]).not.toContain(new Date(`${s.asOf}T12:00:00Z`).getUTCDay());
  });

  it("builds the key only from bars before the date, and grades against it", () => {
    // A stepping uptrend, then the play-forward.
    const bars = daily(200, (i) => 100 + i * 0.3 + Math.sin(i / 2.5) * 3);
    const asOf = bars[170].t.slice(0, 10);
    const s = buildScenario("TEST", asOf, bars, 7) as StoredScenario;
    expect(s).not.toBeNull();
    expect(s.view.bars.every((b) => b.t < asOf)).toBe(true);
    const k = s.key;
    const perfect = gradeExam("pro_to_expert", [s], [
      { trend: k.trend, decision: k.decision, entryChoiceId: k.entryChoiceId ?? undefined, stopChoiceId: k.stopChoiceId ?? undefined, shares: k.shares ?? undefined },
    ]);
    expect(perfect.score).toBe(1);
    expect(perfect.passed).toBe(true);
    const wrong = gradeExam("pro_to_expert", [s], [{ trend: k.trend === "up" ? "down" : "up", decision: k.decision === "trade" ? "wait" : "trade" }]);
    expect(wrong.score).toBeLessThan(PASS_MARK);
    expect(perfect.scenarios[0].playedOut.length).toBeGreaterThan(0);
  });
});
