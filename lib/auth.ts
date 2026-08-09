import { createClient } from '@/lib/supabase/server';

/**
 * The signed-in user's id, or null.
 *
 * There is deliberately no bypass here. This used to return a fixed test user
 * whenever the caller sent `X-Test-Mode: true` — or whenever `NODE_ENV` was not
 * production, which is also true of a preview deployment — so any unauthenticated
 * request could act as that user and read or write its rows.
 */
export async function verifyAuth(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      return user.id;
    }
  } catch {
    // An unreachable auth service is not an authenticated caller.
  }

  return null;
}
