import { describe, expect, it } from "vitest";
import { GLOSSARY_TERMS, glossarySlug } from "@/components/glossary";
import { PATTERN_GLOSSARY_TERM } from "@/lib/education/patterns";
import { SCANNER_STATE_META } from "@/lib/signals/types";

/**
 * Regression coverage for the cross-reference `components/glossary-term.tsx`'s
 * own doc comment promises but nothing previously checked: every
 * `<GlossaryTerm term={...}>` used elsewhere in the app must match a real
 * entry on this page exactly, or the link lands on an anchor with nothing
 * there. Found no actual dead links when checked by hand for this session's
 * pattern-education pass (the five STRAT pattern terms already had entries),
 * but nothing was guarding that — this is that guard, plus the same check
 * for the Signal and Regime Engine's four state labels added in this pass.
 */
describe("glossary cross-references", () => {
  it("has a glossary entry for every pattern name's display term", () => {
    for (const term of Object.values(PATTERN_GLOSSARY_TERM)) {
      expect(GLOSSARY_TERMS.has(term)).toBe(true);
    }
  });

  it("has a glossary entry for every signal state's label", () => {
    for (const meta of Object.values(SCANNER_STATE_META)) {
      expect(GLOSSARY_TERMS.has(meta.label)).toBe(true);
    }
  });

  it("never defines the same term twice (would collide on the same anchor id)", () => {
    const slugs = [...GLOSSARY_TERMS].map(glossarySlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
