const CACHE = "zhmi-brat-v1.1.0";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./state.js",
  "./engine.js",
  "./rooms.js",
  "./devices.js",
  "./sync-state.js",
  "./updates.js",
  "./version.json",
  "./workbook.json",
  "./peerjs.min.js",
  "./icon.svg",
  "./manifest.webmanifest",
  "./assets/buddy.webp",
  "./assets/nunito-cyrillic.woff2",
  "./assets/nunito-latin.woff2",
];
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" }))),
      ),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("zhmi-brat-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  if (
    e.request.method !== "GET" ||
    new URL(e.request.url).origin !== location.origin ||
    new URL(e.request.url).pathname.endsWith("/version.json")
  )
    return;
  e.respondWith(
    fetch(new Request(e.request, { cache: "no-store" }))
      .then((r) => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || Response.error())),
  );
});
