/*
 * GSPS service worker — push delivery only.
 *
 * Deliberately NOT a caching/offline service worker. This file exists for one
 * reason: the Push API requires a registered service worker to receive a push
 * event, because the browser wakes the worker when the app is closed. Adding
 * offline caching here would change how every page in the app is fetched —
 * a far larger behavioural change than "alerts can reach a phone" — so there
 * is no `fetch` handler at all and navigation is untouched.
 *
 * Payload shape is `PushPayload` from lib/notifications/webpush.ts:
 * { title, body, url, tag }.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // A push with a non-JSON body is not ours; showing raw text would put
    // unknown content in the member's tray under the GSPS name.
    return;
  }

  const title = payload.title || "GSPS alert";
  const options = {
    body: payload.body || "",
    // `tag` collapses a repeat alert for the same symbol onto the existing
    // tray entry instead of stacking duplicates.
    tag: payload.tag || undefined,
    // The URL travels in `data` so `notificationclick` below can route to it.
    data: { url: payload.url || "/" },
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // A market alert is time-sensitive and the member explicitly opted in, so
    // it is worth a sound/vibration rather than arriving silently.
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  // Focus an already-open GSPS tab and navigate it rather than opening a
  // second one — a trader with the scanner open does not want a duplicate
  // window, they want the tab they are working in to show the symbol.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) {
            return client.focus().then(() => client.navigate(target));
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// Chrome rotates a subscription's keys on its own schedule and fires this
// event when it does. Without a handler the old subscription silently stops
// receiving, which is exactly the "dies quietly" failure the server-side
// pruning is there to catch — handling it here closes the loop one step
// earlier, at the device that already knows.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
      if (!applicationServerKey) return;
      try {
        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        await fetch("/api/notifications/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription }),
        });
      } catch {
        // Nothing useful to do from a worker with no UI — the member's next
        // visit to Settings re-subscribes.
      }
    })(),
  );
});
