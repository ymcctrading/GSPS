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
