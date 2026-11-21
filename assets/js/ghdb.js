/* ============================================================
   مغزدانه — ghdb.js
   لایه دیتابیس مبتنی بر گیت‌هاب:
   - خواندن عمومی: data/db.json از GitHub Pages (بدون توکن)
   - نوشتن ادمین: ویرایش db.json و ثبت سفارش‌ها با Contents API
     (توکن فقط داخل پنل ادمین وارد می‌شود و در localStorage می‌ماند؛
      هرگز در کد هاردکد نمی‌شود)
   ============================================================ */

const GHDB = (() => {
  // ---------- config (public part) ----------
  // این مقادیر فقط برای خواندن عمومی هستند؛ نوشتن نیاز به توکن ادمین دارد.
  const CFG = {
    owner: 'mohammadaliaghaabbasi',
    repo: 'maghzdaneh',
    branch: 'main',
    dbPath: 'data/db.json',
    ordersDir: 'data/orders',
  };
  const LS_KEY = 'maghzdaneh_gh_token';

  const api = (path) => `https://api.github.com/repos/${CFG.owner}/${CFG.repo}/${path}`;
  const raw = (path) => `https://raw.githubusercontent.com/${CFG.owner}/${CFG.repo}/${CFG.branch}/${path}?t=${Date.now()}`;

  // ---------- token ----------
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

  // ---------- read (public) ----------
  async function fetchDB() {
    const res = await fetch(raw(CFG.dbPath), { cache: 'no-store' });
    if (!res.ok) throw new Error('db.json fetch failed: ' + res.status);
    return res.json();
  }

  // ---------- write helpers ----------
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

  // ---------- products & settings (admin) ----------
  async function saveDB(dbObj, message) {
    return putFile(CFG.dbPath, dbObj, message || 'update: db.json از پنل مدیریت مغزدانه');
  }

  // ---------- orders ----------
  function orderPath(order) {
    const d = new Date(order.date);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${CFG.ordersDir}/${ym}/${order.id}.json`;
  }

  // ثبت سفارش: نیازمند توکن است. اگر توکن نبود (خریدار عادی)،
  // fallback به ذخیره محلی در checkout انجام شده است.
  async function submitOrder(order) {
    if (!hasToken()) return false;
    try {
      await putFile(orderPath(order), order, `order: ${order.id} — ${order.customer.name} — ${order.totals.grand.toLocaleString('fa-IR')} تومان`);
      return true;
    } catch (e) {
      console.warn('order submit failed:', e);
      return false;
    }
  }

  async function listOrders() {
    // فهرست ماه‌های موجود
    const months = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const out = [];
    for (const m of months) {
      const files = await ghFetch(api(`contents/${CFG.ordersDir}/${m}?ref=${CFG.branch}`)).catch(() => []);
      for (const f of files) out.push(f);
    }
    return out;
  }

  async function readOrder(path) {
    const meta = await ghFetch(api('contents/' + path + '?ref=' + CFG.branch));
    const bin = atob(meta.content.replace(/\n/g, ''));
    return JSON.parse(decodeURIComponent(escape(bin)));
  }

  // ---------- admin auth check ----------
  async function checkAuth() {
    if (!hasToken()) throw new Error('no-token');
    const u = await ghFetch('https://api.github.com/user');
    return u.login;
  }

  return { CFG, getToken, setToken, hasToken, fetchDB, saveDB, submitOrder, listOrders, readOrder, checkAuth };
})();
