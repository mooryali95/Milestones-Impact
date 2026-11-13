# Milestone Impact — مصفوفة التأثير وبرنامج القادة

مستودع واحد يغذي خمس منصات، وخلفيتها Supabase (المشروع `eormhcupwgwpllhrfxxg`) بدوال حافة وترحيلات SQL كلها في المستودع. دليل التشغيل اليومي في `RUNBOOK.md`، والأسرار في `docs/SECRETS.md`، وسجل التسليم والتدقيقات في المستودع الخاص `mooryali95/MI-private` (انظر `docs/README.md`).

## المنصات

| النطاق | المصدر | المجلد المنشور | مشروع Cloudflare | البناء |
|---|---|---|---|---|
| `mi.sunkvalue.com` | `home/` + `shared/` | `home/` | `mi-home` | بلا بناء (`python3 shared/build-css.py` يولّد CSS والأصول المشتركة) |
| `leaders.sunkvalue.com` | `leaders-app/` (React + Vite) | `leaders/` (ناتج البناء مُودع) | `mi-leaders` | `npm run leaders:build`؛ CI يرفض اختلاف `leaders/` عن مصدره |
| `admin.sunkvalue.com` | `admin-app/` (React + Vite) | `admin/` (ناتج البناء مُودع) | `mi-admin` | `npm run admin:build`؛ CI يرفض اختلاف `admin/` عن مصدره |
| `matrix.sunkvalue.com` | الجذر (`src/`، `index.html`، `public/`) | `build/` (لا يُودع) | `mi-matrix` | `npm run build` على Cloudflare |
| SSPDF (مجمّدة) | `SSPDF/` | لا شيء | `mi-sspdf` يُوقف | مجمّدة بقرار D13: `SSPDF/FROZEN.md` |

## الخلفية

- **الدوال:** `supabase/functions/`: `leaders-api` (برنامج القادة كله)، `creem-webhook` (إشعارات الدفع)، `leaders-hooks` (Cal.com وCalendly)، `send-otp` (نموذج التواصل ورموز الموقع)، `admin-api` (لوحة الإدارة)، `user-api` (مشاركو المصفوفة). المنطق النقي في ملفات `.js` تستوردها الدوال والتطبيقات والاختبارات معًا.
- **القاعدة:** `supabase/migrations/` بالترتيب، وسجل ما طُبّق في `leaders.schema_migrations`، ولقطة البنية `supabase/schema/baseline.sql` تُبنى من الترحيلات وتُفحص في CI وليليًا على القاعدة الحية. الترحيلات تُطبَّق يدويًا بموافقة المالك (`RUNBOOK.md` §1).
- **الإعداد المحلي:** `supabase/config.toml` لـ`supabase start` (بلا تطبيق تلقائي للترحيلات)؛ سير `integration.yml` يشغّله في CI، يطبّق اللقطة ثم البذرة المرجعية `scripts/integration/seed-reference.sql` ثم الترحيلات بالترتيب، ويمرّر المسارات الذهبية بطلبات حقيقية.

## النشر

طلب دمج ← CI (`ci.yml`: المولَّدات متزامنة، lint، أنواع كل الدوال، اختبارات Deno، 600+ اختبار وحدة، البناء، 120+ اختبار متصفح) ← دمج في `main` ← وظيفة `deploy`: الدوال ← مسبار `system.ping` حقيقي ← دفع فرع `release` الذي تبني منه Cloudflare Pages المنصات. لا شيء يصل الإنتاج إن احمرّ فحص. التفاصيل والتراجع في `RUNBOOK.md`.

## قبل الدفع

```bash
npm ci && npm run lint && npm test && npm run build && npm run leaders:build && npm run admin:build
```

```bash
npx playwright test
```

- بعد أي تعديل على CSS أو `shared/`: `python3 shared/build-css.py` (لا تعدّل `main.css` يدويًا؛ التفاصيل في `shared/README.md`).
- بعد أي تعديل في `leaders-app/` أو `admin-app/`: أعد البناء وأودع المجلد المنشور مع التعديل.
- Node 20 (`.nvmrc`)؛ Deno 2 لفحص الدوال واختباراتها: `deno check --node-modules-dir=auto supabase/functions/*/index.ts` و`deno test --node-modules-dir=none --allow-env --allow-read supabase/functions/leaders-api/` (لا تستعمل auto هنا: يكتب في node_modules ويكسر Playwright).

## الدخول إلى لوحة الإدارة

بالبريد الإلكتروني ورمز لمرة واحدة، أو تطبيق مصادقة (TOTP)، أو مفتاح مرور. المدراء في جدول `admin_users`، والإضافة من اللوحة بصلاحية `super_admin`. كل العمليات عبر `admin-api` بجلسة موقّعة على الخادم. المفتاح العام (anon) في الكود عام بطبيعته؛ الحماية بـRLS والدوال.

## هيكل الملفات

```
home/            ← الموقع الأم وصفحات القادة والمشاريع والحوكمة (ثابت)
leaders-app/     ← تطبيق القادة (المصدر)        leaders/  ← ناتج بنائه المنشور
admin-app/       ← لوحة الإدارة (المصدر)         admin/    ← ناتج بنائها المنشور
src/             ← تطبيق مصفوفة التأثير
shared/          ← الهوية والأنماط المشتركة وسكربت البناء والقاعة المشتركة
supabase/        ← الدوال والترحيلات واللقطة والمحتوى (الأسئلة، الكتيب، كاتون)
scripts/         ← مولّدات المحتوى ومتحققاته، اللقطة، التكامل، المحاكاة
docs/            ← التدقيق (audit) والتسليم (journey) والأسرار
e2e/             ← اختبارات المتصفح (الخلفية مُحاكاة)
```

## للتواصل
- ✉ mi@sunkvalue.com

© 2026 Milestone Impact — جميع الحقوق محفوظة
