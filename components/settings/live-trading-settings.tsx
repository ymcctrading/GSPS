"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ShieldAlert } from "lucide-react";

/**
 * Per-user live-trading connect/pause. `lib/trade/kill-switch.ts`'s own
 * header names this gap directly: "Per-user kill switches need a column
 * and a policy, and they land with the per-user connection work." The
 * column already existed (`broker_connections.status`, checked by
 * `lib/brokers/live-creds.ts#readLiveAlpacaConnection` before every live
 * order — see `lib/trade/place-order.ts`'s live branch), and
 * `/api/alpaca/connect-live`'s POST/DELETE already implemented connect and
 * soft-disable. Nothing before this component gave a user a way to reach
 * either: no UI anywhere called that route. This is that UI.
 *
 * "Pause" is the per-user kill switch: it disables the connection
 * (`status = 'disabled'`), which `readLiveAlpacaConnection`'s
 * `.eq("status", "active")` filter means every subsequent live order is
 * refused with "Live trading requires a connected live brokerage in
 * Settings" — the same refusal shown before a user ever connects. It does
 * not cancel an order already resting at the broker or close an open
 * position; those still need the broker directly or GSPS's own close
 * action, same as the global `TRADING_DISABLED` switch's documented
 * carve-out for protective actions.
 */
export function LiveTradingSettings() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingPause, setConfirmingPause] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/alpaca/connect-live")
      .then((res) => res.json())
      .then((body: { connected?: boolean; error?: string }) => {
        if (cancelled) return;
        if (body.error) setLoadError(body.error);
        else setConnected(Boolean(body.connected));
      })
      .catch(() => !cancelled && setLoadError("Couldn't load live-trading connection status."));
    return () => {
      cancelled = true;
    };
  }, []);

  async function connect() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/alpaca/connect-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, apiSecret }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't connect.");
      setConnected(true);
      setApiKey("");
      setApiSecret("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function pause() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/alpaca/connect-live", { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't pause live trading.");
      setConnected(false);
      setConfirmingPause(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-accent" /> Live trading (Alpaca)
        </CardTitle>
        <CardDescription>
          Your own connected Alpaca live brokerage account. Real orders, real money — separate from the
          simulated paper account above.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loadError ? (
          <Badge variant="warn">{loadError}</Badge>
        ) : connected === null ? (
          <p className="text-sm text-muted">Checking…</p>
        ) : connected ? (
          <>
            <Badge variant="bull">Connected</Badge>
            {!confirmingPause ? (
              <Button variant="outline" onClick={() => setConfirmingPause(true)} disabled={busy}>
                Pause live trading
              </Button>
            ) : (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
                <p className="text-sm text-foreground">
                  This stops every new live order immediately — the same refusal you&apos;d see before
                  connecting. It does <strong>not</strong> cancel an order already resting at Alpaca or
                  close an open position; manage those at your broker or with GSPS&apos;s own close action.
                </p>
                <div className="flex gap-2">
                  <Button variant="destructive" onClick={pause} disabled={busy}>
                    {busy ? "Pausing…" : "Confirm pause"}
                  </Button>
                  <Button variant="outline" onClick={() => setConfirmingPause(false)} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <Badge variant="warn">Not connected</Badge>
            <div className="flex flex-col gap-2 sm:max-w-sm">
              <Input
                type="password"
                placeholder="Alpaca live API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Alpaca live API secret"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
              />
              <Button
                onClick={connect}
                disabled={busy || !apiKey.trim() || !apiSecret.trim()}
                className="sm:w-fit"
              >
                {busy ? "Verifying…" : "Connect"}
              </Button>
            </div>
          </>
        )}
        {actionError && <p className="text-sm text-bear">{actionError}</p>}
      </CardContent>
    </Card>
  );
}
