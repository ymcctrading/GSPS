"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { NewsRow, SymbolNews } from "@/lib/news/symbolNews";
import { cn, formatPct, formatUsd } from "@/lib/utils";
import { isCryptoSymbol } from "@/lib/market/cryptoSymbol";

/**
 * News on the symbol page (Q3 item 6): the symbol's latest headlines, each
 * beside the close of the session it fell on and that session's change. No
 * sentiment score and no reading of the headline: the close is how the market
 * answered it. See `lib/news/symbolNews.ts`. Hidden when signed out or when
 * the feed has no news to give.
 */

function sessionDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Publication time in New York, where the close a headline is counted against is. */
function publishedAt(iso: string): string {
  const at = new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
  return `${at} ET`;
}

const FALLBACK_ERROR = "News isn't available right now. Try again later.";

export function SymbolNewsCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<SymbolNews | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "hidden" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The page keys this card by symbol, so a new symbol starts from "loading".
    let live = true;
    fetch(`/api/news?symbol=${encodeURIComponent(symbol)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!live) return;
        if (res.status === 401) return setState("hidden");
        if (!res.ok) {
          setError((body as { error?: string }).error ?? FALLBACK_ERROR);
          return setState("error");
        }
        setData(body as SymbolNews);
        setState("ready");
      })
      .catch(() => {
        if (!live) return;
        setError(FALLBACK_ERROR);
        setState("error");
      });
    return () => {
      live = false;
    };
  }, [symbol]);

  if (state === "hidden") return null;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{symbol} news</CardTitle>
        <CardDescription>
          The latest headlines, each beside the close of the session it fell on.
          {isCryptoSymbol(symbol)
            ? " A day here is the UTC day."
            : " A headline published after the close counts on the next session."}{" "}
          The close shows how the market took it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state === "loading" && <p className="text-sm text-muted">Loading…</p>}
        {state === "error" && <p className="text-sm text-muted">{error}</p>}
        {state === "ready" && data && data.items.length === 0 && (
          <p className="text-sm text-muted">
            No headlines for {symbol} in the last two weeks.
          </p>
        )}
        {state === "ready" && data && data.items.length > 0 && (
          <ul className="flex flex-col divide-y divide-border">
            {data.items.map((item, i) => (
              <NewsItemRow key={`${item.createdAt}-${i}`} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function NewsItemRow({ item }: { item: NewsRow }) {
  return (
    <li className="flex min-w-0 flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-words text-sm font-medium hover:underline"
          >
            {item.headline}
          </a>
        ) : (
          <p className="break-words text-sm font-medium">{item.headline}</p>
        )}
        <p className="text-xs text-muted">
          {publishedAt(item.createdAt)}
          {item.source ? ` · ${item.source}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-xs sm:text-right">
        {item.session && item.close != null ? (
          <>
            <p className="text-muted">Close {sessionDate(item.session)}</p>
            <p className="font-mono tabular-nums">
              {formatUsd(item.close)}
              {item.changePct != null && (
                <span
                  className={cn(
                    "ml-2",
                    item.changePct >= 0 ? "text-bull" : "text-bear",
                  )}
                >
                  {formatPct(item.changePct * 100)}
                </span>
              )}
            </p>
          </>
        ) : (
          <p className="text-muted">Session not closed yet</p>
        )}
      </div>
    </li>
  );
}
