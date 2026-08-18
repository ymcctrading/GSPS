// GSPS — minimal service worker for browser push notifications.
// Registered by lib/notifications/push-client.ts. Its only job is to turn an
// incoming push event into a notification; it does no caching or offline work.
self.addEventListener("push", (event) => {
  let payload = { title: "GSPS alert", body: "" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the default title/body.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/favicon.ico",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.openWindow(url));
});
