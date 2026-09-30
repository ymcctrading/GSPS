"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  badSymbolMessage,
  DASHBOARD_WATCHLIST_MAX,
  DASHBOARD_WATCHLIST_MIN,
  isWatchSymbolFormat,
} from "@/lib/dashboard/watchlist";
import { tickerHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The Dashboard's "Default watchlist": one tap from a symbol to its full scan.
 * The platform's own row (the Magnificent Seven, SPY and BTC) until the signed-in
 * user edits it, then their own 3 to 9 symbols (project owner, 2026-09-30;
 * storage and rules in `lib/dashboard/watchlist.ts`). The server enforces the
 * bounds; the editor mirrors them so the buttons say why they are disabled.
 */
export function DashboardWatchlist({
  initialSymbols,
  isDefault: initialIsDefault,
  canEdit,
}: {
  initialSymbols: string[];
  isDefault: boolean;
  /** False for a visitor who isn't signed in: the list shows, the editor doesn't. */
  canEdit: boolean;
}) {
  const [symbols, setSymbols] = useState(initialSymbols);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(initialSymbols);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startEditing() {
    setDraft(symbols);
    setEntry("");
    setError(null);
    setEditing(true);
  }

  function addEntry() {
    const symbol = entry.trim().toUpperCase();
    if (!symbol) return;
    if (draft.includes(symbol)) {
      setError(`${symbol} is already on the list.`);
      return;
    }
    if (draft.length >= DASHBOARD_WATCHLIST_MAX) {
      setError(`The list holds ${DASHBOARD_WATCHLIST_MAX} symbols at most. Remove one to add another.`);
      return;
    }
    // Only the format is checked here; the server checks the symbol exists.
    if (!isWatchSymbolFormat(symbol)) {
      setError(badSymbolMessage(symbol));
      return;
    }
    setDraft([...draft, symbol]);
    setEntry("");
    setError(null);
  }

  async function send(request: () => Promise<Response>) {
    setBusy(true);
    setError(null);
    try {
      const res = await request();
      const data = (await res.json().catch(() => null)) as
        | { symbols?: string[]; isDefault?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.symbols) throw new Error(data?.error ?? "Could not save the list.");
      setSymbols(data.symbols);
      setIsDefault(Boolean(data.isDefault));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the list.");
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    send(() =>
      fetch("/api/dashboard-watchlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: draft }),
      }),
    );
  const reset = () => send(() => fetch("/api/dashboard-watchlist", { method: "DELETE" }));

  const tooFew = draft.length < DASHBOARD_WATCHLIST_MIN;
  const unchanged = draft.length === symbols.length && draft.every((s, i) => s === symbols[i]);

  return (
    <Card data-tour="dash-watchlist">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>Default watchlist</CardTitle>
            <CardDescription>
              {isDefault
                ? "Magnificent Seven, SPY, and BTC — open any symbol for a full protocol scan."
                : "Your symbols — open any one for a full protocol scan."}
            </CardDescription>
          </div>
          {canEdit && !editing && (
            <Button variant="outline" size="sm" onClick={startEditing} className="shrink-0">
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Customize
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!editing ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {symbols.map((s) => (
              <Link
                key={s}
                href={tickerHref(s)}
                className="rounded-lg border border-border bg-background px-3 py-3 text-center text-sm font-semibold hover:border-accent hover:text-accent"
              >
                {s}
              </Link>
            ))}
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5" aria-label="Symbols on your watchlist">
              {draft.map((s) => (
                <li
                  key={s}
                  className="flex items-center justify-between gap-1 rounded-lg border border-border bg-background py-1 pl-3 pr-1 text-sm font-semibold"
                >
                  <span className="truncate">{s}</span>
                  <button
                    type="button"
                    onClick={() => setDraft(draft.filter((d) => d !== s))}
                    disabled={draft.length <= DASHBOARD_WATCHLIST_MIN}
                    title={
                      draft.length <= DASHBOARD_WATCHLIST_MIN
                        ? `Keep at least ${DASHBOARD_WATCHLIST_MIN} symbols`
                        : `Remove ${s}`
                    }
                    aria-label={`Remove ${s}`}
                    className={cn(
                      "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-surface hover:text-bear",
                      draft.length <= DASHBOARD_WATCHLIST_MIN && "cursor-not-allowed opacity-40 hover:text-muted",
                    )}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>

            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addEntry();
              }}
            >
              <Input
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                placeholder="Add AAPL, or a pair like BTC/USD"
                aria-label="Symbol to add"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                disabled={draft.length >= DASHBOARD_WATCHLIST_MAX}
                className="min-w-0 flex-1 sm:max-w-xs"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={!entry.trim() || draft.length >= DASHBOARD_WATCHLIST_MAX}
              >
                Add
              </Button>
              <span className="text-xs text-muted">
                {draft.length} of {DASHBOARD_WATCHLIST_MAX} (at least {DASHBOARD_WATCHLIST_MIN})
              </span>
            </form>

            {error && (
              <p role="alert" className="text-sm text-bear">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={busy || tooFew || unchanged}>
                {busy ? "Saving…" : "Save list"}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
              {!isDefault && (
                <Button variant="ghost" onClick={reset} disabled={busy} className="sm:ml-auto">
                  Reset to default
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
