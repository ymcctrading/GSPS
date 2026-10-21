import { describe, expect, it } from "vitest";
import {
  containsForbiddenPromotionPhrase,
  NEUTRAL_UPGRADE_PROMPT,
  noviceOpenRoomLabel,
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

  it("phrases the Novice open room as a maximum, never a target", () => {
    expect(noviceOpenRoomLabel(0, 0)).toContain("maximum");
    expect(noviceOpenRoomLabel(5, 3)).toBe("Room for 5 more stocks and 3 more crypto pairs (maximum)");
    expect(noviceOpenRoomLabel(1, 1)).toBe("Room for 1 more stock and 1 more crypto pair (maximum)");
  });
});
