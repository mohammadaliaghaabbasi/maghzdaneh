/* ==========================================================================
   مغزدانه — app.js (Unified Marketplace, Multi-Method Auth & Editorial Core)
   هسته مشترک تمام صفحات: کاتالوگ ترکیبی (مغزدانه + غرفه‌های باغداران)،
   احراز هویت یکپارچه (موبایل OTP + نام کاربری/رمز + گوگل)، سبد خرید کشویی،
   ناوبری ۳-ناحیه‌ای تمیز و امنیت کامل در برابر XSS/CSRF
   ========================================================================== */

const APP = {
  DB_PATH: 'data/db.json',
  db: null,
  cart: JSON.parse(localStorage.getItem('maghzdaneh_cart') || '[]'),
  coupon: JSON.parse(sessionStorage.getItem('maghzdaneh_coupon') || 'null'),
  compare: JSON.parse(localStorage.getItem('maghzdaneh_compare') || '[]'),
  tier: localStorage.getItem('maghzdaneh_tier') || 'retail',
  user: null,          // Firebase Google user (if logged in via Google)
  serverUser: null,    // Server-authenticated user (OTP or Username/Password)
  vendorShop: null,    // Active user's personal seller storefront (if created)
  serverAdmin: null,   // Server-authenticated admin (Username/Password)
  isAdmin: false,
  _userToken: null,    // In-memory only (never stored in localStorage/sessionStorage)
  _adminToken: null,   // In-memory only (never stored in localStorage/sessionStorage)
};

/* ---------- XSS-Safe Escaping & Safe URL Sanitization ---------- */
function esc(val) {
  return String(val == null ? '' : val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeImgUrl(url, fallback = 'assets/img/maghz-pistachio-akbari.jpg') {
  const s = String(url || '').trim();
  if (/^(https?:\/\/|\/|assets\/|src\/assets\/)/i.test(s) && !/javascript:|data:/i.test(s)) {
    return s;
  }
  return fallback;
}

/* ---------- Static / GitHub Pages API Fallback Engine Loader ---------- */
let _staticApiPromise = null;
function isKnownStaticHost() {
  try {
    const host = (location.hostname || '').toLowerCase();
    return location.protocol === 'file:' || host === 'github.io' || host.endsWith('.github.io');
  } catch {
    return false;
  }
}

function ensureStaticApi() {
  if (window.MgzStaticApi) return Promise.resolve(window.MgzStaticApi);
  if (_staticApiPromise) return _staticApiPromise;
  _staticApiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="static-api.js"]');
    if (existing) {
      const check = () => (window.MgzStaticApi ? resolve(window.MgzStaticApi) : setTimeout(check, 30));
      check();
      return;
    }
    const s = document.createElement('script');
    s.src = 'assets/js/static-api.js?v=1';
    s.onload = () => (window.MgzStaticApi ? resolve(window.MgzStaticApi) : reject(new Error('Static API failed to initialize')));
    s.onerror = () => reject(new Error('Failed to load static-api.js'));
    document.head.appendChild(s);
  });
  return _staticApiPromise;
}

