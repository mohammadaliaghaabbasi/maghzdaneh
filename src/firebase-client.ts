import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const BOOTSTRAPPED_ADMIN_EMAIL = 'mohammadaliaghaabbasi@gmail.com';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

/* ---------- Default CMS Content (Matches Luxury Minimal Editorial Redesign) ---------- */
export const DEFAULT_HOME_CMS = {
  sectionKey: 'home',
  kicker: 'رفسنجان · برداشت ۱۴۰۵',
  title: 'از پوستهٔ بسته، تا جوهرِ سبز.',
  subtitle: 'گزیدهٔ مستقیم باغ‌های رفسنجان و دامغان؛ هنوز در صدف چوبی طبیعت.',
  primaryCtaLabel: 'ورود به سایت مغزدانه',
  primaryCtaHref: 'catalog.html',
  secondaryCtaLabel: 'خرید عمده',
  secondaryCtaHref: 'wholesale.html',
  stages: [
    {
      index: '۰۱',
      label: 'پسته بسته',
      kicker: '۰۱ · برداشت ۱۴۰۵ رفسنجان',
      title: 'از پوستهٔ بسته، تا جوهرِ سبز.',
      subtitle: 'گزیدهٔ مستقیم باغ‌های رفسنجان و دامغان؛ هنوز در صدف چوبی طبیعت.',
    },
    {
      index: '۰۲',
      label: 'خندانی طبیعی',
      kicker: '۰۲ · خندانی طبیعی',
      title: 'پوسته باز می‌شود؛ مغز در پوست قرمز.',
      subtitle: 'خندانی دست‌چین بدون آب‌خندان — مغز درشت با پوشش کامل ارغوانی درون صدف.',
    },
    {
      index: '۰۳',
      label: 'جدایی پوسته',
      kicker: '۰۳ · مغزکنی کارگاهی',
      title: 'جدایی تمیز؛ مغز در لباس ارغوانی.',
      subtitle: 'پوستهٔ استخوانی با دقت کنار می‌رود و مغز یکدست با غشای قرمز طبیعی نمایان می‌ماند.',
    },
    {
      index: '۰۴',
      label: 'پوست‌گیری قرمز',
      kicker: '۰۴ · پوست‌گیری ظریف',
      title: 'پوست نازک قرمز، آرام کنده می‌شود.',
      subtitle: 'غشای کاغذی ارغوانی لایه‌به‌لایه جدا می‌شود تا رنگ زمردی اصیل زیر آن بدرخشد.',
    },
    {
      index: '۰۵',
      label: 'مغز سبز خالص',
      kicker: '۰۵ · جوهر زمردی خالص',
      title: 'مغز سبزِ ناب، آمادهٔ انتخاب شما.',
      subtitle: 'تازه‌سورت و دست‌اول — از ۲۵۰ گرم خانگی تا سفارش‌های عمده قنادی و صادراتی.',
    },
  ],
  featuredKicker: 'گزیدهٔ فصل',
  featuredTitle: 'سه انتخاب شاخص',
  featuredIds: ['maghz-akbari-premium', 'khall-qazvin', 'maghz-gerdoo-lux'],
  craftKicker: 'اصالتِ دست‌اول',
  craftTitle: 'یک زنجیرهٔ کوتاه؛ از بنه تا میز شما.',
  craftBody:
    'ما انباردار نیستیم. هر محموله مستقیماً از باغدار منتخب رفسنجان، قزوین و تویسرکان به کارگاه سورتینگ می‌آید و همان روز ثبت سفارش بسته‌بندی می‌شود.',
  craftImage: 'src/assets/images/editorial_orchard_craft_1795339905141.jpg',
};

