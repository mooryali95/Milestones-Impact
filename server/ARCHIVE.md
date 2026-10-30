# أرشيف تاريخي

ملفات `leaders*.sql` و`analytics.sql` هنا أنشأت الجداول أول مرة، وبقيت للتاريخ فقط. **لا تُشغَّل ولا تُعدَّل.**

- **البنية الحالية كاملة:** `supabase/schema/baseline.sql`، يولّدها من القاعدة الحية `node scripts/db/snapshot.mjs`، ويفحص التطابق `--check`.
- **كل تغيير جديد:** ترحيل في `supabase/migrations/`، ثم تُحدَّث اللقطة.
