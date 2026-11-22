/* ==========================================================================
   مغزدانه — app.js (Phase 3)
   هسته مشترک همه صفحات: دیتابیس، آیکون‌های SVG اختصاصی، سبد خرید کشویی،
   کنترل دقیق حداقل وزن پلکانی، سوییچر زنده پله خرید و هدر ۳-ناحیه‌ای
   ========================================================================== */

const APP = {
  DB_PATH: 'data/db.json',
  db: null,
  cart: JSON.parse(localStorage.getItem('maghzdaneh_cart') || '[]'),
  tier: localStorage.getItem('maghzdaneh_tier') || 'retail',
  user: null,
  isAdmin: false,
};

/* ---------- Bespoke Vector Icon Set (No raw system emojis in UI chrome) ---------- */
const ICONS = {
  cart: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 4h2.8l2.2 10.6a1.5 1.5 0 0 0 1.5 1.2h9.3a1.5 1.5 0 0 0 1.46-1.16L21.5 7.5H6.2"/></svg>',
  menu: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  arrowLeft: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  search: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8"/></svg>',
  leaf: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
  kernel: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c4.6 1.2 7.2 5.2 6.4 10.2C17.6 18 14.6 21 12 21s-5.6-3-6.4-7.8C4.8 8.2 7.4 4.2 12 3z"/><path d="M12 5.5c2 2.4 2.8 6.4 2 10.5-.5 2.4-1.3 4-2 4.5"/></svg>',
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
      setTimeout(done, 2500);
      return;
    }
    const s = document.createElement('script');
    s.src = 'assets/js/firebase-bundle.js?v=8';
    s.async = true;
    s.onload = () => done();
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return _cloudReadyPromise;
}

/* ---------- Data (Static Fallback + Live Firestore CMS & Catalog Hydration) ---------- */
async function loadDB() {
  if (APP.db) return APP.db;
  const [res, cloud] = await Promise.all([
    fetch(APP.DB_PATH, { cache: 'no-cache' }),
    ensureCloudSDK().catch(() => null),
  ]);
  if (!res.ok) throw new Error('DB load failed: ' + res.status);
  APP.db = await res.json();

  if (cloud) {
    try {
      const [liveProducts, liveBranding] = await Promise.all([
        cloud.getLiveProducts().catch(() => []),
        cloud.getSiteContent('branding').catch(() => null),
      ]);
      if (Array.isArray(liveProducts) && liveProducts.length > 0) {
        APP.db.products = liveProducts;
      }
      if (liveBranding) {
        if (liveBranding.siteName) APP.db.site.name = liveBranding.siteName;
        if (liveBranding.tagline) APP.db.site.tagline = liveBranding.tagline;
        if (liveBranding.phone) APP.db.site.phone = liveBranding.phone;
        if (liveBranding.mobile) APP.db.site.mobile = liveBranding.mobile;
        if (liveBranding.email) APP.db.site.email = liveBranding.email;
        if (liveBranding.address) APP.db.site.address = liveBranding.address;
        if (liveBranding.worktime) APP.db.site.worktime = liveBranding.worktime;
        if (typeof liveBranding.flatShippingCost === 'number') APP.db.site.shipping.flat_cost = liveBranding.flatShippingCost;
        if (typeof liveBranding.freeShippingOver === 'number') APP.db.site.shipping.free_over = liveBranding.freeShippingOver;
        if (liveBranding.heavyShippingNote) APP.db.site.shipping.heavy_note = liveBranding.heavyShippingNote;
        APP.db.site.announcement = liveBranding.announcement || '';
      }
    } catch (err) {
      console.warn('Cloud hydration skipped:', err);
    }
  }

  // Clean up any stale cart items referencing removed product IDs
  APP.cart = APP.cart.filter(i => byId(i.id));
  return APP.db;
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
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
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
  box.innerHTML = `${icon('kernel')}<span>${title || 'مغزدانه'}</span>`;
  wrap.appendChild(box);
};

/* ---------- Cart Engine (Tier-Minimum Aware + Live Drawer) ---------- */
function saveCart() {
  localStorage.setItem('maghzdaneh_cart', JSON.stringify(APP.cart));
  updateCartBadge();
  renderCartDrawer();
}

function cartWeightTotal() {
  return Math.round(APP.cart.reduce((s, i) => s + Number(i.qty || 0), 0) * 100) / 100;
}

