const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const ROOT = path.resolve(__dirname);
const DATA_DIR = path.join(ROOT, 'data');
const RUNTIME_STORE_PATH = path.join(DATA_DIR, 'runtime-store.json');
const ADMIN_AUTH_PATH = path.join(DATA_DIR, '.admin-auth.json');
const SESSION_SECRET_PATH = path.join(DATA_DIR, '.session-secret');
const SEED_PATH = path.join(DATA_DIR, 'marketplace-seed.json');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

const BLOCKED_STATIC_PATHS = new Set([
  '/server.js',
  '/package.json',
  '/package-lock.json',
  '/.env',
  '/.env.example',
  '/.gitignore',
  '/firestore.rules',
  '/firebase-blueprint.json',
  '/data/.admin-auth.json',
  '/data/.session-secret',
  '/data/runtime-store.json',
]);

/* ==========================================================================
   SESSION SECRET & CRYPTOGRAPHIC HELPERS (scrypt + HMAC-SHA256 + timingSafe)
   ========================================================================== */
function isRealEnvValue(val) {
  const s = String(val || '').trim();
  if (!s) return false;
  if (/^(MY_|YOUR_|CHANGE_ME|REPLACE_|EXAMPLE_|PLACEHOLDER|DUMMY_|TEST_PLACEHOLDER)/i.test(s)) return false;
  return true;
}

function getSessionSecret() {
  if (isRealEnvValue(process.env.SESSION_SECRET) && String(process.env.SESSION_SECRET).length >= 16) {
    return process.env.SESSION_SECRET;
  }
  try {
    if (fs.existsSync(SESSION_SECRET_PATH)) {
      const existing = fs.readFileSync(SESSION_SECRET_PATH, 'utf8').trim();
      if (existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SESSION_SECRET_PATH, generated, { mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

const SESSION_SECRET = getSessionSecret();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function safeEqualText(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function signToken(payloadObj, ttlSeconds = 60 * 60 * 24 * 7) {
  const payload = { ...payloadObj, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  if (!safeEqualText(sig, expectedSig)) return null;
  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!data || typeof data.exp !== 'number' || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const map = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      map[key] = decodeURIComponent(val);
    } catch {
      map[key] = val;
    }
  });
  return map;
}

function isHttpsRequest(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const origin = String(req.headers.origin || '').toLowerCase();
  const referer = String(req.headers.referer || '').toLowerCase();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  if (proto.includes('https') || origin.startsWith('https://') || referer.startsWith('https://')) return true;
  if (host.includes('.run.app') || host.includes('.web.app') || host.includes('.firebaseapp.com')) return true;
  return Boolean(req.socket && req.socket.encrypted);
}

function makeCookieHeader(req, name, value, maxAgeSec) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', `Max-Age=${maxAgeSec}`];
  if (isHttpsRequest(req)) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  return parts.join('; ');
}

function clearCookieHeader(req, name) {
  return makeCookieHeader(req, name, '', 0);
}

/* ==========================================================================
   PERSISTENT RUNTIME STORE (Seeded + Safe Atomic Disk Persistence)
   ========================================================================== */
function loadJsonSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    // ignore corrupt fallback
  }
  return fallback;
}

function defaultCoupons() {
  return [
    { id: 'cpn_maghz10', code: 'MAGHZ10', type: 'percent', value: 10, maxDiscount: 650000, minSubtotal: 500000, active: true, note: '۱۰٪ تخفیف خوش‌آمدگویی و اولین خرید', usedCount: 14, createdAt: '2026-09-01T08:00:00.000Z' },
    { id: 'cpn_bahar200', code: 'BAHAR200', type: 'fixed', value: 200000, maxDiscount: 200000, minSubtotal: 3000000, active: true, note: '۲۰۰ هزار تومان تخفیف سفارش بالای ۳ میلیون', usedCount: 9, createdAt: '2026-09-15T08:00:00.000Z' },
    { id: 'cpn_ghanadi15', code: 'GHANADI15', type: 'percent', value: 15, maxDiscount: 2500000, minSubtotal: 10000000, active: true, note: '۱۵٪ تخفیف ویژهٔ قنادی‌ها و سفارش‌های عمده', usedCount: 6, createdAt: '2026-10-01T08:00:00.000Z' },
  ];
}

function defaultReviews() {
  return [
    { id: 'rev_1', productId: 'maghz-akbari-premium', userName: 'حسین کریمی', city: 'تهران', rating: 5, freshness: 5, uniformity: 5, packaging: 5, verifiedPurchase: true, approved: true, text: 'دقیقاً همان رنگ سبز و درشتی که در عکس بود. وکیوم تمیز و بوی تازگی فوق‌العاده داشت؛ برای آجیل عید دوباره سفارش می‌دهم.', createdAt: '2026-10-28T11:20:00.000Z' },
    { id: 'rev_2', productId: 'maghz-akbari-premium', userName: 'مریم شریفی', city: 'اصفهان', rating: 5, freshness: 5, uniformity: 4, packaging: 5, verifiedPurchase: true, approved: true, text: 'برشته‌کاری ملایم و بدون شوری اضافه. بسته‌بندی قوطی فلزی برای هدیه بسیار شیک بود.', createdAt: '2026-11-04T15:10:00.000Z' },
    { id: 'rev_3', productId: 'khall-qazvin', userName: 'قنادی بهارستان', city: 'شیراز', rating: 5, freshness: 5, uniformity: 5, packaging: 5, verifiedPurchase: true, approved: true, text: 'برای سوهان و باقلوا ۱۵ کیلو گرفتیم؛ رنگ زمردی طبیعی بدون ذره‌ای خرده‌پوست و رنگ مصنوعی. واقعاً بی‌رقیب است.', createdAt: '2026-11-10T09:40:00.000Z' },
    { id: 'rev_4', productId: 'maghz-gerdoo-lux', userName: 'سعید نادری', city: 'رشت', rating: 5, freshness: 5, uniformity: 5, packaging: 4, verifiedPurchase: true, approved: true, text: 'مغز گردوها کاملاً دوپَر سفید و چرب بودند؛ هیچ دانهٔ تلخ یا سیاهی داخل بار نبود.', createdAt: '2026-11-12T18:05:00.000Z' },
  ];
}

function defaultQuestions() {
  return [
    { id: 'qa_1', productId: 'maghz-akbari-premium', authorName: 'امیرحسین جلالی', question: 'آیا این محصول برای نگهداری در دمای محیط تا دو ماه مناسب است؟', answer: 'به دلیل تازگی و روغن طبیعی مغز، پیشنهاد می‌کنیم بستهٔ وکیوم را در جای خنک یا یخچال نگه دارید تا عطر و تردی آن تا ۶ ماه حفظ شود.', answeredBy: 'کارشناس کیفیت مغزدانه', createdAt: '2026-11-02T10:00:00.000Z', answeredAt: '2026-11-02T11:30:00.000Z' },
    { id: 'qa_2', productId: 'khall-qazvin', authorName: 'کارگاه شیرینی سحر', question: 'برای سفارش بالای ۲۵ کیلو امکان ارسال نمونهٔ ۱۰۰ گرمی قبل از خرید هست؟', answer: 'بله، از بخش «بستهٔ نمونه» در صفحهٔ خرید عمده می‌توانید پک نمونهٔ ۵ گرید را سفارش دهید که هزینهٔ آن از اولین فاکتور عمده کسر می‌شود.', answeredBy: 'واحد فروش عمده', createdAt: '2026-11-09T13:15:00.000Z', answeredAt: '2026-11-09T14:00:00.000Z' },
  ];
}

function defaultMarketRates() {
  const seed = loadJsonSafe(SEED_PATH, null);
  if (seed && Array.isArray(seed.marketRates) && seed.marketRates.length) {
    return seed.marketRates.map((r) => ({ ...r }));
  }
  return [
    { id: 'mr_1', name: 'مغز پسته اکبری سوپر صادراتی', origin: 'رفسنجان', region: 'رفسنجان', grade: 'اُنس ۲۰–۲۲ / پوست‌ارغوانی', wholesalePrice: 1290000, fobUsd: 14.8, changePct: 1.8, trend: 'up' },
    { id: 'mr_2', name: 'مغز پسته سبز کال دوپوست (گرید S)', origin: 'رفسنجان', region: 'رفسنجان', grade: 'سوپر زمردی قنادی', wholesalePrice: 1680000, fobUsd: 19.4, changePct: 2.4, trend: 'up' },
    { id: 'mr_3', name: 'خلال پسته سبز درجه‌یک قزوین', origin: 'قزوین', region: 'قزوین', grade: 'کشیده بدون پودر', wholesalePrice: 1740000, fobUsd: 20.1, changePct: 0.6, trend: 'up' },
    { id: 'mr_4', name: 'پسته اکبری خندان طبیعی', origin: 'رفسنجان', region: 'رفسنجان', grade: 'اُنس ۲۰–۲۲ مجلسی', wholesalePrice: 920000, fobUsd: 10.6, changePct: -0.9, trend: 'down' },
    { id: 'mr_5', name: 'مغز پسته فندقی کارگاهی', origin: 'دامغان', region: 'دامغان', grade: 'یکدست تولیدی', wholesalePrice: 1065000, fobUsd: 12.2, changePct: 0.0, trend: 'flat' },
    { id: 'mr_6', name: 'مغز بادام مامایی صادراتی', origin: 'سامان', region: 'سامان', grade: 'سایز ۷۰–۸۰ طلایی', wholesalePrice: 845000, fobUsd: 9.7, changePct: 1.1, trend: 'up' },
    { id: 'mr_7', name: 'مغز گردوی سفید دوپَر ممتاز', origin: 'تویسرکان', region: 'تویسرکان', grade: 'پُرمغز و چرب ۸۵٪ دوپَر', wholesalePrice: 815000, fobUsd: 9.4, changePct: 0.5, trend: 'up' },
    { id: 'mr_8', name: 'مغز گردوی خورشتی و کارگاهی', origin: 'تویسرکان', region: 'تویسرکان', grade: 'چرب و شیرین بدون تلخی', wholesalePrice: 635000, fobUsd: 7.3, changePct: -0.4, trend: 'down' },
  ];
}

function mergeById(existingArr, seedArr) {
  const list = Array.isArray(existingArr) ? [...existingArr] : [];
  const seen = new Set(list.map((item) => item && item.id));
  for (const item of Array.isArray(seedArr) ? seedArr : []) {
    if (item && item.id && !seen.has(item.id)) {
      list.push(item);
      seen.add(item.id);
    }
  }
  return list;
}

let _fxCache = { data: null, fetchedAt: 0 };
async function getLiveFxIndex(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _fxCache.data && now - _fxCache.fetchedAt < 15 * 60 * 1000) {
    return _fxCache.data;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (resp.ok) {
      const json = await resp.json();
      const irr = Number(json && json.rates && json.rates.IRR);
      const eur = Number(json && json.rates && json.rates.EUR);
      const aed = Number(json && json.rates && json.rates.AED);
      if (Number.isFinite(irr) && irr > 100000) {
        const usdToman = Math.round(irr / 10);
        const data = {
          live: true,
          source: 'ExchangeRate-API (نرخ لحظه‌ای ارز بین‌المللی)',
          usdToman,
          eurToman: eur > 0 ? Math.round(usdToman / eur) : Math.round(usdToman * 1.09),
          aedToman: aed > 0 ? Math.round(usdToman / aed) : Math.round(usdToman / 3.6725),
          eurPerUsd: eur > 0 ? eur : 0.92,
          updatedAt: json.time_last_update_utc ? new Date(json.time_last_update_utc).toISOString() : new Date().toISOString(),
          syncedAt: new Date().toISOString(),
        };
        _fxCache = { data, fetchedAt: now };
        return data;
      }
    }
  } catch {
    // Fallback cleanly to cached or reference benchmark
  }
  if (_fxCache.data) return _fxCache.data;
  return {
    live: false,
    source: 'نرخ مرجع داخلی مغزدانه',
    usdToman: 87000,
    eurToman: 94800,
    aedToman: 23700,
    eurPerUsd: 0.92,
    updatedAt: new Date().toISOString(),
    syncedAt: new Date().toISOString(),
  };
}

function defaultRfqTenders() {
  return [
    {
      id: 'rfq_1',
      buyerName: 'قنادی و شیرینی‌پزی بهارستان',
      city: 'اصفهان',
      productTitle: 'خلال پسته سبز زمردی قزوین (بدون پودر)',
      weightKg: 120,
      targetPrice: 1650000,
      deliveryDays: 5,
      note: 'بسته‌بندی پاکت ۵ کیلویی وکیوم ضدنور؛ خرید مستمر ماهانه در صورت رضایت از نمونه.',
      status: 'open',
      createdAt: '2026-11-24T09:15:00.000Z',
      bids: [
        { id: 'bid_1', vendorName: 'کارگاه تخصصی خلال زمرد قزوین', city: 'قزوین', unitPrice: 1615000, deliveryDays: 3, note: 'تولید روز از پسته بومی قزوین + ارسال نمونه ۲۰۰ گرمی رایگان', createdAt: '2026-11-25T11:20:00.000Z' },
        { id: 'bid_2', vendorName: 'باغستان کهن نوق رفسنجان', city: 'رفسنجان', unitPrice: 1640000, deliveryDays: 4, note: 'ارسال با باربری یخچالی و تضمین بازگشت', createdAt: '2026-11-26T08:40:00.000Z' },
      ],
    },
    {
      id: 'rfq_2',
      buyerName: 'بازرگانی صادراتی پارسیان خلیج',
      city: 'بندرعباس (صادراتی FOB)',
      productTitle: 'مغز پسته اکبری سوپر اُنس ۲۰–۲۲ صادراتی',
      weightKg: 500,
      targetPrice: 1270000,
      deliveryDays: 7,
      note: 'نیاز به گواهی آفلاتوکسین EU زیر ۴ ppb و بسته‌بندی کارتن ۱۰ کیلویی وکیوم صادراتی.',
      status: 'open',
      createdAt: '2026-11-25T14:00:00.000Z',
      bids: [
        { id: 'bid_3', vendorName: 'باغستان کهن نوق رفسنجان', city: 'رفسنجان', unitPrice: 1265000, deliveryDays: 5, note: 'آماده تحویل در رفسنجان یا بندرعباس همراه با برگه آزمایشگاه معتبر', createdAt: '2026-11-26T16:10:00.000Z' },
      ],
    },
    {
      id: 'rfq_3',
      buyerName: 'کارگاه کره پسته و گرانولا ارگانیک',
      city: 'تهران',
      productTitle: 'مغز پسته فندقی کارگاهی و مغز بادام مامایی',
      weightKg: 200,
      targetPrice: 1050000,
      deliveryDays: 4,
      note: '۱۰۰ کیلو مغز فندقی دامغان + ۱۰۰ کیلو بادام مامایی سامان — تسویه ۵۰٪ نقد ۵۰٪ چک صیادی ۳۰ روزه.',
      status: 'open',
      createdAt: '2026-11-27T10:30:00.000Z',
      bids: [
        { id: 'bid_4', vendorName: 'مزرعه پسته شاه‌پسند دامغان', city: 'دامغان', unitPrice: 1045000, deliveryDays: 2, note: 'تحویل مستقیم در تهران با سورتینگ تک‌سایز کارگاهی', createdAt: '2026-11-27T15:05:00.000Z' },
      ],
    },
  ];
}

