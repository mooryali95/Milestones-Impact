# Milestone Impact — مصفوفة التأثير

## الدخول إلى لوحة الإدارة
الدخول يتم عبر **البريد الإلكتروني + رمز تحقق لمرة واحدة (OTP)** أو تطبيق مصادقة (TOTP)،
ولم يعد هناك اسم مستخدم/كلمة مرور ثابتة في الكود.

- المدراء المصرّح لهم محفوظون في جدول `admin_users` في Supabase.
- لإضافة مدير جديد: من داخل لوحة الإدارة (يتطلب صلاحية `super_admin`)،
  أو مباشرة في جدول `admin_users`.
- كل عمليات الإدارة تمر عبر دالة `admin-api` وتُصادَق بجلسة موقّعة على الخادم.

> ملاحظة أمنية: المفتاح العام (anon key) الموجود في الكود عام بطبيعته ولا يمنح
> أي وصول للبيانات — الحماية مفروضة عبر RLS ودوال الحافة (Edge Functions).

---

## النشر على AWS Amplify

### الطريقة 1: عبر GitHub (الموصى بها)

```bash
# 1. افتح Terminal في مجلد المشروع
cd milestone-impact

# 2. ثبّت المكتبات وتأكد يشتغل محلياً
npm install
npm start
# يفتح المتصفح على http://localhost:3000

# 3. ارفع على GitHub
git init
git add .
git commit -m "Milestone Impact v5"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/milestone-impact.git
git push -u origin main

# 4. اذهب لـ AWS Console → Amplify → New App → Host Web App
# 5. اختر GitHub → اختر المستودع → Deploy
# 6. خلال 3-5 دقائق يعطيك رابط
```

### الطريقة 2: رفع يدوي (بدون GitHub)

```bash
# 1. بناء المشروع
npm install
npm run build

# 2. اذهب لـ AWS Amplify → New App → Deploy without Git
# 3. ارفع مجلد build/ كملف مضغوط
```

---

## هيكل الملفات

```
milestone-impact/
├── public/
│   └── index.html          ← الصفحة الرئيسية
├── src/
│   ├── App.jsx              ← التطبيق بالكامل
│   └── index.js             ← نقطة الدخول
├── amplify.yml              ← إعدادات Amplify
├── package.json             ← المكتبات
└── README.md                ← هذا الملف
```

---

## للتواصل
- 📞 0532134539
- ✉ omar@sunkvalue.com

© 2026 Milestone Impact — جميع الحقوق محفوظة
