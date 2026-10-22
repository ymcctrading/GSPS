import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS, rateLimitBucket } from "@/lib/rate-limit-policy";
import { isCronAuthorized } from "@/lib/cron-auth";
import { isPrefetchRequest, PRACTICE_WRITE_REFUSAL, practiceTierOfUser, practiceWriteRefused } from "@/lib/demo/practice";

// `/learning` joins the list because the endpoint behind it now requires a
// session: left public it would render a page whose only button 401s.
// `/automation` also authenticates and tier-gates itself in the server
// component; it is listed so a visitor with no session gets the same login
// redirect as every other page in the signed-in shell. So are `/guided`,
// `/school` and `/promotion`, which rendered an empty shell whose every
// request 401s.
const PROTECTED_PREFIXES = [
  "/dashboard", "/scanner", "/ticker", "/portfolio", "/glossary", "/settings", "/learning",
  "/guided", "/school", "/promotion", "/automation",
  // `/welcome` holds no user data, but it renders inside the signed-in shell —
  // nav, sign-out and all — so serving it to a visitor with no session would
  // show them a header they cannot use.
  "/welcome",
];

// Per-minute budget for /api routes, keyed by signed-in user (falls back to
// IP for anonymous callers, e.g. the auth routes). Which budget a route draws
// from, and why, is lib/rate-limit-policy.ts (the 2026-10-21 route audit).
const API_WINDOW_MS = 60_000;

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://vebhpmmzxixlhujlptue.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_8nnzrTBNtRAHFBLbWL6dIQ_Hto4UspW";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // A practice account (lib/demo/practice.ts) is shared by every visitor who
  // opens it, and its record is GSPS's own trading, so its session may look
  // but not write. The tier rides in the session's app_metadata, which only
  // the service role can set, so this needs no database read.
  const practice = practiceTierOfUser(user);

  if (path.startsWith("/api")) {
    // The scheduled jobs all call from Supabase's one address; the secret's
    // holder is the platform itself, so its calls draw from no budget.
    if (isCronAuthorized(request.headers.get("authorization"))) return supabaseResponse;
    const bucket = rateLimitBucket(path, request.method);
    const limit = RATE_LIMITS[bucket];
    // Credential-verification abuse is exactly as real from an anonymous
    // caller hitting a signed-out 401 repeatedly as from a signed-in one —
    // keyed the same `user ?? ip` way as every other bucket rather than
    // skipped for a missing session.
    // A practice account is shared, so each visitor on it draws their own
    // budget rather than one budget for everyone viewing that tier.
    const who = practice ? `${user!.id}:ip:${clientIp(request)}` : (user?.id ?? `ip:${clientIp(request)}`);
    const key = `${bucket}:${who}`;
    const result = checkRateLimit(key, limit, API_WINDOW_MS);

    if (!result.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": String(result.remaining),
          },
        },
      );
    }

    if (practice && practiceWriteRefused(path, request.method)) {
      return NextResponse.json({ error: PRACTICE_WRITE_REFUSAL, practiceAccount: practice.slug }, { status: 403 });
    }

    return supabaseResponse;
  }

  // Leaving a practice account to sign in or sign up as oneself: end the
  // practice session here rather than bouncing back to its dashboard. Only on
  // a real visit: the router prefetches visible links, and the banner's
  // "create your own account" link is on every page, so ending the session on
  // a prefetch signed the visitor out moments after the account opened. A
  // prefetch is answered with the page itself, never the signed-in redirect
  // to /dashboard below, which the router would cache as the link's target.
  if (practice && (path === "/login" || path === "/signup")) {
    if (!isPrefetchRequest(request.headers)) await supabase.auth.signOut({ scope: "local" });
    return supabaseResponse;
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
