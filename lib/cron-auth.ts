/**
 * GSPS — the shared check for the scheduled routes' `Authorization: Bearer
 * CRON_SECRET` header.
 *
 * Compared in constant time (review finding S-13, 2026-10-21): `===` on a
 * string stops at the first differing character, which leaks, in principle,
 * how much of a guess was right. False whenever CRON_SECRET is unset, so a
 * route that forgets its own 503 check still fails closed.
 */

import { timingSafeEqual } from "node:crypto";

export function isCronAuthorized(authorizationHeader: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorizationHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorizationHeader);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
