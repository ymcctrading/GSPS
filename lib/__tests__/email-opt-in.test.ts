import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailOptedIn } from "@/lib/notifications/email-opt-in";

function client(result: { data: { email_enabled: boolean | null } | null; error: { message: string } | null }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe("emailOptedIn", () => {
  it("is on only when the member turned email on", async () => {
    expect(await emailOptedIn(client({ data: { email_enabled: true }, error: null }), "u")).toBe(true);
    expect(await emailOptedIn(client({ data: { email_enabled: false }, error: null }), "u")).toBe(false);
    expect(await emailOptedIn(client({ data: { email_enabled: null }, error: null }), "u")).toBe(false);
  });

  it("is off for a member who never saved settings", async () => {
    expect(await emailOptedIn(client({ data: null, error: null }), "u")).toBe(false);
  });

  it("sends nothing when the preferences can't be read", async () => {
    expect(await emailOptedIn(client({ data: null, error: { message: "down" } }), "u")).toBe(false);
  });
});