/* ---------- Hardened Server API Fetch Helper (Includes Cookies + CSRF Header + Static Fallback) ---------- */
async function apiFetch(url, options = {}) {
  const isApiPath = String(url || '').startsWith('/api/');
  if (isApiPath && (APP._staticApiMode || isKnownStaticHost())) {
    APP._staticApiMode = true;
    const engine = await ensureStaticApi();
    return engine.handle(url, options);
  }

  const authHeaders = {};
  if (APP._adminToken) authHeaders['X-Admin-Token'] = APP._adminToken;
  if (APP._userToken && !String(url).startsWith('/api/admin/')) {
    authHeaders['Authorization'] = `Bearer ${APP._userToken}`;
  }
  const headers = {
    'X-Requested-With': 'MaghzdanehApp',
    ...authHeaders,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };

  let res;
  try {
    res = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers,
    });
  } catch (netErr) {
    if (isApiPath) {
      APP._staticApiMode = true;
      const engine = await ensureStaticApi();
      return engine.handle(url, options);
    }
    throw netErr;
  }

  let data = null;
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');
  if (isJson) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    try {
      const txt = await res.text();
      if (txt && txt.trim().startsWith('{')) data = JSON.parse(txt);
    } catch {
      data = null;
    }
  }

  // Automatic fallback for static hosts (e.g. GitHub Pages on custom domain returning 405 or HTML 404 for /api/*)
  if (isApiPath && (res.status === 405 || ((res.status === 404 || res.status === 501) && !isJson && !data))) {
    APP._staticApiMode = true;
    const engine = await ensureStaticApi();
    return engine.handle(url, options);
  }

  if (!res.ok) {
    const err = new Error((data && data.error) || `خطای سرور (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ---------- Bespoke Vector Icon Set (No raw system emojis in UI chrome) ---------- */
const ICONS = {
  cart: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 4h2.8l2.2 10.6a1.5 1.5 0 0 0 1.5 1.2h9.3a1.5 1.5 0 0 0 1.46-1.16L21.5 7.5H6.2"/></svg>',
  menu: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  arrowLeft: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  arrowRight: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
  download: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  wifiOff: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><circle cx="12" cy="20" r="1"/></svg>',
  search: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8"/></svg>',
  leaf: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
  kernel: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c4.6 1.2 7.2 5.2 6.4 10.2C17.6 18 14.6 21 12 21s-5.6-3-6.4-7.8C4.8 8.2 7.4 4.2 12 3z"/><path d="M12 5.5c2.4 2.4 2.8 6.4 2 10.5-.5 2.4-1.3 4-2 4.5"/></svg>',
  layers: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 12l10 5 10-5"/><path d="M2 17l10 5 10-5"/></svg>',
  flame: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c.5 3.5-2.5 5.5-2.5 9a4.5 4.5 0 0 0 9 0c0-3.2-1.8-5.5-3.3-7.3-.3 1.4-1.2 2.3-2.2 2.3.5-1.4.4-2.8-1-4z"/><path d="M9.5 12c-1.8 1-3 2.7-3 4.8A5.5 5.5 0 0 0 12 22a5.5 5.5 0 0 0 5.5-5.2"/></svg>',
  box: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7l8.7 5 8.7-5M12 22V12"/></svg>',
  truck: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h4V5H2v12h3"/><path d="M14 9h4l4 4v4h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
  shield: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
  scale: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 7h14M7 7l-3 7h6l-3-7zM17 7l-3 7h6l-3-7zM8 21h8"/></svg>',
  receipt: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
  calendar: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  tag: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg>',
  phone: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  mail: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>',
  pin: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  clock: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  trash: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  instagram: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>',
  telegram: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
  whatsapp: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
  user: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  store: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/></svg>',
  shop: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  book: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  edit: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  heart: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
};

function icon(name) {
  return ICONS[name] || ICONS.kernel;
}

const CAT_ICON_MAP = {
  'pistachio-kernel': 'kernel',
  'pistachio-slice': 'layers',
  'almond-kernel': 'leaf',
  'walnut-kernel': 'shield',
  'in-shell': 'box',
};

/* ---------- Helpers ---------- */
const fmt = n => Number(n).toLocaleString('fa-IR');
const faToman = n => fmt(n) + ' تومان';
const byId = id => APP.db && APP.db.products.find(p => p.id === id);
const tierMetaOf = t => (APP.db && APP.db.tiers.find(x => x.id === t)) || { id: 'retail', label: 'خرده‌فروشی', min: 0.25 };
const tierLabel = t => tierMetaOf(t).label;
const tierMin = t => tierMetaOf(t).min || 0.25;
const catName = c => ((APP.db && APP.db.categories.find(x => x.id === c)) || {}).name || '';

function priceFor(p, tier) {
  return p.prices[tier || APP.tier] || p.prices.retail;
}

function defaultQtyForTier(tier) {
  if (tier === 'wholesale') return 25;
  if (tier === 'semi') return 5;
  return 1;
}

/* ---------- Firebase Bundle Loader ---------- */
let _cloudReadyPromise = null;
function ensureCloudSDK() {
  if (window.MgzCloud) return Promise.resolve(window.MgzCloud);
  if (_cloudReadyPromise) return _cloudReadyPromise;
  _cloudReadyPromise = new Promise(resolve => {
    const existing = document.querySelector('script[src*="firebase-bundle.js"]');
    const done = () => resolve(window.MgzCloud || null);
    if (existing) {
      window.addEventListener('mgzcloud:ready', done, { once: true });
      setTimeout(done, 2000);
      return;
    }
    const s = document.createElement('script');
    s.src = 'assets/js/firebase-bundle.js?v=21';
    s.async = true;
    s.onload = () => done();
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return _cloudReadyPromise;
}

/* ---------- Data Loading (Merges Official House Catalog + Independent Vendor Products + CMS) ---------- */
async function loadDB() {
  if (APP.db) return APP.db;
  const [res, apiCat, authState, cloud] = await Promise.all([
    fetch(APP.DB_PATH, { cache: 'no-cache' }),
    apiFetch('/api/catalog').catch(() => null),
    apiFetch('/api/auth/me').catch(() => null),
    ensureCloudSDK().catch(() => null),
  ]);
  if (!res.ok) throw new Error('DB load failed: ' + res.status);
  APP.db = await res.json();

  if (authState) {
    APP.serverUser = authState.user || null;
    APP.vendorShop = authState.vendorShop || null;
    APP.serverAdmin = authState.admin || null;
    if (APP.serverAdmin) APP.isAdmin = true;
  }

  // Merge server catalog (includes house overrides + independent personal seller storefront listings)
  if (apiCat && Array.isArray(apiCat.products) && apiCat.products.length > 0) {
    APP.db.products = apiCat.products;
  } else {
    const houseList = (APP.db.products || []).map(p => ({ ...p, source: 'house', vendorName: 'عرضه مستقیم مغزدانه' }));
    let seedVendorProducts = [];
    try {
      const seedRes = await fetch('./data/marketplace-seed.json', { cache: 'no-cache' });
      if (seedRes.ok) {
        const seedData = await seedRes.json();
        seedVendorProducts = (Array.isArray(seedData.vendorProducts) ? seedData.vendorProducts : [])
          .filter(p => p.active !== false)
          .map(p => ({ ...p, source: 'vendor' }));
      }
    } catch {}
    APP.db.products = [...houseList, ...seedVendorProducts];
  }

  // Apply server-stored branding CMS if present
  const srvBranding = apiCat && apiCat.cms && apiCat.cms.branding;
  if (srvBranding) applyBrandingToDb(srvBranding);

  // Also hydrate live Firestore products/branding if configured (bounded timeout so slow networks never stall UI)
  if (cloud) {
    try {
      const timeoutFallback = new Promise(resolve => setTimeout(() => resolve([[], null]), 2500));
      const [liveProducts, liveBranding] = await Promise.race([
        Promise.all([
          cloud.getLiveProducts().catch(() => []),
          cloud.getSiteContent('branding').catch(() => null),
        ]),
        timeoutFallback,
      ]);
      if (Array.isArray(liveProducts) && liveProducts.length > 0) {
        const vendorOnly = APP.db.products.filter(p => p.source === 'vendor');
        const houseTagged = liveProducts.map(p => ({ ...p, source: 'house', vendorName: 'عرضه مستقیم مغزدانه' }));
        APP.db.products = [...houseTagged, ...vendorOnly];
      }
      if (liveBranding) applyBrandingToDb(liveBranding);
    } catch (err) {
      console.warn('Cloud hydration skipped:', err);
    }
  }

  APP.cart = APP.cart.filter(i => i && (i.kind === 'gift-box' || i.kind === 'sample-pack' || i.kind === 'custom-mix' || byId(i.id)));
  APP.compare = (Array.isArray(APP.compare) ? APP.compare : []).filter(id => Boolean(byId(id))).slice(0, 3);
  if (APP.serverUser && !APP._cartSyncedOnce) {
    APP._cartSyncedOnce = true;
    apiFetch('/api/customer/cart').then(res => {
      if (res && Array.isArray(res.cart) && res.cart.length && !APP.cart.length) {
        APP.cart = res.cart.filter(i => i && (isCustomCartItem(i) || byId(i.id)));
        localStorage.setItem('maghzdaneh_cart', JSON.stringify(APP.cart));
        updateCartBadge();
        renderCartDrawer();
      }
    }).catch(() => {});
  }
  return APP.db;
}

function applyBrandingToDb(br) {
  if (!br || !APP.db || !APP.db.site) return;
  if (br.siteName) APP.db.site.name = br.siteName;
  if (br.tagline) APP.db.site.tagline = br.tagline;
  if (br.phone) APP.db.site.phone = br.phone;
  if (br.mobile) APP.db.site.mobile = br.mobile;
  if (br.email) APP.db.site.email = br.email;
  if (br.address) APP.db.site.address = br.address;
  if (br.worktime) APP.db.site.worktime = br.worktime;
  if (typeof br.flatShippingCost === 'number') APP.db.site.shipping.flat_cost = br.flatShippingCost;
  if (typeof br.freeShippingOver === 'number') APP.db.site.shipping.free_over = br.freeShippingOver;
  if (br.heavyShippingNote) APP.db.site.shipping.heavy_note = br.heavyShippingNote;
  if (br.announcement) APP.db.site.announcement = br.announcement;
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ---------- Zero-Broken-Image Fallback ---------- */
window.mgzImgFallback = function (img, title) {
  if (img.dataset.fallbackDone) return;
  img.dataset.fallbackDone = '1';
  const wrap = img.parentElement;
  if (!wrap) return;
  img.style.display = 'none';
  const box = document.createElement('div');
  box.className = 'img-fallback';
  box.innerHTML = `${icon('kernel')}<span>${esc(title || 'مغزدانه')}</span>`;
  wrap.appendChild(box);
};

/* ---------- Cart, Variants, Custom Packs & Coupon Engine ---------- */
let _cartSyncTimer = null;
function saveCart() {
  localStorage.setItem('maghzdaneh_cart', JSON.stringify(APP.cart));
  updateCartBadge();
  renderCartDrawer();
  if (APP.serverUser) {
    clearTimeout(_cartSyncTimer);
    _cartSyncTimer = setTimeout(() => {
      apiFetch('/api/customer/cart', {
        method: 'PUT',
        body: JSON.stringify({ cart: APP.cart }),
      }).catch(() => {});
    }, 600);
  }
}

function setCoupon(couponObj) {
  APP.coupon = couponObj || null;
  if (APP.coupon) sessionStorage.setItem('maghzdaneh_coupon', JSON.stringify(APP.coupon));
  else sessionStorage.removeItem('maghzdaneh_coupon');
  renderCartDrawer();
  document.dispatchEvent(new CustomEvent('cart:changed'));
}

function clearCoupon() {
  setCoupon(null);
}

function isCustomCartItem(it) {
  return Boolean(it && (it.kind === 'gift-box' || it.kind === 'sample-pack' || it.kind === 'custom-mix'));
}

function cartItemUnit(it) {
  if (!it) return 0;
  if (isCustomCartItem(it)) return Math.max(0, Number(it.unitPrice || 0));
  const p = byId(it.id);
  if (!p) return 0;
  return (p.prices[it.tier] || p.prices.retail) + Math.max(0, Number(it.variantDelta || 0));
}

function cartItemMeta(it) {
  if (isCustomCartItem(it)) {
    const defaultName =
      it.kind === 'gift-box' ? 'جعبه هدیه سفارشی'
      : it.kind === 'custom-mix' ? 'میکس اختصاصی آجیل و مغز'
      : 'بسته نمونه ۵ گرید';
    return {
      name: it.name || defaultName,
      img: it.img || 'assets/img/maghz-pistachio-akbari.jpg',
      source: 'house',
      vendorName: 'عرضه مستقیم مغزدانه',
      unitLabel: it.kind === 'custom-mix' ? 'بسته میکس' : it.kind === 'gift-box' ? 'بسته' : 'پک',
    };
  }
  const p = byId(it.id);
  return p
    ? { name: p.name, img: p.img, source: p.source, vendorName: p.vendorName, unitLabel: 'کیلو' }
    : null;
}

function cartWeightTotal() {
  const sum = APP.cart.reduce((s, i) => {
    if (isCustomCartItem(i)) return s + Number(i.weightKg || 0.5) * Number(i.qty || 1);
    return s + Number(i.qty || 0);
  }, 0);
  return Math.round(sum * 100) / 100;
}

function computeLocalCouponDiscount(subtotal, coupon) {
  if (!coupon || !subtotal) return 0;
  if (coupon.minOrder && subtotal < Number(coupon.minOrder)) return 0;
  if (coupon.type === 'percent') {
    const raw = Math.round((subtotal * Number(coupon.value || 0)) / 100);
    return coupon.maxDiscount ? Math.min(raw, Number(coupon.maxDiscount)) : raw;
  }
  if (coupon.type === 'fixed') {
    return Math.min(subtotal, Math.round(Number(coupon.value || 0)));
  }
  return Math.min(subtotal, Math.round(Number(coupon.discount || 0)));
}

function cartTotals() {
  const subtotal = Math.round(
    APP.cart.reduce((s, it) => s + cartItemUnit(it) * Number(it.qty || 0), 0)
  );
  const discount = computeLocalCouponDiscount(subtotal, APP.coupon);
  const afterDiscount = Math.max(0, subtotal - discount);
  const totalKg = cartWeightTotal();
  const shipCfg = (APP.db && APP.db.site && APP.db.site.shipping) || { free_over: 5000000, flat_cost: 89000 };
  const freeShip = afterDiscount >= shipCfg.free_over || subtotal === 0;
  const shipCost = freeShip ? 0 : shipCfg.flat_cost;
  return {
    subtotal,
    discount,
    couponCode: discount > 0 && APP.coupon ? APP.coupon.code : '',
    afterDiscount,
    totalKg,
    freeShip,
    freeOver: shipCfg.free_over,
    shipCost,
    grand: Math.round(afterDiscount + shipCost),
  };
}

function updateCartBadge() {
  const count = APP.cart.length;
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = fmt(count);
    el.classList.toggle('is-empty', count === 0);
  });
}

function addToCart(id, qty, tier, openDrawer = true, opts = {}) {
  const p = byId(id);
  if (!p) return;
  tier = tier || APP.tier;
  const minQ = tierMin(tier);
  const resolvedQty = qty == null ? defaultQtyForTier(tier) : Math.max(minQ, Number(qty) || minQ);
  const variantDelta = Math.max(0, Number(opts.variantDelta || 0));
  const variantLabel = String(opts.variantLabel || '').trim();

  const same = APP.cart.find(
    i => !isCustomCartItem(i) && i.id === id && i.tier === tier && String(i.variantLabel || '') === variantLabel
  );
  if (same) same.qty = Math.round((same.qty + resolvedQty) * 100) / 100;
  else APP.cart.push({ id, tier, qty: resolvedQty, variantDelta, variantLabel });

  saveCart();
  toast(`«${p.name}» (${fmt(resolvedQty)} کیلو · ${tierLabel(tier)}) به سبد اضافه شد`);
  document.dispatchEvent(new CustomEvent('cart:changed'));
  if (openDrawer) openCartDrawer();
}

function addCustomToCart(item, openDrawer = true) {
  if (!item || !item.kind || !item.unitPrice) return;
  const entry = {
    id: item.id || `${item.kind}-${Date.now()}`,
    kind: item.kind,
    name: String(item.name || 'بسته سفارشی مغزدانه').trim(),
    qty: Math.max(1, Math.round(Number(item.qty || 1))),
    tier: 'retail',
    unitPrice: Math.round(Number(item.unitPrice)),
    weightKg: Number(item.weightKg || 0.5),
    variantLabel: String(item.variantLabel || '').trim(),
    img: item.img || 'assets/img/maghz-pistachio-akbari.jpg',
  };
  APP.cart.push(entry);
  saveCart();
  toast(`«${entry.name}» به سبد خرید اضافه شد`);
  document.dispatchEvent(new CustomEvent('cart:changed'));
  if (openDrawer) openCartDrawer();
}

function setCartItemQty(idx, nextQty) {
  const item = APP.cart[idx];
  if (!item) return;
  if (isCustomCartItem(item)) {
    const clamped = Math.max(1, Math.round(Number(nextQty) || 1));
    item.qty = clamped;
  } else {
    const minQ = tierMin(item.tier);
    const clamped = Math.max(minQ, Math.round(Number(nextQty) * 100) / 100);
    item.qty = isNaN(clamped) ? minQ : clamped;
  }
  saveCart();
  document.dispatchEvent(new CustomEvent('cart:changed'));
}

function upgradeCartItemTier(idx, newTier) {
  const item = APP.cart[idx];
  if (!item || isCustomCartItem(item)) return;
  const minQ = tierMin(newTier);
  item.tier = newTier;
  if (item.qty < minQ) item.qty = minQ;
  saveCart();
  toast(`پله کالا به «${tierLabel(newTier)}» ارتقا یافت`);
  document.dispatchEvent(new CustomEvent('cart:changed'));
}

function removeFromCart(idx) {
  APP.cart.splice(idx, 1);
  saveCart();
  document.dispatchEvent(new CustomEvent('cart:changed'));
}

/* ---------- Slide-Over Cart Drawer ---------- */
function ensureCartDrawer() {
  if (document.getElementById('cart-drawer')) return;
  document.body.insertAdjacentHTML(
    'beforeend',
    `
    <div class="drawer-backdrop" id="drawer-backdrop"></div>
    <aside class="cart-drawer" id="cart-drawer" aria-label="سبد خرید" aria-hidden="true">
      <div class="drawer-head">
        <h3>${icon('cart')} سبد خرید <span class="cart-count" style="background:rgba(78,200,125,0.16);color:var(--c-primary-light)">۰</span></h3>
        <button type="button" class="drawer-close" id="drawer-close" aria-label="بستن سبد خرید">${icon('close')}</button>
      </div>
      <div class="drawer-body" id="drawer-body"></div>
      <div class="drawer-foot" id="drawer-foot"></div>
    </aside>`
  );
  document.getElementById('drawer-backdrop').addEventListener('click', closeCartDrawer);
  document.getElementById('drawer-close').addEventListener('click', closeCartDrawer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCartDrawer();
  });
}

function openCartDrawer() {
  ensureCartDrawer();
  renderCartDrawer();
  document.getElementById('drawer-backdrop').classList.add('open');
  const d = document.getElementById('cart-drawer');
  d.classList.add('open');
  d.setAttribute('aria-hidden', 'false');
  if (typeof window._mgzDockHighlight === 'function') {
    window._mgzDockHighlight('mnav-cart');
  }
}

function closeCartDrawer() {
  const b = document.getElementById('drawer-backdrop');
  const d = document.getElementById('cart-drawer');
  if (b) b.classList.remove('open');
  if (d) {
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
  }
  if (typeof window._mgzDockRestore === 'function') {
    window._mgzDockRestore();
  }
}

function renderCartDrawer() {
  const body = document.getElementById('drawer-body');
  const foot = document.getElementById('drawer-foot');
  if (!body || !foot || !APP.db) return;

  if (!APP.cart.length) {
    body.innerHTML = `
      <div class="empty" style="margin-top:24px">
        <div class="big">${icon('cart')}</div>
        <p style="color:#fff;font-weight:800">سبد خرید شما خالی است</p>
        <p style="font-size:var(--fs-xs);margin-top:6px">از ۲۵۰ گرم خانگی تا ۲۵ کیلو عمده انتخاب کنید.</p>
        <a class="btn btn-primary btn-sm" href="catalog.html" style="margin-top:16px">مشاهده فروشگاه</a>
      </div>`;
    foot.innerHTML = '';
    return;
  }

  body.innerHTML = APP.cart
    .map((it, idx) => {
      const meta = cartItemMeta(it);
      if (!meta) return '';
      const unit = cartItemUnit(it);
      const custom = isCustomCartItem(it);
      const p = custom ? null : byId(it.id);
      const step = custom ? 1 : it.tier === 'wholesale' ? 5 : it.tier === 'semi' ? 1 : 0.25;
      const minQ = custom ? 1 : tierMin(it.tier);
      let upgradeHtml = '';
      if (p && it.tier === 'retail' && it.qty >= 3) {
        const savePct = Math.round((1 - p.prices.semi / p.prices.retail) * 100);
        upgradeHtml = `<div class="tier-upgrade-tip"><span>با ۵ کیلو وارد نیم‌عمده شوید (٪${fmt(savePct)} ارزان‌تر)</span><button type="button" data-d-upg="${idx}" data-to="semi">ارتقا به نیم‌عمده</button></div>`;
      } else if (p && it.tier === 'semi' && it.qty >= 18) {
        const savePct = Math.round((1 - p.prices.wholesale / p.prices.retail) * 100);
        upgradeHtml = `<div class="tier-upgrade-tip"><span>با ۲۵ کیلو وارد عمده شوید (٪${fmt(savePct)} ارزان‌تر)</span><button type="button" data-d-upg="${idx}" data-to="wholesale">ارتقا به عمده</button></div>`;
      }
      const titleHref = custom ? (it.kind === 'gift-box' ? 'gifts.html' : 'wholesale.html') : `product.html?id=${encodeURIComponent(it.id)}`;
      return `
        <div class="drawer-item">
          <img src="${esc(safeImgUrl(meta.img))}" alt="${esc(meta.name)}" referrerpolicy="no-referrer" onerror="mgzImgFallback(this,'${esc(meta.name)}')">
          <div>
            <div class="drawer-item-title"><a href="${titleHref}">${esc(meta.name)}</a></div>
            <div class="drawer-item-meta">
              ${custom ? `${it.kind === 'gift-box' ? 'جعبه هدیه سفارشی' : 'بسته نمونه ۵ گرید'} · ${fmt(unit)} ت` : `${tierLabel(it.tier)} · ${fmt(unit)} ت/کیلو${meta.source === 'vendor' ? ' · ' + esc(meta.vendorName) : ''}`}
            </div>
            ${it.variantLabel ? `<div class="drawer-item-meta" style="color:var(--c-accent-light)">${esc(it.variantLabel)}</div>` : ''}
            <div class="drawer-item-bar">
              <div class="drawer-qty">
                <button type="button" data-d-dec="${idx}" data-step="${step}" aria-label="کاهش" ${it.qty <= minQ ? 'disabled style="opacity:0.35"' : ''}>−</button>
                <span>${fmt(it.qty)} ${meta.unitLabel}</span>
                <button type="button" data-d-inc="${idx}" data-step="${step}" aria-label="افزایش">+</button>
              </div>
              <strong class="num" style="font-size:var(--fs-sm);color:var(--c-primary-light)">${fmt(Math.round(unit * it.qty))} ت</strong>
              <button type="button" class="rm-btn" data-d-rm="${idx}" aria-label="حذف کالا">${icon('trash')}</button>
            </div>
            ${upgradeHtml}
          </div>
        </div>`;
    })
    .join('');

  body.querySelectorAll('[data-d-dec]').forEach(b => {
    b.onclick = () => setCartItemQty(+b.dataset.dDec, APP.cart[+b.dataset.dDec].qty - parseFloat(b.dataset.step));
  });
  body.querySelectorAll('[data-d-inc]').forEach(b => {
    b.onclick = () => setCartItemQty(+b.dataset.dInc, APP.cart[+b.dataset.dInc].qty + parseFloat(b.dataset.step));
  });
  body.querySelectorAll('[data-d-rm]').forEach(b => {
    b.onclick = () => removeFromCart(+b.dataset.dRm);
  });
  body.querySelectorAll('[data-d-upg]').forEach(b => {
    b.onclick = () => upgradeCartItemTier(+b.dataset.dUpg, b.dataset.to);
  });

  const t = cartTotals();
  const pct = Math.min(100, Math.round((t.afterDiscount / Math.max(1, t.freeOver)) * 100));
  foot.innerHTML = `
    <div style="margin-bottom:12px">
      <div class="sum-row" style="padding:3px 0;font-size:var(--fs-xs)">
        <span>${t.freeShip ? 'ارسال رایگان فعال شد' : `${fmt(t.freeOver - t.afterDiscount)} تومان تا ارسال رایگان`}</span>
        <span>${fmt(t.totalKg)} کیلوگرم</span>
      </div>
      <div class="ship-progress"><i style="width:${pct}%"></i></div>
    </div>
    ${t.discount > 0 ? `<div class="sum-row" style="padding:4px 0;font-size:var(--fs-xs);color:var(--c-primary-light)"><span>کد تخفیف (${esc(t.couponCode)})</span><span>− ${faToman(t.discount)}</span></div>` : ''}
    <div class="sum-row total" style="margin-top:0;padding-top:10px">
      <span>جمع قابل پرداخت</span>
      <span>${faToman(t.grand)}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
      <a class="btn btn-primary" href="checkout.html">تسویه‌حساب</a>
      <a class="btn btn-outline" href="cart.html">سبد کامل</a>
    </div>`;
}

/* ---------- Live Tier Selection ---------- */
function setTier(t) {
  APP.tier = t;
  localStorage.setItem('maghzdaneh_tier', t);
  document.querySelectorAll('[data-tier-switcher]').forEach(el => renderTierSwitcher(el));
  const topLabel = document.getElementById('top-tier-name');
  if (topLabel) topLabel.textContent = tierLabel(t);
  document.dispatchEvent(new CustomEvent('tier:changed', { detail: { tier: t } }));
}

function renderTierSwitcher(container) {
  if (!container || !APP.db) return;
  container.setAttribute('data-tier-switcher', '1');
  container.innerHTML = `
    <div class="tier-bar" role="tablist" aria-label="انتخاب پله خرید">
      ${APP.db.tiers
        .map(
          t => `
        <button type="button" role="tab" aria-selected="${APP.tier === t.id}" class="tier-tab ${APP.tier === t.id ? 'active' : ''}" data-set-tier="${t.id}">
          <span>${esc(t.label)}</span>
          <small>(${t.id === 'retail' ? '۲۵۰ گرم+' : fmt(t.min) + ' کیلو+'})</small>
        </button>`
        )
        .join('')}
    </div>`;
  container.querySelectorAll('[data-set-tier]').forEach(btn => {
    btn.onclick = () => {
      setTier(btn.dataset.setTier);
      toast(`قیمت‌ها روی پله «${tierLabel(btn.dataset.setTier)}» تنظیم شد`);
    };
  });
}

/* ---------- Stars & Price Date ---------- */
function starsHtml(r) {
  const full = Math.round(Number(r));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function priceDateStr() {
  try {
    return new Date(APP.db.site.price_date).toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

/* ---------- Shared 3-Zone Header & Organized 4-Column Footer ---------- */
function updateHeaderAccountState() {
  const accLink = document.getElementById('nav-account-link');
  const accLabel = document.getElementById('nav-account-label');
  const admLink = document.getElementById('nav-admin-link');
  const activeUser = APP.serverUser || APP.user;
  if (accLink && accLabel) {
    if (activeUser) {
      const display = activeUser.fullName || activeUser.displayName || activeUser.username || 'حساب من';
      accLabel.textContent = display.split(' ')[0];
      accLink.classList.add('is-signed-in');
    } else {
      accLabel.textContent = 'ورود / حساب';
      accLink.classList.remove('is-signed-in');
    }
  }
  if (admLink) {
    admLink.hidden = !APP.isAdmin && !APP.serverAdmin;
  }
}

/* ---------- Smart Back Navigation (Browser History + Logical Parent Fallback) ---------- */
const PARENT_PAGE_MAP = {
  product: 'catalog.html',
  checkout: 'cart.html',
  cart: 'catalog.html',
  success: 'catalog.html',
  gifts: 'catalog.html',
  seller: 'vendors.html',
  vendors: 'catalog.html',
  supply: 'wholesale.html',
  wholesale: 'catalog.html',
  admin: 'account.html',
  account: 'catalog.html',
  catalog: 'index.html',
  articles: 'catalog.html',
  about: 'catalog.html',
  faq: 'about.html',
  contact: 'about.html',
  brand: 'about.html',
  legal: 'catalog.html',
};

function goBackSmart(activePage) {
  try {
    const ref = document.referrer || '';
    if (window.history.length > 1 && ref && ref.startsWith(window.location.origin) && ref !== window.location.href) {
      window.history.back();
      return;
    }
  } catch {
    // fallback below
  }
  window.location.href = PARENT_PAGE_MAP[activePage] || 'catalog.html';
}

/* ---------- PWA Subsystem (Service Worker, Install Prompt, iOS Guide & Offline Bar) ---------- */
APP.pwa = {
  deferredPrompt: null,
  initialized: false,
  isStandalone: false,
  isIos: false,
};

function isAppStandalone() {
  return Boolean(
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true
  );
}

function updatePwaInstallButtons() {
  const standalone = isAppStandalone();
  APP.pwa.isStandalone = standalone;
  document.querySelectorAll('[data-pwa-install]').forEach(btn => {
    btn.hidden = standalone;
  });
}

function openPwaInstallModal() {
  let back = document.getElementById('mgz-pwa-modal');
  if (!back) {
    back = document.createElement('div');
    back.id = 'mgz-pwa-modal';
    back.className = 'modal-back';
    document.body.appendChild(back);
  }
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  back.innerHTML = `
    <div class="modal pwa-install-modal" role="dialog" aria-modal="true" aria-label="نصب وب‌اپلیکیشن مغزدانه">
      <div class="modal-head-row">
        <div class="pwa-modal-brand">
          <img src="assets/img/pwa-192x192.png" alt="لوگوی اپلیکیشن مغزدانه" width="54" height="54">
          <div>
            <h3>نصب وب‌اپلیکیشن مغزدانه</h3>
            <p>دسترسی سریع، تمام‌صفحه و آفلاین روی صفحهٔ اصلی گوشی و دسکتاپ</p>
          </div>
        </div>
        <button type="button" class="drawer-close" id="pwa-modal-close" aria-label="بستن">${icon('close')}</button>
      </div>
      <div class="pwa-steps">
        ${
          isIos
            ? `
          <div class="pwa-step"><span>۱</span><div>در نوار پایین مرورگر <strong>Safari</strong> روی دکمهٔ اشتراک‌گذاری <strong>(Share)</strong> بزنید.</div></div>
          <div class="pwa-step"><span>۲</span><div>گزینهٔ <strong>Add to Home Screen</strong> (افزودن به صفحهٔ اصلی) را انتخاب کنید.</div></div>
          <div class="pwa-step"><span>۳</span><div>در بالا سمت راست روی <strong>Add</strong> بزنید تا آیکون و نام <strong>مغزدانه</strong> روی گوشی نصب شود.</div></div>`
            : `
          <div class="pwa-step"><span>۱</span><div>اگر پنجرهٔ نصب خودکار باز نشد، منوی مرورگر (<strong>⋮</strong> یا آیکون نصب در نوار آدرس) را باز کنید.</div></div>
          <div class="pwa-step"><span>۲</span><div>گزینهٔ <strong>نصب اپلیکیشن (Install App)</strong> یا <strong>افزودن به صفحهٔ اصلی</strong> را بزنید.</div></div>
          <div class="pwa-step"><span>۳</span><div>پس از تأیید، وب‌اپلیکیشن <strong>مغزدانه</strong> با لوگو و نام رسمی روی دستگاه شما اجرا می‌شود.</div></div>`
        }
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:18px">
        <button type="button" class="btn btn-primary btn-sm" id="pwa-modal-ok">متوجه شدم</button>
      </div>
    </div>`;
  back.classList.add('open');
  back.onclick = e => {
    if (e.target === back) back.classList.remove('open');
  };
  back.querySelector('#pwa-modal-close').onclick = () => back.classList.remove('open');
  back.querySelector('#pwa-modal-ok').onclick = () => back.classList.remove('open');
}

async function promptPwaInstall() {
  if (isAppStandalone()) {
    toast('اپلیکیشن مغزدانه هم‌اکنون نصب و فعال است');
    return;
  }
  if (APP.pwa.deferredPrompt) {
    try {
      const ev = APP.pwa.deferredPrompt;
      APP.pwa.deferredPrompt = null;
      await ev.prompt();
      const choice = await ev.userChoice;
      if (choice && choice.outcome === 'accepted') {
        toast('در حال نصب وب‌اپلیکیشن مغزدانه...');
        updatePwaInstallButtons();
      }
      return;
    } catch {
      // Fallback to clear Persian install guide
    }
  }
  openPwaInstallModal();
}

function updateOfflineBanner() {
  let bar = document.getElementById('pwa-offline-bar');
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pwa-offline-bar';
      bar.className = 'pwa-offline-bar';
      bar.setAttribute('role', 'status');
      bar.innerHTML = `${icon('wifiOff')} <span>اتصال اینترنت برقرار نیست — در حال نمایش نسخهٔ آفلاین مغزدانه</span>`;
      document.body.prepend(bar);
    }
    bar.hidden = false;
  } else if (bar) {
    bar.hidden = true;
  }
}

function initPWA() {
  if (APP.pwa.initialized) {
    updatePwaInstallButtons();
    return;
  }
  APP.pwa.initialized = true;
  APP.pwa.isStandalone = isAppStandalone();
  APP.pwa.isIos = /iphone|ipad|ipod/i.test(navigator.userAgent || '');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    APP.pwa.deferredPrompt = e;
    updatePwaInstallButtons();
  });

  window.addEventListener('appinstalled', () => {
    APP.pwa.deferredPrompt = null;
    updatePwaInstallButtons();
    toast('وب‌اپلیکیشن مغزدانه با موفقیت نصب شد');
  });

  window.addEventListener('offline', () => {
    updateOfflineBanner();
    toast('اتصال اینترنت قطع شد — حالت آفلاین فعال است');
  });
  window.addEventListener('online', () => {
    updateOfflineBanner();
    toast('اتصال اینترنت دوباره برقرار شد');
  });

  updateOfflineBanner();
  updatePwaInstallButtons();
}

function buildMobileAppNav(active) {
  if (document.body.classList.contains('prologue-page')) return;
  let nav = document.getElementById('mobile-app-nav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.id = 'mobile-app-nav';
    nav.className = 'mobile-app-nav';
    nav.setAttribute('aria-label', 'ناوبری سریع اپلیکیشن مغزدانه');
    document.body.appendChild(nav);
  }
  const shopAct = active === 'catalog' || active === 'product' || active === 'gifts';
  const vendorAct = active === 'vendors' || active === 'seller';
  const cartAct = active === 'cart' || active === 'checkout';
  const accAct = active === 'account' || active === 'admin';
  const defaultIdx = vendorAct ? 1 : cartAct ? 3 : accAct ? 4 : 2;
  const defaultTone = vendorAct ? 'saffron' : cartAct ? 'ruby' : accAct ? 'jade' : 'emerald';

  // Bespoke miniature pistachio-kernel emblem echoing logo.svg for the Storefront orb
  const crownEmblem = `
    <svg class="mnav-crown-svg" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="mnavShellG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FFF0B8"/>
          <stop offset="55%" stop-color="#D4AF37"/>
          <stop offset="100%" stop-color="#9A721A"/>
        </linearGradient>
        <linearGradient id="mnavKernG" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stop-color="#A6FFCA"/>
          <stop offset="55%" stop-color="#35C672"/>
          <stop offset="100%" stop-color="#146338"/>
        </linearGradient>
      </defs>
      <path d="M20 7.2C24.5 10.4 27 15.5 26 21.8C25 27 22.5 31 20 32.8C17.5 31 15 27 14 21.8C13 15.5 15.5 10.4 20 7.2Z" fill="url(#mnavKernG)"/>
      <path d="M20 11V29" stroke="#E0FFEC" stroke-opacity="0.55" stroke-width="1.15" stroke-linecap="round"/>
      <path d="M12.2 11C8.4 15.1 8 22.9 12 28.6C14.2 31.8 17.2 33.6 19.6 34.1C16 29.4 14.2 22.5 14.1 15C14 13.4 13.4 12 12.2 11Z" fill="url(#mnavShellG)"/>
      <path d="M27.8 11C31.6 15.1 32 22.9 28 28.6C25.8 31.8 22.8 33.6 20.4 34.1C24 29.4 25.8 22.5 25.9 15C26 13.4 26.6 12 27.8 11Z" fill="url(#mnavShellG)"/>
    </svg>`;

  nav.innerHTML = `
    <div class="mnav-dock-inner" id="mnav-dock-inner" data-active-tone="${defaultTone}" style="--halo-idx:${defaultIdx}">
      <div class="mnav-glass-bg" aria-hidden="true">
        <span class="mnav-glass-halo"></span>
      </div>

      <button type="button" class="mnav-item" id="mnav-back" data-idx="0" data-tone="amber" aria-label="بازگشت به صفحه قبل">
        <span class="mnav-orb-wrap">
          <span class="mnav-orb-bezel">
            <span class="mnav-orb-core">${icon('arrowRight')}</span>
          </span>
        </span>
        <span class="mnav-label">بازگشت</span>
        <i class="mnav-gem" aria-hidden="true"></i>
      </button>

      <a class="mnav-item ${vendorAct ? 'active' : ''}" id="mnav-vendors" data-idx="1" data-tone="saffron" href="vendors.html" ${vendorAct ? 'aria-current="page"' : ''}>
        <span class="mnav-orb-wrap">
          <span class="mnav-orb-bezel">
            <span class="mnav-orb-core">${icon('store')}</span>
          </span>
        </span>
        <span class="mnav-label">غرفه‌ها</span>
        <i class="mnav-gem" aria-hidden="true"></i>
      </a>

      <a class="mnav-item mnav-brand-tab ${shopAct || (!vendorAct && !cartAct && !accAct) ? 'active' : ''}" id="mnav-shop" data-idx="2" data-tone="emerald" href="catalog.html" ${shopAct ? 'aria-current="page"' : ''} aria-label="فروشگاه مرکزی مغزدانه">
        <span class="mnav-orb-wrap">
          <span class="mnav-orb-bezel">
            <span class="mnav-orb-core">${crownEmblem}</span>
          </span>
        </span>
        <span class="mnav-label">فروشگاه</span>
        <i class="mnav-gem" aria-hidden="true"></i>
      </a>

      <button type="button" class="mnav-item ${cartAct ? 'active' : ''}" id="mnav-cart" data-idx="3" data-tone="ruby" aria-label="باز کردن سبد خرید">
        <span class="mnav-orb-wrap">
          <span class="mnav-orb-bezel">
            <span class="mnav-orb-core">${icon('cart')}</span>
          </span>
          <b class="cart-count mnav-badge">۰</b>
        </span>
        <span class="mnav-label">سبد خرید</span>
        <i class="mnav-gem" aria-hidden="true"></i>
      </button>

      <a class="mnav-item ${accAct ? 'active' : ''}" id="mnav-account" data-idx="4" data-tone="jade" href="account.html" ${accAct ? 'aria-current="page"' : ''}>
        <span class="mnav-orb-wrap">
          <span class="mnav-orb-bezel">
            <span class="mnav-orb-core">${icon('user')}</span>
          </span>
        </span>
        <span class="mnav-label">حساب من</span>
        <i class="mnav-gem" aria-hidden="true"></i>
      </a>
    </div>`;

  const dock = nav.querySelector('#mnav-dock-inner');
  const items = Array.from(nav.querySelectorAll('.mnav-item'));
  const defaultEl = items[defaultIdx] || items[2];

  function activateItem(targetEl) {
    if (!targetEl || !dock) return;
    items.forEach(it => it.classList.remove('active', 'is-popping'));
    targetEl.classList.add('active', 'is-popping');
    dock.dataset.activeTone = targetEl.dataset.tone || 'emerald';
    dock.style.setProperty('--halo-idx', targetEl.dataset.idx || '2');
  }

  window._mgzDockHighlight = id => {
    const el = document.getElementById(id);
    if (el) activateItem(el);
  };
  window._mgzDockRestore = () => {
    activateItem(defaultEl);
  };

  // Interactive spring pop-up + color bloom on tap before route transition
  nav.querySelector('#mnav-back').addEventListener('click', e => {
    activateItem(e.currentTarget);
    setTimeout(() => goBackSmart(active), 165);
  });

  nav.querySelector('#mnav-cart').addEventListener('click', e => {
    activateItem(e.currentTarget);
    openCartDrawer();
  });

  nav.querySelectorAll('a.mnav-item').forEach(link => {
    link.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const href = link.getAttribute('href');
      if (!href) return;
      e.preventDefault();
      activateItem(link);
      setTimeout(() => {
        window.location.href = href;
      }, 175);
    });
  });

  updateCartBadge();
}

function buildHeader(active) {
  const el = document.getElementById('site-header');
  if (!el) return;
  const siteName = (APP.db && APP.db.site && APP.db.site.name) || 'مغزدانه';
  const shopActive = active === 'catalog' || active === 'gifts';
  const vendorsActive = active === 'vendors' || active === 'seller';
  const wholesaleActive = active === 'wholesale' || active === 'supply';
  const aboutActive = active === 'about' || active === 'faq' || active === 'contact';

  el.innerHTML = `
  <div class="container header-row">
    <div class="header-start">
      <button type="button" class="back-nav-btn" id="hdr-back-btn" aria-label="بازگشت به صفحه قبل" title="بازگشت به صفحه قبل">
        ${icon('arrowRight')}
        <span class="back-btn-text">بازگشت</span>
      </button>
      <a class="brand" href="index.html" aria-label="${esc(siteName)} — صفحه ورود سه‌بعدی">
        <img src="assets/img/logo.svg?v=14" alt="" width="34" height="34">
        <span class="brand-name">${esc(siteName)}</span>
      </a>
    </div>
    <nav class="main-nav" id="main-nav" aria-label="ناوبری اصلی سایت">
      <div class="nav-item has-sub">
        <a class="nav-link ${shopActive || active === 'mix' || active === 'trace' ? 'active' : ''}" href="catalog.html">فروشگاه</a>
        <div class="nav-dropdown" role="menu">
          <a href="catalog.html" class="${active === 'catalog' ? 'active' : ''}">فروشگاه مرکزی و مشاور انتخاب گرید</a>
          <a href="mix.html" class="${active === 'mix' ? 'active' : ''}">میکس‌ساز اختصاصی آجیل و چهارمغز</a>
          <a href="gifts.html" class="${active === 'gifts' ? 'active' : ''}">سازندهٔ جعبه هدیه و پک سازمانی</a>
          <a href="trace.html" class="${active === 'trace' ? 'active' : ''}">استعلام اصالت بار و شناسنامه QR</a>
        </div>
      </div>

      <div class="nav-item has-sub">
        <a class="nav-link ${vendorsActive ? 'active' : ''}" href="vendors.html">غرفه‌های فروشندگان</a>
        <div class="nav-dropdown" role="menu">
          <a href="vendors.html" class="${active === 'vendors' ? 'active' : ''}">بازارچهٔ غرفه‌های فروشندگان (خریداران)</a>
          <a href="seller.html" class="${active === 'seller' ? 'active' : ''}">پنل مدیریت غرفهٔ من (فروشندگان)</a>
        </div>
      </div>

      <div class="nav-item has-sub">
        <a class="nav-link ${wholesaleActive || active === 'export' ? 'active' : ''}" href="wholesale.html">خرید عمده</a>
        <div class="nav-dropdown" role="menu">
          <a href="wholesale.html" class="${active === 'wholesale' ? 'active' : ''}">نرخ روز، نمودار بازار و تالار استعلام عمده (RFQ)</a>
          <a href="export.html" class="${active === 'export' ? 'active' : ''}">درگاه صادراتی سه‌زبانه (FA / EN / AR)</a>
          <a href="supply.html" class="${active === 'supply' ? 'active' : ''}">فروش نقدی بار عمده به مغزدانه</a>
        </div>
      </div>

      <a class="nav-link ${active === 'articles' ? 'active' : ''}" href="articles.html">مجله</a>

      <div class="nav-item has-sub">
        <a class="nav-link ${aboutActive || active === 'track' ? 'active' : ''}" href="about.html">پشتیبانی و اصالت</a>
        <div class="nav-dropdown" role="menu">
          <a href="track.html" class="${active === 'track' ? 'active' : ''}">پیگیری سریع سفارش بدون ورود</a>
          <a href="trace.html" class="${active === 'trace' ? 'active' : ''}">استعلام اصالت آزمایشگاهی QR</a>
          <a href="about.html" class="${active === 'about' ? 'active' : ''}">داستان و اصالت مغزدانه</a>
          <a href="faq.html" class="${active === 'faq' ? 'active' : ''}">سؤالات متداول</a>
          <a href="contact.html" class="${active === 'contact' ? 'active' : ''}">تماس و پشتیبانی</a>
        </div>
      </div>

      <button type="button" class="nav-install-mobile" data-pwa-install>
        ${icon('download')} نصب وب‌اپلیکیشن مغزدانه
      </button>
    </nav>
    <div class="header-actions">
      <button type="button" class="pwa-install-btn" id="hdr-install-btn" data-pwa-install aria-label="نصب وب‌اپلیکیشن مغزدانه" title="نصب وب‌اپلیکیشن مغزدانه">
        ${icon('download')}
        <span class="install-label-text">نصب اپ</span>
      </button>
      <a href="admin.html" id="nav-admin-link" class="header-adm-btn ${active === 'admin' ? 'active' : ''}" hidden>مدیریت</a>
      <a href="account.html" id="nav-account-link" class="account-btn ${active === 'account' ? 'active' : ''}" aria-label="حساب کاربری و کیف پول">
        <span id="nav-account-label">ورود / حساب</span>
      </a>
      <button type="button" class="cart-btn" id="open-cart-drawer" aria-label="باز کردن سبد خرید">
        ${icon('cart')}
        <span class="cart-label-text">سبد خرید</span>
        <span class="cart-count">۰</span>
      </button>
      <button type="button" class="menu-toggle" id="menu-toggle" aria-label="باز و بسته کردن منو">${icon('menu')}</button>
    </div>
  </div>`;

  const backBtn = document.getElementById('hdr-back-btn');
  if (backBtn) backBtn.addEventListener('click', () => goBackSmart(active));

  const tg = document.getElementById('menu-toggle');
  tg.addEventListener('click', () => {
    const nav = document.getElementById('main-nav');
    nav.classList.toggle('open');
    tg.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
  });
  document.getElementById('open-cart-drawer').addEventListener('click', openCartDrawer);
  el.querySelectorAll('[data-pwa-install]').forEach(btn => {
    btn.addEventListener('click', promptPwaInstall);
  });

  ensureCartDrawer();
  updateCartBadge();
  updateHeaderAccountState();
  updatePwaInstallButtons();
  renderCompareBar();

  if (window.MgzCloud) {
    window.MgzCloud.onAuth(async u => {
      APP.user = u;
      if (u) {
        const isAdm = await window.MgzCloud.checkIsAdmin(u);
        APP.isAdmin = isAdm || Boolean(APP.serverAdmin);
      } else {
        APP.isAdmin = Boolean(APP.serverAdmin);
      }
      updateHeaderAccountState();
      document.dispatchEvent(new CustomEvent('mgz:auth', { detail: { user: u, serverUser: APP.serverUser, isAdmin: APP.isAdmin } }));
    });
  }
}

function buildFooter() {
  const db = APP.db;
  const el = document.getElementById('site-footer');
  if (!el) return;
  const siteName = (db.site && db.site.name) || 'مغزدانه';
  el.innerHTML = `
  <div class="container footer-grid">
    <div>
      <div class="footer-brand">
        <img src="assets/img/logo.svg?v=14" alt="" width="42" height="42">
        <span>${esc(siteName)}</span>
      </div>
      <p>${esc(db.site.description)}</p>
      <div class="social-row">
        <a href="${esc(db.site.social.instagram)}" target="_blank" rel="noopener" aria-label="اینستاگرام">${icon('instagram')}</a>
        <a href="${esc(db.site.social.telegram)}" target="_blank" rel="noopener" aria-label="تلگرام">${icon('telegram')}</a>
        <a href="${esc(db.site.social.whatsapp)}" target="_blank" rel="noopener" aria-label="واتس‌اپ">${icon('whatsapp')}</a>
      </div>
      <button type="button" class="footer-pwa-btn" data-pwa-install>
        ${icon('download')} نصب وب‌اپلیکیشن ${esc(siteName)}
      </button>
    </div>
    <div>
      <h4>فروشگاه و ابزارهای اختصاصی</h4>
      <ul>
        <li><a href="catalog.html">فروشگاه مرکزی مغزدانه</a></li>
        <li><a href="mix.html">میکس‌ساز اختصاصی آجیل و چهارمغز</a></li>
        <li><a href="gifts.html">سازندهٔ جعبه هدیه و پک سازمانی</a></li>
        <li><a href="trace.html">استعلام اصالت و شناسنامه QR بار</a></li>
        ${db.categories.map(c => `<li><a href="catalog.html?cat=${encodeURIComponent(c.id)}">${esc(c.name)}</a></li>`).join('')}
      </ul>
    </div>
    <div>
      <h4>بازارچهٔ غرفه‌ها، عمده و صادرات</h4>
      <ul>
        <li><a href="vendors.html">بازارچهٔ غرفه‌های فروشندگان</a></li>
        <li><a href="seller.html">پنل مدیریت غرفهٔ من (فروشندگان)</a></li>
        <li><a href="wholesale.html">نرخ روز، نمودار بازار و تالار عمده (RFQ)</a></li>
        <li><a href="export.html">درگاه صادراتی سه‌زبانه (FA / EN / AR)</a></li>
        <li><a href="supply.html">فروش نقدی بار عمده به مغزدانه</a></li>
        <li><a href="articles.html">مجله و مقالات تخصصی</a></li>
      </ul>
    </div>
    <div>
      <h4>پشتیبانی و حساب کاربری</h4>
      <ul>
        <li><a href="track.html">پیگیری سریع سفارش بدون ورود</a></li>
        <li><a href="account.html">حساب کاربری، کیف پول و دعوت دوستان</a></li>
        <li><a href="about.html">داستان و اصالت مغزدانه</a></li>
        <li><a href="faq.html">سؤالات متداول</a></li>
        <li><a href="contact.html">تماس با ما</a></li>
        <li><a href="admin.html">ورود به پنل مدیریت</a></li>
        <li>${icon('phone')} <span class="ltr">${esc(db.site.phone)}</span></li>
      </ul>
    </div>
  </div>
  <div class="footer-note">© ۱۴۰۵ ${esc(siteName)} — ${esc(db.site.tagline || 'بازار تخصصی مغز پسته، بادام و گردو')} · <a href="legal.html">قوانین و حریم خصوصی</a></div>`;

  el.querySelectorAll('[data-pwa-install]').forEach(btn => {
    btn.addEventListener('click', promptPwaInstall);
  });
  updatePwaInstallButtons();
}

/* ---------- Unified 3-Channel Clarity Guide (House vs. Vendor Stalls vs. Bulk Supply) ---------- */
function renderChannelGuideHtml(activeKey) {
  const channels = [
    {
      key: 'house',
      num: '۰۱',
      title: 'فروشگاه مرکزی مغزدانه',
      sub: 'خرید مستقیم از انبار رسمی مغزدانه',
      desc: 'بارهای سورت‌شده و برشته‌کاری‌شده در کارگاه مرکزی مغزدانه با گواهی رطوبت و تضمین اصالت.',
      href: 'catalog.html',
      cta: 'ورود به فروشگاه مرکزی',
    },
    {
      key: 'marketplace',
      num: '۰۲',
      title: 'بازارچهٔ غرفه‌های فروشندگان',
      sub: 'غرفه‌های مستقل باغداران + پنل مدیریت غرفه (یک سامانهٔ واحد)',
      desc: 'هر باغدار یا کارگاه می‌تواند یک غرفهٔ اختصاصی با نام و قیمت خودش در بازارچه باز کند. صفحهٔ «بازارچهٔ غرفه‌ها» نمای خریداران و «پنل مدیریت غرفهٔ من» میز کار خود فروشنده برای مدیریت همین غرفه است.',
      href: activeKey === 'seller' ? 'vendors.html' : 'seller.html',
      cta: activeKey === 'seller' ? 'مشاهده نمای بازارچه' : 'افتتاح یا مدیریت غرفهٔ من',
    },
    {
      key: 'supply',
      num: '۰۳',
      title: 'فروش نقدی بار عمده به مغزدانه',
      sub: 'تحویل یک‌جای محصول بدون نیاز به غرفه‌داری',
      desc: 'اگر باغدار یا عمده‌فروش هستید و قصد مدیریت غرفه ندارید، بارتان را یک‌جا به واحد تأمین مغزدانه بفروشید و پس از کارشناسی نقدی تسویه کنید.',
      href: 'supply.html',
      cta: 'ثبت پیشنهاد فروش نقدی بار',
    },
  ];
  return `
    <div class="channel-guide" aria-label="تفاوت سه مسیر خرید و فروش در مغزدانه">
      ${channels
        .map(
          ch => `
        <div class="channel-card ${activeKey === ch.key || (ch.key === 'marketplace' && (activeKey === 'vendors' || activeKey === 'seller')) ? 'is-current' : ''}">
          <div class="ch-head">
            <span class="ch-num">${ch.num}</span>
            <div>
              <h3>${ch.title}</h3>
              <small>${ch.sub}</small>
            </div>
          </div>
          <p>${ch.desc}</p>
          <a class="ch-link" href="${ch.href}">${ch.cta} ←</a>
        </div>`
        )
        .join('')}
    </div>`;
}

/* ---------- Smart Grade Comparator (Up to 3 Products Side-by-Side) ---------- */
function saveCompare() {
  localStorage.setItem('maghzdaneh_compare', JSON.stringify(APP.compare));
  renderCompareBar();
  document.querySelectorAll('[data-compare]').forEach(btn => {
    const active = APP.compare.includes(btn.dataset.compare);
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.textContent = active ? 'در مقایسه ✓' : 'مقایسه';
  });
}

function toggleCompare(id) {
  if (!byId(id)) return;
  const idx = APP.compare.indexOf(id);
  if (idx >= 0) {
    APP.compare.splice(idx, 1);
    saveCompare();
    toast('کالا از لیست مقایسه حذف شد');
    return;
  }
  if (APP.compare.length >= 3) {
    toast('حداکثر ۳ کالا به‌طور هم‌زمان قابل مقایسه است');
    return;
  }
  APP.compare.push(id);
  saveCompare();
  toast('کالا به لیست مقایسه اضافه شد');
}

function renderCompareBar() {
  let bar = document.getElementById('compare-bar');
  if (!APP.db || !APP.compare.length) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'compare-bar';
    bar.className = 'compare-bar';
    document.body.appendChild(bar);
  }
  const items = APP.compare.map(id => byId(id)).filter(Boolean);
  if (!items.length) {
    bar.remove();
    return;
  }
  bar.innerHTML = `
    <div class="compare-bar-items">
      ${items
        .map(
          p => `
        <div class="compare-chip">
          <img src="${esc(safeImgUrl(p.img))}" alt="">
          <span>${esc(p.name)}</span>
          <button type="button" data-cmp-rm="${esc(p.id)}" aria-label="حذف از مقایسه">×</button>
        </div>`
        )
        .join('')}
    </div>
    <div class="compare-bar-actions">
      <button type="button" class="btn btn-primary btn-sm" id="btn-open-compare">مقایسه کنار هم (${fmt(items.length)})</button>
      <button type="button" class="btn btn-outline btn-sm" id="btn-clear-compare">پاک کردن</button>
    </div>`;

  bar.querySelectorAll('[data-cmp-rm]').forEach(b => {
    b.onclick = () => toggleCompare(b.dataset.cmpRm);
  });
  bar.querySelector('#btn-open-compare').onclick = openCompareModal;
  bar.querySelector('#btn-clear-compare').onclick = () => {
    APP.compare = [];
    saveCompare();
  };
}

function openCompareModal() {
  const items = APP.compare.map(id => byId(id)).filter(Boolean);
  if (!items.length) return;
  let back = document.getElementById('mgz-compare-modal');
  if (!back) {
    back = document.createElement('div');
    back.id = 'mgz-compare-modal';
    back.className = 'modal-back';
    document.body.appendChild(back);
  }
  const rows = [
    { label: 'مبدأ و منطقه', fn: p => esc(p.origin || 'رفسنجان') },
    { label: 'درجه و گرید', fn: p => esc(p.grade || catName(p.category)) },
    { label: 'عرضه‌کننده', fn: p => (p.source === 'vendor' ? esc(p.vendorName) : 'فروشگاه مرکزی مغزدانه') },
    { label: 'قیمت خرده‌فروشی', fn: p => `<strong class="num">${faToman(p.prices.retail)}</strong>` },
    { label: 'قیمت نیم‌عمده (۵+ کیلو)', fn: p => `<strong class="num" style="color:var(--c-accent-light)">${faToman(p.prices.semi)}</strong>` },
    { label: 'قیمت عمده (۲۵+ کیلو)', fn: p => `<strong class="num" style="color:var(--c-primary-light)">${faToman(p.prices.wholesale)}</strong>` },
    {
      label: 'صرفه‌جویی عمده',
      fn: p => `٪${fmt(Math.round((1 - p.prices.wholesale / Math.max(1, p.prices.retail)) * 100))} کمتر از خرده`,
    },
    { label: 'مشخصات فنی', fn: p => (Array.isArray(p.specs) && p.specs.length ? p.specs.map(s => `• ${esc(s)}`).join('<br>') : '—') },
    { label: 'کاربرد پیشنهادی', fn: p => (Array.isArray(p.uses) && p.uses.length ? esc(p.uses.join('، ')) : '—') },
  ];

  back.innerHTML = `
    <div class="modal modal-wide" role="dialog" aria-label="مقایسه تخصصی گریدها">
      <div class="modal-head-row">
        <div>
          <h3>مقایسهٔ تخصصی گریدها و قیمت پلکانی</h3>
          <p style="font-size:var(--fs-xs);color:var(--c-text-soft)">تفاوت مبدأ، گرید، مشخصات فنی و قیمت در ۳ پله خرید</p>
        </div>
        <button type="button" class="drawer-close" id="cmp-close" aria-label="بستن">${icon('close')}</button>
      </div>
      <div class="table-wrap" style="margin-top:16px">
        <table class="shop compare-table">
          <thead>
            <tr>
              <th style="width:155px">شاخص مقایسه</th>
              ${items
                .map(
                  p => `
                <th>
                  <div class="cmp-col-head">
                    <img src="${esc(safeImgUrl(p.img))}" alt="">
                    <a href="product.html?id=${encodeURIComponent(p.id)}" style="color:#fff">${esc(p.name)}</a>
                  </div>
                </th>`
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                r => `
              <tr>
                <td style="font-weight:800;color:var(--c-accent-light)">${r.label}</td>
                ${items.map(p => `<td>${r.fn(p)}</td>`).join('')}
              </tr>`
              )
              .join('')}
            <tr>
              <td style="font-weight:800;color:var(--c-text-soft)">اقدام سریع</td>
              ${items
                .map(
                  p => `
                <td>
                  <button type="button" class="btn btn-primary btn-sm" data-cmp-add="${esc(p.id)}" style="width:100%">افزودن به سبد</button>
                </td>`
                )
                .join('')}
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
  back.classList.add('open');
  back.onclick = e => {
    if (e.target === back) back.classList.remove('open');
  };
  back.querySelector('#cmp-close').onclick = () => back.classList.remove('open');
  back.querySelectorAll('[data-cmp-add]').forEach(btn => {
    btn.onclick = () => {
      addToCart(btn.dataset.cmpAdd, null, APP.tier, true);
      back.classList.remove('open');
    };
  });
}

/* ---------- Official Printable Proforma / Tax Invoice Modal (A4 PDF via window.print) ---------- */
function openInvoiceModal(source) {
  const site = (APP.db && APP.db.site) || {
    name: 'مغزدانه',
    phone: '۰۳۴-۳۴۲۲۱۸۹۰',
    address: 'رفسنجان، بلوار ولیعصر · دفتر تهران، بازار بزرگ',
  };

  let docTitle = 'پیش‌فاکتور رسمی فروش';
  let docNumber = 'PF-' + Date.now().toString().slice(-6);
  let docDate = new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
  let buyerName = (APP.serverUser && APP.serverUser.fullName) || (APP.user && APP.user.displayName) || '';
  let buyerPhone = (APP.serverUser && APP.serverUser.phone) || '';
  let buyerAddress = (APP.serverUser && APP.serverUser.city) || '';
  let items = [];
  let subtotal = 0;
  let discount = 0;
  let couponCode = '';
  let shipCost = 0;

  if (source && (source.orderNumber || source.orderCode)) {
    docTitle = 'فاکتور رسمی فروش';
    docNumber = source.orderNumber || source.orderCode;
    docDate = source.createdAt
      ? new Date(source.createdAt).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })
      : docDate;
    buyerName = source.customerName || buyerName;
    buyerPhone = source.phone || source.customerPhone || buyerPhone;
    buyerAddress = [source.province, source.city, source.address].filter(Boolean).join(' — ');
    items = (source.items || []).map(it => ({
      name: it.name,
      variantLabel: it.variantLabel || '',
      tierLabel: it.kind ? 'بسته سفارشی' : tierLabel(it.tier),
      qty: it.qty,
      unitText: it.kind ? 'بسته' : 'کیلوگرم',
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal || Math.round(it.unitPrice * it.qty),
    }));
    subtotal = Number(source.subtotal || 0);
    discount = Number(source.discountAmount ?? source.discount ?? 0);
    couponCode = source.couponCode || '';
    shipCost = Number(source.shippingCost ?? source.shipCost ?? 0);
  } else if (source && Array.isArray(source.items)) {
    docTitle = source.title || 'پیش‌فاکتور رسمی فروش';
    items = source.items;
    subtotal = Number(source.subtotal || 0);
    discount = Number(source.discount || 0);
    couponCode = source.couponCode || '';
    shipCost = Number(source.shipCost || 0);
  } else {
    const totals = cartTotals();
    items = APP.cart
      .map(it => {
        const meta = cartItemMeta(it);
        if (!meta) return null;
        const u = cartItemUnit(it);
        return {
          name: meta.name,
          variantLabel: it.variantLabel || '',
          tierLabel: isCustomCartItem(it) ? 'بسته سفارشی' : tierLabel(it.tier),
          qty: it.qty,
          unitText: meta.unitLabel,
          unitPrice: u,
          lineTotal: Math.round(u * it.qty),
        };
      })
      .filter(Boolean);
    subtotal = totals.subtotal;
    discount = totals.discount;
    couponCode = totals.couponCode;
    shipCost = totals.shipCost;
  }

  if (!items.length) {
    toast('آیتمی برای صدور پیش‌فاکتور وجود ندارد');
    return;
  }

  let back = document.getElementById('mgz-invoice-modal');
  if (!back) {
    back = document.createElement('div');
    back.id = 'mgz-invoice-modal';
    back.className = 'modal-back invoice-modal-back';
    document.body.appendChild(back);
  }

  back.innerHTML = `
    <div class="modal modal-wide invoice-modal-box" role="dialog" aria-label="صدور پیش‌فاکتور و فاکتور رسمی">
      <div class="modal-head-row no-print">
        <div>
          <h3>${icon('receipt')} ${esc(docTitle)} و خروجی چاپ PDF</h3>
          <p style="font-size:var(--fs-xs);color:var(--c-text-soft)">مشخصات حقوقی یا خریدار را در صورت نیاز تکمیل کنید و دکمه چاپ / ذخیره PDF را بزنید.</p>
        </div>
        <button type="button" class="drawer-close" id="inv-close" aria-label="بستن">${icon('close')}</button>
      </div>

      <div class="inv-controls no-print">
        <div class="field">
          <label>نام شخص یا شرکت خریدار</label>
          <input id="inv-buyer-name" value="${esc(buyerName)}" placeholder="مثلاً: شرکت شیرینی‌سازی بهار">
        </div>
        <div class="field">
          <label>شناسه ملی / کد ملی (اختیاری)</label>
          <input id="inv-national-id" class="ltr" placeholder="مثلاً: 14001234567">
        </div>
        <div class="field">
          <label>کد اقتصادی / تلفن (اختیاری)</label>
          <input id="inv-econ-code" class="ltr" value="${esc(buyerPhone)}" placeholder="شماره تماس یا کد اقتصادی">
        </div>
        <div class="field">
          <label>نشانی خریدار</label>
          <input id="inv-buyer-addr" value="${esc(buyerAddress)}" placeholder="شهر و نشانی کامل">
        </div>
        <label class="inv-vat-toggle">
          <input type="checkbox" id="inv-vat-check">
          <span>افزودن ۹٪ مالیات بر ارزش افزوده رسمی (ویژه فاکتور حقوقی)</span>
        </label>
      </div>

      <div class="printable-invoice" id="mgz-printable-invoice"></div>

      <div class="inv-actions no-print">
        <button type="button" class="btn btn-primary" id="inv-print-btn">${icon('receipt')} چاپ یا ذخیره PDF</button>
        <button type="button" class="btn btn-outline" id="inv-close-btn">بستن</button>
      </div>
    </div>`;

  const sheet = back.querySelector('#mgz-printable-invoice');
  const nameIn = back.querySelector('#inv-buyer-name');
  const natIn = back.querySelector('#inv-national-id');
  const econIn = back.querySelector('#inv-econ-code');
  const addrIn = back.querySelector('#inv-buyer-addr');
  const vatCheck = back.querySelector('#inv-vat-check');

  function renderSheet() {
    const netBeforeVat = Math.max(0, subtotal - discount + shipCost);
    const vat = vatCheck.checked ? Math.round(Math.max(0, subtotal - discount) * 0.09) : 0;
    const finalTotal = netBeforeVat + vat;

    sheet.innerHTML = `
      <div class="inv-sheet-head">
        <div class="inv-sheet-brand">
          <img src="assets/img/logo.svg?v=14" alt="" width="44" height="44">
          <div>
            <strong>${esc(site.name)}</strong>
            <span>بازار تخصصی مغز پسته، بادام و گردو</span>
          </div>
        </div>
        <div class="inv-sheet-title">
          <h4>${esc(docTitle)}</h4>
          <div>شماره سند: <b class="ltr">${esc(docNumber)}</b></div>
          <div>تاریخ صدور: <b>${esc(docDate)}</b></div>
        </div>
      </div>

      <div class="inv-parties">
        <div class="inv-party">
          <h5>مشخصات فروشنده</h5>
          <div><b>نام:</b> مجموعه تخصصی ${esc(site.name)}</div>
          <div><b>تلفن:</b> <span class="ltr">${esc(site.phone)}</span></div>
          <div><b>نشانی:</b> ${esc(site.address)}</div>
        </div>
        <div class="inv-party">
          <h5>مشخصات خریدار</h5>
          <div><b>نام / شرکت:</b> ${esc(nameIn.value.trim() || 'خریدار محترم')}</div>
          ${natIn.value.trim() ? `<div><b>شناسه / کد ملی:</b> <span class="ltr">${esc(natIn.value.trim())}</span></div>` : ''}
          <div><b>تماس / کد اقتصادی:</b> <span class="ltr">${esc(econIn.value.trim() || '—')}</span></div>
          <div><b>نشانی:</b> ${esc(addrIn.value.trim() || '—')}</div>
        </div>
      </div>

      <div class="table-wrap inv-table-wrap">
        <table class="inv-table">
          <thead>
            <tr>
              <th style="width:44px">ردیف</th>
              <th>شرح کالا، فرآوری و بسته‌بندی</th>
              <th>پله</th>
              <th>مقدار</th>
              <th>فی واحد (تومان)</th>
              <th>مبلغ کل (تومان)</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (it, i) => `
              <tr>
                <td>${fmt(i + 1)}</td>
                <td>
                  <strong>${esc(it.name)}</strong>
                  ${it.variantLabel ? `<div class="inv-sub">${esc(it.variantLabel)}</div>` : ''}
                </td>
                <td>${esc(it.tierLabel || 'خرده‌فروشی')}</td>
                <td class="num">${fmt(it.qty)} ${esc(it.unitText || 'کیلوگرم')}</td>
                <td class="num">${fmt(it.unitPrice)}</td>
                <td class="num"><strong>${fmt(it.lineTotal)}</strong></td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div class="inv-totals">
        <div><span>جمع کل کالاها</span><strong class="num">${faToman(subtotal)}</strong></div>
        ${discount > 0 ? `<div><span>تخفیف (${esc(couponCode || 'کد تخفیف')})</span><strong class="num">− ${faToman(discount)}</strong></div>` : ''}
        <div><span>هزینهٔ ارسال و بسته‌بندی</span><strong class="num">${shipCost === 0 ? 'رایگان' : faToman(shipCost)}</strong></div>
        ${vat > 0 ? `<div><span>مالیات بر ارزش افزوده (۹٪)</span><strong class="num">${faToman(vat)}</strong></div>` : ''}
        <div class="inv-grand"><span>مبلغ نهایی قابل پرداخت</span><strong class="num">${faToman(finalTotal)}</strong></div>
      </div>

      <div class="inv-foot-notes">
        <div>• اعتبار پیش‌فاکتور: ۴۸ ساعت از زمان صدور بر مبنای نرخ روز بازار مغز رفسنجان.</div>
        <div>• تمام محموله‌ها با تضمین تازگی، استاندارد رطوبت و بسته‌بندی وکیوم ارسال می‌شوند.</div>
      </div>`;
  }

  [nameIn, natIn, econIn, addrIn].forEach(inp => inp.addEventListener('input', renderSheet));
  vatCheck.addEventListener('change', renderSheet);
  renderSheet();

  back.classList.add('open');
  back.onclick = e => {
    if (e.target === back) back.classList.remove('open');
  };
  back.querySelector('#inv-close').onclick = () => back.classList.remove('open');
  back.querySelector('#inv-close-btn').onclick = () => back.classList.remove('open');
  back.querySelector('#inv-print-btn').onclick = () => window.print();
}

/* ---------- Product Card (Clearly Distinguishes Central Store vs. Independent Vendor Stall + Compare) ---------- */
function productCard(p) {
  const price = priceFor(p, APP.tier);
  const retail = p.prices.retail;
  const save = APP.tier !== 'retail' ? Math.round((1 - price / retail) * 100) : 0;
  const addQty = defaultQtyForTier(APP.tier);
  const addLabel = APP.tier === 'retail' ? 'افزودن به سبد' : `افزودن (${fmt(addQty)} کیلو)`;
  const detailNote =
    (Array.isArray(p.specs) && p.specs[0]) ||
    (Array.isArray(p.uses) && p.uses.length ? `مناسب ${p.uses.slice(0, 2).join(' و ')}` : p.desc || '');
  const isVendor = p.source === 'vendor' && p.vendorSlug;
  const isCompared = APP.compare.includes(p.id);

  return `
  <article class="card" data-cat="${esc(p.category)}" data-source="${isVendor ? 'vendor' : 'house'}">
    <div class="card-img">
      <a href="product.html?id=${encodeURIComponent(p.id)}">
        <img src="${esc(safeImgUrl(p.img))}" alt="${esc(p.name)}" loading="lazy" width="400" height="300" referrerpolicy="no-referrer" onerror="mgzImgFallback(this,'${esc(p.name)}')">
      </a>
      ${p.badge ? `<span class="badge ${isVendor || p.badge === 'تازه‌برشته' || p.badge === 'ممتاز' ? 'green' : ''}">${esc(p.badge)}</span>` : ''}
    </div>
    <div class="card-body">
      <div class="card-cat">
        <span>${esc(p.origin || 'رفسنجان')}</span>
        <span aria-hidden="true">·</span>
        <span>${esc(p.grade || catName(p.category))}</span>
      </div>
      <h3 class="card-title"><a href="product.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a></h3>
      ${detailNote ? `<p class="card-note">${esc(detailNote)}</p>` : ''}
      <div class="card-source-line">
        ${
          isVendor
            ? `<span>غرفهٔ فروشنده:</span><a href="vendors.html?shop=${encodeURIComponent(p.vendorSlug)}">${esc(p.vendorName)} ←</a>`
            : `<span>عرضه‌کننده:</span><span style="color:var(--c-text-soft)">فروشگاه مرکزی مغزدانه</span>`
        }
      </div>
      <div class="price-row">
        <div class="price">${fmt(price)} <small>تومان / کیلو</small></div>
        ${save ? `<span class="tier-hint">٪${fmt(save)} صرفه‌جویی ${tierLabel(APP.tier)}</span>` : ''}
      </div>
      <div class="card-actions">
        <button type="button" class="btn-add" data-add="${esc(p.id)}">${icon('plus')} ${addLabel}</button>
        <button type="button" class="btn-cmp ${isCompared ? 'is-active' : ''}" data-compare="${esc(p.id)}" aria-pressed="${isCompared ? 'true' : 'false'}">${isCompared ? 'در مقایسه ✓' : 'مقایسه'}</button>
        <a class="btn-details" href="product.html?id=${encodeURIComponent(p.id)}">جزئیات</a>
      </div>
    </div>
  </article>`;
}

function bindAddButtons(root) {
  (root || document).querySelectorAll('[data-add]').forEach(btn => {
    btn.onclick = () => addToCart(btn.dataset.add, null, APP.tier, true);
  });
  (root || document).querySelectorAll('[data-compare]').forEach(btn => {
    btn.onclick = () => toggleCompare(btn.dataset.compare);
  });
}

/* ---------- SEO Schema.org JSON-LD & PWA Web Push Helpers ---------- */
function injectJsonLd(id, payload) {
  if (!payload || typeof document === 'undefined') return;
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(payload);
}

function injectBaseSeoSchemas() {
  const site = (APP.db && APP.db.site) || {};
  const originUrl = location.origin && location.origin !== 'null' ? location.origin : 'https://maghzdaneh.ir';
  injectJsonLd('schema-org-base', {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name || 'مغزدانه',
    url: originUrl,
    logo: `${originUrl}/assets/img/pwa-512x512.png`,
    description: site.description || 'بازار تخصصی مغز پسته، بادام و گردو — خرده، عمده و بازارچه مستقیم باغداران ایران',
    contactPoint: [{ '@type': 'ContactPoint', telephone: site.phone || '+98-21-91008080', contactType: 'customer service', availableLanguage: ['fa', 'en', 'ar'] }],
  });
}

async function enableMaghzdanehPush() {
  if (typeof Notification === 'undefined') {
    toast('مرورگر شما از اعلان‌های وب پشتیبانی نمی‌کند');
    return false;
  }
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') {
    toast('مجوز نمایش اعلان در مرورگر رد شد');
    return false;
  }
  localStorage.setItem('maghzdaneh_push_enabled', '1');
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    const opts = {
      body: 'اعلان‌های لحظه‌ای مغزدانه (وضعیت سفارش، افت نرخ بازار و نوبرانه فصل) در حالت آماده اتصال فعال شد.',
      icon: './assets/img/pwa-192x192.png',
      badge: './assets/img/pwa-192x192.png',
      dir: 'rtl',
      lang: 'fa',
    };
    if (reg && reg.showNotification) await reg.showNotification('مغزدانه — اعلان‌ها فعال شدند', opts);
    else new Notification('مغزدانه — اعلان‌ها فعال شدند', opts);
  } catch {}
  toast('اعلان‌های لحظه‌ای وب‌اپلیکیشن فعال شد');
  return true;
}

/* ---------- Boot ---------- */
async function boot(activePage) {
  initPWA();
  try {
    await loadDB();
  } catch (e) {
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<div style="background:#8a2420;color:#fff;padding:12px;text-align:center;font-size:14px">خطا در بارگذاری داده‌ها — لطفاً صفحه را دوباره باز کنید.</div>`
    );
    throw e;
  }
  injectBaseSeoSchemas();
  buildHeader(activePage);
  buildFooter();
  buildMobileAppNav(activePage);
  return APP.db;
}
