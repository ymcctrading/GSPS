"use client";

/**
 * A shared watchlist as its viewer sees it (Q3 plan item 7). Symbols only:
 * no score, verdict or level, so a shared list is names to look at, never a
 * tip (lib/watchlist/share.ts). A signed-in viewer may make it their own
 * Dashboard list; a members-only list asks its owner first.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { tickerHref } from "@/lib/routes";

type Read =
  | { access: "view"; owner: boolean; symbols: string[] }
  | { access: "sign_in" | "request" | "pending" | "denied" };

async function readShared(token: string): Promise<{ read: Read | null; error: string | null }> {
  try {
    const res = await fetch(`/api/shared-watchlist/${encodeURIComponent(token)}`, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) return { read: null, error: body.error ?? `HTTP ${res.status}` };
    return { read: body as Read, error: null };
  } catch (err) {
    return { read: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export function SharedListView({ token }: { token: string }) {
  const [read, setRead] = useState<Read | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adopted, setAdopted] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const load = useCallback(() => {
    void readShared(token).then(({ read: r, error: e }) => {
      setRead(r);
      setError(e);
    });
  }, [token]);

  useEffect(() => {
    let live = true;
    void readShared(token).then(({ read: r, error: e }) => {
      if (!live) return;
      setRead(r);
      setError(e);
    });
    // Whether the viewer has a session decides whether "make it mine" shows.
    fetch("/api/dashboard-watchlist", { cache: "no-store" })
      .then((res) => live && setSignedIn(res.ok))
      .catch(() => live && setSignedIn(false));
    return () => {
      live = false;
    };
  }, [token]);

  async function requestAccess() {
    setBusy(true);
    try {
      const res = await fetch(`/api/shared-watchlist/${encodeURIComponent(token)}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function adopt(symbols: string[]) {
    setBusy(true);
    try {
      const res = await fetch("/api/dashboard-watchlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setAdopted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const loginHref = `/login?next=${encodeURIComponent(`/shared/watchlist/${token}`)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shared watchlist</CardTitle>
        <CardDescription>
          A GSPS member shared these symbols. It is a list of names to look at, not a recommendation: check each one
          yourself before you trade it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-bear">{error}</p>}
        {!error && !read && <p className="text-sm text-muted">Loading…</p>}

        {read?.access === "view" && (
          <>
            <ul className="flex flex-wrap gap-2">
              {read.symbols.map((s) => (
                <li key={s}>
                  <Link href={tickerHref(s)} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background">
                    {s}
                  </Link>
                </li>
              ))}
            </ul>
            {read.owner ? (
              <p className="text-sm text-muted">This is your list, as the people you shared it with see it.</p>
            ) : adopted ? (
              <p className="text-sm">
                Saved as your Dashboard list. <Link href="/dashboard" className="text-accent hover:underline">Open the Dashboard</Link>
              </p>
            ) : signedIn ? (
              <Button size="sm" className="self-start" disabled={busy} onClick={() => adopt(read.symbols)}>
                Use as my Dashboard list
              </Button>
            ) : (
              <p className="text-sm text-muted">
                <Link href={loginHref} className="text-accent hover:underline">Sign in</Link> to open a symbol&apos;s page or keep
                this list on your Dashboard.
              </p>
            )}
          </>
        )}

        {read?.access === "sign_in" && (
          <p className="text-sm">
            Its owner shares it only with members they approve.{" "}
            <Link href={loginHref} className="text-accent hover:underline">Sign in</Link> to ask for access.
          </p>
        )}
        {read?.access === "request" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              Its owner shares it only with members they approve. If you ask, they will see your display name, or your
              email with all but its first letter and domain hidden.
            </p>
            <Button size="sm" className="self-start" disabled={busy} onClick={requestAccess}>
              Ask for access
            </Button>
          </div>
        )}
        {read?.access === "pending" && <p className="text-sm">You asked for access. The list opens here once its owner approves.</p>}
        {read?.access === "denied" && <p className="text-sm">Its owner hasn&apos;t given you access to this list.</p>}
      </CardContent>
    </Card>
  );
}
