/* ==========================================================================
   مغزدانه — Service Worker (PWA Offline Shell & Smart Caching)
   - Network-First for HTML documents (always fresh content, falls back to cache/offline card)
   - Network-Only for /api/* (never caches sensitive auth/order/wallet responses)
   - Stale-While-Revalidate for CSS, JS, fonts, and brand images
   ========================================================================== */

const CACHE_VERSION = 'maghzdaneh-pwa-v19';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/catalog.html',
  '/vendors.html',
  '/gifts.html',
  '/wholesale.html',
  '/cart.html',
  '/account.html',
  '/manifest.webmanifest',
  '/assets/css/main.css?v=19',
  '/assets/css/fx.css?v=17',
  '/assets/js/app.js?v=19',
  '/assets/img/logo.svg',
  '/assets/img/pwa-192x192.png',
  '/assets/img/pwa-512x512.png',
  '/assets/img/apple-touch-icon.png',
  '/data/db.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        Promise.allSettled(
          SHELL_ASSETS.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_VERSION)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function offlineFallbackHtml() {
  return new Response(
    `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>آفلاین | مغزدانه</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#060907;color:#eef3ef;font-family:Vazirmatn,Tahoma,sans-serif;padding:24px;text-align:center}
  .box{max-width:400px;background:#101713;border:1px solid rgba(212,175,55,0.28);border-radius:18px;padding:32px 24px}
  img{width:64px;height:64px;margin-bottom:14px}
  h1{font-size:1.25rem;margin:0 0 10px;color:#fff}
  p{font-size:0.9rem;color:#9eb0a5;line-height:1.8;margin:0 0 22px}
  button{background:#2ea05f;color:#050b07;border:0;border-radius:10px;padding:12px 22px;font-weight:800;font-family:inherit;font-size:0.92rem;cursor:pointer}
</style>
</head>
<body>
  <div class="box">
    <img src="/assets/img/pwa-192x192.png" alt="مغزدانه">
    <h1>اتصال اینترنت برقرار نیست</h1>
    <p>در حال حاضر دستگاه شما آفلاین است. پس از برقراری دوبارهٔ اینترنت، صفحه را تازه‌سازی کنید.</p>
    <button onclick="location.reload()">تلاش مجدد</button>
  </div>
</body>
</html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigation / HTML pages: Network-First with cache + offline fallback
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('/catalog.html').then((fb) => fb || offlineFallbackHtml()))
        )
    );
    return;
  }

  // Static assets (CSS, JS, images, JSON catalog): Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
