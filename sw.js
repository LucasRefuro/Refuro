// Lichte service worker voor Storvo, zodat de app als PWA te installeren is (icoon op je
// beginscherm) en offline een cache-versie toont. Bewust voorzichtig:
//  - Externe verzoeken (Supabase, Edge Functions, Google Fonts) laten we HELEMAAL met rust,
//    zodat inloggen, data en mail altijd rechtstreeks over het netwerk gaan.
//  - Paginabezoeken gaan NETWERK-EERST (zo krijg je altijd de nieuwste versie na een deploy);
//    lukt het netwerk niet, dan tonen we de opgeslagen versie.
//  - Eigen statische bestanden (iconen e.d.) cache-eerst.
// Verhoog CACHE als je de cache wilt verversen.
const CACHE = "storvo-v2";

self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // oude caches opruimen
    const namen = await caches.keys();
    await Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return; // extern: niet aanraken

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const kopie = res.clone();
        caches.open(CACHE).then((c) => c.put(req, kopie)).catch(() => {});
        return res;
      } catch (_e) {
        return (await caches.match(req)) || (await caches.match("/app")) || Response.error();
      }
    })());
    return;
  }

  // Eigen statische bestanden: eerst uit de cache, anders van het netwerk (en bewaren).
  e.respondWith((async () => {
    const uitCache = await caches.match(req);
    if (uitCache) return uitCache;
    try {
      const res = await fetch(req);
      const kopie = res.clone();
      caches.open(CACHE).then((c) => c.put(req, kopie)).catch(() => {});
      return res;
    } catch (_e) {
      return uitCache || Response.error();
    }
  })());
});
