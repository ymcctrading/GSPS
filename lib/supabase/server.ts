import { createServerClient } from "@supabase/ssr";
import { createClient as createBaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { markMemberClient } from "@/lib/supabase/ledger";
import { serviceRoleKey } from "@/lib/supabase/service-key";

// Public project values — env vars override when present.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://vebhpmmzxixlhujlptue.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_8nnzrTBNtRAHFBLbWL6dIQ_Hto4UspW";

export async function createClient() {
  const cookieStore = await cookies();

  const client = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — proxy refreshes sessions instead.
        }
      },
    },
  });
  return markMemberClient(client);
}

/** Service-role client for cron jobs and server-only writes (bypasses RLS). */
export function createServiceClient() {
  return createBaseClient(SUPABASE_URL, serviceRoleKey()!, {
    auth: { persistSession: false },
  });
}
