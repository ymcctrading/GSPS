"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Rebuilds the market-wide daily scan on demand. The scan is heavy (it walks a
 * broad universe top-down), so this can take a couple of minutes.
 */
export function RunScanButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setRunning(true);
    setMsg(null);
    try {
      const res = await fetch("/api/market-scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const n = (data.bullish?.length ?? 0) + (data.bearish?.length ?? 0);
      setMsg({
        ok: true,
        text: data.persisted
          ? `Scan complete — ${n} setups found.`
          : `Scan ran but couldn't save (${data.persistError ?? "unknown"}).`,
      });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={run} disabled={running} className="gap-2">
        <RefreshCw className={cn("h-4 w-4", running && "animate-spin")} />
        {running ? "Scanning… (this can take a minute)" : "Run market scan"}
      </Button>
      {msg && <p className={cn("text-xs", msg.ok ? "text-bull" : "text-bear")}>{msg.text}</p>}
    </div>
  );
}
