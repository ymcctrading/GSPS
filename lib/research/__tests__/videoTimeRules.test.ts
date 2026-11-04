import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addSessions, VIDEO_TESTS, videoAll, videoDays } from "@/lib/research/videoTimeRules";

const run = JSON.parse(readFileSync(path.resolve(__dirname, "../../..", "docs/replay-runs/2026-10-30-video-time-rules.json"), "utf8"));
const dayOf = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
const iso = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

describe("the videos' counts land where the videos say", () => {
  it("counts sessions, not calendar days", () => {
    // Friday to Monday; over Independence Day 2025 (a Friday); and a Saturday session in 1930.
    expect(iso(addSessions(dayOf("2026-10-30"), 1))).toBe("2026-11-02");
    expect(iso(addSessions(dayOf("2025-07-03"), 1))).toBe("2025-07-07");
    expect(iso(addSessions(dayOf("1930-03-14"), 1))).toBe("1930-03-15");
  });

  it("the square root of 18604 steps 136 days from 19 Oct 2021 (Nifty)", () => {
    const days = videoDays("squareRoot", [{ date: "2021-10-19", price: 18604, kind: "high" }], "2022-01-01", 2022);
    const start = dayOf("2022-01-01");
    // 19 Oct 2021 + 136 = 4 Mar 2022, + 272 = 18 Jul 2022 (the video rounds to 137: 5 Mar and 20 Jul).
    expect(days).toContain(dayOf("2022-03-04") - start);
    expect(days).toContain(dayOf("2022-07-18") - start);
  });

  it("the emblem read from 14 Jan 2020 marks 15 Jul 2020 and 14 Sep 2021 (Tata Steel)", () => {
    const pivot = [{ date: "2020-01-14", price: 506, kind: "high" as const }];
    expect(videoDays("emblem", pivot, "2020-02-15", 2020)).toContain(dayOf("2020-07-15") - dayOf("2020-01-01"));
    expect(videoDays("emblem", pivot, "2020-02-15", 2021)).toContain(dayOf("2021-09-14") - dayOf("2021-01-01"));
  });

  it("reads no pivot until it is confirmed", () => {
    const pivot = (date: string) => [{ date, price: 100, kind: "low" as const }];
    expect(videoDays("count144", pivot("2022-01-01"), "2022-01-01", 2022)).toEqual([]);
    expect(videoDays("count144", pivot("2021-12-20"), "2022-01-01", 2022)).toEqual([]);
    expect(videoDays("count144", pivot("2021-12-01"), "2022-01-01", 2022)).not.toEqual([]);
  });
});

describe("the committed run still says what the module computes", () => {
  it("every rule and outcome", { timeout: 120_000 }, () => {
    const r = videoAll();
    expect(run.tests).toBe(VIDEO_TESTS);
    expect(r.map((m) => [m.rule, m.outcome, m.score.hits])).toEqual(
      run.results.map((m: { rule: string; outcome: string; hits: number }) => [m.rule, m.outcome, m.hits]),
    );
    // The finding the docs report: no count beats chance after the correction.
    for (const m of r) expect(m.score.p).toBeGreaterThan(0.05 / VIDEO_TESTS);
  });
});