export const DEFAULT_BRANDING_CMS = {
  sectionKey: 'branding',
  siteName: 'مغزدانه',
  tagline: 'بازار تخصصی مغز پسته، بادام و گردو — خرده و عمده',
  announcement: 'ارسال رایگان سفارش‌های بالای ۵ میلیون تومان · برشته‌کاری روزانه',
  phone: '021-91008080',
  mobile: '0912-345-6789',
  email: 'sales@maghzdaneh.ir',
  address: 'تهران، خیابان امیرکبیر، پاساژ خشکبار، پلاک ۱۲',
  worktime: 'شنبه تا پنجشنبه، ۸ تا ۱۸',
  flatShippingCost: 95000,
  freeShippingOver: 5000000,
  heavyShippingNote: 'ارسال سفارش‌های بالای ۲۵ کیلوگرم از طریق باربری با هماهنگی تلفنی انجام می‌شود.',
};

export const DEFAULT_PAGES_CMS = {
  sectionKey: 'pages',
  aboutTitle: 'داستان مغزدانه — کوتاه‌ترین مسیر از باغ تا سفره',
  aboutBody:
    'مغزدانه با هدف شفاف‌سازی بازار مغز پسته، بادام و گردو شکل گرفت. هر بار پیش از عرضه از نظر رطوبت، پرخوری و یکنواختی رنگ آزمایش می‌شود تا هم مصرف‌کننده خانگی و هم کارگاه‌های شیرینی‌پزی و آجیل‌فروشی دقیقاً همان کیفیتی را تحویل بگیرند که سفارش داده‌اند.',
  wholesaleTitle: 'خرید عمده و قیمت پلکانی شفاف',
  wholesaleBody:
    'تمامی محصولات مغزدانه در سه پلهٔ شفاف خرده‌فروشی (۲۵۰ گرم به بالا)، نیم‌عمده (۵ کیلو به بالا) و عمده (۲۵ کیلو به بالا) عرضه می‌شوند.',
  faqItems: [
    {
      q: 'تفاوت قیمت خرده، نیم‌عمده و عمده از چه وزنی اعمال می‌شود؟',
      a: 'از ۲۵۰ گرم تا زیر ۵ کیلوگرم قیمت خرده، از ۵ کیلوگرم به بالا قیمت نیم‌عمده و از ۲۵ کیلوگرم به بالا قیمت عمده به‌صورت خودکار در سبد خرید محاسبه می‌شود.',
    },
    {
      q: 'آیا محصولات تازه‌برشته هستند؟',
      a: 'بله، تمامی اقلام برشته پس از ثبت سفارش و در همان روز برشته‌کاری و بسته‌بندی می‌شوند.',
    },
    {
      q: 'ارسال به شهرستان‌ها چگونه انجام می‌شود؟',
      a: 'سفارش‌های زیر ۲۵ کیلوگرم با پست پیشتاز یا تیپاکس و بارهای عمده با باربری مطمئن و بسته‌بندی وکیوم ارسال می‌شوند.',
    },
  ],
};

/* ---------- Defensive Payload Sanitization Helpers (Matches firebase-blueprint.json) ---------- */
function trunc(val: unknown, max: number): string {
  return String(val ?? '').trim().slice(0, max);
}

function clampNum(val: unknown, min: number, max: number, fallback = 0): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanId(raw: string): string {
  return String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96);
}

