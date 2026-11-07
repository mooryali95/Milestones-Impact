# دليل التشغيل (RUNBOOK)

> **مع هذا الدليل:** ما يفعله كل دور ومتى في [`docs/ops/دليل-المشغل-v1.md`](docs/ops/دليل-المشغل-v1.md)، والحوادث والإخطار في [`docs/ops/خطة-الاستجابة-للحوادث-v1.md`](docs/ops/خطة-الاستجابة-للحوادث-v1.md)، وما يُقدَّم للجهات قبل التعاقد في [`docs/ops/صفحة-حقائق-الجهات-v1.md`](docs/ops/صفحة-حقائق-الجهات-v1.md).

صفحة واحدة لمن يشغّل المنظومة: كيف يصل التغيير إلى الإنتاج، وكيف يُرجَع، وما يراقبه، وكيف يستعيد. آخر تحديث: 2026-11-07 (الحزمة 1: التحقق المحلي وبوابة الترحيلات ومسار الطوارئ).

## 1. مسار النشر

```
طلب دمج ← CI (lint، وحدة، أنواع Deno، بناء، متصفح) ← دمج في main
        ← CI على main ← الوظيفة deploy: الدوال الست ← مسبار لكل دالة تخدم واجهة ← دفع فرع release
        ← Cloudflare Pages تبني المنصات من release
```

- **الدوال الست** (`leaders-api`، `creem-webhook`، `leaders-hooks`، `send-otp`، `admin-api`، `user-api`) تُنشر في `ci.yml` بعد خضرة الفحوص، بالسر `SUPABASE_ACCESS_TOKEN`. بلا السر يُكتب تحذير ولا تُنشر. بعد النشر يُسأل كل من `leaders-api` (`system.ping`) و`admin-api` و`user-api` (`ping`) طلبًا حقيقيًا يمر بالقاعدة؛ فشل أيٍّ منها يوقف دفع `release`.
- **المنصات الأربع** تُبنى من فرع `release` الذي لا يدفعه إلا CI (SSPDF مجمّدة بقرار D13: `SSPDF/FROZEN.md`). إعداد لمرة واحدة في Cloudflare لكل مشروع (`mi-home`، `mi-leaders`، `mi-matrix`، `mi-admin`): Settings ← Builds & deployments ← Production branch = `release`. قبل هذا الإعداد تبقى المنصات تُبنى من `main` مباشرة كما كانت (بلا بوابة).
- **بوابة الأسرار قبل النشر (المرحلة ل1):** قبل نشر أي دالة يتحقق `scripts/ops/function-secrets.mjs --require=signin` بالأسماء فقط أن الفلفل ومفتاح البريد ومفتاحَي Turnstile مضبوطة على المشروع. غياب أحدها يوقف النشر كله برسالة تسمّيه، لأن التحقق البشري صار يفشل مغلقًا ونشر الدوال بلا مفتاحيه يوقف الدخول برمز البريد. الحل: اضبط السر الناقص ثم أعد تشغيل الوظيفة.
- **الترتيب ثابت:** الدوال قبل المنصات، لأن الواجهة تطلب أعمدة وإجراءات يعرفها الخادم الجديد.
- **ترحيلات SQL يدوية**: تُطبَّق قبل نشر الدالة التي تحتاجها، بموافقة المالك الصريحة التي تسمّي الترحيل. الطريقة المعتمدة: سير `migrate.yml` (Actions ← Apply migrations ← Run workflow) بأسماء الترحيلات بالترتيب؛ يطبّقها `scripts/db/apply-migration.mjs` بالسر نفسه، ويتخطى المسجّل سلفًا، ويوقف السلسلة عند أول فشل مُظهرًا خطأ القاعدة. والبديل اليدوي أدناه. **السجل أولًا:** كل ترحيل منذ `20261105100000` يسجّل نفسه في `leaders.schema_migrations`، فعلى قاعدة بلا سجل يُطبَّق `20261105110000` (الذي ينشئه) قبل أي منها، ثم الباقي بترتيب أسمائه (هكذا طُبّقت الثمانية على الإنتاج في 2026-11-04). ترحيلات القياس v5 بترتيبها: `20261105150000_leaders_v5_1_pre_activation` (إصلاحات ما قبل التفعيل: الأطوال، استبدال فقرات المسميات، الزمن) ثم `20261102100100_leaders_activate_v5` بقرار؛ التفعيل يرفض قبل الأول، والأول يرفض إن بدأ أحد قياسًا على v5. سجل ما طُبّق في جدول `leaders.schema_migrations` (منذ `20261105110000`): كل ترحيل جديد ينتهي بسطر يسجّل اسمه فيه، وفحص الصحة في النظرة العامة يقارن السجل بمجلد الترحيلات فيعرض ما لم يُطبَّق بعد. لقطة البنية `supabase/schema/baseline.sql` تُبنى من الترحيلات (`node scripts/db/snapshot.mjs --from-migrations`) وتُفحص في CI، وتُقارن بالقاعدة الحية ليليًا (`schema-check.yml`):

