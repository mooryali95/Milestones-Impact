# تطبيق القادة · leaders.sunkvalue.com

تطبيق المشارك في برنامج إدارة المشروعات للقادة: الدخول بالبريد (رمز أو رابط) أو Google أو مفتاح المرور، الملف، تحديد المستوى في الأبعاد الثلاثة، ثم الرحلة بمراحلها (الكتيب، النماذج، المختبر، المبادرة، القاعة، الأثر، التقييم الختامي). في المسارات نفسها بوابة الجهة (`/org`)، وبوابة الخبير (`/x`)، والتحقق من الشهادات (`/verify`)، والوثائق القانونية (`/legal`). صفحة البرنامج التسويقية في `home/leaders/`.

## التشغيل محليًا

```bash
npm run leaders:dev     # http://localhost:5174
```

```bash
npm run leaders:build   # يكتب في leaders/ (مُودع؛ CI يرفض اختلافه عن المصدر)
```

الخلفية دالة `supabase/functions/leaders-api`. المنطق النقي في ملفات `.js` هناك (`logic.js` وأخواتها) مختبر بـvitest ضمن `npm test`؛ والأجزاء التي تحتاج Deno (توقيع Google، مفاتيح المرور، توقيع Creem) في `*_test.ts` بـ`deno test`.

## البناء والنشر

- الشاشات الثقيلة تُحمَّل كسولًا (`lazy` في `src/App.jsx`) وقطعة React مستقلة (`vite.config.js`)؛ عامل الخدمة `public/sw.js` يسمّي مخزنه ببصمة البناء فيتجدد مع كل نشر.
- الخطوط مستضافة ذاتيًا في `public/fonts/` (لا طلب إلى Google Fonts)؛ CSP في `public/_headers`.
- النشر عبر CI: بعد الدمج في `main` تُنشر الدوال ثم يُدفع فرع `release` فتبني Cloudflare Pages (`mi-leaders`، مجلد الإخراج `leaders`). التفاصيل والتراجع في `RUNBOOK.md`.

## الخلفية: الإعداد

1. **القاعدة:** الترحيلات في `supabase/migrations/` بالترتيب (الملفات القديمة في `server/` أرشيف لا يُشغَّل، انظر `server/ARCHIVE.md`). سجل ما طُبّق في `leaders.schema_migrations`، وما لم يُطبَّق يظهر في لوحة الإدارة ← النظرة العامة.
2. **الأسرار:** `LEADERS_TOKEN_PEPPER` إلزامي (الدالة ترفض الإقلاع بدونه)، و`RESEND_API_KEY` للبريد، وبقية المتغيرات واختياريتها في `docs/SECRETS.md`.
3. **الدالة:** تُنشر من CI (`ci.yml` ← deploy) أو يدويًا من Actions ← «Deploy functions (manual)». محليًا: `supabase start` ثم `supabase functions serve --env-file supabase/functions/ci.env --no-verify-jwt`، والمسارات الذهبية بـ`node scripts/integration/golden.mjs`.
