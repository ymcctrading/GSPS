/**
 * Breached-password check (review finding S-11, 2026-10-21).
 *
 * Supabase Auth's own leaked-password protection is a dashboard setting no
 * tool in this project can reach, so the app checks a new password itself
 * before it is set: at sign-up, on the reset-password page and in Settings.
 * It uses the Have I Been Pwned range API by k-anonymity: the browser hashes
 * the password with SHA-1 and sends only the first five hex characters, via
 * `/api/auth/password-breach`, so neither GSPS nor the service ever sees the
 * password or its full hash, and the visitor's address never reaches the
 * service. The match against the returned suffixes happens here, in the
 * browser.
 *
 * It fails open: if the hash or the lookup fails, the password is allowed,
 * so an outage elsewhere never blocks a sign-up. It guards the app's own
 * forms, not Supabase's API, which a script could still call directly.
 */

export const BREACHED_PASSWORD_MESSAGE =
  "That password has appeared in a known data breach. Please choose a different one.";

export async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * How many times `suffix` (the hash after its first five characters) appears
 * in a range response ("SUFFIX:COUNT" per line). Padding rows carry a count
 * of 0 and never match.
 */
export function breachCountInRange(body: string, suffix: string): number {
  const wanted = suffix.toUpperCase();
  for (const line of body.split(/\r?\n/)) {
    const [hash, count] = line.trim().split(":");
    if (hash?.toUpperCase() === wanted) {
      const n = Number.parseInt(count ?? "0", 10);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

export type RangeFetcher = (prefix: string) => Promise<string | null>;

const fetchRangeViaApp: RangeFetcher = async (prefix) => {
  const res = await fetch(`/api/auth/password-breach?prefix=${prefix}`);
  return res.ok ? res.text() : null;
};

/**
 * The message to show when `password` has appeared in a breach, or null when
 * it has not or the check could not run.
 */
export async function breachedPasswordError(
  password: string,
  fetchRange: RangeFetcher = fetchRangeViaApp,
): Promise<string | null> {
  try {
    const hash = await sha1Hex(password);
    const body = await fetchRange(hash.slice(0, 5));
    if (body == null) return null;
    return breachCountInRange(body, hash.slice(5)) > 0 ? BREACHED_PASSWORD_MESSAGE : null;
  } catch {
    return null;
  }
}
