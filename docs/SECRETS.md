# الأسرار ومتغيرات البيئة (المصدر الواحد)

لا قيمة سرية في هذا الملف ولا في المستودع. الجدول يسمّي كل متغير، ومن يقرؤه، وأين يُضبط، وهل هو إلزامي، ومن يدوّره. حارس آلي (`leaders-app/src/engineering.test.js`) يفشل إن ظهر في الدوال متغير غير مذكور هنا.

## دوال Supabase (Edge Functions ← Secrets)

| المتغير | إلزامي | من يقرؤه | الغرض | التدوير |
|---|---|---|---|---|
| `SUPABASE_URL` | تحقنه Supabase | كل الدوال | عنوان المشروع | لا يُدوَّر |
| `SUPABASE_SERVICE_ROLE_KEY` | تحقنه Supabase | كل الدوال (`core.ts`، `admin-api`، `user-api`، `send-otp`) | عميل الخدمة الذي يتجاوز RLS؛ لا يغادر الخادم | من لوحة Supabase عند أي اشتباه؛ تُعاد قراءته تلقائيًا |
| `LEADERS_TOKEN_PEPPER` | **نعم** (الدالة ترفض الإقلاع بدونه) | `leaders-api/core.ts` | ملح هاش رموز الدخول والجلسات، فلا يكفي تسريب القاعدة وحده | تدويره يُبطل كل الجلسات والرموز الجارية؛ يُفعل خارج ساعات الورش |
| `LEADERS_CERT_SIGNING_KEY` | نعم قبل أول شهادة | `certificates.ts` | مفتاح توقيع الشهادات، مستقل عن الفلفل (D05)، 32 حرفًا على الأقل. بلاه لا تصدر شهادة، وتظهر في فحص الصحة | `openssl rand -hex 32`، ولا يُدوَّر إلا بإبقاء السابق في `LEADERS_CERT_PREVIOUS_KEYS` |
| `LEADERS_CERT_KEY_ID` | لا (k1) | `certificates.ts` | معرّف المفتاح الحالي، يُكتب أمام كل توقيع (`k1:...`) | يُغيَّر مع كل تدوير (k2 ثم k3) |
| `LEADERS_CERT_PREVIOUS_KEYS` | لا | `certificates.ts` | المفاتيح السابقة للتحقق وحده، بصيغة `{"k1":"..."}`، فيبقى ما صدر صحيحًا بعد التدوير | يُضاف إليه المفتاح الخارج عند كل تدوير |
| `RESEND_API_KEY` | نعم للبريد | `core.ts`، `_shared/mail.ts`، `admin-api`، `user-api`، `send-otp` | إرسال رموز الدخول والإشعارات؛ غيابه = `mail_unconfigured` وتنبيه فوري | من لوحة Resend |
| `LEADERS_MAIL_FROM` | لا (افتراضي في `_shared/mail.ts`) | `core.ts` | عنوان المرسل | مع النطاق الموثّق في Resend |
| `LEADERS_MAIL_DAILY_CAP` | لا (80) | `core.ts`، و`user-api` و`admin-api` و`send-otp` | السقف الموحد لكل بريد في يوم المزوّد من 03:00 بتوقيت الرياض (D15، `leaders.mail_events`): نصفه على الأقل لرموز الدخول، والتسجيلات تقف عند 70% منه، ومصفوفة التأثير لا تتجاوز خُمسه | ضعف الدفعة على الأقل دون تجاوز خطة Resend المدفوعة |
| `LEADERS_ALERT_WEBHOOK` | لا، إلا إن لم يُضبط سلاك: قناة تنبيه واحدة مشترطة (سلاك بسرّيه أو هذا الرابط، أيهما يكفي) | `_shared/mail.ts` | تنبيه المالك عبر قناة غير البريد (Slack أو Teams أو Telegram): رفض النطاق، وبلوغ 70% من الحصة، وامتلاء السقف، وكل تنبيه من alertOps. يُجرَّب بـ `admin.alert-test` | رابط الويب الذي تعطيه القناة |
| `LEADERS_SLACK_BOT_TOKEN` | لا | `_shared/slack.ts` (من leaders-api وadmin-api وuser-api وsend-otp وleaders-hooks وcreem-webhook وagent-chat) | بوت سلاك (`xoxb-`) بصلاحية `chat:write` وحدها، ينشر في قناة التشغيل الخاصة #mi-ops: التنبيهات، وحالة رموز الدخول (أُرسل أو حُجب أو تعذّر، بلا الرمز)، والبريد الذي لم يصل، ببريد مقنّع. احتياط لا يؤخر طلبًا ولا يمس حصة البريد. بلاه (أو بلا القناة) لا ينشر شيئًا | من إعدادات تطبيق سلاك (OAuth & Permissions)، ثم يُضبط هنا |
| `LEADERS_SLACK_CHANNEL` | لا (مع البوت) | `_shared/slack.ts` (من leaders-api وadmin-api وuser-api وsend-otp وleaders-hooks وcreem-webhook وagent-chat) | معرّف القناة (`C...`) لا اسمها، والبوت مدعو إليها | عند تغيير القناة |
| `USER_OTP_PER_IP_DAY` | لا (60) | `user-api` | رموز مصفوفة التأثير من شبكة واحدة في اليوم | يُرفع قبل ورشة كبيرة على شبكة واحدة |
| `CONTACT_NOTIFY_EMAIL` | لا (`LEADERS_ALERT_EMAIL`) | `send-otp`، `agent-chat` (تحويلات المساعد) | من يُخطَر بطلب تواصل جديد من الموقع. كان بريدًا مكتوبًا في الكود حتى 2026-11-13 | بريد من يتابع الطلبات |
| `MATRIX_NOTIFY_EMAIL` | لا (`LEADERS_ALERT_EMAIL`) | `user-api` | من يُخطَر بخطة مقدَّمة في المصفوفة (D14، بدل Lambda) | بريد المستشار |
| `MILESTONE_R0_CUTOFF` | لا (`R0_DATED_SINCE` في `milestones.js`، 2026-11-17) | `admin.ts` ← `lateMilestoneNotices` | حارس بريد «معلم متأخر» (القرار 19 في تصور محرر رحلة الدفعة): المعلم المؤرخ بنافذة مرحلته لا يُرسل عنه إن كان موعده قبل هذا اليوم. يُقبل يوم أحدث من الثابت فقط (`cutoffFrom`)، فلو نُشر R0 بعد يوم البناء يُضبط بيوم النشر بلا إعادة بناء | يُضبط مرة يوم نشر R0 إن تأخر عن 2026-11-17، ولا يُغيَّر بعدها |
| `LEADERS_REGISTER_PER_IP_DAY` | لا (60) | `core.ts` | التسجيلات الجديدة من شبكة واحدة في اليوم؛ يتسع لقاعة ورشة | يُرفع قبل ورشتين أو أكثر على شبكة واحدة في اليوم نفسه، ثم يُعاد |
| `LEADERS_APP_URL` | لا (`SITES.leaders`) | `core.ts` | روابط البريد والتحقق | عند تغيير النطاق |
| `LEADERS_RP_ID` | لا (`leaders.sunkvalue.com`) | `core.ts` ← `passkeys.ts` | نطاق مفاتيح المرور للمشاركين | تغييره يُبطل مفاتيح المرور المسجلة |
| `LEADERS_ORIGINS` | لا (`SITES.leaders`) | `core.ts` | أصول CORS ومفاتيح المرور (قائمة بفواصل) | عند إضافة نطاق |
| `LEADERS_ADMIN_ORIGINS` | لا (`SITES.admin`) | `core.ts` | لوحة الإدارة في CORS فقط | عند إضافة نطاق |
| `LEADERS_CRON_SECRET` | نعم للجدولة | `core.ts` ← `cron.reminders` | يرسله pg_cron (من Vault) لتشغيل التذكيرات والتقرير والتنظيف | يُدوَّر في Vault والدالة معًا |
| `LEADERS_ALERT_EMAIL` | موصى به | `core.ts` ← `alertOps`، التقرير الأسبوعي | بريد المالك للتنبيه الفوري والتقرير | عند تغيير المسؤول |
| `LEADERS_TURNSTILE_SECRET` | **نعم** منذ المرحلة ل1 (بدونه يتوقف الدخول برمز البريد ونموذج التواصل: `captcha_unconfigured` وتنبيه فوري، وبوابة النشر ترفض النشر) | `core.ts`، `send-otp` | التحقق من رمز Cloudflare Turnstile قبل إرسال أي رمز وقبل أي رد يفرّق بين بريد مسجل وجديد | من لوحة Cloudflare مع `SITE_KEY`؛ ضبط الجديد قبل حذف القديم |
| `LEADERS_TURNSTILE_SITE_KEY` | **نعم** مع السر | `core.ts`، `send-otp`، `agent-chat` | المفتاح العام للأداة في الواجهة (يُرسل للمتصفح) | مع السر |
| `ANTHROPIC_API_KEY` | احتياط حين لا مفتاح في اللوحة (المفتاح الأساسي يُضبط من «المساعد الآلي ← المفتاح» ويُحفظ في Vault؛ بلا أحدهما لا يُستدعى النموذج وتعرض النافذة «اترك رسالتك») | `agent-chat` (`model.ts`) | مفتاح Claude API لمساعد الموقع العام. الطلب إلى `api.anthropic.com` بـ`inference_geo: "us"` كما تقول سياسة الخصوصية، ولا يغادر الخادم | من Claude Console (Settings ← API keys)، ويُدوَّر عند أي اشتباه؛ يُنصح بمساحة عمل خاصة به وحد إنفاق شهري في Console احتياطًا فوق السقف اليومي |
| `LEADERS_AGENT_MODEL` | لا (`claude-haiku-5-5`) | `agent-chat` | النموذج. الافتراضي الأقل تكلفة بقرار المالك؛ والترقية الموثقة `claude-sonnet-5-5` إن لم ينجح التقييم (`agent-chat/evals/run.ts`). أي اسم غير موجود في جدول `pricing.ts` لا يُستدعى أصلًا: يعرض المساعد «اترك رسالتك» ويصل تنبيه `agent_model_unknown` مرة في اليوم، فلا يتجاوز السقف بخطأ في الاسم. أضف سعر النموذج الجديد إلى الجدول قبل ضبطه | عند تغيير النموذج، بعد تشغيل التقييم عليه |
| `LEADERS_AGENT_DAILY_CAP_CENTS` | لا (200، أي دولاران في يوم الرياض) | `agent-chat` | سقف تكلفة النموذج اليومي بالسنت، في `leaders.agent_spend_daily`: حجز ذري لأسوأ تكلفة قبل كل استدعاء ثم تسوية من `usage`. إن رُفض الحجز لا يُستدعى النموذج بقية اليوم وتعرض النافذة «اترك رسالتك». تنبيه واحد عند 80% وآخر عند 100% (قناة التنبيهات وسلاك) | بقرار المالك |
| `LEADERS_AGENT_ENABLED` | اختياري | `agent-chat`، `leaders-api` | مفتاح طوارئ فقط: `off` يطفئ المساعد أيًا كان ما في اللوحة. غيره لا يشغّل شيئًا: التفعيل من الشاشة بعد تقييم ناجح للإعداد المنشور (RUNBOOK §7) | يُضبط `off` فورًا عند أي خلل (لا نشر) |
| `LEADERS_CALCOM_SECRET` | لا | `core.ts` ← `leaders-hooks` | توقيع خطاف Cal.com | من لوحة Cal.com |
| `LEADERS_CALENDLY_KEY` | لا | `core.ts` ← `leaders-hooks` | مفتاح توقيع Calendly | من لوحة Calendly |
| `GITHUB_RELEASE_TOKEN` | لا (بلاه يعمل الكتاب، وتعرض لوحة «إصدار الكتاب» طريقة الإعداد) | `leaders-api/book-release.ts` | زر «أصدر الكتاب» للمدير العام: يشغّل سير Handbook release، ويفتح طلب الإصدار، ويدمجه بعد خضرة فحوصه، ويشغّل migrate. مفتاح GitHub دقيق (fine-grained) على هذا المستودع وحده بصلاحيات Actions وContents وPull requests (قراءة وكتابة) | من GitHub ← Developer settings ← Fine-grained tokens، بمدة صلاحية، ويُستبدل قبل انتهائها |
| `GITHUB_RELEASE_REPO` | لا (الافتراضي `mooryali95/Milestones-Impact`) | `leaders-api/book-release.ts` | المستودع الذي يُصدر منه الكتاب | لا يُدوَّر |
| `CREEM_API_KEY` (أو `CAREEM_SECRET_KEY`) | نعم للدفع | `payments.ts` | إنشاء صفحات الدفع؛ البادئة `creem_test_` = وضع الاختبار | من لوحة Creem؛ الاسم البديل يبقى مقبولًا حتى تُوحَّد الأسماء في اللوحة |
| `CREEM_WEBHOOK_SECRET` (أو `CAREEM_WEBHOOK_SECRET`) | نعم للدفع | `payments.ts` ← `creem-webhook` | توقيع HMAC لإشعارات الدفع؛ بدونه يُرفض كل إشعار (503 config) | من لوحة Creem |
| `ADMIN_RP_ID`، `ADMIN_ORIGINS` | لا (`sunkvalue.com`، `SITES`) | `admin-api` | مفاتيح مرور الإدارة وأصولها | عند تغيير النطاق |
| `USER_RP_ID`، `USER_ORIGINS` | لا (`sunkvalue.com`، `SITES`) | `user-api` | مفاتيح مرور مشاركي المصفوفة | عند تغيير النطاق |

