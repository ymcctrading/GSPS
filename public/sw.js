// GSPS service worker: browser push (lib/notifications/web-push.ts) and one
// offline page for the installed app (Q3 item 1, docs/Q3_PLAN.md).
// It caches only that page and its icon, and answers a page request from the
// cache only when the network fails, so it can never show a stale price,
// plan or position: everything else goes to the network untouched.

const OFFLINE_CACHE = "gsps-offline-v1";
const OFFLINE_URL = "/offline.html";
const OFFLINE_ICON = "/icons/icon-192.png";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, OFFLINE_ICON]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("gsps-offline-") && k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .catch(() => undefined)
      .then(() => self.clients.claim()),
  );
});

// Page navigations only: try the network, and only if it fails show the
// offline page. The offline page's own icon is answered the same way. API
// calls, scripts, other images and data are never touched.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === OFFLINE_ICON && event.request.method === "GET") {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_ICON).then((icon) => icon || Response.error())));
    return;
  }
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then((page) => page || new Response("You're offline.", { status: 503, headers: { "Content-Type": "text/plain" } })),
    ),
  );
});

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
      icon: OFFLINE_ICON,
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
