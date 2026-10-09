# 🚀 دليل نشر Cloudflare Pages

> **تنبيه (أكتوبر 2026):** هذا دليل الإعداد الأول. منذ دمج #23 صارت صفحة القادة على `mi.sunkvalue.com/leaders/` ومحتواها في `home/leaders/`، ومشروع `mi-leaders` يخدم تحويل 301 فقط من `leaders.sunkvalue.com`. الخريطة الحالية للمنصات في `README.md`.

> دليل خطوة بخطوة لربط `home/` و `leaders/` بـ Cloudflare Pages.

---

## 🎯 الهدف النهائي

```
mi.sunkvalue.com          →  home/         (الصفحة الأم)
leaders.sunkvalue.com     →  leaders/      (إدارة المشروعات للقادة)
matrix.sunkvalue.com      →  Rehab         (مصفوفة التأثير) — لاحقاً
```

---

## ⚙️ المتطلبات

✅ حساب Cloudflare (لديك)  
✅ نطاق `sunkvalue.com` مربوط بـ Cloudflare (لديك)  
✅ Repository على GitHub (`mooryali95/Milestones-Impact`)

---

## 📦 المشروع الأول — `leaders.sunkvalue.com`

### الخطوة 1: إنشاء Cloudflare Pages Project

1. روح لـ: **https://dash.cloudflare.com**
2. من القائمة الجانبية: **Workers & Pages**
3. اضغط **Create application** → **Pages** → **Connect to Git**

### الخطوة 2: ربط GitHub

1. اضغط **Connect GitHub**
2. وافق على الصلاحيات
3. اختر repository: **`mooryali95/Milestones-Impact`**
4. اضغط **Begin setup**

### الخطوة 3: إعدادات النشر

أدخل القيم التالية بالضبط:

| الحقل | القيمة |
|---|---|
| **Project name** | `mi-leaders` |
| **Production branch** | `main` |
| **Framework preset** | `None` |
| **Build command** | (اتركه فارغاً) |
| **Build output directory** | `leaders` |
| **Root directory** | (اتركه فارغاً) |

⚠️ **مهم:** `Build output directory` = `leaders` (لأن الملفات في مجلد `leaders/` مباشرة، لا تحتاج بناء)

### الخطوة 4: النشر الأول

اضغط **Save and Deploy**

سيتم النشر خلال 30-60 ثانية، وستحصل على رابط مثل:
```
https://mi-leaders.pages.dev
```

افتحه للتأكد أن الصفحة تعمل ✅

### الخطوة 5: ربط Custom Domain

1. في صفحة المشروع: **Custom domains** → **Set up a custom domain**
2. أدخل: `leaders.sunkvalue.com`
3. اضغط **Continue**
4. Cloudflare سيُضيف DNS record تلقائياً (لأن النطاق مربوط بحسابك)
5. انتظر 1-2 دقيقة للتفعيل ✅

اختبر: **https://leaders.sunkvalue.com**

---

## 🏠 المشروع الثاني — `mi.sunkvalue.com` (الأم)

### الخطوة 1: إنشاء Project ثاني

1. ارجع لـ **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. اختر نفس repository: **`mooryali95/Milestones-Impact`**

### الخطوة 2: إعدادات النشر

| الحقل | القيمة |
|---|---|
| **Project name** | `mi-home` |
| **Production branch** | `main` |
| **Framework preset** | `None` |
| **Build command** | (اتركه فارغاً) |
| **Build output directory** | `home` |
| **Root directory** | (اتركه فارغاً) |

اضغط **Save and Deploy**

### الخطوة 3: ربط Custom Domain

⚠️ **توقّف هنا قبل المتابعة!**

عند ربط `mi.sunkvalue.com` بـ Cloudflare Pages، سيُلغى تلقائياً ربطه الحالي بـ AWS Amplify.

هذا يعني أن Rehab الموجود على `mi.sunkvalue.com` **سيختفي مؤقتاً** حتى تنشر Rehab على `matrix.sunkvalue.com`.

#### الخيار A — متابعة فورية (الأبسط):

إن لم يكن لديك مستخدمون حاليون على Rehab، اربط `mi.sunkvalue.com` بصفحة home الآن:

1. **Custom domains** → **Set up a custom domain**
2. أدخل: `mi.sunkvalue.com`
3. اضغط **Continue**

النتيجة:
- ✅ `mi.sunkvalue.com` → home (الصفحة الأم)
- ⚠️ `mi.sunkvalue.com/Rehab` → سيتوقف (404)

#### الخيار B — تدريجي (الأكثر أماناً):

1. **انشر Rehab على `matrix.sunkvalue.com` أولاً** (انظر القسم القادم)
2. اختبره وتأكد أنه يعمل
3. ثم اربط `mi.sunkvalue.com` بـ Cloudflare Pages

**التوصية:** الخيار B إن كان لديك مستخدمون حاليون.

---

## 🔮 المشروع الثالث — `matrix.sunkvalue.com` (Rehab — لاحقاً)

Rehab هو تطبيق React يحتاج بناء (`npm run build`)، وهذا أعقد قليلاً من home/leaders.

سنُجهّزه في **جلسة قادمة** بعد التأكد من عمل home و leaders.

### نظرة سريعة على ما سيحدث:

1. إنشاء branch جديد لتعديل Rehab
2. إضافة `homepage: "/"` في `package.json` (يبقى كما هو)
3. ربط Cloudflare Pages بمسار `/` مع build command:
   ```
   Build command: npm run build
   Build output: build
   ```
4. ربط `matrix.sunkvalue.com`

---

## ✅ قائمة التحقق

### قبل البدء:
- [ ] الـ Pull Request مدموج إلى `main`
- [ ] التحقق من ظهور `home/` و `leaders/` في GitHub

### Cloudflare Pages — Leaders:
- [ ] إنشاء project `mi-leaders`
- [ ] إعدادات النشر صحيحة
- [ ] النشر الأول ناجح
- [ ] الرابط `*.pages.dev` يعمل
- [ ] ربط `leaders.sunkvalue.com`
- [ ] اختبار `https://leaders.sunkvalue.com` ✅

### Cloudflare Pages — Home:
- [ ] إنشاء project `mi-home`
- [ ] إعدادات النشر صحيحة
- [ ] النشر الأول ناجح
- [ ] الرابط `*.pages.dev` يعمل
- [ ] قرار: متى تربط `mi.sunkvalue.com`؟
- [ ] ربط `mi.sunkvalue.com`
- [ ] اختبار الروابط بين home و leaders ✅

### اختبار التكامل:
- [ ] افتح `mi.sunkvalue.com` → تظهر home
- [ ] اضغط بطاقة "للقادة" → تذهب لـ `leaders.sunkvalue.com`
- [ ] اضغط بطاقة "مصفوفة التأثير" → تذهب لـ `matrix.sunkvalue.com` (404 الآن، عادي)
- [ ] اختبار على الجوال

---

## 🛡 ميزة رائعة — Auto Deploy

بمجرد ربط Cloudflare Pages بـ GitHub:

```
أي git push على main
        ↓
   Cloudflare يكتشف التغيير
        ↓
   يبني المشروع تلقائياً
        ↓
   ينشر على CDN عالمياً
        ↓
   ✅ التحديثات حية خلال 30 ثانية
```

**كل تعديل على `home/` أو `leaders/` ينعكس تلقائياً.**

---

## 🆘 حلول للمشاكل الشائعة

### المشكلة 1: "Build failed"
**السبب:** الـ Build output directory خطأ.  
**الحل:** تأكد أنه `leaders` أو `home` (بدون `/`)

### المشكلة 2: الصفحة فارغة بعد النشر
**السبب:** Build output directory يشير لمكان خاطئ.  
**الحل:** يجب أن يشير للمجلد الذي يحتوي `index.html` مباشرة

### المشكلة 3: لا يقبل ربط Custom Domain
**السبب:** النطاق مربوط بمشروع آخر.  
**الحل:** ألغِ الربط من المشروع القديم أولاً

### المشكلة 4: تعديلات لا تظهر
**السبب:** Cache.  
**الحل:** Cloudflare Pages dashboard → Caching → Purge cache

---

## 📞 الدعم

إن واجهت أي مشكلة:
- شارك screenshot من الخطأ
- شارك Build logs من Cloudflare