function defaultVendorReviews() {
  return [
    { id: 'vr_1', vendorId: 'vnd-rafsanjan-heritage', authorName: 'فرهاد کریمی', rating: 5, text: 'بار اکبری نوق واقعاً دست‌اول و خوش‌عطر بود. بسته‌بندی وکیوم عالی و ارسال سریع.', createdAt: '2026-11-18T10:00:00.000Z' },
    { id: 'vr_2', vendorId: 'vnd-qazvin-emerald', authorName: 'قنادی صدف شیراز', rating: 5, text: 'سومین بار است که خلال قزوین می‌گیریم؛ یک‌دست و کاملاً سبز طبیعی بدون ذره‌ای پودر.', createdAt: '2026-11-20T14:30:00.000Z' },
    { id: 'vr_3', vendorId: 'vnd-tuyserkan-walnut', authorName: 'مهناز رضایی', rating: 5, text: 'مغز گردوی دوپر بسیار سفید و چرب بود، هیچ دانه تلخی داخل بار نبود.', createdAt: '2026-11-22T09:15:00.000Z' },
    { id: 'vr_4', vendorId: 'vnd-saman-almond', authorName: 'امیر طاهری', rating: 5, text: 'بادام مامایی سامان عالی و درشت بود؛ برای مصرف خانگی و شیر بادام بی‌نظیر است.', createdAt: '2026-11-24T17:45:00.000Z' },
  ];
}

function createInitialStore() {
  const seed = loadJsonSafe(SEED_PATH, { vendors: [], vendorProducts: [], articles: [] });
  return {
    users: [],
    vendors: Array.isArray(seed.vendors) ? seed.vendors : [],
    vendorProducts: Array.isArray(seed.vendorProducts) ? seed.vendorProducts : [],
    articles: Array.isArray(seed.articles) ? seed.articles : [],
    houseProductsOverride: null,
    cms: {},
    orders: [],
    supplyOffers: [],
    transactions: [],
    tickets: [],
    coupons: defaultCoupons(),
    reviews: defaultReviews(),
    questions: defaultQuestions(),
    vendorMessages: [],
    vendorReviews: defaultVendorReviews(),
    rfqTenders: defaultRfqTenders(),
    preorders: [],
    savedCarts: {},
    payouts: [],
    subscriptions: [],
    priceAlerts: [],
    auditLogs: [],
    marketRates: defaultMarketRates(),
  };
}

let STORE = (() => {
  const existing = loadJsonSafe(RUNTIME_STORE_PATH, null);
  const base = createInitialStore();
  if (!existing) return base;
  return {
    ...base,
    ...existing,
    vendors: mergeById(existing.vendors, base.vendors),
    vendorProducts: mergeById(existing.vendorProducts, base.vendorProducts),
    articles: mergeById(existing.articles, base.articles),
    transactions: Array.isArray(existing.transactions) ? existing.transactions : [],
    tickets: Array.isArray(existing.tickets) ? existing.tickets : [],
    coupons: Array.isArray(existing.coupons) && existing.coupons.length ? existing.coupons : base.coupons,
    reviews: Array.isArray(existing.reviews) && existing.reviews.length ? existing.reviews : base.reviews,
    questions: Array.isArray(existing.questions) && existing.questions.length ? existing.questions : base.questions,
    vendorMessages: Array.isArray(existing.vendorMessages) ? existing.vendorMessages : [],
    vendorReviews: mergeById(existing.vendorReviews, base.vendorReviews),
    rfqTenders: mergeById(existing.rfqTenders, base.rfqTenders),
    preorders: Array.isArray(existing.preorders) ? existing.preorders : [],
    savedCarts: existing.savedCarts && typeof existing.savedCarts === 'object' ? existing.savedCarts : {},
    payouts: Array.isArray(existing.payouts) ? existing.payouts : [],
    subscriptions: Array.isArray(existing.subscriptions) ? existing.subscriptions : [],
    priceAlerts: Array.isArray(existing.priceAlerts) ? existing.priceAlerts : [],
    auditLogs: Array.isArray(existing.auditLogs) ? existing.auditLogs : [],
    marketRates: mergeById(existing.marketRates, base.marketRates),
  };
})();

function recordAudit(actor, action, detail) {
  if (!Array.isArray(STORE.auditLogs)) STORE.auditLogs = [];
  STORE.auditLogs.unshift({
    id: 'aud_' + crypto.randomBytes(5).toString('hex'),
    actor: cleanStr(actor, 80) || 'مدیر',
    action: cleanStr(action, 100),
    detail: cleanStr(detail, 300),
    createdAt: new Date().toISOString(),
  });
  if (STORE.auditLogs.length > 250) STORE.auditLogs = STORE.auditLogs.slice(0, 250);
}

function evaluateCoupon(codeRaw, subtotal) {
  const code = cleanStr(codeRaw, 40).toUpperCase();
  if (!code) return { valid: false, error: 'کد تخفیف را وارد کنید.' };
  const cpn = (STORE.coupons || []).find((c) => c.code.toUpperCase() === code && c.active !== false);
  if (!cpn) return { valid: false, error: 'کد تخفیف معتبر نیست یا منقضی شده است.' };
  if (subtotal < (Number(cpn.minSubtotal) || 0)) {
    return {
      valid: false,
      error: `حداقل مبلغ سبد برای این کد ${Number(cpn.minSubtotal).toLocaleString('fa-IR')} تومان است.`,
    };
  }
  let discount = 0;
  if (cpn.type === 'percent') {
    discount = Math.round((subtotal * Number(cpn.value || 0)) / 100);
    if (cpn.maxDiscount > 0) discount = Math.min(discount, Number(cpn.maxDiscount));
  } else {
    discount = Math.min(subtotal, Math.round(Number(cpn.value || 0)));
  }
  return { valid: true, coupon: cpn, discount };
}

const PLATFORM_COMMISSION_RATE = 0.08;

function computeSellerFinance(shopId) {
  const validOrders = STORE.orders.filter(
    (o) => o.status !== 'canceled' && Array.isArray(o.items) && o.items.some((it) => it.vendorId === shopId)
  );
  let grossSales = 0;
  validOrders.forEach((o) => {
    o.items.forEach((it) => {
      if (it.vendorId === shopId) grossSales += Number(it.lineTotal || 0);
    });
  });
  const commission = Math.round(grossSales * PLATFORM_COMMISSION_RATE);
  const netEarnings = Math.max(0, grossSales - commission);
  const shopPayouts = (STORE.payouts || []).filter((p) => p.vendorId === shopId);
  const paidOut = shopPayouts.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);
  const pendingOut = shopPayouts.filter((p) => p.status === 'pending').reduce((s, p) => s + Number(p.amount || 0), 0);
  const availableBalance = Math.max(0, netEarnings - paidOut - pendingOut);
  return {
    commissionRatePct: Math.round(PLATFORM_COMMISSION_RATE * 100),
    grossSales,
    commission,
    netEarnings,
    paidOut,
    pendingOut,
    availableBalance,
    payouts: shopPayouts,
  };
}

