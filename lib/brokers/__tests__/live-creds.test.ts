import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const decryptJson = vi.fn();
vi.mock("@/lib/crypto", () => ({
  decryptJson: (...args: unknown[]) => decryptJson(...args),
}));

import { readLiveAlpacaConnection } from "@/lib/brokers/live-creds";

function stubSupabase(row: { id: string; credentials: { enc: string } } | null): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

describe("readLiveAlpacaConnection", () => {
  beforeEach(() => decryptJson.mockReset());

  it("returns null when there is no active connection", async () => {
    const conn = await readLiveAlpacaConnection(stubSupabase(null), "u1");
    expect(conn).toBeNull();
  });

  it("decrypts and returns the connection id plus live creds", async () => {
    decryptJson.mockReturnValue({ key: "AK123", secret: "SEC456" });
    const conn = await readLiveAlpacaConnection(
      stubSupabase({ id: "conn-1", credentials: { enc: "x" } }),
      "u1",
    );
    expect(conn).toEqual({
      connectionId: "conn-1",
      creds: { key: "AK123", secret: "SEC456", mode: "live" },
    });
  });

  it("fails closed (null) when decryption throws", async () => {
    // A real decrypt failure (wrong key, tampered ciphertext, key rotation
    // mid-flight) throws from inside decryptJson — simulated here via a
    // rejected-shaped payload the mock inspects, since a `vi.fn()` configured
    // to throw synchronously is otherwise indistinguishable from this at the
    // call site `readLiveAlpacaConnection` actually exercises.
    decryptJson.mockImplementation((payload: string) => {
      if (payload === "corrupt") throw new Error("bad key");
      return { key: "k", secret: "s" };
    });
    const conn = await readLiveAlpacaConnection(
      stubSupabase({ id: "conn-1", credentials: { enc: "corrupt" } }),
      "u1",
    );
    expect(conn).toBeNull();
  });

  it("fails closed when the decrypted payload is missing a key or secret", async () => {
    decryptJson.mockReturnValue({ key: "", secret: "SEC456" });
    const conn = await readLiveAlpacaConnection(
      stubSupabase({ id: "conn-1", credentials: { enc: "x" } }),
      "u1",
    );
    expect(conn).toBeNull();
  });
});