## GitHub (Settings ← Secrets and variables ← Actions)

| السر | من يقرؤه | الغرض |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `ci.yml` (deploy)، `deploy-leaders-api.yml`، `migrate.yml`، `schema-check.yml`، `scripts/db/snapshot.mjs` | نشر الدوال الست، وتطبيق الترحيلات بقرار المالك وقراءة الجدولة (`check`)، وقراءة بنية القاعدة الحية |
| `SUPABASE_DB_URL` | `backup.yml`، `restore-drill.yml` | النسخ الليلي وتمرين الاستعادة |
| `BACKUP_PASSPHRASE` | `backup.yml`، `restore-drill.yml` | التشفير المتماثل القديم (gpg). لا تُشفَّر به نسخة جديدة ما دام `BACKUP_PUBLIC_KEY` مضبوطًا، **ويبقى ولا يُحذف**: النسخ المتماثلة السابقة للانتقال باقية في `monthly/` (قفل 365 يومًا) و`archive/` ولا تُفك إلا به. قيمته في GitHub وفي مدير كلمات المرور (`RUNBOOK.md` §4) |
| `BACKUP_PUBLIC_KEY` | `backup.yml` (و`scripts/ops/backup.sh`)، `restore-drill.yml` | سطر مفتاح age عام لكل مستلم (المعتمد)، أو كتلة GnuPG لكل مفتاح مصدّرة ببصمته (المالك، ومستلم ثانٍ اختياري)، للتشفير عند المصدر، ومفاتيحها في بيان كل نسخة. المفتاح الخاص عند المالك في مكانين خارج GitHub وCloudflare، ولا يُضبط سرًّا في أي مكان |
| `R2_ACCOUNT_ID`، `R2_ACCESS_KEY_ID`، `R2_SECRET_ACCESS_KEY`، `R2_BUCKET` | `backup.yml`، `restore-drill.yml`، `scripts/ops/r2.mjs` | دلو النسخ خارج GitHub. الرمز مقصور على الدلو بقراءة الكائنات وكتابتها، والحذف ممنوع بقفل الاحتفاظ |
| `RESEND_API_KEY`، `ALERT_TO` (اختياريان) | Worker `mi-backup-monitor` (Cloudflare ← Settings ← Variables and Secrets) | بريد تنبيه تأخر النسخ؛ بدونهما يبقى `/health` للمراقب الخارجي |
| `SLACK_BOT_TOKEN`، `SLACK_CHANNEL` (اختياريان، موصى بهما) | Worker `mi-backup-monitor` (Cloudflare ← Settings ← Variables and Secrets) | تنبيه تأخر النسخ في `#mi-ops` فيصل الهاتف بإشعار سلاك. القيمتان هما `LEADERS_SLACK_BOT_TOKEN` و`LEADERS_SLACK_CHANNEL` نفسيهما |
| `CLOUDFLARE_API_TOKEN` | GitHub ← Secrets، `deploy-backup-monitor.yml` | نشر `mi-backup-monitor` بـ wrangler (قالب «Edit Cloudflare Workers» مقصور على حساب المنصة). بلاه يتخطى السير بتحذير. `CLOUDFLARE_ACCOUNT_ID` اختياري، والبديل `R2_ACCOUNT_ID` |
| `SUPABASE_SERVICE_ROLE_KEY` (في بيئة `backup`، إلزامي منذ #323) | `backup.yml` | نسخ دلو الملفات `leaders-private`: مفتاح سري باسم مستقل (`sb_secret_`) يُرسل في `apikey` وحده، أو service_role القديم حتى تقاعده أوائل 2027 |

## ليست أسرارًا (في المستودع عمدًا)

- المفتاح العام `anon` في الواجهات وسير النشر والمسبار: عام بطبيعته، الحماية بـRLS والدوال.
- `GOOGLE_CLIENT_ID` في `_shared/sites.js`: معرّف عميل، والنطاقات المسموحة في Google Cloud Console.
- `supabase/functions/ci.env`: قيم وهمية لسير التكامل المحلي، لا تصلح لأي بيئة حية. ومنها مفتاحا Turnstile للاختبار من Cloudflare (`1x0000000000000000000000000000000AA` و`1x00000000000000000000AA`)، يقبلان الرمز الوهمي `XXXX.DUMMY.TOKEN.XXXX` وحده؛ وهما ما يُضبط في أي تشغيل محلي للدوال، لأن الدخول برمز البريد لا يعمل بلا مفتاحين.

## القواعد

1. السر يُضبط في موضعه (Supabase أو GitHub) ولا يُكتب في ملف ولا في رسالة ولا في طلب دمج.
2. `leaders-api` يرفض الإقلاع بلا `SUPABASE_SERVICE_ROLE_KEY` و`LEADERS_TOKEN_PEPPER` (`core.ts`)، فالنشر الناقص يُكتشف فورًا من مسبار `system.ping` في سير النشر.
3. الأسرار الناقصة الأخرى تظهر في لوحة الإدارة ← النظرة العامة (`system.ts`).
4. عند إضافة متغير جديد: اقرأه في `core.ts` (للقادة) وأضفه هنا، وإلا فشل الحارس.
