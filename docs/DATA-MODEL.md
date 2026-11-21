# 📦 ساختار داده

## data/db.json

```jsonc
{
  "site": {
    "name": "مغزدانه",                  // نام برند
    "tagline": "...",                    // شعار زیر لوگو
    "domain": "https://maghzdaneh.ir",   // دامنه (برای sitemap)
    "description": "...",                // توضیح سئو + فوتر
    "phone": "021-...",                  // تلفن ثابت
    "mobile": "0912-...",                // موبایل/واتس‌اپ
    "email": "...",
    "address": "...",
    "worktime": "...",
    "social": { "instagram": "...", "telegram": "...", "whatsapp": "..." },
    "shipping": {
      "free_over": 5000000,              // سقف ارسال رایگان (تومان)
      "flat_cost": 89000,                // هزینه ثابت ارسال
      "heavy_note": "...",               // یادداشت بالای ۱۰ کیلو
      "tehran_same_day": true            // پیک همان‌روز تهران
    },
    "payment": { "methods": ["..."], "gateway": "زرین‌پال" },
    "price_date": "2026-11-21",          // ⭐ خودکار با هر کامیت ادمین
    "price_source": "..."                // منبع استعلام (نمایش در مستندات)
  },
  "tiers": [                             // پله‌های خرید — ترتیب مهم
    { "id": "retail", "label": "خرده‌فروشی", "min": 0.25, "desc": "..." },
    { "id": "semi", "label": "نیم‌عمده", "min": 5, "desc": "..." },
    { "id": "wholesale", "label": "عمده", "min": 25, "desc": "..." }
  ],
  "categories": [
    { "id": "pistachio-kernel", "name": "مغز پسته", "icon": "🥜", "desc": "..." }
    // + pistachio-slice, almond-kernel, walnut-kernel, in-shell
  ],
  "products": [
    {
      "id": "maghz-akbari-premium",      // یکتا — در URL استفاده می‌شود
      "name": "...", "category": "pistachio-kernel",
      "origin": "رفسنجان",               // مبدأ — نمایش کارت و صفحه محصول
      "grade": "ممتاز — ...",
      "img": "assets/img/....jpg",        // از assets/img
      "desc": "...",                      // توضیح کامل
      "specs": ["...", "..."],            // تیک‌های مشخصات
      "uses": ["...", "..."],             // «مناسب برای»
      "stock": 180,                       // کیلوگرم
      "prices": { "retail": 8500000, "semi": 7900000, "wholesale": 7500000 },
      "badge": "پرفروش",                  // '' یعنی بدون بج
      "rating": 4.9, "sold": 1240
    }
  ],
  "faq": [ { "q": "...", "a": "..." } ],
  "testimonials": [ { "name": "...", "text": "...", "stars": 5 } ],
  "supply": {
    "title": "...", "intro": "...",
    "steps": [ { "t": "...", "d": "..." } ],
    "we_buy": ["..."],
    "phone": "0912-..."                   // تلفن مستقیم خرید از باغدار
  }
}
```

## سفارش‌ها — data/orders/YYYY-MM/MD-*.json

```jsonc
{
  "id": "MD-MWQAG0P8",                   // کد پیگیری
  "date": "2026-11-21T10:30:00.000Z",
  "customer": { "name": "...", "phone": "...", "email": "...",
                 "province": "...", "city": "...", "address": "...", "postal": "..." },
  "shipping": "تیپاکس (۲–۴ روز کاری)",
  "payment": "پرداخت آنلاین (زرین‌پال)",
  "note": "...",
  "items": [ { "id": "...", "name": "...", "tier": "retail", "qty": 1,
               "unitPrice": 8500000, "total": 8500000 } ],
  "totals": { "subtotal": 8500000, "shipping": 0, "grand": 8500000 },
  "status": "new"                         // new | processing | done | canceled
}
```

پیشنهاد عرضه باغداران همان ساختار با `kind: "supply-offer"` و فیلدهای `seller/phone/type/amountKg/desc`.

## قواعد

- قیمت‌ها **تومان/کیلوگرم** و عدد صحیح.
- `min` پله بر حسب **کیلوگرم** (اعشار مجاز: 0.25).
- حذف محصول = حذف از آرایه `products` (پنل این کار را انجام می‌دهد).
- بعد از هر تغییر با پنل، `price_date` خودکار امروز می‌شود.
