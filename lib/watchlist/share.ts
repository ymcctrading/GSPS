/**
 * Shared watchlists (Q3 plan item 7): a member shares their Dashboard list by
 * link, read-only. The list's owner chooses who may open it (owner, 2026-11-09:
 * "Both"): anyone with the link, or only members the owner approves.
 *
 * What is shared is symbols, never trades, calls, scores or levels. The
 * method's warning is that losses come from tips and opinions and that a
 * trader acts only on definite rules he has checked himself (ref: SRC-004;
 * ref: SRC-012), so a shared list is a list of names to look at, and the page
 * says so. "Follow a trader" is a tip service by another name and is not
 * built. No member-written text is shown: the Dashboard list's name is fixed,
 * and a requester is shown to the owner only by display name or a masked
 * email, which the request page tells them first.
 *
 * Storage: `watchlist_shares` and `watchlist_share_members` (migration 0152).
 * The owner's own rows are readable on their session; a viewer can't read the
 * owner's list under row security, so the viewer's read goes through the
 * service role here, only after `viewerAccess` allows it, and returns symbols
 * alone.
 *
 * Three-question basis:
 * 1. Method: as cited above. The share carries no verdict, so it can't become
 *    a tip.
 * 2. Cycles: no periodicity claim; the checklist does not apply.
 * 3. Hermetic: Polarity (the owner's two poles, open and closed, are both
 *    real choices, not a lesser and a full version) and Mentalism (each viewer
 *    still forms their own judgment; the page hands over names, not
 *    conclusions). Correspondence: a shared list is the owner's live Dashboard
 *    list, so it can't drift from what the owner sees.
 */

import { randomBytes } from "node:crypto";

export type ShareAccess = "link" | "members";
export type MemberStatus = "pending" | "approved" | "denied";

/** The most requests (pending and approved together) one share holds. */
export const SHARE_MEMBER_LIMIT = 100;

/** An unguessable link token: 24 random bytes, 32 URL-safe characters. */
export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Whether a string has the shape of a share token (checked before any read). */
export function isShareToken(s: unknown): s is string {
  return typeof s === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(s);
}

export function isShareAccess(s: unknown): s is ShareAccess {
  return s === "link" || s === "members";
}

export type ViewerAccess =
  | { kind: "view"; owner: boolean }
  | { kind: "sign_in" }
  | { kind: "request" }
  | { kind: "pending" }
  | { kind: "denied" };

/**
 * What a viewer may do with a share. Pure. `viewerId` is null for a visitor
 * with no session; `status` is the viewer's request row, when there is one.
 */
export function viewerAccess(
  share: { access: ShareAccess; ownerId: string },
  viewerId: string | null,
  status: MemberStatus | null,
): ViewerAccess {
  if (viewerId && viewerId === share.ownerId) return { kind: "view", owner: true };
  if (share.access === "link") return { kind: "view", owner: false };
  if (!viewerId) return { kind: "sign_in" };
  if (status === "approved") return { kind: "view", owner: false };
  if (status === "pending") return { kind: "pending" };
  if (status === "denied") return { kind: "denied" };
  return { kind: "request" };
}

/**
 * How a requester is shown to the owner: their display name, else their email
 * masked to its first letter and its domain (`c•••@example.com`).
 */
export function requesterLabel(displayName: string | null | undefined, email: string | null | undefined): string {
  const name = (displayName ?? "").trim();
  if (name) return name.slice(0, 60);
  const at = (email ?? "").indexOf("@");
  if (at > 0) return `${email![0]}•••${email!.slice(at)}`;
  return "A member";
}
