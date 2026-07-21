import { createBrowserClient } from "@supabase/ssr";

// Public project values — safe to ship in the browser bundle (this is what the
// NEXT_PUBLIC_* convention exposes anyway). Env vars override when present.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://vebhpmmzxixlhujlptue.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_8nnzrTBNtRAHFBLbWL6dIQ_Hto4UspW";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
