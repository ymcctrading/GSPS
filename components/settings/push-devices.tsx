"use client";

/**
 * "Alerts on this device" — the browser half of the Web Push channel.
 *
 * Everything this does is per-device by construction: a push subscription
 * belongs to one browser on one device, so a member who wants alerts on their
 * phone has to enable it *on the phone*, not on the laptop they happen to be
 * configuring from. The copy says that outright, because the failure it
 * prevents (enable on desktop, wait for a phone alert, receive nothing) looks
 * exactly like a broken feature.
 *
 * Deliberately separate from the preferences card's `push_enabled` toggle:
 * that toggle is the member's *intent* ("I want push"), this is the
 * *transport* ("this device can receive it"). Both are required, and
 * conflating them into one control would make a toggle flipped on a laptop
 * silently mean nothing for a phone.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authorizedFetch } from "@/lib/supabase/authorized-fetch";

/** The VAPID public key arrives base64url-encoded; `pushManager.subscribe`
 * wants the raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  // Backed by an explicit ArrayBuffer: `applicationServerKey` requires a
  // BufferSource over a plain ArrayBuffer, which `new Uint8Array(length)`
  // does not guarantee under this TS lib's SharedArrayBuffer-aware typing.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type State =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "not_configured" }
  | { kind: "denied" }
  | { kind: "off"; publicKey: string }
  | { kind: "on"; publicKey: string; endpoint: string };

export function PushDevices() {
  const [state, setState] = useState<State>({ kind: "checking" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // Feature detection before anything else: an iPhone that has not added
    // GSPS to its home screen has no PushManager at all, and so does any
    // browser in a private window.
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState({ kind: "unsupported" });
      return;
    }

    let publicKey: string | null = null;
    try {
      const res = await fetch("/api/notifications/push/public-key");
      const body = (await res.json()) as { configured: boolean; publicKey: string | null };
      if (!body.configured || !body.publicKey) {
        setState({ kind: "not_configured" });
        return;
      }
      publicKey = body.publicKey;
    } catch {
      setState({ kind: "not_configured" });
      return;
    }

    if (Notification.permission === "denied") {
      setState({ kind: "denied" });
      return;
    }

    // An existing registration means this device is already a target — but
    // only if the service worker is actually registered here; a member who
    // cleared site data looks "on" in no other way.
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const existing = await registration?.pushManager.getSubscription();
    setState(
      existing ? { kind: "on", publicKey, endpoint: existing.endpoint } : { kind: "off", publicKey },
    );
  }, []);

  useEffect(() => {
    // Scheduled rather than called inline: `refresh` sets state on its first
    // synchronous path (an unsupported browser), and doing that inside the
    // effect body would set state during the same commit that mounted this —
    // the same reason NotificationBell schedules its own kickoff.
    const kickoff = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(kickoff);
  }, [refresh]);

  async function enable() {
    if (state.kind !== "off" && state.kind !== "on") return;
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState({ kind: "denied" });
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      // A worker that is registered but not yet active cannot receive a push;
      // waiting here is what makes the immediately-following test send work.
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(state.publicKey),
      });

      const res = await authorizedFetch("/api/notifications/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage((body as { error?: string }).error ?? "Could not register this device.");
        return;
      }

      setState({ kind: "on", publicKey: state.publicKey, endpoint: subscription.endpoint });
      setMessage("This device will now receive alerts.");
    } catch {
      setMessage("Could not enable alerts on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (state.kind !== "on") return;
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();

      await authorizedFetch("/api/notifications/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: state.endpoint }),
      });

      setState({ kind: "off", publicKey: state.publicKey });
      setMessage("Alerts are off on this device.");
    } catch {
      setMessage("Could not turn alerts off on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage("Sending…");
    try {
      const res = await authorizedFetch("/api/notifications/push/test", { method: "POST" });
      const body = (await res.json()) as { message?: string; error?: string };
      setMessage(res.ok ? (body.message ?? "Sent.") : (body.error ?? "Could not send a test alert."));
    } catch {
      setMessage("Could not send a test alert.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-sm font-medium">Alerts on this device</p>

      {state.kind === "checking" && <p className="mt-1 text-sm text-muted">Checking…</p>}

      {state.kind === "unsupported" && (
        <p className="mt-1 text-sm text-muted">
          This browser can&apos;t receive push alerts. On an iPhone, open GSPS in Safari, use Share → Add to
          Home Screen, then open it from the home screen and come back here.
        </p>
      )}

      {state.kind === "not_configured" && (
        <p className="mt-1 text-sm text-muted">
          Push isn&apos;t set up on this deployment yet. The in-app bell still carries every alert.
        </p>
      )}

      {state.kind === "denied" && (
        <p className="mt-1 text-sm text-muted">
          This device blocked notifications for GSPS. Allow them in your browser&apos;s site settings, then
          reload this page.
        </p>
      )}

      {(state.kind === "off" || state.kind === "on") && (
        <>
          <p className="mt-1 text-sm text-muted">
            {state.kind === "on"
              ? "This device is registered. Alerts arrive in its notification tray, even with GSPS closed."
              : "Turn this on to get alerts in this device's notification tray. Each phone, tablet and computer has to be enabled separately."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.kind === "on" ? (
              <>
                <Button type="button" variant="outline" onClick={disable} disabled={busy}>
                  Turn off here
                </Button>
                <Button type="button" variant="outline" onClick={sendTest} disabled={busy}>
                  Send a test alert
                </Button>
              </>
            ) : (
              <Button type="button" onClick={enable} disabled={busy}>
                Enable on this device
              </Button>
            )}
          </div>
        </>
      )}

      {message && <p className="mt-2 text-sm text-muted">{message}</p>}
    </div>
  );
}