function cartTotals() {
  const subtotal = APP.cart.reduce((s, it) => {
    const p = byId(it.id);
    if (!p) return s;
    return s + (p.prices[it.tier] || p.prices.retail) * it.qty;
  }, 0);
  const totalKg = cartWeightTotal();
  const shipCfg = (APP.db && APP.db.site && APP.db.site.shipping) || { free_over: 5000000, flat_cost: 89000 };
  const freeShip = subtotal >= shipCfg.free_over || subtotal === 0;
  const shipCost = freeShip ? 0 : shipCfg.flat_cost;
  return {
    subtotal: Math.round(subtotal),
    totalKg,
    freeShip,
    freeOver: shipCfg.free_over,
    shipCost,
    grand: Math.round(subtotal + shipCost),
  };
}

function updateCartBadge() {
  const count = APP.cart.length;
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = fmt(count);
  });
}

function addToCart(id, qty, tier, openDrawer = true) {
  const p = byId(id);
  if (!p) return;
  tier = tier || APP.tier;
  const minQ = tierMin(tier);
  const resolvedQty = qty == null ? defaultQtyForTier(tier) : Math.max(minQ, Number(qty) || minQ);

  const same = APP.cart.find(i => i.id === id && i.tier === tier);
  if (same) same.qty = Math.round((same.qty + resolvedQty) * 100) / 100;
  else APP.cart.push({ id, tier, qty: resolvedQty });

  saveCart();
  toast(`«${p.name}» (${fmt(resolvedQty)} کیلو · ${tierLabel(tier)}) به سبد اضافه شد`);
  document.dispatchEvent(new CustomEvent('cart:changed'));
  if (openDrawer) openCartDrawer();
}

function setCartItemQty(idx, nextQty) {
  const item = APP.cart[idx];
  if (!item) return;
  const minQ = tierMin(item.tier);
  const clamped = Math.max(minQ, Math.round(Number(nextQty) * 100) / 100);
  item.qty = isNaN(clamped) ? minQ : clamped;
  saveCart();
  document.dispatchEvent(new CustomEvent('cart:changed'));
}

function upgradeCartItemTier(idx, newTier) {
  const item = APP.cart[idx];
  if (!item) return;
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
}

