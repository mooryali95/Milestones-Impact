# تطبيق القادة · leaders.sunkvalue.com

تطبيق المشارك في برنامج إدارة المشروعات للقادة: التسجيل بالبريد (رابط ورمز) ومفتاح المرور، الملف الشخصي، تحديد المستوى في الأبعاد الثلاثة، ثم الرحلة بمراحلها وقوائم تحققها. صفحة البرنامج التسويقية تبقى في `home/leaders/` على mi.sunkvalue.com/leaders.

## التشغيل محليًا

```
npm run leaders:dev     # http://localhost:5174
npm run leaders:build   # يكتب في leaders/
```

الخلفية دالة `supabase/functions/leaders-api`، ومنطقها الصافي في `logic.js` مختبر في `src/logic.test.js` (ضمن `npm test`).

## النشر على Cloudflare Pages (مشروع mi-leaders)

المشروع ينشر مجلد `leaders/` في جذر المستودع كما هو (Build output directory: `leaders`، بلا أمر بناء)، وهو ناتج بناء هذا التطبيق مُودعًا في Git. بعد أي تعديل في `leaders-app/` شغّل `npm run leaders:build` وأودع مجلد `leaders/` مع التعديل، والفحص المستمر يفشل إن نسيت.

## الخلفية: خطوات مرة واحدة

1. ترحيلات SQL بالترتيب: `server/leaders.sql` ثم `leaders-002-assessment.sql` ثم `leaders-003-journey.sql` ثم `leaders-004-storage.sql` ثم `leaders-005-handbook.sql` ثم `leaders-006-journey-content.sql` ثم `leaders-007-tracks.sql` (المسارات الـ27: تركيبة مستويات الأطر الثلاثة، رمزها مثل M1I1L2) ثم `leaders-008-placement-model.sql` (معيار التسكين المركّب) ثم `leaders-009-organizations.sql` (الجهات الشريكة ورابط دعوة كل جهة) ثم `leaders-010-org-attribution.sql` (النسب التلقائي: الرابط القصير `/j/<invite_code>/<حملة>`، ونطاقات الجهة، وذاكرة 30 يومًا) ثم `leaders-011-book-and-models.sql` (الكتاب التفاعلي: التأمل والاختبار لكل باب، والنماذج التعليمية وتسليماتها وتقييمها، وسجل النقاط والرتب).
2. أسرار Edge Functions: `LEADERS_TOKEN_PEPPER` (نص عشوائي طويل، إلزامي). اختياري: `LEADERS_APP_URL` و`LEADERS_RP_ID` و`LEADERS_ORIGINS` و`LEADERS_MAIL_FROM`.
3. نشر الدالة: من لوحة Supabase (Edge Functions ثم Via Editor) بلصق ملف واحد يُولَّد بالأمر `deno bundle --external 'npm:*' -o leaders-api-index.ts supabase/functions/leaders-api/index.ts`، أو عبر CLI: `supabase functions deploy leaders-api`.
