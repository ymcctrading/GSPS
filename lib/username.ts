/**
 * Username format, shared between the username-login lookup
 * (`app/api/auth/resolve-username`) and `profiles.username`'s own check
 * constraint (migration `0020`). Kept as one source rather than two so they
 * can't drift — a route that accepts something the database constraint
 * would reject just means every real username still passes and nothing was
 * gained by validating client-side first.
 */
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;

export function isValidUsername(value: unknown): value is string {
  return typeof value === "string" && USERNAME_PATTERN.test(value);
}
