/* ==========================================================================
   مغزدانه — static-api.js
   لایه اجرای کامل سمت مرورگر برای میزبانی استاتیک (GitHub Pages / PWA)
   وقتی سرور Node.js در دسترس نیست (خطای 405 یا دامنه github.io)، تمام APIهای
   کاربر، ادمین، اعلان‌ها، پروفایل، کیف پول، سفارش‌ها، نرخ روز و غرفه‌ها را
   به‌صورت شفاف و پایدار روی localStorage اجرا می‌کند.
   ========================================================================== */
(function () {
  if (window.MgzStaticApi) return;

  const STORE_KEY = 'maghzdaneh_static_store_v1';
  const SESSION_KEY = 'maghzdaneh_static_session_v1';
  let _bootPromise = null;
  let _dbCache = null;

  function nowIso() {
    return new Date().toISOString();
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function makeError(status, message) {
    const err = new Error(message || `خطا (${status})`);
    err.status = status;
    err.data = { error: message };
    return err;
  }

  function defaultUserNotifyPrefs() {
    return {
      orderUpdates: true,
      walletAlerts: true,
      supportReplies: true,
      priceDrops: true,
      marketingSms: false,
    };
  }

  function defaultAdminProfile() {
    return {
      fullName: 'مدیر ارشد مغزدانه',
      title: 'مدیر اجرایی و ناظر بازارچه',
      email: 'admin@maghzdaneh.ir',
      phone: '021-91008080',
      avatarColor: 'gold',
      notifyPrefs: {
        newOrders: true,
        openTickets: true,
        pendingPayouts: true,
        supplyAndRfq: true,
        lowStock: true,
        community: true,
      },
      updatedAt: null,
    };
  }

  function defaultMarketRates() {
    const updatedAt = nowIso();
    return [
      { id: 'mr-akbari', name: 'مغز پسته اکبری ممتاز صادراتی', origin: 'رفسنجان', grade: 'سوپر گرید AAA', unit: 'تومان / کیلو', retail: 1680000, semi: 1540000, wholesale: 1410000, changePct: 1.8, updatedAt },
      { id: 'mr-green', name: 'مغز پسته سبز کال قنادی', origin: 'قزوین و رفسنجان', grade: 'سبز طبیعی S1', unit: 'تومان / کیلو', retail: 2350000, semi: 2180000, wholesale: 1990000, changePct: 2.4, updatedAt },
      { id: 'mr-fandoghi', name: 'مغز پسته فندقی دست‌چین', origin: 'کرمان', grade: 'گرید A+', unit: 'تومان / کیلو', retail: 1380000, semi: 1260000, wholesale: 1150000, changePct: 0.9, updatedAt },
      { id: 'mr-sliver', name: 'خلال پسته سبز طبیعی قزوین', origin: 'بوئین‌زهرا', grade: 'ممتاز بدون رنگ', unit: 'تومان / کیلو', retail: 2580000, semi: 2390000, wholesale: 2180000, changePct: 1.5, updatedAt },
      { id: 'mr-almond', name: 'مغز بادام مامایی درشت', origin: 'سامان، چهارمحال', grade: 'صادراتی بدون تلخی', unit: 'تومان / کیلو', retail: 1190000, semi: 1090000, wholesale: 985000, changePct: -0.6, updatedAt },
      { id: 'mr-walnut', name: 'مغز گردوی سفید پرچرب دوقلو', origin: 'تویسرکان', grade: 'سفید صدفی درجه ۱', unit: 'تومان / کیلو', retail: 1240000, semi: 1130000, wholesale: 1020000, changePct: 1.2, updatedAt },
    ];
  }

  function defaultCoupons() {
    return [
      { id: 'cp-welcome', code: 'MAGHZ10', title: 'تخفیف خوش‌آمدگویی ۱۰٪', type: 'percent', value: 10, maxDiscount: 500000, minOrder: 500000, active: true, usedCount: 14, createdAt: nowIso() },
      { id: 'cp-wholesale', code: 'OMDEH300', title: 'تخفیف سفارش عمده ۳۰۰ هزار تومان', type: 'fixed', value: 300000, maxDiscount: 300000, minOrder: 3000000, active: true, usedCount: 6, createdAt: nowIso() },
    ];
  }

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function writeSession(sess) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(sess || {}));
    } catch {}
  }

  async function ensureBaseData() {
    if (_dbCache) return _dbCache;
    let db = { products: [], site: {}, categories: [], tiers: [] };
    let seed = { vendors: [], vendorProducts: [], articles: [], marketRates: [] };
    try {
      const r = await fetch('./data/db.json', { cache: 'no-cache' });
      if (r.ok) db = await r.json();
    } catch {}
    try {
      const s = await fetch('./data/marketplace-seed.json', { cache: 'no-cache' });
      if (s.ok) seed = await s.json();
    } catch {}
    _dbCache = { db, seed };
    return _dbCache;
  }

  function loadStoreSync() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }

  function saveStore(st) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(st));
    } catch {}
  }

  async function getStore() {
    if (_bootPromise) return _bootPromise;
    _bootPromise = (async () => {
      const { db, seed } = await ensureBaseData();
      let st = loadStoreSync();
      if (!st || !Array.isArray(st.users)) {
        const now = nowIso();
        const demoUserId = 'usr-demo-user';
        st = {
          adminCreds: { username: 'admin', password: 'admin' },
          adminProfile: defaultAdminProfile(),
          adminReadNotificationIds: [],
          users: [
            {
              id: demoUserId,
              username: 'user',
              password: 'user',
              fullName: 'کاربر نمونه مغزدانه',
              email: 'user@maghzdaneh.ir',
              phone: '09120000001',
              buyerType: 'retail',
              province: 'تهران',
              city: 'تهران',
              postalCode: '1968635111',
              address: 'تهران، خیابان ولیعصر، بلوار اسفندیار، پلاک ۴۲، واحد ۳',
              bio: 'خریدار تخصصی مغز پسته صادراتی و آجیل تازه',
              avatarColor: 'emerald',
              notifyPrefs: defaultUserNotifyPrefs(),
              readNotificationIds: [],
              authMethod: 'password',
              walletBalance: 5000000,
              addresses: [
                {
                  id: 'addr-demo-1',
                  label: 'منزل — تهران',
                  receiver: 'کاربر نمونه مغزدانه',
                  phone: '09120000001',
                  province: 'تهران',
                  city: 'تهران',
                  postalCode: '1968635111',
                  address: 'تهران، خیابان ولیعصر، بلوار اسفندیار، پلاک ۴۲، واحد ۳',
                },
              ],
              favoriteIds: (db.products || []).slice(0, 2).map((p) => p.id),
              cart: [],
              createdAt: now,
            },
          ],
          orders: [
            {
              id: 'MGZ-1405-8421',
              trackingCode: 'MGZ-1405-8421',
              userId: demoUserId,
              customer: { name: 'کاربر نمونه مغزدانه', phone: '09120000001', city: 'تهران', province: 'تهران', address: 'تهران، بلوار اسفندیار، پلاک ۴۲' },
              items: [
                { id: (db.products[0] && db.products[0].id) || 'pistachio-akbari', name: (db.products[0] && db.products[0].name) || 'مغز پسته اکبری ممتاز', qty: 1, tier: 'retail', unitPrice: 1680000, total: 1680000 },
              ],
              totalKg: 1,
              subtotal: 1680000,
              discount: 0,
              shippingCost: 0,
              grandTotal: 1680000,
              paymentMethod: 'wallet',
              paymentStatus: 'paid',
              status: 'processing',
              createdAt: now,
            },
          ],
          transactions: [
            {
              id: 'tx-demo-1',
              userId: demoUserId,
              type: 'topup',
              amount: 6680000,
              balanceAfter: 6680000,
              method: 'درگاه آنلاین بانکی',
              note: 'شارژ اولیه کیف پول (حالت دمو GitHub Pages)',
              createdAt: now,
            },
            {
              id: 'tx-demo-2',
              userId: demoUserId,
              type: 'order_payment',
              amount: -1680000,
              balanceAfter: 5000000,
              method: 'پرداخت از کیف پول',
              note: 'پرداخت سفارش MGZ-1405-8421',
              createdAt: now,
            },
          ],
          tickets: [
            {
              id: 'TKT-1001',
              userId: demoUserId,
              userName: 'کاربر نمونه مغزدانه',
              subject: 'استعلام زمان ارسال سفارش MGZ-1405-8421',
              category: 'سفارش و ارسال',
              status: 'answered',
              messages: [
                { sender: 'user', senderName: 'کاربر نمونه مغزدانه', text: 'سلام، سفارش بنده چه زمانی تحویل پیک می‌شود؟', createdAt: now },
                { sender: 'admin', senderName: 'پشتیبانی مغزدانه', text: 'سلام وقت بخیر؛ بسته شما وکیوم شده و امروز بعدازظهر تحویل پیک اکسپرس می‌شود.', createdAt: now },
              ],
              createdAt: now,
              updatedAt: now,
            },
          ],
          vendors: Array.isArray(seed.vendors) ? seed.vendors : [],
          vendorProducts: Array.isArray(seed.vendorProducts) ? seed.vendorProducts : [],
          houseProductsOverride: null,
          articles: Array.isArray(seed.articles) ? seed.articles : [],
          marketRates: Array.isArray(seed.marketRates) && seed.marketRates.length ? seed.marketRates : defaultMarketRates(),
          coupons: defaultCoupons(),
          reviews: Array.isArray(seed.reviews) ? seed.reviews : [],
          questions: Array.isArray(seed.questions) ? seed.questions : [],
          payouts: [],
          subscriptions: [],
          supplyOffers: [],
          rfqs: [],
          preorders: [],
          priceAlerts: [],
          messages: [],
          cms: {
            home: {},
            branding: {},
            pages: {},
          },
          auditLogs: [
            { id: 'aud-1', actor: 'system', action: 'static_runtime_boot', target: 'GitHub Pages', note: 'محیط تعاملی استاتیک با داده‌های نمونه آماده شد', createdAt: now },
          ],
        };
        saveStore(st);
      }
      return st;
    })();
    return _bootPromise;
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
      bio: u.bio || '',
      avatarColor: u.avatarColor || 'emerald',
      notifyPrefs: { ...defaultUserNotifyPrefs(), ...(u.notifyPrefs || {}) },
      authMethod: u.authMethod || 'password',
      walletBalance: Math.max(0, Math.round(Number(u.walletBalance) || 0)),
      addresses: Array.isArray(u.addresses) ? u.addresses : [],
      favoriteIds: Array.isArray(u.favoriteIds) ? u.favoriteIds : [],
      createdAt: u.createdAt,
    };
  }

  function getAdminProfile(st) {
    const base = defaultAdminProfile();
    const saved = st.adminProfile || {};
    return { ...base, ...saved, notifyPrefs: { ...base.notifyPrefs, ...(saved.notifyPrefs || {}) } };
  }

  function getHouseProducts(st, baseDb) {
    if (Array.isArray(st.houseProductsOverride) && st.houseProductsOverride.length) {
      return st.houseProductsOverride;
    }
    return (baseDb.products || []).map((p) => ({ ...p, source: 'house', vendorName: 'عرضه مستقیم مغزدانه' }));
  }

  function getMergedCatalog(st, baseDb) {
    const house = getHouseProducts(st, baseDb).map((p) => ({ ...p, source: 'house', vendorName: 'عرضه مستقیم مغزدانه' }));
    const vendorMap = new Map((st.vendors || []).map((v) => [v.id, v]));
    const vp = (st.vendorProducts || [])
      .filter((p) => p.active !== false)
      .map((p) => {
        const v = vendorMap.get(p.vendorId);
        return { ...p, source: 'vendor', vendorName: (v && v.name) || p.vendorName || 'غرفه فروشنده' };
      });
    return [...house, ...vp];
  }

  function buildUserNotifications(st, user) {
    const readSet = new Set(Array.isArray(user.readNotificationIds) ? user.readNotificationIds : []);
    const items = [];
    const statusFa = { new: 'ثبت شد', processing: 'در حال آماده‌سازی', shipped: 'ارسال شد', delivered: 'تحویل داده شد', canceled: 'لغو شد' };
    (st.orders || []).filter((o) => o.userId === user.id).slice(0, 12).forEach((o) => {
      const id = `ord:${o.id}:${o.status}`;
      items.push({
        id,
        category: 'orders',
        severity: o.status === 'shipped' || o.status === 'delivered' ? 'success' : 'info',
        title: `سفارش ${o.id} — ${statusFa[o.status] || o.status}`,
        body: `مبلغ کل: ${Number(o.grandTotal || 0).toLocaleString('fa-IR')} تومان`,
        targetView: 'orders',
        createdAt: o.updatedAt || o.createdAt,
        read: readSet.has(id),
      });
    });
    (st.transactions || []).filter((t) => t.userId === user.id).slice(0, 10).forEach((t) => {
      const id = `tx:${t.id}`;
      items.push({
        id,
        category: 'wallet',
        severity: Number(t.amount) >= 0 ? 'success' : 'info',
        title: Number(t.amount) >= 0 ? 'افزایش موجودی کیف پول' : 'تراکنش کیف پول',
        body: `${t.note || t.method || 'تراکنش مالی'} (${Math.abs(Number(t.amount) || 0).toLocaleString('fa-IR')} تومان)`,
        targetView: 'wallet',
        createdAt: t.createdAt,
        read: readSet.has(id),
      });
    });
    (st.tickets || []).filter((t) => t.userId === user.id).slice(0, 8).forEach((t) => {
      const id = `tkt:${t.id}:${(t.messages || []).length}`;
      items.push({
        id,
        category: 'support',
        severity: t.status === 'answered' ? 'high' : 'info',
        title: `تیکت پشتیبانی: ${t.subject}`,
        body: t.status === 'answered' ? 'پاسخ کارشناس پشتیبانی ثبت شد.' : 'تیکت شما در صف بررسی قرار دارد.',
        targetView: 'tickets',
        createdAt: t.updatedAt || t.createdAt,
        read: readSet.has(id),
      });
    });
    const sysId = 'sys:ghpages-welcome';
    items.push({
      id: sysId,
      category: 'system',
      severity: 'info',
      title: 'خوش آمدید به داشبورد مغزدانه',
      body: 'اطلاعات پروفایل، کیف پول و اعلان‌های شما با موفقیت آماده شده است.',
      targetView: 'profile',
      createdAt: user.createdAt || nowIso(),
      read: readSet.has(sysId),
    });
    items.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
    return { notifications: items, unreadCount: items.filter((n) => !n.read).length };
  }

  function buildAdminNotifications(st, baseDb) {
    const readSet = new Set(Array.isArray(st.adminReadNotificationIds) ? st.adminReadNotificationIds : []);
    const prefs = getAdminProfile(st).notifyPrefs;
    const items = [];
    if (prefs.newOrders !== false) {
      (st.orders || []).filter((o) => o.status === 'new' || o.status === 'processing').slice(0, 10).forEach((o) => {
        const id = `aord:${o.id}:${o.status}`;
        items.push({
          id,
          category: 'orders',
          severity: 'high',
          title: `سفارش فعال ${o.id}`,
          body: `${(o.customer && o.customer.name) || 'خریدار'} — ${Number(o.grandTotal || 0).toLocaleString('fa-IR')} تومان`,
          targetView: 'orders',
          createdAt: o.createdAt,
          read: readSet.has(id),
        });
      });
    }
    if (prefs.openTickets !== false) {
      (st.tickets || []).filter((t) => t.status !== 'closed').slice(0, 8).forEach((t) => {
        const id = `atkt:${t.id}:${(t.messages || []).length}`;
        items.push({
          id,
          category: 'tickets',
          severity: t.status === 'open' ? 'high' : 'info',
          title: `تیکت: ${t.subject}`,
          body: `از طرف ${t.userName || 'کاربر'}`,
          targetView: 'tickets',
          createdAt: t.updatedAt || t.createdAt,
          read: readSet.has(id),
        });
      });
    }
    if (prefs.pendingPayouts !== false) {
      (st.payouts || []).filter((p) => p.status === 'pending').forEach((p) => {
        const id = `apay:${p.id}`;
        items.push({
          id,
          category: 'payouts',
          severity: 'high',
          title: `درخواست تسویه غرفه ${p.vendorName || ''}`,
          body: `${Number(p.amount || 0).toLocaleString('fa-IR')} تومان در انتظار تأیید`,
          targetView: 'payouts',
          createdAt: p.createdAt,
          read: readSet.has(id),
        });
      });
    }
    if (prefs.lowStock !== false) {
      getHouseProducts(st, baseDb).filter((p) => Number(p.stock || 100) <= 35).slice(0, 5).forEach((p) => {
        const id = `astk:${p.id}`;
        items.push({
          id,
          category: 'inventory',
          severity: 'warn',
          title: `هشدار موجودی: ${p.name}`,
          body: `موجودی انبار به ${p.stock} کیلو رسیده است.`,
          targetView: 'products',
          createdAt: nowIso(),
          read: readSet.has(id),
        });
      });
    }
    items.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
    return { notifications: items, unreadCount: items.filter((n) => !n.read).length };
  }

  function computeLoyalty(totalSpent, orderCount) {
    const points = Math.floor(totalSpent / 100000) + orderCount * 20;
    if (totalSpent >= 30000000) return { tier: 'الماس', code: 'diamond', points, nextTier: null, progressPct: 100, perk: 'ارسال رایگان + اولویت بار صادراتی' };
    if (totalSpent >= 10000000) return { tier: 'طلایی', code: 'gold', points, nextTier: 'الماس', progressPct: Math.min(100, Math.round((totalSpent / 30000000) * 100)), perk: '۵٪ تخفیف وفاداری' };
    if (totalSpent >= 3000000) return { tier: 'نقره‌ای', code: 'silver', points, nextTier: 'طلایی', progressPct: Math.min(100, Math.round((totalSpent / 10000000) * 100)), perk: 'ارسال رایگان بالای ۳ میلیون' };
    return { tier: 'برنزی', code: 'bronze', points, nextTier: 'نقره‌ای', progressPct: Math.min(100, Math.round((totalSpent / 3000000) * 100)), perk: 'امتیاز در هر خرید' };
  }

  function getAuthUser(st) {
    const s = readSession();
    if (!s.userId) return null;
    return st.users.find((u) => u.id === s.userId) || null;
  }

  function getAuthAdmin(st) {
    const s = readSession();
    if (!s.adminLoggedIn) return null;
    return { username: st.adminCreds.username || 'admin', role: 'admin', staticMode: true };
  }

  function addAudit(st, actor, action, target, note) {
    st.auditLogs = st.auditLogs || [];
    st.auditLogs.unshift({ id: makeId('aud'), actor, action, target, note, createdAt: nowIso() });
    if (st.auditLogs.length > 80) st.auditLogs.length = 80;
  }

  async function handle(rawUrl, options = {}) {
    const st = await getStore();
    const { db: baseDb } = await ensureBaseData();
    const method = String(options.method || 'GET').toUpperCase();
    const uObj = new URL(rawUrl, location.origin);
    const pathname = uObj.pathname.replace(/^.*\/api\//, '/api/');
    let body = {};
    if (options.body) {
      try {
        body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      } catch {
        body = {};
      }
    }

    /* ----- Public Catalog, Market Rates, Vendors, Articles, CMS ----- */
    if (method === 'GET' && pathname === '/api/catalog') {
      return { products: getMergedCatalog(st, baseDb), cms: st.cms || {} };
    }
    if (method === 'GET' && pathname === '/api/market-rates') {
      return { rates: st.marketRates || defaultMarketRates(), updatedAt: nowIso() };
    }
    if (method === 'GET' && pathname === '/api/vendors') {
      const counts = {};
      (st.vendorProducts || []).forEach((p) => { counts[p.vendorId] = (counts[p.vendorId] || 0) + 1; });
      return { vendors: (st.vendors || []).map((v) => ({ ...v, productCount: counts[v.id] || 0 })) };
    }
    const vendorMatch = pathname.match(/^\/api\/vendors\/([^/]+)$/);
    if (method === 'GET' && vendorMatch) {
      const id = decodeURIComponent(vendorMatch[1]);
      const vendor = (st.vendors || []).find((v) => v.id === id || v.slug === id);
      if (!vendor) throw makeError(404, 'غرفه مورد نظر پیدا نشد.');
      const products = (st.vendorProducts || []).filter((p) => p.vendorId === vendor.id && p.active !== false);
      return { vendor, products };
    }
    const vendorRevMatch = pathname.match(/^\/api\/vendors\/([^/]+)\/reviews$/);
    if (vendorRevMatch) {
      const vid = decodeURIComponent(vendorRevMatch[1]);
      if (method === 'GET') {
        const list = (st.reviews || []).filter((r) => r.vendorId === vid && r.approved !== false);
        return { reviews: list };
      }
      if (method === 'POST') {
        const rev = { id: makeId('rev'), vendorId: vid, author: body.author || 'خریدار مهمان', rating: Number(body.rating) || 5, comment: body.comment || '', approved: true, createdAt: nowIso() };
        st.reviews.unshift(rev);
        saveStore(st);
        return { ok: true, review: rev };
      }
    }
    const vendorMsgMatch = pathname.match(/^\/api\/vendors\/([^/]+)\/messages$/);
    if (method === 'POST' && vendorMsgMatch) {
      const user = getAuthUser(st);
      const vid = decodeURIComponent(vendorMsgMatch[1]);
      const msg = { id: makeId('msg'), vendorId: vid, userId: user ? user.id : null, senderName: body.name || (user && user.fullName) || 'مهمان', phone: body.phone || (user && user.phone) || '', body: body.body || body.message || '', replies: [], createdAt: nowIso() };
      st.messages.unshift(msg);
      saveStore(st);
      return { ok: true, message: msg };
    }
    if (method === 'GET' && pathname === '/api/articles') {
      return { articles: st.articles || [] };
    }
    const artMatch = pathname.match(/^\/api\/articles\/([^/]+)$/);
    if (method === 'GET' && artMatch) {
      const slug = decodeURIComponent(artMatch[1]);
      const art = (st.articles || []).find((a) => a.slug === slug || a.id === slug);
      if (!art) throw makeError(404, 'مقاله یافت نشد.');
      return { article: art };
    }
    if (method === 'GET' && pathname === '/api/cms/pages') return { data: (st.cms && st.cms.pages) || {} };
    if (method === 'GET' && pathname === '/api/cms/home') return { data: (st.cms && st.cms.home) || {} };
    if (method === 'GET' && pathname === '/api/cms/branding') return { data: (st.cms && st.cms.branding) || {} };

    /* ----- Product Reviews & Q&A ----- */
    const prodRevMatch = pathname.match(/^\/api\/products\/([^/]+)\/reviews$/);
    if (prodRevMatch) {
      const pid = decodeURIComponent(prodRevMatch[1]);
      if (method === 'GET') {
        return { reviews: (st.reviews || []).filter((r) => r.productId === pid && r.approved !== false) };
      }
      if (method === 'POST') {
        const rev = { id: makeId('rev'), productId: pid, author: body.author || 'خریدار', rating: Number(body.rating) || 5, comment: body.comment || '', approved: true, createdAt: nowIso() };
        st.reviews.unshift(rev);
        saveStore(st);
        return { ok: true, review: rev };
      }
    }
    const prodQaMatch = pathname.match(/^\/api\/products\/([^/]+)\/questions$/);
    if (prodQaMatch) {
      const pid = decodeURIComponent(prodQaMatch[1]);
      if (method === 'GET') {
        return { questions: (st.questions || []).filter((q) => q.productId === pid) };
      }
      if (method === 'POST') {
        const q = { id: makeId('qa'), productId: pid, author: body.author || 'کاربر', question: body.question || '', answer: '', createdAt: nowIso() };
        st.questions.unshift(q);
        saveStore(st);
        return { ok: true, question: q };
      }
    }

    /* ----- Coupons, Demo Gateway, Orders, Tracking, Lead Forms ----- */
    if (method === 'POST' && pathname === '/api/coupons/validate') {
      const code = String(body.code || '').trim().toUpperCase();
      const subtotal = Number(body.subtotal) || 0;
      const cp = (st.coupons || []).find((c) => c.code.toUpperCase() === code && c.active !== false);
      if (!cp) throw makeError(404, 'کد تخفیف معتبر نیست یا منقضی شده است.');
      if (cp.minOrder && subtotal < cp.minOrder) throw makeError(400, `حداقل مبلغ سفارش برای این کد ${cp.minOrder.toLocaleString('fa-IR')} تومان است.`);
      const discount = cp.type === 'percent' ? Math.min(Math.round((subtotal * cp.value) / 100), cp.maxDiscount || Infinity) : Math.min(subtotal, cp.value);
      return { valid: true, coupon: { ...cp, discount } };
    }
    if (method === 'POST' && pathname === '/api/payments/demo-gateway') {
      return { ok: true, refId: 'SHP-' + Math.floor(100000 + Math.random() * 900000), status: 'paid', demo: true };
    }
    if (method === 'POST' && pathname === '/api/orders') {
      const user = getAuthUser(st);
      const id = 'MGZ-' + Math.floor(100000 + Math.random() * 899999);
      const grandTotal = Math.max(0, Math.round(Number(body.grandTotal || (body.totals && body.totals.grand) || 0)));
      if (body.paymentMethod === 'wallet') {
        if (!user) throw makeError(401, 'برای پرداخت از کیف پول ابتدا وارد حساب کاربری شوید.');
        if (user.walletBalance < grandTotal) throw makeError(400, 'موجودی کیف پول کافی نیست.');
        user.walletBalance -= grandTotal;
        st.transactions.unshift({ id: makeId('tx'), userId: user.id, type: 'order_payment', amount: -grandTotal, balanceAfter: user.walletBalance, method: 'کیف پول مغزدانه', note: `پرداخت سفارش ${id}`, createdAt: nowIso() });
      }
      const ord = {
        id,
        trackingCode: id,
        userId: user ? user.id : null,
        customer: body.customer || {},
        items: Array.isArray(body.items) ? body.items : [],
        totalKg: Number(body.totalKg || (body.totals && body.totals.totalKg) || 1),
        subtotal: Number(body.subtotal || (body.totals && body.totals.subtotal) || grandTotal),
        discount: Number(body.discount || (body.totals && body.totals.discount) || 0),
        shippingCost: Number(body.shippingCost || (body.totals && body.totals.shipCost) || 0),
        grandTotal,
        paymentMethod: body.paymentMethod || 'online',
        paymentStatus: 'paid',
        status: 'new',
        createdAt: nowIso(),
      };
      st.orders.unshift(ord);
      saveStore(st);
      return { ok: true, order: ord };
    }
    const trackMatch = pathname.match(/^\/api\/orders\/track\/([^/]+)$/);
    if (method === 'GET' && trackMatch) {
      const code = decodeURIComponent(trackMatch[1]).trim().toUpperCase();
      const ord = (st.orders || []).find((o) => String(o.id).toUpperCase() === code || String(o.trackingCode || '').toUpperCase() === code);
      if (!ord) throw makeError(404, 'سفارشی با این کد پیگیری یافت نشد.');
      return { order: ord };
    }
    if (method === 'POST' && pathname === '/api/rfq') {
      const rec = { id: makeId('rfq'), ...body, createdAt: nowIso() };
      st.rfqs.unshift(rec);
      saveStore(st);
      return { ok: true, rfq: rec };
    }
    if (method === 'POST' && pathname === '/api/supply') {
      const rec = { id: makeId('sup'), ...body, status: 'pending', createdAt: nowIso() };
      st.supplyOffers.unshift(rec);
      saveStore(st);
      return { ok: true, offer: rec };
    }
    if (method === 'POST' && pathname === '/api/preorders') {
      const rec = { id: makeId('pre'), ...body, createdAt: nowIso() };
      st.preorders.unshift(rec);
      saveStore(st);
      return { ok: true, preorder: rec };
    }
    if (method === 'POST' && pathname === '/api/price-alerts') {
      const rec = { id: makeId('alt'), ...body, createdAt: nowIso() };
      st.priceAlerts.unshift(rec);
      saveStore(st);
      return { ok: true, alert: rec };
    }

    /* ----- Customer Auth ----- */
    if (method === 'GET' && pathname === '/api/auth/me') {
      const user = getAuthUser(st);
      const admin = getAuthAdmin(st);
      const vendorShop = user ? (st.vendors || []).find((v) => v.ownerId === user.id) || null : null;
      return { user: publicUser(user), vendorShop, admin, staticMode: true };
    }
    if (method === 'POST' && pathname === '/api/auth/login') {
      const idf = String(body.identifier || body.username || body.phone || '').trim().toLowerCase();
      const pw = String(body.password || '');
      const found = st.users.find(
        (u) =>
          (String(u.username || '').toLowerCase() === idf ||
            String(u.phone || '').toLowerCase() === idf ||
            String(u.email || '').toLowerCase() === idf) &&
          String(u.password || '') === pw
      );
      if (!found) throw makeError(401, 'نام کاربری یا رمز عبور اشتباه است.');
      const sess = readSession();
      sess.userId = found.id;
      writeSession(sess);
      return { ok: true, user: publicUser(found), token: 'static-user-' + found.id, staticMode: true };
    }
    if (method === 'POST' && pathname === '/api/auth/register') {
      const username = String(body.username || '').trim().toLowerCase();
      const phone = String(body.phone || '').trim();
      const password = String(body.password || '');
      const fullName = String(body.fullName || '').trim() || username || 'کاربر جدید';
      if (!username || password.length < 4) throw makeError(400, 'نام کاربری و رمز عبور معتبر وارد کنید.');
      if (st.users.some((u) => String(u.username || '').toLowerCase() === username)) {
        throw makeError(409, 'این نام کاربری قبلاً ثبت شده است.');
      }
      const nu = {
        id: makeId('usr'),
        username,
        password,
        fullName,
        email: body.email || '',
        phone,
        buyerType: body.buyerType || 'retail',
        province: '',
        city: '',
        postalCode: '',
        address: '',
        bio: '',
        avatarColor: 'emerald',
        notifyPrefs: defaultUserNotifyPrefs(),
        readNotificationIds: [],
        authMethod: 'password',
        walletBalance: 500000,
        addresses: [],
        favoriteIds: [],
        cart: [],
        createdAt: nowIso(),
      };
      st.users.push(nu);
      saveStore(st);
      const sess = readSession();
      sess.userId = nu.id;
      writeSession(sess);
      return { ok: true, user: publicUser(nu), token: 'static-user-' + nu.id };
    }
    if (method === 'POST' && pathname === '/api/auth/otp/request') {
      return { ok: true, demoCode: '123456', message: 'کد تأیید دمو: 123456' };
    }
    if (method === 'POST' && pathname === '/api/auth/otp/verify') {
      const phone = String(body.phone || '').trim();
      const code = String(body.code || '').trim();
      if (code !== '123456') throw makeError(400, 'در حالت دمو، کد تأیید 123456 را وارد کنید.');
      let u = st.users.find((x) => x.phone === phone);
      if (!u) {
        u = {
          id: makeId('usr'),
          username: 'u' + phone.slice(-4),
          password: 'user',
          fullName: body.fullName || 'کاربر مغزدانه',
          email: '',
          phone,
          buyerType: 'retail',
          province: '',
          city: '',
          postalCode: '',
          address: '',
          bio: '',
          avatarColor: 'emerald',
          notifyPrefs: defaultUserNotifyPrefs(),
          readNotificationIds: [],
          authMethod: 'otp',
          walletBalance: 500000,
          addresses: [],
          favoriteIds: [],
          cart: [],
          createdAt: nowIso(),
        };
        st.users.push(u);
        saveStore(st);
      }
      const sess = readSession();
      sess.userId = u.id;
      writeSession(sess);
      return { ok: true, user: publicUser(u), token: 'static-user-' + u.id };
    }
    if (method === 'POST' && pathname === '/api/auth/logout') {
      const sess = readSession();
      delete sess.userId;
      writeSession(sess);
      return { ok: true };
    }
    if (method === 'POST' && pathname === '/api/auth/password/change') {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      if (body.currentPassword && body.currentPassword !== user.password) {
        throw makeError(400, 'رمز عبور فعلی نادرست است.');
      }
      if (!body.newPassword || String(body.newPassword).length < 4) {
        throw makeError(400, 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد.');
      }
      user.password = String(body.newPassword);
      saveStore(st);
      return { ok: true };
    }
    if (method === 'POST' && pathname === '/api/auth/password/reset') {
      const phone = String(body.phone || '').trim();
      const u = st.users.find((x) => x.phone === phone);
      if (!u) throw makeError(404, 'کاربری با این شماره موبایل پیدا نشد.');
      if (String(body.code || '').trim() !== '123456') throw makeError(400, 'کد تأیید دمو 123456 است.');
      u.password = String(body.newPassword || 'user');
      saveStore(st);
      return { ok: true };
    }

    /* ----- Customer Profile, Dashboard, Notifications, Wallet, Addresses, Tickets ----- */
    if (method === 'PUT' && pathname === '/api/profile') {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      ['fullName', 'email', 'phone', 'buyerType', 'province', 'city', 'postalCode', 'address', 'bio', 'avatarColor'].forEach((k) => {
        if (typeof body[k] === 'string') user[k] = body[k].trim();
      });
      if (body.notifyPrefs && typeof body.notifyPrefs === 'object') {
        user.notifyPrefs = { ...defaultUserNotifyPrefs(), ...(user.notifyPrefs || {}), ...body.notifyPrefs };
      }
      saveStore(st);
      return { ok: true, user: publicUser(user) };
    }
    if (method === 'GET' && pathname === '/api/customer/cart') {
      const user = getAuthUser(st);
      return { cart: (user && user.cart) || [] };
    }
    if (method === 'PUT' && pathname === '/api/customer/cart') {
      const user = getAuthUser(st);
      if (user && Array.isArray(body.cart)) {
        user.cart = body.cart;
        saveStore(st);
      }
      return { ok: true };
    }
    if (method === 'GET' && pathname === '/api/customer/notifications') {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      return buildUserNotifications(st, user);
    }
    if (method === 'POST' && pathname === '/api/customer/notifications/read') {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      const set = new Set(user.readNotificationIds || []);
      if (body.all) {
        buildUserNotifications(st, user).notifications.forEach((n) => set.add(n.id));
      } else if (body.id) {
        set.add(String(body.id));
      }
      user.readNotificationIds = [...set];
      saveStore(st);
      return buildUserNotifications(st, user);
    }
    if (method === 'GET' && pathname === '/api/customer/dashboard') {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      const myOrders = (st.orders || []).filter((o) => o.userId === user.id);
      const myTx = (st.transactions || []).filter((t) => t.userId === user.id);
      const myTickets = (st.tickets || []).filter((t) => t.userId === user.id);
      const myShop = (st.vendors || []).find((v) => v.ownerId === user.id) || null;
      const validOrders = myOrders.filter((o) => o.status !== 'canceled');
      const totalSpent = validOrders.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);
      const totalKg = Math.round(validOrders.reduce((s, o) => s + (Number(o.totalKg) || 0), 0) * 100) / 100;
      const totalTopups = myTx.filter((t) => t.type === 'topup' || t.type === 'admin_credit').reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0);
      const now = new Date();
      const monthlySeries = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthlySeries.push({ label: d.toLocaleDateString('fa-IR', { month: 'short' }), spent: i === 0 ? totalSpent : 0, topup: i === 0 ? totalTopups : 0 });
      }
      return {
        user: publicUser(user),
        shop: myShop,
        stats: {
          walletBalance: Math.max(0, Math.round(Number(user.walletBalance) || 0)),
          totalOrders: myOrders.length,
          activeOrdersCount: myOrders.filter((o) => ['new', 'processing', 'shipped'].includes(o.status)).length,
          totalSpent,
          totalKg,
          totalTopups,
          openTicketsCount: myTickets.filter((t) => t.status !== 'closed').length,
          loyalty: computeLoyalty(totalSpent, validOrders.length),
          monthlySeries,
        },
        orders: myOrders,
        transactions: myTx,
        tickets: myTickets,
        subscriptions: (st.subscriptions || []).filter((s) => s.userId === user.id),
      };
    }
    if (method === 'POST' && pathname === '/api/wallet/topup') {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      const amount = Math.round(Number(body.amount) || 0);
      if (amount < 50000) throw makeError(400, 'حداقل مبلغ شارژ ۵۰٬۰۰۰ تومان است.');
      user.walletBalance = Math.max(0, Number(user.walletBalance || 0)) + amount;
      const tx = { id: makeId('tx'), userId: user.id, type: 'topup', amount, balanceAfter: user.walletBalance, method: body.method || 'درگاه آنلاین بانکی', note: body.note || 'شارژ کیف پول', createdAt: nowIso() };
      st.transactions.unshift(tx);
      saveStore(st);
      return { ok: true, walletBalance: user.walletBalance, transaction: tx, user: publicUser(user) };
    }
    if (method === 'POST' && pathname === '/api/customer/addresses') {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      user.addresses = user.addresses || [];
      const addr = { id: makeId('addr'), ...body };
      user.addresses.push(addr);
      saveStore(st);
      return { ok: true, addresses: user.addresses };
    }
    const delAddrMatch = pathname.match(/^\/api\/customer\/addresses\/([^/]+)$/);
    if (method === 'DELETE' && delAddrMatch) {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      const id = decodeURIComponent(delAddrMatch[1]);
      user.addresses = (user.addresses || []).filter((a) => a.id !== id);
      saveStore(st);
      return { ok: true, addresses: user.addresses };
    }
    if (method === 'POST' && pathname === '/api/customer/favorites/toggle') {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      const pid = String(body.productId || '');
      user.favoriteIds = user.favoriteIds || [];
      const idx = user.favoriteIds.indexOf(pid);
      if (idx >= 0) user.favoriteIds.splice(idx, 1);
      else user.favoriteIds.push(pid);
      saveStore(st);
      return { ok: true, favoriteIds: user.favoriteIds };
    }
    if (method === 'POST' && pathname === '/api/customer/tickets') {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      const tkt = {
        id: 'TKT-' + Math.floor(1000 + Math.random() * 9000),
        userId: user.id,
        userName: user.fullName || user.username,
        subject: body.subject || 'تیکت پشتیبانی',
        category: body.category || 'عمومی',
        status: 'open',
        messages: [{ sender: 'user', senderName: user.fullName || user.username, text: body.message || '', createdAt: nowIso() }],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      st.tickets.unshift(tkt);
      saveStore(st);
      return { ok: true, ticket: tkt };
    }
    const tktReplyMatch = pathname.match(/^\/api\/customer\/tickets\/([^/]+)\/reply$/);
    if (method === 'POST' && tktReplyMatch) {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      const tid = decodeURIComponent(tktReplyMatch[1]);
      const tkt = (st.tickets || []).find((t) => t.id === tid && t.userId === user.id);
      if (!tkt) throw makeError(404, 'تیکت پیدا نشد.');
      tkt.messages.push({ sender: 'user', senderName: user.fullName || user.username, text: body.message || '', createdAt: nowIso() });
      tkt.status = 'open';
      tkt.updatedAt = nowIso();
      saveStore(st);
      return { ok: true, ticket: tkt };
    }
    if (method === 'GET' && pathname === '/api/customer/referral') {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      return { code: 'MGZ-' + String(user.username || 'USER').toUpperCase(), invitedCount: 2, bonusEarned: 400000 };
    }
    if (method === 'GET' && pathname === '/api/customer/messages') {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      return { messages: (st.messages || []).filter((m) => m.userId === user.id) };
    }
    const subMatch = pathname.match(/^\/api\/subscriptions(?:\/([^/]+))?$/);
    if (subMatch) {
      const user = getAuthUser(st);
      if (method === 'GET') return { subscriptions: (st.subscriptions || []).filter((s) => !user || s.userId === user.id) };
      if (method === 'POST' && !subMatch[1]) {
        const sub = { id: makeId('sub'), userId: user ? user.id : null, status: 'active', ...body, createdAt: nowIso() };
        st.subscriptions.unshift(sub);
        saveStore(st);
        return { ok: true, subscription: sub };
      }
      if (subMatch[1]) {
        const sub = (st.subscriptions || []).find((s) => s.id === decodeURIComponent(subMatch[1]));
        if (sub && body.status) { sub.status = body.status; saveStore(st); }
        return { ok: true, subscription: sub };
      }
    }

    /* ----- Vendor Portal (My Shop) ----- */
    if (method === 'POST' && pathname === '/api/vendor/shop') {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      const shop = { id: makeId('vnd'), ownerId: user.id, slug: makeId('shop'), verified: false, status: 'active', ...body, createdAt: nowIso() };
      st.vendors.unshift(shop);
      saveStore(st);
      return { ok: true, shop };
    }
    if (method === 'GET' && pathname === '/api/vendor/dashboard') {
      const user = getAuthUser(st);
      if (!user) throw makeError(401, 'ابتدا وارد حساب کاربری شوید.');
      const shop = (st.vendors || []).find((v) => v.ownerId === user.id) || null;
      const products = shop ? (st.vendorProducts || []).filter((p) => p.vendorId === shop.id) : [];
      const payouts = shop ? (st.payouts || []).filter((p) => p.vendorId === shop.id) : [];
      const messages = shop ? (st.messages || []).filter((m) => m.vendorId === shop.id) : [];
      return { shop, products, payouts, messages };
    }

    /* ----- Admin Auth & Full Admin Console ----- */
    if (method === 'GET' && pathname === '/api/admin/status') {
      const adm = getAuthAdmin(st);
      return { configured: true, authenticated: Boolean(adm), username: adm ? adm.username : undefined, staticMode: true };
    }
    if (method === 'POST' && pathname === '/api/admin/login') {
      const u = String(body.username || '').trim();
      const p = String(body.password || '');
      if (u !== st.adminCreds.username || p !== st.adminCreds.password) {
        throw makeError(401, 'نام کاربری یا رمز عبور مدیریت اشتباه است.');
      }
      const sess = readSession();
      sess.adminLoggedIn = true;
      writeSession(sess);
      addAudit(st, u, 'admin_login', 'console', 'ورود به پنل مدیریت (حالت استاتیک)');
      saveStore(st);
      return { ok: true, admin: { username: u, role: 'admin' }, token: 'static-admin-token', staticMode: true };
    }
    if (method === 'POST' && pathname === '/api/admin/logout') {
      const sess = readSession();
      sess.adminLoggedIn = false;
      writeSession(sess);
      return { ok: true };
    }

    if (pathname.startsWith('/api/admin/')) {
      const adm = getAuthAdmin(st);
      if (!adm) throw makeError(401, 'دسترسی مدیریت احراز نشده است.');

      if (method === 'GET' && pathname === '/api/admin/notifications') {
        return buildAdminNotifications(st, baseDb);
      }
      if (method === 'POST' && pathname === '/api/admin/notifications/read') {
        const set = new Set(st.adminReadNotificationIds || []);
        if (body.all) {
          buildAdminNotifications(st, baseDb).notifications.forEach((n) => set.add(n.id));
        } else if (body.id) {
          set.add(String(body.id));
        }
        st.adminReadNotificationIds = [...set];
        saveStore(st);
        return buildAdminNotifications(st, baseDb);
      }
      if (method === 'GET' && pathname === '/api/admin/profile') {
        return { profile: getAdminProfile(st), admin: adm };
      }
      if (method === 'PUT' && pathname === '/api/admin/profile') {
        const cur = getAdminProfile(st);
        ['fullName', 'title', 'email', 'phone', 'avatarColor'].forEach((k) => {
          if (typeof body[k] === 'string' && body[k].trim()) cur[k] = body[k].trim();
        });
        if (body.notifyPrefs && typeof body.notifyPrefs === 'object') {
          cur.notifyPrefs = { ...cur.notifyPrefs, ...body.notifyPrefs };
        }
        cur.updatedAt = nowIso();
        st.adminProfile = cur;
        saveStore(st);
        return { ok: true, profile: cur };
      }
      if (method === 'POST' && pathname === '/api/admin/change-password') {
        const curPw = String(body.currentPassword || '');
        const newPw = String(body.newPassword || '');
        if (curPw !== st.adminCreds.password) throw makeError(400, 'رمز عبور فعلی مدیر نادرست است.');
        if (newPw.length < 4) throw makeError(400, 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد.');
        st.adminCreds.password = newPw;
        addAudit(st, adm.username, 'admin_password_changed', 'security', 'تغییر رمز عبور پنل مدیریت');
        saveStore(st);
        return { ok: true };
      }
      if (method === 'GET' && pathname === '/api/admin/overview') {
        const houseProducts = getHouseProducts(st, baseDb);
        const validOrders = (st.orders || []).filter((o) => o.status !== 'canceled');
        const totalRevenue = validOrders.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);
        const totalKgSold = Math.round(validOrders.reduce((s, o) => s + (Number(o.totalKg) || 0), 0) * 100) / 100;
        const walletLiability = st.users.reduce((s, u) => s + Math.max(0, Math.round(Number(u.walletBalance) || 0)), 0);
        const totalTopups = (st.transactions || []).filter((t) => t.type === 'topup' || t.type === 'admin_credit').reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0);
        const totalWalletPayments = (st.transactions || []).filter((t) => t.type === 'order_payment').reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
        const now = new Date();
        const dailySeries = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
          dailySeries.push({ label: d.toLocaleDateString('fa-IR', { month: 'numeric', day: 'numeric' }), revenue: i === 0 ? totalRevenue : 0, topup: i === 0 ? totalTopups : 0 });
        }
        const merged = getMergedCatalog(st, baseDb);
        const catNames = { 'pistachio-kernel': 'مغز پسته', 'pistachio-slice': 'خلال و پودر پسته', 'almond-kernel': 'مغز بادام', 'walnut-kernel': 'مغز گردو', 'in-shell': 'پسته پوست‌دار' };
        const catCounts = {};
        merged.forEach((p) => { const k = catNames[p.category] || 'سایر'; catCounts[k] = (catCounts[k] || 0) + 1; });
        const categoryBreakdown = Object.entries(catCounts).map(([label, count]) => ({ label, count, pct: Math.round((count / Math.max(1, merged.length)) * 100) }));
        const admNotifs = buildAdminNotifications(st, baseDb);
        return {
          admin: adm,
          adminProfile: getAdminProfile(st),
          notifications: admNotifs.notifications,
          unreadNotifications: admNotifs.unreadCount,
          analytics: {
            totalRevenue,
            totalKgSold,
            walletLiability,
            totalTopups,
            totalWalletPayments,
            pendingOrdersCount: (st.orders || []).filter((o) => o.status === 'new' || o.status === 'processing').length,
            openTicketsCount: (st.tickets || []).filter((t) => t.status === 'open').length,
            activeVendorsCount: (st.vendors || []).filter((v) => v.status === 'active').length,
            lowStockProducts: houseProducts.filter((p) => Number(p.stock || 100) <= 35).slice(0, 6),
            dailySeries,
            categoryBreakdown,
          },
          houseProducts,
          vendors: st.vendors || [],
          vendorProducts: st.vendorProducts || [],
          articles: st.articles || [],
          orders: st.orders || [],
          supplyOffers: st.supplyOffers || [],
          transactions: st.transactions || [],
          tickets: st.tickets || [],
          users: st.users.map(publicUser),
          cms: st.cms || {},
          coupons: st.coupons || [],
          reviews: st.reviews || [],
          questions: st.questions || [],
          payouts: st.payouts || [],
          subscriptions: st.subscriptions || [],
          priceAlerts: st.priceAlerts || [],
          auditLogs: (st.auditLogs || []).slice(0, 60),
        };
      }
      if (method === 'PUT' && pathname === '/api/admin/market-rates') {
        if (Array.isArray(body.rates)) {
          st.marketRates = body.rates.map((r) => ({ ...r, updatedAt: nowIso() }));
          saveStore(st);
        }
        return { ok: true, rates: st.marketRates };
      }
      const userWalletMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/wallet$/);
      if (method === 'POST' && userWalletMatch) {
        const uid = decodeURIComponent(userWalletMatch[1]);
        const u = st.users.find((x) => x.id === uid);
        if (!u) throw makeError(404, 'کاربر پیدا نشد.');
        const delta = Math.round(Number(body.amount) || 0);
        u.walletBalance = Math.max(0, Number(u.walletBalance || 0) + delta);
        st.transactions.unshift({ id: makeId('tx'), userId: u.id, type: delta >= 0 ? 'admin_credit' : 'admin_debit', amount: delta, balanceAfter: u.walletBalance, method: 'تعدیل مدیریت', note: body.note || 'تعدیل دستی مدیر', createdAt: nowIso() });
        saveStore(st);
        return { ok: true, user: publicUser(u) };
      }
      const ordMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
      if ((method === 'PATCH' || method === 'PUT') && ordMatch) {
        const oid = decodeURIComponent(ordMatch[1]);
        const o = (st.orders || []).find((x) => x.id === oid);
        if (!o) throw makeError(404, 'سفارش پیدا نشد.');
        if (body.status) o.status = body.status;
        o.updatedAt = nowIso();
        saveStore(st);
        return { ok: true, order: o };
      }
      const admTktReply = pathname.match(/^\/api\/admin\/tickets\/([^/]+)\/reply$/);
      if (method === 'POST' && admTktReply) {
        const tid = decodeURIComponent(admTktReply[1]);
        const t = (st.tickets || []).find((x) => x.id === tid);
        if (!t) throw makeError(404, 'تیکت پیدا نشد.');
        t.messages.push({ sender: 'admin', senderName: getAdminProfile(st).fullName, text: body.message || '', createdAt: nowIso() });
        t.status = 'answered';
        t.updatedAt = nowIso();
        saveStore(st);
        return { ok: true, ticket: t };
      }
      const admTktPatch = pathname.match(/^\/api\/admin\/tickets\/([^/]+)$/);
      if ((method === 'PATCH' || method === 'PUT') && admTktPatch) {
        const tid = decodeURIComponent(admTktPatch[1]);
        const t = (st.tickets || []).find((x) => x.id === tid);
        if (t && body.status) { t.status = body.status; t.updatedAt = nowIso(); saveStore(st); }
        return { ok: true, ticket: t };
      }
      if (method === 'POST' && pathname === '/api/admin/products') {
        const list = getHouseProducts(st, baseDb).slice();
        const prod = { id: body.id || makeId('prod'), ...body, source: 'house', vendorName: 'عرضه مستقیم مغزدانه' };
        const idx = list.findIndex((p) => p.id === prod.id);
        if (idx >= 0) list[idx] = { ...list[idx], ...prod };
        else list.unshift(prod);
        st.houseProductsOverride = list;
        saveStore(st);
        return { ok: true, product: prod };
      }
      const delProdMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
      if (method === 'DELETE' && delProdMatch) {
        const pid = decodeURIComponent(delProdMatch[1]);
        st.houseProductsOverride = getHouseProducts(st, baseDb).filter((p) => p.id !== pid);
        saveStore(st);
        return { ok: true };
      }
      const admVndMatch = pathname.match(/^\/api\/admin\/vendors\/([^/]+)$/);
      if ((method === 'PATCH' || method === 'PUT') && admVndMatch) {
        const vid = decodeURIComponent(admVndMatch[1]);
        const v = (st.vendors || []).find((x) => x.id === vid);
        if (v) {
          if (typeof body.verified === 'boolean') v.verified = body.verified;
          if (body.status) v.status = body.status;
          saveStore(st);
        }
        return { ok: true, vendor: v };
      }
      if (method === 'PUT' && pathname === '/api/admin/cms/home') {
        st.cms.home = { ...(st.cms.home || {}), ...body };
        saveStore(st);
        return { ok: true, data: st.cms.home };
      }
      if (method === 'PUT' && pathname === '/api/admin/cms/branding') {
        st.cms.branding = { ...(st.cms.branding || {}), ...body };
        saveStore(st);
        return { ok: true, data: st.cms.branding };
      }
      if (method === 'GET' && pathname === '/api/admin/integrations') {
        return {
          mode: 'static-demo',
          items: [
            { name: 'درگاه پرداخت شاپرک / زرین‌پال', status: 'demo', desc: 'در حالت دمو GitHub Pages شبیه‌سازی می‌شود' },
            { name: 'پنل پیامک OTP', status: 'demo', desc: 'کد تأیید دمو: 123456' },
            { name: 'استعلام نرخ زنده بازار', status: 'active', desc: 'فعال روی داده‌های محلی و قابل ویرایش توسط مدیر' },
            { name: 'سرور بکند Node.js', status: 'demo', desc: 'برای اتصال دائمی روی VPS/Railway/Render مستقر کنید' },
          ],
        };
      }
      if (method === 'POST' && pathname === '/api/admin/coupons') {
        const cp = { id: makeId('cp'), usedCount: 0, active: true, ...body, createdAt: nowIso() };
        st.coupons.unshift(cp);
        saveStore(st);
        return { ok: true, coupon: cp };
      }
      const admCpMatch = pathname.match(/^\/api\/admin\/coupons\/([^/]+)$/);
      if (admCpMatch) {
        const cid = decodeURIComponent(admCpMatch[1]);
        if (method === 'DELETE') {
          st.coupons = (st.coupons || []).filter((c) => c.id !== cid);
          saveStore(st);
          return { ok: true };
        }
        const cp = (st.coupons || []).find((c) => c.id === cid);
        if (cp && typeof body.active === 'boolean') { cp.active = body.active; saveStore(st); }
        return { ok: true, coupon: cp };
      }
      const admPayMatch = pathname.match(/^\/api\/admin\/payouts\/([^/]+)$/);
      if ((method === 'PATCH' || method === 'PUT') && admPayMatch) {
        const pid = decodeURIComponent(admPayMatch[1]);
        const po = (st.payouts || []).find((p) => p.id === pid);
        if (po && body.status) { po.status = body.status; saveStore(st); }
        return { ok: true, payout: po };
      }
      const admRevMatch = pathname.match(/^\/api\/admin\/reviews\/([^/]+)$/);
      if (admRevMatch) {
        const rid = decodeURIComponent(admRevMatch[1]);
        if (method === 'DELETE') {
          st.reviews = (st.reviews || []).filter((r) => r.id !== rid);
          saveStore(st);
          return { ok: true };
        }
        const rv = (st.reviews || []).find((r) => r.id === rid);
        if (rv && typeof body.approved === 'boolean') { rv.approved = body.approved; saveStore(st); }
        return { ok: true, review: rv };
      }
      const admQaMatch = pathname.match(/^\/api\/admin\/questions\/([^/]+)\/answer$/);
      if (method === 'POST' && admQaMatch) {
        const qid = decodeURIComponent(admQaMatch[1]);
        const q = (st.questions || []).find((x) => x.id === qid);
        if (q) { q.answer = body.answer || ''; saveStore(st); }
        return { ok: true, question: q };
      }
      if (method === 'POST' && pathname === '/api/admin/articles') {
        const art = { id: makeId('art'), slug: body.slug || makeId('post'), ...body, createdAt: nowIso() };
        st.articles.unshift(art);
        saveStore(st);
        return { ok: true, article: art };
      }
      const admArtDel = pathname.match(/^\/api\/admin\/articles\/([^/]+)$/);
      if (method === 'DELETE' && admArtDel) {
        const aid = decodeURIComponent(admArtDel[1]);
        st.articles = (st.articles || []).filter((a) => a.id !== aid && a.slug !== aid);
        saveStore(st);
        return { ok: true };
      }
    }

    throw makeError(404, 'مسیر درخواست‌شده در حالت استاتیک تعریف نشده است.');
  }

  window.MgzStaticApi = { handle, reset: () => { localStorage.removeItem(STORE_KEY); localStorage.removeItem(SESSION_KEY); _bootPromise = null; } };
})();
