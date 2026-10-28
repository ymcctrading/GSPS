/**
 * GSPS — the owner's accounts, the only readers of hindsight data (owner,
 * 2026-10-28: "No look-ahead or future-informed universe ranking ... only
 * icharles and Ymcctrading users will EVER be given this data/info/ranking").
 *
 * Hindsight data is anything ranked or judged by a move that had already
 * happened: the daily recap's top movers, its per-mover attribution, the
 * coverage report, and the evaluation ledger. The forward test's record of
 * every Execute call and its outcome (`/api/shadow/summary`,
 * `/api/shadow/daily`) is held to the same two accounts until the result is
 * verified (2026-10-28). It goes to these two addresses
 * and nowhere else, by email or through an owner-only route, and it never
 * feeds a scan, selection, score, plan or order.
 *
 * The list is fixed in code. `OWNER_REPORT_EMAILS` may narrow it (send to one
 * of the two) but can never widen it: an address outside the pair is dropped,
 * so no environment setting can hand the data to anyone else.
 *
 * Enforced on the server only. A route that serves hindsight data reads the
 * session's user with the server client, checks it here, and answers 404 to
 * everyone else so the route's existence is not disclosed. The evaluation
 * ledger table has no member policy at all (service role only).
 */

/** The owner's two accounts (owner, 2026-10-28). */
export const OWNER_EMAILS: readonly string[] = Object.freeze(["icharles.coleman@gmail.com", "ymcctrading@gmail.com"]);

const normalise = (e: string) => e.trim().toLowerCase();

/** True only for one of the owner's two addresses. */
export function isOwnerEmail(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  return OWNER_EMAILS.includes(normalise(email));
}

/**
 * Who the owner's reports go to: `OWNER_REPORT_EMAILS` (comma-separated) when
 * set, else both owner addresses; either way only addresses in
 * `OWNER_EMAILS`. Never empty unless the setting names no owner address.
 */
export function ownerReportRecipients(raw: string | undefined = process.env.OWNER_REPORT_EMAILS): string[] {
  const list = (raw && raw.trim() ? raw.split(",") : [...OWNER_EMAILS]).map(normalise).filter(Boolean);
  return Array.from(new Set(list.filter((e) => OWNER_EMAILS.includes(e))));
}

/** The signed-in user, when one of the owner's accounts; else null. Email must be confirmed. */
export function ownerOf<U extends { email?: string | null; email_confirmed_at?: string | null }>(user: U | null | undefined): U | null {
  if (!user || !isOwnerEmail(user.email)) return null;
  // An unconfirmed address could be anyone who typed it at sign-up.
  if (!user.email_confirmed_at) return null;
  return user;
}
