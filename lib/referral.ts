/**
 * Referral links: `/r/<username>` — the user's own chosen handle, so the link
 * is memorable and recognisably theirs rather than an opaque token. Requires
 * a username; a user who hasn't set one has nothing to share yet (see
 * `components/settings/referral-settings.tsx`).
 */

/** Path portion only — used by the redirect route and anywhere a relative link is fine. */
export function referralPath(username: string): string {
  return `/r/${encodeURIComponent(username)}`;
}

/** Full shareable URL, given the site origin (e.g. `location.origin` or a request's host). */
export function referralLink(origin: string, username: string): string {
  return `${origin.replace(/\/$/, "")}${referralPath(username)}`;
}
