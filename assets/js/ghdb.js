/* ==========================================================================
   مغزدانه — ghdb.js (Phase 3)
   لایه دیتابیس مبتنی بر گیت‌هاب (GitHub Contents API):
   - خواندن عمومی از data/db.json
   - نوشتن ادمین (محصولات، تنظیمات، تغییر وضعیت سفارش، ثبت سفارش و پیشنهاد عرضه)
   - توکن فقط در localStorage مرورگر مدیر می‌ماند و هرگز هاردکد نمی‌شود
   ========================================================================== */

const GHDB = (() => {
  const CFG = {
    owner: 'mohammadaliaghaabbasi',
    repo: 'maghzdaneh',
    branch: 'main',
    dbPath: 'data/db.json',
    ordersDir: 'data/orders',
  };
  const LS_KEY = 'maghzdaneh_gh_token';

  const api = path => `https://api.github.com/repos/${CFG.owner}/${CFG.repo}/${path}`;
  const raw = path => `https://raw.githubusercontent.com/${CFG.owner}/${CFG.repo}/${CFG.branch}/${path}?t=${Date.now()}`;

  function getToken() { return localStorage.getItem(LS_KEY) || ''; }
  function setToken(t) { t ? localStorage.setItem(LS_KEY, t) : localStorage.removeItem(LS_KEY); }
  function hasToken() { return !!getToken(); }

  async function ghFetch(url, opts = {}) {
    const headers = { Accept: 'application/vnd.github+json', ...(opts.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { ...opts, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw Object.assign(new Error(body.message || ('GitHub API error ' + res.status)), { status: res.status });
    }
    return res.json();
  }

  async function fetchDB() {
    try {
      const res = await fetch(raw(CFG.dbPath), { cache: 'no-store' });
      if (res.ok) return res.json();
    } catch {}
    const localRes = await fetch(CFG.dbPath, { cache: 'no-store' });
    if (!localRes.ok) throw new Error('db.json fetch failed: ' + localRes.status);
    return localRes.json();
  }

  async function getFile(path) {
    return ghFetch(api('contents/' + path + '?ref=' + CFG.branch));
  }

  async function putFile(path, content, message) {
    const existing = await getFile(path).catch(() => null);
    return ghFetch(api('contents/' + path), {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
        sha: existing ? existing.sha : undefined,
        branch: CFG.branch,
      }),
    });
  }

  async function saveDB(dbObj, message) {
    return putFile(CFG.dbPath, dbObj, message || 'update: db.json از پنل مدیریت مغزدانه');
  }

  function orderPath(order) {
    const d = new Date(order.date || Date.now());
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${CFG.ordersDir}/${ym}/${order.id}.json`;
  }

  async function submitOrder(payload) {
    if (!hasToken()) return false;
    try {
      const isOffer = payload.kind === 'supply-offer';
      const commitMsg = isOffer
        ? `supply: ${payload.id} — ${payload.seller || 'عرضه‌کننده'} — ${payload.type || ''} (${payload.amountKg || 0} کیلو)`
        : `order: ${payload.id} — ${(payload.customer && payload.customer.name) || 'خریدار'} — ${Number((payload.totals && payload.totals.grand) || 0).toLocaleString('fa-IR')} تومان`;
      await putFile(orderPath(payload), payload, commitMsg);
      return true;
    } catch (e) {
      console.warn('GHDB submitOrder failed:', e);
      return false;
    }
  }

  async function updateOrder(path, orderObj, message) {
    return putFile(path, orderObj, message || `status: ${orderObj.id} → ${orderObj.status}`);
  }

  async function listOrders() {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const out = [];
    for (const m of months) {
      const files = await ghFetch(api(`contents/${CFG.ordersDir}/${m}?ref=${CFG.branch}`)).catch(() => []);
      if (Array.isArray(files)) {
        for (const f of files) out.push(f);
      }
    }
    return out;
  }

  async function readOrder(path) {
    const meta = await ghFetch(api('contents/' + path + '?ref=' + CFG.branch));
    const bin = atob(meta.content.replace(/\n/g, ''));
    const parsed = JSON.parse(decodeURIComponent(escape(bin)));
    parsed._path = path;
    return parsed;
  }

  async function checkAuth() {
    if (!hasToken()) throw new Error('no-token');
    const u = await ghFetch('https://api.github.com/user');
    return u.login;
  }

  return { CFG, getToken, setToken, hasToken, fetchDB, saveDB, submitOrder, updateOrder, listOrders, readOrder, checkAuth };
})();
