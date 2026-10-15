import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { selectGannEntry } from "@/lib/gann/entryTrigger";
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

  it("answers trade at a resting buy: a crossed level that holds, or an old bottom", () => {
    // Seven days up 2, three days down 1: each rally crosses the last top by
    // 3 points and each reaction stops short of the buy 1 point above it.
    const bars = daily(200, (i) => 100 + Math.floor(i / 10) * 11 + (i % 10 < 7 ? (i % 10) * 2 : 12 - (i % 10 - 6)));
    let held = 0;
    let oldLevel = 0;
    for (let k = 80; k < 190; k++) {
      const asOf = bars[k].t.slice(0, 10);
      const s = buildScenario("TEST", asOf, bars, 7);
      if (!s || s.key.direction !== "bullish") continue;
      const t = selectGannEntry(bars.slice(0, k), "bullish");
      if (!t || (t.kind === "crossing" && !t.held)) continue;
      if (t.kind === "crossing") held++;
      else oldLevel++;
      expect(s.key.decision).toBe("trade");
      expect(s.key.entry).toBeCloseTo(t.reactionEntry, 2);
      expect(s.key.stop).toBeCloseTo(t.reactionStop, 2);
      expect(s.key.crossed).toBe(true);
      // A reaction straight to the buy fills; no fresh crossing is needed.
      const dip = { t: "2099-01-01", h: s.key.entry! + 1, l: s.key.entry! - 0.05, c: s.key.entry! + 0.5 };
      const graded = gradeExam("pro_to_expert", [{ ...s, playback: [dip] }], [{ trend: s.key.trend, decision: "trade" }]);
      expect(graded.scenarios[0].playedOut).toMatch(/^The entry filled/);
    }
    expect(held).toBeGreaterThan(0);
    expect(oldLevel).toBeGreaterThan(0);
  });
});
