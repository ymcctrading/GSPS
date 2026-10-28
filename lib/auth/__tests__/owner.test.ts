import { describe, expect, it } from "vitest";
import { isOwnerEmail, OWNER_EMAILS, ownerOf, ownerReportRecipients } from "../owner";

describe("owner accounts", () => {
  it("is exactly the two owner addresses, case-insensitive", () => {
    expect(OWNER_EMAILS).toHaveLength(2);
    expect(isOwnerEmail(" ICharles.Coleman@gmail.com ")).toBe(true);
    expect(isOwnerEmail("someone@example.com")).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
  });

  it("the env can narrow the recipients but never widen them", () => {
    expect(ownerReportRecipients(undefined)).toEqual([...OWNER_EMAILS]);
    expect(ownerReportRecipients("ymcctrading@gmail.com")).toEqual(["ymcctrading@gmail.com"]);
    expect(ownerReportRecipients("attacker@example.com, ymcctrading@gmail.com")).toEqual(["ymcctrading@gmail.com"]);
    expect(ownerReportRecipients("attacker@example.com")).toEqual([]);
  });

  it("an unconfirmed address is not the owner", () => {
    expect(ownerOf({ email: "ymcctrading@gmail.com", email_confirmed_at: null })).toBeNull();
    expect(ownerOf({ email: "ymcctrading@gmail.com", email_confirmed_at: "2026-01-01T00:00:00Z" })).not.toBeNull();
    expect(ownerOf({ email: "x@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" })).toBeNull();
    expect(ownerOf(null)).toBeNull();
  });
});