function saveStore() {
  try {
    const tmp = `${RUNTIME_STORE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(STORE, null, 2), 'utf8');
    fs.renameSync(tmp, RUNTIME_STORE_PATH);
  } catch (err) {
    console.error('Failed saving runtime store:', err.message);
  }
}

function getBaseDb() {
  return loadJsonSafe(DB_PATH, { site: {}, categories: [], tiers: [], products: [] });
}

function getHouseProducts() {
  if (Array.isArray(STORE.houseProductsOverride) && STORE.houseProductsOverride.length > 0) {
    return STORE.houseProductsOverride;
  }
  const db = getBaseDb();
  return Array.isArray(db.products) ? db.products : [];
}

function getMergedCatalog() {
  const house = getHouseProducts().map((p) => ({
    ...p,
    source: 'house',
    vendorId: null,
    vendorSlug: null,
    vendorName: 'عرضه مستقیم مغزدانه',
  }));
  const activeVendorIds = new Set(STORE.vendors.filter((v) => v.status === 'active').map((v) => v.id));
  const vendorItems = STORE.vendorProducts
    .filter((p) => p.active !== false && activeVendorIds.has(p.vendorId))
    .map((p) => {
      const v = STORE.vendors.find((x) => x.id === p.vendorId);
      return {
        ...p,
        source: 'vendor',
        vendorName: v ? v.name : p.vendorName || 'غرفه فروشنده',
        vendorSlug: v ? v.slug : p.vendorSlug || '',
        vendorCity: v ? v.city : p.vendorCity || p.origin || '',
      };
    });
  return [...house, ...vendorItems];
}

/* ==========================================================================
   IN-MEMORY OTP & RATE LIMIT MAPS
   ========================================================================== */
const otpStore = new Map(); // phone -> { hash, expiresAt, attempts }
const rateBuckets = new Map(); // key -> { count, resetAt }

function checkRateLimit(key, maxCount, windowMs) {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, b);
  }
  b.count += 1;
  return b.count <= maxCount;
}

/* ==========================================================================
   VALIDATION & SANITIZATION HELPERS
   ========================================================================== */
function cleanStr(val, maxLen = 200) {
  return String(val == null ? '' : val).trim().slice(0, maxLen);
}

function sanitizeImageUrl(url, fallback = 'assets/img/maghz-pistachio-akbari.jpg') {
  const s = cleanStr(url, 320);
  if (!s) return fallback;
  if (/^(https?:\/\/|\/|assets\/|src\/assets\/)/i.test(s) && !/javascript:|data:/i.test(s)) {
    return s;
  }
  return fallback;
}

function sanitizeSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normalizeIranPhone(raw) {
  let s = String(raw || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[^\d+]/g, '');
  if (s.startsWith('+98')) s = '0' + s.slice(3);
  if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2);
  if (s.startsWith('9') && s.length === 10) s = '0' + s;
  return s;
}

function isValidIranPhone(phone) {
  return /^09\d{9}$/.test(phone);
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    fullName: u.fullName || '',
    username: u.username || '',
    email: u.email || '',
    phone: u.phone || '',
    buyerType: u.buyerType || 'retail',
    province: u.province || '',
    city: u.city || '',
    postalCode: u.postalCode || '',
    address: u.address || '',
    authMethod: u.authMethod || 'password',
    walletBalance: Math.max(0, Math.round(Number(u.walletBalance) || 0)),
    addresses: Array.isArray(u.addresses) ? u.addresses : [],
    favoriteIds: Array.isArray(u.favoriteIds) ? u.favoriteIds : [],
    createdAt: u.createdAt,
  };
}

function computeLoyalty(totalSpent, orderCount) {
  const points = Math.floor((totalSpent || 0) / 100000) + (orderCount || 0) * 15;
  if (totalSpent >= 25000000) {
    return { tier: 'ویژه VIP', nextTier: null, nextTarget: 25000000, progressPct: 100, discountPct: 6, points };
  }
  if (totalSpent >= 10000000) {
    return {
      tier: 'طلایی',
      nextTier: 'ویژه VIP',
      nextTarget: 25000000,
      progressPct: Math.min(100, Math.round((totalSpent / 25000000) * 100)),
      discountPct: 4,
      points,
    };
  }
  if (totalSpent >= 3000000) {
    return {
      tier: 'نقره‌ای',
      nextTier: 'طلایی',
      nextTarget: 10000000,
      progressPct: Math.min(100, Math.round((totalSpent / 10000000) * 100)),
      discountPct: 2,
      points,
    };
  }
  return {
    tier: 'برنزی',
    nextTier: 'نقره‌ای',
    nextTarget: 3000000,
    progressPct: Math.min(100, Math.round((totalSpent / 3000000) * 100)),
    discountPct: 0,
    points,
  };
}

function recordWalletTx({ user, type, amount, method, note }) {
  const signedAmt = Math.round(Number(amount) || 0);
  const current = Math.max(0, Math.round(Number(user.walletBalance) || 0));
  const nextBal = Math.max(0, current + signedAmt);
  user.walletBalance = nextBal;
  const tx = {
    id: 'tx_' + crypto.randomBytes(6).toString('hex'),
    refCode: 'TX-' + Date.now().toString(36).toUpperCase().slice(-6) + crypto.randomBytes(2).toString('hex').toUpperCase(),
    userId: user.id,
    userName: user.fullName || user.username || user.phone || 'کاربر',
    type, // 'topup' | 'order_payment' | 'admin_credit' | 'admin_debit' | 'refund'
    amount: signedAmt,
    balanceAfter: nextBal,
    method: cleanStr(method, 80) || 'کیف پول مغزدانه',
    note: cleanStr(note, 260),
    createdAt: new Date().toISOString(),
  };
  STORE.transactions.unshift(tx);
  return tx;
}

function getAuthenticatedUser(req) {
  const cookies = parseCookies(req);
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const token = bearer || cookies.mgz_session || '';
  const payload = verifyToken(token);
  if (!payload || payload.kind !== 'user' || !payload.uid) return null;
  const user = STORE.users.find((u) => u.id === payload.uid);
  return user || null;
}

function getAdminConfig() {
  const fileCfg = loadJsonSafe(ADMIN_AUTH_PATH, null);
  if (fileCfg && fileCfg.username && fileCfg.passwordHash) {
    return { configured: true, envManaged: false, username: fileCfg.username, passwordHash: fileCfg.passwordHash };
  }
  const rawUser = cleanStr(process.env.MAGHZDANEH_ADMIN_USER, 64);
  const rawPass = String(process.env.MAGHZDANEH_ADMIN_PASS || '');
  if (isRealEnvValue(rawUser) && isRealEnvValue(rawPass) && rawPass.length >= 4) {
    return { configured: true, envManaged: true, username: rawUser, passwordPlain: rawPass };
  }
  return { configured: false, envManaged: false };
}

function getAuthenticatedAdmin(req) {
  const cookies = parseCookies(req);
  const rawAdminHeader = String(req.headers['x-admin-token'] || '').trim();
  const xAdmin = rawAdminHeader.startsWith('Bearer ') ? rawAdminHeader.slice(7).trim() : rawAdminHeader;
  const authHeader = String(req.headers.authorization || '').trim();
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const token = xAdmin || bearer || cookies.mgz_admin_session || '';
  const payload = verifyToken(token);
  if (!payload || payload.kind !== 'admin' || !payload.username) return null;
  return payload;
}

function checkCsrf(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  if (String(req.headers['x-requested-with'] || '') === 'MaghzdanehApp') return true;
  const origin = req.headers.origin;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (origin && host) {
    try {
      const o = new URL(origin);
      if (o.host === host) return true;
    } catch {
      return false;
    }
  }
  return false;
}

function readJsonBody(req, maxBytes = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(body);
}

/* ==========================================================================
   API ROUTER
   ========================================================================== */
async function handleApi(req, res, pathname, query) {
  if (!checkCsrf(req)) {
    return sendJson(res, 403, { error: 'درخواست نامعتبر است (CSRF)' });
  }

  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').split(',')[0].trim();

  /* ---------- PUBLIC CATALOG, VENDORS, ARTICLES & CMS ---------- */
  if (req.method === 'GET' && pathname === '/api/catalog') {
    const db = getBaseDb();
    return sendJson(res, 200, {
      products: getMergedCatalog(),
      categories: db.categories || [],
      tiers: db.tiers || [],
      cms: STORE.cms || {},
    });
  }

  if (req.method === 'GET' && pathname === '/api/vendors') {
    const list = STORE.vendors
      .filter((v) => v.status === 'active')
      .map((v) => ({
        ...v,
        productCount: STORE.vendorProducts.filter((p) => p.vendorId === v.id && p.active !== false).length,
      }));
    return sendJson(res, 200, { vendors: list });
  }

  if (
    req.method === 'GET' &&
    pathname.startsWith('/api/vendors/') &&
    !pathname.endsWith('/reviews')
  ) {
    const slug = decodeURIComponent(pathname.slice('/api/vendors/'.length));
    const vendor = STORE.vendors.find((v) => v.slug === slug && v.status === 'active');
    if (!vendor) return sendJson(res, 404, { error: 'غرفه مورد نظر یافت نشد' });
    const products = STORE.vendorProducts
      .filter((p) => p.vendorId === vendor.id && p.active !== false)
      .map((p) => ({ ...p, source: 'vendor', vendorName: vendor.name, vendorSlug: vendor.slug, vendorCity: vendor.city }));
    return sendJson(res, 200, { vendor, products });
  }

  if (req.method === 'GET' && pathname === '/api/articles') {
    const cat = cleanStr(query.get('cat'), 60);
    let list = [...STORE.articles];
    if (cat && cat !== 'all') list = list.filter((a) => a.category === cat);
    return sendJson(res, 200, { articles: list });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/articles/')) {
    const slug = decodeURIComponent(pathname.slice('/api/articles/'.length));
    const article = STORE.articles.find((a) => a.slug === slug || a.id === slug);
    if (!article) return sendJson(res, 404, { error: 'مقاله مورد نظر یافت نشد' });
    return sendJson(res, 200, { article });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/cms/')) {
    const docId = cleanStr(pathname.slice('/api/cms/'.length), 40);
    return sendJson(res, 200, { docId, data: STORE.cms[docId] || null });
  }

  /* ---------- USER AUTH: SESSION, REGISTER, LOGIN, MOBILE OTP ---------- */
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const user = getAuthenticatedUser(req);
    const admin = getAuthenticatedAdmin(req);
    const shop = user ? STORE.vendors.find((v) => v.ownerId === user.id) || null : null;
    return sendJson(res, 200, {
      user: publicUser(user),
      vendorShop: shop,
      admin: admin ? { username: admin.username } : null,
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    return sendJson(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': clearCookieHeader(req, 'mgz_session') }
    );
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    if (!checkRateLimit(`reg:${clientIp}`, 15, 60_000)) {
      return sendJson(res, 429, { error: 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.' });
    }
    const body = await readJsonBody(req);
    const fullName = cleanStr(body.fullName, 120);
    const username = cleanStr(body.username, 64).toLowerCase();
    const email = cleanStr(body.email, 120).toLowerCase();
    const phone = body.phone ? normalizeIranPhone(body.phone) : '';
    const password = String(body.password || '');

    if (fullName.length < 2) return sendJson(res, 400, { error: 'لطفاً نام و نام خانوادگی معتبر وارد کنید.' });
    if (!username && !email) return sendJson(res, 400, { error: 'نام کاربری یا ایمیل الزامی است.' });
    if (username && !/^[a-z0-9._-]{3,40}$/.test(username)) {
      return sendJson(res, 400, { error: 'نام کاربری باید ۳ تا ۴۰ کاراکتر انگلیسی، عدد یا خط تیره باشد.' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: 'قالب ایمیل وارد شده صحیح نیست.' });
    }
    if (phone && !isValidIranPhone(phone)) {
      return sendJson(res, 400, { error: 'شماره موبایل باید با ۰۹ شروع شده و ۱۱ رقم باشد.' });
    }
    if (password.length < 4) {
      return sendJson(res, 400, { error: 'رمز عبور باید حداقل ۴ کاراکتر باشد.' });
    }

    const dup = STORE.users.find(
      (u) =>
        (username && u.username === username) ||
        (email && u.email === email) ||
        (phone && u.phone === phone)
    );
    if (dup) {
      return sendJson(res, 409, { error: 'حسابی با این نام کاربری، ایمیل یا شماره موبایل قبلاً ثبت شده است.' });
    }

    const user = {
      id: 'usr_' + crypto.randomBytes(8).toString('hex'),
      fullName,
      username: username || email.split('@')[0],
      email,
      phone,
      passwordHash: hashPassword(password),
      buyerType: ['retail', 'confectionery', 'wholesale'].includes(body.buyerType) ? body.buyerType : 'retail',
      province: '',
      city: '',
      postalCode: '',
      address: '',
      authMethod: 'password',
      walletBalance: 0,
      addresses: [],
      favoriteIds: [],
      createdAt: new Date().toISOString(),
    };

    STORE.users.push(user);
    saveStore();

    const token = signToken({ kind: 'user', uid: user.id });
    return sendJson(
      res,
      201,
      { ok: true, user: publicUser(user), token },
      { 'Set-Cookie': makeCookieHeader(req, 'mgz_session', token, 60 * 60 * 24 * 7) }
    );
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    if (!checkRateLimit(`login:${clientIp}`, 20, 60_000)) {
      return sendJson(res, 429, { error: 'تلاش‌های ناموفق زیاد است؛ یک دقیقه دیگر تلاش کنید.' });
    }
    const body = await readJsonBody(req);
    const identifier = cleanStr(body.identifier, 120).toLowerCase();
    const phoneAttempt = normalizeIranPhone(identifier);
    const password = String(body.password || '');

    if (!identifier || !password) {
      return sendJson(res, 400, { error: 'نام کاربری/ایمیل و رمز عبور را وارد کنید.' });
    }

    const user = STORE.users.find(
      (u) =>
        (u.username && u.username === identifier) ||
        (u.email && u.email === identifier) ||
        (u.phone && u.phone === phoneAttempt)
    );
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return sendJson(res, 401, { error: 'نام کاربری یا رمز عبور نادرست است.' });
    }

    const token = signToken({ kind: 'user', uid: user.id });
    return sendJson(
      res,
      200,
      { ok: true, user: publicUser(user), token },
      { 'Set-Cookie': makeCookieHeader(req, 'mgz_session', token, 60 * 60 * 24 * 7) }
    );
  }

  if (req.method === 'POST' && pathname === '/api/auth/otp/request') {
    if (!checkRateLimit(`otp:${clientIp}`, 10, 60_000)) {
      return sendJson(res, 429, { error: 'درخواست کد بیش از حد مجاز است؛ کمی بعد تلاش کنید.' });
    }
    const body = await readJsonBody(req);
    const phone = normalizeIranPhone(body.phone);
    if (!isValidIranPhone(phone)) {
      return sendJson(res, 400, { error: 'شماره موبایل معتبر نیست (مثال: 09123456789).' });
    }

    const code = String(crypto.randomInt(100000, 999999));
    const codeHash = crypto.createHash('sha256').update(`${phone}:${code}:${SESSION_SECRET}`).digest('hex');
    otpStore.set(phone, { hash: codeHash, expiresAt: Date.now() + 180_000, attempts: 0 });

    const smsConfigured = Boolean(isRealEnvValue(process.env.SMS_API_KEY) && isRealEnvValue(process.env.SMS_GATEWAY_URL));
    return sendJson(res, 200, {
      ok: true,
      phone,
      expiresIn: 180,
      smsMode: smsConfigured ? 'gateway' : 'preview',
      // Return preview verification code when external SMS gateway URL is not configured
      previewCode: smsConfigured ? undefined : code,
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/otp/verify') {
    const body = await readJsonBody(req);
    const phone = normalizeIranPhone(body.phone);
    const code = String(body.code || '')
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/\D/g, '');
    const fullName = cleanStr(body.fullName, 120);

    if (!isValidIranPhone(phone) || code.length !== 6) {
      return sendJson(res, 400, { error: 'شماره موبایل یا کد ۶ رقمی معتبر نیست.' });
    }

    const entry = otpStore.get(phone);
    if (!entry || Date.now() > entry.expiresAt) {
      otpStore.delete(phone);
      return sendJson(res, 400, { error: 'کد تأیید منقضی شده است؛ لطفاً کد جدید دریافت کنید.' });
    }
    entry.attempts += 1;
    if (entry.attempts > 5) {
      otpStore.delete(phone);
      return sendJson(res, 429, { error: 'تعداد تلاش ناموفق بیش از حد شد؛ کد جدید بگیرید.' });
    }

    const attemptHash = crypto.createHash('sha256').update(`${phone}:${code}:${SESSION_SECRET}`).digest('hex');
    if (!safeEqualText(attemptHash, entry.hash)) {
      return sendJson(res, 401, { error: 'کد یک‌بارمصرف اشتباه است.' });
    }

    otpStore.delete(phone);

    let user = STORE.users.find((u) => u.phone === phone);
    if (!user) {
      user = {
        id: 'usr_' + crypto.randomBytes(8).toString('hex'),
        fullName: fullName || `کاربر ${phone.slice(-4)}`,
        username: `u${phone.slice(-7)}`,
        email: '',
        phone,
        passwordHash: '',
        buyerType: 'retail',
        province: '',
        city: '',
        postalCode: '',
        address: '',
        authMethod: 'otp',
        walletBalance: 0,
        addresses: [],
        favoriteIds: [],
        createdAt: new Date().toISOString(),
      };
      STORE.users.push(user);
      saveStore();
    } else if (fullName && (!user.fullName || user.fullName.startsWith('کاربر '))) {
      user.fullName = fullName;
      saveStore();
    }

    const token = signToken({ kind: 'user', uid: user.id });
    return sendJson(
      res,
      200,
      { ok: true, user: publicUser(user), token },
      { 'Set-Cookie': makeCookieHeader(req, 'mgz_session', token, 60 * 60 * 24 * 7) }
    );
  }

  /* ---------- PASSWORD CHANGE & OTP PASSWORD RESET ---------- */
  if (req.method === 'POST' && pathname === '/api/auth/password/change') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });
    const body = await readJsonBody(req);
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (newPassword.length < 6) {
      return sendJson(res, 400, { error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' });
    }
    if (user.passwordHash && !verifyPassword(currentPassword, user.passwordHash)) {
      return sendJson(res, 401, { error: 'رمز عبور فعلی اشتباه است.' });
    }
    user.passwordHash = hashPassword(newPassword);
    saveStore();
    return sendJson(res, 200, { ok: true, message: 'رمز عبور با موفقیت تغییر یافت.' });
  }

  if (req.method === 'POST' && pathname === '/api/auth/password/reset') {
    const body = await readJsonBody(req);
    const phone = normalizeIranPhone(body.phone);
    const code = String(body.code || '')
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/\D/g, '');
    const newPassword = String(body.newPassword || '');
    if (!isValidIranPhone(phone) || code.length !== 6) {
      return sendJson(res, 400, { error: 'شماره موبایل یا کد ۶ رقمی معتبر نیست.' });
    }
    if (newPassword.length < 6) {
      return sendJson(res, 400, { error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' });
    }
    const entry = otpStore.get(phone);
    if (!entry || Date.now() > entry.expiresAt) {
      otpStore.delete(phone);
      return sendJson(res, 400, { error: 'کد تأیید منقضی شده است؛ لطفاً کد جدید دریافت کنید.' });
    }
    const attemptHash = crypto.createHash('sha256').update(`${phone}:${code}:${SESSION_SECRET}`).digest('hex');
    if (!safeEqualText(attemptHash, entry.hash)) {
      return sendJson(res, 401, { error: 'کد یک‌بارمصرف اشتباه است.' });
    }
    const user = STORE.users.find((u) => u.phone === phone);
    if (!user) {
      return sendJson(res, 404, { error: 'حسابی با این شماره موبایل یافت نشد.' });
    }
    otpStore.delete(phone);
    user.passwordHash = hashPassword(newPassword);
    saveStore();
    return sendJson(res, 200, { ok: true, message: 'رمز عبور جدید تنظیم شد؛ اکنون می‌توانید وارد شوید.' });
  }

  /* ---------- PUBLIC MARKET RATES, COUPONS, REVIEWS, Q&A, ALERTS, VENDOR INQUIRIES ---------- */
  if (req.method === 'GET' && pathname === '/api/market-rates') {
    const force = query.get('refresh') === '1';
    const fx = await getLiveFxIndex(force);
    const raw = STORE.marketRates && STORE.marketRates.length ? STORE.marketRates : defaultMarketRates();
    const rates = raw.map((r) => {
      const unitToman = Number(r.price || r.wholesalePrice || 0);
      const computedUsd = fx.usdToman > 0 ? Number((unitToman / fx.usdToman).toFixed(2)) : Number(r.fobUsd || 0);
      const fobUsd = Number(r.fobUsd) > 0 ? Number(r.fobUsd) : computedUsd;
      const eurPerKg = Number((computedUsd * (fx.eurPerUsd || 0.92)).toFixed(2));
      return {
        ...r,
        region: r.region || r.origin || 'رفسنجان',
        price: unitToman,
        wholesalePrice: unitToman,
        fobUsd: computedUsd || fobUsd,
        eurPerKg,
      };
    });
    return sendJson(res, 200, {
      updatedAt: fx.syncedAt || new Date().toISOString(),
      fx,
      rates,
    });
  }

  if (req.method === 'POST' && pathname === '/api/coupons/validate') {
    const body = await readJsonBody(req);
    const subtotal = Math.max(0, Number(body.subtotal) || 0);
    const result = evaluateCoupon(body.code, subtotal);
    if (!result.valid) return sendJson(res, 400, { ok: false, error: result.error });
    return sendJson(res, 200, {
      ok: true,
      code: result.coupon.code,
      coupon: result.coupon,
      discount: result.discount,
      note: result.coupon.note || '',
    });
  }

  if (req.method === 'GET' && pathname === '/api/reviews') {
    const pid = cleanStr(query.get('productId'), 80);
    const list = (STORE.reviews || [])
      .filter((r) => r.approved !== false && (!pid || r.productId === pid))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return sendJson(res, 200, { reviews: list });
  }

  if (req.method === 'POST' && pathname === '/api/reviews') {
    const user = getAuthenticatedUser(req);
    const body = await readJsonBody(req);
    const productId = cleanStr(body.productId, 80);
    const text = cleanStr(body.text || body.comment, 1000);
    const userName = cleanStr(body.userName || body.authorName, 80) || (user && user.fullName) || 'خریدار مغزدانه';
    const city = cleanStr(body.city, 60) || (user && user.city) || 'ایران';
    const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating) || 5)));
    const freshness = Math.max(1, Math.min(5, Math.round(Number(body.freshness) || rating)));
    const uniformity = Math.max(1, Math.min(5, Math.round(Number(body.uniformity) || rating)));
    const packaging = Math.max(1, Math.min(5, Math.round(Number(body.packaging) || rating)));
    if (!productId || text.length < 8) {
      return sendJson(res, 400, { error: 'متن دیدگاه باید حداقل ۸ کاراکتر باشد.' });
    }
    const verifiedPurchase = Boolean(
      user && STORE.orders.some((o) => o.userId === user.id && Array.isArray(o.items) && o.items.some((i) => i.id === productId))
    );
    const rev = {
      id: 'rev_' + crypto.randomBytes(5).toString('hex'),
      productId,
      userId: user ? user.id : null,
      userName,
      city,
      rating,
      freshness,
      uniformity,
      packaging,
      verifiedPurchase,
      approved: true,
      text,
      createdAt: new Date().toISOString(),
    };
    STORE.reviews.unshift(rev);
    saveStore();
    return sendJson(res, 201, { ok: true, review: rev });
  }

  if (req.method === 'GET' && pathname === '/api/questions') {
    const pid = cleanStr(query.get('productId'), 80);
    const list = (STORE.questions || [])
      .filter((q) => !pid || q.productId === pid)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return sendJson(res, 200, { questions: list });
  }

  if (req.method === 'POST' && pathname === '/api/questions') {
    const user = getAuthenticatedUser(req);
    const body = await readJsonBody(req);
    const productId = cleanStr(body.productId, 80);
    const question = cleanStr(body.question, 600);
    const authorName = cleanStr(body.authorName, 80) || (user && user.fullName) || 'کاربر مغزدانه';
    if (!productId || question.length < 6) {
      return sendJson(res, 400, { error: 'متن پرسش باید حداقل ۶ کاراکتر باشد.' });
    }
    const qa = {
      id: 'qa_' + crypto.randomBytes(5).toString('hex'),
      productId,
      authorName,
      question,
      answer: '',
      answeredBy: '',
      createdAt: new Date().toISOString(),
      answeredAt: null,
    };
    STORE.questions.unshift(qa);
    saveStore();
    return sendJson(res, 201, { ok: true, question: qa });
  }

  if (req.method === 'GET' && pathname === '/api/orders/track') {
    const code = cleanStr(query.get('code'), 60).toUpperCase();
    const phone = normalizeIranPhone(query.get('phone') || '');
    if (!code) return sendJson(res, 400, { error: 'کد سفارش را وارد کنید.' });
    const order = (STORE.orders || []).find((o) => {
      const oCode = String(o.orderCode || o.id || '').toUpperCase();
      if (oCode !== code) return false;
      if (!phone) return true;
      const oPhone = normalizeIranPhone((o.customer && o.customer.phone) || o.customerPhone || '');
      return !oPhone || oPhone === phone;
    });
    if (!order) return sendJson(res, 404, { error: 'سفارشی با این مشخصات یافت نشد.' });
    const statusOrder = ['new', 'processing', 'shipped', 'done'];
    const curIdx = order.status === 'canceled' ? -1 : Math.max(0, statusOrder.indexOf(order.status || 'new'));
    return sendJson(res, 200, {
      order: {
        orderCode: order.orderCode || order.id,
        status: order.status || 'new',
        stepIndex: curIdx,
        createdAt: order.createdAt || order.date,
        shipping: order.shipping || 'ارسال استاندارد مغزدانه',
        city: (order.customer && order.customer.city) || order.city || 'ایران',
        totalKg: Number(order.totalKg || (order.totals && order.totals.totalKg) || 1),
        grandTotal: Number(order.grandTotal || (order.totals && order.totals.grand) || 0),
        paymentStatus: order.paymentStatus || (order.paymentMethod === 'wallet' ? 'paid' : 'pending'),
        escrowStatus: order.escrowStatus || 'protected',
        courierTrackingCode: order.courierTrackingCode || `IR-${String(order.orderCode || order.id).replace(/[^A-Z0-9]/g, '').slice(-8)}`,
        itemCount: Array.isArray(order.items) ? order.items.length : 1,
        items: (order.items || []).slice(0, 10).map((it) => ({ name: it.name, qty: it.qty, variantLabel: it.variantLabel || '' })),
      },
    });
  }

  if (req.method === 'GET' && pathname === '/api/rfq') {
    const normalizeTender = (t) => ({
      ...t,
      title: t.title || t.productTitle || '',
      productTitle: t.productTitle || t.title || '',
      maxBudgetPerKg: Number(t.maxBudgetPerKg || t.targetPrice || 0),
      targetPrice: Number(t.targetPrice || t.maxBudgetPerKg || 0),
      bids: (t.bids || []).map((b) => ({
        ...b,
        unitPrice: Number(b.unitPrice || b.pricePerKg || 0),
        pricePerKg: Number(b.pricePerKg || b.unitPrice || 0),
      })),
    });
    const list = (STORE.rfqTenders || []).map(normalizeTender).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return sendJson(res, 200, { tenders: list, rfqs: list });
  }

  if (req.method === 'POST' && pathname === '/api/rfq') {
    const user = getAuthenticatedUser(req);
    const body = await readJsonBody(req);
    const buyerName = cleanStr(body.buyerName, 120) || (user && user.fullName) || '';
    const phone = normalizeIranPhone(body.phone || (user && user.phone) || '');
    const city = cleanStr(body.city, 80) || 'تهران';
    const productTitle = cleanStr(body.productTitle || body.title, 160);
    const weightKg = Math.max(10, Math.min(100000, Number(body.weightKg) || 50));
    const targetPrice = Math.max(0, Math.min(50000000, Math.round(Number(body.targetPrice || body.maxBudgetPerKg) || 0)));
    const deliveryDays = Math.max(1, Math.min(60, Math.round(Number(body.deliveryDays) || 5)));
    if (!buyerName || !productTitle) {
      return sendJson(res, 400, { error: 'نام خریدار/کسب‌وکار و عنوان محصول درخواستی الزامی است.' });
    }
    const tender = {
      id: 'rfq_' + crypto.randomBytes(5).toString('hex'),
      userId: user ? user.id : null,
      buyerName,
      phone,
      city,
      title: productTitle,
      productTitle,
      weightKg,
      targetPrice,
      maxBudgetPerKg: targetPrice,
      deliveryDays,
      note: cleanStr(body.note, 600),
      status: 'open',
      createdAt: new Date().toISOString(),
      bids: [],
    };
    STORE.rfqTenders.unshift(tender);
    saveStore();
    return sendJson(res, 201, { ok: true, tender, rfq: tender });
  }

  if (req.method === 'POST' && pathname.startsWith('/api/rfq/') && pathname.endsWith('/bid')) {
    const rfqId = decodeURIComponent(pathname.slice('/api/rfq/'.length, -'/bid'.length));
    const tender = (STORE.rfqTenders || []).find((t) => t.id === rfqId);
    if (!tender) return sendJson(res, 404, { error: 'درخواست استعلام یافت نشد.' });
    const user = getAuthenticatedUser(req);
    const vendorShop = user ? (STORE.vendors || []).find((v) => v.ownerId === user.id) : null;
    const body = await readJsonBody(req);
    const vendorName = cleanStr(body.vendorName, 120) || (vendorShop && vendorShop.name) || (user && user.fullName) || '';
    const city = cleanStr(body.city, 80) || (vendorShop && vendorShop.city) || 'رفسنجان';
    const unitPrice = Math.max(10000, Math.min(50000000, Math.round(Number(body.unitPrice || body.pricePerKg) || 0)));
    const deliveryDays = Math.max(1, Math.min(60, Math.round(Number(body.deliveryDays) || 4)));
    if (!vendorName || !unitPrice) {
      return sendJson(res, 400, { error: 'نام غرفه/تأمین‌کننده و قیمت پیشنهادی هر کیلو الزامی است.' });
    }
    const bid = {
      id: 'bid_' + crypto.randomBytes(4).toString('hex'),
      vendorId: vendorShop ? vendorShop.id : null,
      vendorName,
      city,
      unitPrice,
      pricePerKg: unitPrice,
      deliveryDays,
      note: cleanStr(body.note, 400),
      createdAt: new Date().toISOString(),
    };
    if (!Array.isArray(tender.bids)) tender.bids = [];
    tender.bids.unshift(bid);
    saveStore();
    const enriched = {
      ...tender,
      title: tender.title || tender.productTitle,
      maxBudgetPerKg: Number(tender.maxBudgetPerKg || tender.targetPrice || 0),
    };
    return sendJson(res, 201, { ok: true, bid, tender: enriched, rfq: enriched });
  }

  if (req.method === 'GET' && pathname === '/api/preorders') {
    return sendJson(res, 200, { count: (STORE.preorders || []).length });
  }

  if (req.method === 'POST' && pathname === '/api/preorders') {
    const user = getAuthenticatedUser(req);
    const body = await readJsonBody(req);
    const crop = cleanStr(body.crop || body.cropName, 140);
    const customerName = cleanStr(body.customerName, 120) || (user && user.fullName) || '';
    const phone = normalizeIranPhone(body.phone || (user && user.phone) || '');
    const qtyKg = Math.max(1, Math.min(5000, Number(body.qtyKg || body.weightKg) || 5));
    if (!crop || !customerName || !isValidIranPhone(phone)) {
      return sendJson(res, 400, { error: 'لطفاً محصول نوبرانه، نام و شماره موبایل معتبر وارد کنید.' });
    }
    const rec = {
      id: 'pre_' + crypto.randomBytes(5).toString('hex'),
      userId: user ? user.id : null,
      crop,
      cropName: crop,
      customerName,
      phone,
      qtyKg,
      weightKg: qtyKg,
      city: cleanStr(body.city, 80) || 'تهران',
      createdAt: new Date().toISOString(),
    };
    STORE.preorders.unshift(rec);
    saveStore();
    return sendJson(res, 201, { ok: true, preorder: rec });
  }

  if (req.method === 'POST' && pathname === '/api/payments/demo-gateway') {
    const body = await readJsonBody(req);
    const orderCode = cleanStr(body.orderCode, 60);
    const outcome = body.outcome === 'cancel' ? 'cancel' : 'approve';
    const order = (STORE.orders || []).find((o) => String(o.orderCode || o.id) === orderCode);
    if (outcome === 'cancel') {
      return sendJson(res, 200, { ok: false, status: 'canceled', message: 'تراکنش توسط کاربر لغو شد (حالت دمو).' });
    }
    const refId = 'SHP-' + String(Math.floor(10000000 + Math.random() * 89999999));
    if (order) {
      order.paymentStatus = 'paid';
      order.paymentRefId = refId;
      order.gatewayMode = isRealEnvValue(process.env.ZARINPAL_MERCHANT_ID) ? 'live' : 'demo';
      const hasVendor = Array.isArray(order.items) && order.items.some((it) => it.source === 'vendor');
      if (hasVendor) order.escrowStatus = 'held';
      saveStore();
    }
    return sendJson(res, 200, {
      ok: true,
      status: 'paid',
      refId,
      mode: isRealEnvValue(process.env.ZARINPAL_MERCHANT_ID) ? 'live' : 'demo',
    });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/vendors/') && pathname.endsWith('/reviews')) {
    const vid = decodeURIComponent(pathname.slice('/api/vendors/'.length, -'/reviews'.length));
    const list = (STORE.vendorReviews || []).filter((r) => r.vendorId === vid);
    return sendJson(res, 200, { reviews: list });
  }

  if (req.method === 'POST' && pathname.startsWith('/api/vendors/') && pathname.endsWith('/review')) {
    const vid = decodeURIComponent(pathname.slice('/api/vendors/'.length, -'/review'.length));
    const user = getAuthenticatedUser(req);
    const body = await readJsonBody(req);
    const authorName = cleanStr(body.authorName || body.author, 80) || (user && user.fullName) || 'خریدار مغزدانه';
    const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating) || 5)));
    const text = cleanStr(body.text, 600);
    if (text.length < 5) return sendJson(res, 400, { error: 'متن دیدگاه حداقل ۵ کاراکتر باشد.' });
    const rev = {
      id: 'vr_' + crypto.randomBytes(5).toString('hex'),
      vendorId: vid,
      author: authorName,
      authorName,
      rating,
      text,
      createdAt: new Date().toISOString(),
    };
    STORE.vendorReviews.unshift(rev);
    saveStore();
    return sendJson(res, 201, { ok: true, review: rev });
  }

  if (req.method === 'GET' && pathname === '/api/customer/referral') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });
    if (!user.referralCode) {
      user.referralCode = 'MGZ-' + String(user.id || crypto.randomBytes(3).toString('hex')).replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
      saveStore();
    }
    const invitedCount = (STORE.users || []).filter((u) => u.referredBy === user.referralCode).length;
    const bonus = invitedCount * 150000;
    return sendJson(res, 200, {
      code: user.referralCode,
      referralCode: user.referralCode,
      invitedCount,
      bonusPerInvite: 150000,
      bonusEarned: bonus,
      earnedBonus: bonus,
    });
  }

  if (req.method === 'GET' && pathname === '/api/customer/messages') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });
    const phone = normalizeIranPhone(user.phone || '');
    const msgs = (STORE.vendorMessages || []).filter((m) => (m.userId && m.userId === user.id) || (phone && normalizeIranPhone(m.phone || '') === phone));
    return sendJson(res, 200, { ok: true, messages: msgs });
  }

  if (req.method === 'GET' && pathname === '/api/customer/cart') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });
    return sendJson(res, 200, { cart: (STORE.savedCarts && STORE.savedCarts[user.id]) || [] });
  }

  if (req.method === 'PUT' && pathname === '/api/customer/cart') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });
    const body = await readJsonBody(req);
    const nextCart = Array.isArray(body.cart) ? body.cart : Array.isArray(body.items) ? body.items : null;
    if (!nextCart) return sendJson(res, 400, { error: 'سبد خرید نامعتبر است.' });
    if (!STORE.savedCarts) STORE.savedCarts = {};
    STORE.savedCarts[user.id] = nextCart.slice(0, 40);
    saveStore();
    return sendJson(res, 200, { ok: true, cart: STORE.savedCarts[user.id], count: STORE.savedCarts[user.id].length });
  }

  if (req.method === 'POST' && pathname.startsWith('/api/vendors/') && pathname.endsWith('/message')) {
    const vid = decodeURIComponent(pathname.slice('/api/vendors/'.length, -'/message'.length));
    const vendor = STORE.vendors.find((v) => v.id === vid || v.slug === vid);
    if (!vendor) return sendJson(res, 404, { error: 'غرفه مورد نظر یافت نشد.' });
    const user = getAuthenticatedUser(req);
    const body = await readJsonBody(req);
    const senderName = cleanStr(body.senderName, 100) || (user && user.fullName) || '';
    const phone = normalizeIranPhone(body.phone || (user && user.phone) || '');
    const text = cleanStr(body.text || body.body, 1000);
    if (senderName.length < 2 || text.length < 6) {
      return sendJson(res, 400, { error: 'نام و متن پیام به غرفه‌دار الزامی است.' });
    }
    const msg = {
      id: 'vmsg_' + crypto.randomBytes(5).toString('hex'),
      userId: user ? user.id : null,
      vendorId: vendor.id,
      vendorName: vendor.name,
      senderName,
      phone,
      text,
      body: text,
      reply: '',
      repliedAt: null,
      createdAt: new Date().toISOString(),
    };
    STORE.vendorMessages.unshift(msg);
    saveStore();
    return sendJson(res, 201, { ok: true, message: msg });
  }

  if (req.method === 'POST' && pathname === '/api/price-alerts') {
    const user = getAuthenticatedUser(req);
    const body = await readJsonBody(req);
    const productName = cleanStr(body.productName, 140);
    const phone = normalizeIranPhone(body.phone || (user && user.phone) || '');
    const alertType = ['stock', 'price'].includes(body.alertType) ? body.alertType : 'price';
    if (!productName || !isValidIranPhone(phone)) {
      return sendJson(res, 400, { error: 'نام محصول و شماره موبایل معتبر الزامی است.' });
    }
    const alert = {
      id: 'alt_' + crypto.randomBytes(5).toString('hex'),
      productId: cleanStr(body.productId, 80),
      productName,
      phone,
      alertType,
      targetPrice: Math.max(0, Number(body.targetPrice) || 0),
      createdAt: new Date().toISOString(),
    };
    STORE.priceAlerts.unshift(alert);
    saveStore();
    return sendJson(res, 201, { ok: true, alert });
  }

  if (req.method === 'GET' && pathname === '/api/subscriptions') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });
    const list = (STORE.subscriptions || []).filter((s) => s.userId === user.id);
    return sendJson(res, 200, { subscriptions: list });
  }

  if (req.method === 'POST' && pathname === '/api/subscriptions') {
    const user = getAuthenticatedUser(req);
    const body = await readJsonBody(req);
    const productId = cleanStr(body.productId, 80);
    const catalog = getMergedCatalog();
    const prod = catalog.find((p) => p.id === productId);
    if (!prod) return sendJson(res, 400, { error: 'محصول انتخاب‌شده معتبر نیست.' });
    const qtyKg = Math.max(1, Math.min(500, Number(body.qtyKg || body.weightKg) || 2));
    const intervalDays = [15, 30, 60].includes(Number(body.intervalDays)) ? Number(body.intervalDays) : 30;
    const customerName = cleanStr(body.customerName, 120) || (user && user.fullName) || '';
    const phone = normalizeIranPhone(body.phone || (user && user.phone) || '');
    if (!customerName || !isValidIranPhone(phone)) {
      return sendJson(res, 400, { error: 'نام و شماره موبایل معتبر برای ثبت اشتراک الزامی است.' });
    }
    const tier = qtyKg >= 25 ? 'wholesale' : qtyKg >= 5 ? 'semi' : 'retail';
    const baseUnit = Number(prod.prices[tier] || prod.prices.retail || 0);
    const discountedUnit = Math.round(baseUnit * 0.95); // 5% recurring subscription discount
    const sub = {
      id: 'sub_' + crypto.randomBytes(5).toString('hex'),
      userId: user ? user.id : null,
      customerName,
      phone,
      productId: prod.id,
      productName: prod.name,
      qtyKg,
      intervalDays,
      unitPrice: discountedUnit,
      cycleTotal: Math.round(discountedUnit * qtyKg),
      status: 'active',
      note: cleanStr(body.note, 240),
      createdAt: new Date().toISOString(),
    };
    STORE.subscriptions.unshift(sub);
    saveStore();
    return sendJson(res, 201, { ok: true, subscription: sub });
  }

  if (req.method === 'PATCH' && pathname.startsWith('/api/subscriptions/')) {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });
    const sid = decodeURIComponent(pathname.slice('/api/subscriptions/'.length));
    const sub = (STORE.subscriptions || []).find((s) => s.id === sid && s.userId === user.id);
    if (!sub) return sendJson(res, 404, { error: 'اشتراک یافت نشد.' });
    const body = await readJsonBody(req);
    if (['active', 'paused', 'canceled'].includes(body.status)) {
      sub.status = body.status;
      saveStore();
    }
    return sendJson(res, 200, { ok: true, subscription: sub });
  }

  /* ---------- USER PROFILE & ORDERS ---------- */
  if (req.method === 'PUT' && pathname === '/api/profile') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });
    const body = await readJsonBody(req);
    if (body.fullName !== undefined) user.fullName = cleanStr(body.fullName, 120) || user.fullName;
    if (body.phone !== undefined) {
      const p = normalizeIranPhone(body.phone);
      if (!body.phone || isValidIranPhone(p)) user.phone = body.phone ? p : '';
    }
    if (['retail', 'confectionery', 'wholesale'].includes(body.buyerType)) user.buyerType = body.buyerType;
    if (body.province !== undefined) user.province = cleanStr(body.province, 80);
    if (body.city !== undefined) user.city = cleanStr(body.city, 80);
    if (body.postalCode !== undefined) user.postalCode = cleanStr(body.postalCode, 20);
    if (body.address !== undefined) user.address = cleanStr(body.address, 400);
    if (Array.isArray(body.favoriteIds)) {
      user.favoriteIds = body.favoriteIds.map((x) => cleanStr(x, 80)).filter(Boolean).slice(0, 60);
    }
    saveStore();
    return sendJson(res, 200, { ok: true, user: publicUser(user) });
  }

  if (req.method === 'GET' && pathname === '/api/orders/my') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });
    const orders = STORE.orders
      .filter((o) => o.userId === user.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return sendJson(res, 200, { orders });
  }

  /* ---------- CUSTOMER EXECUTIVE DASHBOARD, WALLET, ADDRESSES & TICKETS ---------- */
  if (req.method === 'GET' && pathname === '/api/customer/dashboard') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });

    const myOrders = STORE.orders
      .filter((o) => o.userId === user.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const myTx = STORE.transactions
      .filter((t) => t.userId === user.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const myTickets = STORE.tickets
      .filter((t) => t.userId === user.id)
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));
    const myShop = STORE.vendors.find((v) => v.ownerId === user.id) || null;

    const validOrders = myOrders.filter((o) => o.status !== 'canceled');
    const totalSpent = validOrders.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);
    const totalKg = Math.round(validOrders.reduce((s, o) => s + (Number(o.totalKg) || 0), 0) * 100) / 100;
    const activeOrdersCount = myOrders.filter((o) => ['new', 'processing', 'shipped'].includes(o.status)).length;
    const totalTopups = myTx
      .filter((t) => t.type === 'topup' || t.type === 'admin_credit')
      .reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0);
    const loyalty = computeLoyalty(totalSpent, validOrders.length);

    // Build 6-month activity buckets for customer spending SVG chart
    const now = new Date();
    const monthlySeries = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const label = d.toLocaleDateString('fa-IR', { month: 'short' });
      const spent = validOrders
        .filter((o) => {
          const od = new Date(o.createdAt);
          return od.getFullYear() === y && od.getMonth() === m;
        })
        .reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);
      const topup = myTx
        .filter((t) => {
          const td = new Date(t.createdAt);
          return (t.type === 'topup' || t.type === 'admin_credit') && td.getFullYear() === y && td.getMonth() === m;
        })
        .reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0);
      monthlySeries.push({ label, spent, topup });
    }

    return sendJson(res, 200, {
      user: publicUser(user),
      shop: myShop,
      stats: {
        walletBalance: Math.max(0, Math.round(Number(user.walletBalance) || 0)),
        totalOrders: myOrders.length,
        activeOrdersCount,
        totalSpent,
        totalKg,
        totalTopups,
        openTicketsCount: myTickets.filter((t) => t.status !== 'closed').length,
        loyalty,
        monthlySeries,
      },
      orders: myOrders,
      transactions: myTx,
      tickets: myTickets,
      subscriptions: (STORE.subscriptions || []).filter((s) => s.userId === user.id),
    });
  }

  if (req.method === 'POST' && pathname === '/api/wallet/topup') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'برای شارژ کیف پول ابتدا وارد حساب کاربری شوید.' });
    if (!checkRateLimit(`topup:${user.id}`, 15, 60_000)) {
      return sendJson(res, 429, { error: 'تعداد درخواست شارژ بیش از حد مجاز است؛ کمی بعد تلاش کنید.' });
    }
    const body = await readJsonBody(req);
    const amount = Math.round(Number(body.amount) || 0);
    if (!Number.isFinite(amount) || amount < 50000 || amount > 500000000) {
      return sendJson(res, 400, { error: 'مبلغ شارژ باید بین ۵۰٬۰۰۰ تا ۵۰۰٬۰۰۰٬۰۰۰ تومان باشد.' });
    }
    const allowedMethods = ['درگاه آنلاین بانکی', 'کارت‌به‌کارت فوری', 'حواله پایا / ساتنا'];
    const method = allowedMethods.includes(body.method) ? body.method : allowedMethods[0];
    const note = cleanStr(body.note, 200) || `شارژ آنلاین کیف پول (${method})`;

    const tx = recordWalletTx({ user, type: 'topup', amount, method, note });
    saveStore();
    return sendJson(res, 201, {
      ok: true,
      walletBalance: user.walletBalance,
      transaction: tx,
      user: publicUser(user),
    });
  }

  if (req.method === 'POST' && pathname === '/api/customer/addresses') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });
    const body = await readJsonBody(req);
    if (!Array.isArray(user.addresses)) user.addresses = [];
    if (user.addresses.length >= 10) {
      return sendJson(res, 400, { error: 'حداکثر ۱۰ نشانی قابل ذخیره است.' });
    }
    const title = cleanStr(body.title, 60) || 'نشانی جدید';
    const receiver = cleanStr(body.receiver, 100) || user.fullName;
    const phone = normalizeIranPhone(body.phone || user.phone);
    const province = cleanStr(body.province, 80);
    const city = cleanStr(body.city, 80);
    const postalCode = cleanStr(body.postalCode, 20);
    const line = cleanStr(body.address, 400);
    if (!province || !city || line.length < 6) {
      return sendJson(res, 400, { error: 'استان، شهر و نشانی کامل الزامی است.' });
    }
    const isDefault = Boolean(body.isDefault) || user.addresses.length === 0;
    if (isDefault) user.addresses.forEach((a) => { a.isDefault = false; });
    const addr = {
      id: 'adr_' + crypto.randomBytes(5).toString('hex'),
      title,
      receiver,
      phone,
      province,
      city,
      postalCode,
      address: line,
      isDefault,
    };
    user.addresses.unshift(addr);
    if (isDefault) {
      user.province = province;
      user.city = city;
      user.postalCode = postalCode;
      user.address = line;
    }
    saveStore();
    return sendJson(res, 201, { ok: true, addresses: user.addresses, user: publicUser(user) });
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/customer/addresses/')) {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });
    const aid = decodeURIComponent(pathname.slice('/api/customer/addresses/'.length));
    user.addresses = (user.addresses || []).filter((a) => a.id !== aid);
    if (user.addresses.length && !user.addresses.some((a) => a.isDefault)) {
      user.addresses[0].isDefault = true;
    }
    saveStore();
    return sendJson(res, 200, { ok: true, addresses: user.addresses, user: publicUser(user) });
  }

  if (req.method === 'POST' && pathname === '/api/customer/favorites/toggle') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });
    const body = await readJsonBody(req);
    const pid = cleanStr(body.productId, 80);
    if (!pid) return sendJson(res, 400, { error: 'شناسه محصول نامعتبر است.' });
    if (!Array.isArray(user.favoriteIds)) user.favoriteIds = [];
    const idx = user.favoriteIds.indexOf(pid);
    let saved = false;
    if (idx >= 0) {
      user.favoriteIds.splice(idx, 1);
    } else if (user.favoriteIds.length < 60) {
      user.favoriteIds.unshift(pid);
      saved = true;
    }
    saveStore();
    return sendJson(res, 200, { ok: true, saved, favoriteIds: user.favoriteIds });
  }

  if (req.method === 'POST' && pathname === '/api/customer/tickets') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });
    const body = await readJsonBody(req);
    const subject = cleanStr(body.subject, 160);
    const category = cleanStr(body.category, 60) || 'پیگیری سفارش';
    const message = cleanStr(body.message, 1500);
    if (subject.length < 3 || message.length < 6) {
      return sendJson(res, 400, { error: 'عنوان و متن پیام تیکت الزامی است.' });
    }
    const nowIso = new Date().toISOString();
    const ticket = {
      id: 'tkt_' + crypto.randomBytes(5).toString('hex'),
      code: 'TK-' + Date.now().toString(36).toUpperCase().slice(-5),
      userId: user.id,
      userName: user.fullName || user.username || 'مشتری',
      userPhone: user.phone || '',
      subject,
      category,
      status: 'open',
      messages: [{ sender: 'user', senderName: user.fullName || 'مشتری', text: message, createdAt: nowIso }],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    STORE.tickets.unshift(ticket);
    saveStore();
    return sendJson(res, 201, { ok: true, ticket });
  }

  if (req.method === 'POST' && pathname.startsWith('/api/customer/tickets/') && pathname.endsWith('/reply')) {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'ابتدا وارد حساب کاربری شوید.' });
    const tid = decodeURIComponent(pathname.slice('/api/customer/tickets/'.length, -'/reply'.length));
    const ticket = STORE.tickets.find((t) => t.id === tid && t.userId === user.id);
    if (!ticket) return sendJson(res, 404, { error: 'تیکت مورد نظر یافت نشد.' });
    const body = await readJsonBody(req);
    const text = cleanStr(body.text, 1500);
    if (text.length < 2) return sendJson(res, 400, { error: 'متن پاسخ را بنویسید.' });
    const nowIso = new Date().toISOString();
    ticket.messages.push({ sender: 'user', senderName: user.fullName || 'مشتری', text, createdAt: nowIso });
    ticket.status = 'open';
    ticket.updatedAt = nowIso;
    saveStore();
    return sendJson(res, 200, { ok: true, ticket });
  }

  if (req.method === 'POST' && pathname === '/api/orders') {
    const user = getAuthenticatedUser(req);
    const body = await readJsonBody(req);
    const items = Array.isArray(body.items) ? body.items.slice(0, 40) : [];
    if (!items.length) return sendJson(res, 400, { error: 'سبد خرید خالی است.' });

    const catalog = getMergedCatalog();
    let subtotal = 0;
    let totalKg = 0;
    const normalizedItems = [];
    const involvedVendorIds = new Set();

    for (const raw of items) {
      if (raw.kind === 'gift-box' || raw.kind === 'sample-pack' || raw.kind === 'custom-mix') {
        const qty = Math.max(1, Math.min(200, Number(raw.qty) || 1));
        const unit = Math.max(50000, Math.min(50000000, Math.round(Number(raw.unitPrice || raw.unit) || 0)));
        const lineTotal = Math.round(unit * qty);
        subtotal += lineTotal;
        totalKg += Math.max(0.1, Math.min(50, Number(raw.weightKg || 0.5))) * qty;
        const defaultName =
          raw.kind === 'gift-box'
            ? 'جعبه هدیه اختصاصی مغزدانه'
            : raw.kind === 'custom-mix'
              ? 'میکس اختصاصی آجیل و مغز مغزدانه'
              : 'بسته نمونه ارزیابی';
        normalizedItems.push({
          id: cleanStr(raw.id, 80) || `${raw.kind}_${Date.now().toString(36)}`,
          kind: raw.kind,
          name: cleanStr(raw.name, 180) || defaultName,
          tier: 'retail',
          qty,
          unitPrice: unit,
          lineTotal,
          variantLabel: cleanStr(raw.variantLabel, 240),
          source: 'house',
          vendorId: null,
          vendorName: 'مغزدانه',
        });
        continue;
      }
      const prod = catalog.find((p) => p.id === raw.id);
      if (!prod) continue;
      const tier = ['retail', 'semi', 'wholesale'].includes(raw.tier) ? raw.tier : 'retail';
      const qty = Math.max(0.25, Math.min(10000, Number(raw.qty) || 1));
      const variantDelta = Math.max(0, Math.min(500000, Math.round(Number(raw.variantDelta) || 0)));
      const unit = Number(prod.prices[tier] || prod.prices.retail || 0) + variantDelta;
      const lineTotal = Math.round(unit * qty);
      subtotal += lineTotal;
      totalKg += qty;
      if (prod.vendorId) involvedVendorIds.add(prod.vendorId);
      normalizedItems.push({
        id: prod.id,
        name: prod.name,
        tier,
        qty,
        unitPrice: unit,
        lineTotal,
        variantLabel: cleanStr(raw.variantLabel, 140),
        source: prod.source || 'house',
        vendorId: prod.vendorId || null,
        vendorName: prod.vendorName || 'مغزدانه',
      });
    }

    if (!normalizedItems.length) return sendJson(res, 400, { error: 'اقلام سفارش معتبر نیستند.' });

    let couponCode = '';
    let discountAmount = 0;
    if (body.couponCode) {
      const check = evaluateCoupon(body.couponCode, subtotal);
      if (check.valid) {
        couponCode = check.coupon.code;
        discountAmount = check.discount;
        check.coupon.usedCount = (Number(check.coupon.usedCount) || 0) + 1;
      }
    }

    const netAfterDiscount = Math.max(0, subtotal - discountAmount);
    const baseDb = getBaseDb();
    const freeOver = Number((baseDb.site && baseDb.site.shipping && baseDb.site.shipping.free_over) || 3000000);
    const defaultShip = netAfterDiscount >= freeOver ? 0 : 89000;
    const requestedShip = body.totals && typeof body.totals.shipping === 'number' && Number.isFinite(body.totals.shipping)
      ? Math.max(0, Math.min(1500000, Math.round(body.totals.shipping)))
      : defaultShip;
    const shippingCost = requestedShip;
    const grandTotal = netAfterDiscount + shippingCost;
    const cust = body.customer && typeof body.customer === 'object' ? body.customer : {};
    const payWithWallet = body.paymentMethod === 'wallet' || String(body.payment || '').includes('کیف پول');
    const paymentRefId = cleanStr(body.paymentRefId, 80);
    const corpRaw = body.corporateInvoice && typeof body.corporateInvoice === 'object' && body.corporateInvoice.requested
      ? {
          requested: true,
          companyName: cleanStr(body.corporateInvoice.companyName, 140),
          nationalId: cleanStr(body.corporateInvoice.nationalId, 30),
          economicCode: cleanStr(body.corporateInvoice.economicCode, 30),
        }
      : null;

    if (payWithWallet) {
      if (!user) return sendJson(res, 401, { error: 'برای پرداخت از کیف پول ابتدا وارد حساب کاربری شوید.' });
      const bal = Math.max(0, Math.round(Number(user.walletBalance) || 0));
      if (bal < grandTotal) {
        return sendJson(res, 400, { error: 'موجودی کیف پول برای پرداخت این سفارش کافی نیست. ابتدا کیف پول را شارژ کنید.' });
      }
    }

    const orderCode = cleanStr(body.orderCode, 40) || ('MD-' + Date.now().toString(36).toUpperCase());
    const order = {
      id: 'ord_' + crypto.randomBytes(6).toString('hex'),
      orderCode,
      userId: user ? user.id : null,
      customerName: cleanStr(body.customerName || cust.name, 120),
      customerPhone: normalizeIranPhone(body.customerPhone || cust.phone),
      customerEmail: cleanStr(body.customerEmail || cust.email, 120),
      province: cleanStr(body.province || cust.province, 80),
      city: cleanStr(body.city || cust.city, 80),
      address: cleanStr(body.address || cust.address, 400),
      shipping: cleanStr(body.shipping, 100),
      payment: payWithWallet ? 'پرداخت آنلاین از کیف پول مغزدانه' : cleanStr(body.payment, 100) || 'درگاه آنلاین',
      paymentMethod: cleanStr(body.paymentMethod, 30) || (payWithWallet ? 'wallet' : 'gateway'),
      paymentRefId,
      escrowStatus: involvedVendorIds.size ? 'held' : 'protected',
      corporateInvoice: corpRaw,
      paid: payWithWallet || Boolean(paymentRefId),
      note: cleanStr(body.note, 400),
      couponCode,
      discountAmount,
      items: normalizedItems,
      vendorIds: [...involvedVendorIds],
      subtotal,
      shippingCost,
      grandTotal,
      totalKg: Math.round(totalKg * 100) / 100,
      status: (payWithWallet || paymentRefId) ? 'processing' : 'new',
      createdAt: new Date().toISOString(),
    };

    if (payWithWallet && user) {
      recordWalletTx({
        user,
        type: 'order_payment',
        amount: -grandTotal,
        method: 'کیف پول مغزدانه',
        note: `پرداخت سفارش ${orderCode}`,
      });
    }

    STORE.orders.unshift(order);
    saveStore();
    return sendJson(res, 201, {
      ok: true,
      order,
      walletBalance: user ? user.walletBalance : undefined,
    });
  }

  if (req.method === 'POST' && pathname === '/api/supply') {
    const body = await readJsonBody(req);
    const offer = {
      id: 'sup_' + crypto.randomBytes(6).toString('hex'),
      sellerName: cleanStr(body.sellerName, 120),
      phone: normalizeIranPhone(body.phone),
      productType: cleanStr(body.productType, 120),
      amountKg: Math.max(1, Number(body.amountKg) || 1),
      origin: cleanStr(body.origin, 80),
      priceExpect: cleanStr(body.priceExpect, 80),
      note: cleanStr(body.note, 500),
      status: 'new',
      createdAt: new Date().toISOString(),
    };
    if (!offer.sellerName || !offer.phone) {
      return sendJson(res, 400, { error: 'نام و شماره تماس الزامی است.' });
    }
    STORE.supplyOffers.unshift(offer);
    saveStore();
    return sendJson(res, 201, { ok: true, offer });
  }

  /* ---------- PERSONAL SELLER STOREFRONT STUDIO (/api/seller/*) ---------- */
  if (pathname.startsWith('/api/seller')) {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'برای مدیریت فروشگاه شخصی ابتدا وارد حساب کاربری شوید.' });

    if (req.method === 'GET' && pathname === '/api/seller/me') {
      const shop = STORE.vendors.find((v) => v.ownerId === user.id) || null;
      const products = shop ? STORE.vendorProducts.filter((p) => p.vendorId === shop.id) : [];
      const orders = shop
        ? STORE.orders.filter((o) => Array.isArray(o.vendorIds) && o.vendorIds.includes(shop.id))
        : [];
      const finance = shop ? computeSellerFinance(shop.id) : null;
      const messages = shop ? (STORE.vendorMessages || []).filter((m) => m.vendorId === shop.id) : [];
      return sendJson(res, 200, { user: publicUser(user), shop, products, orders, finance, messages });
    }

    if (req.method === 'POST' && pathname === '/api/seller/verify-request') {
      const shop = STORE.vendors.find((v) => v.ownerId === user.id);
      if (!shop) return sendJson(res, 400, { error: 'ابتدا مشخصات غرفهٔ خود را ثبت کنید.' });
      const body = await readJsonBody(req);
      const nationalId = cleanStr(body.nationalId, 20);
      const docNote = cleanStr(body.docNote, 400);
      if (nationalId.length < 8 || docNote.length < 6) {
        return sendJson(res, 400, { error: 'کد ملی/شناسه و شرح مدارک باغ یا کارگاه الزامی است.' });
      }
      shop.verificationRequest = {
        nationalId,
        docNote,
        status: 'pending',
        submittedAt: new Date().toISOString(),
      };
      saveStore();
      return sendJson(res, 200, { ok: true, shop });
    }

    if (req.method === 'POST' && pathname === '/api/seller/payout') {
      const shop = STORE.vendors.find((v) => v.ownerId === user.id);
      if (!shop) return sendJson(res, 400, { error: 'غرفه‌ای برای حساب شما ثبت نشده است.' });
      const body = await readJsonBody(req);
      const shaba = cleanStr(body.shaba, 34).toUpperCase().replace(/\s+/g, '');
      const amount = Math.round(Number(body.amount) || 0);
      const fin = computeSellerFinance(shop.id);
      if (!/^IR[0-9]{24}$/.test(shaba)) {
        return sendJson(res, 400, { error: 'شماره شبا معتبر نیست (باید با IR و ۲۴ رقم باشد).' });
      }
      if (amount < 100000 || amount > fin.availableBalance) {
        return sendJson(res, 400, { error: `مبلغ درخواستی باید بین ۱۰۰٬۰۰۰ تا ${fin.availableBalance.toLocaleString('fa-IR')} تومان باشد.` });
      }
      const payout = {
        id: 'pay_' + crypto.randomBytes(5).toString('hex'),
        vendorId: shop.id,
        vendorName: shop.name,
        ownerId: user.id,
        amount,
        shaba,
        status: 'pending',
        createdAt: new Date().toISOString(),
        paidAt: null,
      };
      STORE.payouts.unshift(payout);
      saveStore();
      return sendJson(res, 201, { ok: true, payout, finance: computeSellerFinance(shop.id) });
    }

    if (req.method === 'POST' && pathname.startsWith('/api/seller/messages/') && pathname.endsWith('/reply')) {
      const shop = STORE.vendors.find((v) => v.ownerId === user.id);
      if (!shop) return sendJson(res, 403, { error: 'دسترسی غیرمجاز.' });
      const mid = decodeURIComponent(pathname.slice('/api/seller/messages/'.length, -'/reply'.length));
      const msg = (STORE.vendorMessages || []).find((m) => m.id === mid && m.vendorId === shop.id);
      if (!msg) return sendJson(res, 404, { error: 'پیام یافت نشد.' });
      const body = await readJsonBody(req);
      const reply = cleanStr(body.reply, 1000);
      if (reply.length < 2) return sendJson(res, 400, { error: 'متن پاسخ را وارد کنید.' });
      msg.reply = reply;
      msg.repliedAt = new Date().toISOString();
      saveStore();
      return sendJson(res, 200, { ok: true, message: msg });
    }

    if (req.method === 'POST' && pathname === '/api/seller/shop') {
      const body = await readJsonBody(req);
      const name = cleanStr(body.name, 100);
      const city = cleanStr(body.city, 80);
      const specialty = cleanStr(body.specialty, 140);
      const bio = cleanStr(body.bio, 500);
      const phone = normalizeIranPhone(body.phone || user.phone);
      const coverImage = sanitizeImageUrl(body.coverImage, 'src/assets/images/vendor_orchard_harvest_1795350768215.jpg');
      const requestedSlug = sanitizeSlug(body.slug || name || `shop-${user.id.slice(-5)}`);

      if (name.length < 3) return sendJson(res, 400, { error: 'نام فروشگاه باید حداقل ۳ حرف باشد.' });
      if (!city) return sendJson(res, 400, { error: 'شهر و استان فروشگاه را وارد کنید.' });

      let shop = STORE.vendors.find((v) => v.ownerId === user.id);
      const finalSlug = requestedSlug || `shop-${user.id.slice(-6)}`;
      const slugConflict = STORE.vendors.find((v) => v.slug === finalSlug && (!shop || v.id !== shop.id));
      if (slugConflict) {
        return sendJson(res, 409, { error: 'این نشانی اینترنتی فروشگاه قبلاً ثبت شده است؛ نام دیگری انتخاب کنید.' });
      }

      if (shop) {
        shop.name = name;
        shop.slug = finalSlug;
        shop.city = city;
        shop.specialty = specialty;
        shop.bio = bio;
        shop.phone = phone;
        shop.coverImage = coverImage;
        shop.ownerName = cleanStr(body.ownerName, 100) || user.fullName;
        // Sync updated shop name/slug on seller's products
        STORE.vendorProducts.forEach((p) => {
          if (p.vendorId === shop.id) {
            p.vendorName = shop.name;
            p.vendorSlug = shop.slug;
            p.vendorCity = shop.city;
          }
        });
      } else {
        shop = {
          id: 'vnd_' + crypto.randomBytes(6).toString('hex'),
          ownerId: user.id,
          slug: finalSlug,
          name,
          ownerName: cleanStr(body.ownerName, 100) || user.fullName,
          city,
          specialty: specialty || 'عرضه مستقیم خشکبار و مغز دست‌اول',
          bio,
          phone,
          coverImage,
          verified: false,
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        STORE.vendors.unshift(shop);
      }

      saveStore();
      return sendJson(res, 200, { ok: true, shop });
    }

    if (req.method === 'POST' && pathname === '/api/seller/products') {
      const shop = STORE.vendors.find((v) => v.ownerId === user.id);
      if (!shop) return sendJson(res, 400, { error: 'ابتدا مشخصات فروشگاه شخصی خود را ایجاد کنید.' });

      const body = await readJsonBody(req);
      const name = cleanStr(body.name, 140);
      const category = ['pistachio-kernel', 'pistachio-slice', 'almond-kernel', 'walnut-kernel', 'in-shell'].includes(body.category)
        ? body.category
        : 'pistachio-kernel';
      const retail = Math.max(10000, Number(body.retailPrice) || 0);
      const semi = Math.max(10000, Number(body.semiPrice) || Math.round(retail * 0.92));
      const wholesale = Math.max(10000, Number(body.wholesalePrice) || Math.round(retail * 0.85));
      const stock = Math.max(0, Number(body.stock) || 0);

      if (name.length < 3 || retail <= 0) {
        return sendJson(res, 400, { error: 'نام محصول و قیمت خرده معتبر الزامی است.' });
      }

      const prod = {
        id: 'vp_' + crypto.randomBytes(6).toString('hex'),
        vendorId: shop.id,
        vendorSlug: shop.slug,
        vendorName: shop.name,
        vendorCity: shop.city,
        source: 'vendor',
        name,
        category,
        origin: cleanStr(body.origin, 80) || shop.city,
        grade: cleanStr(body.grade, 80) || 'عرضه مستقیم فروشنده',
        badge: cleanStr(body.badge, 40) || 'غرفه شخصی',
        prices: { retail, semi, wholesale },
        stock,
        rating: 4.9,
        sold: 0,
        img: sanitizeImageUrl(body.img, 'assets/img/maghz-pistachio-akbari.jpg'),
        desc: cleanStr(body.desc, 1200) || `عرضه مستقیم از ${shop.name} (${shop.city}).`,
        specs: Array.isArray(body.specs)
          ? body.specs.map((s) => cleanStr(s, 140)).filter(Boolean).slice(0, 6)
          : [`عرضه مستقیم از ${shop.name}`, `مبدأ برداشت: ${cleanStr(body.origin, 80) || shop.city}`],
        uses: ['مصرف خانگی', 'قنادی و عمده'],
        active: true,
        createdAt: new Date().toISOString(),
      };

      STORE.vendorProducts.unshift(prod);
      saveStore();
      return sendJson(res, 201, { ok: true, product: prod });
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/seller/products/')) {
      const shop = STORE.vendors.find((v) => v.ownerId === user.id);
      if (!shop) return sendJson(res, 403, { error: 'فروشگاهی برای این حساب ثبت نشده است.' });
      const pid = decodeURIComponent(pathname.slice('/api/seller/products/'.length));
      const prod = STORE.vendorProducts.find((p) => p.id === pid && p.vendorId === shop.id);
      if (!prod) return sendJson(res, 404, { error: 'محصول در غرفه شما یافت نشد.' });

      const body = await readJsonBody(req);
      if (body.name) prod.name = cleanStr(body.name, 140);
      if (body.origin) prod.origin = cleanStr(body.origin, 80);
      if (body.grade) prod.grade = cleanStr(body.grade, 80);
      if (body.badge !== undefined) prod.badge = cleanStr(body.badge, 40);
      if (body.desc !== undefined) prod.desc = cleanStr(body.desc, 1200);
      if (body.img) prod.img = sanitizeImageUrl(body.img, prod.img);
      if (body.category && ['pistachio-kernel', 'pistachio-slice', 'almond-kernel', 'walnut-kernel', 'in-shell'].includes(body.category)) {
        prod.category = body.category;
      }
      if (body.retailPrice !== undefined) prod.prices.retail = Math.max(10000, Number(body.retailPrice) || prod.prices.retail);
      if (body.semiPrice !== undefined) prod.prices.semi = Math.max(10000, Number(body.semiPrice) || prod.prices.semi);
      if (body.wholesalePrice !== undefined) prod.prices.wholesale = Math.max(10000, Number(body.wholesalePrice) || prod.prices.wholesale);
      if (body.stock !== undefined) prod.stock = Math.max(0, Number(body.stock) || 0);
      if (typeof body.active === 'boolean') prod.active = body.active;

      saveStore();
      return sendJson(res, 200, { ok: true, product: prod });
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/seller/products/')) {
      const shop = STORE.vendors.find((v) => v.ownerId === user.id);
      if (!shop) return sendJson(res, 403, { error: 'دسترسی غیرمجاز.' });
      const pid = decodeURIComponent(pathname.slice('/api/seller/products/'.length));
      const before = STORE.vendorProducts.length;
      STORE.vendorProducts = STORE.vendorProducts.filter((p) => !(p.id === pid && p.vendorId === shop.id));
      if (STORE.vendorProducts.length === before) return sendJson(res, 404, { error: 'محصول یافت نشد.' });
      saveStore();
      return sendJson(res, 200, { ok: true });
    }
  }

  /* ---------- ADMIN AUTH (FIRST-RUN CLAIM + USERNAME/PASSWORD LOGIN) ---------- */
  if (req.method === 'GET' && pathname === '/api/admin/status') {
    const cfg = getAdminConfig();
    const session = getAuthenticatedAdmin(req);
    return sendJson(res, 200, {
      configured: cfg.configured,
      envManaged: cfg.envManaged,
      authenticated: Boolean(session),
      username: session ? session.username : undefined,
    });
  }

  if (req.method === 'POST' && pathname === '/api/admin/claim') {
    const cfg = getAdminConfig();
    if (cfg.configured) {
      return sendJson(res, 409, { error: 'حساب مدیر قبلاً تنظیم شده است؛ از فرم ورود استفاده کنید.' });
    }
    const body = await readJsonBody(req);
    const username = cleanStr(body.username, 64).toLowerCase();
    const password = String(body.password || '');
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      return sendJson(res, 400, { error: 'نام کاربری مدیر باید ۳ تا ۴۰ کاراکتر انگلیسی یا عدد باشد.' });
    }
    if (password.length < 4) {
      return sendJson(res, 400, { error: 'رمز عبور مدیر باید حداقل ۴ کاراکتر باشد.' });
    }
    const record = {
      username,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(ADMIN_AUTH_PATH, JSON.stringify(record, null, 2), { mode: 0o600 });
    const token = signToken({ kind: 'admin', username }, 60 * 60 * 12);
    return sendJson(
      res,
      201,
      { ok: true, username, token },
      { 'Set-Cookie': makeCookieHeader(req, 'mgz_admin_session', token, 60 * 60 * 12) }
    );
  }

  if (req.method === 'POST' && pathname === '/api/admin/login') {
    if (!checkRateLimit(`admlogin:${clientIp}`, 15, 60_000)) {
      return sendJson(res, 429, { error: 'تلاش‌های ورود مدیر زیاد است؛ کمی بعد تلاش کنید.' });
    }
    const cfg = getAdminConfig();
    if (!cfg.configured) {
      return sendJson(res, 400, { error: 'ابتدا حساب مدیر را در فرم تنظیم اولیه تعریف کنید.' });
    }
    const body = await readJsonBody(req);
    const username = cleanStr(body.username, 64).toLowerCase();
    const password = String(body.password || '');

    const userMatch = safeEqualText(username, cfg.username.toLowerCase());
    const passMatch = cfg.envManaged
      ? safeEqualText(password, cfg.passwordPlain)
      : verifyPassword(password, cfg.passwordHash);

    if (!userMatch || !passMatch) {
      return sendJson(res, 401, { error: 'نام کاربری یا رمز عبور مدیر اشتباه است.' });
    }
    const token = signToken({ kind: 'admin', username: cfg.username }, 60 * 60 * 12);
    return sendJson(
      res,
      200,
      { ok: true, username: cfg.username, token },
      { 'Set-Cookie': makeCookieHeader(req, 'mgz_admin_session', token, 60 * 60 * 12) }
    );
  }

  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    return sendJson(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': clearCookieHeader(req, 'mgz_admin_session') }
    );
  }

  /* ---------- PROTECTED ADMIN API ROUTES (/api/admin/*) ---------- */
  if (pathname.startsWith('/api/admin/')) {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return sendJson(res, 401, { error: 'دسترسی مدیریت احراز نشده است.' });
    }

    if (req.method === 'GET' && pathname === '/api/admin/overview') {
      const houseProducts = getHouseProducts();
      const validOrders = STORE.orders.filter((o) => o.status !== 'canceled');
      const totalRevenue = validOrders.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);
      const totalKgSold = Math.round(validOrders.reduce((s, o) => s + (Number(o.totalKg) || 0), 0) * 100) / 100;
      const walletLiability = STORE.users.reduce((s, u) => s + Math.max(0, Math.round(Number(u.walletBalance) || 0)), 0);
      const totalTopups = STORE.transactions
        .filter((t) => t.type === 'topup' || t.type === 'admin_credit')
        .reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0);
      const totalWalletPayments = STORE.transactions
        .filter((t) => t.type === 'order_payment')
        .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
      const pendingOrdersCount = STORE.orders.filter((o) => o.status === 'new' || o.status === 'processing').length;
      const openTicketsCount = STORE.tickets.filter((t) => t.status === 'open').length;
      const activeVendorsCount = STORE.vendors.filter((v) => v.status === 'active').length;
      const lowStockProducts = houseProducts.filter((p) => Number(p.stock) <= 35).slice(0, 6);

      // Build 7-day executive revenue & wallet-topup series
      const now = new Date();
      const dailySeries = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const y = d.getFullYear();
        const m = d.getMonth();
        const day = d.getDate();
        const label = d.toLocaleDateString('fa-IR', { month: 'numeric', day: 'numeric' });
        const rev = validOrders
          .filter((o) => {
            const od = new Date(o.createdAt);
            return od.getFullYear() === y && od.getMonth() === m && od.getDate() === day;
          })
          .reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);
        const topup = STORE.transactions
          .filter((t) => {
            const td = new Date(t.createdAt);
            return (t.type === 'topup' || t.type === 'admin_credit') && td.getFullYear() === y && td.getMonth() === m && td.getDate() === day;
          })
          .reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0);
        dailySeries.push({ label, revenue: rev, topup });
      }

      // Category distribution across merged catalog
      const merged = getMergedCatalog();
      const catNames = {
        'pistachio-kernel': 'مغز پسته',
        'pistachio-slice': 'خلال و پودر پسته',
        'almond-kernel': 'مغز بادام',
        'walnut-kernel': 'مغز گردو',
        'in-shell': 'پسته پوست‌دار',
      };
      const catCounts = {};
      merged.forEach((p) => {
        const k = catNames[p.category] || 'سایر';
        catCounts[k] = (catCounts[k] || 0) + 1;
      });
      const categoryBreakdown = Object.entries(catCounts).map(([label, count]) => ({
        label,
        count,
        pct: Math.round((count / Math.max(1, merged.length)) * 100),
      }));

      return sendJson(res, 200, {
        admin,
        analytics: {
          totalRevenue,
          totalKgSold,
          walletLiability,
          totalTopups,
          totalWalletPayments,
          pendingOrdersCount,
          openTicketsCount,
          activeVendorsCount,
          lowStockProducts,
          dailySeries,
          categoryBreakdown,
        },
        houseProducts,
        vendors: STORE.vendors,
        vendorProducts: STORE.vendorProducts,
        articles: STORE.articles,
        orders: STORE.orders,
        supplyOffers: STORE.supplyOffers,
        transactions: STORE.transactions,
        tickets: STORE.tickets,
        users: STORE.users.map(publicUser),
        cms: STORE.cms,
        coupons: STORE.coupons || [],
        reviews: STORE.reviews || [],
        questions: STORE.questions || [],
        payouts: STORE.payouts || [],
        subscriptions: STORE.subscriptions || [],
        priceAlerts: STORE.priceAlerts || [],
        auditLogs: (STORE.auditLogs || []).slice(0, 60),
      });
    }

    if (req.method === 'POST' && pathname.startsWith('/api/admin/users/') && pathname.endsWith('/wallet')) {
      const uid = decodeURIComponent(pathname.slice('/api/admin/users/'.length, -'/wallet'.length));
      const targetUser = STORE.users.find((u) => u.id === uid);
      if (!targetUser) return sendJson(res, 404, { error: 'کاربر مورد نظر یافت نشد.' });
      const body = await readJsonBody(req);
      const direction = body.direction === 'debit' ? 'debit' : 'credit';
      const rawAmt = Math.round(Number(body.amount) || 0);
      if (!Number.isFinite(rawAmt) || rawAmt < 10000 || rawAmt > 1000000000) {
        return sendJson(res, 400, { error: 'مبلغ عملیات مالی باید بین ۱۰٬۰۰۰ تا ۱٬۰۰۰٬۰۰۰٬۰۰۰ تومان باشد.' });
      }
      const curBal = Math.max(0, Math.round(Number(targetUser.walletBalance) || 0));
      if (direction === 'debit' && curBal < rawAmt) {
        return sendJson(res, 400, { error: 'مبلغ کسر بیشتر از موجودی فعلی کیف پول کاربر است.' });
      }
      const note = cleanStr(body.note, 240) || (direction === 'credit' ? 'شارژ دستی توسط مدیریت' : 'کسر اعتباری توسط مدیریت');
      const tx = recordWalletTx({
        user: targetUser,
        type: direction === 'credit' ? 'admin_credit' : 'admin_debit',
        amount: direction === 'credit' ? rawAmt : -rawAmt,
        method: `عملیات مدیر (${admin.username})`,
        note,
      });
      recordAudit(admin.username, direction === 'credit' ? 'شارژ دستی کیف پول' : 'کسر اعتباری کیف پول', `${targetUser.fullName || targetUser.username}: ${rawAmt.toLocaleString('fa-IR')} تومان`);
      saveStore();
      return sendJson(res, 200, { ok: true, user: publicUser(targetUser), transaction: tx });
    }

    if (req.method === 'POST' && pathname.startsWith('/api/admin/tickets/') && pathname.endsWith('/reply')) {
      const tid = decodeURIComponent(pathname.slice('/api/admin/tickets/'.length, -'/reply'.length));
      const ticket = STORE.tickets.find((t) => t.id === tid);
      if (!ticket) return sendJson(res, 404, { error: 'تیکت یافت نشد.' });
      const body = await readJsonBody(req);
      const text = cleanStr(body.text, 1500);
      if (text.length < 2) return sendJson(res, 400, { error: 'متن پاسخ مدیر الزامی است.' });
      const nowIso = new Date().toISOString();
      ticket.messages.push({ sender: 'admin', senderName: `پشتیبانی مغزدانه (${admin.username})`, text, createdAt: nowIso });
      ticket.status = body.close ? 'closed' : 'answered';
      ticket.updatedAt = nowIso;
      saveStore();
      return sendJson(res, 200, { ok: true, ticket });
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/admin/tickets/')) {
      const tid = decodeURIComponent(pathname.slice('/api/admin/tickets/'.length));
      const ticket = STORE.tickets.find((t) => t.id === tid);
      if (!ticket) return sendJson(res, 404, { error: 'تیکت یافت نشد.' });
      const body = await readJsonBody(req);
      if (['open', 'answered', 'closed'].includes(body.status)) {
        ticket.status = body.status;
        ticket.updatedAt = new Date().toISOString();
        saveStore();
      }
      return sendJson(res, 200, { ok: true, ticket });
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/admin/cms/')) {
      const docId = cleanStr(pathname.slice('/api/admin/cms/'.length), 40);
      if (!['home', 'branding', 'pages'].includes(docId)) {
        return sendJson(res, 400, { error: 'شناسه سند نامعتبر است.' });
      }
      const body = await readJsonBody(req);
      STORE.cms[docId] = { ...(STORE.cms[docId] || {}), ...body, updatedAt: new Date().toISOString() };
      saveStore();
      return sendJson(res, 200, { ok: true, data: STORE.cms[docId] });
    }

    if (req.method === 'POST' && pathname === '/api/admin/products') {
      const body = await readJsonBody(req);
      const list = [...getHouseProducts()];
      const id = sanitizeSlug(body.id || body.name) || 'prod-' + Date.now().toString(36);
      const existingIdx = list.findIndex((p) => p.id === id);
      const item = {
        id,
        name: cleanStr(body.name, 160),
        category: cleanStr(body.category, 60) || 'pistachio-kernel',
        origin: cleanStr(body.origin, 80) || 'رفسنجان',
        grade: cleanStr(body.grade, 80) || 'ممتاز',
        badge: cleanStr(body.badge, 40),
        prices: {
          retail: Math.max(0, Number(body.retailPrice ?? body.prices?.retail) || 0),
          semi: Math.max(0, Number(body.semiPrice ?? body.prices?.semi) || 0),
          wholesale: Math.max(0, Number(body.wholesalePrice ?? body.prices?.wholesale) || 0),
        },
        stock: Math.max(0, Number(body.stock) || 0),
        rating: Number(body.rating) || 4.9,
        sold: Number(body.sold) || 10,
        img: sanitizeImageUrl(body.img, 'assets/img/maghz-pistachio-akbari.jpg'),
        desc: cleanStr(body.desc, 1200),
        specs: Array.isArray(body.specs) ? body.specs : ['تازه‌برداشت ۱۴۰۵', 'سورتینگ کارگاهی'],
        uses: Array.isArray(body.uses) ? body.uses : ['آجیل', 'قنادی'],
      };
      if (existingIdx >= 0) list[existingIdx] = { ...list[existingIdx], ...item };
      else list.unshift(item);
      STORE.houseProductsOverride = list;
      saveStore();
      return sendJson(res, 200, { ok: true, product: item });
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/admin/products/')) {
      const pid = decodeURIComponent(pathname.slice('/api/admin/products/'.length));
      STORE.houseProductsOverride = getHouseProducts().filter((p) => p.id !== pid);
      saveStore();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && pathname === '/api/admin/articles') {
      const body = await readJsonBody(req);
      const title = cleanStr(body.title, 200);
      if (title.length < 4) return sendJson(res, 400, { error: 'عنوان مقاله الزامی است.' });
      const slug = sanitizeSlug(body.slug) || 'article-' + Date.now().toString(36);
      const rawBody = Array.isArray(body.body)
        ? body.body
        : String(body.body || '')
            .split(/\n+/)
            .map((s) => s.trim())
            .filter(Boolean);
      const existingIdx = STORE.articles.findIndex((a) => a.id === body.id || a.slug === slug);
      const article = {
        id: existingIdx >= 0 ? STORE.articles[existingIdx].id : 'art_' + crypto.randomBytes(5).toString('hex'),
        slug,
        category: cleanStr(body.category, 60) || 'راهنمای خرید',
        title,
        excerpt: cleanStr(body.excerpt, 360) || (rawBody[0] || '').slice(0, 180),
        coverImage: sanitizeImageUrl(body.coverImage, 'src/assets/images/article_pistachio_grading_1795350767749.jpg'),
        author: cleanStr(body.author, 80) || 'تحریریه مغزدانه',
        readMinutes: Math.max(1, Math.min(45, Number(body.readMinutes) || 5)),
        publishedAt: cleanStr(body.publishedAt, 40) || new Date().toLocaleDateString('fa-IR'),
        featured: Boolean(body.featured),
        tags: Array.isArray(body.tags) ? body.tags.slice(0, 6) : ['مغزدانه'],
        body: rawBody.length ? rawBody : [cleanStr(body.excerpt, 360)],
      };
      if (existingIdx >= 0) STORE.articles[existingIdx] = article;
      else STORE.articles.unshift(article);
      saveStore();
      return sendJson(res, 200, { ok: true, article });
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/admin/articles/')) {
      const aid = decodeURIComponent(pathname.slice('/api/admin/articles/'.length));
      STORE.articles = STORE.articles.filter((a) => a.id !== aid && a.slug !== aid);
      saveStore();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/admin/vendors/')) {
      const vid = decodeURIComponent(pathname.slice('/api/admin/vendors/'.length));
      const v = STORE.vendors.find((x) => x.id === vid);
      if (!v) return sendJson(res, 404, { error: 'غرفه یافت نشد.' });
      const body = await readJsonBody(req);
      if (['active', 'paused'].includes(body.status)) v.status = body.status;
      if (typeof body.verified === 'boolean') {
        v.verified = body.verified;
        if (v.verificationRequest) v.verificationRequest.status = body.verified ? 'approved' : 'rejected';
      }
      recordAudit(admin.username, 'تغییر وضعیت غرفه', `${v.name} (تأیید: ${v.verified ? 'بله' : 'خیر'}، وضعیت: ${v.status})`);
      saveStore();
      return sendJson(res, 200, { ok: true, vendor: v });
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/admin/orders/')) {
      const oid = decodeURIComponent(pathname.slice('/api/admin/orders/'.length));
      const ord = STORE.orders.find((o) => o.id === oid);
      if (!ord) return sendJson(res, 404, { error: 'سفارش یافت نشد.' });
      const body = await readJsonBody(req);
      if (['new', 'processing', 'shipped', 'done', 'canceled'].includes(body.status)) {
        ord.status = body.status;
        recordAudit(admin.username, 'تغییر وضعیت سفارش', `سفارش ${ord.orderCode} ← ${ord.status}`);
        saveStore();
      }
      return sendJson(res, 200, { ok: true, order: ord });
    }

    /* ---------- ADMIN: COUPONS, PAYOUTS, REVIEWS & Q&A ---------- */
    if (req.method === 'POST' && pathname === '/api/admin/coupons') {
      const body = await readJsonBody(req);
      const code = cleanStr(body.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      const type = body.type === 'fixed' ? 'fixed' : 'percent';
      const value = Math.max(1, Number(body.value) || 0);
      const minSubtotal = Math.max(0, Number(body.minSubtotal) || 0);
      const maxDiscount = Math.max(0, Number(body.maxDiscount) || 0);
      if (code.length < 3 || (type === 'percent' && value > 80)) {
        return sendJson(res, 400, { error: 'کد تخفیف (حداقل ۳ کاراکتر انگلیسی) و مقدار معتبر وارد کنید.' });
      }
      if ((STORE.coupons || []).some((c) => c.code === code)) {
        return sendJson(res, 409, { error: 'این کد تخفیف قبلاً ثبت شده است.' });
      }
      const cpn = {
        id: 'cpn_' + crypto.randomBytes(5).toString('hex'),
        code,
        type,
        value,
        maxDiscount: type === 'fixed' ? value : maxDiscount,
        minSubtotal,
        active: true,
        note: cleanStr(body.note, 160),
        usedCount: 0,
        createdAt: new Date().toISOString(),
      };
      STORE.coupons.unshift(cpn);
      recordAudit(admin.username, 'ایجاد کد تخفیف', `کد ${code} (${type === 'percent' ? value + '٪' : value.toLocaleString('fa-IR') + ' تومان'})`);
      saveStore();
      return sendJson(res, 201, { ok: true, coupon: cpn });
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/admin/coupons/')) {
      const cid = decodeURIComponent(pathname.slice('/api/admin/coupons/'.length));
      const cpn = (STORE.coupons || []).find((c) => c.id === cid);
      if (!cpn) return sendJson(res, 404, { error: 'کد تخفیف یافت نشد.' });
      const body = await readJsonBody(req);
      if (typeof body.active === 'boolean') cpn.active = body.active;
      recordAudit(admin.username, 'تغییر وضعیت کد تخفیف', `${cpn.code} ← ${cpn.active ? 'فعال' : 'غیرفعال'}`);
      saveStore();
      return sendJson(res, 200, { ok: true, coupon: cpn });
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/admin/coupons/')) {
      const cid = decodeURIComponent(pathname.slice('/api/admin/coupons/'.length));
      const target = (STORE.coupons || []).find((c) => c.id === cid);
      STORE.coupons = (STORE.coupons || []).filter((c) => c.id !== cid);
      if (target) recordAudit(admin.username, 'حذف کد تخفیف', target.code);
      saveStore();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/admin/payouts/')) {
      const pid = decodeURIComponent(pathname.slice('/api/admin/payouts/'.length));
      const pay = (STORE.payouts || []).find((p) => p.id === pid);
      if (!pay) return sendJson(res, 404, { error: 'درخواست تسویه یافت نشد.' });
      const body = await readJsonBody(req);
      if (['pending', 'paid', 'rejected'].includes(body.status)) {
        pay.status = body.status;
        if (body.status === 'paid') pay.paidAt = new Date().toISOString();
        recordAudit(admin.username, 'تسویه غرفه‌دار', `${pay.vendorName}: ${pay.amount.toLocaleString('fa-IR')} تومان ← ${pay.status}`);
        saveStore();
      }
      return sendJson(res, 200, { ok: true, payout: pay });
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/admin/reviews/')) {
      const rid = decodeURIComponent(pathname.slice('/api/admin/reviews/'.length));
      const rev = (STORE.reviews || []).find((r) => r.id === rid);
      if (!rev) return sendJson(res, 404, { error: 'دیدگاه یافت نشد.' });
      const body = await readJsonBody(req);
      if (typeof body.approved === 'boolean') rev.approved = body.approved;
      recordAudit(admin.username, 'مدیریت دیدگاه', `${rev.userName} (${rev.approved ? 'تأیید' : 'مخفی'})`);
      saveStore();
      return sendJson(res, 200, { ok: true, review: rev });
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/admin/reviews/')) {
      const rid = decodeURIComponent(pathname.slice('/api/admin/reviews/'.length));
      STORE.reviews = (STORE.reviews || []).filter((r) => r.id !== rid);
      recordAudit(admin.username, 'حذف دیدگاه', rid);
      saveStore();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && pathname.startsWith('/api/admin/questions/') && pathname.endsWith('/answer')) {
      const qid = decodeURIComponent(pathname.slice('/api/admin/questions/'.length, -'/answer'.length));
      const qa = (STORE.questions || []).find((q) => q.id === qid);
      if (!qa) return sendJson(res, 404, { error: 'پرسش یافت نشد.' });
      const body = await readJsonBody(req);
      const answer = cleanStr(body.answer, 1000);
      if (answer.length < 2) return sendJson(res, 400, { error: 'متن پاسخ را وارد کنید.' });
      qa.answer = answer;
      qa.answeredBy = `کارشناس مغزدانه (${admin.username})`;
      qa.answeredAt = new Date().toISOString();
      recordAudit(admin.username, 'پاسخ به پرسش محصول', qa.question.slice(0, 60));
      saveStore();
      return sendJson(res, 200, { ok: true, question: qa });
    }

    if (req.method === 'PUT' && pathname === '/api/admin/market-rates') {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.rates) || !body.rates.length) {
        return sendJson(res, 400, { error: 'لیست نرخ‌های بازار معتبر نیست.' });
      }
      const nextRates = body.rates.slice(0, 20).map((r, idx) => {
        const price = Math.max(10000, Math.min(50000000, Math.round(Number(r.wholesalePrice || r.price) || 0)));
        const pct = Math.max(-50, Math.min(50, Number(Number(r.changePct || 0).toFixed(2))));
        return {
          id: cleanStr(r.id, 40) || `mr_${idx + 1}`,
          name: cleanStr(r.name, 120) || 'محصول شاخص',
          origin: cleanStr(r.origin || r.region, 60) || 'رفسنجان',
          region: cleanStr(r.region || r.origin, 60) || 'رفسنجان',
          grade: cleanStr(r.grade, 80) || 'ممتاز',
          wholesalePrice: price,
          fobUsd: Number(r.fobUsd) > 0 ? Number(Number(r.fobUsd).toFixed(2)) : undefined,
          changePct: pct,
          trend: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
          updatedAt: new Date().toISOString(),
        };
      });
      STORE.marketRates = nextRates;
      recordAudit(admin.username, 'به‌روزرسانی نرخ روز بازار', `${nextRates.length} قلم شاخص عمده به‌روز شد`);
      saveStore();
      return sendJson(res, 200, { ok: true, rates: nextRates });
    }

    if (req.method === 'GET' && pathname === '/api/admin/integrations') {
      return sendJson(res, 200, {
        integrations: [
          {
            id: 'zarinpal',
            name: 'درگاه پرداخت شاپرک / زرین‌پال',
            envKey: 'ZARINPAL_MERCHANT_ID',
            configured: isRealEnvValue(process.env.ZARINPAL_MERCHANT_ID),
            mode: isRealEnvValue(process.env.ZARINPAL_MERCHANT_ID) ? 'live' : 'demo',
            note: 'در حالت دمو، شبیه‌ساز درگاه شاپرک با صدور کد پیگیری فعال است.',
          },
          {
            id: 'sms',
            name: 'سامانه پیامک OTP و هشدار قیمت (کاوه‌نگار / ملی‌پیامک)',
            envKey: 'SMS_API_KEY',
            configured: isRealEnvValue(process.env.SMS_API_KEY),
            mode: isRealEnvValue(process.env.SMS_API_KEY) ? 'live' : 'demo',
            note: 'در حالت دمو، کد تأیید پیامکی در صفحه پیش‌نمایش نمایش داده می‌شود.',
          },
          {
            id: 'post',
            name: 'سرویس نرخ‌دهی و رهگیری پست پیشتاز / تیپاکس',
            envKey: 'POST_API_KEY',
            configured: isRealEnvValue(process.env.POST_API_KEY),
            mode: isRealEnvValue(process.env.POST_API_KEY) ? 'live' : 'demo',
            note: 'محاسبه هوشمند کرایه بر اساس استان و وزن + صدور کد رهگیری دمو فعال است.',
          },
          {
            id: 'fx',
            name: 'شاخص زندهٔ ارز بین‌المللی (ExchangeRate-API)',
            envKey: 'PUBLIC_API',
            configured: true,
            mode: 'live',
            note: 'به‌صورت مستقیم و زنده برای نرخ صادراتی دلار، یورو و درهم متصل است.',
          },
          {
            id: 'firestore',
            name: 'دیتابیس ابری Firestore (پشتیبان و همگام‌سازی زنده)',
            envKey: 'firebase-applet-config.json',
            configured: fs.existsSync(path.join(ROOT, 'firebase-applet-config.json')),
            mode: 'hybrid',
            note: 'آماده همگام‌سازی دوطرفه با پایگاه داده ابری مغزدانه.',
          },
          {
            id: 'push',
            name: 'اعلان‌های لحظه‌ای وب‌اپلیکیشن (PWA Web Push)',
            envKey: 'VAPID_PUBLIC_KEY',
            configured: isRealEnvValue(process.env.VAPID_PUBLIC_KEY),
            mode: isRealEnvValue(process.env.VAPID_PUBLIC_KEY) ? 'live' : 'demo',
            note: 'در حالت دمو، اعلان‌های محلی مرورگر (Notification API) فعال و قابل تست است.',
          },
        ],
        rfqCount: (STORE.rfqTenders || []).length,
        preorderCount: (STORE.preorders || []).length,
        counts: {
          rfqs: (STORE.rfqTenders || []).length,
          preorders: (STORE.preorders || []).length,
          vendorReviews: (STORE.vendorReviews || []).length,
          savedCarts: Object.keys(STORE.savedCarts || {}).length,
        },
      });
    }
  }

  return sendJson(res, 404, { error: 'مسیر API یافت نشد.' });
}

/* ==========================================================================
   STATIC FILE CONFINEMENT
   ========================================================================== */
function safeResolve(urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (clean === '/' || clean === '') clean = '/index.html';
  if (BLOCKED_STATIC_PATHS.has(clean)) return null;
  // Block dotfiles, node_modules, .git, playwright temp directories
  const segments = clean.split('/').filter(Boolean);
  if (segments.some((s) => s.startsWith('.') || s === 'node_modules')) return null;

  const full = path.resolve(ROOT, '.' + clean);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

/* ==========================================================================
   HTTP SERVER
   ========================================================================== */
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname, parsedUrl.searchParams);
    } catch (err) {
      if (err && err.message === 'PAYLOAD_TOO_LARGE') {
        sendJson(res, 413, { error: 'حجم اطلاعات ارسالی بیش از حد مجاز است.' });
      } else if (err && err.message === 'INVALID_JSON') {
        sendJson(res, 400, { error: 'ساختار داده ارسالی معتبر نیست.' });
      } else {
        console.error('API error:', err);
        sendJson(res, 500, { error: 'خطای داخلی سرور رخ داد.' });
      }
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  let filePath = safeResolve(pathname);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        const notFoundPath = path.join(ROOT, '404.html');
        fs.readFile(notFoundPath, (nfErr, nfData) => {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(nfErr ? '404 Not Found' : nfData);
        });
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME[ext] || 'application/octet-stream';
      const isCode = ['.html', '.css', '.js', '.mjs', '.json', '.webmanifest'].includes(ext);
      const cacheControl = isCode
        ? 'no-cache, no-store, must-revalidate'
        : 'public, max-age=3600';

      const resHeaders = {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
      };
      if (pathname === '/sw.js') {
        resHeaders['Service-Worker-Allowed'] = '/';
      }

      res.writeHead(200, resHeaders);
      if (req.method === 'HEAD') res.end();
      else res.end(data);
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Maghzdaneh full-stack server listening on http://${HOST}:${PORT}`);
});
