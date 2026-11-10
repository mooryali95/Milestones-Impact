-- ════════════════════════════════════════════════════════════════
-- تأكيد الاسم قبل الشهادة: «هكذا يظهر اسمك» (تدقيق الإنتاج 2026-11-10، البند 7.3)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تتحمل غياب العمود (certificates.ts: onFinalApproved، وparticipant.ts: confirmName وprofileSave)، فقبله تصدر الشهادة كما كانت
-- لم يُطبَّق على الإنتاج بعد: يُطبَّق بسير migrate.yml باسمه (20261110210000_leaders_name_confirmation).
-- لماذا: الشهادة تحمل رقم تحقق عامًا، وكانت تصدر بالاسم كما كُتب أول مرة («OmarManzoma» مثلًا) بلا عرضه على صاحبه.
-- بعده: الشهادة لا تصدر حتى يؤكد المشارك اسمه كما سيُطبع، وتأكيده يصدرها إن كان تقييمه الختامي معتمدًا.
-- تغيير الاسم يلغي التأكيد (profile.save). من صدرت شهادته من قبل يُعد مؤكِّدًا: اسمه مقفل ومطبوع.
-- آمن لإعادة التشغيل.
alter table leaders.participants add column if not exists name_confirmed_at timestamptz;
update leaders.participants set name_confirmed_at = name_locked_at
 where name_confirmed_at is null and name_locked_at is not null;

insert into leaders.schema_migrations (name) values ('20261110210000_leaders_name_confirmation') on conflict do nothing;
