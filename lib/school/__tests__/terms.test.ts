/**
 * Trading vocabulary by school tier (owner, 2026-11-12): a term reads with
 * its gloss in the tier whose school teaches it, and plainly from the next
 * tier on. Each term's tier is checked against the curriculum, so moving a
 * lesson to another academy moves the term with it.
 */
import { describe, it, expect } from "vitest";
import { ACADEMIES, schoolProgram } from "@/lib/school/curriculum";
import { TERMS, termIsFamiliar, termLabel, type TermId } from "@/lib/school/terms";
import { TIER_ORDER, tierRank, type PlatformTier } from "@/lib/tiers";

function tierThatTeaches(lessonId: string): PlatformTier | null {
  for (const a of ACADEMIES) {
    if (!a.courses.some((c) => c.lessons.some((l) => l.id === lessonId))) continue;
    const tiers = a.programIds.map((id) => schoolProgram(id).tier);
    return tiers.reduce((lo, t) => (tierRank(t) < tierRank(lo) ? t : lo));
  }
  return null;
}

describe("trading vocabulary by school tier", () => {
  it("ties every term to a real lesson, in the tier whose school teaches it", () => {
    for (const [id, t] of Object.entries(TERMS)) {
      expect(tierThatTeaches(t.lessonId), id).toBe(t.introducedIn);
    }
  });

  it("names each term in the lesson that teaches it", () => {
    const needle: Record<TermId, RegExp> = {
      buyStop: /stop order/i,
      sellStop: /stop order/i,
      stopLoss: /\bstop\b/i,
      tp1: /take-profit-1/i,
      tp2: /second target/i,
      mtp: /master target/i,
    };
    for (const [id, t] of Object.entries(TERMS) as [TermId, (typeof TERMS)[TermId]][]) {
      const lesson = ACADEMIES.flatMap((a) => a.courses.flatMap((c) => c.lessons)).find((l) => l.id === t.lessonId)!;
      expect(lesson.instruction.join(" "), id).toMatch(needle[id]);
    }
  });

  it("glosses a stop order as the entry in the Novice tier, and uses it plainly from Pro on (owner's example)", () => {
    expect(termLabel("buyStop", "PRACTICE")).toBe("Entry (buy stop)");
    expect(termLabel("buyStop", "STANDARD")).toBe("Buy stop");
    expect(termLabel("buyStop", "INVESTOR_MODE")).toBe("Buy stop");
    expect(termLabel("buyStop", "SYSTEM_MASTERY")).toBe("Buy stop");
  });

  it("glosses every term for a visitor, who has not started the school", () => {
    for (const id of Object.keys(TERMS) as TermId[]) expect(termLabel(id, null)).toBe(TERMS[id].introduced);
  });

  it("reads a term plainly only in a tier after the one that introduces it", () => {
    for (const id of Object.keys(TERMS) as TermId[]) {
      for (const tier of TIER_ORDER) {
        expect(termIsFamiliar(id, tier)).toBe(tierRank(tier) > tierRank(TERMS[id].introducedIn));
      }
    }
  });

  it("keeps the plain term inside its gloss, so a member learns the word they will read later", () => {
    for (const t of Object.values(TERMS)) expect(t.introduced.toLowerCase()).toContain(t.plain.toLowerCase());
  });
});
