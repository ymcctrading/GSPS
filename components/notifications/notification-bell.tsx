"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { tickerHref } from "@/lib/routes";
import { formatOpenedAt } from "@/lib/portfolio/opened-at";
import { cn } from "@/lib/utils";

interface InboxNotification {
  id: string;
  symbol: string;
  verdict: "Execute" | "INVALIDATED";
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

const POLL_MS = 30_000;

/**
 * The "on the platform itself" notification channel — alongside email, per
 * the project owner's direct request. Polls /api/notifications/inbox on a
 * timer (same order of cadence as the price poller — see useLiveQuote's own
 * comment on why 5-30s, not sub-second, is the right budget for a background
 * check nobody is staring at) and shows an unread badge; opening the
 * dropdown marks visible unread rows read.
 */
export function NotificationBell() {
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const fetchInbox = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/inbox?limit=20");
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: InboxNotification[]; unreadCount: number };
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Best-effort — a failed poll just leaves the last-known state on screen.
    }
  }, []);

  useEffect(() => {
    // Scheduled rather than called inline: fetchInbox sets state, and doing
    // that inside the effect body would set state during the same commit
    // that mounted the bell (same reasoning as IntradayAlerts's own kickoff).
    const kickoff = setTimeout(fetchInbox, 0);
    const timer = setInterval(fetchInbox, POLL_MS);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [fetchInbox]);

  // Click-outside close.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function handleOpen() {
    const next = !open;
    setOpen(next);
    if (!next) return;

    // Mark visible unread rows read on open, optimistically, then confirm
    // server-side — a member opening the bell has, by definition, seen them.
    const unread = notifications.filter((n) => n.read_at == null);
    if (unread.length === 0) return;
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    await fetch("/api/notifications/inbox/read-all", { method: "POST" }).catch(() => {
      // Best-effort — a failed mark-read just means the badge reappears on
      // the next poll, which is a correct (if slightly stale) recovery.
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-accent"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bear px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-3 py-2 text-sm font-medium">Notifications</div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">
                Nothing yet — an Execute setup or an invalidated one you were tracking shows up here.
              </p>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={tickerHref(n.symbol)}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block border-b border-border px-3 py-2.5 text-sm last:border-b-0 hover:bg-background",
                    n.read_at == null && "bg-accent-soft/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("font-medium", n.verdict === "INVALIDATED" ? "text-bear" : "text-bull")}>
                      {n.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{formatOpenedAt(n.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{n.body}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
