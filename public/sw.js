// GSPS service worker: browser push only (lib/notifications/web-push.ts).
// It caches nothing and serves no requests, so it can never show a stale page.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "GSPS", body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "GSPS";
  // Only a path on this site is opened on click, never an outside address.
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/dashboard";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      icon: "/favicon.ico",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // navigate() rejects on a window this worker doesn't control, so a
      // refused navigation falls back to opening a new window.
      const open = () => self.clients.openWindow(url);
      for (const w of windows) {
        if ("focus" in w && "navigate" in w) {
          return w.navigate(url).then((nav) => (nav || w).focus()).catch(open);
        }
      }
      return open();
    }),
  );
});
