import { afterEach, describe, expect, it } from "vitest";
import { isCronAuthorized } from "@/lib/cron-auth";

const saved = process.env.CRON_SECRET;
afterEach(() => {
  if (saved === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved;
});

describe("isCronAuthorized", () => {
  it("accepts only the exact bearer header", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isCronAuthorized("Bearer s3cret")).toBe(true);
    expect(isCronAuthorized("Bearer s3cres")).toBe(false);
    expect(isCronAuthorized("Bearer s3cret ")).toBe(false);
    expect(isCronAuthorized(null)).toBe(false);
  });

  it("fails closed when the secret is unset", () => {
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized("Bearer undefined")).toBe(false);
    expect(isCronAuthorized("Bearer ")).toBe(false);
  });
});
