/** F-05: one new entry at a time per account. */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.unmock("@/lib/trade/order-lock");
import { withOrderLock } from "@/lib/trade/order-lock";

/** A stand-in for the two RPCs with the lease semantics of migration 0087. */
function leaseDb() {
  const held = new Map<string, string>();
  const calls: string[] = [];
  const rpc = vi.fn(async (fn: string, args: { p_user_id: string; p_token: string }) => {
    calls.push(fn);
    if (fn === "try_acquire_order_lock") {
      if (held.has(args.p_user_id)) return { data: false, error: null };
      held.set(args.p_user_id, args.p_token);
      return { data: true, error: null };
    }
    if (held.get(args.p_user_id) === args.p_token) held.delete(args.p_user_id);
    return { data: null, error: null };
  });
  return { supabase: { rpc } as unknown as SupabaseClient, held, calls };
}

describe("withOrderLock", () => {
  it("runs the placement and gives the lease back", async () => {
    const { supabase, held } = leaseDb();
    const r = await withOrderLock(supabase, "u1", async () => "placed");
    expect(r).toBe("placed");
    expect(held.size).toBe(0);
  });

  it("gives the lease back when the placement throws", async () => {
    const { supabase, held } = leaseDb();
    await expect(withOrderLock(supabase, "u1", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(held.size).toBe(0);
  });

  it("makes a second entry wait for the first, so each reads the book the other left", async () => {
    const { supabase } = leaseDb();
    const book: string[] = [];
    const place = (sym: string) => async () => {
      const seen = book.length; // the check reads the book...
      await new Promise((r) => setTimeout(r, 20));
      book.push(sym); // ...then the write follows
      return seen;
    };
    const [a, b] = await Promise.all([
      withOrderLock(supabase, "u1", place("AAA"), { pollMs: 5 }),
      withOrderLock(supabase, "u1", place("BBB"), { pollMs: 5 }),
    ]);
    expect([a, b].sort()).toEqual([0, 1]);
  });

  it("refuses, placing nothing, when the first is still running after the wait", async () => {
    const { supabase, held } = leaseDb();
    held.set("u1", "someone-else");
    const place = vi.fn();
    const r = await withOrderLock(supabase, "u1", place, { waitMs: 20, pollMs: 5 });
    expect(r).toMatchObject({ status: 409, body: { code: "order_in_progress" } });
    expect(place).not.toHaveBeenCalled();
  });

  it("does not hold one account's order behind another's", async () => {
    const { supabase, held } = leaseDb();
    held.set("u2", "other");
    expect(await withOrderLock(supabase, "u1", async () => "placed", { waitMs: 0 })).toBe("placed");
  });

  it("fails closed when the lease can't be read", async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: { message: "down" } })) } as unknown as SupabaseClient;
    const place = vi.fn();
    const r = await withOrderLock(supabase, "u1", place);
    expect(r).toMatchObject({ status: 503, body: { code: "order_lock_unavailable" } });
    expect(place).not.toHaveBeenCalled();
  });
});
