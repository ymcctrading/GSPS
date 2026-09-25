"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { etDateKey } from "@/lib/market/session";

/**
 * Populates the dashboard's reversion opportunities without anyone pressing a
 * button: on mount, if the stored scan isn't from today, the market scan runs
 * and the page refreshes when it lands.
 *
 * The scan walks a broad universe top-down and takes minutes, so two guards keep
 * it from stampeding: a module-level flag (one run per tab, survives remounts
 * from navigation) and a sessionStorage marker keyed by date (one auto-run per
 * day per tab, so bouncing between pages doesn't re-trigger it). The manual
 * refresh below bypasses both — it's an override, not a gate.
 */

let inFlight: Promise<void> | null = null;

function autoRunKey(today: string): string {
  return `gsps.autoscan.${today}`;
}

function alreadyAutoRan(today: string): boolean {
  try {
    return sessionStorage.getItem(autoRunKey(today)) === "1";
  } catch {
    return false; // private mode / storage disabled — fall back to the in-flight guard
  }
}

function markAutoRan(today: string) {
  try {
    sessionStorage.setItem(autoRunKey(today), "1");
  } catch {
    /* ignore */
  }
}

export function AutoScan({ scanDate }: { scanDate: string | null }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (opts?: { auto?: boolean }) => {
      // Share one request across concurrent mounts rather than firing several.
      if (inFlight) return inFlight;

      setRunning(true);
      setMsg(null);

      inFlight = (async () => {
        try {
          const res = await fetch("/api/market-scan", { method: "POST" });

          // A platform-level failure (Vercel killing the function on a 60s
          // timeout, or a 502/504 from the gateway) returns a plain-text or
          // HTML error page, not the route's own JSON body. Parsing that as
          // JSON throws a cryptic native error ("The string did not match
          // the expected pattern." on Safari, "Unexpected token" elsewhere)
          // that has nothing to do with the actual scan failure — check
          // res.ok and the content type before trusting res.json().
          const isJson = res.headers.get("content-type")?.includes("application/json");
          const data = isJson ? await res.json() : null;
          if (!res.ok) {
            throw new Error(
              data?.error ??
                (res.status === 504 || res.status === 502
                  ? "The scan is taking too long and timed out server-side. Try again in a moment."
                  : `HTTP ${res.status}`),
            );
          }
          if (!data) throw new Error("Scan response was not valid JSON.");
          const rows: { state?: string }[] = [...(data.bullish ?? []), ...(data.bearish ?? [])];
          const scanned = data.persistedCount ?? rows.length;
          // `persistedCount` counts every row saved with a priced trade plan,
          // including ones that scored below WATCH_SCORE_THRESHOLD and render
          // only inside each card's "not qualified" toggle — see
          // lib/scoring/weights.ts. Reporting that number alone as "setups
          // found" reads as a promise the Buy/Sell cards then don't keep, so
          // the qualified (Watch/Execute) count is called out separately.
          const qualified = rows.filter((r) => r.state === "Execute" || r.state === "Watch").length;
          if (mounted.current) {
            setMsg({
              // A scan that saved nothing hasn't updated the lists below, so it
              // reads as a failure — even when the reason is simply that today
              // offered no setup worth publishing.
              ok: Boolean(data.persisted),
              text: data.persisted
                ? `Scan complete — ${scanned} scanned, ${qualified} qualified (Watch or better).`
                : `Scan ran but nothing was saved: ${data.persistError ?? "unknown reason"}.`,
            });
          }
          router.refresh();
        } catch (err) {
          if (mounted.current) {
            setMsg({
              ok: false,
              text: `${opts?.auto ? "Auto-scan" : "Scan"} failed: ${
                err instanceof Error ? err.message : String(err)
              }`,
            });
          }
        } finally {
          if (mounted.current) setRunning(false);
          inFlight = null;
        }
      })();

      return inFlight;
    },
    [router],
  );

  // Auto-populate on mount when today's scan is missing or stale. `run` sets
  // state at its very start (the "Scanning…" indicator) — queued as a
  // microtask so that update lands after this effect's commit instead of
  // inside it.
  useEffect(() => {
    // Eastern, matching how the scan dates itself. On UTC the guard would think
    // an evening scan was yesterday's and re-run it on every mount after 8pm ET.
    const today = etDateKey(new Date());
    if (scanDate === today) return;
    if (alreadyAutoRan(today)) return;
    markAutoRan(today);
    queueMicrotask(() => void run({ auto: true }));
  }, [scanDate, run]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => run()}
        disabled={running}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-background disabled:opacity-60 cursor-pointer",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", running && "animate-spin")} />
        {running ? "Scanning the market…" : "Refresh scan"}
      </button>
      {msg && <p className={cn("text-xs", msg.ok ? "text-bull" : "text-bear")}>{msg.text}</p>}
      {running && !msg && (
        <p className="text-xs text-muted">Building today&apos;s opportunities — this takes a minute.</p>
      )}
    </div>
  );
}
