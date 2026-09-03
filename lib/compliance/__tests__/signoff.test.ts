import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFeatureAuthorized } from "@/lib/compliance/signoff";

function fakeClient(result: { data: { id: string } | null; error: { message: string } | null }) {
  return {
    from(_table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                is() {
                  return {
                    limit() {
                      return { maybeSingle: () => Promise.resolve(result) };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("isFeatureAuthorized", () => {
  it("is true only when an active row exists", async () => {
    expect(await isFeatureAuthorized(fakeClient({ data: { id: "s1" }, error: null }), "autonomous_live_trading")).toBe(
      true,
    );
  });

  it("is false when no row exists", async () => {
    expect(await isFeatureAuthorized(fakeClient({ data: null, error: null }), "autonomous_live_trading")).toBe(false);
  });

  it("fails closed on a query error", async () => {
    expect(
      await isFeatureAuthorized(fakeClient({ data: null, error: { message: "boom" } }), "autonomous_live_trading"),
    ).toBe(false);
  });
});