/* ---------- Auth & Admin Helpers ---------- */
export async function signInWithGoogle(): Promise<User> {
  const res = await signInWithPopup(auth, googleProvider);
  const u = res.user;
  await ensureUserProfileExists(u);
  return u;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export function onAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

export async function checkIsAdmin(user: User | null = auth.currentUser): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (user.email && user.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) return true;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function ensureUserProfileExists(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        role: 'customer',
        fullName: trunc(user.displayName || user.email?.split('@')[0] || 'مشتری مغزدانه', 120),
        email: trunc(user.email || '', 160),
        phone: '',
        buyerType: 'retail',
        province: '',
        city: '',
        address: '',
        postalCode: '',
        favoriteIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/* ---------- User Profiles ---------- */
export async function getMyProfile(uid: string) {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveMyProfile(uid: string, input: Record<string, unknown>) {
  const path = `users/${uid}`;
  const user = auth.currentUser;
  if (!user) throw new Error('برای ذخیره پروفایل ابتدا وارد حساب خود شوید.');
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    const allowedBuyerTypes = ['retail', 'confectionery', 'wholesale'];
    const buyerType = allowedBuyerTypes.includes(String(input.buyerType))
      ? String(input.buyerType)
      : 'retail';
    const favoriteIds = Array.isArray(input.favoriteIds)
      ? input.favoriteIds.map((x) => cleanId(String(x))).filter(Boolean).slice(0, 30)
      : undefined;

    if (!snap.exists()) {
      await setDoc(ref, {
        uid,
        role: 'customer',
        fullName: trunc(input.fullName || user.displayName || 'مشتری مغزدانه', 120),
        email: trunc(user.email || '', 160),
        phone: trunc(input.phone || '', 24),
        buyerType,
        province: trunc(input.province || '', 80),
        city: trunc(input.city || '', 80),
        address: trunc(input.address || '', 400),
        postalCode: trunc(input.postalCode || '', 20),
        favoriteIds: favoriteIds || [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const updatePayload: Record<string, unknown> = {
        fullName: trunc(input.fullName || snap.data().fullName || 'مشتری مغزدانه', 120),
        phone: trunc(input.phone ?? snap.data().phone ?? '', 24),
        buyerType,
        province: trunc(input.province ?? snap.data().province ?? '', 80),
        city: trunc(input.city ?? snap.data().city ?? '', 80),
        address: trunc(input.address ?? snap.data().address ?? '', 400),
        postalCode: trunc(input.postalCode ?? snap.data().postalCode ?? '', 20),
        updatedAt: serverTimestamp(),
      };
      if (favoriteIds !== undefined) updatePayload.favoriteIds = favoriteIds;
      await updateDoc(ref, updatePayload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function listAllCustomers() {
  const path = 'users';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/* ---------- Live CMS (siteContent) ---------- */
function defaultForSection(sectionKey: string) {
  if (sectionKey === 'home') return { ...DEFAULT_HOME_CMS };
  if (sectionKey === 'branding') return { ...DEFAULT_BRANDING_CMS };
  return { ...DEFAULT_PAGES_CMS };
}

export async function getSiteContent(sectionKey: 'home' | 'branding' | 'pages') {
  const path = `siteContent/${sectionKey}`;
  try {
    const snap = await getDoc(doc(db, 'siteContent', sectionKey));
    if (!snap.exists()) return defaultForSection(sectionKey);
    return { ...defaultForSection(sectionKey), ...snap.data() };
  } catch {
    return defaultForSection(sectionKey);
  }
}

export function subscribeSiteContent(
  sectionKey: 'home' | 'branding' | 'pages',
  cb: (data: Record<string, unknown>) => void
): Unsubscribe {
  const path = `siteContent/${sectionKey}`;
  return onSnapshot(
    doc(db, 'siteContent', sectionKey),
    (snap) => {
      cb(snap.exists() ? { ...defaultForSection(sectionKey), ...snap.data() } : defaultForSection(sectionKey));
    },
    (error) => {
      console.warn('SiteContent snapshot fallback:', path, error.message);
      cb(defaultForSection(sectionKey));
    }
  );
}

export async function saveSiteContent(
  sectionKey: 'home' | 'branding' | 'pages',
  input: Record<string, unknown>
) {
  const user = auth.currentUser;
  if (!user) throw new Error('نیاز به ورود ادمین است.');
  const path = `siteContent/${sectionKey}`;
  const payload: Record<string, unknown> = {
    sectionKey,
    updatedBy: user.uid,
    updatedAt: serverTimestamp(),
  };

  if (sectionKey === 'home') {
    payload.kicker = trunc(input.kicker, 140);
    payload.title = trunc(input.title, 200);
    payload.subtitle = trunc(input.subtitle, 600);
    payload.primaryCtaLabel = trunc(input.primaryCtaLabel, 80);
    payload.primaryCtaHref = trunc(input.primaryCtaHref, 200);
    payload.secondaryCtaLabel = trunc(input.secondaryCtaLabel, 80);
    payload.secondaryCtaHref = trunc(input.secondaryCtaHref, 200);
    payload.featuredKicker = trunc(input.featuredKicker, 120);
    payload.featuredTitle = trunc(input.featuredTitle, 160);
    payload.craftKicker = trunc(input.craftKicker, 120);
    payload.craftTitle = trunc(input.craftTitle, 200);
    payload.craftBody = trunc(input.craftBody, 1200);
    payload.craftImage = trunc(input.craftImage, 300);
    if (Array.isArray(input.stages)) {
      payload.stages = input.stages.slice(0, 5).map((s: Record<string, unknown>, i: number) => ({
        index: trunc(s.index || `۰${i + 1}`, 12),
        label: trunc(s.label || '', 40),
        kicker: trunc(s.kicker || '', 120),
        title: trunc(s.title || '', 160),
        subtitle: trunc(s.subtitle || '', 280),
      }));
    }
    if (Array.isArray(input.featuredIds)) {
      payload.featuredIds = input.featuredIds.map((x) => cleanId(String(x))).filter(Boolean).slice(0, 6);
    }
  } else if (sectionKey === 'branding') {
    payload.siteName = trunc(input.siteName, 80);
    payload.tagline = trunc(input.tagline, 240);
    payload.announcement = trunc(input.announcement, 240);
    payload.phone = trunc(input.phone, 40);
    payload.mobile = trunc(input.mobile, 40);
    payload.email = trunc(input.email, 120);
    payload.address = trunc(input.address, 240);
    payload.worktime = trunc(input.worktime, 120);
    payload.flatShippingCost = clampNum(input.flatShippingCost, 0, 50000000, 95000);
    payload.freeShippingOver = clampNum(input.freeShippingOver, 0, 500000000, 5000000);
    payload.heavyShippingNote = trunc(input.heavyShippingNote, 300);
  } else if (sectionKey === 'pages') {
    payload.aboutTitle = trunc(input.aboutTitle, 200);
    payload.aboutBody = trunc(input.aboutBody, 3000);
    payload.wholesaleTitle = trunc(input.wholesaleTitle, 200);
    payload.wholesaleBody = trunc(input.wholesaleBody, 2000);
    if (Array.isArray(input.faqItems)) {
      payload.faqItems = input.faqItems
        .slice(0, 20)
        .map((f: Record<string, unknown>) => ({
          q: trunc(f.q || '', 240),
          a: trunc(f.a || '', 800),
        }))
        .filter((f) => f.q.length > 0);
    }
  }

  try {
    await setDoc(doc(db, 'siteContent', sectionKey), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/* ---------- Live Products (Firestore <-> App Format Bridge) ---------- */
function docToAppProduct(d: Record<string, unknown>) {
  return {
    id: String(d.id || ''),
    name: String(d.name || ''),
    category: String(d.category || 'pistachio-kernel'),
    origin: String(d.origin || 'رفسنجان'),
    grade: String(d.grade || 'ممتاز'),
    img: String(d.img || 'assets/img/maghz-pistachio-akbari.jpg'),
    desc: String(d.desc || ''),
    specs: Array.isArray(d.specs) ? d.specs.map(String) : [],
    uses: Array.isArray(d.uses) ? d.uses.map(String) : [],
    stock: Number(d.stock || 0),
    prices: {
      retail: Number(d.retailPrice || 0),
      semi: Number(d.semiPrice || 0),
      wholesale: Number(d.wholesalePrice || 0),
    },
    badge: String(d.badge || ''),
    rating: Number(d.rating || 4.9),
    sold: Number(d.sold || 0),
    featured: Boolean(d.featured),
  };
}

function appProductToDoc(p: Record<string, unknown>) {
  const allowedCats = ['pistachio-kernel', 'pistachio-slice', 'almond-kernel', 'walnut-kernel', 'in-shell'];
  const id = cleanId(String(p.id || 'p-' + Date.now().toString(36)));
  const prices = (p.prices as Record<string, unknown>) || {};
  const cat = allowedCats.includes(String(p.category)) ? String(p.category) : 'pistachio-kernel';
  return {
    id,
    name: trunc(p.name, 160),
    category: cat,
    origin: trunc(p.origin || 'رفسنجان', 80),
    grade: trunc(p.grade || 'ممتاز', 80),
    img: trunc(p.img || 'assets/img/maghz-pistachio-akbari.jpg', 300),
    desc: trunc(p.desc || p.name || '', 1200),
    specs: Array.isArray(p.specs) ? p.specs.map((x) => trunc(x, 200)).slice(0, 10) : [],
    uses: Array.isArray(p.uses) ? p.uses.map((x) => trunc(x, 120)).slice(0, 10) : [],
    stock: clampNum(p.stock, 0, 1000000, 0),
    retailPrice: clampNum(p.retailPrice ?? prices.retail, 0, 500000000, 0),
    semiPrice: clampNum(p.semiPrice ?? prices.semi, 0, 500000000, 0),
    wholesalePrice: clampNum(p.wholesalePrice ?? prices.wholesale, 0, 500000000, 0),
    badge: trunc(p.badge || '', 40),
    rating: clampNum(p.rating, 0, 5, 4.9),
    sold: clampNum(p.sold, 0, 10000000, 0),
    featured: Boolean(p.featured),
    updatedAt: serverTimestamp(),
  };
}

export async function getLiveProducts() {
  const path = 'products';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => docToAppProduct({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

export async function saveProduct(p: Record<string, unknown>) {
  const payload = appProductToDoc(p);
  const path = `products/${payload.id}`;
  try {
    await setDoc(doc(db, 'products', payload.id), payload);
    return payload.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteProduct(productId: string) {
  const id = cleanId(productId);
  const path = `products/${id}`;
  try {
    await deleteDoc(doc(db, 'products', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function seedProductsFromJson(productsArray: Record<string, unknown>[]) {
  const path = 'products';
  try {
    const batch = writeBatch(db);
    for (const p of productsArray.slice(0, 60)) {
      const payload = appProductToDoc(p);
      batch.set(doc(db, 'products', payload.id), payload);
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/* ---------- Orders ---------- */
export async function createOrder(input: Record<string, unknown>) {
  const user = auth.currentUser;
  if (!user) throw new Error('برای ثبت سفارش آنلاین، ابتدا وارد حساب کاربری خود شوید.');
  const orderCode = cleanId(String(input.orderCode || `MGZ-${Date.now().toString(36).toUpperCase()}`));
  const path = `orders/${orderCode}`;

  const rawItems = Array.isArray(input.items) ? input.items : [];
  const items = rawItems.slice(0, 40).map((it: Record<string, unknown>) => ({
    id: cleanId(String(it.id || 'item')),
    name: trunc(it.name || '', 160),
    qty: clampNum(it.qty, 0.25, 10000, 1),
    unitPrice: clampNum(it.unitPrice ?? it.price, 0, 500000000, 0),
    lineTotal: clampNum(it.lineTotal ?? it.total, 0, 5000000000, 0),
  }));

  const payload = {
    orderCode,
    userId: user.uid,
    status: 'new',
    customerName: trunc(input.customerName, 120),
    customerPhone: trunc(input.customerPhone, 24),
    customerEmail: trunc(input.customerEmail || user.email || '', 160),
    province: trunc(input.province || '', 80),
    city: trunc(input.city || '', 80),
    address: trunc(input.address, 400),
    note: trunc(input.note || '', 500),
    items,
    subtotal: clampNum(input.subtotal, 0, 5000000000, 0),
    shippingCost: clampNum(input.shippingCost, 0, 100000000, 0),
    grandTotal: clampNum(input.grandTotal, 0, 5000000000, 0),
    totalKg: clampNum(input.totalKg, 0.1, 100000, 1),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'orders', orderCode), payload);
    return { orderCode, ...payload };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function getMyOrders(uid: string) {
  const path = 'orders';
  try {
    const q = query(collection(db, path), where('userId', '==', uid), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    // Fallback without composite index if Firestore index is still building
    try {
      const q2 = query(collection(db, path), where('userId', '==', uid));
      const snap2 = await getDocs(q2);
      return snap2.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
          const ta = (a.createdAt as { seconds?: number })?.seconds || 0;
          const tb = (b.createdAt as { seconds?: number })?.seconds || 0;
          return tb - ta;
        });
    } catch (e2) {
      handleFirestoreError(e2, OperationType.LIST, path);
    }
  }
}

export async function listAllOrders() {
  const path = 'orders';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const ta = (a.createdAt as { seconds?: number })?.seconds || 0;
        const tb = (b.createdAt as { seconds?: number })?.seconds || 0;
        return tb - ta;
      });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function updateOrderStatus(orderId: string, nextStatus: string) {
  const id = cleanId(orderId);
  const path = `orders/${id}`;
  const validStatuses = ['new', 'processing', 'shipped', 'done', 'canceled'];
  if (!validStatuses.includes(nextStatus)) throw new Error('وضعیت سفارش نامعتبر است.');
  try {
    await updateDoc(doc(db, 'orders', id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/* ---------- Supply Offers ---------- */
export async function createSupplyOffer(input: Record<string, unknown>) {
  const user = auth.currentUser;
  if (!user) throw new Error('برای ثبت پیشنهاد عرضه، ابتدا وارد حساب کاربری خود شوید.');
  const offerId = cleanId(`SUP-${Date.now().toString(36).toUpperCase()}`);
  const path = `supplyOffers/${offerId}`;
  const payload = {
    userId: user.uid,
    sellerName: trunc(input.sellerName, 120),
    phone: trunc(input.phone, 24),
    origin: trunc(input.origin || '', 80),
    productType: trunc(input.productType, 120),
    amountKg: clampNum(input.amountKg, 1, 1000000, 100),
    description: trunc(input.description || '', 1000),
    status: 'new',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'supplyOffers', offerId), payload);
    return { id: offerId, ...payload };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function listAllSupplyOffers() {
  const path = 'supplyOffers';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function updateSupplyOfferStatus(offerId: string, nextStatus: string) {
  const id = cleanId(offerId);
  const path = `supplyOffers/${id}`;
  try {
    await updateDoc(doc(db, 'supplyOffers', id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/* ---------- Admin Management ---------- */
export async function listAdmins() {
  const path = 'admins';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function addAdmin(uid: string, email: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('نیاز به احراز هویت ادمین است.');
  const id = cleanId(uid);
  const path = `admins/${id}`;
  try {
    await setDoc(doc(db, 'admins', id), {
      uid: id,
      email: trunc(email, 160),
      addedBy: user.uid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeAdmin(uid: string) {
  const id = cleanId(uid);
  const path = `admins/${id}`;
  try {
    await deleteDoc(doc(db, 'admins', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/* ---------- Global Window Export for Static HTML Pages ---------- */
const MgzCloud = {
  db,
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  DEFAULT_HOME_CMS,
  DEFAULT_BRANDING_CMS,
  DEFAULT_PAGES_CMS,
  signInWithGoogle,
  signOutUser,
  onAuth,
  getCurrentUser,
  checkIsAdmin,
  ensureUserProfileExists,
  getMyProfile,
  saveMyProfile,
  listAllCustomers,
  getSiteContent,
  subscribeSiteContent,
  saveSiteContent,
  getLiveProducts,
  saveProduct,
  deleteProduct,
  seedProductsFromJson,
  createOrder,
  getMyOrders,
  listAllOrders,
  updateOrderStatus,
  createSupplyOffer,
  listAllSupplyOffers,
  updateSupplyOfferStatus,
  listAdmins,
  addAdmin,
  removeAdmin,
};

declare global {
  interface Window {
    MgzCloud: typeof MgzCloud;
  }
}

if (typeof window !== 'undefined') {
  window.MgzCloud = MgzCloud;
  window.dispatchEvent(new CustomEvent('mgzcloud:ready'));
}

export default MgzCloud;
