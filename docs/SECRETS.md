# الأسرار ومتغيرات البيئة (المصدر الواحد)

لا قيمة سرية في هذا الملف ولا في المستودع. الجدول يسمّي كل متغير، ومن يقرؤه، وأين يُضبط، وهل هو إلزامي، ومن يدوّره. حارس آلي (`leaders-app/src/engineering.test.js`) يفشل إن ظهر في الدوال متغير غير مذكور هنا.

## دوال Supabase (Edge Functions ← Secrets)

| المتغير | إلزامي | من يقرؤه | الغرض | التدوير |
|---|---|---|---|---|
| `SUPABASE_URL` | تحقنه Supabase | كل الدوال | عنوان المشروع | لا يُدوَّر |
| `SUPABASE_SERVICE_ROLE_KEY` | تحقنه Supabase | كل الدوال (`core.ts`، `admin-api`، `user-api`، `send-otp`) | عميل الخدمة الذي يتجاوز RLS؛ لا يغادر الخادم | من لوحة Supabase عند أي اشتباه؛ تُعاد قراءته تلقائيًا |
| `LEADERS_TOKEN_PEPPER` | **نعم** (الدالة ترفض الإقلاع بدونه) | `leaders-api/core.ts` | ملح هاش رموز الدخول والجلسات، فلا يكفي تسريب القاعدة وحده | تدويره يُبطل كل الجلسات والرموز الجارية؛ يُفعل خارج ساعات الورش |
| `RESEND_API_KEY` | نعم للبريد | `core.ts`، `_shared/mail.ts`، `admin-api`، `user-api`، `send-otp` | إرسال رموز الدخول والإشعارات؛ غيابه = `mail_unconfigured` وتنبيه فوري | من لوحة Resend |
| `LEADERS_MAIL_FROM` | لا (افتراضي في `_shared/mail.ts`) | `core.ts` | عنوان المرسل | مع النطاق الموثّق في Resend |
| `LEADERS_MAIL_DAILY_CAP` | لا (80) | `core.ts` | سقف رسائل الرموز يوميًا؛ التسجيلات تقف عند 70% منه | بحسب خطة Resend |
| `LEADERS_APP_URL` | لا (`SITES.leaders`) | `core.ts` | روابط البريد والتحقق | عند تغيير النطاق |
| `LEADERS_RP_ID` | لا (`leaders.sunkvalue.com`) | `core.ts` ← `passkeys.ts` | نطاق مفاتيح المرور للمشاركين | تغييره يُبطل مفاتيح المرور المسجلة |
| `LEADERS_ORIGINS` | لا (`SITES.leaders`) | `core.ts` | أصول CORS ومفاتيح المرور (قائمة بفواصل) | عند إضافة نطاق |
| `LEADERS_ADMIN_ORIGINS` | لا (`SITES.admin`) | `core.ts` | لوحة الإدارة في CORS فقط | عند إضافة نطاق |
| `LEADERS_CRON_SECRET` | نعم للجدولة | `core.ts` ← `cron.reminders` | يرسله pg_cron (من Vault) لتشغيل التذكيرات والتقرير والتنظيف | يُدوَّر في Vault والدالة معًا |
| `LEADERS_ALERT_EMAIL` | موصى به | `core.ts` ← `alertOps`، التقرير الأسبوعي | بريد المالك للتنبيه الفوري والتقرير | عند تغيير المسؤول |
| `LEADERS_TURNSTILE_SECRET` | لا (بدونه لا تحقق بشري) | `core.ts`، `send-otp` | التحقق من رمز Cloudflare Turnstile قبل إرسال أي رمز | من لوحة Cloudflare مع `SITE_KEY` |
| `LEADERS_TURNSTILE_SITE_KEY` | مع السر | `core.ts`، `send-otp` | المفتاح العام للأداة في الواجهة (يُرسل للمتصفح) | مع السر |
| `LEADERS_CALCOM_SECRET` | لا | `core.ts` ← `leaders-hooks` | توقيع خطاف Cal.com | من لوحة Cal.com |
| `LEADERS_CALENDLY_KEY` | لا | `core.ts` ← `leaders-hooks` | مفتاح توقيع Calendly | من لوحة Calendly |
| `CREEM_API_KEY` (أو `CAREEM_SECRET_KEY`) | نعم للدفع | `payments.ts` | إنشاء صفحات الدفع؛ البادئة `creem_test_` = وضع الاختبار | من لوحة Creem؛ الاسم البديل يبقى مقبولًا حتى تُوحَّد الأسماء في اللوحة |
| `CREEM_WEBHOOK_SECRET` (أو `CAREEM_WEBHOOK_SECRET`) | نعم للدفع | `payments.ts` ← `creem-webhook` | توقيع HMAC لإشعارات الدفع؛ بدونه يُرفض كل إشعار (503 config) | من لوحة Creem |
| `ADMIN_RP_ID`، `ADMIN_ORIGINS` | لا (`sunkvalue.com`، `SITES`) | `admin-api` | مفاتيح مرور الإدارة وأصولها | عند تغيير النطاق |
| `USER_RP_ID`، `USER_ORIGINS` | لا (`sunkvalue.com`، `SITES`) | `user-api` | مفاتيح مرور مشاركي المصفوفة | عند تغيير النطاق |

## GitHub (Settings ← Secrets and variables ← Actions)

| السر | من يقرؤه | الغرض |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `ci.yml` (deploy)، `deploy-leaders-api.yml`، `schema-check.yml`، `scripts/db/snapshot.mjs` | نشر الدوال، وقراءة بنية القاعدة الحية |
| `SUPABASE_DB_URL` | `backup.yml`، `restore-drill.yml` | النسخ الليلي وتمرين الاستعادة |
| `BACKUP_PASSPHRASE` | `backup.yml`، `restore-drill.yml` | تشفير النسخة وفكّها |
| `SUPABASE_SERVICE_ROLE_KEY` (اختياري) | `backup.yml` | نسخ دلو الملفات `leaders-private` |

## ليست أسرارًا (في المستودع عمدًا)

- المفتاح العام `anon` في الواجهات وسير النشر والمسبار: عام بطبيعته، الحماية بـRLS والدوال.
- `GOOGLE_CLIENT_ID` في `_shared/sites.js`: معرّف عميل، والنطاقات المسموحة في Google Cloud Console.
- `supabase/functions/ci.env`: قيم وهمية لسير التكامل المحلي، لا تصلح لأي بيئة حية.

## القواعد

1. السر يُضبط في موضعه (Supabase أو GitHub) ولا يُكتب في ملف ولا في رسالة ولا في طلب دمج.
2. `leaders-api` يرفض الإقلاع بلا `SUPABASE_SERVICE_ROLE_KEY` و`LEADERS_TOKEN_PEPPER` (`core.ts`)، فالنشر الناقص يُكتشف فورًا من مسبار `system.ping` في سير النشر.
3. الأسرار الناقصة الأخرى تظهر في لوحة الإدارة ← النظرة العامة (`system.ts`).
4. عند إضافة متغير جديد: اقرأه في `core.ts` (للقادة) وأضفه هنا، وإلا فشل الحارس.
