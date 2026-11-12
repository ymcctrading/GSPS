"use client";

/**
 * The owner's control for sharing their Dashboard list (Q3 plan item 7): off,
 * anyone with the link, or only members the owner approves; a new link at any
 * time; and the requests to approve or turn away. See lib/watchlist/share.ts.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Access = "off" | "link" | "members";

interface Member {
  memberId: string;
  label: string;
  status: "pending" | "approved" | "denied";
}

interface ShareState {
  available: boolean;
  share: { access: "link" | "members"; token: string } | null;
  members: Member[];
}

const CHOICES: { value: Access; label: string }[] = [
  { value: "off", label: "Not shared" },
  { value: "link", label: "Anyone with the link" },
  { value: "members", label: "Only members I approve" },
];

export function WatchlistShare() {
  const [state, setState] = useState<ShareState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/watchlist-share", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setState(body as ShareState);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function call(method: "PUT" | "PATCH", payload: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist-share", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setState((s) => ({
        available: s?.available ?? true,
        share: "share" in body ? body.share : (s?.share ?? null),
        members: body.members ?? [],
      }));
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (error && !state) return <p className="text-sm text-bear">{error}</p>;
  if (!state) return <p className="text-sm text-muted">Loading…</p>;
  if (!state.available) {
    return <p className="text-sm text-muted">Save your own list first; the default list can&apos;t be shared.</p>;
  }

  const current: Access = state.share?.access ?? "off";
  const link =
    state.share && typeof window !== "undefined" ? `${window.location.origin}/shared/watchlist/${state.share.token}` : null;
  const requests = state.members.filter((m) => m.status === "pending");
  const decided = state.members.filter((m) => m.status !== "pending");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <p className="text-xs text-muted">
        Sharing shows your symbols only, never your trades, scores or levels. The list stays live: when you change it,
        the people you shared it with see the change.
      </p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Who can open your list">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={current === c.value}
            disabled={busy}
            onClick={() => current !== c.value && call("PUT", { access: c.value })}
            className={cn(
              "cursor-pointer rounded-md border px-3 py-1.5 text-sm",
              current === c.value ? "border-accent text-accent" : "border-border hover:bg-background",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {link && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">{link}</code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => call("PUT", { access: current, rotate: true })}>
            New link
          </Button>
        </div>
      )}
      {link && <p className="text-xs text-muted">A new link stops the old one at once.</p>}

      {current === "members" && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Requests</span>
          {requests.length === 0 && <p className="text-sm text-muted">No one is waiting.</p>}
          {requests.map((m) => (
            <div key={m.memberId} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{m.label}</span>
              <Button size="sm" disabled={busy} onClick={() => call("PATCH", { memberId: m.memberId, decision: "approve" })}>
                Approve
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => call("PATCH", { memberId: m.memberId, decision: "deny" })}>
                Turn away
              </Button>
            </div>
          ))}
          {decided.length > 0 && (
            <>
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Decided</span>
              {decided.map((m) => (
                <div key={m.memberId} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{m.label}</span>
                  <span className={m.status === "approved" ? "text-bull" : "text-muted"}>
                    {m.status === "approved" ? "Approved" : "Turned away"}
                  </span>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => call("PATCH", { memberId: m.memberId, decision: "remove" })}>
                    Remove
                  </Button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
      {error && <p className="text-sm text-bear">{error}</p>}
    </div>
  );
}
