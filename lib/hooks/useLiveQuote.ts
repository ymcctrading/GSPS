"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { LiveQuote } from "@/app/api/quote/route";

/**
 * Live quote polling, shared across every component that asks for a symbol.
 *
 * The ticker page mounts several consumers of the same price (header, chart,
 * order ticket). One poller per symbol — rather than one per component — keeps
 * the request rate low enough to stay under the free data tier's limit, which
 * is what was tripping "too many requests" on the ticker page.
 *
 * The poller also:
 *   • pauses while the tab is hidden (a phone in a pocket shouldn't poll), and
 *     refreshes immediately when it comes back;
 *   • backs off exponentially on failure, honouring a 429's `Retry-After`,
 *     and returns to the normal cadence after a success;
 *   • keeps the last good quote through transient errors so prices never blank.
 */

const DEFAULT_INTERVAL_MS = 5_000;
const CRYPTO_INTERVAL_MS = 3_000;
const MAX_BACKOFF_MS = 60_000;

type Listener = () => void;

interface Poller {
  quote: LiveQuote | null;
  listeners: Set<Listener>;
  timer: ReturnType<typeof setTimeout> | null;
  interval: number;
  /** Current wait, grown past `interval` while the API is failing. */
  delay: number;
  stopped: boolean;
}

const pollers = new Map<string, Poller>();

function isCrypto(symbol: string): boolean {
  return symbol.includes("/") || /^(BTC|ETH|SOL|DOGE|LTC|AVAX|LINK|XRP|BCH|UNI)/i.test(symbol);
}

function pollerKey(symbol: string, interval: number): string {
  return `${symbol.toUpperCase()}@${interval}`;
}

async function tick(key: string, symbol: string) {
  const poller = pollers.get(key);
  if (!poller || poller.stopped) return;

  // Skip the network entirely while the tab is backgrounded; the visibility
  // handler fires an immediate refresh when the user returns.
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    schedule(key, symbol, poller.interval);
    return;
  }

  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
    if (res.ok) {
      const data: LiveQuote = await res.json();
      if (typeof data.price === "number") {
        poller.quote = data;
        poller.listeners.forEach((notify) => notify());
      }
      poller.delay = poller.interval;
    } else {
      const retryAfter = Number(res.headers.get("retry-after"));
      poller.delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_BACKOFF_MS)
        : Math.min(poller.delay * 2, MAX_BACKOFF_MS);
    }
  } catch {
    poller.delay = Math.min(poller.delay * 2, MAX_BACKOFF_MS);
  }

  schedule(key, symbol, poller.delay);
}

function schedule(key: string, symbol: string, delay: number) {
  const poller = pollers.get(key);
  if (!poller || poller.stopped) return;
  if (poller.timer) clearTimeout(poller.timer);
  poller.timer = setTimeout(() => tick(key, symbol), delay);
}

/** Wake every poller as soon as the tab is visible again. */
function onVisibility() {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  for (const [key, poller] of pollers) {
    poller.delay = poller.interval;
    schedule(key, key.split("@")[0], 0);
  }
}

let visibilityBound = false;

/**
 * The poller is an external store, so the hook reads it with
 * `useSyncExternalStore` rather than mirroring it into component state. That
 * also means a late subscriber renders the price the shared poller already
 * holds on its very first pass, instead of showing an empty header until the
 * next tick.
 */
export function useLiveQuote(symbol: string | null, opts?: { intervalMs?: number }): LiveQuote | null {
  const intervalMs = opts?.intervalMs;
  const interval = intervalMs ?? (symbol && isCrypto(symbol) ? CRYPTO_INTERVAL_MS : DEFAULT_INTERVAL_MS);
  const key = symbol ? pollerKey(symbol, interval) : null;

  const subscribe = useCallback(
    (notify: Listener) => {
      if (!symbol || !key) return () => {};

      let poller = pollers.get(key);
      if (!poller) {
        poller = { quote: null, listeners: new Set(), timer: null, interval, delay: interval, stopped: false };
        pollers.set(key, poller);
      }
      poller.stopped = false;
      poller.listeners.add(notify);

      if (!visibilityBound && typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onVisibility);
        visibilityBound = true;
      }

      // First subscriber starts the loop; later ones join the one already running.
      if (poller.listeners.size === 1) tick(key, symbol.toUpperCase());

      return () => {
        const current = pollers.get(key);
        if (!current) return;
        current.listeners.delete(notify);
        if (current.listeners.size === 0) {
          current.stopped = true;
          if (current.timer) clearTimeout(current.timer);
          pollers.delete(key);
        }
      };
    },
    [symbol, key, interval],
  );

  // Identity only changes when a new quote lands, which is what keeps this from
  // re-rendering on every poll that returns the same price object.
  const getSnapshot = useCallback(() => (key ? pollers.get(key)?.quote ?? null : null), [key]);

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
