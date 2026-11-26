-- deploy-gate: tolerant قبله تُرد التزامات المشارك فارغة والكتابة «غير متاح الآن» (missingTable في commitments.ts)، ويتجاوز التذكير
-- ════════════════════════════════════════════════════════════════
-- تصور المرحلة 3، المرحلة 3.2: حلقة الالتزام بعد الورشة
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-26-تصور-المرحلة-3-رفع-الفائدة-الحقيقية-v1.md §5.2 (اعتمده المالك 2026-11-26).
-- 1) workshop_commitments: التزام واحد لكل مشارك وجلسة حضرها: الفعل والموعد، ووقت التذكير الواحد بعد 14 يومًا،
--    ونتيجة «طبقته؟» (yes وpartial وno) وسطر «ماذا تعلمت»، ووقت إضافته خطوةً في وثيقة المبادرة.
--    ليس بند رحلة: لا يحبس مرحلة ولا يدخل التقدم. يُحذف مع الحساب، ويُصدَّر في نسخة بياناته (privacy.js).
-- 2) مصدرا نقاط جديدان: commitment عند الكتابة وcommitment_review عند المراجعة (الأوزان في logic.js POINTS).
-- جدول جديد وقيد موسَّع: لا بيانات تتغير فلا نسخة احتياطية. الدوال وحدها تقرأ وتكتب (service_role). آمن لإعادة التشغيل.

create table if not exists leaders.workshop_commitments (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  session_id uuid not null references leaders.workshop_sessions(id) on delete cascade,
  action text not null check (char_length(action) between 1 and 500),
  due_on date not null,
  created_at timestamptz not null default now(),
  reminded_at timestamptz,
  outcome text check (outcome is null or outcome in ('yes', 'partial', 'no')),
  learned text check (learned is null or char_length(learned) <= 1000),
  reviewed_at timestamptz,
  added_at timestamptz,
  unique (participant_id, session_id)
);
create index if not exists workshop_commitments_due on leaders.workshop_commitments (created_at) where reviewed_at is null and reminded_at is null;
alter table leaders.workshop_commitments enable row level security;
revoke all on leaders.workshop_commitments from anon, authenticated;

alter table leaders.points_ledger drop constraint if exists points_ledger_source_check;
alter table leaders.points_ledger add constraint points_ledger_source_check
  check (source = any (array['chapter', 'model', 'review', 'bonus', 'lab', 'lab_bonus', 'capstone', 'tracking', 'commitment', 'commitment_review']));

insert into leaders.schema_migrations (name) values ('20261129200000_leaders_workshop_commitments') on conflict do nothing;
