/* ==========================================================================
   مغزدانه — Service Worker (Subpath & GitHub Pages Compatible PWA Engine)
   - Resolves all shell assets relative to self.registration.scope so both
     root domains (/) and GitHub Pages subpaths (/repo-name/) work seamlessly.
   - Network-First for HTML navigations with cache + offline fallback
   - Network-Only for /api/* (never caches auth/order/wallet responses)
   - Stale-While-Revalidate for static assets
   ========================================================================== */

const CACHE_VERSION = 'maghzdaneh-pwa-v25';
const SHELL_RELATIVE = [
  './',
  './index.html',
  './catalog.html',
  './mix.html',
  './trace.html',
  './track.html',
  './export.html',
  './vendors.html',
  './gifts.html',
  './wholesale.html',
  './cart.html',
  './account.html',
  './admin.html',
  './manifest.webmanifest',
  './assets/css/main.css?v=20',
  './assets/css/fx.css?v=17',
  './assets/js/app.js?v=21',
  './assets/js/static-api.js?v=1',
  './assets/img/logo.svg',
  './assets/img/pwa-192x192.png',
  './assets/img/pwa-512x512.png',
  './assets/img/apple-touch-icon.png',
  './data/db.json',
  './data/marketplace-seed.json',
];

function scopeUrl(relPath) {
  return new URL(relPath, self.registration.scope).href;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        Promise.allSettled(
          SHELL_RELATIVE.map((rel) =>
            cache.add(new Request(scopeUrl(rel), { cache: 'reload' })).catch(() => null)
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
  const iconSrc = scopeUrl('./assets/img/pwa-192x192.png');
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
  img{width:64px;height:64px;margin-bottom:14px;border-radius:14px}
  h1{font-size:1.25rem;margin:0 0 10px;color:#fff}
  p{font-size:0.9rem;color:#9eb0a5;line-height:1.8;margin:0 0 22px}
  button{background:#2ea05f;color:#050b07;border:0;border-radius:10px;padding:12px 22px;font-weight:800;font-family:inherit;font-size:0.92rem;cursor:pointer}
</style>
</head>
<body>
  <div class="box">
    <img src="${iconSrc}" alt="مغزدانه">
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
  if (url.pathname.includes('/api/')) return;

  // Navigation / HTML pages: Network-First with 404 recovery & scope-safe cache fallback
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => {});
            return res;
          }
          if (res && res.status === 404) {
            return fetch(scopeUrl('./index.html')).catch(() =>
              caches.match(scopeUrl('./index.html')).then((fb) => fb || res)
            );
          }
          return res;
        })
        .catch(() =>
          caches
            .match(req)
            .then((cached) =>
              cached || caches.match(scopeUrl('./index.html')).then((fb) => fb || offlineFallbackHtml())
            )
        )
    );
    return;
  }

  // Static assets: Stale-While-Revalidate
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

// Web Push Notification Readiness (Demo & VAPID-Ready)
self.addEventListener('push', (event) => {
  let payload = { title: 'مغزدانه', body: 'اطلاع‌رسانی جدید از فروشگاه تخصصی مغزدانه', url: './account.html' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: scopeUrl('./assets/img/pwa-192x192.png'),
      badge: scopeUrl('./assets/img/pwa-192x192.png'),
      dir: 'rtl',
      lang: 'fa',
      data: { url: scopeUrl(payload.url || './') },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || scopeUrl('./');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === target && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return null;
    })
  );
});
