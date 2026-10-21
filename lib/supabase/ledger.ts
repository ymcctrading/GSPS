/**
 * The ledger is written by the server, never by a member (review finding
 * R-029, 2026-10-21).
 *
 * Members held every privilege on their own positions, orders, paper account,
 * trade logs, exits, plans and lesson progress, so a member with their own
 * session token could write their paper cash, fills and realized P&L (which
 * the Track Record promotion path reads), insert a pending order that the
 * resting-order pass would fill past every rule `place-order.ts` enforces, or
 * mark every lesson passed (the curriculum path, and Academy 8's capstone,
 * the one step every path to Wall Street needs). Migration 0095 takes insert,
 * update and delete on those tables away from members; they keep select.
 *
 * So every server write to them goes through `ledgerWriter`: given the
 * member's session client it returns the service-role client, and anything
 * else (a service client already, or a test's fake) is returned unchanged.
 * The service role bypasses row security, so each write names its user
 * explicitly: inserts carry `user_id`, updates and deletes filter on it.
 * Reads stay on the member's client and its row security.
 *
 * Only `lib/supabase/server.ts#createClient` marks a member client. Kept free
 * of `next/headers` so lib code and its tests can import it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createBaseClient } from "@supabase/supabase-js";

const memberClients = new WeakSet<object>();

/** Marks a client as a member's session client. Returns it, for chaining. */
export function markMemberClient<T extends object>(client: T): T {
  memberClients.add(client);
  return client;
}

/** True for a client made from a member's session (`createClient` in lib/supabase/server.ts). */
export function isMemberClient(client: object): boolean {
  return memberClients.has(client);
}

let service: SupabaseClient | null = null;

/** The client a ledger write goes through: the service role in place of a member's session. */
export function ledgerWriter(client: SupabaseClient): SupabaseClient {
  if (!isMemberClient(client)) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://vebhpmmzxixlhujlptue.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Without the key the write cannot be made on the member's behalf, and the
  // member's own client no longer may: fail loudly rather than silently.
  if (!key) throw new Error("ledger write needs SUPABASE_SERVICE_ROLE_KEY");
  service ??= createBaseClient(url, key, { auth: { persistSession: false } });
  return service;
}
