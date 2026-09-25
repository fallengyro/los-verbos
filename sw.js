// voseá — service worker
//
// Tier 0 PWA: just enough offline caching to make the app-shell (the HTML,
// CSS, JS, manifest, and icons) load instantly and work without a network
// connection. It deliberately does NOT try to cache or work with:
//   - Supabase API calls (auth, verbs/words/lists data) — those must always
//     hit the network so the user sees real, current data, and stale-write
//     conflicts don't happen.
//   - Google Fonts — cross-origin, and not worth the complexity here.
//
// Strategy: stale-while-revalidate for same-origin GET requests. Serve
// from cache immediately if we have it (fast, works offline), and in the
// background fetch a fresh copy to store for next time.

var CACHE_NAME = "iv-shell-v24";

var SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // cache.addAll() is all-or-nothing — if a single file 404s (e.g. an
      // icon that didn't get deployed), the whole install silently fails
      // and NO offline caching works, not just for that one file. Caching
      // each file independently means one missing/broken file is just
      // skipped instead of taking the rest of the app shell down with it.
      return Promise.all(
        SHELL_FILES.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn("No se pudo precachear " + url + ":", err);
          });
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) { return caches.delete(name); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;

  // Only handle same-origin GET requests — everything else (Supabase API
  // calls, Google Fonts, POST/PUT/etc.) passes straight through untouched.
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(request).then(function (cached) {
        var networkFetch = fetch(request).then(function (response) {
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        }).catch(function () {
          // Offline and not cached — for a navigation, fall back to the
          // cached app shell so the user at least sees the app.
          if (request.mode === "navigate") {
            return cache.match("./index.html");
          }
          return cached;
        });

        return cached || networkFetch;
      });
    })
  );
});