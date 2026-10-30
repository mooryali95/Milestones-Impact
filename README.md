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

## النشر

النشر على **Cloudflare Pages** ويتم تلقائياً عند كل دمج في `main`. AWS Amplify لم يعد مستخدماً.
المستودع الواحد يغذي خمس منصات مستقلة:

| النطاق | المجلد | مشروع Cloudflare | البناء |
|---|---|---|---|
| `mi.sunkvalue.com` | `home/` | `mi-home` | بلا بناء. يشمل `/leaders/` و`/projects/` و`/governance/` |
| `leaders.sunkvalue.com` | `leaders/` | `mi-leaders` | منصة القادة (ناتج بناء `leaders-app/` مُودع) |
| `matrix.sunkvalue.com` | الجذر (`src/` و`index.html` و`public/`) | `mi-matrix` | `npm run build` إلى `build/` |
| `admin.sunkvalue.com` | `admin/` | `mi-admin` | بلا بناء |
| SSPDF | `SSPDF/` | `mi-sspdf` | تطبيق Vite مستقل |

كل طلب دمج يحصل على معاينة لكل منصة، ويشغّل فحص `build-and-test` في GitHub Actions.

### قبل الدفع

```bash
npm ci && npm run lint && npm test && npm run build
```

بعد أي تعديل على CSS أو `shared/` شغّل `python3 shared/build-css.py`، ولا تعدّل `main.css` يدوياً (التفاصيل في `shared/README.md`).

### تنبيهات

1. محتوى صفحة القادة في `home/leaders/`، والمجلد `leaders/` للتحويل فقط.
2. لا تفصل نطاق `leaders.sunkvalue.com` عن مشروع `mi-leaders`، فهو يخدم منصة القادة.
3. ابدأ كل عمل من فرع جديد مأخوذ من `main`، وادمج عبر طلب دمج.
4. كود الخادم (سياسات RLS ودوال Supabase) غير موجود في المستودع ويُراجع من لوحة Supabase.

`DEPLOY-CLOUDFLARE.md` و`DEPLOY-MATRIX.md` دليلا الإعداد الأول، وبعض ما فيهما تغيّر (انظر التنبيه أعلى كل منهما).

---

## هيكل الملفات

```
home/       ← الموقع الأم وصفحات القادة والمشاريع والحوكمة
leaders/    ← تحويل النطاق القديم فقط
admin/      ← لوحة الإدارة
src/        ← تطبيق مصفوفة التأثير (React + Vite)
SSPDF/      ← منصة SSPDF
shared/     ← الهوية والأنماط المشتركة وسكربت البناء
```

---

## للتواصل
- ✉ mi@sunkvalue.com

© 2026 Milestone Impact — جميع الحقوق محفوظة
