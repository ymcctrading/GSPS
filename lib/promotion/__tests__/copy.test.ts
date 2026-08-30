import { describe, expect, it } from "vitest";
import {
  containsForbiddenPromotionPhrase,
  NEUTRAL_UPGRADE_PROMPT,
  noviceEntriesAvailableTodayLabel,
  PROMOTION_FORBIDDEN_PHRASES,
} from "@/lib/promotion/copy";

describe("promotion copy", () => {
  it("flags a forbidden phrase regardless of casing", () => {
    expect(containsForbiddenPromotionPhrase("This is a GUARANTEED winner")).toBe("guaranteed");
    expect(containsForbiddenPromotionPhrase("Nothing to see here")).toBeNull();
  });

  it("the neutral upgrade prompt contains no forbidden phrase", () => {
    expect(containsForbiddenPromotionPhrase(NEUTRAL_UPGRADE_PROMPT)).toBeNull();
  });

  it("every forbidden phrase is itself flagged (sanity check on the list)", () => {
    for (const phrase of PROMOTION_FORBIDDEN_PHRASES) {
      expect(containsForbiddenPromotionPhrase(`prefix ${phrase} suffix`)).toBe(phrase);
    }
  });

  it("phrases the Novice entry count as a maximum, never a target", () => {
    expect(noviceEntriesAvailableTodayLabel(0)).toContain("maximum");
    expect(noviceEntriesAvailableTodayLabel(3)).toBe("3 new entries available today (maximum)");
    expect(noviceEntriesAvailableTodayLabel(1)).toBe("1 new entry available today (maximum)");
  });
});
