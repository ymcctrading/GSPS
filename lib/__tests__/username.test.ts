import { describe, it, expect } from "vitest";
import { isValidUsername } from "@/lib/username";

describe("isValidUsername", () => {
  it("accepts letters, digits and underscores within 3-32 characters", () => {
    expect(isValidUsername("bob")).toBe(true);
    expect(isValidUsername("Bob_123")).toBe(true);
    expect(isValidUsername("a".repeat(32))).toBe(true);
  });

  it("rejects anything shorter than 3 or longer than 32 characters", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a".repeat(33))).toBe(false);
  });

  it("rejects characters outside letters, digits and underscore", () => {
    expect(isValidUsername("bob smith")).toBe(false);
    expect(isValidUsername("bob@example.com")).toBe(false);
    expect(isValidUsername("bob-smith")).toBe(false);
    expect(isValidUsername("' or 1=1--")).toBe(false);
  });

  it("rejects non-string input without throwing", () => {
    expect(isValidUsername(null)).toBe(false);
    expect(isValidUsername(undefined)).toBe(false);
    expect(isValidUsername(123)).toBe(false);
    expect(isValidUsername({ toString: () => "bob" })).toBe(false);
    expect(isValidUsername(["bob"])).toBe(false);
  });
});
