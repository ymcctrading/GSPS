import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { seeded } from "@/lib/research/preregisteredTimeTests";
import { assignEpisodes, buildInput, prepare, type PinnedSeries } from "@/lib/research/mtfAdapter";
import { runR01, validateInput } from "@/lib/research/mtfCandidate";
import { dataMonthEnd, extremeLabels, n2, runArm, tally, weeklyIssues } from "@/lib/research/mtfEvaluate";
import { R01_RULE } from "@/lib/research/mtfCandidate";

/** A seeded random walk on weekdays: synthetic, for causality checks only. */
function walk(n: number, seed: number): PinnedSeries {
  const rnd = seeded(seed);
  const bars: Bar[] = [];
  let px = 100;
  let d = Date.parse("2001-01-02T00:00:00Z");
  while (bars.length < n) {
    const wd = new Date(d).getUTCDay();
    if (wd !== 0 && wd !== 6) {
      const o = px;
      px = Math.max(1, px * (1 + (rnd() - 0.5) * 0.04));
      bars.push({ t: new Date(d).toISOString().slice(0, 10), o, h: Math.max(o, px) * (1 + rnd() * 0.01), l: Math.min(o, px) * (1 - rnd() * 0.01), c: px, v: 1 });
    }
    d += 86_400_000;
  }
  return { symbol: "SYNTH", bars, snapshotHash: "synthetic", source: "seeded random walk" };
}

describe("MTF-R0.1 adapter", () => {
  const full = walk(2600, 7);
  const dates = full.bars.map((b) => b.t);
  const monthEnd = dataMonthEnd(dates);
  const p = prepare(full);

  it("reads only bars up to the issue session: the input equals one built from the truncated series", () => {
    for (const e of [400, 911, 1500, 2203, 2599]) {
      const cut = { ...full, bars: full.bars.slice(0, e + 1) };
      // The calendar (not the data) says whether the issue session ends its month.
      const a = buildInput(prepare(cut), e, monthEnd);
      const b = buildInput(p, e, monthEnd);
      expect(a).toEqual(b);
    }
  });

  it("emits admissible inputs: every anchor occurred and was confirmed by the issue session", () => {
    let withMajors = 0;
    let withReaction = 0;
    for (let e = 300; e < dates.length; e += 37) {
      const input = buildInput(p, e, monthEnd);
      expect(validateInput(input)).toEqual([]);
      if (input.majorAnchors.length) withMajors++;
      if (input.reactionAnchors.length) withReaction++;
    }
    expect(withMajors).toBeGreaterThan(0);
    expect(withReaction).toBeGreaterThan(0);
  });

  it("ties the expected type and the duration to the same 3-Day Chart leg", () => {
    for (let e = 300; e < dates.length; e += 53) {
      const input = buildInput(p, e, monthEnd);
      const r = input.reactionAnchors[0];
      if (!r) continue;
      expect(input.trend).toBe(r.kind === "bottom" ? "up" : "down");
      expect(r.modeSource).toMatch(r.mode === "rapid" ? / with the / : / against the /);
    }
  });

  it("joins anchors within 14 calendar days into one episode", () => {
    const eps = assignEpisodes([
      { id: "a", date: "2020-01-01" },
      { id: "b", date: "2020-01-15" },
      { id: "c", date: "2020-01-29" },
      { id: "d", date: "2020-03-01" },
    ]);
    expect(eps.map((x) => x.episode)).toEqual(["ep:2020-01-01", "ep:2020-01-01", "ep:2020-01-01", "ep:2020-03-01"]);
  });
});

describe("MTF-R0.1 evaluation", () => {
  it("labels centred 41-session closing extremes with the earliest tie, unresolved at the edges", () => {
    const c = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 6));
    c[30] = 200;
    c[31] = 200;
    const l = extremeLabels(c);
    expect(l[30]).toBe("top");
    expect(l[31]).toBe(null);
    expect(l[5]).toBe(undefined);
    expect(l[59]).toBe(undefined);
  });

  it("issues after each week's last session", () => {
    expect(weeklyIssues(["2026-10-26", "2026-10-27", "2026-10-30", "2026-11-02", "2026-11-06"], "2026-01-01", "2026-12-31")).toEqual([2, 4]);
  });

  it("runs end to end and the N2 null keeps the window set fixed", () => {
    const s = walk(1800, 11);
    const pr = prepare(s);
    const iss = weeklyIssues(s.bars.map((b) => b.t), "2003-01-01", "2099-01-01");
    const run = runArm(pr, iss, R01_RULE);
    const labels = extremeLabels(s.bars.map((b) => b.c));
    const t = tally(run.windows, (i) => labels[i]);
    const r = n2(run.windows, labels, iss[0], s.bars.length - 1, 1, 200);
    expect(r.observed).toEqual(t);
    expect(r.p).toBeGreaterThan(0);
    expect(r.p).toBeLessThanOrEqual(1);
    // Deterministic: the same seed gives the same null.
    expect(n2(run.windows, labels, iss[0], s.bars.length - 1, 1, 200)).toEqual(r);
    // Every issued window opens after its issue session.
    for (const w of run.windows) expect(w.start > w.issued).toBe(true);
    expect(runR01(buildInput(pr, iss.at(-1)!, dataMonthEnd(s.bars.map((b) => b.t)))).calibration).toBe("uncalibrated");
  });
});
