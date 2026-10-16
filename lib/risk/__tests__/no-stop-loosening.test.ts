import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getLesson } from "@/lib/school/content";

// Q10 (owner, 2026-10-16): a stop only moves in the trade's favour (W006
// pp.15-16, 47). The live widen-or-remove override is gone, and the lesson
// teaches the rule instead of the friction around breaking it.
describe("a live stop is never widened or removed", () => {
  it("has no route or module that widens or removes a live stop", () => {
    expect(existsSync("app/api/risk/stop-override")).toBe(false);
    expect(existsSync("lib/risk/stop-override.ts")).toBe(false);
  });

  it("teaches that a stop only moves with the trade", () => {
    const lesson = getLesson("stop-discipline")!;
    const text = [lesson.title, ...lesson.instruction].join(" ");
    expect(text).toMatch(/only moves in the trade's favour/);
    expect(text).not.toMatch(/verified-email|verification link/);
  });
});
