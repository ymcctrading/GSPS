import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsd(n: number, digits = 2): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPct(n: number, digits = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

/**
 * `fetch` with a hard ceiling on how long it can hang. Settings-page cards
 * that show "Loading…"/"Checking…" while a fetch is in flight have no other
 * way to leave that state if the request stalls instead of rejecting (a
 * dropped connection, a hung upstream API) — this turns that indefinite wait
 * into a normal fetch failure the caller's existing `.catch` already handles.
 */
export function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * Parse a fetch `Response` as JSON, but only after confirming the server
 * actually sent JSON. A platform-level failure — Vercel killing a function
 * that hit its `maxDuration` (the Hobby-plan default is 10s), or a bare
 * 502/504 from the gateway — returns a plain-text or HTML error page, not
 * the route's own JSON error body. Calling `res.json()` on that throws a
 * cryptic native parse error ("The string did not match the expected
 * pattern." on Safari/iOS, "Unexpected token"/"Unexpected end of JSON
 * input" elsewhere) that has nothing to do with the request's actual
 * failure reason and reads as a broken app rather than a slow one.
 *
 * Every fetch that hits a market-data route (the chart's own `/api/bars`,
 * the ticker/chart pages' `/api/scan`) shares this failure mode — see
 * AGENTS.md's cross-platform consistency principle — so this is centralized
 * rather than re-derived per caller the way `components/scan/auto-scan.tsx`
 * first fixed it for `/api/market-scan`.
 */
export async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : undefined) ??
      (res.status === 502 || res.status === 504
        ? "The request is taking too long and timed out server-side. Try again in a moment."
        : `HTTP ${res.status}`);
    throw new Error(message);
  }
  if (!isJson) throw new Error("Response was not valid JSON.");
  return data as T;
}

/**
 * Wrap a promise with a timeout. If the promise doesn't resolve within
 * `timeoutMs`, it rejects with a timeout error.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label?: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => {
        const msg = label ? `Timeout after ${timeoutMs}ms: ${label}` : `Timeout after ${timeoutMs}ms`;
        reject(new Error(msg));
      }, timeoutMs)
    ),
  ]);
}
