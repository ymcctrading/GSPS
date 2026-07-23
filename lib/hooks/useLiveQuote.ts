"use client";

import { useEffect, useState } from "react";
import type { LiveQuote } from "@/app/api/quote/route";

/**
 * Polls /api/quote so the price ticks live everywhere it's shown. Crypto polls
 * a touch faster than stocks. Returns the latest quote (or null until the first
 * successful fetch); transient errors are swallowed to keep the last good value.
 * Keyed on `symbol`, so remounting per symbol resets cleanly.
 */
export function useLiveQuote(symbol: string | null, opts?: { intervalMs?: number }): LiveQuote | null {
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const intervalMs = opts?.intervalMs;

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    const isCrypto = symbol.includes("/") || /^(BTC|ETH|SOL|DOGE|LTC|AVAX|LINK|XRP|BCH|UNI)/i.test(symbol);
    const interval = intervalMs ?? (isCrypto ? 3000 : 5000);

    const poll = async () => {
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const data: LiveQuote = await res.json();
        if (!cancelled && typeof data.price === "number") setQuote(data);
      } catch {
        /* transient — keep the last good quote */
      }
    };

    poll();
    const id = setInterval(poll, interval);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, intervalMs]);

  return quote;
}
