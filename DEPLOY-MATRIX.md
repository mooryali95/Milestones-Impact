# 🚀 دليل نشر matrix.sunkvalue.com

> نقل تطبيق Rehab (React) إلى Cloudflare Pages كـ `matrix.sunkvalue.com`

---

## ⚠️ قبل البدء — تنبيهات مهمة

### 1. AWS Amplify يبقى يعمل
`mi.sunkvalue.com/Rehab` على Amplify سيستمر بالعمل. لن نلمسه حتى تتأكد أن `matrix.sunkvalue.com` يعمل بشكل ممتاز.

### 2. لا تعارض مع home/leaders
Cloudflare Pages يدعم 3+ مشاريع من نفس Repository — كل مشروع مستقل.

### 3. التطبيق نفسه لم يُمَس
- ✅ `src/App.jsx` — لم يُمَس
- ✅ `package.json` — لم يُمَس
- ✅ `index.html` — نُقل إلى الجذر عند الانتقال إلى Vite (كان `public/index.html` مع CRA)
- 🆕 `public/_headers` — مُضاف (security)
- 🆕 `public/_redirects` — مُضاف (SPA fallback)

---

## 📋 خطوات النشر

### الخطوة 1: ادمج الـ Pull Request

```
https://github.com/mooryali95/Milestones-Impact/pulls
```

ابحث عن: **feat(matrix): prep Rehab React app for Cloudflare Pages**

اضغط:
1. **Create pull request**
2. **Merge pull request**
3. **Confirm merge**

---

### الخطوة 2: أنشئ Cloudflare Pages Project

1. روح: **https://dash.cloudflare.com**
2. **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
3. اختر repository: **`mooryali95/Milestones-Impact`**
4. اضغط **Begin setup**

---

### الخطوة 3: إعدادات البناء ⚠️ مهم

**هذه الإعدادات مختلفة عن home و leaders** لأن Rehab يحتاج بناء:

| الحقل | القيمة |
|---|---|
| **Project name** | `mi-matrix` |
| **Production branch** | `main` |
| **Framework preset** | `Create React App` |
| **Build command** | `npm run build` |
| **Build output directory** | `build` |
| **Root directory** | (اتركه فارغاً) |

⚠️ **انتبه:**
- ❌ **لا تختر** "None" في Framework preset
- ✅ **اختر** "Create React App"
- ✅ Build command = `npm run build`
- ✅ Build output = `build` (بدون `/`)

---

### الخطوة 4: متغيرات البيئة (اختياري)

إن كان التطبيق يستخدم متغيرات بيئة، أضفها في:
**Settings → Environment variables**

(أنا لم أرَ متغيرات بيئة في الكود — جميع الـ APIs مكتوبة مباشرة)

---

### الخطوة 5: النشر الأول

اضغط **Save and Deploy**

**ستحصل على logs مثل:**
```
✅ Cloning repository...
✅ Detected Create React App
✅ Running npm install (1-2 دقيقة)
✅ Running npm run build (1-2 دقيقة)
✅ Validating asset output directory: build
✅ Deployment complete
```

**المدة الكلية:** 3-5 دقائق

ستحصل على رابط مثل:
```
https://mi-matrix.pages.dev
```

افتحه واختبر:
- [ ] الصفحة الرئيسية تظهر
- [ ] التطبيق يعمل (login, navigation)
- [ ] لا أخطاء في Console

---

### الخطوة 6: ربط `matrix.sunkvalue.com`

1. في المشروع: **Custom domains** → **Set up a custom domain**
2. أدخل: `matrix.sunkvalue.com`
3. اضغط **Continue**
4. Cloudflare سيُضيف DNS record تلقائياً
5. انتظر 1-2 دقيقة ✅

افتح: **https://matrix.sunkvalue.com**

---

## ✅ قائمة الاختبارات بعد النشر

### اختبارات أساسية:
- [ ] `https://matrix.sunkvalue.com` يفتح الصفحة الرئيسية
- [ ] التصميم سليم (الألوان، الخطوط، RTL)
- [ ] الـ navigation يعمل
- [ ] لا أخطاء في Browser Console (F12)

### اختبارات وظيفية:
- [ ] تسجيل الدخول يعمل (AWS Lambda API)
- [ ] قاعدة البيانات تعمل (Supabase)
- [ ] إرسال OTP يعمل
- [ ] الـ admin panel يعمل

### اختبارات الروابط من home:
- [ ] افتح `mi.sunkvalue.com`
- [ ] اضغط بطاقة **"مصفوفة التأثير"**
- [ ] يجب أن تذهب لـ `matrix.sunkvalue.com` ✅

### اختبارات على الجوال:
- [ ] الـ responsive يعمل
- [ ] الـ touch interactions طبيعية

---

## 🆘 حلول للمشاكل المحتملة

### المشكلة 1: "Build failed - Out of memory"
**السبب:** الـ React build قد يحتاج ذاكرة أكبر.
**الحل:** أضف في **Settings → Environment variables**:
```
NODE_OPTIONS = --max-old-space-size=4096
```

### المشكلة 2: "404 Not Found" عند تحديث الصفحة
**السبب:** SPA routing لا يعمل.
**الحل:** تأكد أن `public/_redirects` تم نشره (موجود في build).

### المشكلة 3: Login لا يعمل
**السبب:** CORS من AWS Lambda يرفض النطاق الجديد.
**الحل:** في AWS Lambda → Function URL → CORS:
- أضف `https://matrix.sunkvalue.com` للقائمة المسموحة

### المشكلة 4: Supabase API لا يعمل
**السبب:** Supabase project قد يكون يحدّ النطاقات.
**الحل:** Supabase Dashboard → Authentication → URL Configuration:
- أضف `https://matrix.sunkvalue.com` للـ Site URL

---

## 🔮 بعد النجاح (اختياري)

### إيقاف AWS Amplify (بعد أسبوع من النجاح):

⚠️ **لا تستعجل!** اتركه يعمل أسبوعاً كـ backup.

عندما تكون متأكداً:

1. AWS Amplify Console → التطبيق
2. **App settings** → **General**
3. **Delete app** (أحمر، في الأسفل)

هذا سيوقف خدمة `mi.sunkvalue.com/Rehab` نهائياً.

### إن أردت إعادة توجيه قديم لجديد:

في Cloudflare → `mi.sunkvalue.com` project → **Functions** → أضف:

```javascript
// functions/Rehab.js
export async function onRequest(context) {
  return Response.redirect("https://matrix.sunkvalue.com", 301);
}
```

هذا سيُعيد توجيه `mi.sunkvalue.com/Rehab` → `matrix.sunkvalue.com` تلقائياً.

---

## 📊 المعمارية النهائية

```
mi.sunkvalue.com         →  home/      (Cloudflare Pages)
leaders.sunkvalue.com    →  leaders/   (Cloudflare Pages)
matrix.sunkvalue.com     →  Rehab      (Cloudflare Pages — built from src/)
```

**كل المشاريع:**
- ✅ تنشر تلقائياً عند `git push`
- ✅ HTTPS مجاناً
- ✅ CDN عالمي
- ✅ Preview deployments لكل PR

---

## 📞 الدعم

إن واجهت مشكلة:
- شارك Build logs من Cloudflare
- شارك Browser Console errors
- شارك Network tab errors
