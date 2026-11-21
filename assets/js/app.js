/* ============================================================
   مغزدانه — app.js (مشترک همه صفحات)
   دیتابیس: data/db.json (ریپوی گیت‌هاب = دیتابیس سایت)
   ============================================================ */

const APP = {
  DB_PATH: 'data/db.json',
  db: null,
  cart: JSON.parse(localStorage.getItem('maghzdaneh_cart') || '[]'),
  tier: localStorage.getItem('maghzdaneh_tier') || 'retail',
};

/* ---------- helpers ---------- */
const fmt = n => Number(n).toLocaleString('fa-IR');
const faToman = n => fmt(n) + ' تومان';
const byId = id => APP.db.products.find(p => p.id === id);
const tierLabel = t => (APP.db.tiers.find(x => x.id === t) || {}).label || '';
const catName = c => (APP.db.categories.find(x => x.id === c) || {}).name || '';

function priceFor(p, tier) {
  return p.prices[tier || APP.tier] || p.prices.retail;
}

/* ---------- data ---------- */
async function loadDB() {
  if (APP.db) return APP.db;
  const res = await fetch(APP.DB_PATH, { cache: 'no-cache' });
  if (!res.ok) throw new Error('DB load failed: ' + res.status);
  APP.db = await res.json();
  return APP.db;
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- cart ---------- */
function saveCart() {
  localStorage.setItem('maghzdaneh_cart', JSON.stringify(APP.cart));
  updateCartBadge();
}
function updateCartBadge() {
  const n = APP.cart.reduce((s, i) => s + i.qty, 0);
  document.querySelectorAll('.cart-count').forEach(el => (el.textContent = fmt(n)));
}
function addToCart(id, qty, tier) {
  qty = Math.max(1, Number(qty) || 1);
  tier = tier || APP.tier;
  const p = byId(id);
  if (!p) return;
  const same = APP.cart.find(i => i.id === id && i.tier === tier);
  if (same) same.qty += qty;
  else APP.cart.push({ id, tier, qty });
  saveCart();
  toast(`«${p.name}» به سبد اضافه شد`);
  document.dispatchEvent(new CustomEvent('cart:changed'));
}
function removeFromCart(idx) {
  APP.cart.splice(idx, 1);
  saveCart();
  document.dispatchEvent(new CustomEvent('cart:changed'));
}

/* ---------- tier selection ---------- */
function setTier(t) {
  APP.tier = t;
  localStorage.setItem('maghzdaneh_tier', t);
  document.dispatchEvent(new CustomEvent('tier:changed'));
}

/* ---------- stars ---------- */
function starsHtml(r) {
  const full = Math.round(Number(r));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

/* ---------- price date ---------- */
function priceDateStr() {
  try {
    return new Date(APP.db.site.price_date).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return ''; }
}

/* ---------- shared header/footer builders ---------- */
function buildHeader(active) {
  const db = APP.db;
  const el = document.getElementById('site-header');
  if (!el) return;
  el.innerHTML = `
  <div class="topstrip">قیمت‌های امروز بازار مغز — به‌روزرسانی: <b>${priceDateStr()}</b> | خرید عمده با قیمت پلکانی از ۵ کیلو</div>
  <div class="container header-row">
    <a class="brand" href="index.html" aria-label="مغزدانه — صفحه اصلی">
      <img src="assets/img/logo.svg" alt="لوگوی مغزدانه" width="44" height="44">
      <span>
        <span class="brand-name">مغزدانه</span><br>
        <span class="brand-sub">${db.site.tagline}</span>
      </span>
    </a>
    <nav class="main-nav" id="main-nav" aria-label="ناوبری اصلی">
      <a href="index.html" class="${active === 'home' ? 'active' : ''}">خانه</a>
      <a href="catalog.html" class="${active === 'catalog' ? 'active' : ''}">کاتالوگ مغزها</a>
      <a href="wholesale.html" class="${active === 'wholesale' ? 'active' : ''}">خرید عمده</a>
      <a href="supply.html" class="${active === 'supply' ? 'active' : ''}">عرضه محصول</a>
      <a href="about.html" class="${active === 'about' ? 'active' : ''}">درباره ما</a>
      <a href="faq.html" class="${active === 'faq' ? 'active' : ''}">سوالات متداول</a>
      <a href="contact.html" class="${active === 'contact' ? 'active' : ''}">تماس</a>
    </nav>
    <div class="header-actions">
      <a class="cart-btn" href="cart.html" aria-label="سبد خرید">
        🛒 سبد خرید <span class="cart-count">۰</span>
      </a>
      <button class="menu-toggle" id="menu-toggle" aria-label="باز و بسته کردن منو">☰</button>
    </div>
  </div>`;
  const tg = document.getElementById('menu-toggle');
  tg.addEventListener('click', () => document.getElementById('main-nav').classList.toggle('open'));
  updateCartBadge();
}

function buildFooter() {
  const db = APP.db;
  const el = document.getElementById('site-footer');
  if (!el) return;
  el.innerHTML = `
  <div class="container footer-grid">
    <div>
      <div class="footer-brand">
        <img src="assets/img/logo.svg" alt="" width="40" height="40">
        <span>مغزدانه</span>
      </div>
      <p>${db.site.description}</p>
      <div class="social-row">
        <a href="${db.site.social.instagram}" target="_blank" rel="noopener" aria-label="اینستاگرام">📷</a>
        <a href="${db.site.social.telegram}" target="_blank" rel="noopener" aria-label="تلگرام">✈️</a>
        <a href="${db.site.social.whatsapp}" target="_blank" rel="noopener" aria-label="واتس‌اپ">💬</a>
      </div>
    </div>
    <div>
      <h4>دسته‌بندی‌ها</h4>
      <ul>${db.categories.map(c => `<li><a href="catalog.html?cat=${c.id}">${c.name}</a></li>`).join('')}</ul>
    </div>
    <div>
      <h4>لینک‌های سریع</h4>
      <ul>
        <li><a href="wholesale.html">خرید عمده و قیمت پلکانی</a></li>
        <li><a href="supply.html">عرضه محصول به ما</a></li>
        <li><a href="faq.html">سوالات متداول</a></li>
        <li><a href="about.html">درباره مغزدانه</a></li>
        <li><a href="contact.html">تماس با ما</a></li>
      </ul>
    </div>
    <div>
      <h4>تماس</h4>
      <ul>
        <li>📞 <span class="ltr">${db.site.phone}</span></li>
        <li>📱 <span class="ltr">${db.site.mobile}</span></li>
        <li>✉️ ${db.site.email}</li>
        <li>📍 ${db.site.address}</li>
        <li>🕐 ${db.site.worktime}</li>
      </ul>
    </div>
  </div>
  <div class="footer-note">© ۱۴۰۵ مغزدانه — همه حقوق محفوظ است. | قیمت‌ها بر اساس استعلام ${priceDateStr()} | <a href="legal.html" style="color:#8fa89a">قوانین و حریم خصوصی</a></div>`;
}

/* ---------- product card ---------- */
function productCard(p) {
  const price = priceFor(p, APP.tier);
  const other = APP.tier === 'retail' ? null : APP.tier;
  const retail = p.prices.retail;
  const save = other ? Math.round((1 - price / retail) * 100) : 0;
  return `
  <article class="card" data-cat="${p.category}">
    <div class="card-img">
      <a href="product.html?id=${p.id}"><img src="${p.img}" alt="${p.name}" loading="lazy" width="400" height="350"></a>
      ${p.badge ? `<span class="badge ${p.badge === 'پرفروش' || p.badge === 'تازه‌برشته' ? 'green' : ''}">${p.badge}</span>` : ''}
    </div>
    <div class="card-body">
      <div class="card-cat">${catName(p.category)} · ${p.origin}</div>
      <h3 class="card-title"><a href="product.html?id=${p.id}">${p.name}</a></h3>
      <div class="card-meta">
        <span class="stars">${starsHtml(p.rating)} <span style="color:var(--c-text-soft)">${fmt(p.rating)}</span></span>
        <span>${fmt(p.sold)} فروش</span>
      </div>
      <div class="price-row">
        <div class="price">${fmt(price)} <small>تومان / کیلو</small></div>
        ${save ? `<span class="tier-hint">${fmt(save)}٪ ارزان‌تر از خرده</span>` : ''}
      </div>
      <div class="card-actions">
        <button class="btn-add" data-add="${p.id}">افزودن به سبد</button>
        <a class="btn-details" href="product.html?id=${p.id}">جزئیات</a>
      </div>
    </div>
  </article>`;
}

function bindAddButtons(root) {
  (root || document).querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => addToCart(btn.dataset.add, 1));
  });
}

/* ---------- boot ---------- */
async function boot(activePage) {
  try {
    await loadDB();
  } catch (e) {
    document.body.insertAdjacentHTML('afterbegin',
      `<div style="background:#c0392b;color:#fff;padding:12px;text-align:center">خطا در بارگذاری داده‌ها — صفحه را دوباره باز کنید.</div>`);
    throw e;
  }
  buildHeader(activePage);
  buildFooter();
  return APP.db;
}
