# دليل التشغيل (RUNBOOK)

صفحة واحدة لمن يشغّل المنظومة: كيف يصل التغيير إلى الإنتاج، وكيف يُرجَع، وما يراقبه، وكيف يستعيد. آخر تحديث: 2026-11-04 (المرحلة ب).

## 1. مسار النشر

```
طلب دمج ← CI (lint، وحدة، أنواع Deno، بناء، متصفح) ← دمج في main
        ← CI على main ← الوظيفة deploy: الدوال الأربع ← مسبار system.ping ← دفع فرع release
        ← Cloudflare Pages تبني المنصات من release
```

- **الدوال** (`leaders-api`، `creem-webhook`، `leaders-hooks`، `send-otp`) تُنشر في `ci.yml` بعد خضرة الفحوص، بالسر `SUPABASE_ACCESS_TOKEN`. بلا السر يُكتب تحذير ولا تُنشر.
- **المنصات الخمس** تُبنى من فرع `release` الذي لا يدفعه إلا CI. إعداد لمرة واحدة في Cloudflare لكل مشروع (`mi-home`، `mi-leaders`، `mi-matrix`، `mi-admin`، `mi-sspdf`): Settings ← Builds & deployments ← Production branch = `release`. قبل هذا الإعداد تبقى المنصات تُبنى من `main` مباشرة كما كانت (بلا بوابة).
- **الترتيب ثابت:** الدوال قبل المنصات، لأن الواجهة تطلب أعمدة وإجراءات يعرفها الخادم الجديد.
- **ترحيلات SQL يدوية**: تُطبَّق قبل نشر الدالة التي تحتاجها، بموافقة المالك الصريحة التي تسمّي الترحيل. الطريقة المعتمدة: سير `migrate.yml` (Actions ← Apply migrations ← Run workflow) بأسماء الترحيلات بالترتيب؛ يطبّقها `scripts/db/apply-migration.mjs` بالسر نفسه، ويتخطى المسجّل سلفًا، ويوقف السلسلة عند أول فشل مُظهرًا خطأ القاعدة. والبديل اليدوي أدناه. ترحيلات القياس v5 بترتيبها: `20261105150000_leaders_v5_1_pre_activation` (إصلاحات ما قبل التفعيل: الأطوال، استبدال فقرات المسميات، الزمن) ثم `20261102100100_leaders_activate_v5` بقرار؛ التفعيل يرفض قبل الأول، والأول يرفض إن بدأ أحد قياسًا على v5. سجل ما طُبّق في جدول `leaders.schema_migrations` (منذ `20261105110000`): كل ترحيل جديد ينتهي بسطر يسجّل اسمه فيه، وفحص الصحة في النظرة العامة يقارن السجل بمجلد الترحيلات فيعرض ما لم يُطبَّق بعد. لقطة البنية `supabase/schema/baseline.sql` تُبنى من الترحيلات (`node scripts/db/snapshot.mjs --from-migrations`) وتُفحص في CI، وتُقارن بالقاعدة الحية ليليًا (`schema-check.yml`):

```bash
python3 -c "import json;print(json.dumps({'query':open('supabase/migrations/<file>.sql').read()}))" > /tmp/q.json
curl -s -X POST https://api.supabase.com/v1/projects/eormhcupwgwpllhrfxxg/database/query \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d @/tmp/q.json
```

## 2. التراجع

| ما تراجع عنه | كيف |
|---|---|
| منصة (واجهة) | Cloudflare ← المشروع ← Deployments ← آخر نشر سليم ← Rollback. أو: `git push --force origin <sha-سليم>:refs/heads/release` فتُبنى المنصات كلها من ذلك الإيداع |
| دالة حافة | Actions ← «Deploy functions (manual)» ← Run workflow ← اختر الإيداع أو الوسم السليم في «Use workflow from». تُنشر الدوال الأربع من ذلك المرجع |
| قاعدة البيانات | لا تراجع آلي. آخر نسخة ليلية في Actions ← «Nightly database backup» ← Artifacts: `gpg -d leaders-YYYY-MM-DD.dump.gpg > db.dump` ثم `pg_restore -d "$SUPABASE_DB_URL" --clean --no-owner db.dump`. جداول `backup_*` من الترحيلات تبقى حتى يُسمح بحذفها |

## 3. المراقبة والتنبيه

