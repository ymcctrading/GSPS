"use client";

/**
 * Browser-push plumbing (client side). Registers public/sw.js, subscribes to
 * push via the browser's PushManager using the VAPID public key, and POSTs
 * the resulting subscription to /api/notifications/push-subscribe. Kept
 * deliberately minimal — this is the wiring, not the notification content.
 */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export interface PushSubscribeResult {
  ok: boolean;
  error?: string;
}

/**
 * Registers the service worker, requests notification permission, subscribes
 * to push, and saves the subscription server-side. `vapidPublicKey` comes
 * from the server (GET /api/notifications/preferences) since the client
 * never has env vars of its own.
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscribeResult> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "Push is not supported in this browser" };
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, error: "Notification permission was not granted" };
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
    });

    const res = await fetch("/api/notifications/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? "Could not save push subscription" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not subscribe to push" };
  }
}
