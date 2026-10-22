# تطبيق القادة · leaders.sunkvalue.com

تطبيق المشارك في برنامج إدارة المشروعات للقادة: التسجيل بالبريد (رابط ورمز) ومفتاح المرور، الملف الشخصي، تحديد المستوى في الأبعاد الثلاثة، ثم الرحلة بمراحلها وقوائم تحققها. صفحة البرنامج التسويقية تبقى في `home/leaders/` على mi.sunkvalue.com/leaders.

## التشغيل محليًا

```
npm run leaders:dev     # http://localhost:5174
npm run leaders:build   # leaders-app/build
```

الخلفية دالة `supabase/functions/leaders-api`، ومنطقها الصافي في `logic.js` مختبر في `src/logic.test.js` (ضمن `npm test`).

## النشر على Cloudflare Pages (مشروع mi-leaders)

| الإعداد | القيمة |
|---|---|
| Build command | `npm run leaders:build` |
| Build output directory | `leaders-app/build` |
| Root directory | (فارغ، جذر المستودع) |

المجلد القديم `leaders/` (تحويل 301) يبقى في المستودع حتى يُبدَّل إعداد المشروع، ثم يمكن حذفه.

## الخلفية: خطوات مرة واحدة

1. ترحيلات SQL بالترتيب: `server/leaders.sql` ثم `leaders-002-assessment.sql` ثم `leaders-003-journey.sql` ثم `leaders-004-storage.sql`.
2. أسرار Edge Functions: `LEADERS_TOKEN_PEPPER` (نص عشوائي طويل، إلزامي). اختياري: `LEADERS_APP_URL` و`LEADERS_RP_ID` و`LEADERS_ORIGINS` و`LEADERS_MAIL_FROM`.
3. نشر الدالة: من لوحة Supabase (Edge Functions ثم Via Editor) بلصق ملف واحد يُولَّد بالأمر `deno bundle --external 'npm:*' -o leaders-api-index.ts supabase/functions/leaders-api/index.ts`، أو عبر CLI: `supabase functions deploy leaders-api`.
