-- deploy-gate: tolerant قبله تقرأ الدوال doc_options فارغًا فيُطبع الرمز كما كان (effectiveQr الافتراضي مفعّل)، والكتابة ترد «غير متاح الآن» (missingColumn في capstone.ts)
-- ════════════════════════════════════════════════════════════════
-- تصور تحميل الأدمن ورمز التحقق، المرحلة 33: قرار رمز التحقق (القائد والأدمن)
-- ════════════════════════════════════════════════════════════════
-- التصور: القسم ب والقسم ز (اعتمده المالك). capstones.doc_options بنيته
-- { owner: { qr }, admin: { qr, by, at, reason } }، والقيمة الفعلية تحسبها effectiveQr (src/lib/brand/doc-options.js).
-- يُقرأ حيًا ولا يُجمَّد في snapshot.issued، فالبصمة وحدها هي المجمدة. عمود جديد بافتراض {} فلا يتغير صف قائم
-- بتحديث ولا نسخة احتياطية تلزم. آمن لإعادة التشغيل.

alter table leaders.capstones add column if not exists doc_options jsonb not null default '{}'::jsonb;
do $$ begin
  alter table leaders.capstones add constraint capstones_doc_options_check check (jsonb_typeof(doc_options) = 'object') not valid;
exception when duplicate_object then null; end $$;

insert into leaders.schema_migrations (name) values ('20261130030000_leaders_capstone_doc_options') on conflict do nothing;