- **مسبار حقيقي:** `POST https://eormhcupwgwpllhrfxxg.supabase.co/functions/v1/leaders-api` بجسم `{"action":"system.ping"}` ورؤوس `apikey`/`Authorization: Bearer <المفتاح العام>` ← `{"success":true,"db_ms":…}`. يمر بالقاعدة فعلًا.
- **المراقب الخارجي (الأساس):** أضف المسبار أعلاه في UptimeRobot أو Cloudflare Health Checks كل 5 دقائق مع كلمة `"success":true` شرطًا، وصفحات `leaders.sunkvalue.com` و`mi.sunkvalue.com` و`admin.sunkvalue.com` كفحوص 200. (لم يُضبط بعد؛ يحتاج حساب المالك.)
- **شبكة الأمان:** `probe.yml` كل ساعة يفعل الشيء نفسه؛ فشله يُرسل بريد GitHub عن فشل سير العمل. جدولة GitHub قد تتأخر ساعات.
- **تنبيه فوري من الدالة:** أي خطأ داخلي (500) أو تعطل بريد (`mail_failed`، `mail_cap`، `mail_unconfigured`) أو فشل خطاف Creem أو Cal.com يصل `LEADERS_ALERT_EMAIL` فورًا، مرة كل عشر دقائق لكل نوع، مع رقم مرجع يراه المستخدم في رسالة الخطأ ويظهر في سجل الدالة. السجل: Supabase ← Edge Functions ← leaders-api ← Logs، ابحث بالمرجع.
- **التقرير الأسبوعي:** يوم الأحد عبر `cron.reminders` (pg_cron). إن لم يصل أحدًا فالجدولة ميتة: `select * from cron.job_run_details order by start_time desc limit 10;`. التشغيلة نفسها تنظّف ما مضى عليه 90 يومًا: رموز الدخول، الجلسات المنتهية، سجلات التحقق من الشهادات، وعناوين الشبكة في مشاهدات الكتيب (`purge` في `system.ts`).

## 4. النسخ الاحتياطي والاستعادة

- **ليليًا** (`backup.yml`، 00:30 UTC): dump مشفّر لمخططي `leaders` و`public` (30 يومًا)، ومع `SUPABASE_SERVICE_ROLE_KEY` نسخة من دلو `leaders-private` (السير الذاتية والأدلة) كملف ثانٍ.
- **تمرين الاستعادة** (`restore-drill.yml`): شهريًا وعند الطلب، يستعيد آخر dump في قاعدة مؤقتة ويعدّ الصفوف. استعادة لم تُجرَّب ليست نسخة.
- النسخ في حساب GitHub نفسه؛ نسخة خارجه (دلو R2 أو جهاز المالك) قرار لاحق.

## 5. الأسرار (أين تُضبط)

| السر | أين | لماذا |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | GitHub ← Secrets | نشر الدوال |
| `SUPABASE_DB_URL`، `BACKUP_PASSPHRASE` | GitHub ← Secrets | النسخ الليلي والتمرين |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub ← Secrets (اختياري) | نسخ دلو الملفات |
| `LEADERS_TOKEN_PEPPER` (إلزامي)، `RESEND_API_KEY`، `LEADERS_ALERT_EMAIL`، `LEADERS_CRON_SECRET`، `LEADERS_MAIL_DAILY_CAP` | Supabase ← Edge Functions ← Secrets | الرموز، البريد، التنبيه، الجدولة، السقف |
| `LEADERS_TURNSTILE_SECRET`، `LEADERS_TURNSTILE_SITE_KEY` | Supabase ← Secrets | التحقق البشري (التطبيق والموقع) |
| `CREEM_API_KEY`، `CREEM_WEBHOOK_SECRET` | Supabase ← Secrets | الدفع والإشعار |
| `LEADERS_CALCOM_SECRET`، `LEADERS_CALENDLY_KEY` | Supabase ← Secrets | خطاف الحجز |

«الأسرار الناقصة» تظهر في لوحة الإدارة ← النظرة العامة.

## 6. صباح الورشة: ما يُفحص في خمس دقائق

1. المسبار يرد `success:true` (أو آخر تشغيل أخضر لـ`probe.yml`).
2. لوحة الإدارة ← النظرة العامة: لا ترحيلات ناقصة، لا أسرار ناقصة، استهلاك البريد اليوم دون السقف (التسجيلات الجديدة تقف عند 70% منه؛ وجّه المتأخرين إلى الدخول بحساب Google).
3. الجهة لها دفعة جارية بمستشار، ونشاط الحضور له موعد اليوم.
4. إن وصل تنبيه `mail_cap` أو `mail_failed`: ارفع `LEADERS_MAIL_DAILY_CAP` بعد التأكد من خطة Resend، أو اطلب الدخول بـGoogle أو مفتاح المرور.
5. خطأ داخلي عند مشارك: اطلب رقم المرجع وابحث به في سجل الدالة.