function closeCartDrawer() {
  const b = document.getElementById('drawer-backdrop');
  const d = document.getElementById('cart-drawer');
  if (b) b.classList.remove('open');
  if (d) {
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
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
        <a class="btn btn-primary btn-sm" href="catalog.html" style="margin-top:16px">مشاهده کاتالوگ</a>
      </div>`;
    foot.innerHTML = '';
    return;
  }

  body.innerHTML = APP.cart
    .map((it, idx) => {
      const p = byId(it.id);
      if (!p) return '';
      const unit = p.prices[it.tier] || p.prices.retail;
      const step = it.tier === 'wholesale' ? 5 : it.tier === 'semi' ? 1 : 0.25;
      const minQ = tierMin(it.tier);
      let upgradeHtml = '';
      if (it.tier === 'retail' && it.qty >= 3) {
        const savePct = Math.round((1 - p.prices.semi / p.prices.retail) * 100);
        upgradeHtml = `<div class="tier-upgrade-tip"><span>با ۵ کیلو وارد نیم‌عمده شوید (٪${fmt(savePct)} ارزان‌تر)</span><button type="button" data-d-upg="${idx}" data-to="semi">ارتقا به نیم‌عمده</button></div>`;
      } else if (it.tier === 'semi' && it.qty >= 18) {
        const savePct = Math.round((1 - p.prices.wholesale / p.prices.retail) * 100);
        upgradeHtml = `<div class="tier-upgrade-tip"><span>با ۲۵ کیلو وارد عمده شوید (٪${fmt(savePct)} ارزان‌تر)</span><button type="button" data-d-upg="${idx}" data-to="wholesale">ارتقا به عمده</button></div>`;
      }
      return `
        <div class="drawer-item">
          <img src="${p.img}" alt="${p.name}" referrerpolicy="no-referrer" onerror="mgzImgFallback(this,'${p.name}')">
          <div>
            <div class="drawer-item-title"><a href="product.html?id=${p.id}">${p.name}</a></div>
            <div class="drawer-item-meta">${tierLabel(it.tier)} · ${fmt(unit)} ت/کیلو</div>
            <div class="drawer-item-bar">
              <div class="drawer-qty">
                <button type="button" data-d-dec="${idx}" data-step="${step}" aria-label="کاهش وزن" ${it.qty <= minQ ? 'disabled style="opacity:0.35"' : ''}>−</button>
                <span>${fmt(it.qty)} کیلو</span>
                <button type="button" data-d-inc="${idx}" data-step="${step}" aria-label="افزایش وزن">+</button>
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
  const pct = Math.min(100, Math.round((t.subtotal / Math.max(1, t.freeOver)) * 100));
  foot.innerHTML = `
    <div style="margin-bottom:12px">
      <div class="sum-row" style="padding:3px 0;font-size:var(--fs-xs)">
        <span>${t.freeShip ? 'ارسال رایگان فعال شد' : `${fmt(t.freeOver - t.subtotal)} تومان تا ارسال رایگان`}</span>
        <span>${fmt(t.totalKg)} کیلوگرم</span>
      </div>
      <div class="ship-progress"><i style="width:${pct}%"></i></div>
    </div>
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
          <span>${t.label}</span>
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

/* ---------- Shared 3-Zone Header & Footer Builders ---------- */
function buildHeader(active) {
  const el = document.getElementById('site-header');
  if (!el) return;
  const siteName = (APP.db && APP.db.site && APP.db.site.name) || 'مغزدانه';
  const freeOverText = APP.db && APP.db.site && APP.db.site.shipping
    ? `ارسال رایگان بالای ${fmt(Math.round(APP.db.site.shipping.free_over / 1000000))} میلیون تومان`
    : 'ارسال رایگان بالای ۵ میلیون تومان';

  el.innerHTML = `
  <div class="topstrip">
    <div class="topstrip-inner">
      <div class="topstrip-meta">
        <span>به‌روزرسانی قیمت‌ها: <b>${priceDateStr()}</b></span>
        <span class="topstrip-sep" aria-hidden="true">·</span>
        <span>پله فعال: <b id="top-tier-name">${tierLabel(APP.tier)}</b></span>
      </div>
      <div class="topstrip-meta">
        <span>${(APP.db && APP.db.site && APP.db.site.announcement) || freeOverText}</span>
        <span class="topstrip-sep" aria-hidden="true">·</span>
        <span class="ltr">${APP.db.site.phone}</span>
      </div>
    </div>
  </div>
  <div class="container header-row">
    <a class="brand" href="index.html" aria-label="${siteName} — صفحه اصلی">
      <img src="assets/img/logo.svg" alt="" width="34" height="34">
      <span class="brand-name">${siteName}</span>
    </a>
    <nav class="main-nav" id="main-nav" aria-label="ناوبری اصلی">
      <a href="catalog.html" class="${active === 'catalog' ? 'active' : ''}">فروشگاه</a>
      <a href="wholesale.html" class="${active === 'wholesale' ? 'active' : ''}">خرید عمده</a>
      <a href="about.html" class="${active === 'about' ? 'active' : ''}">داستان ما</a>
      <a href="account.html" id="nav-account-link" class="${active === 'account' ? 'active' : ''}">حساب کاربری</a>
      <a href="admin.html" id="nav-admin-link" class="${active === 'admin' ? 'active' : ''}" hidden>مدیریت</a>
    </nav>
    <div class="header-actions">
      <button type="button" class="cart-btn" id="open-cart-drawer" aria-label="باز کردن سبد خرید">
        ${icon('cart')}
        <span class="cart-label-text">سبد خرید</span>
        <span class="cart-count">۰</span>
      </button>
      <button type="button" class="menu-toggle" id="menu-toggle" aria-label="باز و بسته کردن منو">${icon('menu')}</button>
    </div>
  </div>`;

  const tg = document.getElementById('menu-toggle');
  tg.addEventListener('click', () => document.getElementById('main-nav').classList.toggle('open'));
  document.getElementById('open-cart-drawer').addEventListener('click', openCartDrawer);

  ensureCartDrawer();
  updateCartBadge();

  if (window.MgzCloud) {
    window.MgzCloud.onAuth(async u => {
      APP.user = u;
      const accLink = document.getElementById('nav-account-link');
      const admLink = document.getElementById('nav-admin-link');
      if (u) {
        const firstName = (u.displayName || 'حساب من').split(' ')[0];
        if (accLink) accLink.textContent = firstName;
        const isAdm = await window.MgzCloud.checkIsAdmin(u);
        APP.isAdmin = isAdm;
        if (admLink) admLink.hidden = !isAdm;
      } else {
        APP.isAdmin = false;
        if (accLink) accLink.textContent = 'ورود / حساب کاربری';
        if (admLink) admLink.hidden = true;
      }
      document.dispatchEvent(new CustomEvent('mgz:auth', { detail: { user: u, isAdmin: APP.isAdmin } }));
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
        <img src="assets/img/logo.svg" alt="" width="34" height="34">
        <span>${siteName}</span>
      </div>
      <p>${db.site.description}</p>
      <div class="social-row">
        <a href="${db.site.social.instagram}" target="_blank" rel="noopener" aria-label="اینستاگرام">${icon('instagram')}</a>
        <a href="${db.site.social.telegram}" target="_blank" rel="noopener" aria-label="تلگرام">${icon('telegram')}</a>
        <a href="${db.site.social.whatsapp}" target="_blank" rel="noopener" aria-label="واتس‌اپ">${icon('whatsapp')}</a>
      </div>
    </div>
    <div>
      <h4>دسته‌بندی‌ها</h4>
      <ul>${db.categories.map(c => `<li><a href="catalog.html?cat=${c.id}">${c.name}</a></li>`).join('')}</ul>
    </div>
    <div>
      <h4>حساب و خدمات</h4>
      <ul>
        <li><a href="account.html">ورود و پنل کاربری</a></li>
        <li><a href="wholesale.html">خرید عمده و قیمت پلکانی</a></li>
        <li><a href="supply.html">عرضه محصول به مغزدانه</a></li>
        <li><a href="faq.html">سوالات متداول</a></li>
        <li><a href="about.html">داستان مغزدانه</a></li>
        <li><a href="admin.html">پنل مدیریت محتوا</a></li>
      </ul>
    </div>
    <div>
      <h4>تماس و فروش</h4>
      <ul>
        <li>${icon('phone')} <span class="ltr">${db.site.phone}</span></li>
        <li>${icon('phone')} <span class="ltr">${db.site.mobile}</span></li>
        <li>${icon('mail')} <span class="ltr">${db.site.email}</span></li>
        <li>${icon('pin')} <span>${db.site.address}</span></li>
        <li>${icon('clock')} <span>${db.site.worktime}</span></li>
      </ul>
    </div>
  </div>
  <div class="footer-note">© ۱۴۰۵ ${siteName} — ${db.site.tagline || 'بازار تخصصی مغز پسته، بادام و گردو'} · <a href="legal.html">قوانین و حریم خصوصی</a></div>`;
}

/* ---------- Product Card (Mature Botanical Gallery Card: Provenance, Grade & Spec Detail) ---------- */
function productCard(p) {
  const price = priceFor(p, APP.tier);
  const retail = p.prices.retail;
  const save = APP.tier !== 'retail' ? Math.round((1 - price / retail) * 100) : 0;
  const addQty = defaultQtyForTier(APP.tier);
  const addLabel = APP.tier === 'retail' ? 'افزودن به سبد' : `افزودن (${fmt(addQty)} کیلو)`;
  const detailNote =
    (Array.isArray(p.specs) && p.specs[0]) ||
    (Array.isArray(p.uses) && p.uses.length ? `مناسب ${p.uses.slice(0, 2).join(' و ')}` : p.desc || '');

  return `
  <article class="card" data-cat="${p.category}">
    <div class="card-img">
      <a href="product.html?id=${p.id}">
        <img src="${p.img}" alt="${p.name}" loading="lazy" width="400" height="300" referrerpolicy="no-referrer" onerror="mgzImgFallback(this,'${p.name}')">
      </a>
      ${p.badge ? `<span class="badge ${p.badge === 'تازه‌برشته' || p.badge === 'ممتاز' ? 'green' : ''}">${p.badge}</span>` : ''}
    </div>
    <div class="card-body">
      <div class="card-cat">
        <span>${p.origin || 'رفسنجان'}</span>
        <span aria-hidden="true">·</span>
        <span>${p.grade || catName(p.category)}</span>
      </div>
      <h3 class="card-title"><a href="product.html?id=${p.id}">${p.name}</a></h3>
      ${detailNote ? `<p class="card-note">${detailNote}</p>` : ''}
      <div class="price-row">
        <div class="price">${fmt(price)} <small>تومان / کیلو</small></div>
        ${save ? `<span class="tier-hint">٪${fmt(save)} صرفه‌جویی ${tierLabel(APP.tier)}</span>` : ''}
      </div>
      <div class="card-actions">
        <button type="button" class="btn-add" data-add="${p.id}">${icon('plus')} ${addLabel}</button>
        <a class="btn-details" href="product.html?id=${p.id}">مشخصات</a>
      </div>
    </div>
  </article>`;
}

function bindAddButtons(root) {
  (root || document).querySelectorAll('[data-add]').forEach(btn => {
    btn.onclick = () => addToCart(btn.dataset.add, null, APP.tier, true);
  });
}

/* ---------- Boot ---------- */
async function boot(activePage) {
  try {
    await loadDB();
  } catch (e) {
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<div style="background:#8a2420;color:#fff;padding:12px;text-align:center;font-size:14px">خطا در بارگذاری داده‌ها — لطفاً صفحه را دوباره باز کنید.</div>`
    );
    throw e;
  }
  buildHeader(activePage);
  buildFooter();
  return APP.db;
}
