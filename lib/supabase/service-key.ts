/**
 * The server's Supabase key, which acts as the service role (bypasses RLS).
 *
 * `SUPABASE_SECRET_KEY` is the project's `sb_secret_...` key, set by the
 * Supabase integration and stored in Vercel as Sensitive, so nobody can read
 * it back. `SUPABASE_SERVICE_ROLE_KEY` is the legacy JWT key. It was stored as
 * a readable "encrypted" variable (review finding S-06) and stays only as a
 * fallback for an operator's shell and local development.
 */
export function serviceRoleKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}