```bash
python3 -c "import json;print(json.dumps({'query':open('supabase/migrations/<file>.sql').read()}))" > /tmp/q.json
curl -s -X POST https://api.supabase.com/v1/projects/eormhcupwgwpllhrfxxg/database/query \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d @/tmp/q.json
```

- **بوابة الترحيلات قبل النشر (الحزمة 1):** قبل نشر أي دالة يقرأ `scripts/ops/pending-migrations.mjs` سجل `leaders.schema_migrations` قراءةً، ويوقف النشر إن بقي في المستودع ترحيل غير مطبّق. يُستثنى ما يحمل في سطوره الأولى `-- deploy-gate: tolerant` (الدوال تقرؤه قراءة متسامحة) أو `-- deploy-gate: deferred <القرار>` (مؤجل بقرار ولا تعتمد عليه الدوال، مثل تفعيل v5). لقائمة فقط: `node scripts/ops/pending-migrations.mjs --list`.
- **التحقق المحلي (D16):** `npm run verify` يجري خطوات `build-and-test` في `ci.yml` نفسها بترتيبها، ويحرس تطابقهما `verify-parity.test.js`، ويطبع ملخصًا برقم الإيداع يُلصق في طلب الدمج. ما دامت Actions موقوفة لا يُدمج طلب إلا بهذا الملخص كاملًا بلا تخطٍّ وبشجرة نظيفة. ويحتاج محليًا `deno` و`python3` ومتصفح Playwright.
- **ما دُمج منذ آخر نشر:** `git fetch origin main release && npm run since-release` يسرد إيداعات `main` التي لم تصل `release` بما يمسه كل منها، والترحيلات الجديدة بوسمها. يراجعه المالك قبل استئناف النشر.
- **لا نشر من وكيل:** `.claude/settings.json` يمنع `supabase functions deploy` و`db push` والدفع إلى `release`. النشر من CI أو بمسار الطوارئ أدناه بيد المالك.

- **ملكية المحتوى (D01):** المستودع أصل المحتوى المُقاس، واللوحة تحرر غير المُقاس وحده (`content-lock.js`). المصالحة وكشف الانحراف: `SUPABASE_ACCESS_TOKEN=... node scripts/content/export-live.mjs [--check]`، والتفصيل في `docs/content/ملكية-المحتوى-ودليل-التحرير-v1.md`.

- **البريد (D15):** كل رسالة من الدوال الأربع تمر بعداد واحد (`leaders.mail_events`، بلا متن ولا رمز). السقف `LEADERS_MAIL_DAILY_CAP` في 24 ساعة، نصفه على الأقل لرموز الدخول والتنبيه، والتذكيرات والملخصات تدخل طابورًا تفرغه المهمة الساعية. لا مرسل احتياطي: رفض Resend للنطاق، وبلوغ 70% من الحصة، يصلان المالك عبر `LEADERS_ALERT_WEBHOOK`. **صباح الورشة:** قبل يوم التدريب يُرفع `LEADERS_MAIL_DAILY_CAP` إلى ضعف الدفعة على الأقل (مئة رمز في ثلاثين دقيقة تحتاج سقفًا لا يقل عن 200)، و`LEADERS_REGISTER_PER_IP_DAY` فوق حجم القاعة، ويُذكَّر المشاركون في الدعوة بالدخول بحساب Google أو بمفتاح المرور.

### مسار الطوارئ (Actions موقوفة)

لا يُسلك إلا بإذن المالك المكتوب الذي يسمي الإيداع وسبب الطوارئ، ويُسجَّل في HANDOFF. من جهاز المالك، وعلى شجرة نظيفة عند الإيداع المأذون:

