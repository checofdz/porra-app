// Offline-first service worker: race day networks are congested
const V = "cheer-chi26-v5";
const CORE = ["/", "/index.html", "/css/app.css", "/js/main.js", "/js/state.js", "/js/engine.js", "/js/pace.js", "/js/plan.js", "/js/map.js", "/js/live.js", "/js/ui.js", "/js/race-chicago.js", "/js/i18n.js", "/js/i18n-en.js", "/js/share.js", "/js/onboarding.js", "/js/alarm.js", "/js/track.js", "/js/vendor/qrcode.js", "/data/mapdata.json", "/data/walkgraph.json", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.startsWith("/api/")) return;
  if (u.origin === location.origin) {
    // network-first for code (get updates), cache fallback offline; cache-first for heavy data
    if (u.pathname.startsWith("/data/")) { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(e.request, c)); return res; }))); return; }
    e.respondWith(fetch(e.request).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(e.request, c)); return res; }).catch(() => caches.match(e.request).then(r => r || caches.match("/index.html"))));
  } else if (u.hostname.includes("fonts.g")) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(e.request, c)); return res; })));
  }
});
self.addEventListener("notificationclick", e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: "window" }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow("/"))); });
