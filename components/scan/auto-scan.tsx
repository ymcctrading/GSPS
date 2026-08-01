"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

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
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          const n = (data.bullish?.length ?? 0) + (data.bearish?.length ?? 0);
          if (mounted.current) {
            setMsg({
              ok: true,
              text: data.persisted
                ? `Scan complete — ${n} setups found.`
                : `Scan ran but couldn't save (${data.persistError ?? "unknown"}).`,
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
    const today = new Date().toISOString().slice(0, 10);
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