1. `npm ci && npm run verify`، ولا يُكمل إن فشلت خطوة أو تُخطيت.
2. `SUPABASE_ACCESS_TOKEN=... node scripts/ops/pending-migrations.mjs`. إن ظهر ترحيل حاجب يُطبَّق أولًا: `SUPABASE_ACCESS_TOKEN=... node scripts/db/apply-migration.mjs <الاسم>` بعد نسخة احتياطية ناجحة (§4).
3. `SUPABASE_ACCESS_TOKEN=... node scripts/ops/function-secrets.mjs --require=signin`.
4. نشر الدوال الست بالأوامر نفسها في `ci.yml` (`supabase functions deploy <الدالة> --project-ref eormhcupwgwpllhrfxxg`، ومعها `--no-verify-jwt` لـ `creem-webhook` و`leaders-hooks`).
5. المسبار للدوال الثلاث (§3)، ولا يُكمل إن فشل.
6. `git push --force origin <الإيداع>:refs/heads/release` فتُبنى المنصات منه.
7. صف في HANDOFF: الإيداع، والإذن، والترحيلات المطبقة، ونتيجة المسبار.

## 2. التراجع

| ما تراجع عنه | كيف |
|---|---|
| منصة (واجهة) | Cloudflare ← المشروع ← Deployments ← آخر نشر سليم ← Rollback. أو: `git push --force origin <sha-سليم>:refs/heads/release` فتُبنى المنصات كلها من ذلك الإيداع |
| دالة حافة | Actions ← «Deploy functions (manual)» ← Run workflow ← اختر الإيداع أو الوسم السليم في «Use workflow from». تُنشر الدوال الأربع من ذلك المرجع |
| قاعدة البيانات | لا تراجع آلي. آخر نسخة من R2 (`node scripts/ops/r2.mjs get daily/<الملف> db.dump.gpg`) أو من أدوات سير «Nightly database backup»، ثم على جهاز المالك: `gpg -d db.dump.gpg > db.dump` ثم `pg_restore -d "$SUPABASE_DB_URL" --clean --no-owner db.dump`، بعد تمرين على قاعدة مؤقتة (§4). جداول `backup_*` من الترحيلات تبقى حتى يُسمح بحذفها |

## 3. المراقبة والتنبيه

- **مسبار حقيقي:** `POST https://eormhcupwgwpllhrfxxg.supabase.co/functions/v1/leaders-api` بجسم `{"action":"system.ping"}` ورؤوس `apikey`/`Authorization: Bearer <المفتاح العام>` ← `{"success":true,"db_ms":…}`. يمر بالقاعدة فعلًا.
- **المراقب الخارجي (الأساس):** أضف المسبار أعلاه في UptimeRobot أو Cloudflare Health Checks كل 5 دقائق مع كلمة `"success":true` شرطًا، وصفحات `leaders.sunkvalue.com` و`mi.sunkvalue.com` و`admin.sunkvalue.com` كفحوص 200. (لم يُضبط بعد؛ يحتاج حساب المالك.)
- **شبكة الأمان:** `probe.yml` كل ساعة يفعل الشيء نفسه للدوال الثلاث التي تخدم واجهة (`leaders-api` و`admin-api` و`user-api`)؛ فشله يُرسل بريد GitHub عن فشل سير العمل. جدولة GitHub قد تتأخر ساعات. Cloudflare قد يحجب عناوين مشغّلات GitHub على النطاق بـ403 (حدث في 2026-11-04 لموقع القادة وهو يعمل)؛ المسبار يميّزه (`server: cloudflare`) ويفحص النشر على `pages.dev` بدلًا منه بتحذير. لإلغاء الحجب نهائيًا: Cloudflare ← Security ← WAF ← قاعدة تخطٍّ لوكيل المستخدم `MilestoneImpactProbe/1.0`.
- **تنبيه فوري من الدالة:** أي خطأ داخلي (500) أو تعطل بريد (`mail_failed`، `mail_cap`، `mail_unconfigured`) أو غياب مفتاحَي التحقق البشري (`captcha_unconfigured`: الدخول برمز البريد متوقف) أو تعذّر كتابة السجل (`audit_failed`: العمليات تفشل حتى يعود) أو فشل خطاف Creem أو Cal.com يصل `LEADERS_ALERT_EMAIL` فورًا، مرة كل عشر دقائق لكل نوع، مع رقم مرجع يراه المستخدم في رسالة الخطأ ويظهر في سجل الدالة. السجل: Supabase ← Edge Functions ← leaders-api ← Logs، ابحث بالمرجع.
- **الجدولة الحية بلا SQL:** Actions ← «Apply migrations (production)» ← Run workflow ← `mode = check`. يطبع الامتدادات، ومهام `cron.job` (المتوقع: `leaders-weekly-reminders` و`leaders-expert-offers` نشطتان)، وآخر 10 تشغيلات بحالتها، وأسماء أسرار Vault بلا قيم (المتوقع `leaders_cron_secret`)، وسجل الترحيلات، وأسماء أسرار الدوال (ويحمرّ إن غاب سرّ يحتاجه الدخول بالرمز: الفلفل ومفتاح البريد ومفتاحا Turnstile)؛ ولا يغيّر شيئًا ولا يطبع قيمة. يحمرّ إن غابت مهمة أو سر أو امتداد.
- **التقرير الأسبوعي:** يوم الأحد عبر `cron.reminders` (pg_cron). إن لم يصل أحدًا فالجدولة ميتة: شغّل `check` أعلاه، أو `select * from cron.job_run_details order by start_time desc limit 10;`. التشغيلة نفسها تنظّف ما مضى عليه 90 يومًا: رموز الدخول، الجلسات المنتهية، سجلات التحقق من الشهادات، وعناوين الشبكة في مشاهدات الكتيب (`purge` في `system.ts`).

