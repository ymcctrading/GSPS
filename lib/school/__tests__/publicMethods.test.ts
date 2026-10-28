/**
 * The School teaches public methods by others (Dow Theory, Wyckoff, Elliott
 * Wave, Fibonacci and the like), never the rules the back end is built from
 * (owner, 2026-10-28; AGENTS.md "Confidential sources"). The banned-terms
 * gate catches source names; this catches the method's own rules written out
 * in plain words, which no name check can see.
 */
import { describe, it, expect } from "vitest";
import { ACADEMIES } from "@/lib/school/curriculum";

const RULE_MARKERS: RegExp[] = [
  /over-?balanc/i,
  /swing chart/i,
  /\b3-day\b|three-day chart/i,
  /anniversar/i,
  /seven zones|zones of activity/i,
  /five qualifications/i,
  /50, (then )?30, (then )?20/,
  /a tenth of/i,
  /third month/i,
  /three losing trades in a row|three losses in a row/i,
  /third time through/i,
  /second or third week/i,
  /into its second week/i,
  /campaign/i,
];

describe("School lessons teach public methods only", () => {
  const lessons = ACADEMIES.flatMap((a) => a.courses.flatMap((c) => c.lessons.map((l) => ({ course: c, l }))));

  it("write none of the method's own rules into a lesson, quiz or application", () => {
    for (const { course, l } of lessons) {
      const text = [course.title, course.outcome, l.title, ...l.objectives, ...l.instruction, l.application, ...l.quiz.flatMap((q) => [q.question, ...q.choices])].join(" ");
      for (const m of RULE_MARKERS) expect(text, `${l.id} matches ${m}`).not.toMatch(m);
    }
  });

  it("keeps Mr. Bull and Mrs. Bear in each rewritten course", () => {
    for (const id of ["academy-2/simple-rules", "academy-4/reading-the-swings", "academy-6/method-rules"]) {
      const c = ACADEMIES.flatMap((a) => a.courses).find((x) => x.id === id)!;
      const text = c.lessons.flatMap((l) => l.instruction).join(" ");
      expect(text).toMatch(/Mr\. Bull/);
      expect(text).toMatch(/Mrs\. Bear/);
    }
  });
});
