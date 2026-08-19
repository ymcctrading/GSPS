import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

// `/learning` joins the list because the endpoint behind it now requires a
// session: left public it would render a page whose only button 401s.
// `/automation` is absent on purpose — that page authenticates and tier-gates
// itself in the server component.
const PROTECTED_PREFIXES = [
  "/dashboard", "/scanner", "/ticker", "/portfolio", "/glossary", "/settings", "/learning",
  // `/welcome` holds no user data, but it renders inside the signed-in shell —
  // nav, sign-out and all — so serving it to a visitor with no session would
  // show them a header they cannot use.
  "/welcome",
];

// Per-minute budget for /api routes, keyed by signed-in user (falls back to
// IP for anonymous callers, e.g. the auth routes). Scans hit market-data
// providers per call, so they get a tighter budget than the rest of the API.
const API_WINDOW_MS = 60_000;
const SCAN_LIMIT = 20;
const DEFAULT_LIMIT = 120;
const SCAN_PREFIXES = ["/api/scan", "/api/batch-scan", "/api/intraday-scan", "/api/market-scan", "/api/backtest"];

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

  if (path.startsWith("/api")) {
    const isScan = SCAN_PREFIXES.some((p) => path.startsWith(p));
    const limit = isScan ? SCAN_LIMIT : DEFAULT_LIMIT;
    const key = `${isScan ? "scan" : "api"}:${user?.id ?? `ip:${clientIp(request)}`}`;
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
