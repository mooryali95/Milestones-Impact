# 🏠 دليل نشر الصفحة الأم — Milestone Impact Home

> **الحالة:** ✅ جاهزة للنشر
> **التاريخ:** مايو 2026
> **المسار النهائي:** `mi.sunkvalue.com/`

---

## 📋 ما تم بناؤه

صفحة أم احترافية تجمع منتجات Milestone Impact في مكان واحد، بأربعة أقسام رئيسية:

```
HERO          → الهوية الجوهرية ("من النية... إلى الأثر")
① CONCEPT     → الفكرة (Decision · Value · Impact)
② MODEL       → النموذج (سلسلة الأثر الخماسية)
③ PRODUCTS    → المنتجات (MI-Leaders + مصفوفة التأثير)
④ ECOSYSTEM   → المنظومة + تواصل (Manzoma · MI · Sunk Value)
```

---

## 📁 هيكل المجلد المسلَّم

```
home/
│
├── 📄 index.html                          ← الصفحة الأم (~480 سطر)
│
├── 📁 assets/
│   ├── 📁 css/
│   │   ├── 🎨 main.css                    ← يستورد جميع ملفات CSS
│   │   ├── 🎨 01-tokens.css               ← Tokens + @font-face + Weight emulation
│   │   ├── 🎨 02-base.css                 ← Reset + Body (مطابق Leaders)
│   │   ├── 🎨 03-layout.css               ← Header + Footer (مطابق Leaders)
│   │   ├── 🎨 04-components.css           ← Logo + Buttons (مطابق Leaders)
│   │   ├── 🎨 05-home-sections.css        ← ⭐ الأقسام الأربعة (جديد)
│   │   └── 🎨 06-typeform.css             ← الفورم التفاعلي (مطابق Leaders)
│   │
│   ├── 📁 fonts/                          ← 🆕 الخطوط المرخّصة
│   │   ├── 🔤 AraHamah1982-Regular.woff2  (16KB)
│   │   ├── 🔤 AraHamah1982-Regular.ttf    (42KB - fallback قديم)
│   │   ├── 🔤 DINNextLTArabic-Regular.woff2 (49KB)
│   │   └── 🔤 DINNextLTArabic-Regular.ttf   (160KB - fallback قديم)
│   │
│   └── 📁 js/
│       ├── ⚙️ canvas.js                   ← الشبكة النورانية (مطابق)
│       ├── ⚙️ scroll.js                   ← Scroll effects + reveal fallback
│       ├── ⚙️ counters.js                 ← العدّادات (مطابق)
│       ├── ⚙️ tabs.js                     ← (احتياطي مطابق)
│       └── ⚙️ typeform.js                 ← فورم مُكيَّف للأم (4 خيارات منتجات)
│
└── 📄 amplify.yml                         ← Build config مُحدَّث
```

**80% من الملفات مشتركة مع Leaders** — وحدة هوية كاملة بصفر تكرار.

---

## 🚀 خطوات النشر

### الخطوة 1: رفع الملفات على GitHub

```bash
# في جذر المستودع (Milestones-Impact)
git checkout -b feat/home-landing

# انسخ مجلد home/ كاملاً إلى جذر المستودع
cp -r ~/Downloads/home ./home

# انسخ amplify.yml المُحدَّث (سيستبدل الموجود)
cp ~/Downloads/amplify.yml ./amplify.yml

# Commit + Push
git add .
git commit -m "feat(home): add unified landing page for MI products"
git push origin feat/home-landing
```

### الخطوة 2: تحديث AWS Amplify Rewrites

⚠️ **مهم جداً — الترتيب**. اذهب إلى:
**Amplify Console → App settings → Rewrites and redirects**

| الترتيب | Source | Target | Type |
|---|---|---|---|
| 1 | `/leaders/<*>` | `/leaders/<*>` | 200 (Rewrite) |
| 2 | `/Rehab/<*>` | `/Rehab/<*>` | 200 (Rewrite) |
| 3 | `</^[^.]+$\|\.(?!(css\|gif\|ico\|jpg\|js\|png\|txt\|svg\|woff\|ttf\|map\|json\|webp)$)([^.]+$)/>` | `/index.html` | 200 (Rewrite) |

⚠️ **القاعدة 3 ستُقدِّم `/index.html` للجذر** — وهذا يعني الصفحة الأم (لأننا نسخناها للجذر في `amplify.yml`).

### الخطوة 3: Merge + انتظار النشر

```bash
# عبر GitHub UI: افتح PR، راجع، Merge
# أو محلياً:
git checkout main
git merge feat/home-landing
git push origin main
```

Amplify سيلتقط التغيير ويبني خلال 3-5 دقائق.

---

## ✅ اختبار النشر

| الرابط | المتوقَّع |
|---|---|
| `https://mi.sunkvalue.com/` | 🆕 الصفحة الأم الجديدة |
| `https://mi.sunkvalue.com/leaders` | ✅ صفحة Leaders (كما هي) |
| `https://mi.sunkvalue.com/Rehab` | ✅ تطبيق Rehab (كما هو) |

### تحقّقات أساسية:

- ✅ الـ Hero يظهر بنفس الإحساس البصري كـ Leaders
- ✅ Header موحّد عبر كل الصفحات
- ✅ بطاقات المنتجات الاثنان تظهران جنباً إلى جنب (Desktop)
- ✅ الروابط من الأم → `/leaders` و `/Rehab` تعمل
- ✅ الفورم يفتح ويعرض 4 خيارات (Leaders / Matrix / Partnership / General)
- ✅ Mobile responsive (جرّب الجوال)

---

## 🎨 الهوية البصرية المعتمدة

نفس الهوية الكاملة من Leaders — صفر اختلاف في الألوان:

| العنصر | القيمة |
|---|---|
| **اللون الرئيسي** | بترولي عميق `#061E2C` |
| **اللون الذهبي** | `#C8A45C` |
| **خلفية الصفحة** | رملي `#FBF8EF` |
| **الخط العربي الرئيسي** | **Ara Hamah 1982** (محلي) |
| **الخط الثانوي/اللاتيني** | **DIN Next LT Arabic** (محلي) |
| **Fallback مجاني** | Readex Pro + IBM Plex Sans Arabic (Google Fonts) |

### 📝 ملاحظة مهمة عن الخطوط

كلا الخطين متاحان بـ **Weight 400 فقط**. عشان نُحاكي السُمك (Bold) للعناوين، استخدمنا:
- `-webkit-text-stroke` بقيم متدرجة (0.2px للنصوص، 0.5px للعناوين المتوسطة، 0.7px للعناوين الكبرى)
- `font-synthesis: weight style` لتفعيل المحاكاة في المتصفحات الداعمة

ملفات الخطوط الموجودة في `assets/fonts/`:
- `AraHamah1982-Regular.woff2` (16KB) + `.ttf` (42KB)
- `DINNextLTArabic-Regular.woff2` (49KB) + `.ttf` (160KB)

**Preload محسَّن:** الـ WOFF2 يُحمَّل أولاً (الأخف)، والـ TTF كـ fallback للمتصفحات القديمة، والـ Google Fonts كـ fallback ثانٍ لو فشل الاثنان.

### لون تعريفي لكل منتج (داخل البطاقات فقط):
- **MI-Leaders:** ذهبي `#C8A45C` (تماماً مع هوية البراند)
- **Impact Matrix:** بترولي فاتح `#6B9DAD` (لون المنتج الأصلي)

---

## 🔌 الفورم — تكوينه

في `assets/js/typeform.js`:

```javascript
const CONFIG = {
  product: 'MI-HOME',              // يميّز طلبات الأم عن Leaders
  method: 'mailto',                // أو 'worker'
  workerUrl: 'https://mi-api.workers.dev/send',
  recipientEmail: 'mi@sunkvalue.com',
};
```

### الخيارات الأربعة في السؤال الرابع:
- A → برنامج إدارة المشروعات للقادة (`leaders`)
- B → منصة مصفوفة التأثير (`matrix`)
- C → شراكة استراتيجية (`partnership`)
- D → استشارة عامة (`general`)

عندما يأتي إيميل، سيكون عنوانه يحوي `[MI-HOME] طلب جديد` لتمييزه عن طلبات Leaders.

---

## ➕ إضافة منتج ثالث لاحقاً

ثلاث خطوات فقط:

### 1. أضف بطاقة منتج في `index.html`:
ابحث عن `<!-- ─── المنتج الثاني ─── -->` وانسخ البطاقة، ثم عدّل:
- اسم البطاقة (`product-card--newname`)
- لون التعريف في `05-home-sections.css`
- المحتوى (الاسم، الوصف، الرابط)

### 2. أضف خيار في الفورم (السؤال الرابع):
في `tf-step` رقم 4، أضف `<button class="tf-option">` جديد.

### 3. أضف Rewrite Rule في Amplify لمسار المنتج الجديد.

---

## 🛡 المشاكل المحتملة

### المشكلة: الصفحة الأم لا تظهر — يظهر Rehab (React)
**السبب:** `cp -r home/* build/` لم يُنفَّذ، أو نُفِّذ قبل بناء React.
**الحل:** تأكّد أن `postBuild` يأتي **بعد** `build` في `amplify.yml`.

### المشكلة: `/leaders` لا يعمل بعد التحديث
**السبب:** الـ Rewrite Rule مفقودة أو ترتيبها خاطئ.
**الحل:** راجع الخطوة 2 — قاعدة `/leaders/<*>` يجب أن تكون قبل قاعدة `index.html`.

### المشكلة: الخطوط لا تُحمَّل
**السبب:** نادر — Google Fonts CDN.
**الحل:** تحقّق من `customHttp.yml` ولا يمنع `fonts.googleapis.com`.

### للتراجع السريع:
```bash
git revert HEAD
git push origin main
```

---

## 📞 معلومات الاتصال

- **البريد:** mi@sunkvalue.com
- **الشركاء:** [manzoma.sa](https://manzoma.sa) · [sunkvalue.com](https://sunkvalue.com)

---

© 2026 Milestone Impact — جميع الحقوق محفوظة.
