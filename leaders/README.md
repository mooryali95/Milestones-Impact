# 📗 Milestone Impact — Leaders Landing Page

> اللاندنج بيج الخاصة بـ **برنامج إدارة المشروعات للقادة** (أحد منتجات Milestone Impact).

---

## 🌐 الرابط الحي

```
https://leaders.sunkvalue.com/
```

---

## 📁 هيكل المجلد

```
leaders/
│
├── 📄 index.html                          ← الصفحة الرئيسية
│
└── 📁 assets/
    ├── 📁 css/
    │   ├── 🎨 main.css                    ← يستورد جميع ملفات CSS
    │   ├── 🎨 01-tokens.css               ← متغيرات الهوية
    │   ├── 🎨 02-base.css                 ← Reset + Body
    │   ├── 🎨 03-layout.css               ← Header + Footer
    │   ├── 🎨 04-components.css           ← Logo + Buttons
    │   ├── 🎨 05-sections.css             ← الأقسام التسعة
    │   └── 🎨 06-typeform.css             ← الفورم التفاعلي
    │
    └── 📁 js/
        ├── ⚙️ canvas.js                   ← الشبكة النورانية
        ├── ⚙️ scroll.js                   ← Scroll Effects
        ├── ⚙️ counters.js                 ← عدّادات الأرقام
        ├── ⚙️ tabs.js                     ← تبديل المسارات
        └── ⚙️ typeform.js                 ← منطق الفورم
```

---

## 🔌 إعداد إرسال الفورم

في `assets/js/typeform.js` يوجد كائن `CONFIG`:

```javascript
const CONFIG = {
  product: 'MI-LEADERS',
  method: 'mailto',                 // 'mailto' أو 'worker'
  workerUrl: 'https://mi-leaders-api.workers.dev/send',
  recipientEmail: 'mi@sunkvalue.com',
};
```

### الوضع الحالي: `mailto`
الفورم يفتح برنامج البريد الإلكتروني عند المستفيد.

### للترقية لـ Cloudflare Worker (مستقبلاً):
1. غيّر `method` إلى `'worker'`
2. تأكد أن `workerUrl` يشير إلى الـ Worker النشط

---

## 🎨 الهوية البصرية

### الألوان

| اللون | الكود | الاستخدام |
|---|---|---|
| Petrol Deepest | `#061E2C` | الخلفيات الداكنة |
| Gold | `#C8A45C` | اللمسات الذهبية |
| Sand Paper | `#FBF8EF` | خلفية الصفحة |

### الخطوط

- **Tajawal** — النصوص العربية
- **Cormorant Garamond** — `Milestone`, `Impact`, `Leadership`
- **Inter** — التسميات الإنجليزية الصغيرة

---

## 🚀 النشر

يُنشر تلقائياً عبر AWS Amplify مع نشر التطبيق الرئيسي.

الإعداد في `amplify.yml` (في جذر المشروع):
```yaml
postBuild:
  commands:
    - mkdir -p build/leaders
    - cp -r leaders/* build/leaders/
```

---

## 🛠 التعديل

| ما تريد تغييره | اذهب إلى |
|---|---|
| الألوان والخطوط | `assets/css/01-tokens.css` |
| النصوص | `index.html` |
| البريد المستقبِل | `assets/js/typeform.js` (CONFIG) |
| تبديل لـ Worker | `assets/js/typeform.js` (CONFIG.method) |

---

## 📞 معلومات الاتصال

- **البريد:** mi@sunkvalue.com
- **منظومة:** [manzoma.sa](https://manzoma.sa)
- **Sunk Value:** [sunkvalue.com](https://sunkvalue.com)

---

© 2026 Milestone Impact — جميع الحقوق محفوظة.