## 4. النسخ الاحتياطي والاستعادة (D09)

**الهدف المعلن:** RPO أربع وعشرون ساعة (نسخة يومية)، وRTO أربع ساعات (استعادة في مشروع أو قاعدة جديدة من آخر نسخة).

- **ليليًا** (`backup.yml`، 00:30 UTC)، أو بأمر واحد من جهاز المالك أثناء حجب Actions: `scripts/ops/backup.sh`. يفرّغ مخططات `leaders` و`public` و`auth`، ومع `SUPABASE_SERVICE_ROLE_KEY` دلو `leaders-private` بقائمة ملفاته وأحجامها. يشفّر عند المصدر بالمفتاح العام، فلا يحمل المشغّل ما يفك التشفير، ويرفع إلى دلو R2 مع بيان بالبصمات وعدد الصفوف لحظة النسخ، ويبقي نسخة مشفرة في أدوات السير 30 يومًا طبقة ثانية.
- **الدلو:** `daily/` بقفل احتفاظ 30 يومًا، و`monthly/` (أول كل شهر) بقفل 365 يومًا، و`archive/` للتفريغ مرة واحدة (مثل `sspdf` في D13)، و`latest.json` خارج القفل. الرمز مقصور على الدلو بقراءة الكائنات وكتابتها، لأن R2 لا يقدم رمز كتابة فقط، والقفل يمنع الحذف والكتابة فوق النسخ. إعداد لمرة واحدة:

```bash
npx wrangler r2 bucket create mi-backups
npx wrangler r2 bucket lock add mi-backups --name daily-30d --prefix daily/ --retention-days 30
npx wrangler r2 bucket lock add mi-backups --name monthly-365d --prefix monthly/ --retention-days 365
npx wrangler r2 bucket lock add mi-backups --name archive-365d --prefix archive/ --retention-days 365
```

- **المفتاح:** يولّد المالك زوجًا بـ `gpg --quick-gen-key "MI Backups" default default never`، ويضع العام في السر `BACKUP_PUBLIC_KEY` (`gpg --armor --export`)، ويحفظ الخاص (`gpg --armor --export-secret-keys`) في مكانين خارج GitHub وCloudflare. ضياع المفتاح الخاص يعني ضياع كل النسخ.
- **مراقب الحداثة:** `workers/backup-monitor` يقرأ `latest.json` كل ساعة، ويعيد 503 من `/health` إن تجاوز عمر النسخة 26 ساعة، ويرسل بريدًا إن ضُبط. يراقبه مراقب خارجي (§3).
- **الفحص اليومي بلا فك تشفير** (`restore-drill.yml`، وظيفة r2): عمر آخر نسخة دون 36 ساعة، وكل ملف في البيان بحجمه، والتشفير بالمفتاح العام.
- **التمرين الكامل شهريًا** من جهاز المالك: `scripts/ops/restore-drill.sh`. يتحقق من البصمات، ويفك التشفير، ويستعيد في قاعدة مؤقتة، ويفشل عند أي خطأ غير متوقع، أو نسخة أقدم من 36 ساعة، أو عدد صفوف لا يطابق لحظة النسخ (ومنها `auth.users`)، أو ملف من عينة الدلو مفقود أو بحجم آخر. يطبع RPO وزمن الاستعادة، ويُسجَّل الناتج في HANDOFF. **لا تُستقبل بيانات دفعة قبل تمرين ناجح.**
- **ما بقي على الخطة المجانية:** نسخ Supabase اليومية المدفوعة طبقة ثانية بعد الترقية، وقرار PITR بعد الدفعة الأولى.
- **التشفير المتماثل القديم:** ما دام `BACKUP_PUBLIC_KEY` غير مضبوط يعمل السكربت بـ `BACKUP_PASSPHRASE` مع تحذير، ويجري `restore-drill.yml` التمرين الكامل في Actions (وظيفة legacy).

