import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/routes";

describe("safeNextPath", () => {
  it("keeps an in-app path", () => {
    expect(safeNextPath("/ticker/AAPL?tf=1Day")).toBe("/ticker/AAPL?tf=1Day");
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
  });

  it("refuses anything that leaves the origin", () => {
    for (const next of ["https://evil.com", "//evil.com", "/\\evil.com", "@evil.com", ".evil.com", "evil.com", ""]) {
      expect(safeNextPath(next)).toBe("/dashboard");
    }
    expect(safeNextPath(null)).toBe("/dashboard");
  });

  it("shows why the old `${origin}${next}` join was unsafe", () => {
    expect(new URL(`https://gsps.example${"@evil.com"}`).host).toBe("evil.com");
  });
});
