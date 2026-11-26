-- deploy-gate: tolerant قبله يرد «لا يوجد مدير متاح» بـ503 «غير متاح الآن» (missingColumn في impact.ts)، وتقييم المدير يعمل بخانته كما هو
-- ════════════════════════════════════════════════════════════════
-- تصور المرحلة 3، المرحلة 3.3: تقييم المدير ومسار «لا مدير»
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-26-تصور-المرحلة-3-رفع-الفائدة-الحقيقية-v1.md §5.1 (اعتمده المالك 2026-11-26، القرار 3).
-- participants.no_manager: اختيار المشارك حين لا مدير متاحًا له: senior (زميل أعلى يختاره في خانة المدير) أو self («ذاتي فقط»:
-- يكمل بندي المدير بلا حبس ويوسم به تقريره). فارغ = خانة المدير كما هي. no_manager_at وقت الاختيار.
-- عمودان جديدان فارغان: لا بيانات تتغير فلا نسخة احتياطية. آمن لإعادة التشغيل.

alter table leaders.participants add column if not exists no_manager text;
alter table leaders.participants add column if not exists no_manager_at timestamptz;
do $$ begin
  alter table leaders.participants add constraint participants_no_manager_check check (no_manager is null or no_manager in ('senior', 'self'));
exception when duplicate_object then null; end $$;

insert into leaders.schema_migrations (name) values ('20261129210000_leaders_no_manager') on conflict do nothing;
