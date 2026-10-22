import { afterEach, describe, expect, it } from "vitest";
import { serviceRoleKey } from "@/lib/supabase/service-key";

describe("serviceRoleKey (review finding S-06)", () => {
  afterEach(() => {
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("prefers the secret key over the legacy service role key", () => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_new";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy";
    expect(serviceRoleKey()).toBe("sb_secret_new");
  });

  it("falls back to the legacy key, and to nothing when neither is set", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy";
    expect(serviceRoleKey()).toBe("legacy");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(serviceRoleKey()).toBeUndefined();
  });

  it("treats a blank secret key as unset", () => {
    process.env.SUPABASE_SECRET_KEY = "   ";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy";
    expect(serviceRoleKey()).toBe("legacy");
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    expect(serviceRoleKey()).toBeUndefined();
  });
});
