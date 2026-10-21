/** Review finding R-029: ledger writes go through the service role, never a member's session. */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// The real constructor needs a WebSocket, which CI's Node 20 lacks.
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: () => null }) }));
import { isMemberClient, ledgerWriter, markMemberClient } from "@/lib/supabase/ledger";

const fake = () => ({ from: () => null }) as unknown as SupabaseClient;
const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

afterEach(() => {
  if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
});

describe("ledgerWriter", () => {
  it("returns any client that is not a member's session unchanged", () => {
    const client = fake();
    expect(isMemberClient(client)).toBe(false);
    expect(ledgerWriter(client)).toBe(client);
  });

  it("swaps a member's session client for the service role", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const member = markMemberClient(fake());
    const writer = ledgerWriter(member);
    expect(writer).not.toBe(member);
    expect(isMemberClient(writer)).toBe(false);
    expect(ledgerWriter(member)).toBe(writer);
  });

  it("refuses a member's write when the service key is missing, rather than writing as the member", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const member = markMemberClient(fake());
    expect(() => ledgerWriter(member)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
