const CACHE_NAME = "turu-1880-app-v2";

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text?.() || "Neue TuRU-Nachricht" }; }
  const title = data.title || "TuRU 1880";
  const options = {
    body: data.body || "Du hast eine neue Nachricht.",
    icon: "/turu-logo-192.png",
    badge: "/turu-logo-192.png",
    data: { url: data.url || "/" },
    tag: data.messageId || "turu-message"
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list => {
    for (const client of list) {
      if ("focus" in client) { client.navigate(target); return client.focus(); }
    }
    return clients.openWindow(target);
  }));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
