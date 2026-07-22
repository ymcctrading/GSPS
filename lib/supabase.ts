import { createClient } from "@supabase/supabase-js";

/**
 * Public Supabase client (anon key). Safe for the browser and for server
 * components that only read the global scan tables (daily_scans / scan_runs),
 * which have public-read RLS policies. Per-user tables stay protected by RLS.
 *
 * Defaults are the project's publishable values so the app works even before
 * env vars are configured; override via NEXT_PUBLIC_SUPABASE_* on Vercel.
 */
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://vebhpmmzxixlhujlptue.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlYmhwbW16eGl4bGh1amxwdHVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4OTIwNjEsImV4cCI6MjA5OTQ2ODA2MX0.jfwmPYObz2wQZnhuYFesq-MoFPMpCkb9yRTXvmzv_to";

export function createPublicClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}