## 5. الأسرار (أين تُضبط)

| السر | أين | لماذا |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | GitHub ← Secrets | نشر الدوال |
| `SUPABASE_DB_URL`، `BACKUP_PUBLIC_KEY` (و`BACKUP_PASSPHRASE` القديم حتى يُضبط المفتاح العام) | GitHub ← Secrets | النسخ الليلي (§4) |
| `R2_ACCOUNT_ID`، `R2_ACCESS_KEY_ID`، `R2_SECRET_ACCESS_KEY`، `R2_BUCKET` | GitHub ← Secrets | دلو النسخ خارج GitHub وفحصه اليومي |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub ← Secrets (اختياري) | نسخ دلو الملفات |
| `LEADERS_TOKEN_PEPPER` (إلزامي)، `RESEND_API_KEY`، `LEADERS_ALERT_EMAIL`، `LEADERS_CRON_SECRET`، `LEADERS_MAIL_DAILY_CAP` | Supabase ← Edge Functions ← Secrets | الرموز، البريد، التنبيه، الجدولة، السقف |
| `LEADERS_TURNSTILE_SECRET`، `LEADERS_TURNSTILE_SITE_KEY` (إلزاميان منذ ل1) | Supabase ← Secrets | التحقق البشري (التطبيق والموقع)؛ بلاهما يتوقف الدخول برمز البريد ونموذج التواصل وترفض بوابة النشر النشر |
| `LEADERS_REGISTER_PER_IP_DAY` (اختياري، 60) | Supabase ← Secrets | التسجيلات الجديدة من شبكة واحدة يوميًا؛ يُرفع قبل ورشتين على شبكة واحدة |
| `CREEM_API_KEY`، `CREEM_WEBHOOK_SECRET` | Supabase ← Secrets | الدفع والإشعار |
| `LEADERS_CALCOM_SECRET`، `LEADERS_CALENDLY_KEY` | Supabase ← Secrets | خطاف الحجز |

«الأسرار الناقصة» تظهر في لوحة الإدارة ← النظرة العامة.

## 6. صباح الورشة: ما يُفحص في خمس دقائق

1. المسبار يرد `success:true` (أو آخر تشغيل أخضر لـ`probe.yml`).
2. لوحة الإدارة ← النظرة العامة: لا ترحيلات ناقصة، لا أسرار ناقصة، استهلاك البريد اليوم دون السقف (التسجيلات الجديدة تقف عند 70% منه؛ وجّه المتأخرين إلى الدخول بحساب Google).
3. الجهة لها دفعة جارية بمستشار، ونشاط الحضور له موعد اليوم.
4. إن وصل تنبيه `mail_cap` أو `mail_failed`: ارفع `LEADERS_MAIL_DAILY_CAP` بعد التأكد من خطة Resend، أو اطلب الدخول بـGoogle أو مفتاح المرور.
5. ورشتان أو أكثر على شبكة واحدة في اليوم نفسه (أكثر من 60 تسجيلًا جديدًا): ارفع `LEADERS_REGISTER_PER_IP_DAY` قبلها وأعده بعدها. وإن وصل تنبيه `captcha_unconfigured` فمفتاحا Turnstile غابا: أعد ضبطهما فورًا، والدخول بـGoogle ومفتاح المرور يعمل في الأثناء.
6. خطأ داخلي عند مشارك: اطلب رقم المرجع وابحث به في سجل الدالة.
