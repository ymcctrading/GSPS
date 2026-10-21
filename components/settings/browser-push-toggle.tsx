"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authorizedFetch } from "@/lib/supabase/authorized-fetch";

/** The browser's base64url public key as the bytes `pushManager.subscribe` wants. */
function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "not_configured" }
  | { kind: "blocked" }
  | { kind: "off"; publicKey: string }
  | { kind: "on"; publicKey: string; endpoint: string };

/**
 * Browser push for this device (lib/notifications/web-push.ts). Turning it on
 * asks the browser's permission, registers `/sw.js`, subscribes with the
 * server's public key and saves the subscription, which also turns the push
 * preference on. Turning it off removes this browser only.
 */
export function BrowserPushToggle({ onEnabledChange }: { onEnabledChange: (enabled: boolean) => void }) {
  const [state, setState] = useState<State>({ kind: "checking" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setState({ kind: "unsupported" });
        return;
      }
      try {
        const res = await authorizedFetch("/api/notifications/push-subscription");
        const body = (await res.json()) as { configured?: boolean; publicKey?: string | null };
        if (!body.configured || !body.publicKey) {
          if (!cancelled) setState({ kind: "not_configured" });
          return;
        }
        if (Notification.permission === "denied") {
          if (!cancelled) setState({ kind: "blocked" });
          return;
        }
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        const existing = await registration.pushManager.getSubscription();
        if (cancelled) return;
        setState(
          existing
            ? { kind: "on", publicKey: body.publicKey, endpoint: existing.endpoint }
            : { kind: "off", publicKey: body.publicKey },
        );
      } catch {
        if (!cancelled) setState({ kind: "unsupported" });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn(publicKey: string) {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState({ kind: "blocked" });
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      });
      const res = await authorizedFetch("/api/notifications/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await subscription.unsubscribe();
        setMessage(body.error ?? "Could not turn on browser push");
        return;
      }
      setState({ kind: "on", publicKey, endpoint: subscription.endpoint });
      onEnabledChange(true);
    } catch {
      setMessage("Could not turn on browser push");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(publicKey: string, endpoint: string) {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      await subscription?.unsubscribe();
      const res = await authorizedFetch("/api/notifications/push-subscription", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      const body = (await res.json().catch(() => ({}))) as { subscriptions?: number };
      setState({ kind: "off", publicKey });
      if ((body.subscriptions ?? 0) === 0) onEnabledChange(false);
    } catch {
      setMessage("Could not turn off browser push");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setMessage("Sending…");
    try {
      const res = await authorizedFetch("/api/notifications/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
      const body = await res.json();
      setMessage(res.ok ? (body.message ?? "Sent.") : (body.error ?? "Could not send a test push"));
    } catch {
      setMessage("Could not send a test push");
    }
  }

  const note =
    state.kind === "unsupported"
      ? "This browser can't receive push. On iPhone, add GSPS to your home screen first."
      : state.kind === "not_configured"
        ? "Browser push isn't switched on for GSPS yet."
        : state.kind === "blocked"
          ? "Notifications are blocked for this site in your browser settings."
          : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span>Browser push</span>
        <Badge variant={state.kind === "on" ? "bull" : "muted"}>{state.kind === "on" ? "On here" : "Off"}</Badge>
      </div>
      {state.kind === "off" && (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => turnOn(state.publicKey)}>
          {busy ? "Turning on…" : "Turn on in this browser"}
        </Button>
      )}
      {state.kind === "on" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={sendTest}>
            Send test push
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => turnOff(state.publicKey, state.endpoint)}>
            Turn off here
          </Button>
        </div>
      )}
      {state.kind === "checking" && <p className="text-xs text-muted">Checking…</p>}
      {note && <p className="text-xs text-muted">{note}</p>}
      {message && <p className="text-xs text-muted">{message}</p>}
    </div>
  );
}
